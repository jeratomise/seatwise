import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { eq, and } from 'drizzle-orm';
import {
  events, attendees, tables, seatAssignments,
  type Event, type InsertEvent,
  type Attendee, type InsertAttendee,
  type Table, type InsertTable,
  type SeatAssignment, type InsertSeatAssignment,
} from '@shared/schema';

// On Render, use the mounted persistent disk at /data. Locally use the project root.
import fs from 'fs';
const DB_PATH = process.env.NODE_ENV === 'production' ? '/data/seating.db' : 'seating.db';
// Ensure the directory exists before opening the database
const DB_DIR = require('path').dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite);

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    table_type TEXT NOT NULL DEFAULT 'circular',
    seats_per_table INTEGER NOT NULL DEFAULT 10,
    meal_function_count INTEGER NOT NULL DEFAULT 1,
    meal_function_names TEXT NOT NULL DEFAULT '["Lunch"]',
    floor_plan_image TEXT,
    stage_position TEXT NOT NULL DEFAULT '{"x":300,"y":50,"w":200,"h":80}'
  );

  CREATE TABLE IF NOT EXISTS attendees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'invitee',
    company TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    table_number INTEGER NOT NULL,
    x REAL NOT NULL DEFAULT 100,
    y REAL NOT NULL DEFAULT 100,
    shape TEXT NOT NULL DEFAULT 'full'
  );

  CREATE TABLE IF NOT EXISTS seat_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    meal_function_index INTEGER NOT NULL DEFAULT 0,
    table_id INTEGER NOT NULL,
    attendee_id INTEGER NOT NULL,
    seat_position INTEGER NOT NULL DEFAULT 0
  );
`);

export interface IStorage {
  // Events
  getEvents(): Event[];
  getEvent(id: number): Event | undefined;
  createEvent(data: InsertEvent): Event;
  updateEvent(id: number, data: Partial<InsertEvent>): Event | undefined;
  deleteEvent(id: number): void;

  // Attendees
  getAttendees(eventId: number): Attendee[];
  createAttendee(data: InsertAttendee): Attendee;
  updateAttendee(id: number, data: Partial<InsertAttendee>): Attendee | undefined;
  deleteAttendee(id: number): void;
  bulkCreateAttendees(data: InsertAttendee[]): Attendee[];
  deleteAllAttendees(eventId: number): void;

  // Tables
  getTables(eventId: number): Table[];
  createTable(data: InsertTable): Table;
  updateTable(id: number, data: Partial<InsertTable>): Table | undefined;
  deleteTable(id: number): void;
  deleteAllTables(eventId: number): void;

  // Seat Assignments
  getSeatAssignments(eventId: number, mealFunctionIndex: number): SeatAssignment[];
  getAllSeatAssignments(eventId: number): SeatAssignment[];
  createSeatAssignment(data: InsertSeatAssignment): SeatAssignment;
  updateSeatAssignment(id: number, data: Partial<InsertSeatAssignment>): SeatAssignment | undefined;
  deleteSeatAssignment(id: number): void;
  deleteSeatAssignmentsForMeal(eventId: number, mealFunctionIndex: number): void;
  bulkSetSeatAssignments(eventId: number, mealFunctionIndex: number, assignments: InsertSeatAssignment[]): SeatAssignment[];
}

export const storage: IStorage = {
  // Events
  getEvents() {
    return db.select().from(events).all();
  },
  getEvent(id) {
    return db.select().from(events).where(eq(events.id, id)).get();
  },
  createEvent(data) {
    return db.insert(events).values(data).returning().get();
  },
  updateEvent(id, data) {
    return db.update(events).set(data).where(eq(events.id, id)).returning().get();
  },
  deleteEvent(id) {
    db.delete(events).where(eq(events.id, id)).run();
  },

  // Attendees
  getAttendees(eventId) {
    return db.select().from(attendees).where(eq(attendees.eventId, eventId)).all();
  },
  createAttendee(data) {
    return db.insert(attendees).values(data).returning().get();
  },
  updateAttendee(id, data) {
    return db.update(attendees).set(data).where(eq(attendees.id, id)).returning().get();
  },
  deleteAttendee(id) {
    db.delete(attendees).where(eq(attendees.id, id)).run();
  },
  bulkCreateAttendees(data) {
    if (data.length === 0) return [];
    // Wrap in a transaction so all inserts happen atomically and fast
    const insertMany = sqlite.transaction((rows: typeof data) => {
      return rows.map(a => db.insert(attendees).values(a).returning().get());
    });
    return insertMany(data);
  },
  deleteAllAttendees(eventId) {
    db.delete(attendees).where(eq(attendees.eventId, eventId)).run();
  },

  // Tables
  getTables(eventId) {
    return db.select().from(tables).where(eq(tables.eventId, eventId)).all();
  },
  createTable(data) {
    return db.insert(tables).values(data).returning().get();
  },
  updateTable(id, data) {
    return db.update(tables).set(data).where(eq(tables.id, id)).returning().get();
  },
  deleteTable(id) {
    db.delete(tables).where(eq(tables.id, id)).run();
  },
  deleteAllTables(eventId) {
    db.delete(tables).where(eq(tables.eventId, eventId)).run();
  },

  // Seat Assignments
  getSeatAssignments(eventId, mealFunctionIndex) {
    return db.select().from(seatAssignments)
      .where(and(eq(seatAssignments.eventId, eventId), eq(seatAssignments.mealFunctionIndex, mealFunctionIndex)))
      .all();
  },
  getAllSeatAssignments(eventId) {
    return db.select().from(seatAssignments).where(eq(seatAssignments.eventId, eventId)).all();
  },
  createSeatAssignment(data) {
    return db.insert(seatAssignments).values(data).returning().get();
  },
  updateSeatAssignment(id, data) {
    return db.update(seatAssignments).set(data).where(eq(seatAssignments.id, id)).returning().get();
  },
  deleteSeatAssignment(id) {
    db.delete(seatAssignments).where(eq(seatAssignments.id, id)).run();
  },
  deleteSeatAssignmentsForMeal(eventId, mealFunctionIndex) {
    db.delete(seatAssignments)
      .where(and(eq(seatAssignments.eventId, eventId), eq(seatAssignments.mealFunctionIndex, mealFunctionIndex)))
      .run();
  },
  bulkSetSeatAssignments(eventId, mealFunctionIndex, assignments) {
    db.delete(seatAssignments)
      .where(and(eq(seatAssignments.eventId, eventId), eq(seatAssignments.mealFunctionIndex, mealFunctionIndex)))
      .run();
    if (assignments.length === 0) return [];
    return assignments.map(a => db.insert(seatAssignments).values(a).returning().get());
  },
};

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import {
  events, mealConfigs, attendees, tables, seatAssignments,
  type Event, type InsertEvent,
  type MealConfig, type InsertMealConfig,
  type Attendee, type InsertAttendee,
  type Table, type InsertTable,
  type SeatAssignment, type InsertSeatAssignment,
} from '@shared/schema';

const DB_PATH = process.env.NODE_ENV === 'production' ? '/data/seating.db' : 'seating.db';
const DB_DIR = require('path').dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    meal_function_count INTEGER NOT NULL DEFAULT 1,
    meal_function_names TEXT NOT NULL DEFAULT '["Meal Function 1"]'
  );

  CREATE TABLE IF NOT EXISTS meal_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    meal_function_index INTEGER NOT NULL DEFAULT 0,
    table_type TEXT NOT NULL DEFAULT 'circular',
    seats_per_table INTEGER NOT NULL DEFAULT 10,
    floor_plan_image TEXT,
    stage_position TEXT NOT NULL DEFAULT '{"x":300,"y":40,"w":200,"h":65}'
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
    meal_function_index INTEGER NOT NULL DEFAULT 0,
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

// Migrate old events table if it has old columns
try {
  sqlite.exec(`ALTER TABLE events ADD COLUMN meal_function_count INTEGER NOT NULL DEFAULT 1`);
} catch {}
try {
  sqlite.exec(`ALTER TABLE events ADD COLUMN meal_function_names TEXT NOT NULL DEFAULT '["Meal Function 1"]'`);
} catch {}
// Drop old event columns gracefully (SQLite can't drop columns, so we just ignore them)

// Migrate old tables: add meal_function_index if missing
try {
  sqlite.exec(`ALTER TABLE tables ADD COLUMN meal_function_index INTEGER NOT NULL DEFAULT 0`);
} catch {}

export interface IStorage {
  // Events
  getEvents(): Event[];
  getEvent(id: number): Event | undefined;
  createEvent(data: InsertEvent): Event;
  updateEvent(id: number, data: Partial<InsertEvent>): Event | undefined;
  deleteEvent(id: number): void;

  // Meal configs
  getMealConfig(eventId: number, mealIndex: number): MealConfig | undefined;
  upsertMealConfig(eventId: number, mealIndex: number, data: Partial<InsertMealConfig>): MealConfig;

  // Attendees
  getAttendees(eventId: number): Attendee[];
  createAttendee(data: InsertAttendee): Attendee;
  updateAttendee(id: number, data: Partial<InsertAttendee>): Attendee | undefined;
  deleteAttendee(id: number): void;
  bulkCreateAttendees(data: InsertAttendee[]): Attendee[];
  deleteAllAttendees(eventId: number): void;

  // Tables (scoped to meal function)
  getTables(eventId: number, mealFunctionIndex: number): Table[];
  createTable(data: InsertTable): Table;
  updateTable(id: number, data: Partial<InsertTable>): Table | undefined;
  deleteTable(id: number): void;
  deleteAllTables(eventId: number, mealFunctionIndex: number): void;

  // Seat Assignments
  getSeatAssignments(eventId: number, mealFunctionIndex: number): SeatAssignment[];
  getAllSeatAssignments(eventId: number): SeatAssignment[];
  deleteSeatAssignment(id: number): void;
  deleteSeatAssignmentsForMeal(eventId: number, mealFunctionIndex: number): void;
  bulkSetSeatAssignments(eventId: number, mealFunctionIndex: number, assignments: InsertSeatAssignment[]): SeatAssignment[];
}

export const storage: IStorage = {
  // ── Events ────────────────────────────────────────────────────────────────
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

  // ── Meal configs ──────────────────────────────────────────────────────────
  getMealConfig(eventId, mealIndex) {
    return db.select().from(mealConfigs)
      .where(and(eq(mealConfigs.eventId, eventId), eq(mealConfigs.mealFunctionIndex, mealIndex)))
      .get();
  },
  upsertMealConfig(eventId, mealIndex, data) {
    const existing = db.select().from(mealConfigs)
      .where(and(eq(mealConfigs.eventId, eventId), eq(mealConfigs.mealFunctionIndex, mealIndex)))
      .get();
    if (existing) {
      return db.update(mealConfigs).set(data)
        .where(eq(mealConfigs.id, existing.id))
        .returning().get();
    }
    return db.insert(mealConfigs).values({
      eventId,
      mealFunctionIndex: mealIndex,
      tableType: 'circular',
      seatsPerTable: 10,
      stagePosition: '{"x":300,"y":40,"w":200,"h":65}',
      ...data,
    }).returning().get();
  },

  // ── Attendees ─────────────────────────────────────────────────────────────
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
    const insertMany = sqlite.transaction((rows: typeof data) => {
      return rows.map(a => db.insert(attendees).values(a).returning().get());
    });
    return insertMany(data);
  },
  deleteAllAttendees(eventId) {
    db.delete(attendees).where(eq(attendees.eventId, eventId)).run();
  },

  // ── Tables ────────────────────────────────────────────────────────────────
  getTables(eventId, mealFunctionIndex) {
    return db.select().from(tables)
      .where(and(eq(tables.eventId, eventId), eq(tables.mealFunctionIndex, mealFunctionIndex)))
      .all();
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
  deleteAllTables(eventId, mealFunctionIndex) {
    db.delete(tables)
      .where(and(eq(tables.eventId, eventId), eq(tables.mealFunctionIndex, mealFunctionIndex)))
      .run();
  },

  // ── Seat Assignments ──────────────────────────────────────────────────────
  getSeatAssignments(eventId, mealFunctionIndex) {
    return db.select().from(seatAssignments)
      .where(and(eq(seatAssignments.eventId, eventId), eq(seatAssignments.mealFunctionIndex, mealFunctionIndex)))
      .all();
  },
  getAllSeatAssignments(eventId) {
    return db.select().from(seatAssignments).where(eq(seatAssignments.eventId, eventId)).all();
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
    const insertMany = sqlite.transaction((rows: typeof assignments) =>
      rows.map(a => db.insert(seatAssignments).values(a).returning().get())
    );
    return insertMany(assignments);
  },
};

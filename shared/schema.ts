import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Events table
export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  tableType: text('table_type').notNull().default('circular'), // 'circular' | 'square'
  seatsPerTable: integer('seats_per_table').notNull().default(10),
  mealFunctionCount: integer('meal_function_count').notNull().default(1),
  mealFunctionNames: text('meal_function_names').notNull().default('["Lunch"]'), // JSON array
  floorPlanImage: text('floor_plan_image'), // base64 or URL
  stagePosition: text('stage_position').notNull().default('{"x":300,"y":50,"w":200,"h":80}'), // JSON
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// Attendees table
export const attendees = sqliteTable('attendees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('invitee'), // 'host' | 'floater' | 'invitee'
  company: text('company'),
  notes: text('notes'),
});

export const insertAttendeeSchema = createInsertSchema(attendees).omit({ id: true });
export type InsertAttendee = z.infer<typeof insertAttendeeSchema>;
export type Attendee = typeof attendees.$inferSelect;

// Tables (physical tables in the floor plan)
export const tables = sqliteTable('tables', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(),
  tableNumber: integer('table_number').notNull(),
  x: real('x').notNull().default(100),
  y: real('y').notNull().default(100),
  shape: text('shape').notNull().default('full'), // 'full' | 'half'
});

export const insertTableSchema = createInsertSchema(tables).omit({ id: true });
export type InsertTable = z.infer<typeof insertTableSchema>;
export type Table = typeof tables.$inferSelect;

// Seat assignments per meal function
export const seatAssignments = sqliteTable('seat_assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(),
  mealFunctionIndex: integer('meal_function_index').notNull().default(0),
  tableId: integer('table_id').notNull(),
  attendeeId: integer('attendee_id').notNull(),
  seatPosition: integer('seat_position').notNull().default(0), // 0-based seat index around the table
});

export const insertSeatAssignmentSchema = createInsertSchema(seatAssignments).omit({ id: true });
export type InsertSeatAssignment = z.infer<typeof insertSeatAssignmentSchema>;
export type SeatAssignment = typeof seatAssignments.$inferSelect;

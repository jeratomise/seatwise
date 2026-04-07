import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Events — top-level container; meal function names live here
export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  mealFunctionCount: integer('meal_function_count').notNull().default(1),
  mealFunctionNames: text('meal_function_names').notNull().default('["Meal Function 1"]'),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// Meal function config — one row per (event, mealFunctionIndex)
// Each meal function has its own table type, seat count, floor plan, stage
export const mealConfigs = sqliteTable('meal_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(),
  mealFunctionIndex: integer('meal_function_index').notNull().default(0),
  tableType: text('table_type').notNull().default('circular'),
  seatsPerTable: integer('seats_per_table').notNull().default(10),
  floorPlanImage: text('floor_plan_image'),
  stagePosition: text('stage_position').notNull().default('{"x":300,"y":40,"w":200,"h":65}'),
});

export const insertMealConfigSchema = createInsertSchema(mealConfigs).omit({ id: true });
export type InsertMealConfig = z.infer<typeof insertMealConfigSchema>;
export type MealConfig = typeof mealConfigs.$inferSelect;

// Attendees — belong to an event (shared across all meal functions)
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

// Tables — each table belongs to a specific meal function
export const tables = sqliteTable('tables', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(),
  mealFunctionIndex: integer('meal_function_index').notNull().default(0),
  tableNumber: integer('table_number').notNull(),
  x: real('x').notNull().default(100),
  y: real('y').notNull().default(100),
  shape: text('shape').notNull().default('full'), // 'full' | 'half'
});

export const insertTableSchema = createInsertSchema(tables).omit({ id: true });
export type InsertTable = z.infer<typeof insertTableSchema>;
export type Table = typeof tables.$inferSelect;

// Seat assignments — scoped to event + mealFunctionIndex + table
export const seatAssignments = sqliteTable('seat_assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(),
  mealFunctionIndex: integer('meal_function_index').notNull().default(0),
  tableId: integer('table_id').notNull(),
  attendeeId: integer('attendee_id').notNull(),
  seatPosition: integer('seat_position').notNull().default(0),
});

export const insertSeatAssignmentSchema = createInsertSchema(seatAssignments).omit({ id: true });
export type InsertSeatAssignment = z.infer<typeof insertSeatAssignmentSchema>;
export type SeatAssignment = typeof seatAssignments.$inferSelect;

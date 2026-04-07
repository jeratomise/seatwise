import type { Express } from 'express';
import { Server } from 'http';
import { storage } from './storage';
import { insertEventSchema, insertAttendeeSchema, insertTableSchema, insertSeatAssignmentSchema } from '@shared/schema';
import { z } from 'zod';

export function registerRoutes(httpServer: Server, app: Express) {
  // ---- EVENTS ----
  app.get('/api/events', (_req, res) => {
    res.json(storage.getEvents());
  });

  app.get('/api/events/:id', (req, res) => {
    const event = storage.getEvent(Number(req.params.id));
    if (!event) return res.status(404).json({ error: 'Not found' });
    res.json(event);
  });

  app.post('/api/events', (req, res) => {
    const parsed = insertEventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    res.json(storage.createEvent(parsed.data));
  });

  app.patch('/api/events/:id', (req, res) => {
    const event = storage.updateEvent(Number(req.params.id), req.body);
    if (!event) return res.status(404).json({ error: 'Not found' });
    res.json(event);
  });

  app.delete('/api/events/:id', (req, res) => {
    storage.deleteEvent(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---- MEAL CONFIGS ----
  // GET /api/events/:eventId/meal-config?meal=0
  app.get('/api/events/:eventId/meal-config', (req, res) => {
    const eventId = Number(req.params.eventId);
    const mealIndex = Number(req.query.meal ?? 0);
    const config = storage.getMealConfig(eventId, mealIndex);
    if (!config) {
      // Return defaults if not yet created
      return res.json({
        id: null,
        eventId,
        mealFunctionIndex: mealIndex,
        tableType: 'circular',
        seatsPerTable: 10,
        floorPlanImage: null,
        stagePosition: '{"x":300,"y":40,"w":200,"h":65}',
      });
    }
    res.json(config);
  });

  // PATCH /api/events/:eventId/meal-config?meal=0
  app.patch('/api/events/:eventId/meal-config', (req, res) => {
    const eventId = Number(req.params.eventId);
    const mealIndex = Number(req.query.meal ?? 0);
    const config = storage.upsertMealConfig(eventId, mealIndex, req.body);
    res.json(config);
  });

  // ---- ATTENDEES ----
  app.get('/api/events/:eventId/attendees', (req, res) => {
    res.json(storage.getAttendees(Number(req.params.eventId)));
  });

  app.post('/api/events/:eventId/attendees', (req, res) => {
    const parsed = insertAttendeeSchema.safeParse({ ...req.body, eventId: Number(req.params.eventId) });
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    res.json(storage.createAttendee(parsed.data));
  });

  app.post('/api/events/:eventId/attendees/bulk', (req, res) => {
    const eventId = Number(req.params.eventId);
    const list = z.array(insertAttendeeSchema.omit({ eventId: true })).safeParse(req.body);
    if (!list.success) return res.status(400).json({ error: list.error });
    const data = list.data.map(a => ({ ...a, eventId }));
    res.json(storage.bulkCreateAttendees(data));
  });

  app.patch('/api/attendees/:id', (req, res) => {
    const attendee = storage.updateAttendee(Number(req.params.id), req.body);
    if (!attendee) return res.status(404).json({ error: 'Not found' });
    res.json(attendee);
  });

  app.delete('/api/attendees/:id', (req, res) => {
    storage.deleteAttendee(Number(req.params.id));
    res.json({ ok: true });
  });

  app.delete('/api/events/:eventId/attendees', (req, res) => {
    storage.deleteAllAttendees(Number(req.params.eventId));
    res.json({ ok: true });
  });

  // ---- TABLES (scoped to meal function) ----
  // GET /api/events/:eventId/tables?meal=0
  app.get('/api/events/:eventId/tables', (req, res) => {
    const mealIndex = Number(req.query.meal ?? 0);
    res.json(storage.getTables(Number(req.params.eventId), mealIndex));
  });

  // POST /api/events/:eventId/tables?meal=0
  app.post('/api/events/:eventId/tables', (req, res) => {
    const mealIndex = Number(req.query.meal ?? req.body.mealFunctionIndex ?? 0);
    const parsed = insertTableSchema.safeParse({
      ...req.body,
      eventId: Number(req.params.eventId),
      mealFunctionIndex: mealIndex,
    });
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    res.json(storage.createTable(parsed.data));
  });

  app.patch('/api/tables/:id', (req, res) => {
    const table = storage.updateTable(Number(req.params.id), req.body);
    if (!table) return res.status(404).json({ error: 'Not found' });
    res.json(table);
  });

  app.delete('/api/tables/:id', (req, res) => {
    storage.deleteTable(Number(req.params.id));
    res.json({ ok: true });
  });

  // DELETE /api/events/:eventId/tables?meal=0
  app.delete('/api/events/:eventId/tables', (req, res) => {
    const mealIndex = Number(req.query.meal ?? 0);
    storage.deleteAllTables(Number(req.params.eventId), mealIndex);
    res.json({ ok: true });
  });

  // ---- SEAT ASSIGNMENTS ----
  app.get('/api/events/:eventId/assignments', (req, res) => {
    const mealIndex = req.query.meal !== undefined ? Number(req.query.meal) : undefined;
    if (mealIndex !== undefined) {
      res.json(storage.getSeatAssignments(Number(req.params.eventId), mealIndex));
    } else {
      res.json(storage.getAllSeatAssignments(Number(req.params.eventId)));
    }
  });

  // Bulk set all assignments for a meal function
  app.post('/api/events/:eventId/assignments/bulk', (req, res) => {
    const eventId = Number(req.params.eventId);
    const mealIndex = Number(req.body.mealFunctionIndex ?? 0);
    const list = z.array(insertSeatAssignmentSchema).safeParse(req.body.assignments);
    if (!list.success) return res.status(400).json({ error: list.error });
    res.json(storage.bulkSetSeatAssignments(eventId, mealIndex, list.data));
  });

  app.delete('/api/events/:eventId/assignments', (req, res) => {
    const mealIndex = Number(req.query.meal ?? 0);
    storage.deleteSeatAssignmentsForMeal(Number(req.params.eventId), mealIndex);
    res.json({ ok: true });
  });

  app.patch('/api/assignments/:id', (req, res) => {
    const a = storage.updateSeatAssignment(Number(req.params.id), req.body);
    if (!a) return res.status(404).json({ error: 'Not found' });
    res.json(a);
  });

  app.delete('/api/assignments/:id', (req, res) => {
    storage.deleteSeatAssignment(Number(req.params.id));
    res.json({ ok: true });
  });
}

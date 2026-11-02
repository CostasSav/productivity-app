import { Router, type ErrorRequestHandler, type Request } from 'express';
import { db } from '../db/database';
import { PlanningError } from '../db/planning';

// All validation lives in db/planning.ts and surfaces as PlanningError(400/404/409).

const planningError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof PlanningError) res.status(error.status).json({ error: error.message });
  else next(error);
};

function body(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
}
const id = (req: Request) => Number(req.params.id);

// ── /api/plannings ────────────────────────────────────────────────────────────

export const planningsRouter = Router();

planningsRouter.get('/', (_req, res) => {
  res.json(db.getPlannings());
});

// Body: { name, sectionId?, startDate?, targetDate? }. A sectionId imports that section's tasks.
planningsRouter.post('/', (req, res) => {
  res.status(201).json(db.createPlanning(body(req)));
});

planningsRouter.get('/:id', (req, res) => {
  const planning = db.getPlanning(id(req));
  if (!planning) { res.status(404).json({ error: 'Planning not found' }); return; }
  res.json(planning);
});

planningsRouter.patch('/:id', (req, res) => {
  res.json(db.updatePlanning(id(req), body(req)));
});

planningsRouter.delete('/:id', (req, res) => {
  db.deletePlanning(id(req));
  res.status(204).send();
});

// Body: { groups?: [{ id, order }], items?: [{ id, order, groupId }] }, applied atomically.
planningsRouter.patch('/:id/reorder', (req, res) => {
  db.reorderPlanning(id(req), body(req));
  res.status(204).send();
});

planningsRouter.use(planningError);

// ── /api/planning-groups ──────────────────────────────────────────────────────

export const planningGroupsRouter = Router();

planningGroupsRouter.post('/', (req, res) => {
  res.status(201).json(db.createPlanningGroup(body(req)));
});

planningGroupsRouter.patch('/:id', (req, res) => {
  res.json(db.updatePlanningGroup(id(req), body(req)));
});

// ?mode=deleteItems | moveToRoot (required)
planningGroupsRouter.delete('/:id', (req, res) => {
  db.deletePlanningGroup(id(req), req.query.mode);
  res.status(204).send();
});

planningGroupsRouter.use(planningError);

// ── /api/planning-items ───────────────────────────────────────────────────────

export const planningItemsRouter = Router();

planningItemsRouter.post('/', (req, res) => {
  res.status(201).json(db.createPlanningItem(body(req)));
});

planningItemsRouter.patch('/:id', (req, res) => {
  res.json(db.updatePlanningItem(id(req), body(req)));
});

planningItemsRouter.delete('/:id', (req, res) => {
  db.deletePlanningItem(id(req));
  res.status(204).send();
});

// Segment routes return the whole updated item.
planningItemsRouter.post('/:id/segments', (req, res) => {
  res.status(201).json(db.addPlanningSegment(id(req), body(req)));
});

planningItemsRouter.patch('/:id/segments/:segmentId', (req, res) => {
  res.json(db.updatePlanningSegment(id(req), req.params.segmentId, body(req)));
});

planningItemsRouter.delete('/:id/segments/:segmentId', (req, res) => {
  res.json(db.deletePlanningSegment(id(req), req.params.segmentId));
});

planningItemsRouter.use(planningError);

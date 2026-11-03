import { Router, type ErrorRequestHandler, type Request, type Response } from 'express';
import { db } from '../db/database';
import { PlanningError } from '../db/planning';
import { CompletionError, habitZone } from '../db/completion';
import { widgetCalendarDate } from '../widgets/snapshot';
import { buildPlanningWorkbook, exportFileName, writePlanningXlsx, type ExportLang } from '../exports/planningXlsx';

// All validation lives in db/planning.ts and surfaces as PlanningError(400/404/409).

const planningError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof PlanningError) res.status(error.status).json({ error: error.message });
  // Task edits made through a planning use the task logic, which reports its own conflicts.
  else if (error instanceof CompletionError) res.status(error.status).json({ error: error.code });
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

// Excel export (read-only): never writes planning or task data.
async function sendExport(res: Response, planningId: number, options: { lang: unknown; owner: unknown; includeDone: boolean; groupIds?: number[] }) {
  const { lang, owner } = options;
  if (lang !== 'fr' && lang !== 'en') { res.status(400).json({ error: 'lang must be fr or en' }); return; }
  if (owner !== undefined && (typeof owner !== 'string' || owner.length > 100)) { res.status(400).json({ error: 'invalid owner' }); return; }
  const found = db.getPlanningExportData(planningId);
  if (!found) { res.status(404).json({ error: 'Planning not found' }); return; }
  // "Today" in the user's zone (same as the widgets), for the export date and current week.
  const today = widgetCalendarDate(new Date().toISOString(), habitZone())!;
  const { planning } = found;
  const workbook = buildPlanningWorkbook(planning, planning.groups, planning.items, found.tasks, {
    lang: lang as ExportLang, owner: owner as string | undefined, includeDone: options.includeDone, today, groupIds: options.groupIds,
  });
  const buffer = await writePlanningXlsx(workbook);
  const fileName = exportFileName(planning.name, today);
  // ASCII fallback for old clients, exact UTF-8 name for everyone else (RFC 6266 / 5987).
  const ascii = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.send(buffer);
}

// Quick export (plannings list). Query: lang=fr|en (fr), owner=<owner>, includeDone=true|false (true).
// Groups follow the planning's saved sort mode.
planningsRouter.get('/:id/export.xlsx', async (req, res, next) => {
  try {
    const includeDone = req.query.includeDone ?? 'true';
    if (includeDone !== 'true' && includeDone !== 'false') { res.status(400).json({ error: 'includeDone must be true or false' }); return; }
    await sendExport(res, id(req), { lang: req.query.lang ?? 'fr', owner: req.query.owner, includeDone: includeDone === 'true' });
  } catch (error) {
    next(error);
  }
});

// Export from the planning view. Body: { lang?, owner?, includeDone?, groupIds? }, where groupIds
// is the group order on screen (ids of other plannings -> 400; groups not listed are appended).
planningsRouter.post('/:id/export', async (req, res, next) => {
  try {
    const { lang = 'fr', owner, includeDone = true, groupIds } = body(req);
    if (typeof includeDone !== 'boolean') { res.status(400).json({ error: 'includeDone must be a boolean' }); return; }
    if (groupIds !== undefined && (!Array.isArray(groupIds) || groupIds.length > 5000 || !groupIds.every(g => Number.isSafeInteger(g) && g > 0))) {
      res.status(400).json({ error: 'groupIds must be an array of group ids' }); return;
    }
    await sendExport(res, id(req), { lang, owner: owner ?? undefined, includeDone, groupIds: groupIds as number[] | undefined });
  } catch (error) {
    next(error);
  }
});

// Section tasks the planning doesn't contain yet (and hasn't ignored), by deadline.
planningsRouter.get('/:id/missing-tasks', (req, res) => {
  res.json(db.getPlanningMissingTasks(id(req)));
});

// Body: [{ taskId, groupId }]. Responds { planning, skipped } (already-present task ids).
planningsRouter.post('/:id/import-tasks', (req, res) => {
  res.json(db.importPlanningTasks(id(req), req.body));
});

// Body: [taskId]
planningsRouter.post('/:id/ignore-tasks', (req, res) => {
  res.json(db.ignorePlanningTasks(id(req), req.body));
});

planningsRouter.delete('/:id/ignored-tasks', (req, res) => {
  res.json(db.clearIgnoredPlanningTasks(id(req)));
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

// Segment routes return { item, deadlineSync }: a change to a linked item's last
// bar moves its task deadline in the same request. Send syncDeadline: false for
// local-only changes.
planningItemsRouter.post('/:id/segments', (req, res) => {
  res.status(201).json(db.addPlanningSegment(id(req), body(req)));
});

planningItemsRouter.patch('/:id/segments/:segmentId', (req, res) => {
  res.json(db.updatePlanningSegment(id(req), req.params.segmentId, body(req)));
});

planningItemsRouter.delete('/:id/segments/:segmentId', (req, res) => {
  res.json(db.deletePlanningSegment(id(req), req.params.segmentId));
});

// Undo of a synced change. Body: { segmentId, segment | null, deadline }. Returns the item.
planningItemsRouter.post('/:id/segments/revert', (req, res) => {
  res.json(db.revertPlanningSegment(id(req), body(req)));
});

planningItemsRouter.use(planningError);

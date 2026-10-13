import fs from 'node:fs';
import path from 'node:path';

// Standalone: no dotenv, database module, startup, network or write APIs.
type Category = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
type RecordValue = Record<string, unknown>;
const object = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const validId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
const validDate = (v: unknown): boolean => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

export function diagnose(input: unknown, details = false) {
  if (!object(input) || !Array.isArray(input.tasks)) throw new Error('INVALID_STRUCTURE');
  const ids = new Map<unknown, number>();
  for (const task of input.tasks) if (object(task)) ids.set(task.id, (ids.get(task.id) ?? 0) + 1);
  const categories: Record<Category, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
  let blocked = 0, completedMissing = 0;
  let activeMissing = 0, guardMatches = 0, guardPreempted = 0;
  const reasonCounts: Record<string, number> = {};
  const records: RecordValue[] = [];
  for (const task of input.tasks) {
    let category: Category = 'G';
    const reasons: string[] = [];
    if (!object(task)) reasons.push('not-an-object');
    else {
      const duplicate = (ids.get(task.id) ?? 0) > 1;
      const statusValid = ['todo', 'in_progress', 'done'].includes(task.status as string);
      const markerMissing = !Object.prototype.hasOwnProperty.call(task, 'recurrenceIssued');
      const markerValid = markerMissing || typeof task.recurrenceIssued === 'boolean';
      const recurring = ['daily', 'weekly', 'monthly'].includes(task.recurrence as string);
      // Mirrors the shared completion guard, before deadline-format validation.
      // Includes truthy malformed deadlines and recurrence values, even in F/G.
      const matchesGuard = task.status !== 'done' && markerMissing && !!task.recurrence && !!task.deadline;
      if (matchesGuard) {
        guardMatches++;
        if (duplicate || !statusValid) guardPreempted++;
        else blocked++;
      }
      if (recurring && ['todo', 'in_progress'].includes(task.status as string) && markerMissing) activeMissing++;
      if (recurring && task.status === 'done' && markerMissing) completedMissing++;
      if (!validId(task.id)) reasons.push('invalid-id');
      if (duplicate) reasons.push('duplicate-id');
      if (!statusValid) reasons.push('invalid-status');
      if (!markerValid) reasons.push('invalid-recurrenceIssued');
      if (task.recurrence !== null && !recurring) reasons.push('invalid-or-missing-recurrence');
      if (typeof task.title !== 'string') reasons.push('invalid-title');
      const minDay = task.recurrence === 'monthly' ? 1 : 0;
      const maxDay = task.recurrence === 'monthly' ? 31 : 6;
      if (task.recurrence_day != null && (!Number.isInteger(task.recurrence_day) || (task.recurrence_day as number) < minDay || (task.recurrence_day as number) > maxDay)) reasons.push('invalid-recurrence_day');
      // TaskForm explicitly permits free text such as "afternoon", not only HH:mm.
      if (task.recurrence_time != null && typeof task.recurrence_time !== 'string') reasons.push('invalid-recurrence_time-type');
      const invalidDeadline = recurring && !validDate(task.deadline);
      const otherIssues = reasons.length > 0;
      if (invalidDeadline) reasons.push('missing-or-invalid-calendar-deadline');
      if (!otherIssues) {
        if (!recurring) category = 'A';
        else if (invalidDeadline) category = 'F';
        else if (task.recurrenceIssued === false) category = 'B';
        else if (task.recurrenceIssued === true) category = 'C';
        else category = task.status === 'done' ? 'E' : 'D';
      }
    }
    categories[category]++;
    for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    if (details) records.push({ category, reasons,
      id: object(task) && validId(task.id) ? task.id : null,
      status: object(task) && typeof task.status === 'string' ? task.status : null,
      recurrence: object(task) && typeof task.recurrence === 'string' ? task.recurrence : null,
      deadline: object(task) && typeof task.deadline === 'string' ? task.deadline : null,
      title: object(task) && typeof task.title === 'string' ? task.title : null });
  }
  return { totalTasks: input.tasks.length, categories,
    reasonCounts,
    historicalStates: { activeRecurringMissingMarker: activeMissing, completedRecurringMissingMarker: completedMissing },
    ambiguityGuard: { conditionMatches: guardMatches, preemptedByEarlierBusinessValidation: guardPreempted, reachesAmbiguousRecurrence: blocked },
    activeRecurringTasksBlockedByAmbiguousRecurrence: blocked,
    completedRecurringTasksMissingMetadata: completedMissing,
    malformedOrAmbiguousRecords: categories.G,
    manualReviewNecessary: blocked > 0 || categories.F > 0 || categories.G > 0,
    historicalReconciliationNecessary: blocked > 0,
    ...(details ? { records } : {}) };
}

export function main(args: string[]): number {
  if (args.length < 1 || args.length > 2 || !path.isAbsolute(args[0]) || /^[\\/]{2}/.test(args[0]) || (args.length === 2 && args[1] !== '--details')) {
    console.error('Usage: diagnose-recurrences <absolute-local-snapshot-path> [--details]'); return 1;
  }
  try {
    // Reject links/directories and open explicitly for reading. No path/value is echoed on failure.
    if (!fs.lstatSync(args[0]).isFile()) throw new Error();
    const input: unknown = JSON.parse(fs.readFileSync(args[0], 'utf8'));
    console.log(JSON.stringify(diagnose(input, args[1] === '--details'), null, 2));
    return 0;
  } catch {
    console.error('Diagnostic failed: snapshot missing, unreadable, not a regular file, invalid JSON, or missing a tasks array. No changes made.');
    return 1;
  }
}
if (require.main === module) process.exitCode = main(process.argv.slice(2));

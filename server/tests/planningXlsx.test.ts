import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { buildPlanningWorkbook, exportGroupOrder, exportFileName, fixSheetPrOrder, sheetName, toArgb, writePlanningXlsx, type PlanningExportOptions } from '../src/exports/planningXlsx';
import { PlanningError } from '../src/db/planning';
import type { Planning, PlanningGroup, PlanningItem, Task } from '../src/types';

const AT = '2026-11-02T10:00:00.000Z';
const planning: Planning = {
  id: 1, name: 'Lancement / Q1: "pilote"', sectionId: 1, startDate: '2026-10-26', weekCount: 10, targetDate: '2026-11-20',
  highlightedWeeks: ['2026-11-30'], legend: [{ color: '#22c55e', label: 'Planned' }, { color: '#3b82f6', label: 'In progress' }],
  ignoredTaskIds: [], titleColumnWidth: 280, groupSortMode: 'custom', createdAt: AT, updatedAt: AT,
};
const task = (id: number, fields: Partial<Task> = {}): Task => ({
  id, title: `Task ${id}`, description: null, status: 'todo', priority: 'medium', deadline: null, note_id: null, section_id: 1,
  recurrence: null, recurrence_day: null, recurrence_time: null, subtasks: [], pinnedToday: false, pinnedAt: null,
  created_at: AT, updated_at: AT, ...fields,
});
const tasks = [task(1, { title: 'Live title of task one' }), task(2, { status: 'done' }), task(3, { title: 'Parent', subtasks: [{ id: 1, title: 'Sub one', status: 'done' }, { id: 2, title: 'Sub two', status: 'todo' }] })];
const item = (id: number, fields: Partial<PlanningItem>): PlanningItem => ({
  id, planningId: 1, groupId: null, taskId: null, subtaskId: null, title: `Item ${id}`, owner: null, progress: 0,
  progressBeforeDone: null, order: id, segments: [], ...fields,
});
const groups: PlanningGroup[] = [
  { id: 20, planningId: 1, taskId: null, name: 'Empty group', order: 2, collapsed: false, priority: 'high' },
  { id: 10, planningId: 1, taskId: 3, name: 'old snapshot', order: 1, collapsed: true, priority: 'low' },
];
const items: PlanningItem[] = [
  item(1, { taskId: 1, title: 'snapshot', owner: 'Alice', segments: [{ id: 'a', start: '2026-11-02', end: '2026-11-09', color: '#3b82f6' }] }),
  item(2, { taskId: 2, owner: 'Bob', segments: [{ id: 'b', start: '2026-11-30', end: '2026-11-30', color: '#f00' }] }),
  item(3, { title: 'Manual '.repeat(30).trim(), progress: 40, owner: 'Alice' }),
  item(4, { groupId: 10, taskId: 3, subtaskId: 1, title: 'x', order: 0 }),
  item(5, { groupId: 10, taskId: 3, subtaskId: 2, title: 'y', order: 1, owner: 'Bob', segments: [{ id: 'c', start: '2026-10-19', end: '2026-10-26', color: '#22c55e80' }] }),
];
const options: PlanningExportOptions = { lang: 'fr', includeDone: true, today: '2026-11-04' };
const build = (o: Partial<PlanningExportOptions> = {}) => buildPlanningWorkbook(planning, groups, items, tasks, { ...options, ...o }).worksheets[0];
const fill = (ws: ExcelJS.Worksheet, r: number, c: number) => (ws.getCell(r, c).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
const colA = (ws: ExcelJS.Worksheet) => { const out: string[] = []; ws.eachRow({ includeEmpty: true }, (row, n) => { if (n > 3) out.push(String(row.getCell(1).value ?? '')); }); return out; };

test('helpers: colors, sheet and file names', () => {
  assert.equal(toArgb('#22c55e'), 'FF22C55E');
  assert.equal(toArgb('#f00'), 'FFFF0000');
  assert.equal(toArgb('#22c55e80'), '8022C55E');
  assert.equal(toArgb('var(--x)'), 'FF22C55E');
  assert.equal(sheetName('Lancement / Q1: [pilote]?'), 'Lancement Q1 pilote');
  assert.equal(sheetName("'".repeat(3)), 'Planning');
  assert.ok(sheetName('x'.repeat(40)).length <= 31);
  assert.equal(exportFileName('Lancement / Q1: "pilote".', '2026-11-04'), 'Lancement Q1 pilote - 2026-11-04.xlsx');
  assert.equal(exportFileName('CON', '2026-11-04'), 'Planning CON - 2026-11-04.xlsx');
});

test('header: months merged over their weeks, Mondays, countdown, frozen panes, filter, print setup', () => {
  const ws = build();
  assert.equal(ws.name, 'Lancement Q1 "pilote"', '" is allowed in sheet names; / and : are not');
  assert.equal(ws.getCell('A1').value, planning.name);
  assert.equal(ws.getCell('A2').value, 'Exporté le 04/11/2026');
  // 10 weeks from 26/10: Oct (1 week) | Nov (5) | Dec (4)
  const merges = (ws.model as unknown as { merges: string[] }).merges;
  assert.deepEqual(merges.filter(m => m.endsWith('1') && m.startsWith('E1') || m.startsWith('J1')).sort(), ['E1:I1', 'J1:M1']);
  assert.equal(ws.getCell('D1').value, 'Octobre 2026');
  assert.equal(ws.getCell('E1').value, 'Novembre');
  assert.equal(ws.getCell('J1').value, 'Décembre');
  assert.equal(ws.getCell('D2').value, '26/10');
  assert.equal(ws.getCell(2, 3 + 10).value, '28/12');
  assert.equal(ws.getCell(2, 3 + 11).value, null, 'exactly weekCount week columns');
  assert.deepEqual([ws.getCell('D3').value, ws.getCell('G3').value, ws.getCell('H3').value], ['S-3', 'S', 'S+1']);
  assert.deepEqual([ws.getCell('B3').value, ws.getCell('C3').value], ['Qui', 'Avancement']);
  const view = ws.views[0] as ExcelJS.WorksheetViewFrozen;
  assert.deepEqual([view.state, view.xSplit, view.ySplit, view.showGridLines], ['frozen', 3, 3, false]);
  assert.deepEqual(ws.autoFilter, { from: { row: 3, column: 1 }, to: { row: 3, column: 13 } });
  assert.deepEqual([ws.pageSetup.orientation, ws.pageSetup.fitToWidth, ws.pageSetup.fitToHeight, ws.pageSetup.printTitlesRow, ws.pageSetup.printTitlesColumn],
    ['landscape', 1, 0, '1:3', 'A:C']);
});

test('English labels and ISO weeks without a target date', () => {
  const ws = buildPlanningWorkbook({ ...planning, targetDate: null }, groups, items, tasks, { ...options, lang: 'en' }).worksheets[0];
  assert.deepEqual([ws.getCell('A2').value, ws.getCell('B3').value, ws.getCell('D1').value, ws.getCell('D3').value, ws.getCell('E3').value],
    ['Exported on 04/11/2026', 'Owner', 'October 2026', 'W44', 'W45']);
});

test('body: root items first, spacer + group, live titles, computed progress, outline levels', () => {
  const ws = build();
  assert.deepEqual(colA(ws).slice(0, 7), ['Live title of task one', 'Task 2', 'Manual '.repeat(30).trim(), '', 'PARENT', 'Sub one', 'Sub two']);
  // rows: 4-6 root items, 7 spacer, 8 group, 9-10 its items, 11 spacer, 12 empty group
  assert.equal(ws.getCell('A7').value, null, 'spacer before each group');
  assert.equal(ws.getCell('A12').value, 'EMPTY GROUP', 'empty groups are kept without filters');
  assert.deepEqual([4, 5, 6, 8, 9, 10].map(r => ws.getCell(r, 3).value), [0, 1, 0.4, null, 1, 0]);
  assert.equal(ws.getCell('C4').numFmt, '0%');
  assert.deepEqual([4, 7, 8, 9, 10, 12].map(r => ws.getRow(r).outlineLevel ?? 0), [0, 0, 0, 1, 1, 0]);
  assert.equal(ws.properties.outlineProperties?.summaryBelow, false);
  assert.ok((ws.getRow(6).height ?? 0) > 15, 'long titles get a taller row');
  assert.equal(ws.getCell('A8').font?.bold, true);
});

test('segment fills, peach target/highlight columns, legend', () => {
  const ws = build();
  // weeks: D=26/10, E=02/11, F=09/11, G=16/11 (target), H=23/11, I=30/11 (highlighted), J=07/12…
  assert.deepEqual([fill(ws, 4, 5), fill(ws, 4, 6), fill(ws, 4, 8)], ['FF3B82F6', 'FF3B82F6', undefined], 'item 1 covers E-F');
  assert.deepEqual([fill(ws, 2, 7), fill(ws, 3, 7), fill(ws, 4, 7), fill(ws, 7, 7), fill(ws, 1, 7)], ['FFF8E1D4', 'FFF8E1D4', 'FFF8E1D4', 'FFF8E1D4', undefined],
    'target week peach on header rows 2-3 and every body row, not row 1');
  assert.deepEqual([fill(ws, 5, 9), fill(ws, 4, 9)], ['FFFF0000', 'FFF8E1D4'], 'a bar keeps its color on a highlighted week');
  // item 5 starts before the planning: only its in-range week (26/10, col D) is filled, alpha kept
  assert.equal(fill(ws, 10, 4), '8022C55E');
  const legendRow = 12 + 3;
  assert.equal(ws.getCell(legendRow, 4).value, 'Légende');
  assert.equal(fill(ws, legendRow + 1, 4), 'FF22C55E');
  assert.equal(ws.getCell(legendRow + 2, 5).value, 'In progress');
});

test('borders: month lines, C|D grey, current week red, row 3 bottom', () => {
  const ws = build();
  const left = (r: number, c: number) => ws.getCell(r, c).border?.left;
  assert.deepEqual([left(5, 4)?.style, left(5, 4)?.color?.argb], ['medium', 'FF808080'], 'C|D medium grey wins over the month line');
  assert.deepEqual([left(1, 10)?.style, left(6, 10)?.color?.argb], ['thin', 'FF000000'], 'December starts at J');
  // today 04/11 -> week of 02/11 = column E (5): red from row 3 to the last body row (12)
  assert.deepEqual([left(3, 5)?.color?.argb, left(12, 5)?.color?.argb, ws.getCell(12, 6).border?.left?.color?.argb], ['FFE53935', 'FFE53935', 'FFE53935']);
  assert.equal(ws.getCell(3, 5).border?.top?.color?.argb, 'FFE53935');
  assert.equal(ws.getCell(12, 5).border?.bottom?.color?.argb, 'FFE53935');
  assert.equal(left(2, 5)?.color?.argb, 'FF000000', 'red starts at row 3 (row 2 keeps the month line at E)');
  assert.deepEqual([ws.getCell(3, 1).border?.bottom?.style, ws.getCell(3, 9).border?.bottom?.color?.argb], ['medium', 'FF808080']);
  assert.equal(left(6, 2)?.style, 'thin', 'A|B separator');
});

test('filters: owner and includeDone, groups emptied by a filter are omitted', () => {
  assert.deepEqual(colA(build({ owner: 'Alice' })).filter(Boolean), ['Live title of task one', 'Manual '.repeat(30).trim()]);
  assert.deepEqual(colA(build({ owner: 'Bob' })).filter(Boolean), ['Task 2', 'PARENT', 'Sub two']);
  assert.deepEqual(colA(build({ includeDone: false })).filter(Boolean), ['Live title of task one', 'Manual '.repeat(30).trim(), 'PARENT', 'Sub two']);
});

test('the export never modifies its inputs', () => {
  const before = JSON.stringify({ planning, groups, items, tasks });
  build(); build({ owner: 'Bob', includeDone: false, lang: 'en' });
  assert.equal(JSON.stringify({ planning, groups, items, tasks }), before);
});

test('sheetPr children are written in schema order (Excel rejects the file otherwise)', async () => {
  assert.equal(fixSheetPrOrder('<sheetPr><pageSetUpPr fitToPage="1"/><outlinePr summaryBelow="0" summaryRight="0"/></sheetPr>'),
    '<sheetPr><outlinePr summaryBelow="0" summaryRight="0"/><pageSetUpPr fitToPage="1"/></sheetPr>');
  assert.equal(fixSheetPrOrder('<sheetPr><other/></sheetPr>'), '<sheetPr><other/></sheetPr>', 'unknown content is left alone');
  const zip = await JSZip.loadAsync(await writePlanningXlsx(buildPlanningWorkbook(planning, groups, items, tasks, options)));
  const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  assert.match(sheet, /<sheetPr><outlinePr[^>]*\/><pageSetUpPr fitToPage="1"\/><\/sheetPr>/);
});

test('workbook round-trips through an .xlsx buffer', async () => {
  const buffer = await writePlanningXlsx(buildPlanningWorkbook(planning, groups, items, tasks, options));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const ws = wb.worksheets[0];
  assert.equal(ws.getCell('E1').value, 'Novembre');
  assert.equal(ws.getRow(9).outlineLevel, 1);
  assert.equal(ws.getCell('J1').border?.left?.style, 'thin', 'merged month headers keep their left border');
  assert.equal(fill(ws, 4, 5), 'FF3B82F6');
});

test('group rows: effective priority in column B, bold, app colors; no bar or progress', () => {
  const ws = build();
  // group 10 is linked to task 3 (medium): the live task wins over the stored 'low'
  assert.deepEqual([ws.getCell('B8').value, ws.getCell('B8').font?.bold, ws.getCell('B8').font?.color?.argb], ['Moyenne', true, 'FFA16207']);
  assert.deepEqual([ws.getCell('B12').value, ws.getCell('B12').font?.color?.argb], ['Haute', 'FFB91C1C']);
  assert.deepEqual([ws.getCell('C8').value, fill(ws, 8, 4)], [null, undefined]);
  const en = buildPlanningWorkbook(planning, [{ ...groups[0], priority: 'low' }, { ...groups[1], taskId: null, priority: null }], items, tasks, { ...options, lang: 'en' }).worksheets[0];
  assert.deepEqual([en.getCell('B12').value, en.getCell('B12').font?.color?.argb], ['Low', 'FF15803D']);
  assert.equal(en.getCell('B8').value, null, 'no priority -> empty');
});

test('group order: explicit ids, missing groups appended, saved mode otherwise; sort note below the legend', () => {
  const groupRows = (ws: ExcelJS.Worksheet) => colA(ws).filter(v => v === 'PARENT' || v === 'EMPTY GROUP');
  assert.deepEqual(groupRows(build()), ['PARENT', 'EMPTY GROUP'], 'custom order');
  assert.deepEqual(groupRows(build({ groupIds: [20, 10] })), ['EMPTY GROUP', 'PARENT']);
  assert.deepEqual(groupRows(build({ groupIds: [20] })), ['EMPTY GROUP', 'PARENT'], 'unlisted groups follow');
  assert.deepEqual(exportGroupOrder(groups, items, tasks, 'custom', []).map(g => g.id), [10, 20], 'empty list -> custom order');
  const fails = (ids: number[]) => assert.throws(() => build({ groupIds: ids }), (e: unknown) => e instanceof PlanningError && e.status === 400);
  fails([10, 99]);
  fails([10, 10]);
  // no ids: saved mode (deadline: group 10 has bars, 20 has none; priority: 20 high > 10 medium)
  const withMode = (groupSortMode: Planning['groupSortMode'], lang: 'fr' | 'en' = 'fr') =>
    buildPlanningWorkbook({ ...planning, groupSortMode }, groups, items, tasks, { ...options, lang }).worksheets[0];
  assert.deepEqual(groupRows(withMode('deadline')), ['PARENT', 'EMPTY GROUP']);
  assert.deepEqual(groupRows(withMode('priority')), ['EMPTY GROUP', 'PARENT']);
  // legend title at 15, entries 16-17, note right below
  const ws = build();
  assert.deepEqual([ws.getCell(18, 4).value, ws.getCell(18, 4).font?.italic, ws.getCell(18, 4).font?.size, ws.getCell(18, 4).font?.color?.argb],
    ['Groupes triés par : ordre personnalisé', true, 9, 'FF808080']);
  assert.equal(withMode('deadline').getCell(18, 4).value, 'Groupes triés par : échéance');
  assert.equal(withMode('priority', 'en').getCell(18, 4).value, 'Groups sorted by: priority');
  const noLegend = buildPlanningWorkbook({ ...planning, legend: [] }, groups, items, tasks, options).worksheets[0];
  assert.equal(noLegend.getCell(15, 4).value, 'Groupes triés par : ordre personnalisé');
});

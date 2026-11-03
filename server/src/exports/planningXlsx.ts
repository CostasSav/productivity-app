import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PlanningError, addDays, itemDone, itemProgress, itemTitle, mondayOf, weeksBetween } from '../db/planning';
import { effectiveGroupPriority, sortGroups, type GroupSortMode } from '../db/planningSort';
import type { Planning, PlanningGroup, PlanningItem, Priority, Task } from '../types';

// Excel export of one planning. Pure: it only reads the objects it is given
// and returns a workbook, so it can be tested without HTTP or the database.

export type ExportLang = 'fr' | 'en';

export interface PlanningExportOptions {
  lang: ExportLang;
  owner?: string;        // only items with exactly this owner
  includeDone: boolean;  // false drops done items (same "done" as the row checkbox)
  today: string;         // YYYY-MM-DD in the user's zone: export date and current-week outline
  /** Group ids in the order shown in the app; when absent, the planning's saved sort mode decides. */
  groupIds?: number[];
}

const TEXT: Record<ExportLang, {
  months: string[]; title: string; owner: string; progress: string; exportedOn: string; legend: string;
  sortedBy: string; modes: Record<GroupSortMode, string>; priorities: Record<Priority, string>;
}> = {
  fr: {
    months: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
    title: 'Titre', owner: 'Qui', progress: 'Avancement', exportedOn: 'Exporté le', legend: 'Légende',
    sortedBy: 'Groupes triés par :', modes: { custom: 'ordre personnalisé', deadline: 'échéance', priority: 'priorité' },
    priorities: { high: 'Haute', medium: 'Moyenne', low: 'Basse' },
  },
  en: {
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    title: 'Title', owner: 'Owner', progress: 'Progress', exportedOn: 'Exported on', legend: 'Legend',
    sortedBy: 'Groups sorted by:', modes: { custom: 'custom order', deadline: 'deadline', priority: 'priority' },
    priorities: { high: 'High', medium: 'Medium', low: 'Low' },
  },
};

const FIRST_WEEK_COL = 4; // D
const HEADER_ROWS = 3;
const TITLE_WIDTH = 70;
const LINE_HEIGHT = 15;   // points per line of Calibri 11
const FONT = { name: 'Calibri', size: 11 } as const;
const PEACH = 'FFF8E1D4';
const BLACK = 'FF000000';
const GREY = 'FF808080';
const LIGHT_GREY = 'FFBFBFBF';
const RED = 'FFE53935';
const FALLBACK_FILL = 'FF22C55E';
// Text colors of the app's priority badge (Tailwind red/yellow/green-700).
const PRIORITY_ARGB: Record<Priority, string> = { high: 'FFB91C1C', medium: 'FFA16207', low: 'FF15803D' };

// ── Small pure helpers ────────────────────────────────────────────────────────

/**
 * Group order of the export. With `groupIds` (the app's display order): every
 * id must belong to the planning, and groups missing from the list follow in
 * custom order so nothing is dropped. Without it: sortGroups with `mode`.
 */
export function exportGroupOrder(groups: PlanningGroup[], items: PlanningItem[], tasks: Task[], mode: GroupSortMode, groupIds?: number[]): PlanningGroup[] {
  if (groupIds === undefined) return sortGroups(groups, items, tasks, mode);
  const byId = new Map(groups.map(g => [g.id, g]));
  const listed = new Set<number>();
  for (const id of groupIds) {
    if (!byId.has(id)) throw new PlanningError(400, `group ${id} does not belong to this planning`);
    if (listed.has(id)) throw new PlanningError(400, `group ${id} is listed twice`);
    listed.add(id);
  }
  const rest = sortGroups(groups.filter(g => !listed.has(g.id)), items, tasks, 'custom');
  return [...groupIds.map(id => byId.get(id)!), ...rest];
}

/** App colors are validated hex (#rgb, #rrggbb, #rrggbbaa) -> Excel ARGB. Anything else falls back to the default green. */
export function toArgb(color: string): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim())?.[1];
  if (!hex) return FALLBACK_FILL;
  if (hex.length === 3) return `FF${[...hex].map(c => c + c).join('')}`.toUpperCase();
  if (hex.length === 6) return `FF${hex}`.toUpperCase();
  return `${hex.slice(6)}${hex.slice(0, 6)}`.toUpperCase(); // #rrggbbaa -> aarrggbb
}

/** Sheet names: max 31 chars, none of []:*?/\ and no leading/trailing apostrophe. */
export function sheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').slice(0, 31).trim();
  return cleaned || 'Planning';
}

/** "<name> - YYYY-MM-DD.xlsx", safe on Windows/macOS/Linux. */
export function exportFileName(name: string, today: string): string {
  let base = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 150).trim();
  if (!base) base = 'Planning';
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = `Planning ${base}`;
  return `${base} - ${today}.xlsx`;
}

/** ISO-8601 week number of a Monday. */
function isoWeek(monday: string): number {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3); // Thursday decides the year
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

/** S-3, S-2, S-1, S, S+1… exactly as in the app. */
function countdown(monday: string, targetMonday: string): string {
  const diff = weeksBetween(targetMonday, monday);
  return diff === 0 ? 'S' : diff < 0 ? `S${diff}` : `S+${diff}`;
}

const dayMonth = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const dayMonthYear = (day: string) => `${dayMonth(day)}/${day.slice(0, 4)}`;

/** ExcelJS doesn't auto-size rows: estimate wrapped lines from the title length. */
function rowHeight(text: string, uppercase = false): number | undefined {
  // ~84 Calibri 11 characters fit a 70-wide column (fewer in bold capitals); rounding up keeps text visible.
  const perLine = Math.floor(TITLE_WIDTH * (uppercase ? 0.95 : 1.2));
  const lines = text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0);
  return lines > 1 ? lines * LINE_HEIGHT + 2 : undefined;
}

// ── Borders: one registry, higher priority wins on a shared edge ─────────────

type Side = 'top' | 'bottom' | 'left' | 'right';
interface Line { style: ExcelJS.BorderStyle; argb: string; priority: number }

class BorderRegistry {
  private cells = new Map<string, { row: number; col: number; sides: Partial<Record<Side, Line>> }>();
  private merges: { row: number; from: number; to: number }[] = [];
  constructor(private lastCol: number) {}

  /** Cells of a merged range share one style in ExcelJS: they get one combined border at apply time. */
  merged(row: number, from: number, to: number) {
    this.merges.push({ row, from, to });
  }

  set(row: number, col: number, side: Side, line: Line) {
    const key = `${row}:${col}`;
    const entry = this.cells.get(key) ?? { row, col, sides: {} };
    const current = entry.sides[side];
    if (!current || current.priority <= line.priority) entry.sides[side] = line;
    this.cells.set(key, entry);
  }
  /** Vertical line on the left edge of `col` (or the right edge of the last column). */
  vertical(col: number, fromRow: number, toRow: number, line: Line) {
    for (let row = fromRow; row <= toRow; row++) {
      if (col <= this.lastCol) this.set(row, col, 'left', line);
      else this.set(row, this.lastCol, 'right', line);
    }
  }
  apply(ws: ExcelJS.Worksheet) {
    const toBorder = (sides: Partial<Record<Side, Line>>) => {
      const border: Partial<ExcelJS.Borders> = {};
      for (const [side, line] of Object.entries(sides) as [Side, Line][]) if (line) border[side] = { style: line.style, color: { argb: line.argb } };
      return border;
    };
    const inMerge = new Set<string>();
    for (const { row, from, to } of this.merges) {
      const first = this.cells.get(`${row}:${from}`)?.sides ?? {};
      const last = this.cells.get(`${row}:${to}`)?.sides ?? {};
      ws.getCell(row, from).border = toBorder({ left: first.left, right: last.right, top: first.top, bottom: first.bottom });
      for (let c = from; c <= to; c++) inMerge.add(`${row}:${c}`);
    }
    for (const [key, { row, col, sides }] of this.cells) {
      if (!inMerge.has(key)) ws.getCell(row, col).border = toBorder(sides);
    }
  }
}

// ── Workbook ──────────────────────────────────────────────────────────────────

type BodyRow =
  | { kind: 'spacer' }
  | { kind: 'group'; group: PlanningGroup }
  | { kind: 'item'; item: PlanningItem; level: 0 | 1 };

export function buildPlanningWorkbook(
  planning: Planning, groups: PlanningGroup[], items: PlanningItem[], tasks: Task[], options: PlanningExportOptions,
): ExcelJS.Workbook {
  const t = TEXT[options.lang];
  const weekCount = planning.weekCount;
  const lastCol = FIRST_WEEK_COL + weekCount - 1;
  const mondays = Array.from({ length: weekCount }, (_, i) => addDays(planning.startDate, 7 * i));
  const weekIndex = (monday: string) => weeksBetween(planning.startDate, monday);

  // Rows in the app's order: root items, then each group with its items (everything expanded).
  const filtering = options.owner !== undefined || !options.includeDone;
  const keep = (item: PlanningItem) =>
    (options.owner === undefined || item.owner === options.owner) && (options.includeDone || !itemDone(tasks, item));
  const byOrder = <T extends { order: number }>(list: T[]) => [...list].sort((a, b) => a.order - b.order);
  const groupIds = new Set(groups.map(g => g.id));
  const body: BodyRow[] = byOrder(items.filter(i => i.groupId === null || !groupIds.has(i.groupId)))
    .filter(keep).map(item => ({ kind: 'item' as const, item, level: 0 as const }));
  // Groups in the order shown in the app (explicit ids, else the saved sort mode).
  const mode = planning.groupSortMode ?? 'custom';
  for (const group of exportGroupOrder(groups, items, tasks, mode, options.groupIds)) {
    const members = byOrder(items.filter(i => i.groupId === group.id)).filter(keep);
    if (filtering && members.length === 0) continue;
    body.push({ kind: 'spacer' }, { kind: 'group', group }, ...members.map(item => ({ kind: 'item' as const, item, level: 1 as const })));
  }
  const firstBodyRow = HEADER_ROWS + 1;
  const lastRow = Math.max(HEADER_ROWS, HEADER_ROWS + body.length);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'My Workspace';
  wb.created = new Date(`${options.today}T12:00:00Z`);
  const ws = wb.addWorksheet(sheetName(planning.name), {
    views: [{ state: 'frozen', xSplit: 3, ySplit: HEADER_ROWS, topLeftCell: 'D4', activeCell: 'D4', showGridLines: false }],
    properties: { outlineLevelRow: 1, outlineProperties: { summaryBelow: false, summaryRight: false } } as Partial<ExcelJS.WorksheetProperties>,
    pageSetup: {
      orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
      printTitlesRow: `1:${HEADER_ROWS}`, printTitlesColumn: 'A:C',
    },
  });

  // Columns
  const center: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };
  ws.getColumn(1).width = TITLE_WIDTH;
  ws.getColumn(1).alignment = { wrapText: true, vertical: 'middle' };
  ws.getColumn(2).width = 14;
  ws.getColumn(2).alignment = center;
  ws.getColumn(3).width = 11;
  ws.getColumn(3).alignment = center;
  ws.getColumn(3).numFmt = '0%';
  for (let c = 1; c <= lastCol; c++) ws.getColumn(c).font = { ...FONT };
  for (let c = FIRST_WEEK_COL; c <= lastCol; c++) {
    ws.getColumn(c).width = 7;
    ws.getColumn(c).alignment = center;
  }

  const cell = (row: number, col: number) => ws.getCell(row, col);
  const borders = new BorderRegistry(lastCol);
  const thinBlack: Line = { style: 'thin', argb: BLACK, priority: 2 };

  // Row 1: planning name + months merged over their weeks
  cell(1, 1).value = planning.name;
  cell(1, 1).font = { ...FONT, size: 14, bold: true };
  cell(1, 1).alignment = { vertical: 'middle' };
  ws.getRow(1).height = 22;
  const monthStarts: number[] = [];
  mondays.forEach((monday, i) => {
    if (i > 0 && mondays[i - 1].slice(0, 7) === monday.slice(0, 7)) return;
    monthStarts.push(i);
  });
  monthStarts.forEach((start, n) => {
    const end = (monthStarts[n + 1] ?? weekCount) - 1;
    const monday = mondays[start];
    const month = Number(monday.slice(5, 7)) - 1;
    // Year on the first month and on every January, like the app's header.
    const label = n === 0 || month === 0 ? `${t.months[month]} ${monday.slice(0, 4)}` : t.months[month];
    const col = FIRST_WEEK_COL + start;
    if (end > start) {
      ws.mergeCells(1, col, 1, FIRST_WEEK_COL + end);
      borders.merged(1, col, FIRST_WEEK_COL + end);
    }
    cell(1, col).value = label;
    cell(1, col).alignment = center;
    cell(1, col).font = { ...FONT, bold: true };
    for (let c = col; c <= FIRST_WEEK_COL + end; c++) {
      borders.set(1, c, 'top', thinBlack);
      borders.set(1, c, 'bottom', thinBlack);
    }
    // Month boundary: thin black from row 1 to the last row.
    borders.vertical(col, 1, lastRow, thinBlack);
  });
  borders.vertical(lastCol + 1, 1, 1, thinBlack);

  // Row 2: export date + Mondays
  cell(2, 1).value = `${t.exportedOn} ${dayMonthYear(options.today)}`;
  cell(2, 1).font = { ...FONT, size: 9, italic: true, color: { argb: GREY } };
  mondays.forEach((monday, i) => { cell(2, FIRST_WEEK_COL + i).value = dayMonth(monday); });

  // Row 3: column headers + countdown (with a target) or ISO week numbers
  const targetMonday = planning.targetDate ? mondayOf(planning.targetDate) : null;
  [t.title, t.owner, t.progress].forEach((label, i) => {
    cell(3, i + 1).value = label;
    cell(3, i + 1).font = { ...FONT, bold: true };
    cell(3, i + 1).alignment = i === 0 ? { vertical: 'middle' } : center;
  });
  mondays.forEach((monday, i) => {
    const c = cell(3, FIRST_WEEK_COL + i);
    c.value = targetMonday ? countdown(monday, targetMonday) : `W${isoWeek(monday)}`;
    if (targetMonday) c.font = { ...FONT, bold: true };
  });
  for (let c = 1; c <= lastCol; c++) borders.set(3, c, 'bottom', { style: 'medium', argb: GREY, priority: 3 });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: lastCol } };

  // Body
  const filled = new Set<string>();
  const tasksById = new Map(tasks.map(task => [task.id, task]));
  body.forEach((entry, index) => {
    const r = firstBodyRow + index;
    const row = ws.getRow(r);
    if (entry.kind === 'spacer') return;
    if (entry.kind === 'group') {
      const name = (entry.group.taskId !== null ? tasks.find(x => x.id === entry.group.taskId)?.title : undefined) ?? entry.group.name;
      row.getCell(1).value = name.toUpperCase();
      row.getCell(1).font = { ...FONT, bold: true };
      // Effective priority (live task's when linked), colored like the app's badge. No bar, no progress.
      const priority = effectiveGroupPriority(entry.group, tasksById);
      if (priority) {
        row.getCell(2).value = t.priorities[priority];
        row.getCell(2).font = { ...FONT, bold: true, color: { argb: PRIORITY_ARGB[priority] } };
      }
      const height = rowHeight(name, true);
      if (height) row.height = height;
      return;
    }
    const { item, level } = entry;
    const title = itemTitle(tasks, item);
    row.getCell(1).value = title;
    if (level === 1) {
      row.outlineLevel = 1;
      row.getCell(1).alignment = { wrapText: true, vertical: 'middle', indent: 1 };
    }
    row.getCell(2).value = item.owner ?? null;
    row.getCell(3).value = itemProgress(tasks, item) / 100;
    row.getCell(3).numFmt = '0%';
    const height = rowHeight(title);
    if (height) row.height = height;
    for (const segment of item.segments) {
      const from = Math.max(0, weekIndex(segment.start));
      const to = Math.min(weekCount - 1, weekIndex(segment.end));
      for (let w = from; w <= to; w++) {
        row.getCell(FIRST_WEEK_COL + w).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(segment.color) } };
        filled.add(`${r}:${w}`);
      }
    }
  });

  // Target week and highlighted weeks: light peach where no bar is drawn, plus header rows 2-3.
  const shaded = new Set([...planning.highlightedWeeks.map(weekIndex), ...(targetMonday ? [weekIndex(targetMonday)] : [])]
    .filter(w => w >= 0 && w < weekCount));
  for (const w of shaded) {
    for (let r = 2; r <= lastRow; r++) {
      if (filled.has(`${r}:${w}`)) continue;
      cell(r, FIRST_WEEK_COL + w).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PEACH } };
    }
  }

  // Fixed separators
  borders.vertical(2, HEADER_ROWS, lastRow, { style: 'thin', argb: LIGHT_GREY, priority: 1 });
  borders.vertical(3, HEADER_ROWS, lastRow, { style: 'thin', argb: LIGHT_GREY, priority: 1 });
  borders.vertical(FIRST_WEEK_COL, 1, lastRow, { style: 'medium', argb: GREY, priority: 3 });

  // Week of the export date: red outline from row 3 to the last row.
  const current = weekIndex(mondayOf(options.today));
  if (current >= 0 && current < weekCount) {
    const col = FIRST_WEEK_COL + current;
    const red: Line = { style: 'medium', argb: RED, priority: 4 };
    borders.vertical(col, HEADER_ROWS, lastRow, red);
    borders.vertical(col + 1, HEADER_ROWS, lastRow, red);
    borders.set(HEADER_ROWS, col, 'top', red);
    borders.set(lastRow, col, 'bottom', red);
  }
  borders.apply(ws);

  // Legend: two empty rows, then a title and one swatch per entry.
  const start = lastRow + 3;
  if (planning.legend.length) {
    cell(start, FIRST_WEEK_COL).value = t.legend;
    cell(start, FIRST_WEEK_COL).font = { ...FONT, bold: true };
    cell(start, FIRST_WEEK_COL).alignment = { vertical: 'middle' };
    planning.legend.forEach((entry, i) => {
      const r = start + 1 + i;
      cell(r, FIRST_WEEK_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(entry.color) } };
      ws.mergeCells(r, FIRST_WEEK_COL + 1, r, FIRST_WEEK_COL + 5);
      cell(r, FIRST_WEEK_COL + 1).value = entry.label;
      cell(r, FIRST_WEEK_COL + 1).alignment = { vertical: 'middle', horizontal: 'left' };
    });
  }
  // How the groups were ordered, just below the legend.
  const note = cell(planning.legend.length ? start + 1 + planning.legend.length : start, FIRST_WEEK_COL);
  note.value = `${t.sortedBy} ${t.modes[mode]}`;
  note.font = { ...FONT, size: 9, italic: true, color: { argb: GREY } };
  note.alignment = { vertical: 'middle', horizontal: 'left' };

  return wb;
}

// ── Writing ───────────────────────────────────────────────────────────────────

/**
 * ExcelJS 4.4 writes <pageSetUpPr> (fit to page) before <outlinePr> (summary
 * rows above) inside <sheetPr>. The schema requires tabColor, outlinePr,
 * pageSetUpPr in that order, and Excel refuses the whole file otherwise.
 */
export function fixSheetPrOrder(xml: string): string {
  return xml.replace(/<sheetPr([^>]*)>([\s\S]*?)<\/sheetPr>/, (whole, attrs: string, inner: string) => {
    const pick = (tag: string) => inner.match(new RegExp(`<${tag}\\b[^>]*?(?:/>|>[\\s\\S]*?</${tag}>)`))?.[0] ?? '';
    const ordered = pick('tabColor') + pick('outlinePr') + pick('pageSetUpPr');
    return ordered.length === inner.length ? `<sheetPr${attrs}>${ordered}</sheetPr>` : whole;
  });
}

/** The .xlsx bytes of a workbook built above, in a form Excel opens. */
export async function writePlanningXlsx(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await workbook.xlsx.writeBuffer() as ArrayBuffer);
  for (const name of Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))) {
    zip.file(name, fixSheetPrOrder(await zip.file(name)!.async('string')));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}


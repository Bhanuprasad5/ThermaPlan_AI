export type UploadKind = 'orders' | 'roster' | 'tariff';

export interface ColumnSpec {
  name: string;
  description: string;
}

export interface IssueGroup {
  column: string;
  problem: string;
  rows: number[];
}

export interface UploadCheck {
  kind: UploadKind;
  fileName: string;
  status: 'valid' | 'invalid' | 'reference';
  rowCount: number;
  columnCount: number;
  missingColumns: string[];
  renameHints: { found: string; expected: string }[];
  missingOptional: string[];
  fileErrors: string[];
  issues: IssueGroup[];
  problemCount: number;
  rows: Record<string, string>[];
}

interface UploadSchema {
  title: string;
  mandatory: ColumnSpec[];
  optional: ColumnSpec[];
  uniqueColumn?: string;
  checkRow: (row: Record<string, string>, report: (column: string, problem: string) => void) => void;
}

const LOAD_TAGS = ['fixed', 'shiftable', 'interruptible'];
const BOOLEAN_VALUES = ['true', 'false', '1', '0', 'yes', 'no'];
const MAX_SLOT_INDEX = 191;

const isBlank = (v: string | undefined) => v === undefined || v.trim() === '';
const isNumber = (v: string) => v.trim() !== '' && Number.isFinite(Number(v));
const isWholeNumber = (v: string) => isNumber(v) && Number.isInteger(Number(v));

function checkOptional(
  row: Record<string, string>,
  column: string,
  valid: (v: string) => boolean,
  problem: string,
  report: (column: string, problem: string) => void
) {
  const value = row[column];
  if (!isBlank(value) && !valid(value)) report(column, problem);
}

export const UPLOAD_SCHEMAS: Record<UploadKind, UploadSchema> = {
  orders: {
    title: 'Plant orders',
    mandatory: [
      { name: 'order_id', description: 'Order reference, for example ORD_AERO_01. Same id may repeat when routing_seq differs' },
      { name: 'job_name', description: 'Readable job description' },
      { name: 'machine_id', description: 'Machine that runs the job, for example FURNACE_1' },
      { name: 'station_id', description: 'Station the machine belongs to, for example FURNACE_BAY' },
      { name: 'duration_mins', description: 'Run time in whole minutes, greater than 0' },
      { name: 'kwh_per_op', description: 'Energy per operation in kWh, 0 or more' },
      { name: 'load_tag', description: 'fixed, shiftable or interruptible' },
      { name: 'due_slot', description: 'Deadline slot from 0 to 191 (15-minute slots over 48 hours)' },
    ],
    optional: [
      { name: 'routing_seq', description: 'Step order, defaults to 1' },
      { name: 'restart_kwh', description: 'Energy to restart, defaults to 0' },
      { name: 'splittable', description: 'true or false, defaults to false' },
      { name: 'is_critical_melt', description: 'true or false, defaults to false' },
    ],
    uniqueColumn: 'order_id',
    checkRow: (row, report) => {
      for (const col of ['order_id', 'job_name', 'machine_id', 'station_id', 'duration_mins', 'kwh_per_op', 'load_tag', 'due_slot']) {
        if (isBlank(row[col])) report(col, 'is empty');
      }
      if (!isBlank(row.duration_mins) && !(isWholeNumber(row.duration_mins) && Number(row.duration_mins) > 0)) {
        report('duration_mins', 'must be a whole number of minutes greater than 0');
      }
      if (!isBlank(row.kwh_per_op) && !(isNumber(row.kwh_per_op) && Number(row.kwh_per_op) >= 0)) {
        report('kwh_per_op', 'must be a number of 0 or more');
      }
      if (!isBlank(row.load_tag) && !LOAD_TAGS.includes(row.load_tag.trim().toLowerCase())) {
        report('load_tag', 'must be fixed, shiftable or interruptible');
      }
      if (!isBlank(row.due_slot) && !(isWholeNumber(row.due_slot) && Number(row.due_slot) >= 0 && Number(row.due_slot) <= MAX_SLOT_INDEX)) {
        report('due_slot', `must be a whole number from 0 to ${MAX_SLOT_INDEX}`);
      }
      checkOptional(row, 'routing_seq', (v) => isWholeNumber(v) && Number(v) >= 1, 'must be a whole number of 1 or more', report);
      checkOptional(row, 'restart_kwh', (v) => isNumber(v) && Number(v) >= 0, 'must be a number of 0 or more', report);
      checkOptional(row, 'splittable', (v) => BOOLEAN_VALUES.includes(v.trim().toLowerCase()), 'must be true or false', report);
      checkOptional(row, 'is_critical_melt', (v) => BOOLEAN_VALUES.includes(v.trim().toLowerCase()), 'must be true or false', report);
    },
  },
  roster: {
    title: 'Worker roster',
    mandatory: [
      { name: 'worker_id', description: 'Unique worker reference' },
      { name: 'full_name', description: 'Worker name shown on the tablet' },
      { name: 'assigned_station_id', description: 'Station the worker is on, for example st_furnace_1' },
      { name: 'assigned_machine_id', description: 'Machine the worker runs, for example FURNACE_1' },
      { name: 'heat_metabolic_class', description: 'ISO 7243 class 0 to 4, for example Class 3 (Heavy)' },
      { name: 'is_furnace_qualified', description: 'true or false' },
    ],
    optional: [
      { name: 'shift_schedule', description: 'Shift label, for example Shift 1 (06:00 - 14:00)' },
      { name: 'acclimatised_status', description: 'Acclimatisation note' },
      { name: 'role_title', description: 'Job title' },
      { name: 'phone_number', description: 'Contact number, masked on screen' },
    ],
    uniqueColumn: 'worker_id',
    checkRow: (row, report) => {
      for (const col of ['worker_id', 'full_name', 'assigned_station_id', 'assigned_machine_id', 'heat_metabolic_class', 'is_furnace_qualified']) {
        if (isBlank(row[col])) report(col, 'is empty');
      }
      if (!isBlank(row.heat_metabolic_class) && !/(^|class\s*)[0-4]\b/i.test(row.heat_metabolic_class.trim())) {
        report('heat_metabolic_class', 'must name a class from 0 to 4, for example Class 3 (Heavy)');
      }
      if (!isBlank(row.is_furnace_qualified) && !BOOLEAN_VALUES.includes(row.is_furnace_qualified.trim().toLowerCase())) {
        report('is_furnace_qualified', 'must be true or false');
      }
    },
  },
  tariff: {
    title: 'Electricity tariff',
    mandatory: [
      { name: 'slot_index', description: 'Slot from 0 to 191 (15-minute slots over 48 hours)' },
      { name: 'hour_of_day', description: 'Hour from 0 to 23' },
      { name: 'tariff_inr_per_kwh', description: 'Rate in rupees per kWh, greater than 0' },
    ],
    optional: [
      { name: 'tariff_tier', description: 'Tier label, for example STANDARD_HT1_BASE' },
      { name: 'time_window_ist', description: 'Clock time, for example 14:15' },
    ],
    uniqueColumn: 'slot_index',
    checkRow: (row, report) => {
      for (const col of ['slot_index', 'hour_of_day', 'tariff_inr_per_kwh']) {
        if (isBlank(row[col])) report(col, 'is empty');
      }
      if (!isBlank(row.slot_index) && !(isWholeNumber(row.slot_index) && Number(row.slot_index) >= 0 && Number(row.slot_index) <= MAX_SLOT_INDEX)) {
        report('slot_index', `must be a whole number from 0 to ${MAX_SLOT_INDEX}`);
      }
      if (!isBlank(row.hour_of_day) && !(isWholeNumber(row.hour_of_day) && Number(row.hour_of_day) >= 0 && Number(row.hour_of_day) <= 23)) {
        report('hour_of_day', 'must be a whole number from 0 to 23');
      }
      if (!isBlank(row.tariff_inr_per_kwh) && !(isNumber(row.tariff_inr_per_kwh) && Number(row.tariff_inr_per_kwh) > 0)) {
        report('tariff_inr_per_kwh', 'must be a number greater than 0');
      }
    },
  },
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function emptyCheck(kind: UploadKind, fileName: string): UploadCheck {
  return {
    kind,
    fileName,
    status: 'invalid',
    rowCount: 0,
    columnCount: 0,
    missingColumns: [],
    renameHints: [],
    missingOptional: [],
    fileErrors: [],
    issues: [],
    problemCount: 0,
    rows: [],
  };
}

function finalize(check: UploadCheck): UploadCheck {
  check.problemCount = check.fileErrors.length + check.missingColumns.length + check.issues.length;
  if (check.status !== 'reference') check.status = check.problemCount === 0 ? 'valid' : 'invalid';
  return check;
}

function guessOtherKind(kind: UploadKind, headers: string[]): UploadKind | null {
  const others = (Object.keys(UPLOAD_SCHEMAS) as UploadKind[]).filter((k) => k !== kind);
  for (const other of others) {
    const required = UPLOAD_SCHEMAS[other].mandatory.map((c) => c.name);
    const hits = required.filter((c) => headers.includes(c)).length;
    if (hits >= Math.ceil(required.length * 0.6)) return other;
  }
  return null;
}

export function isSpreadsheetWorkbook(fileName: string): boolean {
  return /\.(xlsx|xls|xlsm)$/i.test(fileName);
}

export function isReferenceDocument(fileName: string): boolean {
  return /\.(pdf|doc|docx|txt)$/i.test(fileName);
}

export function validateUpload(kind: UploadKind, fileName: string, text: string): UploadCheck {
  const schema = UPLOAD_SCHEMAS[kind];
  const check = emptyCheck(kind, fileName);

  if (kind === 'tariff' && isReferenceDocument(fileName)) {
    check.status = 'reference';
    return finalize(check);
  }

  if (isSpreadsheetWorkbook(fileName)) {
    check.fileErrors.push('Excel workbooks cannot be checked here. In Excel choose File > Save As > CSV UTF-8, then upload the .csv file.');
    return finalize(check);
  }

  const table = parseCsv(text);
  if (table.length === 0) {
    check.fileErrors.push('The file is empty.');
    return finalize(check);
  }

  const rawHeaders = table[0].map((h) => h.trim());
  const headers = rawHeaders.map((h) => h.toLowerCase());
  check.columnCount = headers.filter(Boolean).length;

  for (const spec of schema.mandatory) {
    if (headers.includes(spec.name)) continue;
    check.missingColumns.push(spec.name);
    const nearIdx = headers.findIndex((h) => h && squash(h) === squash(spec.name));
    if (nearIdx >= 0) check.renameHints.push({ found: rawHeaders[nearIdx], expected: spec.name });
  }
  check.missingOptional = schema.optional.map((c) => c.name).filter((c) => !headers.includes(c));

  if (check.missingColumns.length > 0) {
    const other = guessOtherKind(kind, headers);
    if (other) {
      check.fileErrors.push(`This looks like a ${UPLOAD_SCHEMAS[other].title.toLowerCase()} file. Upload it in the ${UPLOAD_SCHEMAS[other].title} card instead.`);
    }
  }

  const dataRows = table.slice(1);
  if (dataRows.length === 0) {
    check.fileErrors.push('The file has a header row but no data rows.');
    return finalize(check);
  }

  const rows = dataRows.map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) record[h] = (cells[i] ?? '').trim();
    });
    return record;
  });
  check.rows = rows;
  check.rowCount = rows.length;

  const groups = new Map<string, IssueGroup>();
  const missing = new Set(check.missingColumns);
  rows.forEach((row, idx) => {
    const sheetRow = idx + 2;
    schema.checkRow(row, (column, problem) => {
      if (missing.has(column)) return;
      const key = `${column}|${problem}`;
      const group = groups.get(key) ?? { column, problem, rows: [] };
      group.rows.push(sheetRow);
      groups.set(key, group);
    });
  });

  if (schema.uniqueColumn && !missing.has(schema.uniqueColumn)) {
    const seen = new Map<string, { display: string; rows: number[] }>();
    rows.forEach((row, idx) => {
      const value = row[schema.uniqueColumn!];
      if (isBlank(value)) return;
      const routing = kind === 'orders' ? (row.routing_seq || '1') : '';
      const key = routing ? `${value}|${routing}` : value;
      const display = routing && routing !== '1' ? `${value} (routing ${routing})` : value;
      const entry = seen.get(key) ?? { display, rows: [] };
      entry.rows.push(idx + 2);
      seen.set(key, entry);
    });
    for (const [key, entry] of seen) {
      if (entry.rows.length > 1) {
        groups.set(`dup|${key}`, {
          column: schema.uniqueColumn,
          problem: `has a duplicate value "${entry.display}"`,
          rows: entry.rows,
        });
      }
    }
  }

  check.issues = [...groups.values()];
  return finalize(check);
}

export function formatRows(rows: number[], limit = 6): string {
  const shown = rows.slice(0, limit).join(', ');
  const extra = rows.length - limit;
  const prefix = rows.length === 1 ? 'Row' : 'Rows';
  return extra > 0 ? `${prefix} ${shown} and ${extra} more` : `${prefix} ${shown}`;
}

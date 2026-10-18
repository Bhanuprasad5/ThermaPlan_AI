import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCsv, validateUpload, formatRows } from './uploadValidation';

const DATA_ROOT = resolve(process.cwd(), '..', 'teevra-backend', 'app', 'data');

const ORDERS_HEADER =
  'upload_batch_id,order_id,job_name,machine_id,station_id,routing_seq,duration_mins,duration_slots,kwh_per_op,restart_kwh,load_tag,splittable,due_slot,is_critical_melt';
const goodOrder = (id: string) => `B1,${id},Melt batch,FURNACE_1,FURNACE_BAY,1,180,12,461.3,122.9,fixed,False,42,True`;

const ROSTER_HEADER = 'worker_id,full_name,assigned_station_id,assigned_machine_id,heat_metabolic_class,is_furnace_qualified';

function readDayFile(sub: string, match: RegExp): { name: string; text: string }[] {
  return readdirSync(DATA_ROOT)
    .filter((d) => d.startsWith('Day '))
    .map((day) => {
      const dir = join(DATA_ROOT, day, sub);
      const name = readdirSync(dir).find((f) => match.test(f))!;
      return { name, text: readFileSync(join(dir, name), 'utf-8') };
    });
}

test('every shipped day package passes all three checks', () => {
  for (const f of readDayFile('Orders', /\.csv$/)) {
    const c = validateUpload('orders', f.name, f.text);
    assert.equal(c.status, 'valid', `${f.name}: ${JSON.stringify(c.issues)}`);
    assert.equal(c.rowCount, 45);
  }
  for (const f of readDayFile('Worker_Rosters', /\.csv$/)) {
    const c = validateUpload('roster', f.name, f.text);
    assert.equal(c.status, 'valid', `${f.name}: ${JSON.stringify(c.issues)}`);
    assert.ok(c.rowCount >= 255);
  }
  for (const f of readDayFile('Tariffs', /\.csv$/)) {
    const c = validateUpload('tariff', f.name, f.text);
    assert.equal(c.status, 'valid', `${f.name}: ${JSON.stringify(c.issues)}`);
    assert.equal(c.rowCount, 192);
  }
});

test('missing mandatory columns are named', () => {
  const header = ORDERS_HEADER.replace(',duration_mins', '').replace(',machine_id', '');
  const c = validateUpload('orders', 'orders.csv', `${header}\nB1,ORD_1,Melt,FURNACE_BAY,1,12,461.3,122.9,fixed,False,42,True`);
  assert.equal(c.status, 'invalid');
  assert.deepEqual(c.missingColumns, ['machine_id', 'duration_mins']);
});

test('an empty mandatory cell reports the spreadsheet row', () => {
  const bad = goodOrder('ORD_2').replace('FURNACE_1,', ',');
  const c = validateUpload('orders', 'orders.csv', [ORDERS_HEADER, goodOrder('ORD_1'), bad].join('\n'));
  assert.equal(c.status, 'invalid');
  assert.deepEqual(c.issues, [{ column: 'machine_id', problem: 'is empty', rows: [3] }]);
});

test('duplicate order ids and bad values are reported', () => {
  const badTag = goodOrder('ORD_2').replace(',fixed,', ',sometimes,');
  const badSlot = goodOrder('ORD_3').replace(',42,', ',400,');
  const c = validateUpload('orders', 'orders.csv', [ORDERS_HEADER, goodOrder('ORD_1'), goodOrder('ORD_1'), badTag, badSlot].join('\n'));
  const problems = c.issues.map((i) => `${i.column} ${i.problem} @${i.rows.join(',')}`);
  assert.ok(problems.includes('load_tag must be fixed, shiftable or interruptible @4'));
  assert.ok(problems.includes('due_slot must be a whole number from 0 to 191 @5'));
  assert.ok(problems.includes('order_id has a duplicate value "ORD_1" @2,3'));
});

test('renamed headers get a rename hint', () => {
  const header = ORDERS_HEADER.replace('order_id', 'Order ID');
  const c = validateUpload('orders', 'orders.csv', `${header}\n${goodOrder('ORD_1')}`);
  assert.deepEqual(c.renameHints, [{ found: 'Order ID', expected: 'order_id' }]);
});

test('a roster dropped in the orders card is recognised', () => {
  const c = validateUpload('orders', 'roster.csv', `${ROSTER_HEADER}\nW1,Ravi,st_furnace_1,FURNACE_1,Class 3 (Heavy),True`);
  assert.ok(c.fileErrors.some((e) => e.includes('worker roster')));
});

test('roster value checks', () => {
  const c = validateUpload('roster', 'roster.csv', `${ROSTER_HEADER}\nW1,Ravi,st_furnace_1,FURNACE_1,Heavy,maybe`);
  assert.deepEqual(
    c.issues.map((i) => i.column),
    ['heat_metabolic_class', 'is_furnace_qualified']
  );
});

test('empty, header-only and Excel files fail with a plain reason', () => {
  assert.deepEqual(validateUpload('orders', 'o.csv', '').fileErrors, ['The file is empty.']);
  assert.ok(validateUpload('orders', 'o.csv', ORDERS_HEADER).fileErrors.includes('The file has a header row but no data rows.'));
  assert.match(validateUpload('roster', 'r.xlsx', 'PK').fileErrors[0], /Save As > CSV UTF-8/);
});

test('a PDF in the tariff card is accepted as a reference document', () => {
  assert.equal(validateUpload('tariff', 'tariff_order.pdf', '%PDF').status, 'reference');
});

test('quoted cells with commas parse as one field', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y",2\r\n'), [['a', 'b'], ['x, y', '2']]);
});

test('row list formatting', () => {
  assert.equal(formatRows([4]), 'Row 4');
  assert.equal(formatRows([2, 3, 4, 5, 6, 7, 8, 9], 6), 'Rows 2, 3, 4, 5, 6, 7 and 2 more');
});

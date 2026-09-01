import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionalNotice, sheetLabel, todayIso } from '../src/sheets.ts';

test('sheetLabel counts from one, not from zero', () => {
  assert.equal(sheetLabel(0, 3), 'Sheet 1 of 3');
  assert.equal(sheetLabel(2, 3), 'Sheet 3 of 3');
});

test('sheetLabel takes the total it is given, so adding a sheet cannot make it lie', () => {
  assert.equal(sheetLabel(1, 4), 'Sheet 2 of 4');
});

test('provisionalNotice says nothing about a settled bill', () => {
  assert.equal(provisionalNotice(0), null);
});

test('provisionalNotice keeps its grammar for a single item', () => {
  assert.equal(provisionalNotice(1), 'Provisional — 1 item outstanding');
});

test('provisionalNotice pluralises beyond one', () => {
  assert.equal(provisionalNotice(4), 'Provisional — 4 items outstanding');
});

test('todayIso pads the month and day, so formatDate can split it', () => {
  assert.equal(todayIso(new Date(2026, 0, 5)), '2026-01-05');
});

test('todayIso reads the local date, not UTC', () => {
  // 31 August local, whatever the offset — a bill prepared in the evening in
  // Asia/Kolkata must not print tomorrow's date.
  assert.equal(todayIso(new Date(2026, 7, 31, 23, 30)), '2026-08-31');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { caretEdges, nextCell } from '../src/grid.ts';

// caretEdges — a number input exposes no caret, and must not be read as
// "caret parked in the middle", which is what silently disabled left/right.
test('caretEdges reads a real caret at the start of the value', () => {
  assert.deepEqual(caretEdges('1346', 0, 0), { atStart: true, atEnd: false });
});

test('caretEdges reads a real caret at the end of the value', () => {
  assert.deepEqual(caretEdges('1346', 4, 4), { atStart: false, atEnd: true });
});

test('caretEdges reads a caret in the middle as neither edge', () => {
  assert.deepEqual(caretEdges('1346', 2, 2), { atStart: false, atEnd: false });
});

test('caretEdges treats a control with no caret as sitting at both edges', () => {
  // input type=number: Chrome returns null, Firefox throws and the hook
  // passes null. Either way both arrows must move between cells.
  assert.deepEqual(caretEdges('1346', null, null), { atStart: true, atEnd: true });
});

test('caretEdges treats an empty value as both edges at once', () => {
  assert.deepEqual(caretEdges('', 0, 0), { atStart: true, atEnd: true });
});

// nextCell
const BOTH = { atStart: true, atEnd: true };
const MIDDLE = { atStart: false, atEnd: false };

test('nextCell moves down on ArrowDown', () => {
  assert.deepEqual(nextCell('ArrowDown', 2, 3, MIDDLE, true), { r: 3, c: 3 });
});

test('nextCell moves down on Enter, so a column can be filled without reaching for the mouse', () => {
  assert.deepEqual(nextCell('Enter', 2, 3, MIDDLE, true), { r: 3, c: 3 });
});

test('nextCell moves up on ArrowUp', () => {
  assert.deepEqual(nextCell('ArrowUp', 2, 3, MIDDLE, true), { r: 1, c: 3 });
});

test('nextCell moves left only once the caret has reached the start', () => {
  assert.equal(nextCell('ArrowLeft', 2, 3, MIDDLE, true), null);
  assert.deepEqual(nextCell('ArrowLeft', 2, 3, BOTH, true), { r: 2, c: 2 });
});

test('nextCell moves right only once the caret has reached the end', () => {
  assert.equal(nextCell('ArrowRight', 2, 3, MIDDLE, true), null);
  assert.deepEqual(nextCell('ArrowRight', 2, 3, BOTH, true), { r: 2, c: 4 });
});

test('nextCell leaves the vertical arrows to a select, which uses them to pick an option', () => {
  assert.equal(nextCell('ArrowDown', 2, 3, BOTH, false), null);
  assert.equal(nextCell('ArrowUp', 2, 3, BOTH, false), null);
});

test('nextCell still moves a select horizontally, and still leaves it on Enter', () => {
  assert.deepEqual(nextCell('ArrowRight', 2, 3, BOTH, false), { r: 2, c: 4 });
  assert.deepEqual(nextCell('Enter', 2, 3, BOTH, false), { r: 3, c: 3 });
});

test('nextCell ignores keys that are not navigation', () => {
  assert.equal(nextCell('a', 2, 3, BOTH, true), null);
  assert.equal(nextCell('Tab', 2, 3, BOTH, true), null);
});

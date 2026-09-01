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

/**
 * Claiming a key and landing on a cell are two different questions, and the
 * whole grid depends on them staying separate.
 *
 * At the edge of the grid nextCell still returns a move — an out-of-bounds one.
 * That non-null is the caller's signal that the key belongs to the grid and
 * must be swallowed. Teach nextCell about the bounds and return null here
 * instead, and ArrowUp on the top row falls through to the browser, where
 * `input type=number` answers it by stepping the figure: an operator moving up
 * a column silently wrote 0.01 into a rupee cell of a bill, and the debounced
 * save put it in the database.
 */
test('nextCell claims a vertical arrow at the edge of the grid, out of bounds and all', () => {
  assert.deepEqual(nextCell('ArrowUp', 0, 2, BOTH, true), { r: -1, c: 2 });
  assert.deepEqual(nextCell('ArrowDown', 5, 2, BOTH, true), { r: 6, c: 2 });
});

test('nextCell claims a horizontal arrow at the edge of the grid too', () => {
  assert.deepEqual(nextCell('ArrowLeft', 2, 0, BOTH, true), { r: 2, c: -1 });
  assert.deepEqual(nextCell('ArrowRight', 2, 3, BOTH, true), { r: 2, c: 4 });
});

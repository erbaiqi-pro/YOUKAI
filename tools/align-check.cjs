/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../com.youkai.toolbox/user_scripts/对齐对象.jsx'), 'utf8').replace(/^#.*$/gm, '');
let checks = 0;
let failures = 0;
function check(name, fn) {
  try { fn(); checks++; console.log('PASS align: ' + name); }
  catch (error) { failures++; console.error('FAIL align: ' + name + '\n' + error.message); }
}

// Model the problematic host behavior: a group's bounds and position include
// hidden children, while moving the group preserves every child's relative position.
function item(bounds, options = {}) {
  const node = {typename: 'PathItem', note: '', hidden: false, locked: false, moves: [], ...options};
  node.bounds = bounds && bounds.slice();
  if (node.children) {
    node.typename = 'GroupItem';
    node.pageItems = node.children.slice();
    node.children.forEach(child => { child.parent = node; });
  }
  Object.defineProperty(node, 'geometricBounds', {get() {
    if (!node.children) return node.bounds.slice();
    if (!node.children.length) return [0, 0, 0, 0];
    const all = node.children.map(child => child.geometricBounds);
    return [Math.min(...all.map(b => b[0])), Math.max(...all.map(b => b[1])), Math.max(...all.map(b => b[2])), Math.min(...all.map(b => b[3]))];
  }});
  function move(dx, dy) {
    if (node.children) node.children.forEach(child => child.moveWithParent(dx, dy));
    else node.bounds = [node.bounds[0] + dx, node.bounds[1] + dy, node.bounds[2] + dx, node.bounds[3] + dy];
  }
  node.moveWithParent = move;
  node.translate = (dx, dy) => {
    if (node.locked || node.failMove) throw Error('cannot move');
    node.moves.push([dx, dy]);
    move(dx, dy);
  };
  Object.defineProperty(node, 'position', {
    get() { const b = node.geometricBounds; return [b[0], b[1]]; },
    set(value) { const b = node.geometricBounds; node.translate(value[0] - b[0], value[1] - b[1]); }
  });
  return node;
}
function layer(items, options = {}) {
  const node = {typename: 'Layer', visible: true, layers: [], pageItems: items.slice(), ...options};
  items.forEach(child => { child.parent = node; });
  node.layers.forEach(child => { child.parent = node; });
  return node;
}
function run(layers) {
  const doc = {typename: 'Document', layers};
  layers.forEach(child => { child.parent = doc; });
  vm.runInNewContext(source, {app: {documents: [doc], activeDocument: doc}}, {timeout: 1000});
}
function fixture(command = 'Target 1 : CenterX') {
  const name = item([70, 30, 110, 10], {typename: 'TextFrame', name: '天天'});
  const marker = item([0, 60, 60, -20], {hidden: true, visibilityVariable: {name: '分路标'}});
  const target = item(null, {note: command, children: [marker, name]});
  const key = item([200, 100, 300, 0], {note: 'KEY'});
  const root = layer([target, key]);
  return {name, marker, target, key, root};
}

check('hidden variable marker is retained; visible name centers on fallback KEY', () => {
  const t = fixture();
  const binding = t.marker.visibilityVariable;
  run([t.root]);
  assert.deepEqual(t.name.bounds, [230, 30, 270, 10]);
  assert.deepEqual(t.marker.bounds, [160, 60, 220, -20]);
  assert.equal(t.marker.hidden, true);
  assert.equal(t.marker.visibilityVariable, binding);
  assert.equal(t.target.children.length, 2);
});
check('visible marker participates in whole-group alignment', () => {
  const t = fixture();
  t.marker.hidden = false;
  run([t.root]);
  assert.deepEqual(t.target.geometricBounds, [195, 60, 305, -20]);
  assert.deepEqual(t.name.bounds, [265, 30, 305, 10]);
});
check('visibility switches recalculate bounds; repeated execution stays in place', () => {
  const t = fixture();
  run([t.root]);
  t.marker.hidden = false;
  run([t.root]);
  assert.deepEqual(t.target.geometricBounds, [195, 60, 305, -20]);
  run([t.root]);
  assert.deepEqual(t.target.geometricBounds, [195, 60, 305, -20]);
  t.marker.hidden = true;
  run([t.root]);
  assert.deepEqual(t.name.bounds, [230, 30, 270, 10]);
});
check('nested hidden groups do not contribute their visible-flagged descendants', () => {
  const t = fixture();
  t.marker.hidden = false;
  const hidden = item(null, {hidden: true, children: [t.marker]});
  const inner = item(null, {children: [hidden, t.name]});
  const target = item(null, {note: 'target1:centerx', children: [inner]});
  run([layer([target, t.key])]);
  assert.deepEqual(t.name.bounds, [230, 30, 270, 10]);
  assert.deepEqual(t.marker.bounds, [160, 60, 220, -20]);
});
check('hidden children are excluded from KEY bounds too', () => {
  const t = fixture();
  t.key.note = '';
  const key = item(null, {note: 'key1', children: [t.key, item([900, 500, 1000, -100], {hidden: true})]});
  run([layer([t.target, key])]);
  assert.deepEqual(t.name.bounds, [230, 30, 270, 10]);
});
check('empty or fully hidden groups are skipped as targets and keys', () => {
  const t = fixture();
  t.name.hidden = true;
  const empty = item(null, {note: 'target:center', children: []});
  run([layer([t.target, empty, t.key])]);
  assert.deepEqual(t.target.moves, []);
  assert.deepEqual(empty.moves, []);
  t.name.hidden = false;
  t.key = item(null, {note: 'key', children: [item([200, 100, 300, 0], {hidden: true})]});
  run([layer([t.target, t.key])]);
  assert.deepEqual(t.target.moves, []);
});
for (const [command, expected] of [
  ['left,top', [200, 100, 240, 80]],
  ['right,bottom', [260, 20, 300, 0]],
  ['center', [230, 60, 270, 40]],
  ['centery', [70, 60, 110, 40]],
  ['左对齐,顶部对齐', [200, 100, 240, 80]],
  ['右对齐,底部对齐', [260, 20, 300, 0]],
  ['水平居中,垂直居中', [230, 60, 270, 40]]
]) {
  check('visible bounds for ' + command, () => {
    const t = fixture('target1:' + command);
    run([t.root]);
    assert.deepEqual(t.name.bounds, expected);
  });
}
check('hidden layers and hidden parents are not bypassed by flattened collections', () => {
  const t = fixture();
  const hiddenTarget = item([0, 10, 20, 0], {note: 'target:centerx'});
  const hiddenGroup = item(null, {hidden: true, children: [hiddenTarget]});
  const hiddenKey = item([1000, 100, 1100, 0], {note: 'key'});
  const hiddenLayer = layer([hiddenKey], {visible: false});
  const root = layer([t.target, t.key, hiddenGroup], {layers: [hiddenLayer]});
  root.pageItems.push(hiddenTarget, hiddenKey);
  t.target.pageItems.push(hiddenTarget);
  run([root]);
  assert.deepEqual(t.name.bounds, [230, 30, 270, 10]);
  assert.deepEqual(hiddenTarget.bounds, [0, 10, 20, 0]);
});
check('locked targets restore locks after success and failure; later targets still run', () => {
  const t = fixture();
  t.target.locked = true;
  const failed = item([0, 10, 20, 0], {note: 'target:centerx', locked: true, failMove: true});
  run([layer([failed, t.target, t.key])]);
  assert.equal(failed.locked, true);
  assert.equal(t.target.locked, true);
  assert.deepEqual(t.name.bounds, [230, 30, 270, 10]);
});
check('numbered keys remain independent, with unknown commands and missing keys skipped', () => {
  const a = item([0, 10, 20, 0], {note: 'target1:centerx'});
  const b = item([0, 10, 20, 0], {note: 'target2:centerx'});
  const missing = item([0, 10, 20, 0], {note: 'target3:centerx'});
  const unknown = item([0, 10, 20, 0], {note: 'target1:unknown'});
  run([layer([a, b, missing, unknown, item([200, 100, 300, 0], {note: 'key1'}), item([400, 100, 500, 0], {note: '基准2'})])]);
  assert.deepEqual(a.bounds, [240, 10, 260, 0]);
  assert.deepEqual(b.bounds, [440, 10, 460, 0]);
  assert.deepEqual(missing.bounds, [0, 10, 20, 0]);
  assert.deepEqual(unknown.bounds, [0, 10, 20, 0]);
});
check('no open document exits quietly', () => {
  vm.runInNewContext(source, {app: {documents: []}}, {timeout: 1000});
});
console.log(`${checks} alignment checks passed; ${failures} failed.`);
if (failures) process.exitCode = 1;

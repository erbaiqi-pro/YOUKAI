/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const script = path.join(__dirname, '../com.youkai.toolbox/user_scripts/画板净删.jsx');
const source = fs.readFileSync(script, 'utf8').replace(/^\uFEFF/, '').replace(/^#.*$/gm, '');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS artboard delete: ' + name); }

function node(type, options = {}) {
  const value = {name: '', hidden: false, visible: true, locked: false, pageItems: [], layers: [],
    pathItems: [], clipped: false, clipping: false, bounds: [10, 90, 50, 20], ...options};
  Object.defineProperty(value, 'typename', {get() {
    if (value.removed) throw Error('invalid host reference');
    return type;
  }});
  Object.defineProperty(value, 'visibleBounds', {get() {
    if (value.failBounds) throw Error('bounds unavailable');
    return value.bounds.slice();
  }});
  Object.defineProperty(value, 'geometricBounds', {get() { return value.bounds.slice(); }});
  for (const child of [...value.pageItems, ...value.layers, ...value.pathItems]) child.parent = value;
  value.remove = () => {
    if (value.failRemove) throw Error('host refused delete');
    for (let ancestor = value; ancestor && ancestor.typename !== 'Document'; ancestor = ancestor.parent) {
      if (ancestor.locked || ancestor.hidden || ancestor.visible === false) throw Error('inaccessible ancestor');
    }
    function erase(item) {
      if (item.locked) throw Error('locked descendant');
      for (const child of [...item.pageItems, ...item.pathItems]) erase(child);
      item.removed = true;
    }
    erase(value);
    const collection = type === 'Layer' ? value.parent.layers : value.parent.pageItems;
    collection.splice(collection.indexOf(value), 1);
  };
  return value;
}
function item(bounds, options = {}) { return node('PathItem', {bounds, ...options}); }
function group(children, options = {}) { return node('GroupItem', {pageItems: children, ...options}); }
function layer(items = [], options = {}) { return node('Layer', {pageItems: items, ...options}); }
function document(layers, count = 12) {
  const doc = {typename: 'Document', layers};
  for (const entry of layers) entry.parent = doc;
  doc.artboards = Array.from({length: count}, (_, i) => ({number: i + 1, name: '重名', artboardRect: [150 * i, 100, 150 * i + 100, 0]}));
  doc.artboards.deleted = [];
  doc.artboards.active = 10;
  doc.artboards.getActiveArtboardIndex = () => doc.artboards.active;
  doc.artboards.setActiveArtboardIndex = index => {
    assert.ok(index >= 0 && index < doc.artboards.length);
    doc.artboards.active = index;
  };
  doc.artboards.remove = index => {
    assert.ok(doc.artboards.length > 1 && index >= 0 && index < doc.artboards.length);
    doc.artboards.deleted.push(doc.artboards[index].number);
    doc.artboards.splice(index, 1);
  };
  return doc;
}
function run(doc, csv = '\uFEFF画板编号\r\n11\r\n12\r\n', options = {}) {
  const reads = [];
  function File(name) {
    this.fsName = String(name);
    this.parent = {fsName: '/scripts'};
    this.exists = options.missing ? this.fsName.startsWith('/user/') : true;
    this.open = mode => { reads.push(this.fsName); if (options.onRead) options.onRead(this.fsName); return !options.unreadable; };
    this.read = () => { assert.equal(this.encoding, 'UTF-8'); return csv; };
    this.close = () => {};
  }
  const ctx = {app: {name: options.host || 'Adobe Illustrator', documents: options.noDocument ? [] : [doc], activeDocument: doc},
    File, Folder: {userData: '/user', myDocuments: '/documents'},
    $: {global: options.standalone ? {} : {YOUKAI_CSV_FOLDER: '/configured'}, fileName: script}};
  return vm.runInNewContext(source, ctx, {filename: script, timeout: 3000});
}
function unchanged(doc, fn, pattern) {
  const count = doc.artboards.length;
  const root = doc.layers[0], items = root.pageItems.slice();
  const state = [root.visible, root.locked, ...items.flatMap(x => [x.hidden, x.locked])];
  assert.throws(fn, pattern);
  assert.equal(doc.artboards.length, count);
  assert.deepEqual(root.pageItems, items);
  assert.deepEqual([root.visible, root.locked, ...items.flatMap(x => [x.hidden, x.locked])], state);
}

check('original 11 and 12 are deleted in descending order despite duplicate names', () => {
  const eleven = item([1510, 90, 1550, 20]), twelve = item([1660, 90, 1700, 20]);
  const keep = item([10, 90, 50, 20]);
  const root = layer([keep, eleven, twelve]), doc = document([root]);
  const result = run(doc);
  assert.deepEqual(doc.artboards.deleted, [12, 11]);
  assert.deepEqual(root.pageItems, [keep]);
  assert.equal(result.removedItemsOrGroups, 2);
  assert.equal(doc.artboards.active, 9);
});
check('hidden, locked nested layers and objects are cleaned and survivor states restored', () => {
  const target = item([1510, 90, 1550, 20], {hidden: true, locked: true});
  const keep = item([10, 90, 50, 20], {hidden: true, locked: true, visibilityVariable: {name: '变量'}});
  const nested = layer([target, keep], {visible: false, locked: true});
  const root = layer([], {visible: false, locked: true, layers: [nested]});
  run(document([root]));
  assert.equal(target.removed, true);
  assert.deepEqual(nested.pageItems, [keep]);
  assert.equal(root.visible, false); assert.equal(root.locked, true);
  assert.equal(nested.visible, false); assert.equal(nested.locked, true);
  assert.equal(keep.hidden, true); assert.equal(keep.locked, true);
  assert.equal(keep.visibilityVariable.name, '变量');
});
check('the reported 正面四色/羽毛光刻/不动/相片元素 chain is removed from inside out', () => {
  const photo = layer([item([1510, 90, 1550, 20], {hidden: true, locked: true})], {name: '相片元素', visible: false, locked: true});
  const fixed = layer([], {name: '不动', visible: false, locked: true, layers: [photo]});
  const feather = layer([], {name: '羽毛光刻', visible: false, locked: true, layers: [fixed]});
  const keepItem = item([10, 90, 50, 20], {hidden: true, locked: true, visibilityVariable: {name: '保留变量'}});
  const keep = layer([keepItem], {name: '素面镭射', visible: false, locked: true});
  const root = layer([], {name: '正面四色', visible: false, locked: true, layers: [keep, feather]});
  const order = [];
  for (const entry of [photo, fixed, feather]) {
    const remove = entry.remove;
    entry.remove = () => { remove(); order.push(entry.name); };
  }
  const doc = document([root]), result = run(doc);
  assert.deepEqual(order, ['相片元素', '不动', '羽毛光刻']);
  assert.deepEqual(root.layers, [keep]);
  assert.equal(root.removed, undefined);
  assert.equal(root.visible, false); assert.equal(root.locked, true);
  assert.equal(keep.visible, false); assert.equal(keep.locked, true);
  assert.equal(keepItem.hidden, true); assert.equal(keepItem.locked, true);
  assert.equal(keepItem.visibilityVariable.name, '保留变量');
  assert.equal(result.removedEmptySublayers, 3);
  assert.deepEqual(doc.artboards.deleted, [12, 11]);
});
check('originally empty sublayers are preserved beside branches emptied by this deletion', () => {
  const originalEmpty = layer([], {name: '相片元素', visible: false, locked: true});
  const target = layer([item([1510, 90, 1550, 20])], {name: '相片元素'});
  const root = layer([], {layers: [originalEmpty, target]});
  const result = run(document([root]));
  assert.deepEqual(root.layers, [originalEmpty]);
  assert.equal(originalEmpty.removed, undefined);
  assert.equal(originalEmpty.visible, false); assert.equal(originalEmpty.locked, true);
  assert.equal(result.removedEmptySublayers, 1);
});
check('hidden surviving artwork prevents its layer and ancestors from being treated as empty', () => {
  const keep = item([10, 90, 50, 20], {hidden: true, locked: true});
  const photo = layer([keep, item([1510, 90, 1550, 20])], {name: '相片元素', visible: false, locked: true});
  const feather = layer([], {name: '羽毛光刻', layers: [photo]});
  const root = layer([], {layers: [feather]});
  const result = run(document([root]));
  assert.deepEqual(root.layers, [feather]); assert.deepEqual(feather.layers, [photo]);
  assert.deepEqual(photo.pageItems, [keep]);
  assert.equal(photo.visible, false); assert.equal(photo.locked, true);
  assert.equal(result.removedEmptySublayers, 0);
});
check('an empty target artboard does not trigger global empty-layer cleanup', () => {
  const emptyChild = layer([], {visible: false, locked: true});
  const emptyParent = layer([], {layers: [emptyChild], visible: false, locked: true});
  const root = layer([], {layers: [emptyParent]});
  const result = run(document([root]));
  assert.deepEqual(root.layers, [emptyParent]);
  assert.deepEqual(emptyParent.layers, [emptyChild]);
  assert.equal(emptyParent.visible, false); assert.equal(emptyParent.locked, true);
  assert.equal(emptyChild.visible, false); assert.equal(emptyChild.locked, true);
  assert.equal(result.removedEmptySublayers, 0);
});
check('an existing empty child keeps its parent structure after sibling artwork is deleted', () => {
  const empty = layer([], {name: '预留'});
  const branch = layer([item([1510, 90, 1550, 20])], {layers: [empty]});
  const root = layer([], {layers: [branch]});
  const result = run(document([root]));
  assert.deepEqual(root.layers, [branch]); assert.deepEqual(branch.layers, [empty]);
  assert.equal(branch.pageItems.length, 0);
  assert.equal(result.removedEmptySublayers, 0);
});
check('top-level layers remain even when all their artwork and sublayers are removed', () => {
  const nested = layer([item([1510, 90, 1550, 20])]);
  const root = layer([], {name: '正面四色', layers: [nested], visible: false, locked: true});
  const originalTop = layer([], {name: '预留顶层'});
  const doc = document([root, originalTop]), result = run(doc);
  assert.deepEqual(doc.layers, [root, originalTop]);
  assert.deepEqual(root.layers, []); assert.deepEqual(root.pageItems, []);
  assert.equal(root.visible, false); assert.equal(root.locked, true);
  assert.equal(result.removedEmptySublayers, 1);
});
check('multiple sibling sublayers with identical names are removed without skipping indices', () => {
  const first = layer([item([1510, 90, 1550, 20])], {name: '相片元素'});
  const second = layer([item([1660, 90, 1700, 20])], {name: '相片元素'});
  const root = layer([], {layers: [first, second]});
  const result = run(document([root]));
  assert.deepEqual(root.layers, []);
  assert.equal(first.removed, true); assert.equal(second.removed, true);
  assert.equal(result.removedEmptySublayers, 2);
});
check('a sublayer removal failure is reported, retains boards and restores surviving layer states', () => {
  const photo = layer([item([1510, 90, 1550, 20])], {name: '相片元素', failRemove: true, visible: false, locked: true});
  const root = layer([], {layers: [photo], visible: false, locked: true});
  const doc = document([root]);
  assert.throws(() => run(doc), /执行中止.*host refused delete.*已删除 1 个对象或编组、0 个画板、0 个空子图层/);
  assert.deepEqual(root.layers, [photo]); assert.deepEqual(photo.pageItems, []);
  assert.equal(root.visible, false); assert.equal(root.locked, true);
  assert.equal(photo.visible, false); assert.equal(photo.locked, true);
  assert.equal(doc.artboards.length, 12);
});
check('partial sublayer cleanup reports the completed count without removing later artwork', () => {
  const first = layer([item([1510, 90, 1550, 20])], {visible: false, locked: true});
  const second = layer([item([1660, 90, 1700, 20])], {failRemove: true, visible: false, locked: true});
  const keep = layer([item([10, 90, 50, 20])], {visible: false, locked: true});
  const root = layer([], {layers: [first, second, keep], visible: false, locked: true});
  const doc = document([root]);
  assert.throws(() => run(doc), /已删除 2 个对象或编组、0 个画板、1 个空子图层/);
  assert.deepEqual(root.layers, [second, keep]);
  assert.equal(first.removed, true);
  assert.equal(second.visible, false); assert.equal(second.locked, true);
  assert.equal(keep.pageItems.length, 1);
  assert.equal(keep.visible, false); assert.equal(keep.locked, true);
  assert.equal(root.visible, false); assert.equal(root.locked, true);
  assert.equal(doc.artboards.length, 12);
});
check('a group shared by several artboards is traversed without deleting its survivors', () => {
  const keep = item([10, 90, 50, 20]), target = item([1510, 90, 1550, 20]);
  const shared = group([keep, group([target], {locked: true})], {hidden: true, locked: true});
  run(document([layer([shared])]));
  assert.deepEqual(shared.pageItems, [keep]);
  assert.equal(shared.hidden, true); assert.equal(shared.locked, true);
});
check('a large group enclosing an empty target does not count as artwork on it', () => {
  const shared = group([item([10, 90, 50, 20]), item([1810, 90, 1850, 20])], {bounds: [10, 90, 1850, 20]});
  run(document([layer([shared])], 13));
  assert.equal(shared.pageItems.length, 2);
  assert.equal(shared.removed, undefined);
});
check('flattened layer collections do not delete nested objects twice', () => {
  const target = item([1510, 90, 1550, 20]);
  const wrapper = group([target]);
  const root = layer([wrapper]);
  root.pageItems.push(target); // host collection includes a descendant; its parent stays the group
  const result = run(document([root]));
  assert.equal(result.removedItemsOrGroups, 1);
  assert.equal(target.removed, true);
});
check('unrelated hidden variable objects are never temporarily shown', () => {
  const keep = item([10, 90, 50, 20], {hidden: true});
  Object.defineProperty(keep, 'hidden', {get: () => true, set() { throw Error('unrelated item touched'); }});
  const target = item([1510, 90, 1550, 20]);
  run(document([layer([keep, target])]));
  assert.equal(keep.removed, undefined);
  assert.equal(target.removed, true);
});
check('clipped artwork on another board ignores the image outside its mask', () => {
  const mask = item([10, 90, 50, 20], {clipping: true});
  const picture = item([10, 100, 1750, 0], {typename: 'PlacedItem'});
  const clipped = group([mask, picture], {clipped: true});
  run(document([layer([clipped])]));
  assert.equal(clipped.removed, undefined);
  assert.equal(picture.removed, undefined);
});
check('a targeted clipping group removes all contents including outside and hidden material', () => {
  const mask = item([1510, 90, 1550, 20], {clipping: true});
  const picture = item([10, 100, 1750, 0], {hidden: true, locked: true});
  const clipped = group([mask, picture], {clipped: true, locked: true, hidden: true});
  const root = layer([clipped]);
  run(document([root]));
  assert.equal(root.pageItems.length, 0);
  assert.equal(picture.removed, true);
});
check('compound clipping masks and locked compound children are supported', () => {
  const mask = node('CompoundPathItem', {bounds: [1510, 90, 1550, 20], pathItems: [item([1510, 90, 1550, 20], {clipping: true, locked: true})]});
  const clipped = group([mask, item([0, 100, 1750, 0])], {clipped: true});
  const root = layer([clipped]);
  run(document([root]));
  assert.equal(root.pageItems.length, 0);
});
check('edge-only contact is retained; partial overlap and zero-width guides are removed', () => {
  const touch = item([1490, 90, 1500, 20]), cross = item([1490, 90, 1501, 20]);
  const guide = item([1510, 90, 1510, 20]), outside = item([1400, 150, 1450, 110]);
  const root = layer([touch, cross, guide, outside]);
  run(document([root]));
  assert.deepEqual(root.pageItems, [touch, outside]);
});
check('repeated and unordered indices, quoted cells, BOM and empty trailing columns work', () => {
  const doc = document([layer()]);
  run(doc, '\uFEFF"画板编号",\r\n"12",\r\n11,""\r\n12,\r\n\r\n');
  assert.deepEqual(doc.artboards.deleted, [12, 11]);
});
check('headerless CSV and CR line endings work', () => {
  const doc = document([layer()]);
  run(doc, '11\r12\r');
  assert.deepEqual(doc.artboards.deleted, [12, 11]);
});
for (const [name, csv] of [
  ['empty list', '画板编号\n\n'], ['out-of-range index', '画板编号\n11\n13'],
  ['zero index', '画板编号\n0'], ['negative index', '画板编号\n-1'],
  ['fractional index', '画板编号\n11.5'], ['artboard name', '画板编号\n正面'],
  ['multiple data columns', '画板编号\n11,12'], ['range', '画板编号\n11-12']
]) check(name + ' fails before any mutation', () => {
  const doc = document([layer([item([1510, 90, 1550, 20], {hidden: true})], {locked: true, visible: false})]);
  unchanged(doc, () => run(doc, csv), /画板净删/);
});
check('deleting every board is rejected before exposing or deleting artwork', () => {
  const doc = document([layer([item([1510, 90, 1550, 20])], {locked: true, visible: false})]);
  unchanged(doc, () => run(doc, Array.from({length: 12}, (_, i) => i + 1).join('\n')), /至少需要保留/);
});
check('the configured CSV folder never falls through to a stale list', () => {
  const doc = document([layer([], {visible: false})]);
  unchanged(doc, () => run(doc, '11', {missing: true}), /未找到配置表格/);
});
check('unreadable CSV fails without modifying the document', () => {
  const doc = document([layer()]);
  unchanged(doc, () => run(doc, '11', {unreadable: true}), /无法读取/);
});
check('standalone scripts prefer the CSV delivered beside the script', () => {
  let readPath;
  run(document([layer()]), '11', {standalone: true, onRead(value) {readPath = value;}});
  assert.equal(readPath, '/scripts/画板净删.csv');
});
check('a bounds error is detected before any modification', () => {
  const doc = document([layer([item([1510, 90, 1550, 20], {failBounds: true})], {locked: true, visible: false})]);
  unchanged(doc, () => run(doc), /bounds unavailable/);
});
check('a host removal failure restores states, keeps boards and reaches the batch error handler', () => {
  const target = item([1510, 90, 1550, 20], {hidden: true, locked: true, failRemove: true});
  const root = layer([target], {locked: true, visible: false});
  const doc = document([root]);
  unchanged(doc, () => run(doc), /执行中止.*host refused delete/);
});
check('a preparation error restores changed states before any target is deleted', () => {
  const target = item([1510, 90, 1550, 20], {hidden: true, locked: true});
  Object.defineProperty(target, 'hidden', {get: () => true, set() { throw Error('cannot show target'); }});
  const root = layer([target], {locked: true, visible: false}), doc = document([root]);
  unchanged(doc, () => run(doc), /执行中止.*cannot show target/);
});
check('a partial host failure is reported with completed counts and states restored', () => {
  const first = item([1510, 90, 1550, 20]), second = item([1660, 90, 1700, 20], {hidden: true, failRemove: true});
  const root = layer([first, second], {locked: true, visible: false}), doc = document([root]);
  assert.throws(() => run(doc), /已删除 1 个对象或编组、0 个画板/);
  assert.deepEqual(root.pageItems, [second]);
  assert.equal(second.hidden, true); assert.equal(root.visible, false); assert.equal(root.locked, true);
  assert.equal(doc.artboards.length, 12);
});
check('an unsupported host and a missing document are reported', () => {
  assert.throws(() => run(document([layer()]), '11', {host: 'Adobe Photoshop'}), /请在 Illustrator/);
  assert.throws(() => run(document([layer()]), '11', {noDocument: true}), /请先打开/);
});
check('template is UTF-8 BOM and points to 11 and 12', () => {
  const content = fs.readFileSync(path.join(__dirname, '../com.youkai.toolbox/assets/templates/画板净删.csv'), 'utf8');
  assert.equal(content.charCodeAt(0), 0xfeff);
  assert.deepEqual(content.trim().split(/\r?\n/), ['画板编号', '11', '12']);
});
console.log(`${checks} artboard deletion checks passed.`);

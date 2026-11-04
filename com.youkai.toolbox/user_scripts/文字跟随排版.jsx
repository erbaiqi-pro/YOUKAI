#target illustrator
/* 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/* 文字跟随排版 v0.3 测试版：用原生对象边界测量，不转曲；顺序和间距保存在对象注释中。 */
(function () {
    var TAG = "[[YOUKAI_FOLLOW_V3|", EPS = 0.0001, TOLERANCE = 0.15;
    var doc = null, oldCoordinates, oldActiveLayer, yFactor = 1;
    var selected = [], selectionCaptured = false;
    var batch = typeof $ !== "undefined" && $.global && $.global.YOUKAI_BATCH === true;
    function errorText(e) { return e && e.message ? e.message : String(e); }
    function typeOf(item) { return item ? String(item.typename || "") : ""; }
    function isText(item) { var type = typeOf(item); return type === "TextFrame" || type === "TextFrameItem"; }
    function sameItem(a, b) {
        if (a === b) return true;
        if (!a || !b) return false;
        // 宿主可能为同一 AI 对象返回不同的 JS 包装，不能只比较 JS 引用。
        try { if (a == b) return true; } catch (compareError) {}
        try {
            var aID = a.uuid, bID = b.uuid;
            if (typeof aID === "string" && aID && typeof bID === "string" && bID && typeOf(a) === typeOf(b)) return aID === bID;
        } catch (noUUID) {}
        return false;
    }
    function contains(list, item) { for (var i = 0; i < list.length; i += 1) if (sameItem(list[i], item)) return true; return false; }
    function captureSelection(value) {
        if (!value) return;
        var type = typeOf(value);
        if (type === "TextRange" || type === "InsertionPoint") {
            if (!batch) throw new Error("请退出文字编辑状态，用选择工具选中文本或编组。");
            return;
        }
        // 按集合长度读取，不能因集合自身有 typename 就跳过全部选中对象。
        if (type === "GroupItem" || isText(value) || type === "Layer" || (type && type !== "Array" && type !== "PageItems" && typeof value.translate === "function")) selected.push(value);
        else if (typeof value.length === "number") {
            for (var i = 0; i < value.length; i += 1) if (value[i]) {
                var childType = typeOf(value[i]);
                if (childType === "TextRange" || childType === "InsertionPoint") {
                    if (!batch) throw new Error("请退出文字编辑状态，用选择工具选中文本或编组。");
                } else if (!contains(selected, value[i])) selected.push(value[i]);
            }
        }
    }
    function restoreSelection() {
        if (!doc || !selectionCaptured) return;
        try {
            doc.selection = null;
            for (var i = 0; i < selected.length; i += 1) selected[i].selected = true;
        } catch (selectionError) {}
    }

    function objectName(item) {
        var name = String(item.name || "").replace(/[\r\n\u0003]/g, " ");
        if (!name.replace(/[\s\u3000]/g, "") && isText(item)) name = String(item.contents || "").replace(/[\r\n\u0003]/g, " ");
        if (!name.replace(/[\s\u3000]/g, "")) {
            var type = typeOf(item);
            name = type === "GroupItem" ? "未命名编组" : type === "PlacedItem" || type === "RasterItem" ? "未命名图片" : "未命名对象";
        }
        return name;
    }
    function hasRecord(item) { return String(item.note || "").indexOf(TAG) >= 0; }
    function stripRecord(note) { return String(note || "").replace(/\n?\[\[YOUKAI_FOLLOW_V[23]\|[^\]\r\n]*(?:\]\]|$)/g, ""); }
    function numberValue(value) {
        if (!/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(String(value))) throw new Error("跟随间距记录无效，请重新记录。");
        var n = Number(value);
        if (!isFinite(n) || Math.abs(n) > 100000000) throw new Error("跟随间距超出范围，请重新记录。");
        return n;
    }
    function readRecord(item) {
        var note = String(item.note || ""), pattern = /\[\[YOUKAI_FOLLOW_V3\|([^\]\r\n]*)\]\]/g, match, fields = null, count = 0;
        while ((match = pattern.exec(note))) { fields = match[1].split("|"); count += 1; }
        if (!count && note.indexOf(TAG) < 0) return null;
        if (count !== 1 || fields.length !== 5 || !/^[A-Za-z0-9_-]{6,80}$/.test(fields[0]) || !/^\d+$/.test(fields[1]) || !/^\d+$/.test(fields[2])) throw new Error("跟随记录损坏，请选中整条关系的对象重新记录。");
        var index = Number(fields[1]), total = Number(fields[2]);
        if (total < 2 || index >= total || total > 1000000) throw new Error("跟随顺序记录无效，请重新记录。");
        return { item: item, id: fields[0], index: index, total: total, gap: numberValue(fields[3]), x: numberValue(fields[4]) };
    }
    function allRecords() {
        var result = { entries: [], errors: [] }, seen = [], items = doc.pageItems;
        for (var i = 0; i < items.length; i += 1) {
            var item = items[i];
            if (typeOf(item) === "Layer" || contains(seen, item)) continue;
            seen.push(item);
            if (!hasRecord(item)) continue;
            try { var record = readRecord(item); if (record) result.entries.push(record); }
            catch (e) { result.errors.push(objectName(item) + "：" + errorText(e)); }
        }
        return result;
    }
    function within(item, ancestor) {
        var parent = item.parent;
        while (parent && typeOf(parent) !== "Document") {
            if (sameItem(parent, ancestor)) return true;
            parent = parent.parent;
        }
        return false;
    }
    function entryFor(item, entries) { for (var i = 0; i < entries.length; i += 1) if (sameItem(item, entries[i].item)) return entries[i]; return null; }
    function ordered(entries, total) {
        if (entries.length !== total) return null;
        var result = [], i;
        for (i = 0; i < total; i += 1) result.push(null);
        for (i = 0; i < entries.length; i += 1) {
            var entry = entries[i];
            if (entry.total !== total || result[entry.index]) return null;
            result[entry.index] = entry;
        }
        return result;
    }
    function resolveChain(entry, entries) {
        var bucket = [], i;
        for (i = 0; i < entries.length; i += 1) if (entries[i].id === entry.id) bucket.push(entries[i]);
        var result = ordered(bucket, entry.total);
        if (result) return result;
        // 整组复制会保留备注：按所在编组分别解析，绝不靠同名文字拼接不同关系。
        var parent = entry.item.parent;
        while (parent && typeOf(parent) !== "Document") {
            var local = [];
            for (i = 0; i < bucket.length; i += 1) if (within(bucket[i].item, parent)) local.push(bucket[i]);
            result = ordered(local, entry.total);
            if (result) return result;
            parent = parent.parent;
        }
        throw new Error("关系中的对象缺失或重复。请选中需要跟随的对象重新记录。");
    }
    function chainItems(chain) { var items = []; for (var i = 0; i < chain.length; i += 1) items.push(chain[i].item); return items; }
    function prune(items) {
        var result = [];
        for (var i = 0; i < items.length; i += 1) {
            var skip = false;
            for (var j = 0; j < items.length; j += 1) if (i !== j && within(items[i], items[j])) { skip = true; break; }
            if (!skip && !contains(result, items[i])) result.push(items[i]);
        }
        return result;
    }
    function directItems(group) {
        var result = [], items = group.pageItems;
        for (var i = 0; i < items.length; i += 1) if (sameItem(items[i].parent, group) && items[i].guides !== true && !contains(result, items[i])) result.push(items[i]);
        return result;
    }
    function selectedItems(records) {
        var result = prune(selected);
        if (result.length === 1 && hasRecord(result[0])) {
            var entry = entryFor(result[0], records.entries);
            if (entry) return chainItems(resolveChain(entry, records.entries));
        }
        while (result.length === 1 && typeOf(result[0]) === "GroupItem") result = directItems(result[0]);
        if (result.length < 2) throw new Error("请用选择工具选中至少两个对象；也可以选中包含它们的编组。");
        for (var i = 0; i < result.length; i += 1) {
            var type = typeOf(result[i]);
            if (type === "Layer" || type === "Document" || typeof result[i].translate !== "function") throw new Error("请选择画面中的文字、图形或编组。");
            if (result[i].guides === true) throw new Error("参考线不能用于跟随排版。");
        }
        return result;
    }
    function matchingChain(items, entries) {
        var first = entryFor(items[0], entries);
        if (!first) return null;
        var chain;
        try { chain = resolveChain(first, entries); } catch (e) { return null; }
        if (chain.length !== items.length) return null;
        var members = chainItems(chain);
        for (var i = 0; i < items.length; i += 1) if (!contains(members, items[i])) return null;
        return chain;
    }
    function validateText(frame) {
        if (frame.kind !== TextType.POINTTEXT && frame.kind !== TextType.AREATEXT) throw new Error("暂不支持路径文字，请保留普通点文本或区域文本。");
        if (!String(frame.contents).replace(/[\s\u0003\u3000]/g, "")) throw new Error("跟随项包含空白文本，无法确定文字末尾。");
        if (frame.story && frame.story.textFrames.length > 1) throw new Error("暂不支持串接文本框，请先取消串接。");
        if (frame.kind === TextType.AREATEXT) {
            var visible = "";
            for (var i = 0; i < frame.lines.length; i += 1) visible += String(frame.lines[i].contents);
            var plain = function (text) { return String(text).replace(/[\s\u0003\u3000]/g, ""); };
            if (plain(visible) !== plain(frame.contents)) throw new Error("区域文字存在未显示的内容，请先扩大文本框，让文字全部显示。");
        }
    }
    function canonical(raw) {
        if (!raw || raw.length !== 4) throw new Error("无法取得文字边界。");
        for (var i = 0; i < 4; i += 1) if (!isFinite(Number(raw[i]))) throw new Error("文字边界含无效坐标。");
        return [Math.min(raw[0], raw[2]), Math.max(raw[1] * yFactor, raw[3] * yFactor),
            Math.max(raw[0], raw[2]), Math.min(raw[1] * yFactor, raw[3] * yFactor)];
    }
    function usableBounds(b) { return b && b[1] - b[3] >= EPS && b[2] - b[0] >= EPS; }
    function refreshBounds() { try { app.redraw(); } catch (redrawError) {} }
    function nativeBounds(item, allowLine) {
        var result = null;
        try { result = canonical(item.visibleBounds); } catch (visibleError) {}
        if (!(allowLine ? result && (result[2] - result[0] >= EPS || result[1] - result[3] >= EPS) : usableBounds(result))) {
            try { result = canonical(item.geometricBounds); } catch (geometricError) { result = null; }
        }
        if (!(allowLine ? result && (result[2] - result[0] >= EPS || result[1] - result[3] >= EPS) : usableBounds(result))) throw new Error("Illustrator 未返回「" + objectName(item) + "」的有效对象边界。");
        return result;
    }
    function textLines(frame) {
        var result = [];
        for (var i = 0; i < frame.lines.length; i += 1) result.push(String(frame.lines[i].contents).replace(/[\r\n\u0003]+$/g, ""));
        return result;
    }
    function measureText(frame) {
        validateText(frame);
        if (frame.kind === TextType.POINTTEXT) return nativeBounds(frame, false);
        var holder = null, result, failure = "", cleanup = "";
        try {
            // 仅区域文字需要测量副本；临时组管理副本，转换后即使引用失效也可完整清理。
            holder = frame.parent.groupItems.add();
            if (!holder || sameItem(holder, frame.parent)) throw new Error("无法建立独立的临时测量组。");
            holder.name = "YOUKAI 临时测量";
            var copy = frame.duplicate(holder, ElementPlacement.PLACEATEND);
            if (copy && typeOf(copy) === "TextRange" && isText(copy.parent)) copy = copy.parent;
            if (!isText(copy) || sameItem(copy, frame)) throw new Error("无法建立文字测量副本。");
            copy.locked = false; copy.hidden = false; copy.selected = false;
            var beforeLines = textLines(frame);
            copy.convertAreaObjectToPointObject();
            refreshBounds();
            // 不依赖转换方法的返回值或旧引用，从专属临时组重新获取结果。
            var candidates = holder.textFrames || holder.pageItems, point = null;
            for (var i = 0; i < candidates.length; i += 1) if (isText(candidates[i]) && candidates[i].kind === TextType.POINTTEXT) {
                if (point && !sameItem(point, candidates[i])) throw new Error("区域文字转换产生多个测量对象。");
                point = candidates[i];
            }
            if (!point || sameItem(point, frame)) throw new Error("无法读取区域文字测量副本，请先将该文字改为点文字再记录。");
            var afterLines = textLines(point);
            if (beforeLines.length !== afterLines.length) throw new Error("「" + objectName(frame) + "」的区域文字转换后换行发生变化，请先改为点文字后重新记录。");
            for (i = 0; i < beforeLines.length; i += 1) if (beforeLines[i] !== afterLines[i]) throw new Error("「" + objectName(frame) + "」的区域文字转换后换行发生变化，请先改为点文字后重新记录。");
            result = nativeBounds(point, false);
        } catch (e) { failure = errorText(e); }
        finally {
            if (holder && !sameItem(holder, frame.parent)) { try { holder.remove(); } catch (removeHolder) { cleanup = "临时测量组清理失败"; } }
        }
        if (failure || cleanup) throw new Error(failure + (failure && cleanup ? "；" : "") + cleanup);
        return result;
    }
    function withEditable(items, fn) {
        var snapshots = [], i, j;
        for (i = 0; i < items.length; i += 1) {
            var node = items[i];
            while (node && node.typename !== "Document") {
                var found = false;
                for (j = 0; j < snapshots.length; j += 1) if (sameItem(snapshots[j].node, node)) { found = true; break; }
                if (!found) {
                    var depth = 0, ancestor = node;
                    while (ancestor && ancestor.typename !== "Document") { depth += 1; ancestor = ancestor.parent; }
                    snapshots.push({ node: node, depth: depth, locked: node.locked,
                        hidden: node.hidden, visible: node.typename === "Layer" ? node.visible : undefined });
                }
                node = node.parent;
            }
        }
        snapshots.sort(function (a, b) { return a.depth - b.depth; });
        var value, failure = "", restoreErrors = [];
        try {
            for (i = 0; i < snapshots.length; i += 1) {
                var snap = snapshots[i];
                if (snap.locked === true) snap.node.locked = false;
                if (snap.visible === false) snap.node.visible = true;
                if (snap.hidden === true) snap.node.hidden = false;
            }
            value = fn();
        } catch (e) { failure = errorText(e); }
        finally {
            for (i = snapshots.length - 1; i >= 0; i -= 1) {
                var saved = snapshots[i];
                try {
                    if (typeof saved.hidden === "boolean" && saved.node.hidden !== saved.hidden) saved.node.hidden = saved.hidden;
                    if (typeof saved.visible === "boolean" && saved.node.visible !== saved.visible) saved.node.visible = saved.visible;
                    if (typeof saved.locked === "boolean" && saved.node.locked !== saved.locked) saved.node.locked = saved.locked;
                } catch (restoreError) { restoreErrors.push(errorText(restoreError)); }
            }
        }
        if (restoreErrors.length) failure += (failure ? "；" : "") + "显隐或锁定状态还原失败：" + restoreErrors.join("；");
        if (failure) throw new Error(failure);
        return value;
    }
    function centerX(b) { return (b[0] + b[2]) / 2; }
    function readPosition(frame) {
        var p = frame.position;
        if (!p || !isFinite(Number(p[0])) || !isFinite(Number(p[1]))) throw new Error("无法读取文本位置。");
        return [Number(p[0]), Number(p[1])];
    }
    function shiftTo(frame, before, x, top) {
        var dx = x - centerX(before), dy = top - before[1];
        if (Math.abs(dx) > EPS || Math.abs(dy) > EPS) { frame.translate(dx, dy * yFactor); refreshBounds(); }
        var after = measure(frame), expected = [before[0] + dx, before[1] + dy, before[2] + dx, before[3] + dy];
        for (var i = 0; i < 4; i += 1) if (Math.abs(after[i] - expected[i]) > TOLERANCE) throw new Error("跟随位置未能正确还原，本组已回退。");
        return after;
    }

    function measure(item) {
        if (isText(item)) return measureText(item);
        if (item.guides === true) throw new Error("参考线不能用于跟随排版。");
        return nativeBounds(item, true);
    }
    function recordChain(items, records) {
        var affected = items.slice(0), i, j;
        // 重新记录局部对象时，清除它原先整条关系，避免留下缺项的旧记录。
        for (i = 0; i < records.entries.length; i += 1) {
            var oldEntry = records.entries[i], overlaps = false;
            for (j = 0; j < items.length; j += 1) if (sameItem(oldEntry.item, items[j]) || within(oldEntry.item, items[j]) || within(items[j], oldEntry.item)) { overlaps = true; break; }
            if (!overlaps) continue;
            var previous;
            try { previous = resolveChain(oldEntry, records.entries); }
            catch (broken) {
                previous = []; var indices = {};
                for (j = 0; j < records.entries.length; j += 1) if (records.entries[j].id === oldEntry.id) {
                    var candidate = records.entries[j];
                    if (indices["i" + candidate.index]) throw new Error("旧关系存在重复副本，请分别选中完整的一组重新记录。");
                    indices["i" + candidate.index] = true; previous.push(candidate);
                }
            }
            for (j = 0; j < previous.length; j += 1) if (!contains(affected, previous[j].item)) affected.push(previous[j].item);
        }
        return withEditable(affected, function () {
            var bounds = [], notes = [], replacements = [], touched = [], id = new Date().getTime().toString(36) + "_" + Math.floor(Math.random() * 1000000000).toString(36);
            for (var n = 0; n < items.length; n += 1) bounds.push(measure(items[n]));
            for (n = 0; n < affected.length; n += 1) {
                notes.push(String(affected[n].note || "")); replacements.push(stripRecord(notes[n]));
                for (var at = 0; at < items.length; at += 1) if (sameItem(affected[n], items[at])) {
                    var gap = at ? bounds[at - 1][3] - bounds[at][1] : 0;
                    var x = at ? centerX(bounds[at]) - centerX(bounds[at - 1]) : 0;
                    replacements[n] += "\n" + TAG + [id, at, items.length, gap.toFixed(6), x.toFixed(6)].join("|") + "]]";
                }
            }
            try {
                for (n = 0; n < affected.length; n += 1) if (notes[n] !== replacements[n]) {
                    touched.push(n); affected[n].note = replacements[n];
                    if (String(affected[n].note) !== replacements[n]) throw new Error("Illustrator 没有接受跟随记录。");
                }
            } catch (e) {
                var failures = [];
                for (n = touched.length - 1; n >= 0; n -= 1) {
                    var index = touched[n];
                    try { if (String(affected[index].note) !== notes[index]) affected[index].note = notes[index]; }
                    catch (rollbackError) { failures.push(errorText(rollbackError)); }
                }
                throw new Error(errorText(e) + (failures.length ? "；备注回退失败：" + failures.join("；") : ""));
            }
        });
    }
    function applyChain(chain) {
        var items = chainItems(chain);
        if (prune(items).length !== items.length) throw new Error("关系同时包含编组和组内对象，请重新选择独立对象记录。");
        return withEditable(items, function () {
            var positions = [], bounds = [], moved = false, i;
            for (i = 0; i < items.length; i += 1) { positions.push(readPosition(items[i])); bounds.push(measure(items[i])); }
            try {
                var previous = bounds[0];
                for (i = 1; i < items.length; i += 1) {
                    moved = true;
                    previous = shiftTo(items[i], bounds[i], centerX(previous) + chain[i].x, previous[3] - chain[i].gap);
                }
            } catch (e) {
                var errors = [];
                if (moved) for (i = items.length - 1; i >= 1; i -= 1) {
                    try { items[i].position = positions[i]; }
                    catch (rollbackError) { errors.push(errorText(rollbackError)); }
                }
                throw new Error(errorText(e) + (errors.length ? "；位置回退失败：" + errors.join("；") : ""));
            }
        });
    }
    function applyAll(records) {
        var done = [], failed = [], errors = records.errors.slice(0), success = 0;
        for (var i = 0; i < records.entries.length; i += 1) {
            var entry = records.entries[i];
            if (contains(done, entry.item) || contains(failed, entry.item)) continue;
            var chain = null;
            try { chain = resolveChain(entry, records.entries); applyChain(chain); success += 1; done = done.concat(chainItems(chain)); }
            catch (e) {
                errors.push(objectName(entry.item) + "：" + errorText(e));
                if (chain) failed = failed.concat(chainItems(chain));
                else for (var j = 0; j < records.entries.length; j += 1) if (records.entries[j].id === entry.id) failed.push(records.entries[j].item);
            }
        }
        if (!records.entries.length && !errors.length) throw new Error("还没有跟随记录。请先选中对象，记录顺序与间距并保存模板。");
        var summary = "跟随排版：完成 " + success + " 条关系。";
        if (errors.length) {
            summary += "\n失败 " + errors.length + " 条：";
            for (i = 0; i < Math.min(errors.length, 4); i += 1) summary += "\n" + errors[i];
        }
        if (batch) { if (errors.length) throw new Error(summary); }
        else alert(summary + "\n未自动保存文档。");
    }
    function setupDialog(items, existing) {
        var C = { bg: [0.102, 0.106, 0.122, 1], card: [0.078, 0.086, 0.098, 1], raised: [0.141, 0.153, 0.173, 1],
            yellow: [0.976, 1, 0, 1], text: [0.925, 0.925, 0.925, 1], muted: [0.627, 0.651, 0.682, 1], red: [1, 0.2, 0.267, 1] };
        function color(control, foreground, background) {
            try { if (foreground) control.graphics.foregroundColor = control.graphics.newPen(control.graphics.PenType.SOLID_COLOR, foreground, 1); } catch (unsupportedForeground) {}
            if (background && /^(dialog|palette|window|panel|group)$/.test(String(control.type || ""))) {
                try { control.graphics.backgroundColor = control.graphics.newBrush(control.graphics.BrushType.SOLID_COLOR, background); } catch (unsupportedBackground) {}
            }
        }
        function font(control, bold, size) {
            try { control.graphics.font = ScriptUI.newFont("Microsoft YaHei UI", bold ? ScriptUI.FontStyle.BOLD : ScriptUI.FontStyle.REGULAR, size); } catch (unsupportedFont) {}
        }
        function label(parent, text, muted) { var item = parent.add("statictext", undefined, text); color(item, muted ? C.muted : C.text); font(item, false, 11); return item; }
        function button(parent, text, primary, width) {
            var wrap = parent.add("group"); wrap.orientation = "stack"; wrap.alignChildren = ["center", "center"]; wrap.margins = 0; wrap.spacing = 0;
            wrap.preferredSize = wrap.minimumSize = wrap.maximumSize = [width || (primary ? 164 : 92), 32];
            color(wrap, null, primary ? C.yellow : C.raised);
            var item = wrap.add("button", undefined, text); item.alignment = ["fill", "fill"]; font(item, true, 11);
            var caption = wrap.add("statictext", undefined, text); caption.alignment = ["center", "center"];
            try { caption.graphics.font = item.graphics.font; } catch (captionFont) {}
            color(caption, primary ? C.card : C.text);
            caption.addEventListener("click", function () { if (item.enabled) { item.active = true; item.notify("onClick"); } });
            item.onDraw = function () {
                var g = this.graphics, bg = primary && this.enabled ? C.yellow : C.raised;
                g.newPath(); g.rectPath(0, 0, this.size.width, this.size.height); g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, bg));
                g.strokePath(g.newPen(g.PenType.SOLID_COLOR, this.active ? C.yellow : C.muted, 1));
                caption.enabled = this.enabled; color(caption, this.enabled ? (primary ? C.card : C.text) : C.muted); color(wrap, null, bg);
            };
            return item;
        }

        var orderedItems = existing ? chainItems(existing) : items.slice(0);
        if (!existing) orderedItems.sort(function (a, b) {
            var aBounds = canonical(a.geometricBounds), bBounds = canonical(b.geometricBounds), delta = bBounds[1] - aBounds[1];
            return Math.abs(delta) > TOLERANCE ? delta : aBounds[0] - bBounds[0];
        });
        var win = new Window("dialog", "YOUKAI // 文字跟随排版"); win.orientation = "column"; win.alignChildren = ["fill", "top"];
        win.margins = 16; win.spacing = 10; win.preferredSize.width = 536; color(win, C.text, C.bg);
        var title = label(win, "自选对象 · 跟随顺序", false); font(title, true, 13); color(title, C.yellow);
        label(win, "自动读取对象名称；第一项固定，后面的依次跟随。", true);
        var panel = win.add("panel", undefined, "对象顺序（从上到下）"); panel.orientation = "row"; panel.alignChildren = ["fill", "top"];
        panel.margins = [12, 18, 12, 12]; panel.spacing = 10; color(panel, C.muted, C.card); font(panel, false, 11);
        var list = panel.add("listbox", undefined, []); list.preferredSize = [400, Math.min(260, Math.max(110, orderedItems.length * 25))]; font(list, false, 11);
        var orderButtons = panel.add("group"); orderButtons.orientation = "column"; orderButtons.spacing = 8;
        var up = button(orderButtons, "上移", false, 64), down = button(orderButtons, "下移", false, 64);
        label(win, "顺序和间距自动保存在对象注释中，请保存模板。", true);
        var status = label(win, "", true);
        var actions = win.add("group"); actions.alignment = ["right", "center"]; actions.orientation = "row"; actions.spacing = 8;
        var cancel = button(actions, "取消", false, 80), record = button(actions, "记录当前顺序", !existing, 152), apply = button(actions, "跟随排版", !!existing, 152);
        function unchanged() {
            if (!existing || orderedItems.length !== existing.length) return false;
            for (var i = 0; i < orderedItems.length; i += 1) if (!sameItem(orderedItems[i], existing[i].item)) return false;
            return true;
        }
        function update() {
            var index = list.selection ? list.selection.index : -1;
            up.enabled = index > 0; down.enabled = index >= 0 && index < orderedItems.length - 1;
            list.helpTip = index >= 0 ? objectName(orderedItems[index]) : "";
            apply.enabled = unchanged();
            status.text = apply.enabled ? "已读取原记录：改字后点击「跟随排版」。" : "首次或顺序调整后：点击「记录当前顺序」，再保存模板。";
            win.defaultElement = apply.enabled ? apply : record;
        }
        function refresh(index) {
            list.removeAll();
            for (var i = 0; i < orderedItems.length; i += 1) {
                var name = objectName(orderedItems[i]);
                list.add("item", (i + 1) + ". " + (name.length > 40 ? name.substr(0, 40) + "…" : name));
            }
            list.selection = index; update();
        }
        function move(delta) {
            if (!list.selection) return;
            var index = list.selection.index, target = index + delta;
            if (target < 0 || target >= orderedItems.length) return;
            var item = orderedItems[index]; orderedItems[index] = orderedItems[target]; orderedItems[target] = item; refresh(target);
        }
        up.onClick = function () { move(-1); }; down.onClick = function () { move(1); }; list.onChange = update;
        cancel.onClick = function () { win.close(0); };
        record.onClick = function () { win.close(1); };
        apply.onClick = function () { update(); if (apply.enabled) win.close(2); };
        win.cancelElement = cancel; refresh(0); win.center();
        var action = win.show();
        return action === 1 || action === 2 ? { action: action, items: orderedItems } : null;
    }

    try {
        if (typeof app === "undefined" || String(app.name).toLowerCase().indexOf("illustrator") < 0) throw new Error("请在 Illustrator 中运行此脚本。");
        if (!app.documents.length) throw new Error("请先打开 AI 文档。");
        doc = app.activeDocument; captureSelection(doc.selection); selectionCaptured = true;
        oldCoordinates = app.coordinateSystem; oldActiveLayer = doc.activeLayer;
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        var rect = doc.artboards[0].artboardRect;
        if (!rect || !isFinite(Number(rect[1])) || !isFinite(Number(rect[3])) || Number(rect[1]) === Number(rect[3])) throw new Error("无法确定文档的上下方向。");
        yFactor = Number(rect[1]) > Number(rect[3]) ? 1 : -1;
        refreshBounds();
        var records = allRecords();
        if (batch || !selected.length) { applyAll(records); return; }
        var items = selectedItems(records), existing = matchingChain(items, records.entries), picked = setupDialog(items, existing);
        if (!picked) return;
        if (picked.action === 1) {
            recordChain(picked.items, records);
            alert("已记录当前间距与顺序，共 " + picked.items.length + " 个对象。\n请保存模板；改字后运行脚本，点击「跟随排版」。");
        } else {
            applyChain(existing);
            alert("跟随排版完成，共 " + existing.length + " 个对象。\n未自动保存文档。");
        }
    } catch (e) {
        var message = "文字跟随排版：\n" + errorText(e);
        if (batch) throw new Error(message);
        alert(message);
    } finally {
        restoreSelection();
        if (doc && oldActiveLayer) { try { doc.activeLayer = oldActiveLayer; } catch (restoreLayer) {} }
        if (typeof oldCoordinates !== "undefined") { try { app.coordinateSystem = oldCoordinates; } catch (restoreCoordinates) {} }
    }
})();

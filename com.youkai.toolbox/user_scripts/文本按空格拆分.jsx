#target illustrator
/* 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/* 文本按空格拆分 v0.1 测试版：按词组拆成可编辑文本，以临时轮廓校准原位置。 */
(function () {
    var doc = null, oldCoordinates, oldActiveLayer;
    var selected = [], frames = [], results = [], retained = [], issues = [];
    var completedFrames = 0, skippedFrames = 0, selectionTouched = false;
    // 普通空格、全角空格、不换行空格、制表符和换行作为分隔；连续分隔不生成空文本。
    var separator = /^[\s\u0003\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+$/;
    var tolerance = 0.15; // pt，只接受无需缩放字形即可保持原样的词组。

    function errorText(error) { return error && error.message ? error.message : String(error); }
    function removeItem(item) { try { if (item) item.remove(); } catch (alreadyRemoved) {} }
    function restoreSelection() {
        if (!doc || !selectionTouched) return;
        try { doc.selection = null; } catch (clearSelection) {}
        var lists = [selected, retained, results];
        for (var n = 0; n < lists.length; n += 1) {
            for (var i = 0; i < lists[n].length; i += 1) {
                try { lists[n][i].selected = true; } catch (removedSelection) {}
            }
        }
    }
    function contains(items, item) {
        for (var i = 0; i < items.length; i += 1) if (items[i] === item) return true;
        return false;
    }
    function unavailable(item) {
        var current = item;
        while (current && current.typename !== "Document") {
            if (current.locked === true || current.hidden === true ||
                    (current.typename === "Layer" && current.visible === false)) return true;
            current = current.parent;
        }
        return false;
    }
    function collectText(item) {
        if (!item || unavailable(item)) return;
        if (item.typename === "TextFrame") {
            if (!contains(frames, item)) frames.push(item);
        } else if (item.typename === "GroupItem") {
            for (var i = 0; i < item.pageItems.length; i += 1) {
                if (item.pageItems[i].parent === item) collectText(item.pageItems[i]);
            }
        }
    }
    function splitParts(frame) {
        var result = [], part = null, chars = frame.characters;
        for (var i = 0; i < chars.length; i += 1) {
            var contents = String(chars[i].contents);
            if (contents && separator.test(contents)) {
                if (part) { result.push(part); part = null; }
            } else if (contents) {
                if (!part) part = { start: i, end: i, text: "" };
                part.end = i + 1;
                part.text += contents;
            }
        }
        if (part) result.push(part);
        return result;
    }
    function copyFrame(frame) {
        var copy = frame.duplicate(frame, ElementPlacement.PLACEBEFORE);
        // 兼容返回 TextRange 的宿主；必须取得独立副本，不能回落到原文本。
        if (copy && copy.typename === "TextRange" && copy.parent && copy.parent.typename === "TextFrame") copy = copy.parent;
        if (!copy || copy.typename !== "TextFrame" || copy === frame) throw new Error("无法复制独立文本。");
        copy.selected = false;
        return copy;
    }
    function nativeRange(frame, start, end) {
        if (start < 0 || end <= start || end > frame.characters.length) throw new Error("文本范围不正确。");
        // 使用 Illustrator 自己的字符偏移，避免 Unicode 字符的索引不一致。
        var begin = frame.characters[start].start, finish = frame.characters[end - 1].end;
        var range = frame.textRange;
        range.start = begin;
        range.end = finish;
        return range;
    }
    function stripOtherText(frame, part) {
        var count = frame.characters.length;
        if (part.end < count) nativeRange(frame, part.end, count).remove();
        if (part.start > 0) nativeRange(frame, 0, part.start).remove();
        if (String(frame.contents) !== part.text) throw new Error("拆分后的文字与原词组不一致，已保留原文。");
    }
    function union(a, b) {
        if (!b) return a;
        if (!a) return [b[0], b[1], b[2], b[3]];
        return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
    }
    function paintBounds(item) {
        var result = null, i, children;
        if (item.typename === "PathItem") {
            if (item.clipping === true) return null;
            var hasFill = item.filled === true, hasStroke = item.stroked === true;
            if (hasFill && item.fillColor && item.fillColor.typename === "NoColor") hasFill = false;
            if (hasStroke && item.strokeColor && item.strokeColor.typename === "NoColor") hasStroke = false;
            if (!hasFill && !hasStroke) return null;
            var b = item.geometricBounds;
            if (!b || b.length !== 4) throw new Error("无法读取文字轮廓位置。");
            for (i = 0; i < 4; i += 1) if (!isFinite(Number(b[i]))) throw new Error("文字轮廓位置无效。");
            return [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])];
        }
        if (item.typename === "CompoundPathItem") children = item.pathItems;
        else if (item.typename === "GroupItem") children = item.pageItems;
        else return null;
        for (i = 0; i < children.length; i += 1) {
            if (children[i].parent === item) result = union(result, paintBounds(children[i]));
        }
        return result;
    }
    function measurePart(frame, part) {
        var copy = null, outlined = null;
        try {
            copy = copyFrame(frame);
            var attrs = copy.textRange.characterAttributes;
            attrs.fillColor = new NoColor();
            attrs.strokeColor = new NoColor();
            var marker = new RGBColor(); marker.red = 255; marker.green = 0; marker.blue = 0;
            nativeRange(copy, part.start, part.end).characterAttributes.fillColor = marker;
            // 仅临时副本转曲。其他词组保留在排版中但不着色，不参与轮廓测量。
            outlined = copy.createOutline();
            var bounds = paintBounds(outlined);
            if (!bounds || bounds[2] - bounds[0] < 0.001 || bounds[3] - bounds[1] < 0.001) {
                throw new Error("词组“" + part.text + "”没有可测量的可见文字，已保留原文。");
            }
            return bounds;
        } finally {
            removeItem(outlined);
            removeItem(copy); // createOutline 后副本可能已失效，清理时允许跳过。
        }
    }
    function splitFrame(frame, parts) {
        if (frame.kind !== TextType.POINTTEXT && frame.kind !== TextType.AREATEXT) {
            throw new Error("路径文字暂不支持，请先改成普通文字。");
        }
        if (frame.story && frame.story.textFrames.length > 1) throw new Error("串接文本暂不支持，请先取消文本框串接。");
        var created = [], committed = false;
        try {
            for (var i = 0; i < parts.length; i += 1) {
                var part = parts[i], originalBounds = measurePart(frame, part);
                var word = copyFrame(frame);
                created.push(word);
                stripOtherText(word, part);
                if (word.kind === TextType.AREATEXT) {
                    var point = word.convertAreaObjectToPointObject();
                    if (!point || point.typename !== "TextFrame") throw new Error("无法转换为独立文本，已保留原文。");
                    word = point; created[created.length - 1] = point;
                }
                if (String(word.contents) !== part.text) {
                    // 某些版本转换时会追加段落符；只清除词组外的空白，不改动词组内部。
                    var convertedParts = splitParts(word);
                    if (convertedParts.length !== 1 || convertedParts[0].text !== part.text) {
                        throw new Error("转换独立文本时排版发生变化，已保留原文。");
                    }
                    stripOtherText(word, convertedParts[0]);
                }
                var wordBounds = measurePart(word, { start: 0, end: word.characters.length, text: part.text });
                if (Math.abs((originalBounds[2] - originalBounds[0]) - (wordBounds[2] - wordBounds[0])) > tolerance ||
                        Math.abs((originalBounds[3] - originalBounds[1]) - (wordBounds[3] - wordBounds[1])) > tolerance) {
                    throw new Error("词组“" + part.text + "”跨行或存在特殊排版，无法保持原样，已保留原文。");
                }
                word.translate(originalBounds[0] - wordBounds[0], originalBounds[1] - wordBounds[1]);
                var placedBounds = measurePart(word, { start: 0, end: word.characters.length, text: part.text });
                for (var b = 0; b < 4; b += 1) {
                    if (Math.abs(placedBounds[b] - originalBounds[b]) > tolerance) throw new Error("词组位置未能正确还原，已保留原文。");
                }
                word.name = part.text;
            }
            // 所有新文本完成并定位后才删除原对象；中途失败则回滚当前文本的所有副本。
            frame.remove();
            committed = true;
            return created;
        } finally {
            if (!committed) for (var j = created.length - 1; j >= 0; j -= 1) removeItem(created[j]);
        }
    }

    try {
        if (typeof app === "undefined" || String(app.name).toLowerCase().indexOf("illustrator") < 0) throw new Error("请在 Illustrator 中运行此脚本。");
        if (!app.documents.length) throw new Error("请先打开 AI 文档。");
        doc = app.activeDocument;
        if (doc.selection && (doc.selection.typename === "TextRange" || doc.selection.typename === "InsertionPoint")) {
            throw new Error("请先退出文字编辑，用选择工具选中文本对象，再运行脚本。");
        }
        if (!doc.selection || !doc.selection.length) throw new Error("请先选中需要按空格拆分的文本对象。");
        for (var s = 0; s < doc.selection.length; s += 1) selected.push(doc.selection[s]);
        for (s = 0; s < selected.length; s += 1) collectText(selected[s]);
        if (!frames.length) throw new Error("没有选中可编辑文本，请选中文字对象或包含文字的编组。");
        oldCoordinates = app.coordinateSystem;
        oldActiveLayer = doc.activeLayer;
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        for (var i = 0; i < frames.length; i += 1) {
            try {
                var parts = splitParts(frames[i]);
                if (parts.length < 2) { skippedFrames += 1; retained.push(frames[i]); continue; }
                selectionTouched = true;
                var words = splitFrame(frames[i], parts);
                for (var w = 0; w < words.length; w += 1) results.push(words[w]);
                completedFrames += 1;
            } catch (frameError) {
                retained.push(frames[i]);
                issues.push(errorText(frameError));
            }
        }
        var summary = completedFrames ? "拆分完成：" + completedFrames + " 个文本 → " + results.length + " 个独立文本。" : "没有拆分文本。";
        if (skippedFrames) summary += "\n" + skippedFrames + " 个文本没有可拆分的空格，保持原样。";
        if (issues.length) {
            summary += "\n" + issues.length + " 个文本未拆分：";
            for (i = 0; i < Math.min(issues.length, 4); i += 1) summary += "\n" + issues[i];
            if (issues.length > 4) summary += "\n其余同类问题已略。";
        }
        if (completedFrames) summary += "\n文字仍可编辑，未自动保存。";
        if (typeof $ !== "undefined" && $.global && $.global.YOUKAI_BATCH) {
            if (issues.length) throw new Error(summary);
        } else alert(summary);
    } catch (error) {
        var message = "文本按空格拆分：\n" + errorText(error);
        if (typeof $ !== "undefined" && $.global && $.global.YOUKAI_BATCH) throw new Error(message);
        alert(message);
    } finally {
        restoreSelection();
        if (doc && oldActiveLayer) { try { doc.activeLayer = oldActiveLayer; } catch (restoreLayer) {} }
        if (typeof oldCoordinates !== "undefined") { try { app.coordinateSystem = oldCoordinates; } catch (restoreCoordinates) {} }
    }
})();

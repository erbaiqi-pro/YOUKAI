#target illustrator
/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */

/**
 * 画板净删 v1.1
 * 按 CSV 中的原始画板编号删除画板与对象，包含隐藏、锁定的图层和对象。
 * 从内向外移除本次被删空的子图层，保留顶层图层及原本为空的图层。
 * 不保存文档；异常向上传递，由 Youkai 面板或批处理记录失败。
 */
(function () {
    var TITLE = "画板净删";
    var EPSILON = 0.0001;

    function fail(message) {
        throw new Error(TITLE + "：" + message);
    }

    function trim(value) {
        return String(value).replace(/^\s+|\s+$/g, "");
    }

    function getCsvFile() {
        // 已设置目录时只使用该目录，避免误用其他目录里过期的删除清单。
        if ($.global && $.global.YOUKAI_CSV_FOLDER) {
            return new File($.global.YOUKAI_CSV_FOLDER + "/" + TITLE + ".csv");
        }
        var folders = [
            new File($.fileName).parent.fsName,
            Folder.userData + "/com.youkai.toolbox/csv",
            Folder.myDocuments + "/Youkai/csv"
        ];
        for (var i = 0; i < folders.length; i++) {
            var file = new File(folders[i] + "/" + TITLE + ".csv");
            if (file.exists) return file;
        }
        return new File(folders[1] + "/" + TITLE + ".csv");
    }

    function readNumbers(file, count) {
        if (!file.exists) fail("未找到配置表格：" + file.fsName);
        file.encoding = "UTF-8";
        if (!file.open("r")) fail("无法读取配置表格：" + file.fsName);
        var content;
        try {
            content = file.read();
        } finally {
            file.close();
        }
        var lines = content.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
        var numbers = [], seen = {}, firstRow = true;
        for (var i = 0; i < lines.length; i++) {
            if (!trim(lines[i])) continue;
            var cells = lines[i].split(",");
            var value = trim(cells[0]);
            if (/^"[^"]*"$/.test(value)) value = trim(value.substring(1, value.length - 1));
            for (var c = 1; c < cells.length; c++) {
                if (trim(cells[c]) && trim(cells[c]) !== '""') {
                    fail("表格第 " + (i + 1) + " 行有多列内容，请在 A 列一行填写一个画板编号。");
                }
            }
            if (!value) continue;
            if (firstRow && (value === "画板编号" || value === "删除画板编号")) {
                firstRow = false;
                continue;
            }
            firstRow = false;
            if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > count) {
                fail("表格第 " + (i + 1) + " 行的编号无效：" + value + "。当前文档共有 " + count + " 个画板，编号从 1 开始。");
            }
            var number = Number(value);
            if (!seen[number]) {
                seen[number] = true;
                numbers.push(number);
            }
        }
        if (!numbers.length) fail("表格中没有要删除的画板编号。");
        if (numbers.length === count) fail("不能删除全部画板，Illustrator 至少需要保留一个画板。文档未作修改。");
        numbers.sort(function (a, b) { return b - a; });
        return numbers;
    }

    function copyBounds(bounds) {
        if (!bounds || bounds.length !== 4) fail("无法读取对象范围，已停止删除。");
        for (var i = 0; i < 4; i++) {
            if (typeof bounds[i] !== "number" || !isFinite(bounds[i])) fail("对象范围无效，已停止删除。");
        }
        return [Math.min(bounds[0], bounds[2]), Math.max(bounds[1], bounds[3]),
            Math.max(bounds[0], bounds[2]), Math.min(bounds[1], bounds[3])];
    }

    function overlaps(bounds, rect) {
        var x = Math.min(bounds[2], rect[2]) - Math.max(bounds[0], rect[0]);
        var y = Math.min(bounds[1], rect[1]) - Math.max(bounds[3], rect[3]);
        // 普通对象仅接触画板边缘不算相交；零宽/零高的路径仍可被删除。
        var hitX = bounds[2] - bounds[0] <= EPSILON ? x >= -EPSILON : x > EPSILON;
        var hitY = bounds[1] - bounds[3] <= EPSILON ? y >= -EPSILON : y > EPSILON;
        return hitX && hitY;
    }

    function directItems(container) {
        var items = [], collection = container.pageItems;
        var length = collection.length;
        for (var i = 0; i < length; i++) {
            // 某些宿主集合也返回后代，必须过滤，防止重复删除或绕过剪切蒙版。
            var item = collection[i];
            if (item.parent === container) items.push(item);
        }
        return items;
    }

    function clippingBounds(group) {
        var children = directItems(group);
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (child.typename === "PathItem" && child.clipping) return copyBounds(child.geometricBounds);
            if (child.typename === "CompoundPathItem") {
                for (var p = 0; p < child.pathItems.length; p++) {
                    if (child.pathItems[p].clipping) return copyBounds(child.geometricBounds);
                }
            }
        }
        fail("有剪切编组无法读取蒙版范围，已停止删除。");
    }

    if (app.name && !/illustrator/i.test(app.name)) fail("请在 Illustrator 中运行。");
    if (!app.documents.length) fail("请先打开一个 Illustrator 文档。");
    var doc = app.activeDocument;
    var numbers = readNumbers(getCsvFile(), doc.artboards.length);
    var rects = [];
    for (var a = 0; a < numbers.length; a++) rects.push(copyBounds(doc.artboards[numbers[a] - 1].artboardRect));

    function hitsTarget(bounds) {
        for (var i = 0; i < rects.length; i++) if (overlaps(bounds, rects[i])) return true;
        return false;
    }

    function planItem(item) {
        if (item.typename === "GroupItem" && !item.clipped) {
            // 普通编组可能横跨很多画板，按子对象判断，不能用整组外框直接删除。
            var children = directItems(item), planned = [], all = children.length > 0;
            for (var i = 0; i < children.length; i++) {
                var childPlan = planItem(children[i]);
                if (childPlan.length !== 1 || childPlan[0] !== children[i]) all = false;
                for (var j = 0; j < childPlan.length; j++) planned.push(childPlan[j]);
            }
            if (all) return [item];
            return planned;
        }
        // 剪切编组按蒙版范围判断并整组删除，避免被蒙版外的大图误判。
        var bounds = item.typename === "GroupItem" && item.clipped ? clippingBounds(item) : copyBounds(item.visibleBounds);
        return hitsTarget(bounds) ? [item] : [];
    }

    var targets = [], affectedLayers = [];
    function planLayers(layers) {
        var hasTargets = false;
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i], layerHasTargets = false;
            var items = directItems(layer);
            for (var p = 0; p < items.length; p++) {
                var planned = planItem(items[p]);
                for (var j = 0; j < planned.length; j++) targets.push(planned[j]);
                if (planned.length) layerHasTargets = true;
            }
            if (planLayers(layer.layers)) layerHasTargets = true;
            if (layerHasTargets) {
                // 子层先入列，父层后入列；只记录本次确实有待删内容的分支。
                affectedLayers.push(layer);
                hasTargets = true;
            }
        }
        return hasTargets;
    }
    // 在任何修改之前完成编号、范围和对象检查。
    planLayers(doc.layers);

    var states = [], deleted = 0, removedArtboards = 0, removedEmptySublayers = 0;
    var active = doc.artboards.getActiveArtboardIndex();
    var operationError = null, restoreErrors = [];

    function prepareOne(node) {
        var isLayer = node.typename === "Layer";
        var state = {node: node, isLayer: isLayer, locked: node.locked,
            hidden: isLayer ? !node.visible : node.hidden};
        // 仅记录实际修改过的状态；再次经过同一祖先时，它已解锁/显示，不重复记录。
        if (!state.locked && !state.hidden) return;
        states.push(state);
        if (state.locked) node.locked = false;
        if (state.hidden) {
            if (isLayer) node.visible = true;
            else node.hidden = false;
        }
    }

    function prepareItem(node) {
        prepareOne(node);
        if (node.typename === "GroupItem") {
            var children = directItems(node);
            for (var c = 0; c < children.length; c++) prepareItem(children[c]);
        } else if (node.typename === "CompoundPathItem") {
            for (var p = 0; p < node.pathItems.length; p++) prepareOne(node.pathItems[p]);
        }
    }

    try {
        // 只解锁/显示待删对象和它们的祖先、后代，不触碰其他画板的隐藏变量对象。
        // 全部准备成功之后才开始删除。
        for (var u = 0; u < targets.length; u++) {
            var ancestors = [], parent = targets[u].parent;
            while (parent && parent !== doc && parent.typename !== "Document") {
                ancestors.push(parent);
                parent = parent.parent;
            }
            for (var p = ancestors.length - 1; p >= 0; p--) prepareOne(ancestors[p]);
            prepareItem(targets[u]);
        }
        for (var t = 0; t < targets.length; t++) {
            targets[t].remove();
            deleted++;
        }
        // 空子图层不属于 pageItems，删除图形后需要单独收尾。
        // 只清理本次受影响的分支，不依据名字、缩略图或可见性判断是否为空。
        for (var e = 0; e < affectedLayers.length; e++) {
            var emptyLayer = affectedLayers[e];
            if (emptyLayer.parent.typename !== "Layer") continue;
            if (emptyLayer.layers.length === 0 && emptyLayer.pageItems.length === 0) {
                emptyLayer.remove();
                removedEmptySublayers++;
            }
        }
        // 按原始编号从大到小删除，编号变化不会影响后面的目标。
        for (var n = 0; n < numbers.length; n++) {
            doc.artboards.remove(numbers[n] - 1);
            removedArtboards++;
        }
    } catch (error) {
        operationError = error;
    } finally {
        // 子对象先恢复，父图层最后恢复；已删除对象的宿主引用不再有效。
        for (var s = states.length - 1; s >= 0; s--) {
            var state = states[s], alive = false;
            try { alive = !!state.node.typename; } catch (removed) {}
            if (!alive) continue;
            try {
                if (state.isLayer) {
                    if (state.node.visible !== !state.hidden) state.node.visible = !state.hidden;
                } else if (state.node.hidden !== state.hidden) state.node.hidden = state.hidden;
                if (state.node.locked !== state.locked) state.node.locked = state.locked;
            } catch (restoreError) {
                restoreErrors.push(String(restoreError));
            }
        }
        try {
            if (removedArtboards === numbers.length) {
                var beforeActive = 0;
                for (var k = 0; k < numbers.length; k++) if (numbers[k] - 1 < active) beforeActive++;
                doc.artboards.setActiveArtboardIndex(Math.min(active - beforeActive, doc.artboards.length - 1));
            }
        } catch (activeError) { restoreErrors.push(String(activeError)); }
    }
    if (operationError) fail("执行中止：" + String(operationError) + "。已删除 " + deleted + " 个对象或编组、" + removedArtboards + " 个画板、" + removedEmptySublayers + " 个空子图层；请检查当前文档。");
    if (restoreErrors.length) fail("删除已完成，但部分隐藏/锁定状态恢复失败：" + restoreErrors.join("；"));
    return {artboardNumbers: numbers, removedArtboards: removedArtboards, removedItemsOrGroups: deleted,
        removedEmptySublayers: removedEmptySublayers};
})();

/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/**
 * Illustrator 多基准对象 - 注释解析对齐脚本 (极速优化版)
 * 支持 key1, key2, keyN 等多组基准与目标的自动匹配对齐
 * 跳过隐藏图层与隐藏对象；编组仅按当前显示的内容计算对齐范围
 */

#target illustrator

function multiKeyAlignByNote() {
    if (app.documents.length === 0) return;

    var doc = app.activeDocument;
    var keyMap = {};      // 存储所有 key 对象，如 { "1": item, "2": item, "default": item }
    var targetList = [];  // 存储所有移动项

    // geometricBounds 不负责过滤编组中的隐藏项，需递归合并可见子对象的几何边界。
    // 仍使用不含描边的几何边界，保持原脚本的对齐口径。
    function getAlignmentBounds(item) {
        if (item.hidden === true) return null;

        if (item.typename !== "GroupItem") {
            var bounds = item.geometricBounds;
            return [bounds[0], bounds[1], bounds[2], bounds[3]];
        }

        var result = null;
        var children = item.pageItems;
        for (var c = 0; c < children.length; c++) {
            var child = children[c];
            // 只访问直属子对象，避免绕过隐藏父编组或重复计算嵌套对象。
            if (child.parent !== item) continue;
            var childBounds = getAlignmentBounds(child);
            if (!childBounds) continue;

            if (!result) {
                result = childBounds;
            } else {
                result[0] = Math.min(result[0], childBounds[0]);
                result[1] = Math.max(result[1], childBounds[1]);
                result[2] = Math.max(result[2], childBounds[2]);
                result[3] = Math.min(result[3], childBounds[3]);
            }
        }
        return result; // 空编组或内容全部隐藏时不参与对齐。
    }

    // 解析并分类 Note 对象
    function processNote(item) {
        var noteStr = item.note.toLowerCase().replace(/\s+/g, ""); // 清除空格变小写
        if (!noteStr) return;

        // 匹配 key，如 key, key1, key2, 基准, 基准1
        var keyMatch = noteStr.match(/^(key|基准)(\d*)$/);
        if (keyMatch) {
            var keyGroupId = keyMatch[2] !== "" ? keyMatch[2] : "default";
            keyMap[keyGroupId] = item;
            return;
        }

        // 匹配 target，如 target:xxx, target1:xxx, target2:xxx
        var targetMatch = noteStr.match(/^target(\d*):(.+)$/);
        if (targetMatch) {
            var targetGroupId = targetMatch[1] !== "" ? targetMatch[1] : "default";
            var commands = targetMatch[2].split(",");
            targetList.push({
                item: item,
                groupId: targetGroupId,
                commands: commands
            });
        }
    }

    // 递归遍历项 (自顶向下，每个对象仅访问一次)
    function scanItem(item) {
        if (item.hidden === true) return; // 隐藏对象直接跳过

        // 优先检查 Note，绝大部分无 Note 对象直接跳过，零性能开销
        try {
            if (item.note && item.note !== "") {
                processNote(item);
            }
        } catch (eNote) {}

        // 如果是编组，递归内部子对象
        if (item.typename === "GroupItem") {
            var children = item.pageItems;
            for (var c = 0; c < children.length; c++) {
                if (children[c].parent === item) scanItem(children[c]);
            }
        }
    }

    // 遍历图层树 (若图层隐藏则直接整层剪枝跳过，大幅提升复杂文档性能)
    function scanLayer(layer) {
        if (layer.visible === false) return; // 隐藏图层直接跳过整层及其数千子对象

        // 遍历子图层
        if (layer.layers && layer.layers.length > 0) {
            for (var l = 0; l < layer.layers.length; l++) {
                scanLayer(layer.layers[l]);
            }
        }

        // 遍历当前图层下的一级 pageItems
        var items = layer.pageItems;
        for (var i = 0; i < items.length; i++) {
            if (items[i].parent === layer) scanItem(items[i]);
        }
    }

    // 1. 扫描所有可见图层
    for (var i = 0; i < doc.layers.length; i++) {
        scanLayer(doc.layers[i]);
    }

    // 如果未找到任何目标对象，直接退出
    if (targetList.length === 0) return;

    // 2. 遍历所有 target 并匹配对应的 key 执行位移
    for (var j = 0; j < targetList.length; j++) {
        var tObj = targetList[j];
        var targetItem = tObj.item;
        var groupId = tObj.groupId;
        var cmds = tObj.commands;

        // 寻找对应组号的 key，若找不到则尝试退回 default 通用 key
        var matchedKeyItem = keyMap[groupId] || keyMap["default"];
        if (!matchedKeyItem) continue;

        try {
            var kBounds = getAlignmentBounds(matchedKeyItem); // [left, top, right, bottom]
            var tBounds = getAlignmentBounds(targetItem);
            if (!kBounds || !tBounds) continue;

            var tWidth = tBounds[2] - tBounds[0];
            var tHeight = tBounds[1] - tBounds[3];

            var newLeft = tBounds[0];
            var newTop = tBounds[1];

            // 解析对齐指令
            for (var c = 0; c < cmds.length; c++) {
                var cmd = cmds[c];

                // 水平居中 / 居中
                if (cmd === "centerx" || cmd === "水平居中" || cmd === "center" || cmd === "居中") {
                    var keyCenterX = kBounds[0] + (kBounds[2] - kBounds[0]) / 2;
                    newLeft = keyCenterX - (tWidth / 2);
                } else if (cmd === "left" || cmd === "左对齐") {
                    newLeft = kBounds[0];
                } else if (cmd === "right" || cmd === "右对齐") {
                    newLeft = kBounds[2] - tWidth;
                }

                // 垂直居中 / 居中
                if (cmd === "centery" || cmd === "垂直居中" || cmd === "center" || cmd === "居中") {
                    var keyCenterY = kBounds[1] - (kBounds[1] - kBounds[3]) / 2;
                    newTop = keyCenterY + (tHeight / 2);
                } else if (cmd === "top" || cmd === "顶对齐" || cmd === "顶部对齐") {
                    newTop = kBounds[1];
                } else if (cmd === "bottom" || cmd === "底对齐" || cmd === "底部对齐") {
                    newTop = kBounds[3] + tHeight;
                }
            }

            // 用可见内容计算位移，但整体移动原对象，保留隐藏项及其变量绑定。
            // 不能直接设置 position：编组原点可能仍包含隐藏项，会再次引入偏移。
            var deltaX = newLeft - tBounds[0];
            var deltaY = newTop - tBounds[1];
            if (deltaX === 0 && deltaY === 0) continue;

            // 若对象处于锁定状态，先临时解锁；移动失败也恢复锁定状态。
            var wasLocked = targetItem.locked;
            try {
                if (wasLocked) targetItem.locked = false;
                targetItem.translate(deltaX, deltaY);
            } finally {
                if (wasLocked) targetItem.locked = true;
            }
        } catch (e) {
            continue;
        }
    }
}

multiKeyAlignByNote();

#target illustrator
/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */

/**
 * 一键图片转曲 (Auto Vectorize & Remove White)
 * 
 * 功能流程：
 * 1. 自动嵌入选中的链接图片 (PlacedItem -> RasterItem)
 * 2. 自动进行高质量黑白图像临摹 (Image Trace)
 * 3. 自动将临摹对象扩展为矢量曲线路径 (转曲对象)
 * 4. 自动深度清理白色背景、白色填充物、透明杂项路径与空编组
 * 5. (可选) 自动将保留的图形统一规范为单色纯黑 K100 (避免四色黑印前重影)
 * 6. 自动编组并选中转曲后的矢量图形
 * 
 * 支持：单个/多个图片同时处理、支持选中的编组内图片
 */

(function () {
    // ====================== 核心参数设置 ======================
    var CONFIG = {
        // 黑白临摹阈值 (0-255，默认 128。数值越大黑色区域越多，数值越小黑色区域越少)
        threshold: 128,

        // 是否深度清理白色部分 (true: 删除所有白色路径与背景; false: 保留)
        removeWhite: true,

        // 白色判定容差
        whiteThreshold: {
            rgb: 245,     // R,G,B 均 >= 245 视为白色
            cmyk: 2,      // C,M,Y,K 均 <= 2% 视为白色
            gray: 2       // 灰度 <= 2% (0% 为纯白) 视为白色
        },

        // 在 CMYK 文档模式下，是否强制将矢量图形填充统一设为纯黑 K100 (C0 M0 Y0 K100)
        // 建议开启：彻底杜绝四色黑造成的套印不准与重影
        forceK100: true,

        // 是否弹出完成提示框 (true: 弹窗提示; false: 静默完成)
        showAlert: false,

        // 生成的矢量群组命名前缀
        groupNamePrefix: "转曲矢量图"
    };

    // ====================== 主执行入口 ======================
    function main() {
        if (app.documents.length === 0) {
            alert("【提示】请先在 Illustrator 中打开一个文档！");
            return;
        }

        var doc = app.activeDocument;
        var selection = doc.selection;

        if (!selection || selection.length === 0) {
            alert("【提示】请先使用【选择工具 (V)】选中需要转曲的图片！\n（支持同时选中多张图片或包含图片的编组）");
            return;
        }

        // 步骤 1：收集选区中的所有链接图与位图
        var initialImages = [];
        collectImages(selection, initialImages);

        if (initialImages.length === 0) {
            alert("【提示】当前选中的对象中没有找到任何图片（链接图或位图）！\n请确认选中的是图片对象。");
            return;
        }

        // 步骤 1.1：嵌入链接图 (把图片嵌入AI)
        var hasPlaced = false;
        for (var i = 0; i < initialImages.length; i++) {
            var item = initialImages[i];
            if (item && item.typename === "PlacedItem") {
                try {
                    item.embed();
                    hasPlaced = true;
                } catch (e) {}
            }
        }

        if (hasPlaced) {
            app.redraw();
        }

        // 嵌入后重新收集选区内有效的位图与图片对象
        var processList = [];
        collectImages(doc.selection, processList);

        // 如果重新获取为空（部分AI版本选区刷新问题），回退使用原始列表
        if (processList.length === 0) {
            for (var k = 0; k < initialImages.length; k++) {
                try {
                    if (initialImages[k].typename) {
                        processList.push(initialImages[k]);
                    }
                } catch (e) {}
            }
        }

        if (processList.length === 0) {
            alert("【错误】未能获取可处理的图片对象，请检查图片是否处于锁定图层。");
            return;
        }

        var isCMYKDoc = (doc.documentColorSpace === DocumentColorSpace.CMYK);
        var successCount = 0;
        var whiteRemovedCount = 0;
        var resultGroups = [];

        // 步骤 2 & 3 & 4：逐一进行临摹、扩展转曲、清理白色
        for (var idx = 0; idx < processList.length; idx++) {
            var targetImg = processList[idx];

            try {
                // 2. 使用图像临摹
                var pluginItem = null;
                if (targetImg.typename === "PlacedItem" || targetImg.typename === "RasterItem") {
                    pluginItem = targetImg.trace();
                }

                if (!pluginItem || !pluginItem.tracing) {
                    continue;
                }

                var tracing = pluginItem.tracing;
                var opt = tracing.tracingOptions;

                // 优先尝试载入内置黑白徽标预设
                var presets = ["黑白徽标", "Black and White Logo", "[默认值]", "[Default]"];
                for (var p = 0; p < presets.length; p++) {
                    try {
                        if (opt.loadFromPreset(presets[p])) break;
                    } catch (pe) {}
                }

                // 强制锁定黑白临摹核心参数
                try { opt.tracingMode = TracingModeType.TRACINGMODEBLACKANDWHITE; } catch (e) {}
                try { opt.threshold = CONFIG.threshold; } catch (e) {}
                try { opt.ignoreWhite = CONFIG.removeWhite; } catch (e) {}
                try { opt.fills = true; } catch (e) {}
                try { opt.strokes = false; } catch (e) {}

                // 强制刷新，确保临摹引擎应用配置
                app.redraw();

                // 3. 转曲对象 (扩展为矢量曲线编组)
                var expandedGroup = tracing.expandTracing();

                if (expandedGroup) {
                    expandedGroup.name = CONFIG.groupNamePrefix + "_" + (idx + 1);

                    // 4. 删除白色部分与杂项透明路径
                    if (CONFIG.removeWhite) {
                        var removed = cleanGroup(expandedGroup, isCMYKDoc);
                        whiteRemovedCount += removed;
                    } else if (CONFIG.forceK100 && isCMYKDoc) {
                        applyK100ToAll(expandedGroup);
                    }

                    // 清理空编组
                    cleanupEmptyGroups(expandedGroup);

                    resultGroups.push(expandedGroup);
                    successCount++;
                }
            } catch (err) {
                // 单个对象失败时不中断，继续处理后续对象
            }
        }

        // 步骤 5：整理选区并反馈
        doc.selection = null;
        for (var r = 0; r < resultGroups.length; r++) {
            try {
                resultGroups[r].selected = true;
            } catch (e) {}
        }
        app.redraw();

        if (CONFIG.showAlert) {
            if (successCount > 0) {
                var msg = "【一键转曲完成】\n" +
                          "------------------------------------\n" +
                          "✓ 成功转曲图片数量：" + successCount + " 个\n";
                if (CONFIG.removeWhite) {
                    msg += "✓ 已删除白色/杂项路径：" + whiteRemovedCount + " 个\n";
                }
                if (CONFIG.forceK100 && isCMYKDoc) {
                    msg += "✓ 已统一规范为：单色纯黑 (K100)\n";
                }
                msg += "✓ 转曲后的矢量对象已全部自动选中。";
                alert(msg);
            } else {
                alert("【提示】未成功转曲任何对象。请确认图片未锁定且分辨率适中。");
            }
        }
    }

    // ====================== 辅助函数 ======================

    /**
     * 递归收集选区或编组中的所有图片
     */
    function collectImages(items, result) {
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.typename === "PlacedItem" || item.typename === "RasterItem") {
                result.push(item);
            } else if (item.typename === "GroupItem") {
                collectImages(item.pageItems, result);
            }
        }
    }

    /**
     * 递归清理编组内的白色路径、白色复合路径及无效透明路径
     */
    function cleanGroup(container, isCMYKDoc) {
        if (!container || !container.pageItems) return 0;
        var count = 0;
        var items = container.pageItems;

        // 必须倒序遍历以防索引偏移
        for (var i = items.length - 1; i >= 0; i--) {
            var item = items[i];
            try {
                if (item.typename === "GroupItem") {
                    count += cleanGroup(item, isCMYKDoc);
                    if (item.pageItems.length === 0) {
                        item.remove();
                    }
                } else if (item.typename === "CompoundPathItem") {
                    if (isCompoundPathWhite(item)) {
                        item.remove();
                        count++;
                    } else if (CONFIG.forceK100 && isCMYKDoc) {
                        applyK100ToCompoundPath(item);
                    }
                } else if (item.typename === "PathItem") {
                    if (isPathItemWhiteOrInvisible(item)) {
                        item.remove();
                        count++;
                    } else if (CONFIG.forceK100 && isCMYKDoc) {
                        applyK100ToPath(item);
                    }
                }
            } catch (e) {}
        }
        return count;
    }

    /**
     * 判断普通路径是否为白色或无填充无描边的隐形杂项
     */
    function isPathItemWhiteOrInvisible(path) {
        if (path.clipping) return false; // 剪切蒙版不删除

        // 1. 无填充且无描边 -> 临摹产生的透明杂项路径
        if (!path.filled && !path.stroked) {
            return true;
        }

        // 2. 有填充
        if (path.filled) {
            if (isColorWhite(path.fillColor)) {
                // 若无描边或描边亦为白色，则删除
                if (!path.stroked || isColorWhite(path.strokeColor)) {
                    return true;
                }
            }
        }

        // 3. 无填充但有白色描边
        if (!path.filled && path.stroked && isColorWhite(path.strokeColor)) {
            return true;
        }

        return false;
    }

    /**
     * 判断复合路径是否整体为白色
     */
    function isCompoundPathWhite(cp) {
        if (!cp.pathItems || cp.pathItems.length === 0) return false;

        for (var i = 0; i < cp.pathItems.length; i++) {
            var p = cp.pathItems[i];
            if (p.filled) {
                return isColorWhite(p.fillColor);
            }
        }

        // 无填充时检查描边
        var hasStroke = false;
        for (var j = 0; j < cp.pathItems.length; j++) {
            if (cp.pathItems[j].stroked) {
                hasStroke = true;
                if (!isColorWhite(cp.pathItems[j].strokeColor)) {
                    return false;
                }
            }
        }
        if (!hasStroke) return true; // 全透明
        return true; // 纯白描边
    }

    /**
     * 精确判断颜色是否为白色
     */
    function isColorWhite(color) {
        if (!color) return false;
        try {
            var t = color.typename;
            if (t === "RGBColor") {
                return (color.red >= CONFIG.whiteThreshold.rgb &&
                        color.green >= CONFIG.whiteThreshold.rgb &&
                        color.blue >= CONFIG.whiteThreshold.rgb);
            }
            if (t === "CMYKColor") {
                return (color.cyan <= CONFIG.whiteThreshold.cmyk &&
                        color.magenta <= CONFIG.whiteThreshold.cmyk &&
                        color.yellow <= CONFIG.whiteThreshold.cmyk &&
                        color.black <= CONFIG.whiteThreshold.cmyk);
            }
            if (t === "GrayColor") {
                // Illustrator GrayColor: 0 为纯白，100 为纯黑
                return (color.gray <= CONFIG.whiteThreshold.gray);
            }
            if (t === "SpotColor") {
                if (color.tint <= CONFIG.whiteThreshold.gray) return true;
                if (color.spot && color.spot.color) {
                    return isColorWhite(color.spot.color);
                }
            }
            if (t === "NoColor") {
                return true;
            }
        } catch (e) {}
        return false;
    }

    /**
     * 将普通路径设为纯黑 K100
     */
    function applyK100ToPath(path) {
        try {
            if (path.filled) {
                var c = new CMYKColor();
                c.cyan = 0;
                c.magenta = 0;
                c.yellow = 0;
                c.black = 100;
                path.fillColor = c;
            }
        } catch (e) {}
    }

    /**
     * 将复合路径子项设为纯黑 K100
     */
    function applyK100ToCompoundPath(cp) {
        try {
            var c = new CMYKColor();
            c.cyan = 0;
            c.magenta = 0;
            c.yellow = 0;
            c.black = 100;
            for (var i = 0; i < cp.pathItems.length; i++) {
                if (cp.pathItems[i].filled) {
                    cp.pathItems[i].fillColor = c;
                }
            }
        } catch (e) {}
    }

    /**
     * 递归将组内全部非白对象统一设为纯黑 K100
     */
    function applyK100ToAll(container) {
        if (!container || !container.pageItems) return;
        for (var i = 0; i < container.pageItems.length; i++) {
            var item = container.pageItems[i];
            if (item.typename === "GroupItem") {
                applyK100ToAll(item);
            } else if (item.typename === "CompoundPathItem") {
                applyK100ToCompoundPath(item);
            } else if (item.typename === "PathItem") {
                applyK100ToPath(item);
            }
        }
    }

    /**
     * 递归清理多层空编组
     */
    function cleanupEmptyGroups(group) {
        if (!group || group.typename !== "GroupItem") return;
        for (var i = group.pageItems.length - 1; i >= 0; i--) {
            var sub = group.pageItems[i];
            if (sub.typename === "GroupItem") {
                cleanupEmptyGroups(sub);
                if (sub.pageItems.length === 0) {
                    try { sub.remove(); } catch (e) {}
                }
            }
        }
    }

    // 执行
    main();
})();

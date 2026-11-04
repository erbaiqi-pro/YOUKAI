#target illustrator
/* 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/* 刀线尺寸标注 v0.2.2 测试版：按图形实际边界判断纵向方向，修正上下标反。 */
(function () {
    // 可在这里调整标注外观。距离单位为毫米；字号和线宽单位为 pt。
    var STYLE = {
        offsetMM: 8,
        extensionGapMM: 2,
        extensionOverMM: 2,
        textGapMM: 1.5,
        arrowMM: 1.8,
        fontSizePT: 9,
        lineWidthPT: 0.5,
        decimals: 2
    };
    var PT_PER_MM = 72 / 25.4;
    var TAG = "YOUKAI_DIELINE_DIM_V01|";
    var LAYER_NAME = "尺寸标注";
    var doc = null, oldCoordinates, oldActiveLayer;
    var layer = null, group = null, createdLayer = false, completed = false;
    var oldLocked = false, oldVisible = true, yFactor = 1;

    function showPositionDialog(widthText, heightText) {
        var C_BG = [0.102, 0.106, 0.122, 1];
        var C_CARD = [0.078, 0.086, 0.098, 1];
        var C_RAISED = [0.141, 0.153, 0.173, 1];
        var C_YELLOW = [0.976, 1, 0, 1];
        var C_TEXT = [0.925, 0.925, 0.925, 1];
        var C_DIM = [0.627, 0.651, 0.682, 1];
        var C_RED = [1, 0.2, 0.267, 1];

        function colorControl(control, foreground, background) {
            if (!control || !control.graphics) return;
            var g = control.graphics;
            // 部分 Illustrator 控件不支持这些外观属性；失败时保留原生颜色。
            if (foreground) {
                try { g.foregroundColor = g.newPen(g.PenType.SOLID_COLOR, foreground, 1); }
                catch (unsupportedForeground) {}
            }
            // 复选框、静态文字等继承父容器底色，不直接写 backgroundColor。
            if (background && /^(dialog|palette|window|panel|group)$/.test(String(control.type || ""))) {
                try { g.backgroundColor = g.newBrush(g.BrushType.SOLID_COLOR, background); }
                catch (unsupportedBackground) {}
            }
        }
        function font(control, bold, size) {
            try {
                control.graphics.font = ScriptUI.newFont("Microsoft YaHei UI",
                    bold ? ScriptUI.FontStyle.BOLD : ScriptUI.FontStyle.REGULAR, size);
            } catch (fontError) {}
        }
        function label(parent, text, muted) {
            var result = parent.add("statictext", undefined, text);
            font(result, false, 11);
            colorControl(result, muted ? C_DIM : C_TEXT, null);
            return result;
        }
        function checkbox(parent, text, value) {
            var result = parent.add("checkbox", undefined, text);
            result.value = value;
            result.preferredSize = [112, 26];
            font(result, false, 11);
            colorControl(result, C_TEXT, null);
            return result;
        }
        function button(parent, text, primary) {
            var wrapper = parent.add("group");
            wrapper.orientation = "stack";
            wrapper.alignChildren = ["center", "center"];
            wrapper.margins = 0; wrapper.spacing = 0;
            wrapper.preferredSize = wrapper.minimumSize = wrapper.maximumSize = [primary ? 160 : 100, 32];
            colorControl(wrapper, null, primary ? C_YELLOW : C_RAISED);
            var wrapperEnabled = true;
            var result = wrapper.add("button", undefined, text);
            result.alignment = ["fill", "fill"];
            font(result, true, 11);
            // 沿用已修正的按钮方式：只画背景，标题交给原生文字控件居中。
            var caption = wrapper.add("statictext", undefined, text);
            caption.alignment = ["center", "center"];
            caption.graphics.font = result.graphics.font;
            colorControl(caption, primary ? C_CARD : C_TEXT, null);
            result.caption = caption;
            caption.addEventListener("click", function () {
                if (result.enabled) { result.active = true; result.notify("onClick"); }
            });
            result.onDraw = function () {
                var g = this.graphics, w = this.size.width, h = this.size.height;
                var background = primary && this.enabled ? C_YELLOW : C_RAISED;
                var foreground = this.enabled ? (primary ? C_CARD : C_TEXT) : C_DIM;
                g.newPath(); g.rectPath(0, 0, w, h);
                g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, background));
                g.strokePath(g.newPen(g.PenType.SOLID_COLOR, this.active ? C_YELLOW : C_DIM, 1));
                caption.enabled = this.enabled;
                if (wrapperEnabled !== this.enabled) {
                    colorControl(wrapper, null, background);
                    wrapperEnabled = this.enabled;
                }
                colorControl(caption, foreground, null);
            };
            return result;
        }

        var win = new Window("dialog", "YOUKAI // 刀线尺寸标注");
        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.margins = 16; win.spacing = 12;
        win.preferredSize.width = 400;
        colorControl(win, C_TEXT, C_BG);
        var title = label(win, "选择尺寸标注位置", false);
        font(title, true, 13); colorControl(title, C_YELLOW, null);
        label(win, "整体尺寸：" + widthText + " × " + heightText, true);

        var panel = win.add("panel", undefined, "位置（可多选）");
        panel.orientation = "column";
        panel.alignChildren = ["center", "center"];
        panel.margins = [12, 18, 12, 12]; panel.spacing = 10;
        colorControl(panel, C_DIM, C_CARD); font(panel, false, 10);
        var topBox = checkbox(panel, "上方（宽度）", true);
        var middle = panel.add("group");
        middle.orientation = "row";
        middle.alignChildren = ["center", "center"];
        middle.spacing = 8;
        var leftBox = checkbox(middle, "左侧（高度）", false);
        var target = middle.add("panel");
        target.preferredSize = [68, 52];
        target.alignChildren = ["center", "center"];
        target.margins = 8;
        colorControl(target, C_DIM, C_RAISED);
        label(target, "刀线", true);
        var rightBox = checkbox(middle, "右侧（高度）", true);
        var bottomBox = checkbox(panel, "下方（宽度）", false);
        var status = label(win, "可同时勾选多边；至少保留一个位置。", true);
        status.preferredSize.height = 22;
        var actions = win.add("group");
        actions.orientation = "row";
        actions.alignment = ["right", "center"];
        actions.spacing = 10;
        var cancel = button(actions, "取消", false);
        var generate = button(actions, "生成标注", true);
        function hasPosition() { return topBox.value || bottomBox.value || leftBox.value || rightBox.value; }
        function updateState() {
            generate.enabled = hasPosition();
            status.text = generate.enabled ? "可同时勾选多边；至少保留一个位置。" : "请至少勾选一个标注位置。";
            colorControl(status, generate.enabled ? C_DIM : C_RED, null);
        }
        topBox.onClick = bottomBox.onClick = leftBox.onClick = rightBox.onClick = updateState;
        cancel.onClick = function () { win.close(0); };
        generate.onClick = function () { updateState(); if (hasPosition()) win.close(1); };
        win.defaultElement = generate;
        win.cancelElement = cancel;
        updateState();
        win.center();
        if (win.show() !== 1) return null;
        return { top: topBox.value, bottom: bottomBox.value, left: leftBox.value, right: rightBox.value };
    }

    function boundsYDirection(bounds) {
        if (!bounds || bounds.length !== 4) return 0;
        var top = Number(bounds[1]), bottom = Number(bounds[3]);
        if (!isFinite(top) || !isFinite(bottom) || top === bottom) return 0;
        return top > bottom ? 1 : -1;
    }

    function detectYDirection(items) {
        // geometricBounds 的顺序是左、上、右、下，直接以图形的上下边为准。
        // 不用画板坐标转换的正负推断，避免与实际绘图坐标不一致时上下颠倒。
        for (var i = 0; i < items.length; i += 1) {
            try {
                var direction = boundsYDirection(items[i].geometricBounds);
                if (direction) return direction;
            } catch (unavailableBounds) {}
        }
        // 选区只有水平线等零高对象时，使用文档画板的上下边确定方向。
        var artboardDirection = boundsYDirection(doc.artboards[0].artboardRect);
        if (!artboardDirection) throw new Error("无法确定文档坐标方向。");
        return artboardDirection;
    }

    function merge(a, b) {
        if (!b) return a;
        if (!a) return [b[0], b[1], b[2], b[3]];
        return [Math.min(a[0], b[0]), Math.max(a[1], b[1]),
            Math.max(a[2], b[2]), Math.min(a[3], b[3])];
    }

    // 内部统一使用 Y 向上的坐标；绘制前再换回当前文档坐标。
    function canonicalBounds(item) {
        var b = item.geometricBounds;
        if (!b || b.length !== 4) throw new Error("无法读取刀线的几何尺寸。");
        for (var i = 0; i < 4; i += 1) {
            if (!isFinite(Number(b[i]))) throw new Error("刀线坐标包含无效数值。");
        }
        return [Math.min(b[0], b[2]), Math.max(b[1] * yFactor, b[3] * yFactor),
            Math.max(b[0], b[2]), Math.min(b[1] * yFactor, b[3] * yFactor)];
    }

    function isOurGroup(item) {
        return item.typename === "GroupItem" && String(item.note || "").indexOf(TAG) === 0;
    }

    function skipItem(item) {
        var current = item;
        while (current && current.typename !== "Document") {
            if (current.hidden === true || isOurGroup(current)) return true;
            if (current.typename === "Layer" && current.visible === false) return true;
            current = current.parent;
        }
        return false;
    }

    function clippingItem(item) {
        if (item.typename === "PathItem") return item.clipping === true;
        if (item.typename === "CompoundPathItem") {
            for (var i = 0; i < item.pathItems.length; i += 1) {
                if (item.pathItems[i].clipping === true) return true;
            }
        }
        return false;
    }

    function vectorBounds(item) {
        if (skipItem(item)) return null;
        if (item.typename === "PathItem") {
            if (item.guides === true) return null;
            return canonicalBounds(item);
        }
        if (item.typename === "CompoundPathItem") {
            if (!item.pathItems.length) return null;
            return canonicalBounds(item);
        }
        if (item.typename !== "GroupItem") return null;

        var children = item.pageItems, result = null, i, child;
        if (item.clipped === true) {
            for (i = 0; i < children.length; i += 1) {
                child = children[i];
                if (child.parent === item && clippingItem(child)) return canonicalBounds(child);
            }
            throw new Error("未找到剪切组的剪切路径，请直接选中外轮廓刀线后重试。");
        }
        for (i = 0; i < children.length; i += 1) {
            child = children[i];
            if (child.parent === item) result = merge(result, vectorBounds(child));
        }
        return result;
    }

    function formatMM(points) {
        var scale = Math.pow(10, STYLE.decimals);
        var millimetres = Math.round((points / PT_PER_MM + 0.000000001) * scale) / scale;
        var value = millimetres.toFixed(STYLE.decimals);
        if (value.indexOf(".") >= 0) value = value.replace(/0+$/, "").replace(/\.$/, "");
        return value + " mm";
    }

    function makeColor() {
        var color;
        if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
            color = new CMYKColor();
            color.cyan = 0; color.magenta = 100; color.yellow = 100; color.black = 0;
        } else {
            color = new RGBColor();
            color.red = 230; color.green = 35; color.blue = 35;
        }
        return color;
    }

    function addPath(points, filled, color, name) {
        var path = group.pathItems.add(), nativePoints = [];
        for (var i = 0; i < points.length; i += 1) nativePoints.push([points[i][0], points[i][1] * yFactor]);
        path.name = name;
        path.setEntirePath(nativePoints);
        path.closed = filled;
        path.filled = filled;
        path.stroked = !filled;
        path.opacity = 100;
        if (filled) path.fillColor = color;
        else {
            path.strokeColor = color;
            path.strokeWidth = STYLE.lineWidthPT;
            path.strokeDashes = [];
        }
        return path;
    }

    function addLabel(contents, vertical, center, edge, color, direction) {
        var text = group.textFrames.add();
        text.name = vertical ? "高度尺寸" : "宽度尺寸";
        text.contents = contents;
        var attributes = text.textRange.characterAttributes;
        attributes.size = STYLE.fontSizePT;
        attributes.fillColor = color;
        attributes.strokeColor = new NoColor();
        var fonts = ["ArialMT", "MyriadPro-Regular"];
        for (var i = 0; i < fonts.length; i += 1) {
            try { attributes.textFont = app.textFonts.getByName(fonts[i]); break; } catch (missingFont) {}
        }
        if (vertical) text.rotate(90);
        var b = canonicalBounds(text), dx, dy;
        if (vertical) { dx = edge - (direction < 0 ? b[2] : b[0]); dy = center - (b[1] + b[3]) / 2; }
        else { dx = center - (b[0] + b[2]) / 2; dy = edge - (direction < 0 ? b[1] : b[3]); }
        text.translate(dx, dy * yFactor);
    }

    function addWidthDimension(bounds, direction, color) {
        var left = bounds[0], right = bounds[2];
        var edgeY = direction > 0 ? bounds[1] : bounds[3];
        var dimY = edgeY + direction * STYLE.offsetMM * PT_PER_MM;
        var gap = direction * STYLE.extensionGapMM * PT_PER_MM;
        var over = direction * STYLE.extensionOverMM * PT_PER_MM;
        var arrow = Math.min(STYLE.arrowMM * PT_PER_MM, (right - left) / 5);
        var prefix = direction > 0 ? "上方" : "下方";
        addPath([[left, edgeY + gap], [left, dimY + over]], false, color, prefix + "宽度左延伸线");
        addPath([[right, edgeY + gap], [right, dimY + over]], false, color, prefix + "宽度右延伸线");
        addPath([[left, dimY], [right, dimY]], false, color, prefix + "宽度尺寸线");
        addPath([[left, dimY], [left + arrow, dimY + arrow / 3], [left + arrow, dimY - arrow / 3]], true, color, prefix + "宽度左箭头");
        addPath([[right, dimY], [right - arrow, dimY + arrow / 3], [right - arrow, dimY - arrow / 3]], true, color, prefix + "宽度右箭头");
        addLabel(formatMM(right - left), false, (left + right) / 2,
            dimY + direction * STYLE.textGapMM * PT_PER_MM, color, direction);
    }

    function addHeightDimension(bounds, direction, color) {
        var top = bounds[1], bottom = bounds[3];
        var edgeX = direction > 0 ? bounds[2] : bounds[0];
        var dimX = edgeX + direction * STYLE.offsetMM * PT_PER_MM;
        var gap = direction * STYLE.extensionGapMM * PT_PER_MM;
        var over = direction * STYLE.extensionOverMM * PT_PER_MM;
        var arrow = Math.min(STYLE.arrowMM * PT_PER_MM, (top - bottom) / 5);
        var prefix = direction > 0 ? "右侧" : "左侧";
        addPath([[edgeX + gap, top], [dimX + over, top]], false, color, prefix + "高度上延伸线");
        addPath([[edgeX + gap, bottom], [dimX + over, bottom]], false, color, prefix + "高度下延伸线");
        addPath([[dimX, top], [dimX, bottom]], false, color, prefix + "高度尺寸线");
        addPath([[dimX, top], [dimX - arrow / 3, top - arrow], [dimX + arrow / 3, top - arrow]], true, color, prefix + "高度上箭头");
        addPath([[dimX, bottom], [dimX - arrow / 3, bottom + arrow], [dimX + arrow / 3, bottom + arrow]], true, color, prefix + "高度下箭头");
        addLabel(formatMM(top - bottom), true, (top + bottom) / 2,
            dimX + direction * STYLE.textGapMM * PT_PER_MM, color, direction);
    }

    function findLayer() {
        // 通过本脚本自己的编组标记识别，不依赖可能重名的图层名称。
        for (var i = 0; i < doc.layers.length; i += 1) {
            var candidate = doc.layers[i];
            for (var j = 0; j < candidate.groupItems.length; j += 1) {
                var candidateGroup = candidate.groupItems[j];
                if (candidateGroup.parent === candidate && isOurGroup(candidateGroup)) return candidate;
            }
        }
        createdLayer = true;
        var result = doc.layers.add();
        result.name = LAYER_NAME;
        return result;
    }

    try {
        if (typeof app === "undefined" || String(app.name).toLowerCase().indexOf("illustrator") < 0) {
            throw new Error("请在 Illustrator 中运行此脚本。");
        }
        if (!app.documents.length) throw new Error("请先打开 AI 文档。");
        doc = app.activeDocument;
        if (!doc.selection || !doc.selection.length) {
            throw new Error("请先选中亚克力刀线的外轮廓、复合路径或刀线编组。");
        }
        if (doc.selection.typename === "TextRange" || doc.selection.typename === "InsertionPoint") {
            throw new Error("请退出文字编辑状态，改用选择工具选中矢量刀线。");
        }
        var selected = [], i;
        for (i = 0; i < doc.selection.length; i += 1) {
            if (doc.selection[i] && doc.selection[i].typename) selected.push(doc.selection[i]);
        }
        oldActiveLayer = doc.activeLayer;
        oldCoordinates = app.coordinateSystem;
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        yFactor = detectYDirection(selected);

        var bounds = null;
        for (i = 0; i < selected.length; i += 1) bounds = merge(bounds, vectorBounds(selected[i]));
        if (!bounds) throw new Error("没有选中可测量的矢量刀线。图片和文字不参与测量。");
        var left = bounds[0], top = bounds[1], right = bounds[2], bottom = bounds[3];
        var width = right - left, height = top - bottom;
        if (width < 0.001 || height < 0.001) throw new Error("所选刀线的宽或高为零，请选中完整外轮廓。");

        var positions = showPositionDialog(formatMM(width), formatMM(height));
        if (!positions) return;

        var keyParts = [];
        for (i = 0; i < 4; i += 1) keyParts.push(bounds[i].toFixed(4));
        var key = TAG + keyParts.join(",");
        layer = findLayer();
        oldLocked = layer.locked; oldVisible = layer.visible;
        layer.locked = false; layer.visible = true;
        var previous = [];
        for (i = 0; i < layer.groupItems.length; i += 1) {
            if (layer.groupItems[i].parent === layer && layer.groupItems[i].note === key) previous.push(layer.groupItems[i]);
        }
        group = layer.groupItems.add();
        group.name = "刀线尺寸 " + formatMM(width) + " × " + formatMM(height);
        group.note = key;
        var color = makeColor();
        if (positions.top) addWidthDimension(bounds, 1, color);
        if (positions.bottom) addWidthDimension(bounds, -1, color);
        if (positions.left) addHeightDimension(bounds, -1, color);
        if (positions.right) addHeightDimension(bounds, 1, color);

        // 新标注完整生成后，只替换本脚本在同一范围的旧标注。
        for (i = 0; i < previous.length; i += 1) previous[i].remove();
        layer.locked = true;
        completed = true;
        app.redraw();
    } catch (error) {
        if (!completed) {
            try { if (group) group.remove(); } catch (cleanupGroup) {}
            if (createdLayer && layer) {
                try { layer.remove(); layer = null; } catch (cleanupLayer) {}
            }
        }
        var message = "刀线尺寸标注：\n" + (error.message || String(error));
        if (typeof $ !== "undefined" && $.global && $.global.YOUKAI_BATCH) throw new Error(message);
        alert(message);
    } finally {
        if (layer && !completed) {
            try { layer.locked = oldLocked; layer.visible = oldVisible; } catch (restoreLayer) {}
        }
        if (doc && oldActiveLayer) { try { doc.activeLayer = oldActiveLayer; } catch (restoreActiveLayer) {} }
        if (typeof oldCoordinates !== "undefined") { try { app.coordinateSystem = oldCoordinates; } catch (restoreCoordinates) {} }
    }
})();

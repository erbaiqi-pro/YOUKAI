#target illustrator
/*
 * YOUKAI 1.0 | 建立画板 | 作者：二百七
 * Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
 * 来源标识：YOUKAI-ARTBOARD-20261103
 * 来源：作者提供的正向/逆向修复版；仅新增本注释，运行代码保持原样。
 * 原始脚本 SHA256（不含本注释的完整原文件字节）：
 * badf0c3b7075b807ff772baedd43969930d9e40e7089389cf595a5f111ee06be
 * 此标识用于署名与版本溯源；发行文件以随附校验记录为准。
 */

(function () {
    if (!app.documents.length) {
        alert("没有打开的文档");
        return;
    }

    var doc = app.activeDocument;
    var selectedItems = doc.selection;

    if (!selectedItems || !selectedItems.length) {
        alert("请先选择一些对象");
        return;
    }

    // 对话框：选择命名方向
    var dialog = new Window("dialog", "选择命名方向");
    dialog.orientation = "column";
    dialog.alignChildren = "fill";

    var group = dialog.add("group");
    group.orientation = "row";

    var forwardBtn = group.add("radiobutton", undefined, "正向 (001, 002, 003...)");
    var reverseBtn = group.add("radiobutton", undefined, "逆向 (..., 003, 002, 001)");
    forwardBtn.value = true;

    var btnGroup = dialog.add("group");
    btnGroup.alignment = "center";
    var okBtn = btnGroup.add("button", undefined, "确定");
    var cancelBtn = btnGroup.add("button", undefined, "取消");

    // 必须绑定 onClick，中文按钮文字不会被 ScriptUI 自动识别为 OK/Cancel
    okBtn.onClick = function () { dialog.close(1); };
    cancelBtn.onClick = function () { dialog.close(0); };

    var result = dialog.show();
    if (result !== 1) return;

    var isForward = forwardBtn.value;
    var total = selectedItems.length;
    var oldCount = doc.artboards.length;

    try {
        for (var i = 0; i < total; i++) {
            // 正向：按选择顺序创建画板
            // 逆向：反向选择顺序创建画板
            // 名称始终按画板位置递增，确保画板序号与名称一一对应
            var selIdx = isForward ? i : (total - 1 - i);
            var item = selectedItems[selIdx];
            if (!item) continue;

            var bounds;
            try {
                bounds = item.visibleBounds;
            } catch (e) { continue; }
            if (!bounds || bounds.length < 4) continue;

            var ab = doc.artboards.add([bounds[0], bounds[1], bounds[2], bounds[3]]);
            ab.name = pad3(i + 1);
        }

        // 从后往前删除旧画板，避免索引偏移
        for (var j = oldCount - 1; j >= 0; j--) {
            doc.artboards[j].remove();
        }
    } catch (err) {
        alert("创建画板失败：" + (err.message || String(err)));
    }

    // 百进位补零：001, 002, ..., 009, 010, ..., 099, 100
    function pad3(n) {
        if (n < 10) return "00" + n;
        if (n < 100) return "0" + n;
        return String(n);
    }
})();

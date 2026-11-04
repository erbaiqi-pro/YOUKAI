#target illustrator
/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/* 文档净化转曲 v1.0：沿用打包脚本的清理、转曲步骤；保存由用户或批处理选项控制。 */
(function () {
    if (typeof app === "undefined" || String(app.name).toLowerCase().indexOf("illustrator") < 0) {
        throw new Error("文档净化转曲只支持 Illustrator。");
    }
    if (app.documents.length === 0) {
        throw new Error("请先打开需要清理和转曲的 AI 文档。");
    }

    var doc = app.activeDocument;
    var stage = "显示并解锁图层";
    try {
        // 与当前打包脚本保持相同处理顺序。
        for (var i = 0; i < doc.layers.length; i += 1) {
            doc.layers[i].visible = true;
            doc.layers[i].locked = false;
        }
        app.redraw();

        stage = "解锁对象";
        doc.selection = null;
        app.executeMenuCommand("unlockAll");
        app.redraw();
        $.sleep(100);

        // showAll 会选中原本隐藏的对象；先清空原选区，避免误删已选中的可见内容。
        stage = "清理隐藏对象";
        doc.selection = null;
        app.executeMenuCommand("showAll");
        app.redraw();
        $.sleep(100);
        app.executeMenuCommand("clear");
        app.redraw();
        $.sleep(100);

        stage = "文字转曲";
        doc.selection = null;
        app.executeMenuCommand("Text Objects menu item");
        app.redraw();
        $.sleep(100);
        if (doc.selection && doc.selection.length > 0) {
            $.sleep(100);
            app.executeMenuCommand("outline");
        }
        app.redraw();
        // 保留当前文档供检查；不调用保存、另存、关闭或链接复制。
    } catch (error) {
        throw new Error("文档净化转曲在“" + stage + "”时失败：" +
            (error.message || String(error)) + "\n当前文档可能已有部分修改，请检查后再保存。");
    }
})();

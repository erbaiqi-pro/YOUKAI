#target illustrator
/* 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/* 链接按文件夹命名 v0.1 测试版：只修改当前 AI 的链接对象名称，不修改磁盘文件或原换图脚本。 */
(function () {
    function message(error) {
        return error && error.message ? error.message : String(error);
    }

    function folderName(folder) {
        var name = String(folder.name || "");
        // ExtendScript 的 Folder.name 可能采用 URI 编码；只解码一次。
        try { name = decodeURIComponent(name); } catch (notEncoded) {}
        if (!name.replace(/^\s+|\s+$/g, "") || /^[a-z]:$/i.test(name)) {
            throw new Error("来源位于根目录或没有可用的文件夹名。");
        }
        return name;
    }

    function renameObject(item, name) {
        var locked = [], unlocked = [], current = item, failure = "", changed = false;
        while (current && current.typename !== "Document") {
            if (current.locked === true) locked.push(current);
            current = current.parent;
        }
        try {
            // 先解锁外层，再处理链接对象；显隐和图层名称保持原样。
            for (var i = locked.length - 1; i >= 0; i -= 1) {
                locked[i].locked = false;
                unlocked.push(locked[i]);
            }
            item.name = name;
            if (String(item.name) !== name) throw new Error("宿主没有接受新的对象名称。");
            changed = true;
        } catch (error) {
            failure = message(error);
        } finally {
            for (var j = unlocked.length - 1; j >= 0; j -= 1) {
                try { unlocked[j].locked = true; }
                catch (restoreError) {
                    failure += (failure ? "；" : "") + "锁定状态还原失败：" + message(restoreError);
                }
            }
        }
        return { changed: changed, error: failure };
    }

    try {
        if (typeof app === "undefined" || String(app.name).toLowerCase().indexOf("illustrator") < 0) {
            alert("请在 Illustrator 中运行“链接按文件夹命名”。");
            return;
        }
        if (!app.documents.length) {
            alert("请先打开 AI 文档，并从各素材文件夹拖入链接图片。");
            return;
        }
        var doc = app.activeDocument;
        var items = [], i;
        // 处理当前文档全部外部链接，不受最后一次拖入时的选区限制。
        for (i = 0; i < doc.placedItems.length; i += 1) items.push(doc.placedItems[i]);
        if (!items.length) {
            alert("当前文档没有外部链接图片。\n请用链接方式置入；已嵌入的图片无法读取来源文件夹。");
            return;
        }

        var changed = 0, unchanged = 0, issues = [];
        for (i = 0; i < items.length; i += 1) {
            var description = "第 " + (i + 1) + " 个链接";
            try {
                var item = items[i];
                var file = item.file;
                if (!file) throw new Error("无法读取外部链接来源。");
                if (file.fsName) description = String(file.fsName);
                if (!file.exists) throw new Error("源文件不存在，请先修复链接。");
                if (!file.parent) throw new Error("无法读取来源文件夹。");
                var name = folderName(file.parent);
                if (String(item.name || "") === name) {
                    unchanged += 1;
                    continue;
                }
                var result = renameObject(item, name);
                if (result.changed) changed += 1;
                if (result.error) {
                    issues.push(description + "：" + (result.changed ? "名称已更新；" : "未改名；") + result.error);
                }
            } catch (error) {
                issues.push(description + "：" + message(error));
            }
        }
        if (changed) { try { app.redraw(); } catch (redrawError) {} }
        var summary = "链接按文件夹命名完成\n已改名：" + changed + " 个\n原本一致：" + unchanged + " 个";
        if (issues.length) {
            summary += "\n跳过或异常：" + issues.length + " 项\n";
            var limit = Math.min(issues.length, 8);
            for (i = 0; i < limit; i += 1) summary += "\n" + issues[i];
            if (issues.length > limit) summary += "\n另有 " + (issues.length - limit) + " 项，请检查文档链接。";
        }
        summary += "\n\n只更新 AI 中的链接对象名，未自动保存文档。";
        alert(summary);
    } catch (error) {
        alert("链接按文件夹命名未完成：\n" + message(error));
    }
})();

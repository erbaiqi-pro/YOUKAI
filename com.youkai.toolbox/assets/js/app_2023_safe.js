/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
(function () {
    "use strict";
    if (typeof CSInterface !== "undefined" && CSInterface.prototype) {
        CSInterface.prototype.evalScript = function (script, callback) {
            if (callback === null || callback === undefined) callback = function () {};
            var cep = window.__adobe_cep__ || (window.top && window.top.__adobe_cep__) || (window.parent && window.parent.__adobe_cep__);
            if (cep && typeof cep.evalScript === "function") {
                cep.evalScript(script, callback);
            } else {
                callback("EvalScript error: No CEP environment");
            }
        };
    }
    var fs = require("fs"), path = require("path"), cs = new CSInterface();
    var SystemPath = window.SystemPath || { EXTENSION: "extension" };
    
    // 净化路径前缀
    var rawRoot = cs.getSystemPath(SystemPath.EXTENSION || "extension");
    rawRoot = cleanSystemPath(rawRoot);
    if (!rawRoot && typeof __dirname !== "undefined") {
        rawRoot = path.resolve(__dirname, "..", "..");
    }
    var root = rawRoot ? path.normalize(rawRoot) : "";

    var scripts = [], filtered = [], selectedIndex = -1;
    var jsxLoaded = false;
    var scriptRunning = false;

    function cleanSystemPath(value) {
        var text = String(value || "");
        if (/^file:/i.test(text)) {
            text = text.replace(/^file:\/\//i, "");
            if (process.platform === "win32") text = text.replace(/^\/([a-z]:)/i, "$1");
        }
        try { return decodeURIComponent(text); } catch (e) { return text; }
    }
    function escapeHtml(value) {
        return String(value || "").replace(/[&<>"']/g, function(ch) {
            return {"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[ch];
        });
    }
    function byId(id) { return document.getElementById(id); }

    function ensureJsxLoaded(callback) {
        if (jsxLoaded) {
            if (typeof callback === "function") callback(true);
            return;
        }
        cs.evalScript('(typeof Youkai !== "undefined" && typeof Youkai.runScript === "function") ? "OK" : "NO"', function(res) {
            if (res === "OK") {
                jsxLoaded = true;
                if (typeof callback === "function") callback(true);
                return;
            }
            var extRoot = root || cleanSystemPath(cs.getSystemPath(SystemPath.EXTENSION || "extension"));
            var mainJsxPath = path.join(extRoot, "scripts", "main.jsx").replace(/\\/g, "/");
            var loadCode = 'try { $.evalFile(' + JSON.stringify(mainJsxPath) + '); "LOADED"; } catch(err) { "ERR:" + err.toString() + (err.line ? " [main.jsx:" + err.line + "]" : ""); }';
            cs.evalScript(loadCode, function(loadRes) {
                cs.evalScript('(typeof Youkai !== "undefined" && typeof Youkai.runScript === "function") ? "OK" : "NO"', function(checkRes) {
                    if (checkRes === "OK") {
                        jsxLoaded = true;
                        if (typeof callback === "function") callback(true);
                    } else {
                        if (typeof callback === "function") callback(false, loadRes);
                    }
                });
            });
        });
    }

    function init() {
        if (byId("status")) byId("status").style.display = "none";
        if (byId("refreshBtn")) byId("refreshBtn").onclick = scan;
        if (byId("search")) byId("search").oninput = filter;
        if (byId("runBtn")) byId("runBtn").onclick = run;
        if (byId("copyBtn")) byId("copyBtn").onclick = function() {
            var range = document.createRange();
            range.selectNodeContents(byId("output"));
            var selection = window.getSelection();
            selection.removeAllRanges(); selection.addRange(range);
            document.execCommand("copy"); selection.removeAllRanges();
        };
        scan();
        if (window.YoukaiUpdateUI) window.YoukaiUpdateUI.start({root: root, userData: cleanSystemPath(cs.getSystemPath("userData")) || require("os").homedir(), cs: cs, isBusy: function () { return scriptRunning; }});
    }

    function scan() {
        scripts = [];
        var dir = path.join(root, "user_scripts"); 

        if (!fs.existsSync(dir)) {
            try { fs.mkdirSync(dir, {recursive:true}); } catch(e){}
        }
        if (fs.existsSync(dir)) {
            var list = fs.readdirSync(dir);
            list.forEach(function(item) {
                if (/\.jsx?$/i.test(item)) {
                    scripts.push({ name: item, fullPath: path.join(dir, item) });
                }
            });
        }
        selectedIndex = -1;
        filter();
    }

    function filter() {
        selectedIndex = -1;
        var q = byId("search") ? byId("search").value.toLowerCase() : "";
        filtered = scripts.filter(function(s) { return s.name.toLowerCase().indexOf(q) >= 0; });
        var html = "";
        filtered.forEach(function(s, i) {
            var cls = "item" + (i === selectedIndex ? " selected" : "");
            html += '<button class="' + cls + '" data-idx="' + i + '" style="width:100%; text-align:left; padding:8px; margin-bottom:2px; border:none; background:#141619; color:#fff; cursor:pointer;">' + escapeHtml(s.name) + '</button>';
        });
        if (byId("list")) {
            byId("list").innerHTML = html || '<div style="padding:10px; color:#555;">未找到脚本</div>';
            
            var btns = byId("list").getElementsByTagName("button");
            for (var b = 0; b < btns.length; b++) {
                btns[b].onclick = function() {
                    selectedIndex = parseInt(this.getAttribute("data-idx"), 10);
                    for(var j=0; j<btns.length; j++) { btns[j].style.background="#141619"; btns[j].style.borderLeft="none"; }
                    this.style.background = "#1C1E22";
                    this.style.borderLeft = "3px solid #F9FF00";
                };
            }
        }
    }

    function run() {
        if (window.YOUKAI_UPDATE_BUSY || scriptRunning) return;
        if (selectedIndex < 0 || !filtered[selectedIndex]) {
            if (byId("output")) byId("output").textContent = "请先在列表中点击选择一个脚本。";
            return;
        }
        var s = filtered[selectedIndex];
        scriptRunning = true;
        if (byId("output")) byId("output").textContent = "正在调用 Youkai 内核运行: " + s.name;
        
        ensureJsxLoaded(function(loaded, errReason) {
            if (!loaded) {
                scriptRunning = false;
                if (byId("output")) byId("output").textContent = "错误: ExtendScript 引擎未就绪 (" + (errReason || "main.jsx 未能载入") + ")";
                return;
            }
            var escapedPath = JSON.stringify(s.fullPath);
            var scriptCode = 'try { (typeof Youkai !== "undefined" && typeof Youkai.runScript === "function") ? Youkai.runScript(' + escapedPath + ', "auto", "", "", "") : JSON.stringify({ ok: false, message: "Youkai 宿主对象未初始化" }); } catch(err) { JSON.stringify({ ok: false, message: err.toString() }); }';
            cs.evalScript(scriptCode, function(res) {
                scriptRunning = false;
                if (byId("output")) {
                    try {
                        if (res && res.indexOf("EvalScript error") >= 0) {
                            cs.evalScript('try { (app.documents.length === 0 ? "请先新建或打开一个 AI 文档" : ($.error ? String($.error) : "ExtendScript 引擎忙碌或异常")); } catch(e) { e.toString(); }', function(diagRes) {
                                byId("output").textContent = "执行失败:\n" + (diagRes || "ExtendScript 异常");
                            });
                            return;
                        }
                        var parsed = JSON.parse(res);
                        if (parsed.ok) {
                            byId("output").textContent = "执行成功:\n" + parsed.message;
                        } else {
                            byId("output").textContent = "错误:\n" + parsed.message;
                        }
                    } catch(e) {
                        byId("output").textContent = "返回结果:\n" + res;
                    }
                }
            });
        });
    }

    window.onload = init;
})();

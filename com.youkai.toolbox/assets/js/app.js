/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
(function () {
  "use strict";
  // 核心防御补丁：彻底消除因 navigator.userAgent 缺少 "CEP" 导致的 No CEP environment 假报错
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
  var fs = require("fs"), path = require("path"), os = require("os"), execFile = require("child_process").execFile, cs = new CSInterface();
  var SystemPath = window.SystemPath || { EXTENSION: "extension", USER_DATA: "userData" };
  
  var rawRoot = cleanSystemPath(cs.getSystemPath(SystemPath.EXTENSION || "extension"));
  if (!rawRoot && typeof __dirname !== "undefined") {
    rawRoot = path.resolve(__dirname, "..", "..");
  }
  var root = rawRoot ? path.normalize(rawRoot) : "";
  var rawUserData = cleanSystemPath(cs.getSystemPath(SystemPath.USER_DATA || "userData"));
  var batchDir = path.join(rawUserData || root || os.tmpdir(), "Youkai", "batch");
  
  var state = {
    sources: [],
    activeSourceId: "all",
    files: [],
    filtered: [],
    selectedPath: "",
    batchPoller: null,
    batchPaths: null,
    paths: {
      outputFolder: "",
      exportFolder: "",
      csvFolder: ""
    },
    shortcuts: {}
  };
  var singleScriptRunning = false;

  function byId(id) { return document.getElementById(id); }

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
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function toEvalString(value) {
    return JSON.stringify(String(value || ""));
  }

  function isLegacyBatchScript(name) {
    return /^(单批处理|双批处理)\.jsx?$/i.test(String(name || ""));
  }

  var jsxLoaded = false;
  function ensureJsxLoaded(callback) {
    if (jsxLoaded) {
      if (typeof callback === "function") callback(true);
      return;
    }
    // 探测宿主 ExtendScript 中 Youkai 对象是否存在
    cs.evalScript('(typeof Youkai !== "undefined" && typeof Youkai.runScript === "function") ? "OK" : "NO"', function(res) {
      if (res === "OK") {
        jsxLoaded = true;
        if (typeof callback === "function") callback(true);
        return;
      }
      // 若未载入（可能因 CEP 相对路径解析失败或版本冲突未载入），通过 $.evalFile 强行动态载入
      var extRoot = root || cleanSystemPath(cs.getSystemPath(SystemPath.EXTENSION || "extension"));
      var mainJsxPath = path.join(extRoot, "scripts", "main.jsx").replace(/\\/g, "/");
      var loadCode = 'try { $.evalFile(' + toEvalString(mainJsxPath) + '); "LOADED"; } catch(err) { "ERR:" + err.toString() + (err.line ? " [main.jsx:" + err.line + "]" : ""); }';
      cs.evalScript(loadCode, function(loadRes) {
        cs.evalScript('(typeof Youkai !== "undefined" && typeof Youkai.runScript === "function") ? "OK" : "NO"', function(checkRes) {
          if (checkRes === "OK") {
            jsxLoaded = true;
            console.log("[YOUKAI] main.jsx 已通过 $.evalFile 动态装载完毕！");
            if (typeof callback === "function") callback(true);
          } else {
            console.error("[YOUKAI ERROR] 动态载入 main.jsx 失败:", loadRes);
            if (typeof callback === "function") callback(false, loadRes);
          }
        });
      });
    });
  }

  function isDriveValid(targetPath) {
    if (!targetPath) return false;
    try {
      if (process.platform === "win32") {
        var m = String(targetPath).match(/^([a-zA-Z]):[\\\/]/);
        if (m) {
          var driveRoot = m[1].toUpperCase() + ":\\";
          return fs.existsSync(driveRoot);
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 检查路径是否属于受保护的系统区 (Windows Program Files 或 macOS /Applications, /Library)
   */
  function isSystemProtectedPath(targetPath) {
    if (!targetPath) return false;
    var normalized = path.normalize(targetPath).toLowerCase();
    return normalized.indexOf("program files") >= 0 || normalized.indexOf("/applications") === 0 || normalized.indexOf("/library") === 0;
  }

  /**
   * 获取 Safe 默认用户独占 CSV 路径 (跨平台兼容 Windows / macOS)
   */
  function getDefaultCsvFolderPath() {
    var isWin = process.platform === "win32";
    var fallbackBase = isWin 
      ? path.join(os.homedir(), "AppData", "Roaming") 
      : path.join(os.homedir(), "Library", "Application Support");
    var baseDir = rawUserData || fallbackBase;
    return path.join(baseDir, "com.youkai.toolbox", "csv");
  }

  /**
   * 获取 Youkai 专属配置 CSV 托管目录（带防保护区净化）
   */
  function getCsvFolderPath() {
    var customPath = state && state.paths && state.paths.csvFolder;
    if (!customPath || isSystemProtectedPath(customPath)) {
      return getDefaultCsvFolderPath();
    }
    return customPath;
  }

  /**
   * 自动检测并初始化预装 CSV 模板
   */
  function initCsvTemplates() {
    var targetFolder = getCsvFolderPath();
    var templateFolder = path.join(root, "assets", "templates");

    if (!fs.existsSync(templateFolder)) {
      return {
        ok: false,
        message: "未找到模版源文件夹：\n" + templateFolder + "\n\n请在插件安装包下手动创建 assets/templates 文件夹并放入默认 CSV 模板。"
      };
    }

    if (!fs.existsSync(targetFolder)) {
      try {
        fs.mkdirSync(targetFolder, { recursive: true });
      } catch(e) {
        return {
          ok: false,
          message: "无法创建目标 CSV 文件夹（权限受限）：\n" + targetFolder + "\n\n错误信息: " + e.message
        };
      }
    }

    var copiedCount = 0;
    var existingCount = 0;

    try {
      var legacyCsvNames = ["战队色修改.csv", "战队色.csv"];
      var schemeCsv = path.join(targetFolder, "色板方案切换.csv");
      for (var legacyIndex = 0; legacyIndex < legacyCsvNames.length && !fs.existsSync(schemeCsv); legacyIndex++) {
        var legacyCsv = path.join(targetFolder, legacyCsvNames[legacyIndex]);
        if (fs.existsSync(legacyCsv)) fs.copyFileSync(legacyCsv, schemeCsv);
      }
      var items = fs.readdirSync(templateFolder);
      items.forEach(function(item) {
        if (/\.csv$/i.test(item)) {
          var srcFile = path.join(templateFolder, item);
          var destFile = path.join(targetFolder, item);
          
          if (!fs.existsSync(destFile)) {
            fs.copyFileSync(srcFile, destFile);
            copiedCount++;
          } else {
            existingCount++;
          }
          // 强制剥离只读标记
          try { fs.chmodSync(destFile, 438); } catch(e){}
        }
      });

      return {
        ok: true,
        copied: copiedCount,
        existing: existingCount,
        targetFolder: targetFolder,
        templateFolder: templateFolder
      };
    } catch(e) {
      return {
        ok: false,
        message: "复制 CSV 模板时发生错误：\n" + e.message
      };
    }
  }

  /**
   * 唤起系统默认软件 (Excel/WPS) 打开 CSV 文件
   */
  function openCsvWithDefaultApp(csvPath) {
    if (!fs.existsSync(csvPath)) {
      alert("[YOUKAI 提示]\n未找到对应的配置文件：\n" + csvPath + "\n\n请先保存路径配置以自动生成模板。");
      return;
    }

    try { fs.chmodSync(csvPath, 438); } catch(e){}

    ensureJsxLoaded(function(loaded, reason) {
      if (!loaded) { alert("无法打开 CSV 文件：" + (reason || "宿主尚未就绪")); return; }
      cs.evalScript('Youkai.openCsvFile(' + toEvalString(csvPath) + ')', function(response) {
        try {
          var result = JSON.parse(response);
          if (!result.ok) alert("无法打开 CSV 文件：" + (result.message || "系统未能打开表格"));
        } catch (error) {
          alert("打开 CSV 时宿主未返回有效结果，请稍后重试。");
        }
      });
    });
  }

  function openCurrentFolder() {
    ensureJsxLoaded(function() {
      cs.evalScript('try { (typeof Youkai !== "undefined" && Youkai.getActiveDocumentFolder) ? Youkai.getActiveDocumentFolder() : "ERROR: 宿主对象未初始化"; } catch(e) { "ERROR: " + e.toString(); }', function(res) {
      if (res && res.indexOf("ERROR:") === 0) {
        if (byId("toast")) byId("toast").textContent = res.substring(7);
        return;
      }
      if (!res || res === "undefined" || res === "") {
        if (byId("toast")) byId("toast").textContent = "无法获取目录";
        return;
      }
      try {
        var dir = res;
        var isWin = process.platform === "win32";
        var command = isWin ? "explorer.exe" : "open";
        execFile(command, [dir], function(error) {
          if (error) {
            console.error("[YOUKAI ERROR] 打开文件夹失败:", error);
            if (byId("toast")) byId("toast").textContent = "打开文件夹失败";
          } else {
            if (byId("toast")) byId("toast").textContent = "已打开当前文件所在目录";
          }
        });
      } catch (e) {
        if (byId("toast")) byId("toast").textContent = "执行打开失败";
      }
    });
    });
  }

  
var originalCepSize = null;
function expandPanel(targetW, targetH) {
  if (window.__adobe_cep__ && window.__adobe_cep__.resizeContent) {
    if (!originalCepSize) {
      originalCepSize = { w: window.innerWidth, h: window.innerHeight };
    }
    window.__adobe_cep__.resizeContent(targetW || 520, targetH || 650);
  }
}
function restorePanel() {
  if (window.__adobe_cep__ && window.__adobe_cep__.resizeContent && originalCepSize) {
    window.__adobe_cep__.resizeContent(originalCepSize.w, originalCepSize.h);
    originalCepSize = null;
  }
}

function init() {
    var bootStatus = byId("bootStatus");
    if (bootStatus) bootStatus.style.display = "none";
    resetSettingsForNewInstall();
    loadConfigs();
    initCsvTemplates();
    bindEvents();
    bindGlobalShortcuts();
    scanAndRender();
    if (window.YoukaiUpdateUI) window.YoukaiUpdateUI.start({
      root: root, userData: rawUserData || os.homedir(), cs: cs,
      isBusy: function () { return singleScriptRunning || zzzState.isRunning; },
      onReveal: function () { byId("unifiedSettingsModal").classList.remove("open"); restorePanel(); }
    });
  }

  function resetSettingsForNewInstall() {
    var marker = path.join(root, "install-state.json");
    if (!fs.existsSync(marker)) return; // 源码直接运行不重置配置。
    try {
      var installId = JSON.parse(fs.readFileSync(marker, "utf8")).installId;
      if (!installId || localStorage.getItem("youkai.installId") === installId) return;
      var saved = {}, keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key.indexOf("youkai.") === 0) { keys.push(key); saved[key] = localStorage.getItem(key); }
      }
      if (keys.length) {
        var backupFolder = path.join(rawUserData || os.homedir(), "Youkai", "backups");
        if (!fs.existsSync(backupFolder)) fs.mkdirSync(backupFolder, { recursive: true });
        fs.writeFileSync(path.join(backupFolder, "panel-settings-" + Date.now() + ".json"), JSON.stringify(saved, null, 2), "utf8");
      }
      keys.forEach(function(key) { localStorage.removeItem(key); });
      localStorage.setItem("youkai.installId", installId);
    } catch (error) {
      // 备份失败时保留原设置，避免在未备份的情况下清空。
      alert("旧版面板设置未能备份，已保留原设置。\n" + error.message);
    }
  }

  function loadConfigs() {
    var defaultFolder = path.join(root, "user_scripts"); 
    state.sources = [{ id: "default", name: "默认脚本", folder: defaultFolder, enabled: true }];
    try {
      var savedSources = JSON.parse(localStorage.getItem("youkai.sources") || "[]");
      if (Array.isArray(savedSources)) savedSources.forEach(function(src) {
        if (src && src.id && src.id !== "default" && typeof src.folder === "string" && path.isAbsolute(src.folder)) {
          state.sources.push({id: src.id, name: String(src.name || "自定义脚本"), folder: src.folder, enabled: true});
        }
      });
    } catch (e) {}

    var isWin = process.platform === "win32";
    var defaultOutput = path.join(os.homedir(), "Documents", "YOUKAI", "打包");
    
    var savedOutput = localStorage.getItem("youkai.path.outputFolder");
    if (!savedOutput || !isDriveValid(savedOutput)) {
      savedOutput = defaultOutput;
      localStorage.setItem("youkai.path.outputFolder", savedOutput);
    }
    state.paths.outputFolder = savedOutput;

    var defaultExport = path.join(os.homedir(), "Desktop", "outjpg");
    var savedExport = localStorage.getItem("youkai.path.exportFolder");
    // 若原缓存指向已失效的盘符（如从 D 盘迁回 C 盘后留下的死路径），自动清洗并回退
    if (!savedExport || !isDriveValid(savedExport)) {
      savedExport = defaultExport;
      localStorage.setItem("youkai.path.exportFolder", savedExport);
    }
    state.paths.exportFolder = savedExport;
    
    // 自动清洗旧的 Program Files 缓存路径或死盘符路径
    var savedCsv = localStorage.getItem("youkai.path.csvFolder");
    if (!savedCsv || isSystemProtectedPath(savedCsv) || !isDriveValid(savedCsv)) {
      savedCsv = getDefaultCsvFolderPath();
      localStorage.setItem("youkai.path.csvFolder", savedCsv);
    }
    state.paths.csvFolder = savedCsv;
    
    try {
      state.shortcuts = JSON.parse(localStorage.getItem("youkai.shortcuts") || "{}");
    } catch(e) {
      state.shortcuts = {};
    }
    var aliases = {"PDF效果图.jsx": "模板批量换图.jsx", "战队色修改.jsx": "色板方案切换.jsx"};
    Object.keys(aliases).forEach(function(oldName) {
      if (state.shortcuts[oldName] && !state.shortcuts[aliases[oldName]]) state.shortcuts[aliases[oldName]] = state.shortcuts[oldName];
      delete state.shortcuts[oldName];
    });
    localStorage.setItem("youkai.shortcuts", JSON.stringify(state.shortcuts));
    state.exportConfig = {
      autoClassify: localStorage.getItem("youkai.export.autoClassify") === null ? true : (localStorage.getItem("youkai.export.autoClassify") === "true"),
      classifyDelims: localStorage.getItem("youkai.export.classifyDelims") || "@,_"
    };
  }

  function syncGlobalPathsToJsx(callback) {
    ensureJsxLoaded(function(loaded, reason) {
      if (!loaded) { if (callback) callback(false, reason); return; }
      var cmd = 'try {' +
                '$.global.YOUKAI_OUTPUT_FOLDER=' + toEvalString(state.paths.outputFolder) + ';' +
                '$.global.YOUKAI_EXPORT_FOLDER=' + toEvalString(state.paths.exportFolder) + ';' +
                '$.global.YOUKAI_CSV_FOLDER=' + toEvalString(getCsvFolderPath()) + ';' +
                '$.global.YOUKAI_AUTO_CLASSIFY=' + (state.exportConfig.autoClassify ? 'true' : 'false') + ';' +
                '$.global.YOUKAI_CLASSIFY_DELIMS=' + toEvalString(state.exportConfig.classifyDelims) + ';' +
                '"OK"; } catch(e) { "ERR:" + e.toString(); }';
      cs.evalScript(cmd, function(res) {
        if (typeof callback === "function") callback(res === "OK", res);
      });
    });
  }

  function bindEvents() {
    if (byId("refreshBtn")) byId("refreshBtn").onclick = scanAndRender;
    
    // Fix Chinese IME input issue for search
    function bindInputWithIME(inputEl, callback) {
      if (!inputEl) return;
      var isComposing = false;
      inputEl.addEventListener('compositionstart', function() { isComposing = true; });
      inputEl.addEventListener('compositionend', function() { isComposing = false; callback(); });
      inputEl.addEventListener('input', function() { if (!isComposing) callback(); });
    }
    bindInputWithIME(byId("searchInput"), doFilter);
    if (byId("categorySelect")) {
      byId("categorySelect").onchange = doFilter;
    }
    if (byId("youkaiLogoBtn")) {
      byId("youkaiLogoBtn").onclick = function() {
        if (window.cep && window.cep.util) {
          window.cep.util.openURLInDefaultBrowser("https://erbaiqi.pages.dev/");
        } else {
          window.open("https://erbaiqi.pages.dev/");
        }
      };
    }
    
    if (byId("toggleUnifiedSettingsBtn")) {
      byId("toggleUnifiedSettingsBtn").onclick = function() {
        if (zzzState.isRunning) { alert("批处理运行中，请先完成或停止后再修改设置。"); return; }
        byId("unifiedSettingsModal").classList.add("open"); expandPanel(500, 600);
        
        // Populate inputs from state
        if (byId("settingAutoClassifyCheck")) byId("settingAutoClassifyCheck").checked = state.exportConfig.autoClassify;
        if (byId("settingClassifyDelimInput")) byId("settingClassifyDelimInput").value = state.exportConfig.classifyDelims;
        if (byId("settingOutputFolderInput")) byId("settingOutputFolderInput").value = state.paths.outputFolder;
        if (byId("settingExportFolderInput")) byId("settingExportFolderInput").value = state.paths.exportFolder;
        if (byId("settingCsvFolderInput")) byId("settingCsvFolderInput").value = state.paths.csvFolder;
        
        renderSources();
        if (typeof openShortcutModal === 'function') openShortcutModal(true); // pass true to indicate silent render
      };
    }
    
    if (byId("closeUnifiedSettingsBtn")) {
      byId("closeUnifiedSettingsBtn").onclick = function() {
        byId("unifiedSettingsModal").classList.remove("open"); restorePanel();
      };
    }

    if (byId("settingAutoClassifyCheck")) {
      byId("settingAutoClassifyCheck").onchange = function() {
        state.exportConfig.autoClassify = this.checked;
        localStorage.setItem("youkai.export.autoClassify", this.checked);
        syncGlobalPathsToJsx();
      };
    }

    if (byId("settingClassifyDelimInput")) {
      byId("settingClassifyDelimInput").oninput = function() {
        var val = this.value.trim();
        state.exportConfig.classifyDelims = val;
        localStorage.setItem("youkai.export.classifyDelims", val);
        syncGlobalPathsToJsx();
      };
    }
    
    var tabs = document.querySelectorAll('.unified-tab');
    var panels = document.querySelectorAll('.unified-panel');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].onclick = function() {
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
        for (var k = 0; k < panels.length; k++) panels[k].classList.remove('active');
        this.classList.add('active');
        var targetId = this.getAttribute('data-target');
        if (byId(targetId)) byId(targetId).classList.add('active');
      };
    }
    
    if (byId("saveSettingsBtn")) byId("saveSettingsBtn").onclick = saveSettings;
    if (byId("addSourceBtn")) byId("addSourceBtn").onclick = function() { editSource("add"); };
    if (byId("saveSourceBtn")) byId("saveSourceBtn").onclick = function() { editSource("update"); };
    if (byId("removeSourceBtn")) byId("removeSourceBtn").onclick = function() { editSource("remove"); };
    if (byId("browseOutputFolderBtn")) byId("browseOutputFolderBtn").onclick = function() { browseFolderForInput("settingOutputFolderInput", "选择默认打包输出文件夹"); };
    if (byId("browseExportFolderBtn")) byId("browseExportFolderBtn").onclick = function() { browseFolderForInput("settingExportFolderInput", "选择默认效果图导出文件夹"); };
    if (byId("browseCsvFolderBtn")) byId("browseCsvFolderBtn").onclick = function() { browseFolderForInput("settingCsvFolderInput", "选择变量表 (CSV) 文件夹"); };
    if (byId("openCurrentFolderBtn")) byId("openCurrentFolderBtn").onclick = openCurrentFolder;

    if (byId("closeDocBtn")) byId("closeDocBtn").onclick = function() { byId("docModal").classList.remove("open"); restorePanel(); };


    // YOUKAI Batch UI Events
    if (byId("batchZzzBtn")) byId("batchZzzBtn").onclick = openZzzBatchModal;
    if (byId("closeBatchZzzBtn")) byId("closeBatchZzzBtn").onclick = function() { byId("batchModalZZZ").classList.remove("open"); restorePanel(); };
    bindInputWithIME(byId("zzzBatchSearch"), renderZzzLibrary);
    
    if (byId("zzzBatchSaveSource")) {
      byId("zzzBatchSaveSource").onchange = function() {
        if (byId("zzzBatchSaveOptions")) {
          byId("zzzBatchSaveOptions").style.display = this.checked ? "flex" : "none";
        }
      };
    }
    if (byId("zzzBrowseBatchFolderBtn")) byId("zzzBrowseBatchFolderBtn").onclick = function() {
      ensureJsxLoaded(function() {
        cs.evalScript('try { (typeof Youkai !== "undefined" && Youkai.selectFolder) ? Youkai.selectFolder("选择待处理 AI 文件的根文件夹") : JSON.stringify({ok:false, message:"宿主未就绪"}); } catch(e) { JSON.stringify({ok:false, message:e.toString()}); }', function(res) {
          try {
            if (res && res.indexOf("EvalScript error") >= 0) {
              alert("ExtendScript 引擎异常 (可能 AI 正在忙碌或有弹窗未关闭)");
              return;
            }
            var parsed = JSON.parse(res);
            if (parsed.ok && byId("zzzBatchFolderInput")) byId("zzzBatchFolderInput").value = parsed.message;
          } catch(e) {}
        });
      });
    };
    if (byId("zzzStartBatchBtn")) byId("zzzStartBatchBtn").onclick = startZzzBatchAsync;
    if (byId("zzzStopBatchBtn")) byId("zzzStopBatchBtn").onclick = stopZzzBatchAsync;
  }

  function bindGlobalShortcuts() {
    window.addEventListener("keydown", function(e) {
      var tag = e.target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      var keyCombo = buildKeyComboString(e);
      if (!keyCombo) return;

      for (var scriptName in state.shortcuts) {
        if (state.shortcuts[scriptName] === keyCombo) {
          e.preventDefault();
          var file = state.files.find(function(f) { return f.name === scriptName; });
          if (file) {
            executeJsx(file.fullPath);
            if (byId("toast")) byId("toast").textContent = "快捷键 [" + keyCombo + "] 触发: " + scriptName;
          }
          break;
        }
      }
    });
  }

  function buildKeyComboString(e) {
    if (["Control", "Alt", "Shift", "Meta"].indexOf(e.key) >= 0) return "";
    var keys = [];
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.altKey) keys.push("Alt");
    if (e.shiftKey) keys.push("Shift");
    var k = e.key.toUpperCase();
    if (k === " ") k = "Space";
    keys.push(k);
    return keys.join("+");
  }

  function openShortcutModal(silent) {
    var list = byId("shortcutList");
    if (!list) return;

    var html = "";
    state.files.forEach(function(file) {
      var sc = state.shortcuts[file.name] || "";
      html += '<div class="shortcut-item-row">' +
                '<span class="shortcut-item-name" title="' + escapeHtml(file.name) + '">' + escapeHtml(file.name) + '</span>' +
                '<input type="text" class="shortcut-input" data-script="' + escapeHtml(file.name) + '" value="' + escapeHtml(sc) + '" placeholder="按键盘设置" readonly>' +
                '<button class="clear-sc-btn" data-script="' + escapeHtml(file.name) + '">清除</button>' +
              '</div>';
    });

    list.innerHTML = html || '<div style="color:#666;">暂无可配置脚本</div>';

    var inputs = list.querySelectorAll(".shortcut-input");
    inputs.forEach(function(inp) {
      inp.onkeydown = function(e) {
        e.preventDefault();
        var combo = buildKeyComboString(e);
        if (combo) {
          this.value = combo;
          var scriptName = this.getAttribute("data-script");
          state.shortcuts[scriptName] = combo;
          localStorage.setItem("youkai.shortcuts", JSON.stringify(state.shortcuts));
          scanAndRender();
        }
      };
    });

    var clearBtns = list.querySelectorAll(".clear-sc-btn");
    clearBtns.forEach(function(btn) {
      btn.onclick = function() {
        var scriptName = this.getAttribute("data-script");
        delete state.shortcuts[scriptName];
        localStorage.setItem("youkai.shortcuts", JSON.stringify(state.shortcuts));
        openShortcutModal();
        scanAndRender();
      };
    });

    // 快捷键列表嵌入统一设置中心，不再打开旧弹窗。
    }

  function parseMarkdown(md) {
    if (!md) return '';
    var lines = String(md).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    var html = [], paragraph = [], list = '', code = null;
    function inline(text) {
      // 分开处理行内代码，保留其内容，不把代码中的标记当作强调。
      return String(text).split(/(`[^`]+`)/g).map(function(part) {
        if (/^`[^`]+`$/.test(part)) return '<code>' + escapeHtml(part.slice(1, -1)) + '</code>';
        return escapeHtml(part).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
      }).join('');
    }
    function flushParagraph() {
      if (paragraph.length) { html.push('<p>' + inline(paragraph.join(' ')) + '</p>'); paragraph = []; }
    }
    function closeList() { if (list) { html.push('</' + list + '>'); list = ''; } }
    lines.forEach(function(line) {
      if (/^\s*```/.test(line)) {
        flushParagraph(); closeList();
        if (code === null) code = [];
        else { html.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>'); code = null; }
        return;
      }
      if (code !== null) { code.push(line); return; }
      if (!line.trim()) { flushParagraph(); closeList(); return; }
      var heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flushParagraph(); closeList();
        var level = heading[1].length;
        html.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>');
        return;
      }
      var item = line.match(/^\s*(\d+\.|[-*])\s+(.+)$/);
      if (item) {
        flushParagraph();
        var type = /^\d/.test(item[1]) ? 'ol' : 'ul';
        if (list !== type) { closeList(); list = type; html.push('<' + type + '>'); }
        html.push('<li>' + inline(item[2]) + '</li>');
        return;
      }
      closeList();
      var quote = line.match(/^>\s?(.*)$/);
      if (quote) { flushParagraph(); html.push('<blockquote>' + inline(quote[1]) + '</blockquote>'); }
      else paragraph.push(line.trim());
    });
    flushParagraph(); closeList();
    if (code !== null) html.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
    return html.join('');
  }

  function openDocModal(scriptName, scriptPath) {
    var modal = byId("docModal");
    var titleEl = byId("docTitle");
    var contentEl = byId("docContent");
    var openCsvBtn = byId("openCsvBtn");
    if (!modal || !contentEl) return;

    if (titleEl) titleEl.innerHTML = escapeHtml(scriptName);
    contentEl.innerHTML = "正在加载说明文档...";

    var baseName = scriptName.replace(/\.jsx?$/i, "");
    var scriptDir = path.dirname(scriptPath);

    var csvFolder = getCsvFolderPath();
    var csvPath = path.join(csvFolder, baseName + ".csv");

    if (openCsvBtn) {
      openCsvBtn.style.display = fs.existsSync(csvPath) ? "inline-flex" : "none";
      openCsvBtn.onclick = function() {
        openCsvWithDefaultApp(csvPath);
      };
    }

    var docPath1 = path.join(scriptDir, "docs", baseName + ".md");
    var docPath2 = path.join(scriptDir, baseName + ".md");

    var targetDocPath = "";
    if (fs.existsSync(docPath1)) {
      targetDocPath = docPath1;
    } else if (fs.existsSync(docPath2)) {
      targetDocPath = docPath2;
    }

    if (targetDocPath && fs.existsSync(targetDocPath)) {
      try {
        var mdContent = fs.readFileSync(targetDocPath, "utf8");
        contentEl.innerHTML = parseMarkdown(mdContent);
      } catch(e) {
        contentEl.innerHTML = '<p style="color:#FF3344;">读取说明文档失败: ' + escapeHtml(e.message) + '</p>';
      }
    } else {
      contentEl.innerHTML = 
        '<div style="padding:10px; border:1px dashed var(--zzz-border); background:#141619;">' +
          '<h3 style="color:var(--zzz-yellow); margin-bottom:6px;">尚未编写该脚本说明</h3>' +
          '<p style="color:#aaa; font-size:11px;">请将对应的 Markdown 教程放置在以下任意路径：</p>' +
          '<pre><code>' + escapeHtml(docPath1) + '</code></pre>' +
          '<p style="color:#666; font-size:10px; margin-top:6px;">放置后重新点击说明按钮即可实时预览。' +
        '</div>';
    }

    if (modal) { modal.classList.add("open"); expandPanel(720, 560); }
    }

  function openSettingsModal() {
    var modal = byId("settingsModal");
    if (!modal) return;
    if (byId("settingOutputFolderInput")) byId("settingOutputFolderInput").value = state.paths.outputFolder;
    if (byId("settingExportFolderInput")) byId("settingExportFolderInput").value = state.paths.exportFolder;
    if (byId("settingCsvFolderInput")) byId("settingCsvFolderInput").value = getCsvFolderPath();
    if (modal) { modal.classList.add("open"); expandPanel(720, 560); }
    }

  function saveSettings() {
    var outVal = byId("settingOutputFolderInput") ? byId("settingOutputFolderInput").value.trim() : "";
    var expVal = byId("settingExportFolderInput") ? byId("settingExportFolderInput").value.trim() : "";
    var csvVal = byId("settingCsvFolderInput") ? byId("settingCsvFolderInput").value.trim() : "";
    
    // 如果用户手动输了 Program Files 路径，强行拦截重置
    if (isSystemProtectedPath(csvVal)) {
      csvVal = getDefaultCsvFolderPath();
    }

    state.paths.outputFolder = outVal;
    state.paths.exportFolder = expVal;
    state.paths.csvFolder = csvVal;

      var autoCls = byId("settingAutoClassifyCheck") ? byId("settingAutoClassifyCheck").checked : false;
      var clsDelims = byId("settingClassifyDelimInput") ? byId("settingClassifyDelimInput").value.trim() : "@,_";
      state.exportConfig.autoClassify = autoCls;
      state.exportConfig.classifyDelims = clsDelims;

      localStorage.setItem("youkai.path.outputFolder", outVal);
      localStorage.setItem("youkai.export.autoClassify", autoCls);
      localStorage.setItem("youkai.export.classifyDelims", clsDelims);
    localStorage.setItem("youkai.path.exportFolder", expVal);
    localStorage.setItem("youkai.path.csvFolder", csvVal);

    var res = initCsvTemplates();
    syncGlobalPathsToJsx();

    if (res.ok) {
      alert("✅ 路径配置已保存！\n-----------------------------\n目标 CSV 目录：\n" + res.targetFolder + "\n\n新解压模板：" + res.copied + " 个\n已存在文件：" + res.existing + " 个");
      if (byId("toast")) byId("toast").textContent = "路径配置已保存";
    } else {
      alert("⚠️ " + res.message);
      if (byId("toast")) byId("toast").textContent = "保存成功，但模板同步存在警告";
    }

    byId("unifiedSettingsModal").classList.remove("open");
    restorePanel();
  }

  function browseFolderForInput(inputId, title) {
    ensureJsxLoaded(function() {
      cs.evalScript('try { (typeof Youkai !== "undefined" && Youkai.selectFolder) ? Youkai.selectFolder(' + toEvalString(title) + ') : JSON.stringify({ok:false, message:"宿主未就绪"}); } catch(e) { JSON.stringify({ok:false, message:e.toString()}); }', function(res) {
        try {
          if (res && res.indexOf("EvalScript error") >= 0) {
            alert("ExtendScript 引擎异常 (可能 AI 正在忙碌或有弹窗未关闭)");
            return;
          }
          var parsed = JSON.parse(res);
          if (parsed.ok && byId(inputId)) {
            byId(inputId).value = parsed.message;
          }
        } catch(e) {}
      });
    });
  }

  function renderSources() {
    var sourceList = byId("sourceList");
    if (!sourceList) return;
    var html = "";
    state.sources.forEach(function(src) {
      html += '<button class="source-entry quick-filter-btn" data-source="' + escapeHtml(src.id) + '" style="display:block;width:100%;text-align:left;margin-bottom:4px;overflow-wrap:break-word;">[' + escapeHtml(src.name) + '] ' + escapeHtml(src.folder) + '</button>';
    });
    sourceList.innerHTML = html;
    sourceList.querySelectorAll(".source-entry").forEach(function(entry) {
      entry.onclick = function() {
        state.activeSourceId = entry.getAttribute("data-source");
        var src = state.sources.filter(function(item) { return item.id === state.activeSourceId; })[0];
        byId("sourceNameInput").value = src.name;
        byId("folderInput").value = src.folder;
      };
    });
  }

  function editSource(action) {
    if (zzzState.isRunning) { alert("请先完成或停止批处理。"); return; }
    var selected = state.sources.filter(function(src) { return src.id === state.activeSourceId; })[0];
    if (action !== "add" && (!selected || selected.id === "default")) {
      alert("请选择一个自定义脚本源；默认脚本源保留。"); return;
    }
    if (action === "remove") {
      state.sources = state.sources.filter(function(src) { return src !== selected; });
      state.activeSourceId = "all";
    } else {
      var folder = byId("folderInput").value.trim();
      var name = byId("sourceNameInput").value.trim() || path.basename(folder);
      try {
        if (!path.isAbsolute(folder) || !fs.statSync(folder).isDirectory()) throw new Error("请选择存在的文件夹并填写绝对路径。");
      } catch (e) { alert("脚本源无效: " + e.message); return; }
      folder = path.normalize(folder);
      if (state.sources.some(function(src) { return src.folder === folder && (action === "add" || src !== selected); })) {
        alert("这个文件夹已经添加。"); return;
      }
      if (action === "add") {
        selected = {id: "source-" + Date.now(), name: name, folder: folder, enabled: true};
        state.sources.push(selected);
      } else { selected.name = name; selected.folder = folder; }
      state.activeSourceId = selected.id;
    }
    localStorage.setItem("youkai.sources", JSON.stringify(state.sources.filter(function(src) { return src.id !== "default"; })));
    renderSources();
    scanAndRender();
  }

  function scanAndRender() {
    state.files = [];
    state.sources.forEach(function(src) {
      try {
      if (fs.existsSync(src.folder) && fs.statSync(src.folder).isDirectory()) {
        var items = fs.readdirSync(src.folder);
        items.forEach(function(item) {
          var fullPath = path.join(src.folder, item);
          var stat = null;
          try { stat = fs.statSync(fullPath); } catch (e) {}
          
          if (stat && stat.isDirectory()) {
            var subItems = fs.readdirSync(fullPath);
            subItems.forEach(function(subItem) {
              if (/\.jsx?$/i.test(subItem) && !isLegacyBatchScript(subItem) && fs.statSync(path.join(fullPath, subItem)).isFile()) {
                state.files.push({ name: subItem, fullPath: path.join(fullPath, subItem), category: item });
              }
            });
          } else if (stat && stat.isFile() && /\.jsx?$/i.test(item) && !isLegacyBatchScript(item)) {
            state.files.push({ name: item, fullPath: fullPath, category: "all" });
          }
        });
      }
      } catch (e) { if (byId("toast")) byId("toast").textContent = "脚本源读取失败: " + src.name + " (" + e.message + ")"; }
    });
    
    updateCategorySelect();

    var selectedStillExists = state.files.some(function(file) { return file.fullPath === state.selectedPath; });
    if (!selectedStillExists) state.selectedPath = "";
    doFilter();
  }

  function updateCategorySelect() {
    var select = byId("categorySelect");
    if (!select) return;
    
    var currentVal = select.value;
    var html = '<option value="all">全部分类</option>';
    
    var uniqueCategories = [];
    state.files.forEach(function(f) {
      if (f.category && f.category !== "all" && uniqueCategories.indexOf(f.category) === -1) {
        uniqueCategories.push(f.category);
      }
    });
    
    uniqueCategories.forEach(function(cat) {
      html += '<option value="' + escapeHtml(cat) + '">' + escapeHtml(cat) + '</option>';
    });
    
    select.innerHTML = html;
    
    if (currentVal === "all" || uniqueCategories.indexOf(currentVal) >= 0) {
      select.value = currentVal;
    } else {
      select.value = "all";
    }
  }

  function doFilter() {
    var q = byId("searchInput") ? byId("searchInput").value.toLowerCase() : "";
    var catSelect = byId("categorySelect");
    var currentCat = catSelect ? catSelect.value : "all";
    
    state.filtered = state.files.filter(function(f) {
      var matchQ = f.name.toLowerCase().indexOf(q) >= 0;
      var matchCat = currentCat === "all" ? true : f.category === currentCat;
      return matchQ && matchCat;
    });
    var listHtml = "";
    
    state.filtered.forEach(function(f, idx) {
      var shortcut = state.shortcuts[f.name] ? '<span class="shortcut-badge">' + escapeHtml(state.shortcuts[f.name]) + '</span>' : '';
      listHtml += 
        '<div class="script-item" data-path="' + encodeURIComponent(f.fullPath) + '">' +
          '<div class="script-info">' +
            '<span class="script-name-text">' + escapeHtml(f.name) + '</span>' +
          '</div>' +
          '<div class="script-actions-row">' +
            shortcut +
            '<button class="doc-btn" data-name="' + escapeHtml(f.name) + '" data-path="' + encodeURIComponent(f.fullPath) + '">说明</button>' +
          '</div>' +
        '</div>';
    });

    if (byId("scriptList")) {
      byId("scriptList").innerHTML = listHtml || '<div style="padding:10px; color:#666;">暂无脚本</div>';
      
      var items = byId("scriptList").querySelectorAll(".script-item");
      items.forEach(function(item) {
        item.onclick = function(e) {
          if (e.target.classList.contains("doc-btn")) return;
          items.forEach(function(i){ i.classList.remove("selected"); });
          this.classList.add("selected");
          state.selectedPath = decodeURIComponent(this.getAttribute("data-path"));
        };
        item.ondblclick = function(e) {
          if (e.target.classList.contains("doc-btn")) return;
          var p = decodeURIComponent(this.getAttribute("data-path"));
          executeJsx(p);
        };
      });

      var docBtns = byId("scriptList").querySelectorAll(".doc-btn");
      docBtns.forEach(function(btn) {
        btn.onclick = function(e) {
          e.stopPropagation();
          var name = this.getAttribute("data-name");
          var p = decodeURIComponent(this.getAttribute("data-path"));
          openDocModal(name, p);
        };
      });
    }
  }

  function executeJsx(scriptPath) {
    if (window.YOUKAI_UPDATE_BUSY || singleScriptRunning) return;
    if (zzzState.isRunning) { alert("批处理正在运行，请等待完成或停止后再运行单个脚本。"); return; }
    singleScriptRunning = true;
    var mode = "auto";
    var toast = byId("toast");
    if (toast) toast.textContent = "正在运行...";

    ensureJsxLoaded(function(loaded, errReason) {
      if (!loaded) {
        singleScriptRunning = false;
        if (toast) toast.textContent = "ExtendScript 引擎未就绪 (" + (errReason || "main.jsx 未载入") + ")";
        return;
      }

      syncGlobalPathsToJsx(function(ok, reason) {
        if (!ok) { singleScriptRunning = false; if (toast) toast.textContent = "配置同步失败: " + reason; return; }
        var scriptCode = 'try { (typeof Youkai !== "undefined" && typeof Youkai.runScript === "function") ? Youkai.runScript(' + toEvalString(scriptPath) + ', ' + toEvalString(mode) + ', "", "", "") : JSON.stringify({ ok: false, message: "Youkai 宿主对象未初始化" }); } catch(err) { JSON.stringify({ ok: false, message: err.toString() }); }';
        cs.evalScript(scriptCode, function(res) {
          singleScriptRunning = false;
          if (toast) {
            try {
              if (res && res.indexOf("EvalScript error") >= 0) {
                // 若出现底层未捕获异常，深入 ExtendScript 探查诊断根因
                cs.evalScript('try { (app.documents.length === 0 ? "请先新建或打开一个 AI 文档" : ($.error ? String($.error) : "ExtendScript 引擎忙碌或异常")); } catch(e) { e.toString(); }', function(diagRes) {
                  toast.textContent = "执行失败: " + (diagRes || "ExtendScript 异常");
                });
                return;
              }
              var parsed = JSON.parse(res);
              toast.textContent = parsed.ok ? "执行成功" : "错误: " + parsed.message;
            } catch(e) {
              toast.textContent = "执行完毕";
            }
          }
        });
      });
    });
  }

  function selectedFile() {
    for (var i = 0; i < state.files.length; i++) {
      if (state.files[i].fullPath === state.selectedPath) return state.files[i];
    }
    return null;
  }


  // ==========================================================================
  // YOUKAI 多插件批处理与异步执行引擎 (Async Batch Engine)
  // ==========================================================================
  var zzzState = {
    tasks: [],       // 已选的任务列表
    filesToProcess: [], // 待处理的 AI 文件列表
    currentIndex: 0,
    isRunning: false,
    stopRequested: false
  };

  function openZzzBatchModal() {
    var modal = byId("batchModalZZZ");
    if (!modal) return;
    
    if (state.selectedPath && !zzzState.isRunning) {
      var file = state.files.find(function(f) { return f.fullPath === state.selectedPath; });
      if (file) {
        zzzState.tasks = [file];
      }
    }
    
    renderZzzLibrary();
    renderZzzTasks();
    var status = byId("zzzBatchStatus");
    if (status && !zzzState.isRunning) setZzzStatus("等待指令单执行...", "");
    
    // 如果之前有选中的文件夹，自动带入
    var folderInput = byId("zzzBatchFolderInput");
    var oldBatchInput = byId("batchFolderInput");
    if (folderInput && !folderInput.value && oldBatchInput && oldBatchInput.value) {
      folderInput.value = oldBatchInput.value;
    }
    
    if (modal) { modal.classList.add("open"); expandPanel(720, 560); }
    }

  function renderZzzLibrary() {
    var list = byId("zzzBatchLibList");
    if (!list) return;
    
    var q = byId("zzzBatchSearch") ? byId("zzzBatchSearch").value.toLowerCase() : "";
    var filtered = state.files.filter(function(f) { return f.name.toLowerCase().indexOf(q) >= 0; });
    
    var html = "";
    filtered.forEach(function(f) {
      html += '<div class="zzz-lib-item" data-path="' + encodeURIComponent(f.fullPath) + '">' +
                '<div class="zzz-lib-item-name">' + escapeHtml(f.name) + '</div>' +
                '<div class="zzz-lib-item-desc">点击加入右侧任务列队</div>' +
              '</div>';
    });
    list.innerHTML = html || '<div style="color:#777; font-size:11px; padding:10px;">没有找到相关脚本</div>';
    
    var items = list.querySelectorAll(".zzz-lib-item");
    items.forEach(function(item) {
      item.onclick = function() {
        if (zzzState.isRunning) return;
        var p = decodeURIComponent(this.getAttribute("data-path"));
        var file = state.files.find(function(f) { return f.fullPath === p; });
        if (file) {
          zzzState.tasks.push(file);
          renderZzzTasks();
        }
      };
    });
  }

  function renderZzzTasks() {
    var list = byId("zzzBatchTaskList");
    if (!list) return;
    
    var html = "";
    zzzState.tasks.forEach(function(t, idx) {
      var num = idx + 1;
      html += '<div class="zzz-task-item" draggable="true" data-idx="' + idx + '">' +
                '<div class="zzz-task-index">' + num + '</div>' +
                '<div class="zzz-task-content">' +
                  '<div class="zzz-task-name">' + escapeHtml(t.name) + '</div>' +
                  '<div class="zzz-task-desc">脚本参数默认读取配置</div>' +
                '</div>' +
                '<div class="zzz-task-actions">' +
                  '<button class="zzz-task-btn move-up-btn" data-idx="' + idx + '">上移</button>' +
                  '<button class="zzz-task-btn move-down-btn" data-idx="' + idx + '">下移</button>' +
                  '<button class="zzz-task-btn zzz-task-btn-danger delete-task-btn" data-idx="' + idx + '">删除</button>' +
                '</div>' +
              '</div>';
    });
    list.innerHTML = html || '<div style="color:#777; font-size:11px; padding:10px; text-align:center;">暂无任务，请从左侧添加</div>';
    var startButton = byId("zzzStartBatchBtn");
    if (startButton) startButton.classList.toggle("ready", zzzState.tasks.length > 0);
    
    var taskItems = list.querySelectorAll(".zzz-task-item");
    taskItems.forEach(function(item) {
      // 拖拽相关事件
      item.ondragstart = function(e) {
        if (zzzState.isRunning) { e.preventDefault(); return; }
        zzzState.draggedIdx = parseInt(this.getAttribute("data-idx"), 10);
        e.dataTransfer.effectAllowed = "move";
        this.style.opacity = "0.5";
      };
      
      item.ondragend = function(e) {
        this.style.opacity = "1";
        taskItems.forEach(function(i) {
          i.style.borderTop = "";
          i.style.borderBottom = "";
        });
      };
      
      item.ondragover = function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        var rect = this.getBoundingClientRect();
        var midY = rect.top + rect.height / 2;
        taskItems.forEach(function(i) { i.style.borderTop = ""; i.style.borderBottom = ""; });
        if (e.clientY < midY) {
          this.style.borderTop = "2px solid var(--zzz-yellow)";
        } else {
          this.style.borderBottom = "2px solid var(--zzz-yellow)";
        }
      };
      
      item.ondragleave = function(e) {
        this.style.borderTop = "";
        this.style.borderBottom = "";
      };
      
      item.ondrop = function(e) {
        e.preventDefault();
        var dropIdx = parseInt(this.getAttribute("data-idx"), 10);
        var draggedIdx = zzzState.draggedIdx;
        if (draggedIdx === undefined || draggedIdx === dropIdx) return;
        
        var rect = this.getBoundingClientRect();
        var midY = rect.top + rect.height / 2;
        var insertIdx = e.clientY < midY ? dropIdx : dropIdx + 1;
        if (draggedIdx < insertIdx) insertIdx--;
        
        var draggedTask = zzzState.tasks.splice(draggedIdx, 1)[0];
        zzzState.tasks.splice(insertIdx, 0, draggedTask);
        renderZzzTasks();
      };
    });
    
    // 按钮点击事件
    list.querySelectorAll(".move-up-btn").forEach(function(btn) {
      btn.onclick = function() {
        if (zzzState.isRunning) return;
        var idx = parseInt(this.getAttribute("data-idx"), 10);
        if (idx > 0) {
          var temp = zzzState.tasks[idx - 1];
          zzzState.tasks[idx - 1] = zzzState.tasks[idx];
          zzzState.tasks[idx] = temp;
          renderZzzTasks();
        }
      };
    });
    list.querySelectorAll(".move-down-btn").forEach(function(btn) {
      btn.onclick = function() {
        if (zzzState.isRunning) return;
        var idx = parseInt(this.getAttribute("data-idx"), 10);
        if (idx < zzzState.tasks.length - 1) {
          var temp = zzzState.tasks[idx + 1];
          zzzState.tasks[idx + 1] = zzzState.tasks[idx];
          zzzState.tasks[idx] = temp;
          renderZzzTasks();
        }
      };
    });
    list.querySelectorAll(".delete-task-btn").forEach(function(btn) {
      btn.onclick = function() {
        if (zzzState.isRunning) return;
        var idx = parseInt(this.getAttribute("data-idx"), 10);
        zzzState.tasks.splice(idx, 1);
        renderZzzTasks();
      };
    });
  }

  function setZzzStatus(text, type) {
    var st = byId("zzzBatchStatus");
    if (!st) return;
    var el = st.querySelector('.zzz-status-text');
    if (el) el.innerHTML = escapeHtml(text);
    if (!el) return;
    if (type === 'error') el.style.color = 'var(--zzz-red)';
    else if (type === 'success') el.style.color = '#00FFCC';
    else el.style.color = 'var(--zzz-yellow)';
  }

  function startZzzBatchAsync() {
    if (window.YOUKAI_UPDATE_BUSY || singleScriptRunning) return;
    if (zzzState.isRunning) return;
    
    if (zzzState.tasks.length === 0) {
      setZzzStatus("错误：未添加任何脚本到任务列队", "error");
      return;
    }
    
    var folderInput = byId("zzzBatchFolderInput");
    var folder = folderInput ? folderInput.value.trim() : "";
    if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
      setZzzStatus("错误：请选择有效的 AI 根目录", "error");
      return;
    }
    
    zzzState.isRunning = true;
    zzzState.stopRequested = false;
    zzzState.success = 0;
    zzzState.errors = [];
    zzzState.options = {
      scriptPaths: zzzState.tasks.map(function(t) { return t.fullPath; }),
      saveSource: byId("zzzBatchSaveSource").checked,
      pdfCompat: byId("zzzBatchPdfCompat").checked,
      useCompression: byId("zzzBatchUseCompression").checked,
      embedIcc: byId("zzzBatchEmbedIcc").checked,
      outputFolder: state.paths.outputFolder || ""
    };
    byId("zzzStartBatchBtn").style.display = "none";
    byId("zzzStopBatchBtn").style.display = "block";
    setZzzStatus("正在扫描文件夹获取 AI 文件...", "");
    
    // 异步获取文件列表
    ensureJsxLoaded(function(loaded, reason) {
      if (!loaded) { finishZzzBatch("宿主未就绪: " + reason, "error"); return; }
      cs.evalScript('try { (typeof Youkai !== "undefined" && Youkai.getAllAIFilesJSON) ? Youkai.getAllAIFilesJSON(' + toEvalString(folder) + ') : JSON.stringify({ok:false, message:"宿主未就绪"}); } catch(e) { JSON.stringify({ok:false, message:e.toString()}); }', function(res) {
        try {
          if (res && res.indexOf("EvalScript error") >= 0) {
            throw new Error("ExtendScript 引擎执行失败 (可能 AI 正在忙碌或有弹窗未关闭)");
          }
          var parsed = JSON.parse(res);
          if (parsed.ok) {
            zzzState.filesToProcess = parsed.files;
            zzzState.currentIndex = 0;
            if (zzzState.filesToProcess.length === 0) {
              finishZzzBatch("所选目录中未找到任何 .ai 文件", "error");
              return;
            }
            // 开始处理第一个
            processNextZzzFile();
          } else {
            finishZzzBatch("扫描文件失败: " + parsed.message, "error");
          }
        } catch(e) {
          finishZzzBatch("扫描文件解析异常: " + e.message, "error");
        }
      });
    });
  }

  function stopZzzBatchAsync() {
    if (!zzzState.isRunning) return;
    zzzState.stopRequested = true;
    setZzzStatus("将在当前文件完成后停止。", "error");
    byId("zzzStopBatchBtn").innerHTML = "正在停止...";
    byId("zzzStopBatchBtn").disabled = true;
  }

  function finishZzzBatch(msg, type) {
    if (zzzState.errors && zzzState.errors.length) {
      try {
        fs.mkdirSync(batchDir, {recursive: true});
        var logPath = path.join(batchDir, "batch-errors-" + Date.now() + ".json");
        fs.writeFileSync(logPath, JSON.stringify(zzzState.errors, null, 2), "utf8");
        msg += "；错误日志: " + logPath;
      } catch (e) { msg += "；日志写入失败: " + e.message; }
    }
    zzzState.isRunning = false;
    zzzState.stopRequested = false;
    setZzzStatus(msg, type);
    
    byId("zzzStartBatchBtn").style.display = "block";
    var stopBtn = byId("zzzStopBatchBtn");
    stopBtn.style.display = "none";
    stopBtn.innerHTML = "停止批处理";
    stopBtn.disabled = false;
  }

  function processNextZzzFile() {
    if (zzzState.stopRequested) {
      finishZzzBatch("已停止。完成进度: " + zzzState.currentIndex + "/" + zzzState.filesToProcess.length, "error");
      return;
    }
    
    if (zzzState.currentIndex >= zzzState.filesToProcess.length) {
      finishZzzBatch("批处理完成。成功: " + zzzState.success + "；失败: " + zzzState.errors.length + "；总计: " + zzzState.filesToProcess.length, zzzState.errors.length ? "error" : "success");
      return;
    }
    
    var currentFile = zzzState.filesToProcess[zzzState.currentIndex];
    var fileName = path.basename(currentFile);
    setZzzStatus("处理中 [" + (zzzState.currentIndex + 1) + "/" + zzzState.filesToProcess.length + "]: " + fileName, "");
    
    var scriptPaths = zzzState.options.scriptPaths;
    var saveSource = !!(byId("zzzBatchSaveSource") && byId("zzzBatchSaveSource").checked);
    var pdfCompat = !!(byId("zzzBatchPdfCompat") && byId("zzzBatchPdfCompat").checked);
    var useCompression = !!(byId("zzzBatchUseCompression") && byId("zzzBatchUseCompression").checked);
    var embedIcc = !!(byId("zzzBatchEmbedIcc") && byId("zzzBatchEmbedIcc").checked);
    
    var config = {
      targetFile: currentFile,
      scriptPaths: scriptPaths,
      saveSource: zzzState.options.saveSource,
      pdfCompat: zzzState.options.pdfCompat,
      useCompression: zzzState.options.useCompression,
      embedIcc: zzzState.options.embedIcc,
      outputFolder: zzzState.options.outputFolder
    };
    
    // 通过 evalScript 单独处理这个文件
    syncGlobalPathsToJsx(function(ok, reason) {
      if (!ok) { finishZzzBatch("配置同步失败: " + reason, "error"); return; }
      if (zzzState.stopRequested) { finishZzzBatch("已停止。完成进度: " + zzzState.currentIndex + "/" + zzzState.filesToProcess.length, "error"); return; }
      cs.evalScript('try { (typeof Youkai !== "undefined" && Youkai.processSingleFileForBatch) ? Youkai.processSingleFileForBatch(' + toEvalString(JSON.stringify(config)) + ') : JSON.stringify({ok:false, message:"宿主未就绪"}); } catch(e) { JSON.stringify({ok:false, message:e.toString()}); }', function(res) {
        try {
          var result = JSON.parse(res);
          if (result.ok) zzzState.success++;
          else zzzState.errors.push({file: currentFile, message: result.message || "处理失败"});
        } catch (e) { zzzState.errors.push({file: currentFile, message: String(res || "宿主未返回有效结果")}); }
        zzzState.currentIndex++;
        // 使用 setTimeout 释放调用栈，防止 UI 阻塞
        setTimeout(processNextZzzFile, 50);
      });
    });
  }

  window.onload = init;
})();

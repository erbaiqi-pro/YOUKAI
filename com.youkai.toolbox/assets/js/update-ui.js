/* YOUKAI | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
(function () {
  "use strict";
  window.YoukaiUpdateUI = {start: function (options) {
    var byId = function (id) { return document.getElementById(id); };
    var badge = byId("youkaiUpdateBadge"), card = byId("youkaiUpdateCard"), status = byId("youkaiUpdateStatus");
    var apply = byId("youkaiApplyUpdateBtn"), close = byId("youkaiCloseUpdateBtn"), reload = byId("youkaiReloadUpdateBtn");
    var release = byId("youkaiReleaseBtn"), manual = byId("youkaiCheckUpdateBtn"), title = byId("youkaiUpdateTitle");
    var latest = null, service, updating = false, checking = false, applied = false, disabled = [];
    if (!badge || !card || !status) return;
    function text(message) { status.textContent = message; }
    function reveal() { if (options.onReveal) options.onReveal(); card.hidden = false; }
    function freeze(value) {
      window.YOUKAI_UPDATE_BUSY = value;
      if (value) {
        disabled = [];
        Array.prototype.forEach.call(document.querySelectorAll("button,input,select"), function (el) {
          if (card.contains(el)) return;
          disabled.push([el, el.disabled]); el.disabled = true;
        });
      } else { disabled.forEach(function (entry) { entry[0].disabled = entry[1]; }); disabled = []; }
    }
    function render(result, message) {
      latest = result || latest;
      var available = latest && latest.state === "available";
      badge.hidden = !available;
      badge.title = available ? "YOUKAI " + latest.version + " 可更新" : "";
      apply.hidden = !available; release.hidden = !available; reload.hidden = !applied;
      title.textContent = available ? "发现新版本 " + latest.version : "软件更新";
      if (message) text(message);
      else if (available) text("当前 " + latest.currentVersion + " → " + latest.version + "。更新会保留表格、个人脚本和设置。");
      else text("当前版本 " + service.version() + "，暂无可用更新。");
    }
    function progress(phase, data) {
      var messages = {downloading: "正在下载更新…", verifying: "正在校验更新文件…", preparing: "正在准备更新并保留个人文件…", installing: "正在备份并更新程序…"};
      if (messages[phase]) text(messages[phase] + (data.total ? " " + Math.min(100, Math.floor(data.loaded / data.total * 100)) + "%" : ""));
    }
    try {
      var path = require("path"), modulePath = path.join(options.root, "assets/js/updater.js");
      if (require.resolve && require.cache) delete require.cache[require.resolve(modulePath)];
      var updater = require(modulePath), env = options.cs.getHostEnvironment() || {};
      service = updater.create({root: options.root, dataDir: path.join(options.userData, "Youkai", "updates"), hostMajor: parseInt(env.appVersion || "0", 10), isBusy: options.isBusy, onProgress: progress});
      service.recover();
      if (byId("youkaiCurrentVersion")) byId("youkaiCurrentVersion").textContent = service.version();
    } catch (error) {
      badge.hidden = true;
      if (manual) manual.onclick = function () { reveal(); apply.hidden = true; release.hidden = true; text("暂时无法检查更新：" + error.message); };
      close.onclick = function () { card.hidden = true; };
      return;
    }
    badge.onclick = function () { if (!updating) { reveal(); render(latest); } };
    close.onclick = function () { if (!updating && !applied) card.hidden = true; };
    function check(force, requested) {
      if (checking || updating || applied) return;
      checking = true;
      apply.disabled = true;
      if (manual) manual.disabled = true;
      if (requested) { reveal(); text("正在检查更新…"); }
      service.check(force).then(function (result) {
        checking = false; apply.disabled = false; if (manual) manual.disabled = false;
        render(result, requested && result.warning ? "暂时无法联网，显示上次检测到的版本 " + result.version + "。您可以稍后重试。" : "");
      }, function (error) {
        checking = false; apply.disabled = false; if (manual) manual.disabled = false;
        if (requested) render(latest, "暂时无法联网，请稍后重试。您可以继续使用当前版本。\n" + error.message);
      });
    }
    if (manual) manual.onclick = function () { check(true, true); };
    release.onclick = function () {
      if (!latest || !latest.url) return;
      if (window.cep && window.cep.util) window.cep.util.openURLInDefaultBrowser(latest.url);
      else window.open(latest.url);
    };
    apply.onclick = function () {
      if (checking || updating || applied || !latest) return;
      if (options.isBusy && options.isBusy()) { text("请先完成或停止脚本任务，再更新 YOUKAI。"); return; }
      updating = true; freeze(true); apply.disabled = true; close.disabled = true; release.disabled = true;
      service.install(latest).then(function (result) {
        updating = false; applied = true;
        badge.hidden = true; apply.hidden = true; release.hidden = true; reload.hidden = false; reload.disabled = false;
        title.textContent = "已更新到 " + result.version;
        text("更新完成，点击“重新加载”后生效。");
      }, function (error) {
        if (error.recoveryRequired) {
          updating = false; apply.hidden = true; release.hidden = true;
          title.textContent = "需要恢复旧版"; text(error.message);
          return; // 保留任务冻结和恢复记录，避免运行尚未恢复完整的程序。
        }
        updating = false; freeze(false); apply.disabled = false; close.disabled = false; release.disabled = false;
        render(latest, "更新未完成：" + error.message);
      });
    };
    reload.onclick = function () {
      if (!applied) return;
      reload.disabled = true;
      var main = options.root.replace(/\\/g, "/") + "/scripts/main.jsx";
      options.cs.evalScript('try { $.evalFile(' + JSON.stringify(main) + '); "YOUKAI_RELOADED"; } catch(e) { "ERROR:" + e.toString(); }', function (result) {
        if (result === "YOUKAI_RELOADED") window.location.reload();
        else { text("程序已更新，请关闭后重新打开 YOUKAI。当前宿主暂时无法重新加载。"); reload.disabled = false; }
      });
    };
    var saved = service.cached(); if (saved) render(saved);
    check(false, false);
  }};
}());

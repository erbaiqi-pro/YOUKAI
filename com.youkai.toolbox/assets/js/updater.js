/* YOUKAI | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/* 来源标识：YOUKAI-ONLINE-UPDATE-20261104。仅在用户主动点击更新后替换程序。 */
"use strict";
var fs = require("fs"), path = require("path"), crypto = require("crypto");
var https = require("https"), url = require("url"), zlib = require("zlib");
var REPO = "erbaiqi-pro/YOUKAI", API = "https://api.github.com/repos/" + REPO + "/releases/latest";
var MANIFEST = "YOUKAI-Update.json", CATALOG = "release-files.json";
var MAX_ZIP = 64 * 1024 * 1024, MAX_TOTAL = 128 * 1024 * 1024, MAX_FILES = 4096;
function fail(message) { throw new Error(message); }
function sha(data) { return crypto.createHash("sha256").update(data).digest("hex"); }
function version(value) {
  var text = String(value || "").replace(/^v/, "");
  if (/^\d+\.\d+$/.test(text)) text += ".0";
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(text)) fail("版本号格式不正确。");
  if (text.split(".").some(function (n) { return Number(n) > 2147483647; })) fail("版本号过大。");
  return text;
}
function compare(a, b) {
  a = version(a).split("."); b = version(b).split(".");
  for (var i = 0; i < 3; i++) { if (+a[i] !== +b[i]) return +a[i] > +b[i] ? 1 : -1; }
  return 0;
}
function mkdir(directory) {
  if (fs.existsSync(directory)) { if (!fs.statSync(directory).isDirectory()) fail("目录被同名文件占用。"); return; }
  var parent = path.dirname(directory); if (parent !== directory) mkdir(parent);
  fs.mkdirSync(directory);
}
function within(base, target) {
  var rel = path.relative(path.resolve(base), path.resolve(target));
  if (!rel || rel === ".." || rel.indexOf(".." + path.sep) === 0 || path.isAbsolute(rel)) fail("更新路径超出允许目录。");
  return target;
}
function plain(target) {
  var current = path.resolve(target);
  while (current) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fail("更新目录含链接，请先检查安装位置。");
    var parent = path.dirname(current); if (parent === current) break; current = parent;
  }
}
function json(data) { return JSON.parse(String(data).replace(/^\uFEFF/, "")); }
function readJson(file) { return json(fs.readFileSync(file, "utf8")); }
function atomicJson(file, value) {
  mkdir(path.dirname(file));
  var temporary = file + ".tmp-" + crypto.randomBytes(6).toString("hex");
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", {encoding: "utf8", flag: "wx"});
  fs.renameSync(temporary, file);
}
function safeName(name) {
  if (!name || name.length > 220 || name.indexOf("\\") >= 0 || name.charAt(0) === "/") fail("更新文件路径无效。");
  var parts = name.split("/");
  parts.forEach(function (part) {
    if (!part || part === "." || part === ".." || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) fail("更新文件路径无效：" + name);
  });
  return name;
}
function managed(name) {
  return /^(index(?:_full|_2023_safe)?\.html|release\.json|config\.json|LICENSE\.txt|THIRD_PARTY_NOTICES\.md)$/.test(name) || /^(assets|CSXS|scripts|user_scripts|licenses)\//.test(name);
}
function catalog(value) {
  if (!value || value.schemaVersion !== 1 || value.name !== "YOUKAI" || !Array.isArray(value.files) || value.files.length > MAX_FILES) fail("更新文件清单无效。");
  version(value.version);
  var names = Object.create(null), total = 0;
  value.files.forEach(function (file) {
    safeName(file.path);
    var key = file.path.toLowerCase();
    if (!managed(file.path) || names[key] || !/^[a-f0-9]{64}$/.test(file.sha256) || typeof file.size !== "number" || file.size < 0 || file.size % 1 || file.size > MAX_TOTAL) fail("更新文件清单包含无效记录。");
    names[key] = true; total += file.size;
  });
  if (total > MAX_TOTAL) fail("更新文件过大。");
  return value;
}
function validateManifest(value, expectedVersion) {
  if (!value || value.schemaVersion !== 1 || value.name !== "YOUKAI" || value.repository !== REPO || value.channel !== "stable") fail("更新清单不属于 YOUKAI 正式发布。");
  if (value.version !== version(expectedVersion) || version(value.version) !== value.version) fail("更新清单和发布版本不一致。");
  if (value.minUpdaterVersion !== 1) fail("请安装新版 YOUKAI 后再使用此更新。");
  if (!Array.isArray(value.platforms) || !value.platforms.length || value.platforms.some(function (p) { return p !== "win32" && p !== "darwin"; })) fail("更新平台信息无效。");
  if (typeof value.minHostMajor !== "number" || value.minHostMajor < 16 || value.minHostMajor % 1) fail("Illustrator 版本要求无效。");
  if (!/^[a-f0-9]{64}$/.test(value.sha256) || value.asset !== "YOUKAI-Update-" + value.version + ".zip" || typeof value.size !== "number" || value.size < 1 || value.size > MAX_ZIP || value.size % 1) fail("更新下载信息无效。");
  return value;
}
function releaseAsset(link, tag, name) {
  return link === "https://github.com/" + REPO + "/releases/download/" + encodeURIComponent(tag) + "/" + name;
}
function allowedUrl(link) {
  var parsed = url.parse(link);
  return parsed.protocol === "https:" && !parsed.auth && (!parsed.port || parsed.port === "443") && ["api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "github-releases.githubusercontent.com"].indexOf(parsed.hostname) >= 0;
}
function request(link, limit, progress, redirects) {
  return new Promise(function (resolve, reject) {
    if (!allowedUrl(link)) { reject(new Error("更新下载地址不受支持。")); return; }
    var done = false, req, timer;
    function finish(error, result) { if (done) return; done = true; clearTimeout(timer); if (error) reject(error); else resolve(result); }
    try {
      req = https.get(link, {headers: {"User-Agent": "YOUKAI-Updater/1", "Accept": "application/vnd.github+json"}}, function (res) {
        if ([301, 302, 303, 307, 308].indexOf(res.statusCode) >= 0) {
          res.resume(); clearTimeout(timer);
          if ((redirects || 0) >= 5 || !res.headers.location) { finish(new Error("更新下载重定向异常。")); return; }
          request(url.resolve(link, res.headers.location), limit, progress, (redirects || 0) + 1).then(function (result) { finish(null, result); }, finish);
          return;
        }
        if (res.statusCode !== 200) { res.resume(); var error = new Error("更新服务暂时不可用（" + res.statusCode + "）。"); error.status = res.statusCode; finish(error); return; }
        var total = Number(res.headers["content-length"] || 0), size = 0, chunks = [];
        if (total > limit) { res.destroy(); finish(new Error("更新文件超过大小限制。")); return; }
        res.on("data", function (chunk) {
          if (done) return;
          size += chunk.length;
          if (size > limit) { res.destroy(); finish(new Error("更新文件超过大小限制。")); return; }
          chunks.push(chunk); if (progress) progress(size, total);
        });
        res.on("error", finish);
        res.on("end", function () {
          if (total && size !== total) { finish(new Error("更新文件下载不完整。")); return; }
          finish(null, Buffer.concat(chunks));
        });
        res.on("aborted", function () { finish(new Error("更新下载已中断。")); });
      });
      req.on("error", finish);
      timer = setTimeout(function () { req.abort(); finish(new Error("检查或下载超时，请稍后重试。")); }, 60000);
    } catch (error) { finish(error); }
  });
}
var crcTable;
function crc32(data) {
  if (!crcTable) {
    crcTable = [];
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; crcTable[n] = c >>> 0; }
  }
  var result = -1;
  for (var i = 0; i < data.length; i++) result = crcTable[(result ^ data[i]) & 255] ^ result >>> 8;
  return (result ^ -1) >>> 0;
}
function unpack(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_ZIP || buffer.length < 22) fail("更新 ZIP 无效。");
  var end = -1, i;
  for (i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || buffer.readUInt16LE(end + 8) !== buffer.readUInt16LE(end + 10)) fail("不支持此 ZIP 格式。");
  var count = buffer.readUInt16LE(end + 10), size = buffer.readUInt32LE(end + 12), offset = buffer.readUInt32LE(end + 16);
  if (!count || count > MAX_FILES || offset + size !== end) fail("ZIP 文件目录无效。");
  var files = Object.create(null), names = Object.create(null), total = 0, cursor = offset, ranges = [];
  for (i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) fail("ZIP 文件目录损坏。");
    var flags = buffer.readUInt16LE(cursor + 8), method = buffer.readUInt16LE(cursor + 10), crc = buffer.readUInt32LE(cursor + 16);
    var compressed = buffer.readUInt32LE(cursor + 20), original = buffer.readUInt32LE(cursor + 24), nameLength = buffer.readUInt16LE(cursor + 28);
    var next = cursor + 46 + nameLength + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
    var attrs = buffer.readUInt32LE(cursor + 38), local = buffer.readUInt32LE(cursor + 42);
    if (next > end || flags & 1 || (method !== 0 && method !== 8) || (attrs >>> 16 & 0xf000) === 0xa000 || compressed === 0xffffffff || original === 0xffffffff || local === 0xffffffff) fail("ZIP 包含不支持或不安全的条目。");
    var rawName = buffer.slice(cursor + 46, cursor + 46 + nameLength), name = rawName.toString("utf8");
    if (name.charAt(name.length - 1) === "/") fail("更新 ZIP 应只包含文件。");
    safeName(name);
    if (!Buffer.from(name, "utf8").equals(rawName) || names[name.toLowerCase()]) fail("ZIP 文件名重复或编码无效。");
    names[name.toLowerCase()] = true; total += original;
    if (total > MAX_TOTAL || original > 16 * 1024 * 1024 || (compressed && original > compressed * 1000)) fail("ZIP 解压大小超出限制。");
    if (local + 30 > offset || buffer.readUInt32LE(local) !== 0x04034b50 || buffer.readUInt16LE(local + 6) !== flags || buffer.readUInt16LE(local + 8) !== method) fail("ZIP 本地记录不一致。");
    var localLength = buffer.readUInt16LE(local + 26), start = local + 30 + localLength + buffer.readUInt16LE(local + 28);
    if (localLength !== nameLength || !buffer.slice(local + 30, local + 30 + localLength).equals(rawName) || start + compressed > offset) fail("ZIP 文件范围无效。");
    ranges.push([local, start + compressed]);
    // 正式工具生成 stored ZIP，兼容旧 CEP；压缩 ZIP 只在支持输出上限的 Node 中读取。
    var runtime = String(process.versions.node).split(".").map(Number);
    if (method === 8 && !(runtime[0] >= 16 || runtime[0] === 15 && runtime[1] >= 6 || runtime[0] === 14 && runtime[1] >= 17)) fail("当前宿主不支持此压缩包，请使用 YOUKAI 官方更新包。");
    var data = method === 0 ? buffer.slice(start, start + compressed) : zlib.inflateRawSync(buffer.slice(start, start + compressed), {maxOutputLength: Math.min(original + 1, 16 * 1024 * 1024 + 1)});
    if (data.length !== original || crc32(data) !== crc) fail("ZIP 文件校验失败。");
    files[name] = data; cursor = next;
  }
  if (cursor !== end) fail("ZIP 文件数不一致。");
  ranges.sort(function (a, b) { return a[0] - b[0]; });
  for (i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) fail("ZIP 文件记录重叠。");
  return files;
}
function payload(buffer, manifest) {
  validateManifest(manifest, manifest.version);
  if (buffer.length !== manifest.size || sha(buffer) !== manifest.sha256) fail("更新文件 SHA256 校验失败，请重新下载。");
  var files = unpack(buffer);
  if (!files[CATALOG]) fail("更新包缺少文件清单。");
  var list = catalog(json(files[CATALOG]));
  if (list.version !== manifest.version || Object.keys(files).length !== list.files.length + 1) fail("更新包与清单不一致。");
  list.files.forEach(function (file) {
    if (!files[file.path] || files[file.path].length !== file.size || sha(files[file.path]) !== file.sha256) fail("更新文件校验失败：" + file.path);
  });
  ["index.html", "index_full.html", "assets/js/app.js", "assets/js/updater.js", "assets/js/update-ui.js", "scripts/main.jsx", "release.json", "CSXS/manifest.xml"].forEach(function (name) { if (!files[name]) fail("更新包缺少必要文件：" + name); });
  var release = json(files["release.json"]), xml = String(files["CSXS/manifest.xml"]);
  if (release.name !== "YOUKAI" || version(release.version) !== manifest.version || !/<ExtensionManifest\b[^>]*\bExtensionBundleId="com\.youkai\.extension"/.test(xml)) fail("更新包不是匹配的 YOUKAI 插件。");
  var xmlVersion = xml.match(/<ExtensionManifest\b[^>]*\bExtensionBundleVersion="([^"]+)"/);
  if (!xmlVersion || version(xmlVersion[1]) !== manifest.version) fail("插件清单版本不一致。");
  var actualCount = Object.keys(files).filter(function (name) { return /^user_scripts\/[^/]+\.jsx$/.test(name); }).length;
  if (actualCount !== release.scriptCount) fail("更新包脚本数量不一致。");
  return {files: files, catalog: list};
}
function inventory(directory) {
  plain(directory);
  var records = [], bytes = 0;
  function visit(current, prefix) {
    fs.readdirSync(current).sort().forEach(function (name) {
      var file = path.join(current, name), stat = fs.lstatSync(file), relative = prefix + name;
      if (stat.isSymbolicLink()) fail("安装目录中有链接，已停止更新：" + relative);
      if (stat.isDirectory()) visit(file, relative + "/");
      else if (stat.isFile()) {
        safeName(relative); bytes += stat.size;
        if (records.length >= 20000 || bytes > 512 * 1024 * 1024) fail("安装目录包含过多个人文件，请先整理后更新。");
        records.push({path: relative, sha256: sha(fs.readFileSync(file)), size: stat.size});
      } else fail("安装目录包含不支持的文件。");
    });
  }
  visit(directory, ""); return records;
}
function installationRoot(root, allowMissing) {
  plain(root);
  if (!/[\\/]Adobe[\\/]CEP[\\/]extensions[\\/][^\\/]+$/i.test(root)) fail("当前是开发目录，请先安装带更新功能的 YOUKAI 再使用在线更新。");
  if (allowMissing && !fs.existsSync(root)) return;
  if (!/<ExtensionManifest\b[^>]*\bExtensionBundleId="com\.youkai\.extension"/.test(fs.readFileSync(path.join(root, "CSXS/manifest.xml"), "utf8"))) fail("安装位置不是 YOUKAI。");
}
function create(options) {
  var root = path.resolve(options.root), dataDir = path.resolve(options.dataDir);
  var current = version(readJson(path.join(root, "release.json")).version);
  var cacheFile = path.join(dataDir, "latest.json"), journalFile = path.join(dataDir, "transaction.json"), lockFile = path.join(dataDir, "update.lock");
  var backupBase = path.join(path.dirname(path.dirname(root)), "YOUKAI-update-backups");
  var fetch = options.request || request, busy = false, cacheHours = 6;
  var platform = options.platform || process.platform, hostMajor = Number(options.hostMajor || 0);
  function notify(phase, extra) { if (options.onProgress) options.onProgress(phase, extra || {}); }
  function compatible(manifest) {
    if (manifest.platforms.indexOf(platform) < 0) fail("这个版本不适用于当前系统。");
    if (hostMajor && manifest.minHostMajor > hostMajor) fail("这个版本需要 Illustrator " + manifest.minHostMajor + " 或更高版本。");
  }
  function candidate(release, manifest) {
    if (!release || release.draft || release.prerelease || !Array.isArray(release.assets)) fail("未找到有效的正式发布。");
    var next = version(release.tag_name);
    validateManifest(manifest, next);
    var matches = release.assets.filter(function (asset) { return asset.name === manifest.asset; });
    var manifests = release.assets.filter(function (asset) { return asset.name === MANIFEST; });
    if (matches.length !== 1 || manifests.length !== 1 || !releaseAsset(matches[0].browser_download_url, release.tag_name, manifest.asset) || !releaseAsset(manifests[0].browser_download_url, release.tag_name, MANIFEST)) fail("正式发布缺少配套更新文件。");
    if (matches[0].size !== manifest.size) fail("更新文件大小和发布信息不一致。");
    var expectedPage = "https://github.com/" + REPO + "/releases/tag/" + encodeURIComponent(release.tag_name);
    if (release.html_url !== expectedPage) fail("更新说明地址不正确。");
    return {state: compare(next, current) > 0 ? "available" : "current", version: next, currentVersion: current, notes: String(release.body || "").slice(0, 12000), url: expectedPage, manifest: manifest, archiveUrl: matches[0].browser_download_url};
  }
  function cached() {
    try { var saved = readJson(cacheFile), result = saved.release ? candidate(saved.release, saved.manifest) : {state: "current", currentVersion: current}; result.checkedAt = saved.checkedAt; return result; }
    catch (error) { return null; }
  }
  function check(force) {
    var saved = cached(), apiRead = false;
    if (!force && saved && saved.checkedAt > Date.now() - cacheHours * 3600000 && saved.checkedAt <= Date.now()) return Promise.resolve(saved);
    return fetch(API, 2 * 1024 * 1024).then(function (data) {
      var release = json(data);
      apiRead = true;
      if (compare(version(release.tag_name), current) <= 0) {
        if (release.draft || release.prerelease) fail("未找到有效的正式发布。");
        try { atomicJson(cacheFile, {checkedAt: Date.now(), release: null}); } catch (ignored) {}
        return {state: "current", currentVersion: current};
      }
      if (!Array.isArray(release.assets)) fail("正式发布缺少更新文件。");
      var assets = release.assets.filter(function (asset) { return asset.name === MANIFEST; });
      if (assets.length !== 1 || !releaseAsset(assets[0].browser_download_url, release.tag_name, MANIFEST)) fail("正式发布缺少配套更新文件。");
      return fetch(assets[0].browser_download_url, 1024 * 1024).then(function (bytes) {
        var manifest = json(bytes), result = candidate(release, manifest);
        try { atomicJson(cacheFile, {checkedAt: Date.now(), release: release, manifest: manifest}); } catch (ignored) {}
        return result;
      });
    }).catch(function (error) {
      if (error.status === 404 && !apiRead) {
        try { atomicJson(cacheFile, {checkedAt: Date.now(), release: null}); } catch (ignored) {}
        return {state: "current", currentVersion: current, noRelease: true};
      }
      if (saved && saved.state === "available") { saved.warning = error.message; return saved; }
      throw error;
    });
  }
  function lock() {
    plain(dataDir); mkdir(dataDir);
    try { fs.writeFileSync(lockFile, JSON.stringify({pid: process.pid, root: root}), {flag: "wx"}); }
    catch (error) { fail("另一个 YOUKAI 面板正在更新，请稍后重试。"); }
  }
  function unlock() { try { fs.unlinkSync(lockFile); } catch (ignored) {} }
  function verifyTree(directory, list) {
    list.files.forEach(function (file) { var actual = fs.readFileSync(path.join(directory, file.path)); if (actual.length !== file.size || sha(actual) !== file.sha256) fail("写入后校验失败：" + file.path); });
  }
  function installBuffer(buffer, manifest) {
    if (options.isBusy && options.isBusy()) fail("请先完成或停止脚本任务，再更新 YOUKAI。");
    compatible(manifest); validateManifest(manifest, manifest.version);
    if (compare(manifest.version, current) <= 0) fail("更新版本不高于当前版本。");
    installationRoot(root);
    var pack = payload(buffer, manifest), old = inventory(root), oldCatalog = null;
    if (fs.existsSync(path.join(root, CATALOG))) oldCatalog = catalog(readJson(path.join(root, CATALOG)));
    var oldManaged = Object.create(null), newManaged = Object.create(null);
    if (oldCatalog) oldCatalog.files.forEach(function (file) { oldManaged[file.path.toLowerCase()] = true; });
    Object.keys(pack.files).forEach(function (name) { newManaged[name.toLowerCase()] = true; });
    var token = Date.now() + "-" + crypto.randomBytes(6).toString("hex");
    plain(backupBase); mkdir(backupBase);
    var stage = within(backupBase, path.join(backupBase, token + "-new"));
    var backup = within(backupBase, path.join(backupBase, token + "-previous"));
    var displaced = within(backupBase, path.join(backupBase, token + "-failed"));
    var movedOld = false, movedNew = false, ownJournal = false;
    var journal = {root: root, stage: stage, backup: backup, displaced: displaced, version: manifest.version, phase: "preparing", oldFiles: old};
    lock();
    try {
      if (fs.existsSync(journalFile)) fail("有上次未完成的更新，请重新打开面板恢复后再试。");
      mkdir(stage); atomicJson(journalFile, journal); ownJournal = true; notify("preparing");
      Object.keys(pack.files).forEach(function (name) { var target = within(stage, path.join(stage, name)); mkdir(path.dirname(target)); fs.writeFileSync(target, pack.files[name], {flag: "wx"}); });
      old.forEach(function (file) {
        var key = file.path.toLowerCase();
        if (oldCatalog && newManaged[key] && !oldManaged[key] && key !== CATALOG) {
          var incoming = Object.keys(pack.files).filter(function (name) { return name.toLowerCase() === key; })[0];
          if (sha(pack.files[incoming]) !== file.sha256) fail("个人文件与新版文件同名，请先为个人文件改名后重试：" + file.path);
        }
        if (key === CATALOG || newManaged[key] || oldManaged[key]) return;
        var target = within(stage, path.join(stage, file.path)); mkdir(path.dirname(target));
        var source = fs.readFileSync(path.join(root, file.path));
        if (sha(source) !== file.sha256) fail("个人文件在更新时发生了变化，请重试。");
        fs.writeFileSync(target, source, {flag: "wx"});
        if (sha(fs.readFileSync(target)) !== file.sha256) fail("个人文件保留校验失败。");
        var stat = fs.statSync(path.join(root, file.path));
        fs.chmodSync(target, stat.mode & 511); fs.utimesSync(target, stat.atime, stat.mtime);
      });
      verifyTree(stage, pack.catalog);
      if (options.isBusy && options.isBusy()) fail("脚本任务尚未完成，更新已停止。");
      if (JSON.stringify(inventory(root)) !== JSON.stringify(old)) fail("安装文件在准备期间发生了变化，请重试。");
      // 新旧目录在同一 CEP 目录下的同一磁盘；每次移动前记录状态。
      journal.phase = "moving-old"; atomicJson(journalFile, journal); notify("installing");
      fs.renameSync(root, backup); movedOld = true;
      journal.phase = "moving-new"; atomicJson(journalFile, journal);
      fs.renameSync(stage, root); movedNew = true;
      verifyTree(root, pack.catalog);
      journal.phase = "committed"; atomicJson(journalFile, journal);
      try { fs.unlinkSync(cacheFile); } catch (ignoredCache) {}
      fs.unlinkSync(journalFile);
      current = manifest.version;
      return {ok: true, version: current, backupPath: backup, reloadRequired: true};
    } catch (error) {
      if (movedOld) {
        try {
          if (movedNew) fs.renameSync(root, displaced);
          fs.renameSync(backup, root);
          if (JSON.stringify(inventory(root)) !== JSON.stringify(old)) fail("恢复校验失败。");
        } catch (restoreError) {
          var recoveryError = new Error("更新未完成，自动恢复失败。请关闭 Adobe 后从此目录恢复旧版：" + backup + "。原因：" + restoreError.message);
          recoveryError.recoveryRequired = true; throw recoveryError;
        }
      }
      try { if (ownJournal && fs.existsSync(journalFile)) fs.unlinkSync(journalFile); } catch (ignoredJournal) {}
      throw error;
    } finally { unlock(); }
  }
  function recover() {
    plain(dataDir);
    if (fs.existsSync(lockFile)) {
      var previous = readJson(lockFile), active = false;
      try { process.kill(previous.pid, 0); active = true; } catch (ignoredPid) {}
      if (active) fail("另一个面板正在更新，请稍后重新打开 YOUKAI。");
      fs.unlinkSync(lockFile);
    }
    if (!fs.existsSync(journalFile)) return {recovered: false};
    installationRoot(root, true);
    var journal = readJson(journalFile);
    if (journal.root !== root || [journal.stage, journal.backup, journal.displaced].some(function (p) { return path.dirname(path.resolve(p)) !== path.resolve(backupBase); })) fail("上次更新的恢复信息无效。");
    [journal.stage, journal.backup, journal.displaced].forEach(plain);
    lock();
    try {
      var committed = false;
      if (journal.phase === "committed" && fs.existsSync(root)) {
        try { verifyTree(root, catalog(readJson(path.join(root, CATALOG)))); committed = true; } catch (invalidNew) {}
      }
      if (!committed && fs.existsSync(journal.backup)) {
        if (!Array.isArray(journal.oldFiles) || JSON.stringify(inventory(journal.backup)) !== JSON.stringify(journal.oldFiles)) fail("旧版备份校验失败，请人工检查后恢复。");
        if (fs.existsSync(root)) fs.renameSync(root, journal.displaced);
        fs.renameSync(journal.backup, root);
      }
      if (!fs.existsSync(root)) fail("安装目录缺失，请从 YOUKAI-update-backups 中恢复旧版。");
      current = version(readJson(path.join(root, "release.json")).version);
      fs.unlinkSync(journalFile);
      return {recovered: true, version: current};
    } finally { unlock(); }
  }
  function install(result) {
    if (busy) return Promise.reject(new Error("更新正在进行。"));
    try {
      if (options.isBusy && options.isBusy()) fail("请先完成或停止脚本任务，再更新 YOUKAI。");
      compatible(result.manifest); installationRoot(root);
      validateManifest(result.manifest, result.version);
      if (!releaseAsset(result.archiveUrl, "v" + result.version, result.manifest.asset) && !releaseAsset(result.archiveUrl, result.version, result.manifest.asset)) fail("更新下载地址不正确。");
    } catch (error) { return Promise.reject(error); }
    busy = true; notify("downloading");
    return fetch(result.archiveUrl, MAX_ZIP, function (loaded, total) { notify("downloading", {loaded: loaded, total: total}); }).then(function (buffer) {
      notify("verifying"); return installBuffer(buffer, result.manifest);
    }).then(function (done) { busy = false; notify("done", done); return done; }, function (error) { busy = false; notify("error", {message: error.message}); throw error; });
  }
  return {check: check, cached: cached, install: install, installBuffer: installBuffer, recover: recover, version: function () { return current; }};
}
module.exports = {create: create, compare: compare, version: version, validateManifest: validateManifest, unpack: unpack, payload: payload, sha256: sha, repository: REPO};

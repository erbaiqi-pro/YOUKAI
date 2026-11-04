/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
(function () {
    'use strict';
    function getCep() {
        if (typeof window !== "undefined" && window.__adobe_cep__) return window.__adobe_cep__;
        if (typeof window !== "undefined" && window.top && window.top.__adobe_cep__) return window.top.__adobe_cep__;
        if (typeof window !== "undefined" && window.parent && window.parent.__adobe_cep__) return window.parent.__adobe_cep__;
        return null;
    }
    var CSInterface = function () { this.platFormInfo = null; };
    var SystemPath = { USER_DATA: "userData", COMMON_FILES: "commonFiles", MY_DOCUMENTS: "myDocuments", APPLICATION: "application", EXTENSION: "extension", HOST_APPLICATION: "hostApplication" };
    window.SystemPath = SystemPath;
    CSInterface.prototype.getExtensionID = function () { var cep = getCep(); return cep ? cep.getExtensionId() : ""; };
    CSInterface.prototype.evalScript = function (script, callback) {
        if (callback === null || callback === undefined) callback = function () {};
        var cep = getCep();
        if (cep && typeof cep.evalScript === "function") {
            cep.evalScript(script, callback);
        } else {
            callback("EvalScript error: No CEP environment");
        }
    };
    CSInterface.prototype.getHostEnvironment = function () {
        var cep = getCep();
        if (cep && typeof cep.getHostEnvironment === "function") {
            try {
                return JSON.parse(cep.getHostEnvironment());
            } catch (e) {
                return null;
            }
        }
        return null;
    };
    CSInterface.prototype.getSystemPath = function (pathType) { var cep = getCep(); return cep ? cep.getSystemPath(pathType) : ""; };
    CSInterface.prototype.addEventListener = function (type, listener, obj) { var cep = getCep(); if (cep) cep.addEventListener(type, listener, obj); };
    CSInterface.prototype.removeEventListener = function (type, listener, obj) { var cep = getCep(); if (cep) cep.removeEventListener(type, listener, obj); };
    CSInterface.prototype.dispatchEvent = function (event) { var cep = getCep(); if (cep) cep.dispatchEvent(event); };
    CSInterface.prototype.closeExtension = function () { var cep = getCep(); if (cep) cep.closeExtension(); };
    window.CSInterface = CSInterface;
}());
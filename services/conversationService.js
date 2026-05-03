/**
 * conversationService.js — Backward-compatible shim
 *
 * This file now delegates to the modular conversation engine under:
 *   services/conversation/
 *
 * Do NOT add logic here. All changes go into the appropriate sub-module.
 */
module.exports = require("./conversation/index");

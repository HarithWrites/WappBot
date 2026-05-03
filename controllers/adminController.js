/**
 * adminController.js — Backward-compatible shim
 *
 * This file now delegates to the modular admin controllers under:
 *   controllers/admin/
 *
 * Do NOT add logic here. All changes go into the appropriate sub-controller.
 */
module.exports = require("./admin/index");

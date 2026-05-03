"use strict";
/**
 * controllers/admin/index.js — Public API aggregator
 *
 * Re-exports all admin controller functions from sub-modules.
 * Any require('../controllers/adminController') continues to work via the shim.
 *
 * Sub-modules:
 *   helpers.js            — Shared tenant ID resolution
 *   portalController.js   — Portal data, bookings list, SSE stream
 *   bookingController.js  — Approve/reject/waiting/close + broadcast
 *   analyticsController.js— Analytics KPIs, message history, users
 *   settingsController.js — Tenant settings, services, providers
 *   workflowController.js — Workflow step/option CRUD
 */

module.exports = {
    ...require("./portalController"),
    ...require("./bookingController"),
    ...require("./analyticsController"),
    ...require("./settingsController"),
    ...require("./workflowController")
};

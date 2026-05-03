"use strict";
/**
 * portalController.js
 * Handles portal data, booking list retrieval, and real-time SSE booking stream.
 */

const { bookingEvents, getAllBookings, getSlotCapacity } = require("../../services/bookingService");
const { getAllTenants, getTenantById }                   = require("../../services/tenantService");
const { getServices }                                    = require("../../services/serviceService");
const { getProvidersByTenant }                           = require("../../services/providerService");
const { getTargetTenantId }                              = require("./helpers");

/**
 * Builds the portal record for a single tenant (services + providers joined).
 * @param {Object} tenant - Tenant row from the database
 * @returns {Promise<Object>} Portal-ready tenant record
 */
async function loadTenantPortalRecord(tenant) {
    const [services, providers] = await Promise.all([
        getServices(tenant.id),
        getProvidersByTenant(tenant.id)
    ]);
    return {
        id:                        tenant.id,
        business_name:             tenant.business_name || `Tenant ${tenant.id}`,
        timezone:                  tenant.timezone || "UTC",
        max_parallel_appointments: getSlotCapacity(tenant),
        phone_number_id:           tenant.phone_number_id || "",
        services,
        providers
    };
}

/**
 * GET /admin/portal-data
 * Returns tenant list and their service/provider configuration.
 */
exports.getPortalData = async (req, res) => {
    try {
        const tenants = req.adminScope === "global" ? await getAllTenants() : [req.tenant];
        const records = await Promise.all(tenants.map(loadTenantPortalRecord));
        return res.json({ scope: req.adminScope, tenants: records });
    } catch (err) {
        console.error("getPortalData error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * GET /admin/bookings
 * Returns a paginated, filterable list of bookings for the current scope.
 */
exports.getBookings = async (req, res) => {
    try {
        const targetTenantId = getTargetTenantId(req);
        const { date, time, range, status, search, page, pageSize } = req.query;
        const result = await getAllBookings(req.adminScope === "global" ? null : req.tenant.id, {
            tenantId: req.adminScope === "global" ? targetTenantId : undefined,
            date, time, range, status, search, page, pageSize
        });
        return res.json({ items: result.rows, total: result.total, page: result.page, pageSize: result.pageSize });
    } catch (err) {
        console.error("getBookings error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * GET /admin/bookings/stream
 * Opens a Server-Sent Events stream that pushes booking change events in real time.
 * Heartbeat is sent every 15 seconds to keep the connection alive.
 */
exports.streamBookings = async (req, res) => {
    const targetTenantId = getTargetTenantId(req);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    /** Writes a JSON event to the SSE stream. */
    const sendEvent = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

    sendEvent({ type: "connected", scope: req.adminScope, tenant_id: targetTenantId || null });

    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15000);

    const listener = (event) => {
        if (targetTenantId && String(event.tenant_id) !== String(targetTenantId)) return;
        sendEvent({ type: event.type, bookingId: event.bookingId, tenant_id: event.tenant_id });
    };

    bookingEvents.on("changed", listener);

    req.on("close", () => {
        clearInterval(heartbeat);
        bookingEvents.off("changed", listener);
        res.end();
    });
};

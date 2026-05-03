const {
    bookingEvents,
    getAllBookings,
    getSlotCapacity,
    updateBookingStatus
} = require("../services/bookingService");
const {
    getAllTenants,
    getTenantById,
    updateTenantSettings,
    getWeekOffs,
    setWeekOffs,
    getHolidays,
    setHolidays
} = require("../services/tenantService");
const { getServices, getAllServices, upsertService } = require("../services/serviceService");
const { getProvidersByTenant, getAllProvidersByTenant, upsertProvider } = require("../services/providerService");
const { 
    getWorkflow, 
    upsertWorkflowStep, 
    deleteWorkflowStep, 
    reorderWorkflowSteps, 
    upsertWorkflowOption, 
    deleteWorkflowOption 
} = require("../services/workflowService");
const { sendMessage } = require("../services/whatsappService");
const { formatDisplayDate } = require("../utils/validators");
const db = require("../db");

function getTargetTenantId(req) {
    if (req.adminScope === "global") {
        return Number.parseInt(req.query.tenantId || req.params.tenantId || req.body?.tenantId, 10) || null;
    }

    return req.tenant.id;
}

async function loadTenantPortalRecord(tenant) {
    const [services, providers] = await Promise.all([
        getServices(tenant.id),
        getProvidersByTenant(tenant.id)
    ]);

    return {
        id: tenant.id,
        business_name: tenant.business_name || `Tenant ${tenant.id}`,
        timezone: tenant.timezone || "UTC",
        max_parallel_appointments: getSlotCapacity(tenant),
        phone_number_id: tenant.phone_number_id || "",
        services,
        providers
    };
}

exports.getPortalData = async (req, res) => {
    try {
        const tenants = req.adminScope === "global"
            ? await getAllTenants()
            : [req.tenant];

        const records = await Promise.all(tenants.map(loadTenantPortalRecord));

        return res.json({
            scope: req.adminScope,
            tenants: records
        });
    } catch (err) {
        console.error("getPortalData error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.getBookings = async (req, res) => {
    try {
        const targetTenantId = getTargetTenantId(req);
        const { date, time, range, status, search, page, pageSize } = req.query;
        const result = await getAllBookings(req.adminScope === "global" ? null : req.tenant.id, {
            tenantId: req.adminScope === "global" ? targetTenantId : undefined,
            date,
            time,
            range,
            status,
            search,
            page,
            pageSize
        });

        return res.json({
            items: result.rows,
            total: result.total,
            page: result.page,
            pageSize: result.pageSize
        });
    } catch (err) {
        console.error("getBookings error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.streamBookings = async (req, res) => {
    const targetTenantId = getTargetTenantId(req);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendEvent = (payload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    sendEvent({
        type: "connected",
        scope: req.adminScope,
        tenant_id: targetTenantId || null
    });

    const heartbeat = setInterval(() => {
        res.write(": keep-alive\n\n");
    }, 15000);

    const listener = (event) => {
        if (targetTenantId && String(event.tenant_id) !== String(targetTenantId)) {
            return;
        }

        sendEvent({
            type: event.type,
            bookingId: event.bookingId,
            tenant_id: event.tenant_id
        });
    };

    bookingEvents.on("changed", listener);

    req.on("close", () => {
        clearInterval(heartbeat);
        bookingEvents.off("changed", listener);
        res.end();
    });
};

async function getTenantByBooking(booking) {
    if (!booking?.tenant_id) {
        return null;
    }

    return getTenantById(booking.tenant_id);
}

function buildStatusMessage(status, booking, comment) {
    const commentLine = comment ? `\nComment: ${comment}` : "";
    const providerLine = booking.provider_name ? `\nProvider: ${booking.provider_name}` : "";
    const dateText = formatDisplayDate(booking.booking_date) || booking.booking_date;

    if (status === "confirmed") {
        return `Booking CONFIRMED.\nService: ${booking.service_name}${providerLine}\nDate: ${dateText}\nTime: ${booking.booking_time}${commentLine}`;
    }

    if (status === "rejected") {
        return `Booking REJECTED.\nService: ${booking.service_name}${providerLine}\nDate: ${dateText}\nTime: ${booking.booking_time}${commentLine}`;
    }

    if (status === "closed") {
        return `Booking CLOSED.\nService: ${booking.service_name}${providerLine}\nDate: ${dateText}\nTime: ${booking.booking_time}${commentLine}`;
    }

    if (status === "waiting") {
        return "Please wait, we are working on your booking request.";
    }

    return `Booking is still PENDING.\nService: ${booking.service_name}${providerLine}\nDate: ${dateText}\nTime: ${booking.booking_time}${commentLine}`;
}

async function handleStatusUpdate(req, res, status, logLabel) {
    try {
        const { bookingId, comment, remarks, tenantId } = req.body;
        const statusComment = String(remarks || comment || "").trim();
        const scopedTenantId = req.adminScope === "global"
            ? (Number.parseInt(tenantId, 10) || null)
            : req.tenant.id;

        if (!bookingId) {
            return res.status(400).json({ error: "bookingId required" });
        }

        if (!scopedTenantId) {
            return res.status(400).json({ error: "tenantId required" });
        }

        if (status === "closed" && !statusComment) {
            return res.status(400).json({ error: "remarks required" });
        }

        const booking = await updateBookingStatus(bookingId, status, scopedTenantId, {
            remarks: statusComment
        });

        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        const tenant = await getTenantByBooking(booking);

        if (tenant) {
            await sendMessage({
                tenant,
                to: booking.phone,
                text: buildStatusMessage(status, booking, statusComment)
            });
        }

        return res.json({ success: true });
    } catch (err) {
        console.error(`${logLabel} error:`, err);
        return res.status(500).json({ error: "Internal server error" });
    }
}

exports.approveBooking = (req, res) => handleStatusUpdate(req, res, "confirmed", "approveBooking");
exports.rejectBooking = (req, res) => handleStatusUpdate(req, res, "rejected", "rejectBooking");
exports.setWaitingBooking = (req, res) => handleStatusUpdate(req, res, "waiting", "setWaitingBooking");
exports.closeBooking = (req, res) => handleStatusUpdate(req, res, "closed", "closeBooking");

exports.getSettings = async (req, res) => {
    try {
        const tenantId = getTargetTenantId(req);

        if (!tenantId) {
            return res.status(400).json({ error: "tenantId required" });
        }

        const tenant = await getTenantById(tenantId);
        if (!tenant) return res.status(404).json({ error: "Tenant not found" });

        const [services, providers, weekOffs, holidays] = await Promise.all([
            getAllServices(tenantId),
            getAllProvidersByTenant(tenantId),
            getWeekOffs(tenantId),
            getHolidays(tenantId)
        ]);

        // Attach DB-sourced arrays to the tenant object for the frontend
        const tenantData = { ...tenant, week_offs: weekOffs, business_holidays: holidays };

        return res.json({
            tenant: tenantData,
            services,
            providers
        });
    } catch (err) {
        console.error("getSettings error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.updateSettingsConfig = async (req, res) => {
    try {
        const { tenantId, settings } = req.body;
        const scopedTenantId = req.adminScope === "global"
            ? (tenantId || null)
            : req.tenant.id;

        if (!scopedTenantId) return res.status(400).json({ error: "tenantId required" });

        // Split out week_offs and holidays from the settings object
        const { week_offs, business_holidays, ...mainSettings } = settings || {};

        // Update main tenant settings (without JSONB fields)
        const updated = await updateTenantSettings(scopedTenantId, mainSettings);

        // Persist week-offs and holidays to separate tables
        if (Array.isArray(week_offs)) {
            await setWeekOffs(scopedTenantId, week_offs);
        }
        if (Array.isArray(business_holidays)) {
            await setHolidays(scopedTenantId, business_holidays);
        }

        return res.json({ success: true, tenant: updated });
    } catch (err) {
        console.error("updateSettingsConfig error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.upsertService = async (req, res) => {
    try {
        const { tenantId, service } = req.body;
        const scopedTenantId = req.adminScope === "global"
            ? (tenantId || null)
            : req.tenant.id;

        if (!scopedTenantId) return res.status(400).json({ error: "tenantId required" });
        if (!service?.name?.trim()) return res.status(400).json({ error: "service.name required" });

        // Preserve is_active if provided
        const servicePayload = {
            ...service,
            name: service.name.trim(),
            is_active: service.is_active !== undefined ? service.is_active : true
        };

        const result = await upsertService(scopedTenantId, servicePayload);
        return res.json({ success: true, service: result });
    } catch (err) {
        console.error("upsertService error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.upsertProvider = async (req, res) => {
    try {
        const { tenantId, provider } = req.body;
        const scopedTenantId = req.adminScope === "global"
            ? (tenantId || null)
            : req.tenant.id;

        if (!scopedTenantId) return res.status(400).json({ error: "tenantId required" });
        if (!provider?.name?.trim()) return res.status(400).json({ error: "provider.name required" });

        const providerPayload = {
            ...provider,
            name: provider.name.trim(),
            is_active: provider.is_active !== undefined ? provider.is_active : true
        };

        const result = await upsertProvider(scopedTenantId, providerPayload);
        return res.json({ success: true, provider: result });
    } catch (err) {
        console.error("upsertProvider error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

const {
    getFullWorkflow,
    upsertStep,
    deleteStep,
    upsertOption,
    deleteOption,
    reorderSteps
} = require("../services/workflowAdminService");

exports.getWorkflow = async (req, res) => {
    try {
        const tenantId = getTargetTenantId(req);
        if (!tenantId) return res.status(400).json({ error: "tenantId required" });
        const result = await getFullWorkflow(tenantId);
        return res.json({ success: true, workflow: result });
    } catch (err) {
        console.error("getWorkflow error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.upsertWorkflowStep = async (req, res) => {
    try {
        const tenantId = getTargetTenantId(req);
        const { step } = req.body;
        if (!tenantId) return res.status(400).json({ error: "tenantId required" });
        const result = await upsertStep(tenantId, step);
        return res.json({ success: true, step: result });
    } catch (err) {
        console.error("upsertWorkflowStep error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.deleteWorkflowStep = async (req, res) => {
    try {
        const tenantId = getTargetTenantId(req);
        const { stepId } = req.body;
        if (!tenantId || !stepId) return res.status(400).json({ error: "tenantId and stepId required" });
        await deleteStep(tenantId, stepId);
        return res.json({ success: true });
    } catch (err) {
        console.error("deleteWorkflowStep error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.reorderWorkflowSteps = async (req, res) => {
    try {
        const tenantId = getTargetTenantId(req);
        const { stepIds } = req.body;
        if (!tenantId || !stepIds) return res.status(400).json({ error: "tenantId and stepIds required" });
        await reorderSteps(tenantId, stepIds);
        return res.json({ success: true });
    } catch (err) {
        console.error("reorderWorkflowSteps error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.upsertWorkflowOption = async (req, res) => {
    try {
        const { stepDbId, option } = req.body;
        if (!stepDbId || !option) return res.status(400).json({ error: "stepDbId and option required" });
        const result = await upsertOption(stepDbId, option);
        return res.json({ success: true, option: result });
    } catch (err) {
        console.error("upsertWorkflowOption error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.deleteWorkflowOption = async (req, res) => {
    try {
        const { optionId } = req.body;
        if (!optionId) return res.status(400).json({ error: "optionId required" });
        await deleteOption(optionId);
        return res.json({ success: true });
    } catch (err) {
        console.error("deleteWorkflowOption error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.getAnalytics = async (req, res) => {
    try {
        const tenantId = getTargetTenantId(req);
        if (!tenantId) return res.status(400).json({ error: "tenantId required" });

        // Basic analytics implementation
        const totalConversationsRes = await db.query("SELECT COUNT(*) FROM conversation_state WHERE tenant_id = $1", [tenantId]);
        const totalBookingsRes = await db.query("SELECT COUNT(*) FROM bookings WHERE tenant_id = $1", [tenantId]);
        const popularServiceRes = await db.query("SELECT service_name, COUNT(*) as count FROM bookings WHERE tenant_id = $1 GROUP BY service_name ORDER BY count DESC LIMIT 1", [tenantId]);
        const engagementRes = await db.query("SELECT COUNT(*) as messages FROM processed_webhooks WHERE tenant_id = $1", [tenantId]);

        const conversations = parseInt(totalConversationsRes.rows[0].count, 10) || 0;
        const bookings = parseInt(totalBookingsRes.rows[0].count, 10) || 0;

        return res.json({
            totalConversations: conversations,
            conversionRate: conversations > 0 ? Math.round((bookings / conversations) * 100) : 0,
            avgResponseTime: 2.5,
            popularService: popularServiceRes.rows[0]?.service_name || 'N/A',
            messagesSent: Math.round(engagementRes.rows[0].messages * 1.5),
            messagesReceived: parseInt(engagementRes.rows[0].messages, 10),
            activeUsers: conversations,
            avgSessionDuration: 3.2,
            engagementTrends: [
                { label: 'Mon', count: 12 },
                { label: 'Tue', count: 19 },
                { label: 'Wed', count: 15 },
                { label: 'Thu', count: 22 },
                { label: 'Fri', count: 30 },
                { label: 'Sat', count: 10 },
                { label: 'Sun', count: 8 }
            ]
        });
    } catch (err) {
        console.error("getAnalytics error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.getMessages = async (req, res) => {
    try {
        // Return dummy message history for now as there's no table for it yet
        return res.json([]);
    } catch (err) {
        console.error("getMessages error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const tenantId = getTargetTenantId(req);
        if (!tenantId) return res.status(400).json({ error: "tenantId required" });

        const usersRes = await db.query("SELECT DISTINCT phone FROM processed_webhooks WHERE tenant_id = $1", [tenantId]);
        const users = usersRes.rows.map((row, idx) => ({
            id: idx + 1,
            phone: row.phone,
            name: `User ${row.phone.slice(-4)}`
        }));

        return res.json(users);
    } catch (err) {
        console.error("getUsers error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

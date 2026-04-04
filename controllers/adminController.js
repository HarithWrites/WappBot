const {
    bookingEvents,
    getAllBookings,
    getSlotCapacity,
    updateBookingStatus
} = require("../services/bookingService");
const {
    getAllTenants,
    getTenantById
} = require("../services/tenantService");
const { getServices } = require("../services/serviceService");
const { getProvidersByTenant } = require("../services/providerService");
const { sendMessage } = require("../services/whatsappService");
const { formatDisplayDate } = require("../utils/validators");

function getTargetTenantId(req) {
    if (req.adminScope === "global") {
        return Number.parseInt(req.query.tenantId || req.body?.tenantId, 10) || null;
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

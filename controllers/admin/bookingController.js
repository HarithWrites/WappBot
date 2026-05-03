"use strict";
/**
 * bookingController.js
 * Handles booking status updates (approve / reject / waiting / close) and broadcast messaging.
 */

const { updateBookingStatus }       = require("../../services/bookingService");
const { getTenantById }             = require("../../services/tenantService");
const { sendMessage }               = require("../../services/whatsappService");
const { formatDisplayDate }         = require("../../utils/validators");
const { getTargetTenantId, getScopedTenantId } = require("./helpers");
const db                            = require("../../db");

/**
 * Builds the WhatsApp notification message sent to a customer when their booking status changes.
 * @param {string} status  - New booking status: "confirmed" | "rejected" | "closed" | "waiting"
 * @param {Object} booking - Booking row from the database
 * @param {string} comment - Optional admin comment/note
 * @returns {string} Formatted WhatsApp message body
 */
function buildStatusMessage(status, booking, comment) {
    const commentLine  = comment ? `\n\n💬 *Note from us:* ${comment}` : "";
    const providerLine = booking.provider_name ? `\n👤 *With:* ${booking.provider_name}` : "";
    const nameGreet    = booking.customer_name ? `Hi *${booking.customer_name}*! ` : "";
    const dateText     = formatDisplayDate(booking.booking_date) || booking.booking_date;

    if (status === "confirmed") {
        return `🎉 *Great news, ${nameGreet.trim() || "there"}!* Your booking is *confirmed*. ✨\n\n💼 *Service:* ${booking.service_name}${providerLine}\n📅 *Date:* ${dateText}\n🕐 *Time:* ${booking.booking_time}${commentLine}\n\nWe look forward to seeing you! If you need to make changes, just reply *Hi*.`;
    }
    if (status === "rejected") {
        return `😔 ${nameGreet}We're sorry, but we're unable to confirm your booking at this time.\n\n💼 *Service:* ${booking.service_name}\n📅 *Date:* ${dateText}${commentLine}\n\nPlease reply *Hi* to make a new booking, or contact us directly. We apologise for the inconvenience.`;
    }
    if (status === "closed") {
        return `📁 *Your appointment has been completed and archived.*\n\n💼 *Service:* ${booking.service_name}${providerLine}\n📅 *Date:* ${dateText}${commentLine}\n\nThank you for choosing us! 😊 Reply *Hi* to book again anytime.`;
    }
    if (status === "waiting") {
        return `⏳ *${nameGreet.trim() || "Your booking"}* is on our waitlist!\n\nWe're checking availability and will confirm your slot shortly. We appreciate your patience! 🙏\n\nWe'll be in touch soon.`;
    }
    return `📄 *Booking Update*\n\nYour booking for *${booking.service_name}* on *${dateText}* is still *pending*.${commentLine}\n\nWe'll notify you as soon as it's confirmed.`;
}

/**
 * Core handler for all booking status update actions.
 * Validates input, updates DB, then sends a WhatsApp notification to the customer.
 * @param {Object} req     - Express request
 * @param {Object} res     - Express response
 * @param {string} status  - Target booking status
 * @param {string} logLabel- Label used in error logs
 */
async function handleStatusUpdate(req, res, status, logLabel) {
    try {
        const { bookingId, comment, remarks, tenantId } = req.body;
        const statusComment = String(remarks || comment || "").trim();
        const scopedTenantId = getScopedTenantId(req, tenantId);

        if (!bookingId)      return res.status(400).json({ error: "bookingId required" });
        if (!scopedTenantId) return res.status(400).json({ error: "tenantId required" });
        if (status === "closed" && !statusComment) return res.status(400).json({ error: "remarks required" });

        const booking = await updateBookingStatus(bookingId, status, scopedTenantId, { remarks: statusComment });
        if (!booking) return res.status(404).json({ error: "Booking not found" });

        const tenant = booking?.tenant_id ? await getTenantById(booking.tenant_id) : null;
        if (tenant) {
            await sendMessage({ tenant, to: booking.phone, text: buildStatusMessage(status, booking, statusComment) });
        }

        return res.json({ success: true });
    } catch (err) {
        console.error(`${logLabel} error:`, err);
        return res.status(500).json({ error: "Internal server error" });
    }
}

/** POST /admin/approve — Confirms a booking and notifies the customer. */
exports.approveBooking    = (req, res) => handleStatusUpdate(req, res, "confirmed", "approveBooking");
/** POST /admin/reject  — Rejects a booking and notifies the customer. */
exports.rejectBooking     = (req, res) => handleStatusUpdate(req, res, "rejected",  "rejectBooking");
/** POST /admin/waiting — Moves a booking to waitlist and notifies the customer. */
exports.setWaitingBooking = (req, res) => handleStatusUpdate(req, res, "waiting",   "setWaitingBooking");
/** POST /admin/close   — Closes/archives a booking and notifies the customer. */
exports.closeBooking      = (req, res) => handleStatusUpdate(req, res, "closed",    "closeBooking");

/**
 * POST /admin/broadcast
 * Sends a WhatsApp message to all contacts (or one targeted phone) for a tenant.
 * Enforces a 200ms delay between sends to respect Meta's API rate limits.
 */
exports.broadcast = async (req, res) => {
    try {
        const { tenantId, message, targetPhone } = req.body;
        const scopedTenantId = getScopedTenantId(req, tenantId);

        if (!scopedTenantId)                return res.status(400).json({ error: "tenantId required" });
        if (!message || !String(message).trim()) return res.status(400).json({ error: "message is required" });

        const tenant = await getTenantById(scopedTenantId);
        if (!tenant) return res.status(404).json({ error: "Tenant not found" });

        // Resolve recipients: single phone or all known contacts
        let recipients = targetPhone
            ? [{ phone: String(targetPhone).trim() }]
            : (await db.query(`SELECT DISTINCT phone FROM conversation_state WHERE tenant_id = $1 AND phone IS NOT NULL`, [scopedTenantId])).rows;

        if (!recipients.length) return res.json({ success: true, sent: 0, message: "No recipients found" });

        let sent = 0, failed = 0;
        const errors = [];

        for (const recipient of recipients) {
            try {
                await sendMessage({ tenant, to: recipient.phone, text: String(message).trim() });
                sent++;
                // 200ms delay between messages to avoid Meta rate-limit errors
                await new Promise(r => setTimeout(r, 200));
            } catch (err) {
                failed++;
                errors.push({ phone: recipient.phone, error: err.message });
            }
        }

        return res.json({ success: true, sent, failed, total: recipients.length, errors: errors.slice(0, 10) });
    } catch (err) {
        console.error("broadcast error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

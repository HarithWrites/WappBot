"use strict";
const { sendMessage } = require("../whatsappService");
const { createBooking, SlotAlreadyBookedError } = require("../bookingService");
const { buildTimeSlots } = require("./timeSlots");
const { startWorkflow, promptStep } = require("./workflowEngine");
const { resetWorkflowState } = require("./workflowEngine");
const { formatDisplayDate } = require("../../utils/validators");

/**
 * Completes a booking after all required context (service, date, time) is collected.
 * Sends a "booking received / pending" WhatsApp message to the customer.
 * If the time slot was just taken, re-prompts for a new time automatically.
 *
 * @param {Object} params
 * @param {Object} params.tenant - Tenant configuration
 * @param {string} params.phone - Customer's WhatsApp number
 * @param {number} params.tenantId - Tenant's DB ID
 * @param {Object} params.workflow - Full workflow definition
 * @param {Object} params.context - Booking context with service_name, date, time, etc.
 */
async function completeBooking({ tenant, phone, tenantId, workflow, context }) {
    // Validate that all required booking fields are present
    if (!context.service_name || !context.date || !context.time) {
        await sendMessage({
            tenant, to: phone,
            text: "😅 Something went wrong completing your booking. Let's start fresh — reply *Hi* to try again."
        });
        return startWorkflow({ tenant, phone, tenantId, workflow });
    }

    let booking;

    try {
        booking = await createBooking({
            tenant,
            tenant_id:        tenantId,
            phone,
            service_name:     context.service_name,
            booking_date:     context.date,
            booking_time:     context.time,
            workflow_answers: context.custom_answers || {},
            provider_id:      context.provider_id   || null,
            provider_name:    context.provider_name || null,
            customer_name:    context.customer_name || null
        });
    } catch (err) {
        if (err instanceof SlotAlreadyBookedError) {
            // Slot was taken during the session — gracefully re-prompt for a new time
            await sendMessage({
                tenant, to: phone,
                text: "⚠️ That time slot was just taken — sorry about that!\n\nLet's pick another time for you 👇"
            });

            const periodStep = workflow.steps.find((item) => item.kind === "time_period");
            return promptStep({
                tenant, phone, tenantId, workflow,
                stepId: periodStep?.id || workflow.start_step,
                context: { ...context, time: null }
            });
        }
        throw err; // Re-throw unexpected errors
    }

    // ✅ Booking created — status is PENDING until business owner approves in dashboard
    const timeSlotTitle = buildTimeSlots(tenant).find((slot) => slot.dbValue === booking.booking_time)?.title || booking.booking_time;
    const dateDisplay   = formatDisplayDate(booking.booking_date) || booking.booking_date;
    const providerLine  = booking.provider_name ? `\n👤 *With:* ${booking.provider_name}` : "";
    const nameLine      = booking.customer_name ? `\n\nThank you, *${booking.customer_name}*! ` : "\n\n";

    await sendMessage({
        tenant,
        to: phone,
        text: `📩 *Booking Request Received!*${nameLine}We've got your request and it's pending confirmation from the team.\n\n📋 *Ref:* #${booking.id}\n💼 *Service:* ${booking.service_name}${providerLine}\n📅 *Date:* ${dateDisplay}\n🕐 *Time:* ${timeSlotTitle}\n\n⏳ You'll receive a confirmation message shortly. Reply *Hi* anytime to start a new booking.`
    });

    // Reset workflow so customer can make a new booking
    await resetWorkflowState({ phone, tenantId, workflow, tenant, sendPrompt: false });
}

module.exports = { completeBooking };

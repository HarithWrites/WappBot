"use strict";
const { sendButtonsMessage, sendListMessage } = require("../whatsappService");
const { getSlotCapacity } = require("../bookingService");
const { format12Hour, buildTimeSlots } = require("./timeSlots");
const { getCurrentWeekRange } = require("./dateOptions");
const { formatDisplayDate } = require("../../utils/validators");

/**
 * Replaces {{token}} placeholders in a message template with real values.
 * Unknown tokens are replaced with empty strings.
 * @param {string} template - Template string with {{token}} placeholders
 * @param {string} fallback - Fallback text if template is empty
 * @param {Object} values - Map of token names to replacement values
 * @returns {string} Resolved message string
 */
function buildPromptText(template, fallback, values) {
    const rawTemplate = String(template || fallback || "").trim();
    return rawTemplate.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, token) => {
        const value = values[token];
        return value == null ? "" : String(value);
    });
}

/**
 * Builds the full template value map for a given tenant + booking context.
 * Used by buildPromptText to resolve {{token}} placeholders.
 * @param {Object} params
 * @param {Object} params.tenant - Tenant configuration object
 * @param {Object} params.context - Current booking context (service, date, time, etc.)
 * @returns {Object} Key-value map for all supported template tokens
 */
function getTemplateValues({ tenant, context }) {
    const timeSlot = context.time
        ? buildTimeSlots(tenant).find((slot) => slot.dbValue === context.time)
        : null;
    const week = context.date ? getCurrentWeekRange(tenant?.timezone) : null;
    const bookingDate = context.date ? new Date(`${context.date}T00:00:00`) : null;
    const isThisWeek = week && bookingDate && bookingDate >= week.start && bookingDate <= week.end;
    const capacity = getSlotCapacity(tenant);
    const openingHour = tenant?.opening_hour || 9;
    const closingHour = tenant?.closing_hour || 21;

    const templateValues = {
        welcome_message:  tenant?.welcome_message || "Choose an option to continue.",
        service_name:     context.service_name || "",
        service_id:       context.service_id || "",
        date:             context.date || "",
        time:             context.time || "",
        provider:         context.provider_name || "",
        provider_name:    context.provider_name || "",
        provider_id:      context.provider_id || "",
        display_date:     context.date ? formatDisplayDate(context.date) : "",
        display_time:     timeSlot ? timeSlot.title : (context.time || ""),
        period_title:     context.period_title || "",
        slot_duration:    tenant?.slot_duration || 30,
        opening_hours:    `${format12Hour(openingHour, 0)} to ${format12Hour(closingHour, 0)}`,
        capacity_note:    capacity > 1 ? ` Parallel appointments allowed: ${capacity}.` : "",
        week_note:        isThisWeek ? "\nThis booking is in this week." : ""
    };

    // Merge custom workflow answers into template values
    const customAnswers = context.custom_answers || {};
    Object.entries(customAnswers).forEach(([key, answer]) => {
        if (answer && typeof answer === "object" && !Array.isArray(answer)) {
            templateValues[key]            = answer.title || answer.text || answer.value || "";
            templateValues[`${key}_text`]  = answer.title || answer.text || "";
            templateValues[`${key}_value`] = answer.value || "";
            templateValues[`${key}_id`]    = answer.option_id || "";
            return;
        }
        templateValues[key] = answer == null ? "" : String(answer);
    });

    return templateValues;
}

/**
 * Builds the header/body/footer question text for a workflow step.
 * @param {Object} step - Workflow step with question.header / question.body / question.footer
 * @param {Object} tenant - Tenant config for template resolution
 * @param {Object} context - Current booking context
 * @returns {{ header: string, body: string, footer: string }}
 */
function buildQuestion(step, tenant, context) {
    const values = getTemplateValues({ tenant, context });
    return {
        header: buildPromptText(step.question?.header, "", values),
        body:   buildPromptText(step.question?.body || step.question_body, "Welcome! Please choose an option:", values),
        footer: buildPromptText(step.question?.footer, "", values)
    };
}

/**
 * Constructs a stable interactive message ID by combining step ID and option ID.
 * This is what gets sent as the button/list payload that WhatsApp echoes back.
 * @param {string} stepId - Workflow step ID
 * @param {string} optionId - Option/slot/service ID within that step
 * @returns {string} Composite ID string e.g. "step_service__1"
 */
function buildInteractiveId(stepId, optionId) {
    return `${stepId}__${optionId}`;
}

/**
 * Decides whether to use buttons (≤3 items) or a scrollable list (>3 items).
 * Respects explicit step.answer_mode if set.
 * @param {Object} step - Workflow step with optional answer_mode
 * @param {Array} items - Items to display
 * @returns {"buttons"|"list"} Display mode
 */
function chooseAnswerMode(step, items) {
    const explicitMode = step.answer_mode || "auto";
    if (explicitMode === "buttons" || explicitMode === "list") {
        return explicitMode === "buttons" && items.length > 3 ? "list" : explicitMode;
    }
    return items.length <= 3 ? "buttons" : "list";
}

/**
 * Sends an interactive WhatsApp message (buttons or list) based on item count.
 * @param {Object} params
 * @param {Object} params.tenant - Tenant with access token and phone number ID
 * @param {string} params.phone - Recipient's phone number
 * @param {Object} params.step - Workflow step (for mode and text overrides)
 * @param {Object} params.question - Resolved header/body/footer
 * @param {Array}  params.items - Option items to display
 * @param {string} [params.listTitle] - Section title for list messages
 * @param {string} [params.buttonText] - Button label for list messages
 */
async function sendInteractiveStep({ tenant, phone, step, question, items, listTitle, buttonText }) {
    const answerMode = chooseAnswerMode(step, items);

    if (answerMode === "buttons") {
        return sendButtonsMessage({
            tenant,
            to: phone,
            header: question.header,
            body:   question.body,
            footer: question.footer,
            buttons: items.map((item) => ({
                id:    item.id,
                title: item.title.slice(0, 20)
            }))
        });
    }

    return sendListMessage({
        tenant,
        to: phone,
        header:     question.header,
        body:       question.body,
        footer:     question.footer,
        buttonText: (buttonText || step.button_text || "View options").slice(0, 20),
        sections: [{
            title: (listTitle || step.list_title || "Available options").slice(0, 24),
            rows:  items.map((item) => ({
                id:          item.id,
                title:       item.title.slice(0, 24),
                description: (item.description || "Tap to select").slice(0, 72)
            }))
        }]
    });
}

module.exports = {
    buildPromptText,
    getTemplateValues,
    buildQuestion,
    buildInteractiveId,
    chooseAnswerMode,
    sendInteractiveStep
};

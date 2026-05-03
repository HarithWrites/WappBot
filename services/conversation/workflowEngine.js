"use strict";
const { sendMessage } = require("../whatsappService");
const { getServices } = require("../serviceService");
const { getProvidersByTenantAndService } = require("../providerService");
const { getAvailableTimeSlots, groupSlotsIntoPeriods, buildTimeSlots } = require("./timeSlots");
const { getRelativeDateOptions } = require("./dateOptions");
const { buildQuestion, buildInteractiveId, sendInteractiveStep } = require("./messageTemplates");
const { setState } = require("./stateManager");
const { parseDate } = require("../../utils/validators");

/**
 * Finds a workflow step by its ID within a workflow definition.
 * @param {Object} workflow - Full workflow definition with a steps array
 * @param {string} stepId - The step ID to find
 * @returns {Object|null} The matching step or null if not found
 */
function getStepById(workflow, stepId) {
    return workflow.steps.find((step) => step.id === stepId) || null;
}

/**
 * Starts the workflow from the beginning for a given customer.
 * Resets state and sends the first prompt.
 * @param {Object} params
 * @param {Object} params.tenant - Tenant configuration
 * @param {string} params.phone - Customer's WhatsApp number
 * @param {number} params.tenantId - Tenant's DB ID
 * @param {Object} params.workflow - Full workflow definition
 */
async function startWorkflow({ tenant, phone, tenantId, workflow }) {
    return resetWorkflowState({ phone, tenantId, workflow, tenant, sendPrompt: true });
}

/**
 * Resets the workflow state in the database and optionally sends the first step's prompt.
 * @param {Object} params
 * @param {string} params.phone - Customer's WhatsApp number
 * @param {number} params.tenantId - Tenant's DB ID
 * @param {Object} params.workflow - Full workflow definition
 * @param {Object} params.tenant - Tenant configuration
 * @param {boolean} params.sendPrompt - If true, immediately send the first step's question
 */
async function resetWorkflowState({ phone, tenantId, workflow, tenant, sendPrompt }) {
    await setState(phone, tenantId, { step: workflow.start_step, context: {} });

    if (!sendPrompt) return;

    return promptStep({
        tenant, phone, tenantId, workflow,
        stepId: workflow.start_step,
        context: {}
    });
}

/**
 * Renders and sends the appropriate WhatsApp prompt for a given workflow step.
 * Handles all step kinds: service, date_choice, relative_date_list, time_period,
 * time_slot, confirmation, custom_choice, and plain message.
 *
 * @param {Object} params
 * @param {Object} params.tenant - Tenant configuration
 * @param {string} params.phone - Customer's WhatsApp number
 * @param {number} params.tenantId - Tenant's DB ID
 * @param {Object} params.workflow - Full workflow definition
 * @param {string} params.stepId - ID of the step to render
 * @param {Object} params.context - Current booking context
 */
async function promptStep({ tenant, phone, tenantId, workflow, stepId, context }) {
    const step = getStepById(workflow, stepId);

    // If step not found, restart workflow gracefully
    if (!step) return startWorkflow({ tenant, phone, tenantId, workflow });

    await setState(phone, tenantId, { step: step.id, context });

    const question = buildQuestion(step, tenant, context);

    switch (step.kind) {
        case "service": {
            const services = await getServices(tenantId);
            const activeServices = services.filter(s => s.is_active !== false);

            if (!activeServices.length) {
                return sendMessage({ tenant, to: phone, text: "🙏 We're not accepting bookings right now. Please check back soon or contact us directly." });
            }

            return sendMessage({
                tenant,
                to: phone,
                text: null,
                listPayload: {
                    body: question.body || "Please select a service:",
                    buttonText: "View Services",
                    sections: [{ title: "Our Services", rows: activeServices.map((s) => ({ id: buildInteractiveId(step.id, String(s.id)), title: s.name })) }]
                }
            }).catch(() =>
                // fallback: send as list message via whatsappService
                require("../whatsappService").sendListMessage({
                    tenant, to: phone,
                    body: question.body || "Please select a service:",
                    buttonText: "View Services",
                    sections: [{ title: "Our Services", rows: activeServices.map((s) => ({ id: buildInteractiveId(step.id, String(s.id)), title: s.name })) }]
                })
            );
        }

        case "date_choice": {
            return sendInteractiveStep({
                tenant, phone, step, question,
                items: step.options.map((option) => ({
                    id:          buildInteractiveId(step.id, option.id),
                    title:       option.title,
                    description: option.description || "Tap to select"
                }))
            });
        }

        case "service_provider": {
            const providers = await getProvidersByTenantAndService(tenantId, context.service_id);
            const activeProviders = providers.filter(p => p.is_active !== false);

            // Auto-skip provider step if no providers configured
            if (!activeProviders.length) {
                return promptStep({ tenant, phone, tenantId, workflow, stepId: step.next, context: { ...context, provider_id: null, provider_name: null } });
            }

            return require("../whatsappService").sendListMessage({
                tenant, to: phone,
                body: question.body || "Please select a provider:",
                buttonText: "Providers",
                sections: [{ title: "Available Providers", rows: activeProviders.map((p) => ({ id: buildInteractiveId(step.id, String(p.id)), title: p.name })) }]
            });
        }

        case "relative_date_list": {
            const options = getRelativeDateOptions(tenant);

            if (options.length === 0) {
                return sendMessage({ tenant, to: phone, text: "📅 There are no available dates right now.\n\nPlease check back soon or contact us directly for assistance." });
            }

            return require("../whatsappService").sendListMessage({
                tenant, to: phone,
                body: question.body || "Please select a date:",
                buttonText: "Choose Date",
                sections: [{
                    title: "Available Dates",
                    rows: [
                        ...options.map((opt) => ({ id: buildInteractiveId(step.id, opt.id), title: opt.title, description: "Tap to select this date" })),
                        { id: buildInteractiveId(step.id, "other"), title: "📅 Pick another date", description: "Type your date as DD/MM/YYYY" }
                    ]
                }]
            });
        }

        case "time_period": {
            const slots = await getAvailableTimeSlots(tenant, context.date);
            const periods = groupSlotsIntoPeriods(slots);

            if (!periods.length) {
                await sendMessage({ tenant, to: phone, text: "⚠️ No appointment times are available on that date.\n\nLet's pick a different day for you 👇" });
                const dateStep = workflow.steps.find((item) => item.kind === "date_choice" || item.kind === "relative_date_list");
                return promptStep({ tenant, phone, tenantId, workflow, stepId: dateStep?.id || workflow.start_step, context: { ...context, date: null, time: null, period_id: null, period_title: null } });
            }

            return sendInteractiveStep({
                tenant, phone, step, question,
                items: periods.map((period) => ({
                    id:          buildInteractiveId(step.id, period.id),
                    title:       period.title,
                    description: `${period.slots.length} time${period.slots.length === 1 ? "" : "s"} available`
                }))
            });
        }

        case "time_slot": {
            const slots = await getAvailableTimeSlots(tenant, context.date);
            const periods = groupSlotsIntoPeriods(slots);
            const period = periods.find((item) => item.id === context.period_id) || periods[0];

            if (!period) {
                const periodStep = workflow.steps.find((item) => item.kind === "time_period");
                return promptStep({ tenant, phone, tenantId, workflow, stepId: periodStep?.id || workflow.start_step, context });
            }

            return sendInteractiveStep({
                tenant, phone, step,
                question: buildQuestion(step, tenant, { ...context, period_title: period.title }),
                listTitle:  period.title,
                buttonText: step.button_text || "View times",
                items: period.slots.map((slot) => ({
                    id:          buildInteractiveId(step.id, slot.dbValue),
                    title:       slot.title,
                    description: `${tenant?.slot_duration || 30} min appointment`
                }))
            });
        }

        case "confirmation":
            return sendInteractiveStep({
                tenant, phone, step, question,
                items: step.options.map((option) => ({
                    id:          buildInteractiveId(step.id, option.id),
                    title:       option.title,
                    description: option.description || ""
                }))
            });

        case "custom_choice":
            return sendInteractiveStep({
                tenant, phone, step, question,
                listTitle:  step.list_title || "Options",
                buttonText: step.button_text || "View options",
                items: step.options.map((option) => ({
                    id:          buildInteractiveId(step.id, option.id),
                    title:       option.title,
                    description: option.description || ""
                }))
            });

        default:
            return sendMessage({ tenant, to: phone, text: question.body || "This step is not configured correctly. Type Hi to restart." });
    }
}

/**
 * Matches a customer's free-text or interactive reply against a step's static options.
 * Checks against: composite ID, option ID, value, and title (case-insensitive).
 * @param {Object} step - Workflow step with options array
 * @param {string} input - Normalised (lowercase, trimmed) customer input
 * @returns {Object|null} Matched option, or null if no match
 */
function matchStaticOption(step, input) {
    return step.options.find((option) => {
        const tokens = [
            buildInteractiveId(step.id, option.id),
            option.id,
            option.value,
            option.title
        ];
        return tokens.some((token) => String(token || "").trim().toLowerCase() === input);
    }) || null;
}

module.exports = { getStepById, startWorkflow, resetWorkflowState, promptStep, matchStaticOption };

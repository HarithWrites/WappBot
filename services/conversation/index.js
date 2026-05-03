"use strict";
/**
 * Conversation Service — Entry Point
 *
 * This module is the single public API for the conversation engine.
 * It orchestrates: name collection → greeting → step routing → booking completion.
 *
 * Sub-modules:
 *   stateManager.js    — DB read/write for conversation state
 *   timeSlots.js       — Time slot generation and period grouping
 *   dateOptions.js     — Available date calculation with holiday/week-off support
 *   messageTemplates.js— Template resolution and WhatsApp interactive message sending
 *   workflowEngine.js  — Step routing, promptStep, matchStaticOption
 *   bookingFlow.js     — completeBooking with slot-conflict handling
 */

const db = require("../../db");
const { sendMessage } = require("../whatsappService");
const { getServices } = require("../serviceService");
const { getProvidersByTenantAndService } = require("../providerService");
const { getWorkflowDefinition } = require("../workflowService");
const { getAvailableTimeSlots, groupSlotsIntoPeriods } = require("./timeSlots");
const { getRelativeDateOptions } = require("./dateOptions");
const { buildInteractiveId } = require("./messageTemplates");
const { getState, saveCustomerName, promptForName } = require("./stateManager");
const { getStepById, startWorkflow, promptStep, matchStaticOption, resetWorkflowState } = require("./workflowEngine");
const { completeBooking } = require("./bookingFlow");
const { parseDate } = require("../../utils/validators");

/** Greeting regex — matches common conversation starters */
const GREETING_REGEX = /^(hi|hello|hey|start|restart|book|hii|helo|hola|namaste|help)\b/;

/**
 * Processes an incoming WhatsApp message through the full conversation engine.
 * Flow: Name collection → Greeting check → Workflow step routing.
 *
 * @param {Object} params
 * @param {Object} params.tenant   - Full tenant object from the database
 * @param {string} params.phone    - Customer's WhatsApp number (E.164)
 * @param {string} params.text     - Plain text content of the message
 * @param {string} params.payload  - Interactive reply payload (button/list ID), if any
 */
async function processMessage({ tenant, phone, text, payload }) {
    const tenantId       = tenant.id;
    const workflow       = await getWorkflowDefinition(tenant);
    const normalizedText    = (text    || "").trim().toLowerCase();
    const normalizedPayload = (payload || "").trim().toLowerCase();
    const input = (normalizedPayload || normalizedText || "").trim().toLowerCase();

    // ── Step 1: Name collection ──────────────────────────────────────────────
    const existingState = await getState(phone, tenantId);

    if (!existingState?.customer_name) {
        if (existingState?.workflow_step === "__collecting_name__") {
            const rawText = (text || "").trim();
            const isGreeting = /^(hi|hello|hey|start|restart|book|hii|helo|hola|namaste|help)$/i.test(rawText);

            if (!isGreeting && rawText.length >= 2) {
                // Valid name received — save it and start the booking workflow
                await saveCustomerName(phone, tenantId, rawText);
                return startWorkflow({ tenant, phone, tenantId, workflow });
            }

            // Re-prompt for name if they sent a greeting instead
            await sendMessage({ tenant, to: phone, text: "👋 What's your name? (Just reply with your name to continue)" });
            return;
        }

        // No name on record yet — prompt for it before anything else
        const isGreeting  = GREETING_REGEX.test(normalizedText);
        const welcomeMsg  = await promptForName(phone, tenantId, tenant.business_name || "us", isGreeting);
        await sendMessage({ tenant, to: phone, text: welcomeMsg });
        return;
    }

    // ── Step 2: Greeting → restart workflow ──────────────────────────────────
    if (GREETING_REGEX.test(normalizedText) || GREETING_REGEX.test(normalizedPayload)) {
        return startWorkflow({ tenant, phone, tenantId, workflow });
    }

    // ── Step 3: Resolve current step and context ─────────────────────────────
    const stateData = existingState;
    const currentStepId = (stateData?.workflow_step === "__collecting_name__" ? null : stateData?.workflow_step)
        || stateData?.state
        || workflow.start_step;

    const context = {
        service_name:  stateData?.workflow_context?.service_name  || stateData?.service_name  || null,
        service_id:    stateData?.workflow_context?.service_id    || null,
        date:          stateData?.workflow_context?.date          || stateData?.date          || null,
        time:          stateData?.workflow_context?.time          || stateData?.time          || null,
        provider_id:   stateData?.workflow_context?.provider_id   || null,
        provider_name: stateData?.workflow_context?.provider_name || null,
        custom_answers:stateData?.workflow_context?.custom_answers|| {},
        period_id:     stateData?.workflow_context?.period_id     || null,
        period_title:  stateData?.workflow_context?.period_title  || null,
        customer_name: stateData?.customer_name                   || null
    };

    const step = getStepById(workflow, currentStepId);

    if (!step) return startWorkflow({ tenant, phone, tenantId, workflow });

    // ── Step 4: Route by step kind ────────────────────────────────────────────
    switch (step.kind) {
        case "service": {
            const services = await getServices(tenantId);
            const activeServices = services.filter(s => s.is_active !== false);
            const service = activeServices.find((item) => {
                const serviceId = String(item.id);
                return [buildInteractiveId(step.id, serviceId), `service_${serviceId}`, serviceId, item.name]
                    .some((token) => String(token || "").trim().toLowerCase() === input);
            });

            if (!service) return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });

            return promptStep({ tenant, phone, tenantId, workflow, stepId: step.next, context: {
                ...context, service_id: service.id, service_name: service.name,
                provider_id: null, provider_name: null, date: null, time: null, period_id: null, period_title: null
            }});
        }

        case "date_choice": {
            const option = matchStaticOption(step, input);
            if (!option) return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });

            if (option.value === "other") {
                return promptStep({ tenant, phone, tenantId, workflow, stepId: option.next || step.next, context: {
                    ...context, date: null, time: null, period_id: null, period_title: null
                }});
            }

            return promptStep({ tenant, phone, tenantId, workflow, stepId: option.next || step.next, context: {
                ...context, date: parseDate(option.value, tenant?.timezone), time: null, period_id: null, period_title: null
            }});
        }

        case "service_provider": {
            const providers = await getProvidersByTenantAndService(tenantId, context.service_id);
            const activeProviders = providers.filter(p => p.is_active !== false);

            if (!activeProviders.length) {
                return promptStep({ tenant, phone, tenantId, workflow, stepId: step.next, context: { ...context, provider_id: null, provider_name: null } });
            }

            const provider = activeProviders.find((item) => {
                const providerId = String(item.id);
                return [buildInteractiveId(step.id, providerId), providerId, item.name]
                    .some((token) => String(token || "").trim().toLowerCase() === input);
            });

            if (!provider) return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });

            return promptStep({ tenant, phone, tenantId, workflow, stepId: step.next, context: {
                ...context, provider_id: provider.id, provider_name: provider.name
            }});
        }

        case "relative_date_list": {
            const option = getRelativeDateOptions(tenant, step.offsets).find((item) =>
                [buildInteractiveId(step.id, item.value), item.id, item.value, item.title]
                    .some((token) => String(token || "").trim().toLowerCase() === input)
            );

            if (!option) return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });

            return promptStep({ tenant, phone, tenantId, workflow, stepId: step.next, context: {
                ...context, date: option.value, time: null, period_id: null, period_title: null
            }});
        }

        case "time_period": {
            const availableSlots = await getAvailableTimeSlots(tenant, context.date);
            const period = groupSlotsIntoPeriods(availableSlots).find((item) =>
                [buildInteractiveId(step.id, item.id), item.id, item.title]
                    .some((token) => String(token || "").trim().toLowerCase() === input)
            );

            if (!period) return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });

            return promptStep({ tenant, phone, tenantId, workflow, stepId: step.next, context: {
                ...context, period_id: period.id, period_title: period.title, time: null
            }});
        }

        case "time_slot": {
            const availableSlots = await getAvailableTimeSlots(tenant, context.date);
            const periods = groupSlotsIntoPeriods(availableSlots);
            const period = periods.find((item) => item.id === context.period_id) || periods[0];
            const timeSlot = period?.slots.find((slot) =>
                [buildInteractiveId(step.id, slot.dbValue), slot.id, slot.dbValue, slot.title]
                    .some((token) => String(token || "").trim().toLowerCase() === input)
            );

            if (!timeSlot) {
                const periodStep = workflow.steps.find((item) => item.kind === "time_period");
                return promptStep({ tenant, phone, tenantId, workflow, stepId: periodStep?.id || step.id, context });
            }

            return promptStep({ tenant, phone, tenantId, workflow, stepId: step.next, context: { ...context, time: timeSlot.dbValue } });
        }

        case "confirmation": {
            const option = matchStaticOption(step, input);
            if (!option) return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });

            if (option.action === "cancel") {
                await sendMessage({ tenant, to: phone, text: "👋 No worries! Your booking has been cancelled.\n\nReply *Hi* whenever you're ready to book again. 😊" });
                await resetWorkflowState({ phone, tenantId, workflow, tenant, sendPrompt: false });
                return;
            }

            return completeBooking({ tenant, phone, tenantId, workflow, context });
        }

        case "custom_choice": {
            const option = matchStaticOption(step, input);
            if (!option) return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });

            const answerKey = step.answer_key || step.id;
            return promptStep({ tenant, phone, tenantId, workflow, stepId: option.next || step.next, context: {
                ...context,
                custom_answers: {
                    ...(context.custom_answers || {}),
                    [answerKey]: { step_id: step.id, option_id: option.id, title: option.title, value: option.value || option.title }
                }
            }});
        }

        default:
            return startWorkflow({ tenant, phone, tenantId, workflow });
    }
}

module.exports = { processMessage };

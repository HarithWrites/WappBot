const db = require("../db");
const {
    sendButtonsMessage,
    sendListMessage,
    sendMessage
} = require("./whatsappService");
const {
    createBooking,
    getBookedSlotCounts,
    getSlotCapacity,
    SlotAlreadyBookedError
} = require("./bookingService");
const { getServices } = require("./serviceService");
const { getProvidersByTenantAndService } = require("./providerService");
const { getWorkflowDefinition } = require("./workflowService");
const {
    addDays,
    formatDisplayDate,
    getDateInTimeZone,
    parseDate,
    toDisplayDate
} = require("../utils/validators");

async function getState(phone, tenantId) {
    const res = await db.query(
        "SELECT * FROM conversation_state WHERE phone=$1 AND tenant_id=$2",
        [phone, tenantId]
    );
    return res.rows[0];
}

async function setState(phone, tenantId, data = {}) {
    const context = data.context || {};

    await db.query(
        `INSERT INTO conversation_state
        (phone, tenant_id, state, workflow_step, workflow_context, service_name, date, time)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (phone, tenant_id)
        DO UPDATE SET
            state = $3,
            workflow_step = $4,
            workflow_context = $5,
            service_name = $6,
            date = $7,
            time = $8
        `,
        [
            phone,
            tenantId,
            data.step || null,
            data.step || null,
            JSON.stringify(context),
            context.service_name || null,
            context.date || null,
            context.time || null
        ]
    );
}

function format12Hour(hours, minutes) {
    const meridiem = hours >= 12 ? "PM" : "AM";
    const normalizedHours = hours % 12 || 12;
    return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function buildTimeSlots(tenant) {
    const slots = [];
    const open = tenant?.opening_hour || 9;
    const close = tenant?.closing_hour || 21;
    const interval = tenant?.slot_duration || 30;

    for (let totalMinutes = open * 60; totalMinutes < close * 60; totalMinutes += interval) {
        const hour = Math.floor(totalMinutes / 60);
        const minute = totalMinutes % 60;
        const hh = String(hour).padStart(2, "0");
        const mm = String(minute).padStart(2, "0");

        slots.push({
            id: `time_${hh}_${mm}`,
            title: format12Hour(hour, minute),
            dbValue: `${hh}:${mm}:00`
        });
    }

    return slots;
}

function groupSlotsIntoPeriods(slots) {
    const periods = [
        { id: "period_morning", title: "Morning", startHour: 0, endHour: 11 },
        { id: "period_afternoon", title: "Afternoon", startHour: 12, endHour: 16 },
        { id: "period_evening", title: "Evening", startHour: 17, endHour: 23 }
    ];

    return periods
        .map((period) => ({
            ...period,
            slots: slots.filter((slot) => {
                const hour = Number(slot.dbValue.slice(0, 2));
                return hour >= period.startHour && hour <= period.endHour;
            })
        }))
        .filter((period) => period.slots.length > 0);
}

async function getAvailableTimeSlots(tenant, bookingDate) {
    const slotCounts = await getBookedSlotCounts(tenant.id, bookingDate);
    const capacity = getSlotCapacity(tenant);

    return buildTimeSlots(tenant).filter((slot) => {
        const bookingCount = slotCounts.get(slot.dbValue) || 0;
        return bookingCount < capacity;
    });
}

function getRelativeDateOptions(tenant, offsets = [1, 2, 3, 4, 5, 6, 7]) {
    const timeZone = tenant?.timezone;
    const holidays = Array.isArray(tenant.business_holidays) ? tenant.business_holidays : [];
    const weekOffs = Array.isArray(tenant.week_offs) ? tenant.week_offs : [];

    const options = [];
    for (const offset of offsets) {
        const date = addDays(getDateInTimeZone(timeZone), offset);
        const dateStr = toDateOnlyString(date);
        const dayOfWeek = date.getDay();

        const isHoliday = holidays.includes(dateStr);
        const isWeekOff = weekOffs.includes(dayOfWeek);

        if (!isHoliday && !isWeekOff) {
            const display = toDisplayDate(date);
            options.push({
                id: `date_${display.replace(/\//g, "_")}`,
                title: display,
                value: dateStr
            });
        }

        if (options.length >= 4) break;
    }
    return options;
}

function getCurrentWeekRange(timeZone) {
    const today = getDateInTimeZone(timeZone);
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = addDays(today, diffToMonday);
    const end = addDays(start, 6);
    return { start, end };
}

function getStepById(workflow, stepId) {
    return workflow.steps.find((step) => step.id === stepId) || null;
}

function buildPromptText(template, fallback, values) {
    const rawTemplate = String(template || fallback || "").trim();

    return rawTemplate.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, token) => {
        const value = values[token];
        return value == null ? "" : String(value);
    });
}

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
        welcome_message: tenant?.welcome_message || "Choose an option to continue.",
        service_name: context.service_name || "",
        service_id: context.service_id || "",
        date: context.date || "",
        time: context.time || "",
        provider: context.provider_name || "",
        provider_name: context.provider_name || "",
        provider_id: context.provider_id || "",
        display_date: context.date ? formatDisplayDate(context.date) : "",
        display_time: timeSlot ? timeSlot.title : (context.time || ""),
        period_title: context.period_title || "",
        slot_duration: tenant?.slot_duration || 30,
        opening_hours: `${format12Hour(openingHour, 0)} to ${format12Hour(closingHour, 0)}`,
        capacity_note: capacity > 1 ? ` Parallel appointments allowed: ${capacity}.` : "",
        week_note: isThisWeek ? "\nThis booking is in this week." : ""
    };
    const customAnswers = context.custom_answers || {};

    Object.entries(customAnswers).forEach(([key, answer]) => {
        if (answer && typeof answer === "object" && !Array.isArray(answer)) {
            templateValues[key] = answer.title || answer.text || answer.value || "";
            templateValues[`${key}_text`] = answer.title || answer.text || "";
            templateValues[`${key}_value`] = answer.value || "";
            templateValues[`${key}_id`] = answer.option_id || "";
            return;
        }

        templateValues[key] = answer == null ? "" : String(answer);
    });

    return templateValues;
}

function buildQuestion(step, tenant, context) {
    const values = getTemplateValues({ tenant, context });
    return {
        header: buildPromptText(step.question?.header, "", values),
        body: buildPromptText(step.question?.body, "", values),
        footer: buildPromptText(step.question?.footer, "", values)
    };
}

function buildInteractiveId(stepId, optionId) {
    return `${stepId}__${optionId}`;
}

function chooseAnswerMode(step, items) {
    const explicitMode = step.answer_mode || "auto";

    if (explicitMode === "buttons" || explicitMode === "list") {
        return explicitMode === "buttons" && items.length > 3 ? "list" : explicitMode;
    }

    return items.length <= 3 ? "buttons" : "list";
}

async function sendInteractiveStep({ tenant, phone, step, question, items, listTitle, buttonText }) {
    const answerMode = chooseAnswerMode(step, items);

    if (answerMode === "buttons") {
        return sendButtonsMessage({
            tenant,
            to: phone,
            header: question.header,
            body: question.body,
            footer: question.footer,
            buttons: items.map((item) => ({
                id: item.id,
                title: item.title.slice(0, 20)
            }))
        });
    }

    return sendListMessage({
        tenant,
        to: phone,
        header: question.header,
        body: question.body,
        footer: question.footer,
        buttonText: (buttonText || step.button_text || "View options").slice(0, 20),
        sections: [
            {
                title: (listTitle || step.list_title || "Available options").slice(0, 24),
                rows: items.map((item) => ({
                    id: item.id,
                    title: item.title.slice(0, 24),
                    description: (item.description || "Tap to select").slice(0, 72)
                }))
            }
        ]
    });
}

async function startWorkflow({ tenant, phone, tenantId, workflow }) {
    return resetWorkflowState({ phone, tenantId, workflow, tenant, sendPrompt: true });
}

async function resetWorkflowState({ phone, tenantId, workflow, tenant, sendPrompt }) {
    await setState(phone, tenantId, {
        step: workflow.start_step,
        context: {}
    });

    if (!sendPrompt) {
        return;
    }

    return promptStep({
        tenant,
        phone,
        tenantId,
        workflow,
        stepId: workflow.start_step,
        context: {}
    });
}

async function promptStep({ tenant, phone, tenantId, workflow, stepId, context }) {
    const step = getStepById(workflow, stepId);

    if (!step) {
        return startWorkflow({ tenant, phone, tenantId, workflow });
    }

    await setState(phone, tenantId, {
        step: step.id,
        context
    });

    const question = buildQuestion(step, tenant, context);

    switch (step.kind) {
        case "service": {
            const services = await getServices(tenantId);
            const activeServices = services.filter(s => s.is_active !== false);
            if (!activeServices.length) {
                return sendMessage({ tenant, phone, text: "Sorry, no services are currently available." });
            }
            return sendListMessage({
                tenant,
                to: phone,
                text: buildPromptText(step.text, "Please select a service:", context),
                button: "Services",
                sections: [{
                    title: "Available Services",
                    rows: activeServices.map((s) => ({
                        id: buildInteractiveId(step.id, String(s.id)),
                        title: s.name
                    }))
                }]
            });
        }

        case "date_choice": {
            return sendInteractiveStep({
                tenant,
                phone,
                step,
                question,
                items: step.options.map((option) => ({
                    id: buildInteractiveId(step.id, option.id),
                    title: option.title,
                    description: option.description || "Tap to select"
                }))
            });
        }

        case "service_provider": {
            const providers = await getProvidersByTenantAndService(tenantId, context.service_id);
            const activeProviders = providers.filter(p => p.is_active !== false);

            if (!activeProviders.length) {
                return promptStep({
                    tenant,
                    phone,
                    tenantId,
                    workflow,
                    stepId: step.next,
                    context: {
                        ...context,
                        provider_id: null,
                        provider_name: null
                    }
                });
            }

            return sendListMessage({
                tenant,
                to: phone,
                text: buildPromptText(step.text, "Please select a provider:", context),
                button: "Providers",
                sections: [{
                    title: "Available Providers",
                    rows: activeProviders.map((p) => ({
                        id: buildInteractiveId(step.id, String(p.id)),
                        title: p.name
                    }))
                }]
            });
        }

        case "relative_date_list": {
            const options = getRelativeDateOptions(tenant);
 
            if (options.length === 0) {
                return sendMessage({ tenant, phone, text: "Sorry, no dates are available for booking at this time." });
            }
 
            return sendListMessage({
                tenant,
                to: phone,
                text: buildPromptText(step.text, "Please select a date:", context),
                button: "Dates",
                sections: [{
                    title: "Suggested Dates",
                    rows: [
                        ...options.map((opt) => ({
                            id: buildInteractiveId(step.id, opt.id),
                            title: opt.title
                        })),
                        {
                            id: buildInteractiveId(step.id, "other"),
                            title: "Other (Type DD/MM/YYYY)"
                        }
                    ]
                }]
            });
        }

        case "time_period": {
            const slots = await getAvailableTimeSlots(tenant, context.date);
            const periods = groupSlotsIntoPeriods(slots);

            if (!periods.length) {
                await sendMessage({
                    tenant,
                    to: phone,
                    text: "No appointment times are available on that date. Please choose another date."
                });

                const dateStep = workflow.steps.find((item) => item.kind === "date_choice");
                return promptStep({
                    tenant,
                    phone,
                    tenantId,
                    workflow,
                    stepId: dateStep?.id || workflow.start_step,
                    context: {
                        ...context,
                        date: null,
                        time: null,
                        period_id: null,
                        period_title: null
                    }
                });
            }

            return sendInteractiveStep({
                tenant,
                phone,
                step,
                question,
                items: periods.map((period) => ({
                    id: buildInteractiveId(step.id, period.id),
                    title: period.title,
                    description: `${period.slots.length} slot(s) available`
                }))
            });
        }

        case "time_slot": {
            const slots = await getAvailableTimeSlots(tenant, context.date);
            const periods = groupSlotsIntoPeriods(slots);
            const period = periods.find((item) => item.id === context.period_id) || periods[0];

            if (!period) {
                const periodStep = workflow.steps.find((item) => item.kind === "time_period");
                return promptStep({
                    tenant,
                    phone,
                    tenantId,
                    workflow,
                    stepId: periodStep?.id || workflow.start_step,
                    context
                });
            }

            return sendInteractiveStep({
                tenant,
                phone,
                step,
                question: buildQuestion(step, tenant, {
                    ...context,
                    period_title: period.title
                }),
                listTitle: period.title,
                buttonText: step.button_text || "View times",
                items: period.slots.map((slot) => ({
                    id: buildInteractiveId(step.id, slot.dbValue),
                    title: slot.title,
                    description: "Tap to select"
                }))
            });
        }

        case "confirmation": {
            return sendInteractiveStep({
                tenant,
                phone,
                step,
                question,
                items: step.options.map((option) => ({
                    id: buildInteractiveId(step.id, option.id),
                    title: option.title,
                    description: option.description || "Tap to select"
                }))
            });
        }

        case "custom_choice": {
            return sendInteractiveStep({
                tenant,
                phone,
                step,
                question,
                listTitle: step.list_title || "Available options",
                buttonText: step.button_text || "View options",
                items: step.options.map((option) => ({
                    id: buildInteractiveId(step.id, option.id),
                    title: option.title,
                    description: option.description || "Tap to select"
                }))
            });
        }

        default:
            return sendMessage({
                tenant,
                to: phone,
                text: question.body || "This step is not configured correctly. Type Hi to restart."
            });
    }
}

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

async function completeBooking({ tenant, phone, tenantId, workflow, context }) {
    if (!context.service_name || !context.date || !context.time) {
        await sendMessage({
            tenant,
            to: phone,
            text: "I could not complete the booking because some details are missing. Type Hi to start again."
        });

        return startWorkflow({ tenant, phone, tenantId, workflow });
    }

    let booking;

    try {
            booking = await createBooking({
                tenant,
                tenant_id: tenantId,
                phone,
                service_name: context.service_name,
                booking_date: context.date,
                booking_time: context.time,
                workflow_answers: context.custom_answers || {},
                provider_id: context.provider_id || null,
                provider_name: context.provider_name || null
            });
    } catch (err) {
        if (err instanceof SlotAlreadyBookedError) {
            await sendMessage({
                tenant,
                to: phone,
                text: "That slot is no longer available. Please choose another time."
            });

            const periodStep = workflow.steps.find((item) => item.kind === "time_period");
            return promptStep({
                tenant,
                phone,
                tenantId,
                workflow,
                stepId: periodStep?.id || workflow.start_step,
                context: {
                    ...context,
                    time: null
                }
            });
        }

        throw err;
    }

    await sendMessage({
        tenant,
        to: phone,
        text: `Booking confirmed.\nID: ${booking.id}\nService: ${booking.service_name}${booking.provider_name ? `\nProvider: ${booking.provider_name}` : ""}\nDate: ${formatDisplayDate(booking.booking_date) || booking.booking_date}\nTime: ${buildTimeSlots(tenant).find((slot) => slot.dbValue === booking.booking_time)?.title || booking.booking_time}`
    });

    await resetWorkflowState({ phone, tenantId, workflow, tenant, sendPrompt: false });
    return;
}

async function processMessage({ tenant, phone, text, payload }) {
    const tenantId = tenant.id;
    const workflow = await getWorkflowDefinition(tenant);
    const normalizedText = (text || "").trim().toLowerCase();
    const normalizedPayload = (payload || "").trim().toLowerCase();
    const input = normalizedPayload || normalizedText;

    console.log("INPUT:", { phone, text: normalizedText, payload: normalizedPayload });

    if (normalizedText === "hi" || normalizedText === "hello" || input === "restart") {
        return startWorkflow({ tenant, phone, tenantId, workflow });
    }

    const stateData = await getState(phone, tenantId);
    const currentStepId = stateData?.workflow_step || stateData?.state || workflow.start_step;
    const context = {
        service_name: stateData?.workflow_context?.service_name || stateData?.service_name || null,
        service_id: stateData?.workflow_context?.service_id || null,
        date: stateData?.workflow_context?.date || stateData?.date || null,
        time: stateData?.workflow_context?.time || stateData?.time || null,
        provider_id: stateData?.workflow_context?.provider_id || null,
        provider_name: stateData?.workflow_context?.provider_name || null,
        custom_answers: stateData?.workflow_context?.custom_answers || {},
        period_id: stateData?.workflow_context?.period_id || null,
        period_title: stateData?.workflow_context?.period_title || null
    };
    const step = getStepById(workflow, currentStepId);

    console.log("STATE:", currentStepId, context);

    if (!step) {
        return startWorkflow({ tenant, phone, tenantId, workflow });
    }

    switch (step.kind) {
        case "service": {
            const services = await getServices(tenantId);
            const activeServices = services.filter(s => s.is_active !== false);
            const service = activeServices.find((item) => {
                const serviceId = String(item.id);
                return [
                    buildInteractiveId(step.id, serviceId),
                    `service_${serviceId}`,
                    serviceId,
                    item.name
                ].some((token) => String(token || "").trim().toLowerCase() === input);
            });

            if (!service) {
                return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });
            }

            return promptStep({
                tenant,
                phone,
                tenantId,
                workflow,
                stepId: step.next,
                context: {
                    ...context,
                    service_id: service.id,
                    service_name: service.name,
                    provider_id: null,
                    provider_name: null,
                    date: null,
                    time: null,
                    period_id: null,
                    period_title: null
                }
            });
        }

        case "date_choice": {
            const option = matchStaticOption(step, input);

            if (!option) {
                return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });
            }

            if (option.value === "other") {
                return promptStep({
                    tenant,
                    phone,
                    tenantId,
                    workflow,
                    stepId: option.next || step.next,
                    context: {
                        ...context,
                        date: null,
                        time: null,
                        period_id: null,
                        period_title: null
                    }
                });
            }

            return promptStep({
                tenant,
                phone,
                tenantId,
                workflow,
                stepId: option.next || step.next,
                context: {
                    ...context,
                    date: parseDate(option.value, tenant?.timezone),
                    time: null,
                    period_id: null,
                    period_title: null
                }
            });
        }

        case "service_provider": {
            const providers = await getProvidersByTenantAndService(tenantId, context.service_id);
            const activeProviders = providers.filter(p => p.is_active !== false);
            const provider = activeProviders.find((item) => {
                const providerId = String(item.id);
                return [
                    buildInteractiveId(step.id, providerId),
                    providerId,
                    item.name
                ].some((token) => String(token || "").trim().toLowerCase() === input);
            });

            if (!activeProviders.length) {
                return promptStep({
                    tenant,
                    phone,
                    tenantId,
                    workflow,
                    stepId: step.next,
                    context: {
                        ...context,
                        provider_id: null,
                        provider_name: null
                    }
                });
            }

            if (!provider) {
                return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });
            }

            return promptStep({
                tenant,
                phone,
                tenantId,
                workflow,
                stepId: step.next,
                context: {
                    ...context,
                    provider_id: provider.id,
                    provider_name: provider.name
                }
            });
        }

        case "relative_date_list": {
            const option = getRelativeDateOptions(tenant, step.offsets).find((item) => {
                return [
                    buildInteractiveId(step.id, item.value),
                    item.id,
                    item.value,
                    item.title
                ].some((token) => String(token || "").trim().toLowerCase() === input);
            });

            if (!option) {
                return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });
            }

            return promptStep({
                tenant,
                phone,
                tenantId,
                workflow,
                stepId: step.next,
                context: {
                    ...context,
                    date: option.value,
                    time: null,
                    period_id: null,
                    period_title: null
                }
            });
        }

        case "time_period": {
            const availableSlots = await getAvailableTimeSlots(tenant, context.date);
            const period = groupSlotsIntoPeriods(availableSlots).find((item) => {
                return [
                    buildInteractiveId(step.id, item.id),
                    item.id,
                    item.title
                ].some((token) => String(token || "").trim().toLowerCase() === input);
            });

            if (!period) {
                return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });
            }

            return promptStep({
                tenant,
                phone,
                tenantId,
                workflow,
                stepId: step.next,
                context: {
                    ...context,
                    period_id: period.id,
                    period_title: period.title,
                    time: null
                }
            });
        }

        case "time_slot": {
            const availableSlots = await getAvailableTimeSlots(tenant, context.date);
            const periods = groupSlotsIntoPeriods(availableSlots);
            const period = periods.find((item) => item.id === context.period_id) || periods[0];
            const timeSlot = period?.slots.find((slot) => {
                return [
                    buildInteractiveId(step.id, slot.dbValue),
                    slot.id,
                    slot.dbValue,
                    slot.title
                ].some((token) => String(token || "").trim().toLowerCase() === input);
            });

            if (!timeSlot) {
                const periodStep = workflow.steps.find((item) => item.kind === "time_period");
                return promptStep({
                    tenant,
                    phone,
                    tenantId,
                    workflow,
                    stepId: periodStep?.id || step.id,
                    context
                });
            }

            return promptStep({
                tenant,
                phone,
                tenantId,
                workflow,
                stepId: step.next,
                context: {
                    ...context,
                    time: timeSlot.dbValue
                }
            });
        }

        case "confirmation": {
            const option = matchStaticOption(step, input);

            if (!option) {
                return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });
            }

            if (option.action === "cancel") {
                await sendMessage({
                    tenant,
                    to: phone,
                    text: "Booking cancelled. Type Hi when you want to start again."
                });

                await resetWorkflowState({ phone, tenantId, workflow, tenant, sendPrompt: false });
                return;
            }

            return completeBooking({ tenant, phone, tenantId, workflow, context });
        }

        case "custom_choice": {
            const option = matchStaticOption(step, input);

            if (!option) {
                return promptStep({ tenant, phone, tenantId, workflow, stepId: step.id, context });
            }

            const answerKey = step.answer_key || step.id;

            return promptStep({
                tenant,
                phone,
                tenantId,
                workflow,
                stepId: option.next || step.next,
                context: {
                    ...context,
                    custom_answers: {
                        ...(context.custom_answers || {}),
                        [answerKey]: {
                            step_id: step.id,
                            option_id: option.id,
                            title: option.title,
                            value: option.value || option.title
                        }
                    }
                }
            });
        }

        default:
            return startWorkflow({ tenant, phone, tenantId, workflow });
    }
}

module.exports = { processMessage };

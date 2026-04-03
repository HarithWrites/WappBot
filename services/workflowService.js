const DEFAULT_WORKFLOW = {
    version: 1,
    start_step: "service",
    steps: [
        {
            id: "service",
            kind: "service",
            answer_mode: "auto",
            question: {
                header: "Book a service",
                body: "{{welcome_message}}",
                footer: "Choose a service to continue."
            },
            next: "service_provider"
        },
        {
            id: "service_provider",
            kind: "service_provider",
            answer_mode: "auto",
            answer_key: "provider",
            question: {
                header: "Choose a service provider",
                body: "Service: {{service_name}}\nSelect your preferred provider.",
                footer: "Choose one provider"
            },
            next: "date"
        },
        {
            id: "date",
            kind: "date_choice",
            answer_mode: "buttons",
            question: {
                header: "Choose a date",
                body: "Service: {{service_name}}\nPick one date option.",
                footer: "Today, tomorrow, or another date"
            },
            options: [
                { id: "today", title: "Today", value: "today", next: "time_period" },
                { id: "tomorrow", title: "Tomorrow", value: "tomorrow", next: "time_period" },
                { id: "other", title: "Other date", value: "other", next: "other_date" }
            ]
        },
        {
            id: "other_date",
            kind: "relative_date_list",
            answer_mode: "list",
            question: {
                header: "Choose another date",
                body: "Service: {{service_name}}\nSelect one of the next available dates.",
                footer: "Dates shown as DD/MM/YYYY"
            },
            offsets: [2, 3, 4],
            list_title: "Next 3 dates",
            button_text: "View dates",
            next: "time_period"
        },
        {
            id: "time_period",
            kind: "time_period",
            answer_mode: "buttons",
            question: {
                header: "Choose a time window",
                body: "Service: {{service_name}}\nDate: {{display_date}}\nAvailable hours: {{opening_hours}}.{{capacity_note}}",
                footer: "Pick a period first"
            },
            next: "time"
        },
        {
            id: "time",
            kind: "time_slot",
            answer_mode: "list",
            question: {
                header: "{{period_title}} slots",
                body: "Service: {{service_name}}\nDate: {{display_date}}\nChoose one {{slot_duration}}-minute slot.",
                footer: "Only slots with remaining capacity are shown"
            },
            button_text: "View times",
            next: "confirm"
        },
        {
            id: "confirm",
            kind: "confirmation",
            answer_mode: "buttons",
            question: {
                header: "Confirm booking",
                body: "Service: {{service_name}}\nDate: {{display_date}}\nTime: {{display_time}}{{week_note}}",
                footer: "Please confirm"
            },
            options: [
                { id: "yes", title: "Yes", value: "yes", action: "confirm" },
                { id: "no", title: "No", value: "no", action: "cancel" }
            ]
        }
    ]
};

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function toPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    return value;
}

function normalizeQuestion(question, fallback = {}) {
    const source = toPlainObject(question);
    return {
        header: String(source.header || fallback.header || "").trim(),
        body: String(source.body || fallback.body || "").trim(),
        footer: String(source.footer || fallback.footer || "").trim()
    };
}

function normalizeOption(option, index, stepId, fallback = {}) {
    const source = toPlainObject(option);
    const fallbackId = fallback.id || `option_${index + 1}`;
    return {
        id: String(source.id || fallbackId).trim(),
        title: String(source.title || fallback.title || `Option ${index + 1}`).trim(),
        value: source.value != null ? String(source.value).trim() : (fallback.value != null ? String(fallback.value).trim() : ""),
        next: source.next ? String(source.next).trim() : (fallback.next ? String(fallback.next).trim() : ""),
        action: source.action ? String(source.action).trim() : (fallback.action ? String(fallback.action).trim() : ""),
        description: source.description ? String(source.description).trim() : (fallback.description ? String(fallback.description).trim() : ""),
        step_id: stepId
    };
}

function normalizeStep(step, index, fallbackStep) {
    const source = toPlainObject(step);
    const stepId = String(source.id || fallbackStep?.id || `step_${index + 1}`).trim();
    const fallbackOffsets = Array.isArray(fallbackStep?.offsets) ? fallbackStep.offsets : [2, 3, 4];
    const rawOffsets = Array.isArray(source.offsets) ? source.offsets : fallbackOffsets;
    const offsets = rawOffsets
        .map((item) => Number.parseInt(item, 10))
        .filter((item) => Number.isInteger(item) && item >= 0);

    return {
        id: stepId,
        kind: String(source.kind || fallbackStep?.kind || "text").trim(),
        answer_mode: String(source.answer_mode || fallbackStep?.answer_mode || "buttons").trim(),
        answer_key: String(source.answer_key || fallbackStep?.answer_key || stepId).trim(),
        next: String(source.next || fallbackStep?.next || "").trim(),
        list_title: String(source.list_title || fallbackStep?.list_title || "").trim(),
        button_text: String(source.button_text || fallbackStep?.button_text || "").trim(),
        question: normalizeQuestion(source.question, fallbackStep?.question || {}),
        offsets: offsets.length ? offsets : fallbackOffsets,
        options: (Array.isArray(source.options) ? source.options : (fallbackStep?.options || []))
            .map((option, optionIndex) => normalizeOption(
                option,
                optionIndex,
                stepId,
                fallbackStep?.options?.[optionIndex]
            ))
    };
}

function normalizeWorkflowConfig(rawConfig) {
    const base = deepClone(DEFAULT_WORKFLOW);
    const source = toPlainObject(rawConfig);
    const rawSteps = Array.isArray(source.steps) && source.steps.length
        ? source.steps
        : base.steps;

    const steps = rawSteps.map((step, index) => normalizeStep(step, index, base.steps[index]));
    const startStep = String(source.start_step || base.start_step || steps[0]?.id || "").trim();

    return {
        version: Number.parseInt(source.version, 10) || base.version,
        start_step: steps.some((step) => step.id === startStep) ? startStep : (steps[0]?.id || base.start_step),
        steps
    };
}

function getWorkflowDefinition(tenant) {
    return normalizeWorkflowConfig(tenant?.workflow_config);
}

module.exports = {
    DEFAULT_WORKFLOW,
    getWorkflowDefinition,
    normalizeWorkflowConfig
};

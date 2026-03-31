const db = require("../db");
const {
    sendButtonsMessage,
    sendListMessage,
    sendMessage
} = require("./whatsappService");
const { createBooking } = require("./bookingService");
const { getServices } = require("./serviceService");
const {
    addDays,
    parseDate,
    toDisplayDate
} = require("../utils/validators");

const OPENING_HOUR = 9;
const CLOSING_HOUR = 21;
const HALF_HOUR_MINUTES = 30;

async function getState(phone, tenant_id) {
    const res = await db.query(
        "SELECT * FROM conversation_state WHERE phone=$1 AND tenant_id=$2",
        [phone, tenant_id]
    );
    return res.rows[0];
}

async function setState(phone, tenant_id, data) {
    await db.query(
        `INSERT INTO conversation_state
        (phone, tenant_id, state, service_name, date, time)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (phone, tenant_id)
        DO UPDATE SET
            state = $3,
            service_name = $4,
            date = $5,
            time = $6
        `,
        [
            phone,
            tenant_id,
            data.state || null,
            data.service_name || null,
            data.date || null,
            data.time || null
        ]
    );
}

function format12Hour(hours, minutes) {
    const meridiem = hours >= 12 ? "PM" : "AM";
    const normalizedHours = hours % 12 || 12;
    return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function buildTimeSlots() {
    const slots = [];

    for (let hour = OPENING_HOUR; hour <= CLOSING_HOUR; hour += 1) {
        for (let minute = 0; minute < 60; minute += HALF_HOUR_MINUTES) {
            if (hour === CLOSING_HOUR && minute > 0) {
                break;
            }

            const hh = String(hour).padStart(2, "0");
            const mm = String(minute).padStart(2, "0");
            slots.push({
                id: `time_${hh}_${mm}`,
                title: format12Hour(hour, minute),
                dbValue: `${hh}:${mm}:00`
            });
        }
    }

    return slots;
}

const TIME_SLOTS = buildTimeSlots();
const TIME_PERIODS = [
    { id: "period_morning", title: "Morning", startHour: 9, endHour: 12 },
    { id: "period_afternoon", title: "Afternoon", startHour: 13, endHour: 16 },
    { id: "period_evening", title: "Evening", startHour: 17, endHour: 21 }
];

function getOtherDateOptions() {
    return [2, 3, 4].map((offset) => {
        const date = addDays(new Date(), offset);
        const display = toDisplayDate(date);
        return {
            id: `date_${display.replace(/\//g, "_")}`,
            title: display,
            value: parseDate(display)
        };
    });
}

function getCurrentWeekRange() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = addDays(today, diffToMonday);
    const end = addDays(start, 6);
    return { start, end };
}

async function promptServiceSelection({ tenant, phone, tenant_id }) {
    const services = await getServices(tenant_id);

    if (!services.length) {
        return sendMessage({
            tenant,
            to: phone,
            text: "No services are configured right now. Please try again later."
        });
    }

    await setState(phone, tenant_id, {
        state: "SERVICE_SELECTION",
        service_name: null,
        date: null,
        time: null
    });

    if (services.length <= 3) {
        return sendButtonsMessage({
            tenant,
            to: phone,
            header: "Book a service",
            body: tenant.welcome_message || "Choose a service to continue.",
            footer: "Tap one option",
            buttons: services.map((service) => ({
                id: `service_${service.id}`,
                title: service.name.slice(0, 20)
            }))
        });
    }

    return sendListMessage({
        tenant,
        to: phone,
        header: "Book a service",
        body: tenant.welcome_message || "Choose a service to continue.",
        footer: "Select one service",
        buttonText: "View services",
        sections: [
            {
                title: "Available services",
                rows: services.map((service) => ({
                    id: `service_${service.id}`,
                    title: service.name.slice(0, 24),
                    description: "Tap to select"
                }))
            }
        ]
    });
}

async function promptDateSelection({ tenant, phone, tenant_id, service_name }) {
    await setState(phone, tenant_id, {
        state: "DATE_SELECTION",
        service_name,
        date: null,
        time: null
    });

    return sendButtonsMessage({
        tenant,
        to: phone,
        header: "Choose a date",
        body: `Service: ${service_name}\nPick one date option.`,
        footer: "Today, tomorrow, or another date",
        buttons: [
            { id: "date_today", title: "Today" },
            { id: "date_tomorrow", title: "Tomorrow" },
            { id: "date_other", title: "Other date" }
        ]
    });
}

async function promptOtherDateSelection({ tenant, phone, tenant_id, service_name }) {
    await setState(phone, tenant_id, {
        state: "OTHER_DATE_SELECTION",
        service_name,
        date: null,
        time: null
    });

    const options = getOtherDateOptions();

    return sendListMessage({
        tenant,
        to: phone,
        header: "Choose another date",
        body: `Service: ${service_name}\nSelect one of the next available dates.`,
        footer: "Dates shown as DD/MM/YYYY",
        buttonText: "View dates",
        sections: [
            {
                title: "Next 3 dates",
                rows: options.map((option) => ({
                    id: option.id,
                    title: option.title,
                    description: "Tap to select"
                }))
            }
        ]
    });
}

async function promptTimePeriodSelection({ tenant, phone, tenant_id, service_name, date }) {
    await setState(phone, tenant_id, {
        state: "TIME_PERIOD_SELECTION",
        service_name,
        date,
        time: null
    });

    return sendButtonsMessage({
        tenant,
        to: phone,
        header: "Choose a time window",
        body: `Service: ${service_name}\nDate: ${toDisplayDate(new Date(`${date}T00:00:00`))}\nChoose a slot from 9:00 AM to 9:00 PM.`,
        footer: "Pick a period first",
        buttons: TIME_PERIODS.map((period) => ({
            id: period.id,
            title: period.title
        }))
    });
}

async function promptTimeSelection({ tenant, phone, tenant_id, service_name, date, periodId }) {
    await setState(phone, tenant_id, {
        state: "TIME_SELECTION",
        service_name,
        date,
        time: null
    });

    const period = TIME_PERIODS.find((item) => item.id === periodId) || TIME_PERIODS[0];
    const slots = TIME_SLOTS.filter((slot) => {
        const hour = Number(slot.dbValue.slice(0, 2));
        return hour >= period.startHour && hour <= period.endHour;
    });

    return sendListMessage({
        tenant,
        to: phone,
        header: `${period.title} slots`,
        body: `Service: ${service_name}\nDate: ${toDisplayDate(new Date(`${date}T00:00:00`))}\nChoose one 30-minute slot.`,
        footer: "Single-select time list",
        buttonText: "View times",
        sections: [
            {
                title: period.title,
                rows: slots.map((slot) => ({
                    id: slot.id,
                    title: slot.title,
                    description: "Tap to select"
                }))
            }
        ]
    });
}

async function promptConfirmation({ tenant, phone, tenant_id, service_name, date, time }) {
    await setState(phone, tenant_id, {
        state: "CONFIRMATION",
        service_name,
        date,
        time
    });

    const timeSlot = TIME_SLOTS.find((slot) => slot.dbValue === time);
    const week = getCurrentWeekRange();
    const bookingDate = new Date(`${date}T00:00:00`);
    const isThisWeek = bookingDate >= week.start && bookingDate <= week.end;
    const weekNote = isThisWeek ? "\nThis booking is in this week." : "";

    return sendButtonsMessage({
        tenant,
        to: phone,
        header: "Confirm booking",
        body: `Service: ${service_name}\nDate: ${toDisplayDate(bookingDate)}\nTime: ${timeSlot ? timeSlot.title : time}${weekNote}`,
        footer: "Please confirm",
        buttons: [
            { id: "confirm_yes", title: "Yes" },
            { id: "confirm_no", title: "No" }
        ]
    });
}

async function processMessage({ tenant, phone, text, payload }) {
    const tenant_id = tenant.id;
    const normalizedText = (text || "").trim().toLowerCase();
    const normalizedPayload = (payload || "").trim().toLowerCase();
    const input = normalizedPayload || normalizedText;

    console.log("INPUT:", { phone, text: normalizedText, payload: normalizedPayload });

    if (normalizedText === "hi" || normalizedText === "hello" || input === "restart") {
        return promptServiceSelection({ tenant, phone, tenant_id });
    }

    const stateData = await getState(phone, tenant_id);
    const state = stateData?.state || "SERVICE_SELECTION";

    console.log("STATE:", state, stateData);

    switch (state) {
        case "SERVICE_SELECTION": {
            const services = await getServices(tenant_id);
            const service = services.find((item) => `service_${item.id}` === input);

            if (!service) {
                return promptServiceSelection({ tenant, phone, tenant_id });
            }

            return promptDateSelection({
                tenant,
                phone,
                tenant_id,
                service_name: service.name
            });
        }

        case "DATE_SELECTION": {
            if (input === "date_other") {
                return promptOtherDateSelection({
                    tenant,
                    phone,
                    tenant_id,
                    service_name: stateData.service_name
                });
            }

            if (input === "date_today" || input === "today") {
                return promptTimePeriodSelection({
                    tenant,
                    phone,
                    tenant_id,
                    service_name: stateData.service_name,
                    date: parseDate("today")
                });
            }

            if (input === "date_tomorrow" || input === "tomorrow") {
                return promptTimePeriodSelection({
                    tenant,
                    phone,
                    tenant_id,
                    service_name: stateData.service_name,
                    date: parseDate("tomorrow")
                });
            }

            return promptDateSelection({
                tenant,
                phone,
                tenant_id,
                service_name: stateData.service_name
            });
        }

        case "OTHER_DATE_SELECTION": {
            const option = getOtherDateOptions().find((item) => item.id.toLowerCase() === input);

            if (!option) {
                return promptOtherDateSelection({
                    tenant,
                    phone,
                    tenant_id,
                    service_name: stateData.service_name
                });
            }

            return promptTimePeriodSelection({
                tenant,
                phone,
                tenant_id,
                service_name: stateData.service_name,
                date: option.value
            });
        }

        case "TIME_PERIOD_SELECTION": {
            const period = TIME_PERIODS.find((item) => item.id.toLowerCase() === input);

            if (!period) {
                return promptTimePeriodSelection({
                    tenant,
                    phone,
                    tenant_id,
                    service_name: stateData.service_name,
                    date: stateData.date
                });
            }

            return promptTimeSelection({
                tenant,
                phone,
                tenant_id,
                service_name: stateData.service_name,
                date: stateData.date,
                periodId: period.id
            });
        }

        case "TIME_SELECTION": {
            const timeSlot = TIME_SLOTS.find((slot) => slot.id.toLowerCase() === input);

            if (!timeSlot) {
                return promptTimePeriodSelection({
                    tenant,
                    phone,
                    tenant_id,
                    service_name: stateData.service_name,
                    date: stateData.date
                });
            }

            return promptConfirmation({
                tenant,
                phone,
                tenant_id,
                service_name: stateData.service_name,
                date: stateData.date,
                time: timeSlot.dbValue
            });
        }

        case "CONFIRMATION": {
            if (input !== "confirm_yes" && normalizedText !== "yes") {
                await sendMessage({
                    tenant,
                    to: phone,
                    text: "Booking cancelled. Type Hi when you want to start again."
                });

                return setState(phone, tenant_id, {
                    state: "SERVICE_SELECTION",
                    service_name: null,
                    date: null,
                    time: null
                });
            }

            const booking = await createBooking({
                tenant_id,
                phone,
                service_name: stateData.service_name,
                booking_date: stateData.date,
                booking_time: stateData.time
            });

            await sendMessage({
                tenant,
                to: phone,
                text: `Booking confirmed.\nID: ${booking.id}\nService: ${booking.service_name}\nDate: ${toDisplayDate(new Date(`${booking.booking_date}T00:00:00`))}\nTime: ${TIME_SLOTS.find((slot) => slot.dbValue === booking.booking_time)?.title || booking.booking_time}`
            });

            await setState(phone, tenant_id, {
                state: "SERVICE_SELECTION",
                service_name: null,
                date: null,
                time: null
            });

            return;
        }

        default:
            return promptServiceSelection({ tenant, phone, tenant_id });
    }
}

module.exports = { processMessage };

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
const {
    addDays,
    formatDisplayDate,
    getDateInTimeZone,
    parseDate,
    toDisplayDate
} = require("../utils/validators");

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
        .map((period) => {
            const periodSlots = slots.filter((slot) => {
                const hour = Number(slot.dbValue.slice(0, 2));
                return hour >= period.startHour && hour <= period.endHour;
            });

            return {
                ...period,
                slots: periodSlots
            };
        })
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

function getOtherDateOptions(tenant) {
    const timeZone = tenant?.timezone;

    return [2, 3, 4].map((offset) => {
        const date = addDays(getDateInTimeZone(timeZone), offset);
        const display = toDisplayDate(date);
        return {
            id: `date_${display.replace(/\//g, "_")}`,
            title: display,
            value: parseDate(display)
        };
    });
}

function getCurrentWeekRange(timeZone) {
    const today = getDateInTimeZone(timeZone);
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

    const options = getOtherDateOptions(tenant);

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

    const slots = await getAvailableTimeSlots(tenant, date);
    const periods = groupSlotsIntoPeriods(slots);

    if (!periods.length) {
        return sendMessage({
            tenant,
            to: phone,
            text: "No appointment times are available on that date. Please choose another date."
        });
    }

    const openingHour = tenant?.opening_hour || 9;
    const closingHour = tenant?.closing_hour || 21;
    const capacity = getSlotCapacity(tenant);
    const capacityNote = capacity > 1 ? `\nParallel appointments allowed: ${capacity}.` : "";

    return sendButtonsMessage({
        tenant,
        to: phone,
        header: "Choose a time window",
        body: `Service: ${service_name}\nDate: ${formatDisplayDate(date)}\nAvailable hours: ${format12Hour(openingHour, 0)} to ${format12Hour(closingHour, 0)}.${capacityNote}`,
        footer: "Pick a period first",
        buttons: periods.map((period) => ({
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

    const availableSlots = await getAvailableTimeSlots(tenant, date);
    const periods = groupSlotsIntoPeriods(availableSlots);
    const period = periods.find((item) => item.id === periodId) || periods[0];

    if (!period) {
        return promptTimePeriodSelection({
            tenant,
            phone,
            tenant_id,
            service_name,
            date
        });
    }

    const slotDuration = tenant?.slot_duration || 30;

    return sendListMessage({
        tenant,
        to: phone,
        header: `${period.title} slots`,
        body: `Service: ${service_name}\nDate: ${formatDisplayDate(date)}\nChoose one ${slotDuration}-minute slot.`,
        footer: "Only slots with remaining capacity are shown",
        buttonText: "View times",
        sections: [
            {
                title: period.title,
                rows: period.slots.map((slot) => ({
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

    const timeSlot = buildTimeSlots(tenant).find((slot) => slot.dbValue === time);
    const week = getCurrentWeekRange(tenant?.timezone);
    const bookingDate = new Date(`${date}T00:00:00`);
    const isThisWeek = bookingDate >= week.start && bookingDate <= week.end;
    const weekNote = isThisWeek ? "\nThis booking is in this week." : "";

    return sendButtonsMessage({
        tenant,
        to: phone,
        header: "Confirm booking",
        body: `Service: ${service_name}\nDate: ${formatDisplayDate(date)}\nTime: ${timeSlot ? timeSlot.title : time}${weekNote}`,
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
                    date: parseDate("today", tenant?.timezone)
                });
            }

            if (input === "date_tomorrow" || input === "tomorrow") {
                return promptTimePeriodSelection({
                    tenant,
                    phone,
                    tenant_id,
                    service_name: stateData.service_name,
                    date: parseDate("tomorrow", tenant?.timezone)
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
            const option = getOtherDateOptions(tenant).find((item) => item.id.toLowerCase() === input);

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
            const availableSlots = await getAvailableTimeSlots(tenant, stateData.date);
            const period = groupSlotsIntoPeriods(availableSlots).find((item) => item.id.toLowerCase() === input);

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
            const availableSlots = await getAvailableTimeSlots(tenant, stateData.date);
            const timeSlot = availableSlots.find((slot) => slot.id.toLowerCase() === input);

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

            let booking;

            try {
                booking = await createBooking({
                    tenant,
                    tenant_id,
                    phone,
                    service_name: stateData.service_name,
                    booking_date: stateData.date,
                    booking_time: stateData.time
                });
            } catch (err) {
                if (err instanceof SlotAlreadyBookedError) {
                    await sendMessage({
                        tenant,
                        to: phone,
                        text: "That slot is no longer available. Please choose another time."
                    });

                    return promptTimePeriodSelection({
                        tenant,
                        phone,
                        tenant_id,
                        service_name: stateData.service_name,
                        date: stateData.date
                    });
                }

                throw err;
            }

            await sendMessage({
                tenant,
                to: phone,
                text: `Booking confirmed.\nID: ${booking.id}\nService: ${booking.service_name}\nDate: ${formatDisplayDate(booking.booking_date) || booking.booking_date}\nTime: ${buildTimeSlots(tenant).find((slot) => slot.dbValue === booking.booking_time)?.title || booking.booking_time}`
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

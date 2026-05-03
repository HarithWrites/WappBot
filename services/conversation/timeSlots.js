"use strict";
const { getBookedSlotCounts, getSlotCapacity } = require("../bookingService");

/**
 * Formats a time value into 12-hour AM/PM string.
 * @param {number} hours - Hour in 24-hour format (0-23)
 * @param {number} minutes - Minutes (0-59)
 * @returns {string} e.g. "9:30 AM", "2:00 PM"
 */
function format12Hour(hours, minutes) {
    const meridiem = hours >= 12 ? "PM" : "AM";
    const normalizedHours = hours % 12 || 12;
    return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

/**
 * Generates all possible time slots for a tenant based on opening hours and slot duration.
 * @param {Object} tenant - Tenant config with opening_hour, closing_hour, slot_duration
 * @returns {Array<{id: string, title: string, dbValue: string}>} Array of time slot objects
 */
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

/**
 * Groups a flat list of time slots into Morning / Afternoon / Evening periods.
 * Periods with no available slots are excluded from output.
 * @param {Array} slots - Array of slot objects from buildTimeSlots()
 * @returns {Array<{id, title, startHour, endHour, slots}>} Grouped period objects
 */
function groupSlotsIntoPeriods(slots) {
    const periods = [
        { id: "period_morning",   title: "Morning",   startHour: 0,  endHour: 11 },
        { id: "period_afternoon", title: "Afternoon", startHour: 12, endHour: 16 },
        { id: "period_evening",   title: "Evening",   startHour: 17, endHour: 23 }
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

/**
 * Returns only the time slots that still have capacity for a given booking date.
 * @param {Object} tenant - Tenant object with slot capacity settings
 * @param {string} bookingDate - ISO date string (YYYY-MM-DD)
 * @returns {Promise<Array>} Available (not fully booked) time slots
 */
async function getAvailableTimeSlots(tenant, bookingDate) {
    const slotCounts = await getBookedSlotCounts(tenant.id, bookingDate);
    const capacity = getSlotCapacity(tenant);

    return buildTimeSlots(tenant).filter((slot) => {
        const bookingCount = slotCounts.get(slot.dbValue) || 0;
        return bookingCount < capacity;
    });
}

module.exports = { format12Hour, buildTimeSlots, groupSlotsIntoPeriods, getAvailableTimeSlots };

"use strict";
const { addDays, getDateInTimeZone, toDisplayDate } = require("../../utils/validators");

/**
 * Converts a Date object to a YYYY-MM-DD string (date part only, no time).
 * @param {Date} date - JavaScript Date object
 * @returns {string} ISO date string e.g. "2026-05-04"
 */
function toDateOnlyString(date) {
    return date.toISOString().slice(0, 10);
}

/**
 * Calculates the Monday–Sunday range for the current week in a given timezone.
 * @param {string} timeZone - IANA timezone string e.g. "Asia/Kolkata"
 * @returns {{ start: Date, end: Date }} Week start (Monday) and end (Sunday) as Date objects
 */
function getCurrentWeekRange(timeZone) {
    const today = getDateInTimeZone(timeZone);
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = addDays(today, diffToMonday);
    const end = addDays(start, 6);
    return { start, end };
}

/**
 * Returns up to 4 available booking dates, skipping holidays and week-off days.
 * Dates are calculated relative to today in the tenant's timezone.
 *
 * @param {Object} tenant - Tenant object with timezone, business_holidays, week_offs
 * @param {number[]} [offsets=[1,2,3,4,5,6,7]] - Day offsets from today to consider
 * @param {number[]} [weekOffs=[]] - Day-of-week numbers to skip (0=Sun, 6=Sat)
 * @param {string[]} [holidays=[]] - ISO date strings (YYYY-MM-DD) to skip
 * @returns {Array<{id, title, value}>} List of available date option objects
 */
function getRelativeDateOptions(tenant, offsets = [1, 2, 3, 4, 5, 6, 7], weekOffs = [], holidays = []) {
    const timeZone = tenant?.timezone;
    const holidayList = holidays.length
        ? holidays
        : (Array.isArray(tenant.business_holidays) ? tenant.business_holidays : []);
    const weekOffList = weekOffs.length
        ? weekOffs
        : (Array.isArray(tenant.week_offs) ? tenant.week_offs : []);

    const options = [];

    for (const offset of offsets) {
        const date = addDays(getDateInTimeZone(timeZone), offset);
        const dateStr = toDateOnlyString(date);
        const dayOfWeek = date.getDay();

        if (!holidayList.includes(dateStr) && !weekOffList.includes(dayOfWeek)) {
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

module.exports = { toDateOnlyString, getCurrentWeekRange, getRelativeDateOptions };

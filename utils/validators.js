function pad(value) {
    return String(value).padStart(2, "0");
}

function getTimeZoneOrDefault(timeZone) {
    if (!timeZone) {
        return "UTC";
    }

    try {
        Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
        return timeZone;
    } catch (err) {
        return "UTC";
    }
}

function getDatePartsInTimeZone(date, timeZone) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: getTimeZoneOrDefault(timeZone),
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });

    const parts = formatter.formatToParts(date);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day)
    };
}

function getDateInTimeZone(timeZone, offsetDays = 0) {
    const { year, month, day } = getDatePartsInTimeZone(new Date(), timeZone);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    return date;
}

function toDateOnlyString(date) {
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    return `${year}-${month}-${day}`;
}

function toDisplayDate(date) {
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function normalizeDateInput(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();

        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            const [year, month, day] = trimmed.split("-").map(Number);
            return new Date(year, month - 1, day);
        }

        if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
            const [day, month, year] = trimmed.split("/").map(Number);
            return new Date(year, month - 1, day);
        }

        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    return null;
}

function formatDisplayDate(value) {
    const normalized = normalizeDateInput(value);

    if (!normalized) {
        return "";
    }

    return toDisplayDate(normalized);
}

function addDays(date, days) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    copy.setDate(copy.getDate() + days);
    return copy;
}

function parseDate(input, timeZone) {
    const normalized = input.trim().toLowerCase();
    const today = getDateInTimeZone(timeZone, 0);

    if (normalized === "today") return toDateOnlyString(today);
    if (normalized === "tomorrow") return toDateOnlyString(addDays(today, 1));

    const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;

    const [, d, m, y] = match;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));

    if (
        parsed.getFullYear() !== Number(y) ||
        parsed.getMonth() !== Number(m) - 1 ||
        parsed.getDate() !== Number(d)
    ) {
        return null;
    }

    return toDateOnlyString(parsed);
}

function isValidTime(input) {
    return /^(1[0-2]|[1-9]):([0-5][0-9])\s?(am|pm)$/i.test(input.trim());
}

module.exports = {
    addDays,
    formatDisplayDate,
    getDateInTimeZone,
    isValidTime,
    normalizeDateInput,
    parseDate,
    toDateOnlyString,
    toDisplayDate
};

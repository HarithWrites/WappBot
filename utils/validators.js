function parseDate(input) {
    input = input.toLowerCase();
    const today = new Date();

    if (input === "today") return today;

    if (input === "tomorrow") {
        const t = new Date();
        t.setDate(today.getDate() + 1);
        return t;
    }

    const match = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;

    const [_, d, m, y] = match;
    return new Date(`${y}-${m}-${d}`);
}

function isValidTime(input) {
    return input.match(/^(1[0-2]|[1-9]):([0-5][0-9])\s?(am|pm)$/i);
}

module.exports = { parseDate, isValidTime };
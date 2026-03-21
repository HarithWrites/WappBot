function log(level, message, data = {}) {
    console.log(JSON.stringify({
        level,
        time: new Date().toISOString(),
        message,
        ...data
    }));
}

module.exports = {
    info: (msg, data) => log("INFO", msg, data),
    error: (msg, err) =>
        log("ERROR", msg, {
            error: err?.response?.data || err.message || err
        })
};
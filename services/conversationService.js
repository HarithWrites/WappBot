const db = require("../db");
const { sendMessage } = require("./whatsappService");
const { createBooking } = require("./bookingService");
const { getServices } = require("./serviceService");
const { parseDate, isValidTime } = require("../utils/validators");

// ===============================
// GET STATE
// ===============================
async function getState(phone, tenant_id) {
    const res = await db.query(
        "SELECT * FROM conversation_state WHERE phone=$1 AND tenant_id=$2",
        [phone, tenant_id]
    );
    return res.rows[0];
}

// ===============================
// SAFE UPSERT STATE (FIXED)
// ===============================
async function setState(phone, tenant_id, data) {

    // Get existing state
    const existing = await db.query(
        "SELECT * FROM conversation_state WHERE phone=$1 AND tenant_id=$2",
        [phone, tenant_id]
    );

    const prev = existing.rows[0] || {};

    await db.query(
        `INSERT INTO conversation_state 
        (phone, tenant_id, state, service_name, date, time)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (phone, tenant_id)
        DO UPDATE SET 
            state = EXCLUDED.state,
            service_name = COALESCE(EXCLUDED.service_name, conversation_state.service_name),
            date = COALESCE(EXCLUDED.date, conversation_state.date),
            time = COALESCE(EXCLUDED.time, conversation_state.time)
        `,
        [
            phone,
            tenant_id,
            data.state || prev.state || "SERVICE_SELECTION",
            data.service_name ?? prev.service_name ?? null,
            data.date ?? prev.date ?? null,
            data.time ?? prev.time ?? null
        ]
    );
}

// ===============================
// TIME CONVERSION (12hr → 24hr)
// ===============================
function convertTo24Hour(timeStr) {
    const [time, modifier] = timeStr.split(" ");
    let [hours, minutes] = time.split(":");

    hours = parseInt(hours);

    if (modifier.toLowerCase() === "pm" && hours !== 12) {
        hours += 12;
    }

    if (modifier.toLowerCase() === "am" && hours === 12) {
        hours = 0;
    }

    return `${String(hours).padStart(2, "0")}:${minutes}:00`;
}

// ===============================
// MAIN PROCESS MESSAGE
// ===============================
async function processMessage({ tenant, phone, text }) {

    const tenant_id = tenant.id;
    text = text.trim().toLowerCase();

    // ===============================
    // RESTART
    // ===============================
    if (text === "hi") {

        const services = await getServices(tenant_id);

        let msg = `${tenant.welcome_message}\n\n`;

        services.forEach((s, i) => {
            msg += `${i + 1}. ${s.name}\n`;
        });

        await setState(phone, tenant_id, {
            state: "SERVICE_SELECTION",
            service_name: null,
            date: null,
            time: null
        });

        await sendMessage({ tenant, to: phone, text: msg });
        return;
    }

    let stateData = await getState(phone, tenant_id);
    let state = stateData?.state || "SERVICE_SELECTION";

    // ===============================
    // STATE MACHINE
    // ===============================
    switch (state) {

        // ===============================
        case "SERVICE_SELECTION": {

            const services = await getServices(tenant_id);
            const index = parseInt(text) - 1;

            if (!services[index]) {
                return sendMessage({
                    tenant,
                    to: phone,
                    text: "Invalid choice ❌"
                });
            }

            await setState(phone, tenant_id, {
                state: "DATE_SELECTION",
                service_name: services[index].name
            });

            return sendMessage({
                tenant,
                to: phone,
                text: "Enter date: Today / Tomorrow / DD/MM/YYYY"
            });
        }

        // ===============================
        case "DATE_SELECTION": {

            const date = parseDate(text);

            if (!date) {
                return sendMessage({
                    tenant,
                    to: phone,
                    text: "Invalid date ❌"
                });
            }

            await setState(phone, tenant_id, {
                state: "TIME_SELECTION",
                date
            });

            return sendMessage({
                tenant,
                to: phone,
                text: "Enter time (HH:MM AM/PM)"
            });
        }

        // ===============================
        case "TIME_SELECTION": {

            if (!isValidTime(text)) {
                return sendMessage({
                    tenant,
                    to: phone,
                    text: "Invalid time ❌"
                });
            }

            const dbTime = convertTo24Hour(text);

            await setState(phone, tenant_id, {
                state: "CONFIRMATION",
                time: dbTime
            });

            return sendMessage({
                tenant,
                to: phone,
                text: "Confirm booking? (yes/no)"
            });
        }

        // ===============================
        case "CONFIRMATION": {

            if (text !== "yes") {
                await sendMessage({
                    tenant,
                    to: phone,
                    text: "Cancelled ❌"
                });

                // Proper reset
                await setState(phone, tenant_id, {
                    state: "SERVICE_SELECTION",
                    service_name: null,
                    date: null,
                    time: null
                });

                return;
            }

            // 🔥 CREATE BOOKING
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
                text: `Booking confirmed ✅
ID: ${booking.id}`
            });

            // 🔥 CLEAN RESET (FIXED)
            await setState(phone, tenant_id, {
                state: "SERVICE_SELECTION",
                service_name: null,
                date: null,
                time: null
            });

            return;
        }

        // ===============================
        default:
            await setState(phone, tenant_id, {
                state: "SERVICE_SELECTION"
            });

            return sendMessage({
                tenant,
                to: phone,
                text: "Type 'hi' to restart"
            });
    }
}

module.exports = { processMessage };
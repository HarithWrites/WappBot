const db = require("../db");
const { sendMessage } = require("./whatsappService");
const { createBooking } = require("./bookingService");
const { getServices } = require("./serviceService");
const { parseDate, isValidTime } = require("../utils/validators");

// ===============================
async function getState(phone, tenant_id) {
    const res = await db.query(
        "SELECT * FROM conversation_state WHERE phone=$1 AND tenant_id=$2",
        [phone, tenant_id]
    );
    return res.rows[0];
}

// ===============================
async function setState(phone, tenant_id, data) {
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
function convertTo24Hour(timeStr) {
    const [time, modifier] = timeStr.split(" ");
    let [hours, minutes] = time.split(":");

    hours = parseInt(hours);

    if (modifier.toLowerCase() === "pm" && hours !== 12) hours += 12;
    if (modifier.toLowerCase() === "am" && hours === 12) hours = 0;

    return `${String(hours).padStart(2, "0")}:${minutes}:00`;
}

// ===============================
async function processMessage({ tenant, phone, text }) {

    const tenant_id = tenant.id;

    console.log("STATE INPUT:", { phone, text });

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

        return sendMessage({ tenant, to: phone, text: msg });
    }

    let stateData = await getState(phone, tenant_id);
    let state = stateData?.state || "SERVICE_SELECTION";

    console.log("CURRENT STATE:", state);

    // ===============================
    switch (state) {

        case "SERVICE_SELECTION": {

            const services = await getServices(tenant_id);

            // 🔥 FIX: strict validation
            if (!/^\d+$/.test(text)) {
                return sendMessage({
                    tenant,
                    to: phone,
                    text: "Please enter a valid number ❌"
                });
            }

            const index = parseInt(text) - 1;

            if (index < 0 || index >= services.length) {
                return sendMessage({
                    tenant,
                    to: phone,
                    text: "Invalid choice ❌"
                });
            }

            const selectedService = services[index];

            console.log("Selected service:", selectedService);

            await setState(phone, tenant_id, {
                state: "DATE_SELECTION",
                service_name: selectedService.name
            });

            return sendMessage({
                tenant,
                to: phone,
                text: "Enter date: Today / Tomorrow / DD/MM/YYYY"
            });
        }

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

        case "CONFIRMATION": {

            if (text !== "yes") {
                await sendMessage({
                    tenant,
                    to: phone,
                    text: "Cancelled ❌"
                });

                await setState(phone, tenant_id, {
                    state: "SERVICE_SELECTION",
                    service_name: null,
                    date: null,
                    time: null
                });

                return;
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
                text: `Booking confirmed ✅\nID: ${booking.id}`
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
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
// STRICT STATE UPSERT (FIXED)
// ===============================
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

// ===============================
// TIME CONVERSION
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
// MAIN FLOW
// ===============================
async function processMessage({ tenant, phone, text }) {

    const tenant_id = tenant.id;
    text = text.trim().toLowerCase();

    console.log("INPUT:", { phone, text });

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

    console.log("STATE:", state, stateData);

    // ===============================
    switch (state) {

        // ===============================
        case "SERVICE_SELECTION": {

            const services = await getServices(tenant_id);

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

            await setState(phone, tenant_id, {
                state: "DATE_SELECTION",
                service_name: selectedService.name,
                date: null,
                time: null
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
                service_name: stateData.service_name,
                date,
                time: null
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
                service_name: stateData.service_name,
                date: stateData.date,
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

            // CLEAN RESET
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
                state: "SERVICE_SELECTION",
                service_name: null,
                date: null,
                time: null
            });

            return sendMessage({
                tenant,
                to: phone,
                text: "Type 'hi' to restart"
            });
    }
}

module.exports = { processMessage };
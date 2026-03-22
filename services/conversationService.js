const db = require("../db");
const { sendMessage } = require("./whatsappService");
const { createBooking } = require("./bookingService");

// ===============================
// GET STATE
// ===============================
async function getState(phone) {
    const res = await db.query(
        "SELECT * FROM conversation_state WHERE phone=$1",
        [phone]
    );
    return res.rows[0];
}

// ===============================
// SET / UPSERT STATE
// ===============================
async function setState(phone, data) {
    await db.query(
        `INSERT INTO conversation_state (phone, state, service_id, date, time)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (phone)
         DO UPDATE SET state=$2, service_id=$3, date=$4, time=$5`,
        [
            phone,
            data.state,
            data.service_id || null,
            data.date || null,
            data.time || null
        ]
    );
}

// ===============================
// MAIN PROCESS FUNCTION
// ===============================
async function processMessage(phone, text) {

    // Normalize input
    text = text.trim().toLowerCase();

    // ===============================
    // GLOBAL RESTART (WORKS EVERYWHERE)
    // ===============================
    if (text === "hi") {

        await setState(phone, {
            state: "START",
            service_id: null,
            date: null,
            time: null
        });

        await sendMessage(phone,
`Welcome to ABC Clinic

1 Dental
2 Skin

(Type 'hi' anytime to restart)`);

        return;
    }

    // ===============================
    // GET CURRENT STATE
    // ===============================
    let stateData = await getState(phone);
    let state = stateData?.state || "START";

    // ===============================
    // STATE MACHINE
    // ===============================
    switch (state) {

        // ===============================
        // START
        // ===============================
        case "START":

            await sendMessage(phone,
`Welcome to ABC Clinic

1 Dental
2 Skin

(Type 'hi' anytime to restart)`);

            await setState(phone, { state: "SERVICE_SELECTION" });
            break;

        // ===============================
        // SERVICE SELECTION
        // ===============================
        case "SERVICE_SELECTION":

            if (!["1", "2"].includes(text)) {
                await sendMessage(phone,
`Invalid input ❌

Please choose:
1 Dental
2 Skin

(Type 'hi' to restart)`);

                return;
            }

            await setState(phone, {
                state: "DATE_SELECTION",
                service_id: text
            });

            await sendMessage(phone,
`Enter date (e.g. Tomorrow)

(Type 'hi' to restart)`);

            break;

        // ===============================
        // DATE SELECTION
        // ===============================
        case "DATE_SELECTION":

            if (text.length < 3) {
                await sendMessage(phone,
`Invalid date ❌

Please enter a valid date (e.g. Tomorrow)

(Type 'hi' to restart)`);

                return;
            }

            await setState(phone, {
                ...stateData,
                state: "TIME_SELECTION",
                date: text
            });

            await sendMessage(phone,
`Enter time (e.g. 10 AM)

(Type 'hi' to restart)`);

            break;

        // ===============================
        // TIME SELECTION
        // ===============================
        case "TIME_SELECTION":

            if (!text.match(/^[0-9]{1,2}\s?(am|pm)$/i)) {
                await sendMessage(phone,
`Invalid time ❌

Example: 10 AM or 3 PM

(Type 'hi' to restart)`);

                return;
            }

            await setState(phone, {
                ...stateData,
                state: "CONFIRMATION",
                time: text
            });

            await sendMessage(phone,
`Confirm booking? (yes/no)

(Type 'hi' to restart)`);

            break;

        // ===============================
        // CONFIRMATION
        // ===============================
        case "CONFIRMATION":

            if (!["yes", "no"].includes(text)) {
                await sendMessage(phone,
`Invalid input ❌

Please type yes or no

(Type 'hi' to restart)`);

                return;
            }

            if (text === "yes") {

                await createBooking({
                    phone,
                    service_id: stateData.service_id,
                    date: stateData.date,
                    time: stateData.time
                });

                await sendMessage(phone,
`Booking request sent ✅
Waiting for confirmation

(Type 'hi' to restart)`);

            } else {

                await sendMessage(phone,
`Booking cancelled ❌

(Type 'hi' to restart)`);
            }

            // 🔥 RESET STATE AFTER COMPLETION
            await setState(phone, {
                state: "START",
                service_id: null,
                date: null,
                time: null
            });

            break;

        // ===============================
        // FALLBACK
        // ===============================
        default:

            await sendMessage(phone,
`Type 'hi' to start

(Type 'hi' anytime to restart)`);
    }
}

module.exports = { processMessage };
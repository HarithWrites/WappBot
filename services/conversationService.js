const db = require("../db");
const { sendMessage } = require("./whatsappService");
const { createBooking } = require("./bookingService");

async function getState(phone) {
    const res = await db.query(
        "SELECT * FROM conversation_state WHERE phone=$1",
        [phone]
    );
    return res.rows[0];
}

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

async function processMessage(phone, text) {

    text = text.trim().toLowerCase();

    // GLOBAL RESTART
    if (text === "hi") {

        await setState(phone, {
            state: "SERVICE_SELECTION",
            service_id: null,
            date: null,
            time: null
        });

        await sendMessage(phone,
`Welcome to ABC Clinic

1 Dental
2 Skin

(Type 'hi' to restart)`);

        return;
    }

    let stateData = await getState(phone);
    let state = stateData?.state || "SERVICE_SELECTION";

    switch (state) {

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

            await sendMessage(phone, "Enter date (e.g. Tomorrow)");
            break;

        case "DATE_SELECTION":

            if (text.length < 3) {
                await sendMessage(phone,
`Invalid date ❌

(Type 'hi' to restart)`);
                return;
            }

            await setState(phone, {
                ...stateData,
                state: "TIME_SELECTION",
                date: text
            });

            await sendMessage(phone, "Enter time (e.g. 10 AM)");
            break;

        case "TIME_SELECTION":

            if (!text.match(/^[0-9]{1,2}\s?(am|pm)$/i)) {
                await sendMessage(phone,
`Invalid time ❌

(Type 'hi' to restart)`);
                return;
            }

            await setState(phone, {
                ...stateData,
                state: "CONFIRMATION",
                time: text
            });

            await sendMessage(phone, "Confirm booking? (yes/no)");
            break;

        case "CONFIRMATION":

            if (!["yes", "no"].includes(text)) {
                await sendMessage(phone,
`Invalid input ❌

(Type 'hi' to restart)`);
                return;
            }

            if (text === "yes") {

                const booking = await createBooking({
                    phone,
                    service_id: stateData.service_id,
                    date: stateData.date,
                    time: stateData.time
                });

                await sendMessage(phone,
`Booking request sent ✅
Booking ID: ${booking.id}
Waiting for confirmation`);

            } else {
                await sendMessage(phone, "Booking cancelled ❌");
            }

            await setState(phone, {
                state: "SERVICE_SELECTION",
                service_id: null,
                date: null,
                time: null
            });

            break;

        default:

            await setState(phone, {
                state: "SERVICE_SELECTION"
            });

            await sendMessage(phone,
`Invalid input ❌

(Type 'hi' to restart)`);
    }
}

module.exports = { processMessage };
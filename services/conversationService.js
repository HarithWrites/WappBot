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
        [phone, data.state, data.service_id, data.date, data.time]
    );
}

async function processMessage(phone, text) {
    let stateData = await getState(phone);
    let state = stateData?.state || "START";

    switch (state) {

        case "START":
            await sendMessage(phone,
`Welcome to ABC Clinic

1 Dental
2 Skin`);

            await setState(phone, { state: "SERVICE_SELECTION" });
            break;

        case "SERVICE_SELECTION":
            await setState(phone, {
                state: "DATE_SELECTION",
                service_id: text
            });

            await sendMessage(phone, "Enter date (e.g. Tomorrow)");
            break;

        case "DATE_SELECTION":
            await setState(phone, {
                ...stateData,
                state: "TIME_SELECTION",
                date: text
            });

            await sendMessage(phone, "Enter time (e.g. 10 AM)");
            break;

        case "TIME_SELECTION":
            await setState(phone, {
                ...stateData,
                state: "CONFIRMATION",
                time: text
            });

            await sendMessage(phone, "Confirm booking? (yes/no)");
            break;

        case "CONFIRMATION":
            if (text === "yes") {
                await createBooking({
                    phone,
                    service_id: stateData.service_id,
                    date: stateData.date,
                    time: stateData.time
                });

                await sendMessage(phone,
"Booking request sent. Waiting for confirmation.");

                await setState(phone, { state: "START" });

            } else {
                await sendMessage(phone, "Booking cancelled");
                await setState(phone, { state: "START" });
            }
            break;

        default:
            await sendMessage(phone, "Type 'hi' to start");
    }
}

module.exports = { processMessage };
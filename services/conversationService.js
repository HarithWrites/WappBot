const db = require("../db");
const { sendMessage } = require("./whatsappService");
const { createBooking } = require("./bookingService");
const { getServices } = require("./serviceService");
const { parseDate, isValidTime } = require("../utils/validators");

async function getState(phone, tenant_id) {
    const res = await db.query(
        "SELECT * FROM conversation_state WHERE phone=$1 AND tenant_id=$2",
        [phone, tenant_id]
    );
    return res.rows[0];
}

async function setState(phone, tenant_id, data) {
    await db.query(
        `INSERT INTO conversation_state 
        (phone, tenant_id, state, service_name, date, time)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (phone, tenant_id)
        DO UPDATE SET state=$3, service_name=$4, date=$5, time=$6`,
        [
            phone,
            tenant_id,
            data.state,
            data.service_name || null,
            data.date || null,
            data.time || null
        ]
    );
}

async function processMessage({ tenant, phone, text }) {
    const tenant_id = tenant.id;

    if (text === "hi") {
        const services = await getServices(tenant_id);

        let msg = `${tenant.welcome_message}\n\n`;

        services.forEach((s, i) => {
            msg += `${i + 1}. ${s.name}\n`;
        });

        await setState(phone, tenant_id, { state: "SERVICE_SELECTION" });

        await sendMessage({ tenant, to: phone, text: msg });
        return;
    }

    let stateData = await getState(phone, tenant_id);
    let state = stateData?.state || "SERVICE_SELECTION";

    switch (state) {

        case "SERVICE_SELECTION": {
            const services = await getServices(tenant_id);
            const index = parseInt(text) - 1;

            if (!services[index]) {
                return sendMessage({ tenant, to: phone, text: "Invalid choice ❌" });
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

        case "DATE_SELECTION": {
            const date = parseDate(text);

            if (!date) {
                return sendMessage({ tenant, to: phone, text: "Invalid date ❌" });
            }

            await setState(phone, tenant_id, {
                ...stateData,
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
                return sendMessage({ tenant, to: phone, text: "Invalid time ❌" });
            }

            await setState(phone, tenant_id, {
                ...stateData,
                state: "CONFIRMATION",
                time: text
            });

            return sendMessage({
                tenant,
                to: phone,
                text: "Confirm booking? (yes/no)"
            });
        }

        case "CONFIRMATION": {
            if (text !== "yes") {
                return sendMessage({ tenant, to: phone, text: "Cancelled ❌" });
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
                text: `Booking confirmed ID: ${booking.id}`
            });

            await setState(phone, tenant_id, {
                state: "SERVICE_SELECTION"
            });

            return;
        }
    }
}

module.exports = { processMessage };
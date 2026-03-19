// ===============================
// IMPORT REQUIRED LIBRARIES
// ===============================
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());


// ===============================
// SIMPLE LOGGER FUNCTIONS
// ===============================

// Info log (normal activity)
function logInfo(message, data = {}) {
    console.log(JSON.stringify({
        level: "INFO",
        time: new Date().toISOString(),
        message,
        ...data
    }));
}

// Error log (failures)
function logError(message, error = {}) {
    console.error(JSON.stringify({
        level: "ERROR",
        time: new Date().toISOString(),
        message,
        error: error?.response?.data || error.message || error
    }));
}


// ===============================
// HEALTH CHECK ROUTE
// ===============================

app.get("/", (req, res) => {
    res.send("Chatbot running 🚀");
});


// ===============================
// WEBHOOK VERIFICATION (Meta requirement)
// ===============================

app.get("/webhook", (req, res) => {
    const VERIFY_TOKEN = "my_verify_token"; // MUST match Meta dashboard

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    logInfo("Webhook verification request", { mode, token });

    if (mode && token === VERIFY_TOKEN) {
        logInfo("Webhook verified successfully");
        return res.status(200).send(challenge);
    } else {
        logError("Webhook verification failed");
        return res.sendStatus(403);
    }
});


// ===============================
// MAIN WEBHOOK (RECEIVE MESSAGES)
// ===============================

app.post("/webhook", async (req, res) => {
    try {
        // Log entire incoming request
        logInfo("Incoming webhook", req.body);

        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        // Ignore events without messages (like delivery/read updates)
        if (!value || !value.messages) {
            logInfo("Ignored event (no message)");
            return res.sendStatus(200);
        }

        const message = value.messages[0];

        // Ignore non-text messages (images, status updates etc.)
        if (message.type !== "text") {
            logInfo("Ignored non-text message", { type: message.type });
            return res.sendStatus(200);
        }

        const from = message.from;
        const text = message.text.body.toLowerCase();

        logInfo("User message received", { from, text });

        // ===============================
        // CHATBOT LOGIC
        // ===============================

        if (text === "hi") {

            logInfo("Sending welcome message", { to: from });

            await sendMessage(from,
`Welcome to ABC Clinic

1 Book Appointment
2 Services
3 Contact`);

        } else {

            logInfo("Fallback response triggered", { text });

            await sendMessage(from, "Type 'hi' to start.");
        }

        res.sendStatus(200);

    } catch (err) {
        logError("Webhook processing error", err);
        res.sendStatus(500);
    }
});


// ===============================
// SEND MESSAGE TO WHATSAPP
// ===============================

async function sendMessage(to, text) {

    const TOKEN = process.env.TOKEN;       // From Railway variables
    const PHONE_ID = process.env.PHONE_ID;

    try {
        logInfo("Sending message", { to, text });

        const response = await axios.post(
            `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                text: { body: text }
            },
            {
                headers: {
                    Authorization: `Bearer ${TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        logInfo("Message sent successfully", {
            to,
            messageId: response.data?.messages?.[0]?.id
        });

    } catch (err) {
        logError("Failed to send message", err);
    }
}


// ===============================
// GLOBAL ERROR HANDLING
// ===============================

process.on("uncaughtException", (err) => {
    logError("Uncaught Exception", err);
});

process.on("unhandledRejection", (err) => {
    logError("Unhandled Promise Rejection", err);
});


// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    logInfo("Server started", { port: PORT });
});
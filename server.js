const express = require("express");
require("dotenv").config();

const { ensureDatabaseSchema } = require("./utils/dbInit");

const app = express();

console.log("Server boot started");

app.use(express.json());
app.use(express.static("public"));

app.use("/webhook", require("./routes/webhook"));
app.use("/admin", require("./routes/admin"));

app.get("/health", (req, res) => {
    res.send("OK");
});

process.on("uncaughtException", (err) => {
    console.error("UNCAUGHT:", err);
});

process.on("unhandledRejection", (err) => {
    console.error("UNHANDLED:", err);
});

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await ensureDatabaseSchema();
        console.log("Database schema ready");

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error("Startup failed:", err);
        process.exit(1);
    }
}

startServer();

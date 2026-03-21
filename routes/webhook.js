const express = require("express");
const router = express.Router();
const controller = require("../controllers/webhookController");

router.post("/", controller.handleWebhook);

router.get("/", (req, res) => {
    const VERIFY_TOKEN = "my_verify_token";

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});

module.exports = router;
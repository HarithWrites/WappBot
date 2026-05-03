"use strict";
const db = require("../../db");

/**
 * Retrieves the current conversation state for a given phone number and tenant.
 * @param {string} phone - Customer's WhatsApp phone number (E.164 format)
 * @param {number} tenantId - Tenant's database ID
 * @returns {Promise<Object|null>} Conversation state row, or undefined if not found
 */
async function getState(phone, tenantId) {
    const res = await db.query(
        "SELECT * FROM conversation_state WHERE phone=$1 AND tenant_id=$2",
        [phone, tenantId]
    );
    return res.rows[0];
}

/**
 * Creates or updates the conversation state for a customer.
 * Uses upsert to avoid race conditions on concurrent messages.
 * @param {string} phone - Customer's WhatsApp phone number
 * @param {number} tenantId - Tenant's database ID
 * @param {Object} data - State data to persist
 * @param {string} [data.step] - Current workflow step ID
 * @param {Object} [data.context] - Workflow context (service, date, time, etc.)
 * @param {string} [data.customerName] - Customer's display name
 */
async function setState(phone, tenantId, data = {}) {
    const context = data.context || {};

    await db.query(
        `INSERT INTO conversation_state
        (phone, tenant_id, state, workflow_step, workflow_context, service_name, date, time, customer_name)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (phone, tenant_id)
        DO UPDATE SET
            state = $3,
            workflow_step = $4,
            workflow_context = $5,
            service_name = $6,
            date = $7,
            time = $8,
            customer_name = COALESCE($9, conversation_state.customer_name)
        `,
        [
            phone,
            tenantId,
            data.step || null,
            data.step || null,
            JSON.stringify(context),
            context.service_name || null,
            context.date || null,
            context.time || null,
            data.customerName || context.customer_name || null
        ]
    );
}

/**
 * Asks the customer for their name if not already on record.
 * Saves state as '__collecting_name__' until a valid name is provided.
 * @param {string} phone - Customer's WhatsApp phone number
 * @param {number} tenantId - Tenant's database ID
 * @param {string} businessName - Tenant's display name for welcome message
 * @param {boolean} isGreeting - Whether the triggering message was a greeting
 */
async function promptForName(phone, tenantId, businessName, isGreeting) {
    const welcomeMsg = isGreeting
        ? `👋 Welcome to *${businessName}*!\n\nBefore we get started, may I know your name?`
        : `👋 Hi there! Before we begin booking with *${businessName}*, may I know your name?`;

    await db.query(
        `INSERT INTO conversation_state (phone, tenant_id, state, workflow_step)
         VALUES ($1,$2,'__collecting_name__','__collecting_name__')
         ON CONFLICT (phone, tenant_id) DO UPDATE SET state='__collecting_name__', workflow_step='__collecting_name__'`,
        [phone, tenantId]
    );

    return welcomeMsg;
}

/**
 * Saves the customer's name to their conversation state and clears name-collection step.
 * @param {string} phone - Customer's WhatsApp phone number
 * @param {number} tenantId - Tenant's database ID
 * @param {string} name - Validated customer name to store
 */
async function saveCustomerName(phone, tenantId, name) {
    await db.query(
        `UPDATE conversation_state SET customer_name=$1, workflow_step=NULL, state=NULL WHERE phone=$2 AND tenant_id=$3`,
        [name, phone, tenantId]
    );
}

module.exports = { getState, setState, promptForName, saveCustomerName };

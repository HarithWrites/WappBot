const db = require("../db");

async function getFullWorkflow(tenantId) {
    const res = await db.query(
        `SELECT s.*, 
                COALESCE(
                    json_agg(
                        o.* ORDER BY o.order_index
                    ) FILTER (WHERE o.id IS NOT NULL),
                    '[]'::json
                ) as options
         FROM workflow_steps s
         LEFT JOIN workflow_options o ON s.id = o.step_db_id
         WHERE s.tenant_id = $1
         GROUP BY s.id
         ORDER BY s.order_index`,
        [tenantId]
    );
    return res.rows;
}

async function upsertStep(tenantId, step) {
    const { step_id, kind, question_header, question_body, question_footer, next_step_id, order_index, metadata } = step;
    
    const res = await db.query(
        `INSERT INTO workflow_steps 
         (tenant_id, step_id, kind, question_header, question_body, question_footer, next_step_id, order_index, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (tenant_id, step_id) DO UPDATE SET
            kind = EXCLUDED.kind,
            question_header = EXCLUDED.question_header,
            question_body = EXCLUDED.question_body,
            question_footer = EXCLUDED.question_footer,
            next_step_id = EXCLUDED.next_step_id,
            order_index = EXCLUDED.order_index,
            metadata = EXCLUDED.metadata
         RETURNING *`,
        [tenantId, step_id, kind, question_header, question_body, question_footer, next_step_id, order_index || 0, JSON.stringify(metadata || {})]
    );
    return res.rows[0];
}

async function deleteStep(tenantId, stepId) {
    await db.query("DELETE FROM workflow_steps WHERE tenant_id = $1 AND step_id = $2", [tenantId, stepId]);
}

async function upsertOption(stepDbId, option) {
    const { option_id, title, value, next_step_override, action, description, order_index } = option;
    
    const res = await db.query(
        `INSERT INTO workflow_options 
         (step_db_id, option_id, title, value, next_step_override, action, description, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (step_db_id, option_id) DO UPDATE SET
            title = EXCLUDED.title,
            value = EXCLUDED.value,
            next_step_override = EXCLUDED.next_step_override,
            action = EXCLUDED.action,
            description = EXCLUDED.description,
            order_index = EXCLUDED.order_index
         RETURNING *`,
        [stepDbId, option_id, title, value, next_step_override, action, description, order_index || 0]
    );
    return res.rows[0];
}

// Ensure workflow_options has a unique constraint for the upsert to work reliably
// I'll add this to the plan or dbInit.

async function deleteOption(optionId) {
    await db.query("DELETE FROM workflow_options WHERE id = $1", [optionId]);
}

async function reorderSteps(tenantId, stepIds) {
    await db.query("BEGIN");
    try {
        for (let i = 0; i < stepIds.length; i++) {
            await db.query(
                "UPDATE workflow_steps SET order_index = $1 WHERE tenant_id = $2 AND step_id = $3",
                [i, tenantId, stepIds[i]]
            );
        }
        await db.query("COMMIT");
    } catch (err) {
        await db.query("ROLLBACK");
        throw err;
    }
}

module.exports = {
    getFullWorkflow,
    upsertStep,
    deleteStep,
    upsertOption,
    deleteOption,
    reorderSteps
};

const db = require("../db");

const DEFAULT_WORKFLOW = {
    version: 1,
    start_step: "service",
    steps: [
        {
            id: "service",
            kind: "service",
            question: {
                header: "Book a service",
                body: "Welcome! Choose a service to continue.",
                footer: "Select an option."
            },
            next: "date",
            options: []
        },
        {
            id: "date",
            kind: "date_choice",
            question: {
                header: "Choose a date",
                body: "Pick one date option.",
                footer: "Today or tomorrow"
            },
            next: "time_period",
            options: [
                { id: "today", title: "Today", value: "today", next: "time_period" },
                { id: "tomorrow", title: "Tomorrow", value: "tomorrow", next: "time_period" }
            ]
        }
    ]
};

async function getWorkflowDefinition(tenant) {
    if (!tenant) return DEFAULT_WORKFLOW;

    // 1. Fetch structured steps and options in one query
    const stepsRes = await db.query(
        `SELECT s.*, 
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', o.option_id,
                            'title', o.title,
                            'value', o.value,
                            'next', o.next_step_override,
                            'action', o.action,
                            'description', o.description,
                            'step_id', s.step_id
                        ) ORDER BY o.order_index
                    ) FILTER (WHERE o.id IS NOT NULL),
                    '[]'::json
                ) as options
         FROM workflow_steps s
         LEFT JOIN workflow_options o ON s.id = o.step_db_id
         WHERE s.tenant_id = $1 AND s.is_active = TRUE
         GROUP BY s.id
         ORDER BY s.order_index`,
        [tenant.id]
    );

    // 2. If no steps found, seed with a basic default workflow
    if (stepsRes.rows.length === 0) {
        console.log(`Seeding default workflow for tenant ${tenant.id}...`);
        await seedDefaultWorkflow(tenant.id);
        return await getWorkflowDefinition(tenant);
    }

    // 3. Formulate the response in the format conversationService expects
    return {
        version: 1,
        start_step: stepsRes.rows[0].step_id,
        steps: stepsRes.rows.map(row => ({
            id: row.step_id,
            kind: row.kind,
            question: {
                header: row.question_header,
                body: row.question_body,
                footer: row.question_footer
            },
            next: row.next_step_id,
            options: row.options,
            ...row.metadata
        }))
    };
}

async function seedDefaultWorkflow(tenantId) {
    try {
        await db.query("BEGIN");
        for (let i = 0; i < DEFAULT_WORKFLOW.steps.length; i++) {
            const step = DEFAULT_WORKFLOW.steps[i];
            const stepRes = await db.query(
                `INSERT INTO workflow_steps (tenant_id, step_id, kind, question_header, question_body, question_footer, next_step_id, order_index)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [tenantId, step.id, step.kind, step.question.header, step.question.body, step.question.footer, step.next, i]
            );
            const stepDbId = stepRes.rows[0].id;
            for (let j = 0; j < (step.options || []).length; j++) {
                const opt = step.options[j];
                await db.query(
                    `INSERT INTO workflow_options (step_db_id, option_id, title, value, next_step_override, order_index)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [stepDbId, opt.id, opt.title, opt.value, opt.next, j]
                );
            }
        }
        await db.query("COMMIT");
    } catch (err) {
        await db.query("ROLLBACK");
        console.error("Seeding error:", err);
    }
}

module.exports = {
    getWorkflowDefinition
};

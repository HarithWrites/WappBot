"use strict";
/**
 * workflowController.js
 * Handles CRUD for workflow steps and options in the admin portal.
 */

const { getFullWorkflow, upsertStep, deleteStep, upsertOption, deleteOption, reorderSteps } = require("../../services/workflowAdminService");
const { getTargetTenantId } = require("./helpers");

/**
 * GET /admin/workflow
 * Returns the full workflow definition (steps + options) for the target tenant.
 */
exports.getWorkflow = async (req, res) => {
    try {
        const tenantId = getTargetTenantId(req);
        if (!tenantId) return res.status(400).json({ error: "tenantId required" });
        const result = await getFullWorkflow(tenantId);
        return res.json({ success: true, workflow: result });
    } catch (err) {
        console.error("getWorkflow error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * POST /admin/workflow/step
 * Creates or updates a workflow step for the target tenant.
 */
exports.upsertWorkflowStep = async (req, res) => {
    try {
        const tenantId = getTargetTenantId(req);
        const { step } = req.body;
        if (!tenantId) return res.status(400).json({ error: "tenantId required" });
        const result = await upsertStep(tenantId, step);
        return res.json({ success: true, step: result });
    } catch (err) {
        console.error("upsertWorkflowStep error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * DELETE /admin/workflow/step
 * Permanently deletes a workflow step and its associated options.
 */
exports.deleteWorkflowStep = async (req, res) => {
    try {
        const tenantId = getTargetTenantId(req);
        const { stepId } = req.body;
        if (!tenantId || !stepId) return res.status(400).json({ error: "tenantId and stepId required" });
        await deleteStep(tenantId, stepId);
        return res.json({ success: true });
    } catch (err) {
        console.error("deleteWorkflowStep error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * POST /admin/workflow/reorder
 * Updates the order_index of workflow steps to match the provided stepIds array.
 */
exports.reorderWorkflowSteps = async (req, res) => {
    try {
        const tenantId = getTargetTenantId(req);
        const { stepIds } = req.body;
        if (!tenantId || !stepIds) return res.status(400).json({ error: "tenantId and stepIds required" });
        await reorderSteps(tenantId, stepIds);
        return res.json({ success: true });
    } catch (err) {
        console.error("reorderWorkflowSteps error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * POST /admin/workflow/option
 * Creates or updates an option within an existing workflow step.
 */
exports.upsertWorkflowOption = async (req, res) => {
    try {
        const { stepDbId, option } = req.body;
        if (!stepDbId || !option) return res.status(400).json({ error: "stepDbId and option required" });
        const result = await upsertOption(stepDbId, option);
        return res.json({ success: true, option: result });
    } catch (err) {
        console.error("upsertWorkflowOption error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * DELETE /admin/workflow/option
 * Permanently deletes a single workflow option by its database ID.
 */
exports.deleteWorkflowOption = async (req, res) => {
    try {
        const { optionId } = req.body;
        if (!optionId) return res.status(400).json({ error: "optionId required" });
        await deleteOption(optionId);
        return res.json({ success: true });
    } catch (err) {
        console.error("deleteWorkflowOption error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

"use strict";
/**
 * helpers.js
 * Shared utility functions used across all admin sub-controllers.
 */

/**
 * Resolves the target tenant ID from the request based on admin scope.
 * Global admins can specify any tenantId; tenant-scoped admins are locked to their own.
 * @param {Object} req - Express request with adminScope and tenant properties
 * @returns {number|null} Target tenant ID, or null if not resolved
 */
function getTargetTenantId(req) {
    if (req.adminScope === "global") {
        return Number.parseInt(req.query.tenantId || req.params.tenantId || req.body?.tenantId, 10) || null;
    }
    return req.tenant.id;
}

/**
 * Resolves the scoped tenant ID from the request body for write operations.
 * @param {Object} req - Express request
 * @param {string|number} [bodyTenantId] - Tenant ID from request body
 * @returns {number|null} Scoped tenant ID
 */
function getScopedTenantId(req, bodyTenantId) {
    return req.adminScope === "global"
        ? (Number.parseInt(bodyTenantId, 10) || null)
        : req.tenant.id;
}

module.exports = { getTargetTenantId, getScopedTenantId };

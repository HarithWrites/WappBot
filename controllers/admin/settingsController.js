"use strict";
/**
 * settingsController.js
 * Handles tenant settings, service CRUD, and provider CRUD for the admin portal.
 */

const { getTenantById, updateTenantSettings, getWeekOffs, setWeekOffs, getHolidays, setHolidays } = require("../../services/tenantService");
const { getAllServices, upsertService }     = require("../../services/serviceService");
const { getAllProvidersByTenant, upsertProvider } = require("../../services/providerService");
const { getTargetTenantId, getScopedTenantId }   = require("./helpers");

/**
 * GET /admin/settings
 * Returns full tenant settings including services, providers, week-offs, and holidays.
 */
exports.getSettings = async (req, res) => {
    try {
        const tenantId = getTargetTenantId(req);
        if (!tenantId) return res.status(400).json({ error: "tenantId required" });

        const tenant = await getTenantById(tenantId);
        if (!tenant) return res.status(404).json({ error: "Tenant not found" });

        const [services, providers, weekOffs, holidays] = await Promise.all([
            getAllServices(tenantId),
            getAllProvidersByTenant(tenantId),
            getWeekOffs(tenantId),
            getHolidays(tenantId)
        ]);

        return res.json({
            tenant: { ...tenant, week_offs: weekOffs, business_holidays: holidays },
            services,
            providers
        });
    } catch (err) {
        console.error("getSettings error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * PUT /admin/settings/config
 * Saves tenant configuration, week-offs, and holidays.
 * week_offs and business_holidays are persisted to their own tables.
 */
exports.updateSettingsConfig = async (req, res) => {
    try {
        const { tenantId, settings } = req.body;
        const scopedTenantId = getScopedTenantId(req, tenantId);
        if (!scopedTenantId) return res.status(400).json({ error: "tenantId required" });

        const { week_offs, business_holidays, ...mainSettings } = settings || {};
        const updated = await updateTenantSettings(scopedTenantId, mainSettings);

        if (Array.isArray(week_offs))         await setWeekOffs(scopedTenantId, week_offs);
        if (Array.isArray(business_holidays)) await setHolidays(scopedTenantId, business_holidays);

        return res.json({ success: true, tenant: updated });
    } catch (err) {
        console.error("updateSettingsConfig error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * POST /admin/settings/services
 * Creates or updates a service for the given tenant.
 */
exports.upsertService = async (req, res) => {
    try {
        const { tenantId, service } = req.body;
        const scopedTenantId = getScopedTenantId(req, tenantId);
        if (!scopedTenantId)              return res.status(400).json({ error: "tenantId required" });
        if (!service?.name?.trim())       return res.status(400).json({ error: "service.name required" });

        const result = await upsertService(scopedTenantId, {
            ...service,
            name:      service.name.trim(),
            is_active: service.is_active !== undefined ? service.is_active : true
        });
        return res.json({ success: true, service: result });
    } catch (err) {
        console.error("upsertService error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * POST /admin/settings/providers
 * Creates or updates a service provider for the given tenant.
 */
exports.upsertProvider = async (req, res) => {
    try {
        const { tenantId, provider } = req.body;
        const scopedTenantId = getScopedTenantId(req, tenantId);
        if (!scopedTenantId)              return res.status(400).json({ error: "tenantId required" });
        if (!provider?.name?.trim())      return res.status(400).json({ error: "provider.name required" });

        const result = await upsertProvider(scopedTenantId, {
            ...provider,
            name:      provider.name.trim(),
            is_active: provider.is_active !== undefined ? provider.is_active : true
        });
        return res.json({ success: true, provider: result });
    } catch (err) {
        console.error("upsertProvider error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

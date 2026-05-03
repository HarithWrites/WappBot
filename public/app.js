/**
 * WappBot Admin Portal - Client Application v2.0
 * Premium Enterprise Logic: Accurate Data Binding, Action Flows, Analytics, Settings Confirmation.
 */

// ==========================================
// 1. GLOBAL STATE
// ==========================================
let adminToken     = "";
let portalData     = { scope: "tenant", tenants: [] };
let selectedTenantId = null;
let currentScreen  = "overviewScreen";
let currentFilter  = "all";
let currentPage    = 1;
const PAGE_SIZE    = 15;

let bookingsCache  = [];           // flat cache for current page rows
let bookingsTotal  = 0;
let closeBookingMeta = null;       // { id, tenantId, action }
let currentSettingHolidays = [];
let workflowStepsData = [];
let stream         = null;

// Pending settings-save callback (resolved after confirmation)
let pendingSaveCallback = null;

// ==========================================
// 2. DOM REFS
// ==========================================
let els = {};

function updateDomRefs() {
    els = {
        // Screens
        loginScreen:         document.getElementById("loginScreen"),
        dashboardShell:      document.getElementById("dashboardShell"),
        loginForm:           document.getElementById("loginForm"),
        tenantInput:         document.getElementById("tenantId"),
        loginStatus:         document.getElementById("loginStatus"),
        logoutButton:        document.getElementById("logoutButton"),
        tenantName:          document.getElementById("tenantName"),
        connectionStatusText:document.getElementById("connectionStatusText"),
        connectionStatusDot: document.getElementById("connectionStatusDot"),
        overviewStatus:      document.getElementById("overviewStatus"),
        tenantOverviewList:  document.getElementById("tenantOverviewList"),
        overviewTenantCount: document.getElementById("overviewTenantCount"),
        screenButtons:       document.querySelectorAll("[data-screen-target]"),
        screens:             document.querySelectorAll(".workspace-screen"),

        // Bookings
        bookingsTableBody:   document.getElementById("bookingsTableBody"),
        dashboardEmpty:      document.getElementById("dashboardEmpty"),
        bookingsStatus:      document.getElementById("bookingsStatus"),
        searchInput:         document.getElementById("searchInput"),
        dateInput:           document.getElementById("dateFilter"),
        tenantFilter:        document.getElementById("tenantFilter"),
        prevPageButton:      document.getElementById("prevPageButton"),
        nextPageButton:      document.getElementById("nextPageButton"),
        pageLabel:           document.getElementById("pageLabel"),

        // Settings
        holidayList:             document.getElementById("holidayList"),
        weekOffsContainer:       document.getElementById("weekOffsContainer"),
        settingsPanes:           document.querySelectorAll(".settings-pane"),
        settingsTabs:            document.querySelectorAll(".settings-nav-pills .pill"),

        // Action Modal
        actionModal:             document.getElementById("actionModal"),
        actionModalSurface:      document.getElementById("actionModalSurface"),
        actionModalLabel:        document.getElementById("actionModalLabel"),
        actionModalTitle:        document.getElementById("actionModalTitle"),
        actionForm:              document.getElementById("actionForm"),
        actionRemarks:           document.getElementById("actionRemarks"),
        actionModalDismiss:      document.getElementById("actionModalDismiss"),
        actionModalCancel:       document.getElementById("actionModalCancel"),
        actionSubmitButton:      document.getElementById("actionSubmitButton"),
        remarksWrap:             document.getElementById("remarksWrap"),
        remarksLabel:            document.getElementById("remarksLabel"),

        // Booking summary fields
        summaryPhone:    document.getElementById("summaryPhone"),
        summaryService:  document.getElementById("summaryService"),
        summaryDate:     document.getElementById("summaryDate"),
        summaryTime:     document.getElementById("summaryTime"),
        summaryProvider: document.getElementById("summaryProvider"),

        // Confirm Dialog
        confirmDialog:       document.getElementById("confirmDialog"),
        confirmDialogTitle:  document.getElementById("confirmDialogTitle"),
        confirmDialogMsg:    document.getElementById("confirmDialogMsg"),
        confirmDialogCancel: document.getElementById("confirmDialogCancel"),
        confirmDialogOk:     document.getElementById("confirmDialogOk"),
    };
}

// ==========================================
// 3. AUTH
// ==========================================
function saveToken(token) {
    adminToken = token;
    localStorage.setItem("adminToken", token);
}

function clearToken() {
    adminToken = "";
    localStorage.removeItem("adminToken");
    closeStream();
    showLogin();
}

function handleUnauthorized(duringLogin = false) {
    if (duringLogin) {
        // During login, just clear the token — don't redirect yet
        adminToken = "";
        return;
    }
    clearToken();
    showLogin("Session expired. Please re-authenticate.");
}

function showLogin(msg = "") {
    els.loginScreen?.classList.remove("hidden");
    els.dashboardShell?.classList.add("hidden");
    if (msg && els.loginStatus) els.loginStatus.textContent = msg;
}

function showDashboard() {
    els.loginScreen?.classList.add("hidden");
    els.dashboardShell?.classList.remove("hidden");
}

function getSelectedTenant() {
    if (!portalData.tenants.length) return null;
    return portalData.tenants.find(t => String(t.id) === String(selectedTenantId)) || portalData.tenants[0];
}

// ==========================================
// 4. API HELPER
// ==========================================
async function fetchJson(url, options = {}, isLoginAttempt = false) {
    const headers = {
        ...options.headers,
        "Authorization": `Bearer ${adminToken}`,
        "Content-Type": "application/json"
    };
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401 || res.status === 403) {
        if (isLoginAttempt) {
            throw new Error("InvalidCredentials");
        }
        handleUnauthorized();
        throw new Error("Unauthorized");
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
}

// ==========================================
// 5. PORTAL REFRESH
// ==========================================
async function refreshPortal(silent = false) {
    if (!adminToken) return;
    try {
        await loadPortalData(silent);
        await loadBookings(silent);
        showDashboard();

        if (currentScreen === "workflowScreen")   loadWorkflowData();
        else if (currentScreen === "settingsScreen")  loadSettings();
        else if (currentScreen === "analyticsScreen") loadAnalytics();

        initStream();
    } catch (err) {
        console.error("Portal Refresh Failed:", err);
        if (err.message === "Unauthorized") handleUnauthorized();
    }
}

// ==========================================
// 6. PORTAL DATA (OVERVIEW)
// ==========================================
async function loadPortalData(silent = false) {
    if (!silent && els.overviewStatus) els.overviewStatus.textContent = "Syncing accounts...";
    const data = await fetchJson("/admin/portal-data");

    portalData = {
        scope:   data.scope || "tenant",
        tenants: Array.isArray(data.tenants) ? data.tenants : []
    };

    if (!selectedTenantId && portalData.tenants.length) {
        selectedTenantId = String(portalData.tenants[0].id);
    }

    updateHeaderUI();
    renderTenantOverview();
    populateTenantSelectors();
    await loadOverviewStats();
}

async function loadOverviewStats() {
    // Fetch bookings totals to populate overview stats
    try {
        const ranges = ["today", "this_week", "this_month", "all"];
        const ids = ["statToday", "statThisWeek", "statThisMonth", "statTotal"];

        const fetches = ranges.map(range =>
            fetchJson(`/admin/bookings?page=1&pageSize=1&range=${range}`).catch(() => ({ total: 0 }))
        );
        const results = await Promise.all(fetches);

        results.forEach((r, i) => {
            const el = document.getElementById(ids[i]);
            if (el) el.textContent = r.total ?? 0;
        });

        // Trend for today vs yesterday (best-effort)
        const todayEl = document.getElementById("trendToday");
        if (todayEl && results[0]?.total !== undefined) {
            todayEl.textContent = results[0].total > 0 ? "Active bookings today" : "No bookings yet today";
        }
    } catch (err) {
        console.warn("Stats load failed:", err);
    }
}

// ==========================================
// 7. BOOKINGS
// ==========================================
async function loadBookings(silent = false) {
    if (!silent && els.bookingsStatus) els.bookingsStatus.textContent = "Loading bookings...";

    const params = new URLSearchParams({
        page:     currentPage,
        pageSize: PAGE_SIZE,
        status:   currentFilter === "all" ? "" : currentFilter,
        date:     els.dateInput?.value || "",
        tenantId: els.tenantFilter?.value || "",
        search:   els.searchInput?.value || ""
    });

    try {
        const data = await fetchJson(`/admin/bookings?${params}`);
        bookingsCache = data.items || [];
        bookingsTotal = data.total || 0;
        renderBookingsTable();
        updatePaginationUI(data);
    } catch (err) {
        if (err.message !== "Unauthorized" && els.bookingsStatus)
            els.bookingsStatus.textContent = "Failed to load bookings.";
    }
}

function updatePaginationUI(data) {
    const totalPages = Math.max(1, Math.ceil(bookingsTotal / PAGE_SIZE));
    if (els.pageLabel)      els.pageLabel.textContent = `Page ${currentPage} / ${totalPages}`;
    if (els.prevPageButton) els.prevPageButton.disabled = currentPage <= 1;
    if (els.nextPageButton) els.nextPageButton.disabled = currentPage >= totalPages;
}

// ==========================================
// 8. BOOKINGS TABLE RENDERER
// ==========================================
function renderBookingsTable() {
    if (!els.bookingsTableBody) return;
    els.bookingsTableBody.innerHTML = "";

    if (!bookingsCache.length) {
        els.dashboardEmpty?.classList.remove("hidden");
        if (els.bookingsStatus) els.bookingsStatus.textContent = "No records match your filters.";
        return;
    }

    els.dashboardEmpty?.classList.add("hidden");
    if (els.bookingsStatus) els.bookingsStatus.textContent = `Showing ${bookingsCache.length} of ${bookingsTotal} bookings`;

    bookingsCache.forEach(b => {
        const tr = document.createElement("tr");
        const dateStr = b.booking_date ? new Date(b.booking_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—";

        // Determine which buttons are disabled based on current status
        const isConfirmed = b.status === "confirmed";
        const isRejected  = b.status === "rejected";
        const isClosed    = b.status === "closed";
        const disableApprove = isConfirmed || isClosed || isRejected;
        const disableReject  = isRejected  || isClosed;
        const disableWaiting = isClosed    || isConfirmed;
        const disableClose   = isClosed;

        tr.innerHTML = `
            <td class="col-tenant">
                <div class="cell-primary truncate" title="${b.tenant_name || 'N/A'}">${b.tenant_name || 'N/A'}</div>
                <div class="cell-sub">ID:${b.tenant_id}</div>
            </td>
            <td class="col-service">
                <div class="truncate" title="${b.service_name || '—'}" style="font-size:0.78rem;font-weight:500">${b.service_name || '—'}</div>
                <div class="cell-sub truncate" title="${b.provider_name || ''}">${b.provider_name || '—'}</div>
            </td>
            <td class="col-contact">
                <div class="cell-mono truncate">${b.phone || '—'}</div>
            </td>
            <td class="col-name">
                <div class="truncate" style="font-size:0.78rem">${b.customer_name ? escHtml(b.customer_name) : '<span style="color:var(--text-faint)">—</span>'}</div>
            </td>
            <td class="col-schedule">
                <div style="font-size:0.78rem;font-weight:500">${dateStr}</div>
                <div class="cell-sub">${b.booking_time || '—'}</div>
            </td>
            <td class="col-status">
                <span class="status-badge ${b.status || 'pending'}">${b.status || 'pending'}</span>
            </td>
            <td class="col-actions">
                <div class="action-btn-group">
                    <button class="action-icon-btn approve" title="Approve"
                        onclick="openActionModal('${b.id}','${b.tenant_id}','approve',this)"
                        ${disableApprove ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                    <button class="action-icon-btn reject" title="Reject"
                        onclick="openActionModal('${b.id}','${b.tenant_id}','reject',this)"
                        ${disableReject ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                    <button class="action-icon-btn waiting" title="Set Waiting"
                        onclick="openActionModal('${b.id}','${b.tenant_id}','waiting',this)"
                        ${disableWaiting ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </button>
                    <button class="action-icon-btn archive" title="Close"
                        onclick="openActionModal('${b.id}','${b.tenant_id}','close',this)"
                        ${disableClose ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                    </button>
                </div>
            </td>
        `;
        els.bookingsTableBody.appendChild(tr);
    });
}

// ==========================================
// 9. ACTION MODAL (Approve / Reject / Waiting / Close)
// ==========================================
const ACTION_CONFIG = {
    approve: {
        label:   "Approve Booking",
        title:   "Confirm Approval",
        btnText: "✓ Approve & Notify",
        btnClass:"primary",
        cssClass:"modal-approve",
        requiresRemarks: false,
        remarksLabel:    "Optional note for customer"
    },
    reject: {
        label:   "Reject Booking",
        title:   "Confirm Rejection",
        btnText: "✗ Reject & Notify",
        btnClass:"primary",
        cssClass:"modal-reject",
        requiresRemarks: true,
        remarksLabel:    "Reason for rejection (required)"
    },
    waiting: {
        label:   "Set Waiting",
        title:   "Place On Waitlist",
        btnText: "⏳ Confirm Waiting",
        btnClass:"primary",
        cssClass:"modal-waiting",
        requiresRemarks: false,
        remarksLabel:    "Optional message to customer"
    },
    close: {
        label:   "Close Booking",
        title:   "Archive Booking",
        btnText: "Archive & Notify",
        btnClass:"primary",
        cssClass:"modal-close",
        requiresRemarks: true,
        remarksLabel:    "Closure remarks (required)"
    }
};

window.openActionModal = (bookingId, tenantId, action, triggerBtn) => {
    const cfg = ACTION_CONFIG[action];
    if (!cfg || !els.actionModal) return;

    // Store meta
    closeBookingMeta = { bookingId, tenantId, action };

    // Find booking row data from cache
    const b = bookingsCache.find(x => String(x.id) === String(bookingId)) || {};

    // Configure modal appearance
    els.actionModalSurface.className = `modal-surface panel-card ${cfg.cssClass}`;
    if (els.actionModalLabel) els.actionModalLabel.textContent = cfg.label;
    if (els.actionModalTitle) els.actionModalTitle.textContent = cfg.title;
    if (els.actionSubmitButton) els.actionSubmitButton.textContent = cfg.btnText;
    if (els.actionRemarks) els.actionRemarks.value = "";

    // Remarks field
    if (els.remarksLabel) els.remarksLabel.textContent = cfg.remarksLabel;
    if (els.remarksWrap) {
        els.remarksWrap.style.display = "";
        els.actionRemarks.required = cfg.requiresRemarks;
        els.actionRemarks.placeholder = cfg.requiresRemarks
            ? "Required — please provide a reason..."
            : "Optional notes for the customer...";
    }

    // Populate booking summary
    const dateStr = b.booking_date ? new Date(b.booking_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—";
    if (els.summaryPhone)    els.summaryPhone.textContent    = b.phone || "—";
    const summaryName = document.getElementById("summaryName");
    if (summaryName)         summaryName.textContent         = b.customer_name || "—";
    if (els.summaryService)  els.summaryService.textContent  = b.service_name || "—";
    if (els.summaryDate)     els.summaryDate.textContent     = dateStr;
    if (els.summaryTime)     els.summaryTime.textContent     = b.booking_time || "—";
    if (els.summaryProvider) els.summaryProvider.textContent = b.provider_name || "—";

    // Show modal
    els.actionModal.classList.remove("hidden");
    els.actionRemarks?.focus();
};

function closeActionModal() {
    els.actionModal?.classList.add("hidden");
    closeBookingMeta = null;
    if (els.actionRemarks) els.actionRemarks.value = "";
}

async function submitBookingAction(e) {
    e.preventDefault();
    if (!closeBookingMeta) return;

    const { bookingId, tenantId, action } = closeBookingMeta;
    const remarks = els.actionRemarks?.value.trim() || "";
    const cfg = ACTION_CONFIG[action];

    // Validate required remarks
    if (cfg.requiresRemarks && !remarks) {
        showToast(`${cfg.label}: remarks are required`, "error");
        els.actionRemarks?.focus();
        return;
    }

    // Disable submit during processing
    if (els.actionSubmitButton) {
        els.actionSubmitButton.disabled = true;
        els.actionSubmitButton.innerHTML = `<span class="loader-ring" style="width:14px;height:14px;border-width:2px"></span> Processing...`;
    }

    const ENDPOINT_MAP = { approve: "approve", reject: "reject", waiting: "waiting", close: "close" };

    try {
        await fetchJson(`/admin/${ENDPOINT_MAP[action]}`, {
            method: "POST",
            body: JSON.stringify({ bookingId, tenantId, remarks, comment: remarks })
        });

        closeActionModal();
        const actionLabels = { approve: "approved", reject: "rejected", waiting: "set to waiting", close: "closed" };
        showToast(`Booking ${actionLabels[action] || action} — WhatsApp notification sent to customer`, "success");
        await loadBookings(true);
        await loadOverviewStats();
    } catch (err) {
        showToast(`Action failed: ${err.message}`, "error");
    } finally {
        if (els.actionSubmitButton) {
            els.actionSubmitButton.disabled = false;
            els.actionSubmitButton.textContent = cfg?.btnText || "Confirm";
        }
    }
}

// ==========================================
// 10. ANALYTICS
// ==========================================
async function loadAnalytics() {
    const tenant = getSelectedTenant();
    if (!tenant) { showToast("Select a tenant first", "warning"); return; }

    const grid = document.getElementById("analyticsMetricsGrid");
    if (grid) grid.innerHTML = `<div style="padding:32px;text-align:center;grid-column:1/-1"><span class="loader-ring"></span></div>`;

    try {
        const data = await fetchJson(`/admin/analytics?tenantId=${tenant.id}`);

        // ── Summary metric cards ──
        setEl("metricConversations", data.totalConversations ?? "—");
        setEl("metricBookings",      data.totalBookings ?? "—");
        setEl("metricConversion",    data.conversionRate !== undefined ? `${data.conversionRate}%` : "—");
        setEl("metricPopular",       data.popularService || "—");
        setEl("metricMsgSent",       data.messagesSent ?? "—");
        setEl("metricAvgResponse",   data.pendingBookings !== undefined ? `${data.pendingBookings} pending` : "—");
        setEl("statActiveSessions",  data.activeUsers ?? "—");
        setEl("statAvgResponse",     data.bookingsToday ?? "—");
        setEl("statSuccessRate",     data.bookingsThisWeek !== undefined ? `${data.bookingsThisWeek} this week` : "—");

        // ── Build enhanced analytics panel ──
        if (grid) {
            const growth = data.monthlyGrowthPct !== null && data.monthlyGrowthPct !== undefined
                ? `<span style="color:${data.monthlyGrowthPct >= 0 ? 'var(--mint-400)' : 'var(--coral-400)'}">${data.monthlyGrowthPct >= 0 ? '↑' : '↓'}${Math.abs(data.monthlyGrowthPct)}% vs last month</span>`
                : `<span style="color:var(--text-faint)">No comparison data</span>`;

            const statusBreakdown = data.bookingsByStatus || {};
            const statusHtml = Object.entries(statusBreakdown).map(([st, cnt]) =>
                `<div class="metric-card" style="padding:12px 16px">
                    <h4 style="text-transform:capitalize">${st}</h4>
                    <p style="font-size:1.4rem">${cnt}</p>
                 </div>`
            ).join("");

            const topServicesHtml = (data.topServices || []).map((s, i) =>
                `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-soft)">
                    <span style="width:20px;height:20px;border-radius:50%;background:var(--primary-glow);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:var(--primary)">${i+1}</span>
                    <span style="flex:1;font-size:0.82rem;font-weight:500">${escHtml(s.service_name)}</span>
                    <span style="font-size:0.82rem;font-weight:700;color:var(--primary)">${s.count}</span>
                 </div>`
            ).join("") || `<p style="color:var(--text-faint);font-size:0.8rem;padding:8px 0">No data yet</p>`;

            const topCustomersHtml = (data.topCustomers || []).map((c, i) =>
                `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-soft)">
                    <span style="width:20px;height:20px;border-radius:50%;background:rgba(96,165,250,0.1);display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:var(--sky-400)">${i+1}</span>
                    <span style="flex:1;font-size:0.82rem;font-weight:500">${escHtml(c.customer)}</span>
                    <span style="font-size:0.82rem;font-weight:700;color:var(--sky-400)">${c.count} bookings</span>
                 </div>`
            ).join("") || `<p style="color:var(--text-faint);font-size:0.8rem;padding:8px 0">No customer data yet</p>`;

            grid.innerHTML = `
                <div class="metric-card">
                    <h4>Total Conversations</h4>
                    <p>${data.totalConversations ?? "—"}</p>
                </div>
                <div class="metric-card">
                    <h4>Total Bookings</h4>
                    <p>${data.totalBookings ?? "—"}</p>
                    <p class="metric-sub">${growth}</p>
                </div>
                <div class="metric-card">
                    <h4>Conversion Rate</h4>
                    <p>${data.conversionRate !== undefined ? data.conversionRate + "%" : "—"}</p>
                    <p class="metric-sub">chat → booking</p>
                </div>
                <div class="metric-card">
                    <h4>Popular Service</h4>
                    <p style="font-size:0.95rem">${escHtml(data.popularService || "N/A")}</p>
                </div>
                <div class="metric-card">
                    <h4>Today's Bookings</h4>
                    <p>${data.bookingsToday ?? "—"}</p>
                </div>
                <div class="metric-card">
                    <h4>This Week</h4>
                    <p>${data.bookingsThisWeek ?? "—"}</p>
                </div>
                <div class="metric-card">
                    <h4>This Month</h4>
                    <p>${data.bookingsThisMonth ?? "—"}</p>
                </div>
                <div class="metric-card">
                    <h4>Peak Hour</h4>
                    <p style="font-size:0.95rem">${data.peakHour || "N/A"}</p>
                </div>
                <div class="metric-card">
                    <h4>Pending Review</h4>
                    <p style="color:var(--amber-400)">${data.pendingBookings ?? "—"}</p>
                </div>
                <div class="metric-card">
                    <h4>Messages Processed</h4>
                    <p>${data.messagesReceived ?? "—"}</p>
                </div>
                ${statusHtml}
            `;

            // Extra panels below the grid
            const extras = document.getElementById("analyticsExtras");
            if (extras) {
                extras.innerHTML = `
                    <div class="panel-card" style="margin-top:16px;padding:20px">
                        <div class="panel-header"><h3>Top Services</h3></div>
                        <div style="margin-top:12px">${topServicesHtml}</div>
                    </div>
                    <div class="panel-card" style="margin-top:16px;padding:20px">
                        <div class="panel-header"><h3>Top Customers</h3></div>
                        <div style="margin-top:12px">${topCustomersHtml}</div>
                    </div>
                `;
            }
        }

        // ── Booking trend chart (14-day) ──
        renderBarChart(data.engagementTrends || [], "engagementBarChart");

        // ── Day of week chart ──
        renderBarChart(data.bookingsByDayOfWeek || [], "dowBarChart");

        // ── Hourly chart ──
        renderBarChart(data.bookingsByHour || [], "hourlyBarChart");

    } catch (err) {
        if (grid) grid.innerHTML = `<div style="padding:32px;text-align:center;grid-column:1/-1;color:var(--coral-400)"><p>⚠️ Failed to load analytics. <button onclick="loadAnalytics()" class="secondary compact">Retry</button></p></div>`;
        showToast("Analytics sync failed", "error");
    }
}

function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function renderBarChart(trends, containerId = "engagementBarChart") {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!trends.length) {
        container.innerHTML = `<div class="placeholder-visual"><p>No data available yet.</p></div>`;
        return;
    }

    const max = Math.max(...trends.map(t => t.count || 0), 1);
    container.innerHTML = trends.map(t => {
        const pct = Math.max(4, Math.round(((t.count || 0) / max) * 100));
        return `
            <div class="bar-col">
                <div class="bar-value">${t.count || 0}</div>
                <div class="bar-fill" style="height:${pct}%"></div>
                <div class="bar-label">${t.label || ''}</div>
            </div>
        `;
    }).join("");
}

// ==========================================
// 11. SETTINGS — with Confirmation Dialog
// ==========================================
async function loadSettings() {
    const tenant = getSelectedTenant();
    if (!tenant) return;

    try {
        const data = await fetchJson(`/admin/settings?tenantId=${tenant.id}`);
        // API returns { tenant, services, providers }
        const s = data.tenant || {};

        safeSetVal("timezoneInput",     s.timezone     || "Asia/Kolkata");
        safeSetVal("slotDurationInput", s.slot_duration || 30);
        safeSetVal("openingHourInput",  s.opening_hour  !== undefined ? s.opening_hour : 9);
        safeSetVal("closingHourInput",  s.closing_hour  !== undefined ? s.closing_hour : 21);
        safeSetVal("phoneNumberIdInput",s.phone_number_id || "");
        safeSetVal("appSecretInput",    s.app_secret   || "");

        currentSettingHolidays = Array.isArray(s.business_holidays) ? [...s.business_holidays] : [];
        renderHolidays();
        renderWeekOffs(Array.isArray(s.week_offs) ? s.week_offs : []);
        renderServicesTable(data.services || []);
        renderProvidersTable(data.providers || []);
    } catch (err) {
        showToast(`Settings load error: ${err.message}`, "error");
    }
}

function safeSetVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? "";
}

function renderHolidays() {
    const list = document.getElementById("holidayList");
    if (!list) return;
    if (!currentSettingHolidays.length) {
        list.innerHTML = `<li style="color:var(--text-faint);font-size:0.78rem;padding:8px 0">No holidays configured.</li>`;
        return;
    }
    list.innerHTML = currentSettingHolidays.map((h, i) => `
        <li class="exclusion-tag">
            <span>${h}</span>
            <button onclick="removeExclusion(${i})" title="Remove">×</button>
        </li>
    `).join("");
}

function renderWeekOffs(offs) {
    const container = document.getElementById("weekOffsContainer");
    if (!container) return;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    container.innerHTML = days.map((d, i) => `
        <label class="day-chip">
            <input type="checkbox" value="${i}" ${offs.includes(i) ? "checked" : ""}>
            <span>${d}</span>
        </label>
    `).join("");
}

function renderServicesTable(services) {
    const tbody = document.getElementById("servicesSettingsTableBody");
    if (!tbody) return;
    tbody.innerHTML = services.length ? services.map(s => `
        <tr>
            <td class="cell-sub">${s.id}</td>
            <td><input type="text" class="form-input compact service-name" value="${escHtml(s.name)}" data-id="${s.id}"></td>
            <td>
                <button class="secondary compact toggle-active" data-id="${s.id}" data-type="service" data-active="${s.is_active ? '1' : '0'}"
                    style="min-width:72px;color:${s.is_active ? 'var(--mint-400)' : 'var(--coral-400)'}">
                    ${s.is_active ? '✓ Active' : '✗ Inactive'}
                </button>
            </td>
            <td><button class="secondary compact" onclick="saveService('${s.id}')">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Save
            </button></td>
        </tr>
    `).join("") : `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.8rem">No services found.</td></tr>`;

    // Wire up toggle buttons
    tbody.querySelectorAll(".toggle-active[data-type='service']").forEach(btn => {
        btn.addEventListener("click", () => {
            const isActive = btn.dataset.active === "1";
            btn.dataset.active = isActive ? "0" : "1";
            btn.textContent = isActive ? "✗ Inactive" : "✓ Active";
            btn.style.color = isActive ? "var(--coral-400)" : "var(--mint-400)";
        });
    });
}

function renderProvidersTable(providers) {
    const tbody = document.getElementById("providersSettingsTableBody");
    if (!tbody) return;
    tbody.innerHTML = providers.length ? providers.map(p => `
        <tr>
            <td class="cell-sub">${p.id}</td>
            <td><input type="text" class="form-input compact provider-name" value="${escHtml(p.name)}" data-id="${p.id}"></td>
            <td class="cell-sub">${p.service_name || '—'}</td>
            <td>
                <button class="secondary compact toggle-active" data-id="${p.id}" data-type="provider" data-active="${p.is_active ? '1' : '0'}"
                    style="min-width:72px;color:${p.is_active ? 'var(--mint-400)' : 'var(--coral-400)'}">
                    ${p.is_active ? '✓ Active' : '✗ Inactive'}
                </button>
            </td>
            <td><button class="secondary compact" onclick="saveProvider('${p.id}')">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Save
            </button></td>
        </tr>
    `).join("") : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.8rem">No providers found.</td></tr>`;

    // Wire up toggle buttons
    tbody.querySelectorAll(".toggle-active[data-type='provider']").forEach(btn => {
        btn.addEventListener("click", () => {
            const isActive = btn.dataset.active === "1";
            btn.dataset.active = isActive ? "0" : "1";
            btn.textContent = isActive ? "✗ Inactive" : "✓ Active";
            btn.style.color = isActive ? "var(--coral-400)" : "var(--mint-400)";
        });
    });
}

// ── Save functions (with confirmation dialog) ──

function showConfirmDialog(title, msg, onConfirm) {
    if (!els.confirmDialog) { onConfirm(); return; }
    if (els.confirmDialogTitle) els.confirmDialogTitle.textContent = title;
    if (els.confirmDialogMsg)   els.confirmDialogMsg.textContent   = msg;
    pendingSaveCallback = onConfirm;
    els.confirmDialog.classList.remove("hidden");
}

async function saveGeneralSettings() {
    const tenant = getSelectedTenant();
    if (!tenant) return showToast("Select a business first", "error");

    showConfirmDialog(
        "Save General Settings?",
        `This will update timezone, slot duration and WhatsApp credentials for "${tenant.business_name}".`,
        async () => {
            const payload = {
                timezone:        document.getElementById("timezoneInput")?.value.trim(),
                slot_duration:   parseInt(document.getElementById("slotDurationInput")?.value) || 30,
                phone_number_id: document.getElementById("phoneNumberIdInput")?.value.trim(),
                app_secret:      document.getElementById("appSecretInput")?.value.trim() || undefined
            };
            await saveSettingsConfig(payload);
        }
    );
}

async function saveScheduleSettings() {
    const tenant = getSelectedTenant();
    if (!tenant) return showToast("Select a business first", "error");

    showConfirmDialog(
        "Save Schedule Settings?",
        `This will update business hours, weekly days off and holidays for "${tenant.business_name}".`,
        async () => {
            const weekOffs = Array.from(document.querySelectorAll("#weekOffsContainer input:checked")).map(cb => parseInt(cb.value));
            const payload = {
                opening_hour:      parseInt(document.getElementById("openingHourInput")?.value) || 9,
                closing_hour:      parseInt(document.getElementById("closingHourInput")?.value) || 21,
                week_offs:         weekOffs,
                business_holidays: currentSettingHolidays
            };
            await saveSettingsConfig(payload);
        }
    );
}

async function saveSettingsConfig(settings) {
    try {
        await fetchJson("/admin/settings/config", {
            method: "PUT",
            body: JSON.stringify({ tenantId: selectedTenantId, settings })
        });
        showToast("✓ Settings saved successfully", "success");
        // Re-load to confirm persistence
        setTimeout(() => loadSettings(), 600);
    } catch (err) {
        showToast(`Save failed: ${err.message}`, "error");
    }
}

window.removeExclusion = (i) => { currentSettingHolidays.splice(i, 1); renderHolidays(); };

window.saveService = async (id) => {
    const input = document.querySelector(`.service-name[data-id="${id}"]`);
    const toggleBtn = document.querySelector(`.toggle-active[data-type='service'][data-id="${id}"]`);
    if (!input) return;
    const isActive = toggleBtn ? toggleBtn.dataset.active === "1" : true;
    try {
        await fetchJson("/admin/settings/services", {
            method: "POST",
            body: JSON.stringify({ tenantId: selectedTenantId, service: { id, name: input.value.trim(), is_active: isActive } })
        });
        showToast(`Service "${input.value.trim()}" updated`, "success");
        loadSettings(); // Reload to sync badges
    } catch (err) {
        showToast(`Service save failed: ${err.message}`, "error");
    }
};

window.saveProvider = async (id) => {
    const input = document.querySelector(`.provider-name[data-id="${id}"]`);
    const toggleBtn = document.querySelector(`.toggle-active[data-type='provider'][data-id="${id}"]`);
    if (!input) return;
    const isActive = toggleBtn ? toggleBtn.dataset.active === "1" : true;
    try {
        await fetchJson("/admin/settings/providers", {
            method: "POST",
            body: JSON.stringify({ tenantId: selectedTenantId, provider: { id, name: input.value.trim(), is_active: isActive } })
        });
        showToast(`Provider "${input.value.trim()}" updated`, "success");
        loadSettings();
    } catch (err) {
        showToast(`Provider save failed: ${err.message}`, "error");
    }
};

// ==========================================
// 12. WORKFLOW
// ==========================================
async function loadWorkflowData() {
    const container = document.getElementById("workflowStepsList");
    const title     = document.getElementById("workflowEditorTitle");
    const tenant    = getSelectedTenant();
    if (!tenant) return;

    if (title) title.textContent = `Workflow: ${tenant.business_name}`;
    if (container) container.innerHTML = `<div style="padding:32px;text-align:center"><span class="loader-ring"></span></div>`;

    try {
        const data = await fetchJson(`/admin/workflow?tenantId=${tenant.id}`);
        workflowStepsData = data.workflow || [];
        renderWorkflowCards();
    } catch (err) {
        showToast("Workflow load failed", "error");
    }
}

function renderWorkflowCards() {
    const container = document.getElementById("workflowStepsList");
    if (!container) return;

    if (!workflowStepsData.length) {
        container.innerHTML = `<div class="editor-empty"><p>No workflow nodes found. Click "+ Add Node" to create the first step.</p></div>`;
        return;
    }

    container.innerHTML = workflowStepsData
        .slice().sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
        .map(s => `
        <div class="workflow-step-card" data-step-id="${s.step_id}">
            <div class="card-head">
                <span class="step-order">#${s.order_index}</span>
                <span class="step-kind-badge">${(s.kind || "message").toUpperCase()}</span>
                <div class="card-controls">
                    <button class="icon-btn-sm" onclick="saveWorkflowNode('${s.step_id}')" title="Save node">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    </button>
                    <button class="icon-btn-sm danger" onclick="deleteWorkflowNode('${s.step_id}')" title="Delete node">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </div>
            </div>
            <div class="card-body">
                <label>Step ID</label>
                <input type="text" class="node-id-input" value="${escHtml(s.step_id)}" readonly>
                <label>Header / Title</label>
                <input type="text" class="node-header" value="${escHtml(s.question_header || '')}" placeholder="Message header...">
                <label>Body / Message</label>
                <textarea class="node-body" rows="3" placeholder="Message body...">${escHtml(s.question_body || '')}</textarea>
                <label>Next Step ID</label>
                <input type="text" class="node-next" value="${escHtml(s.next_step_id || '')}" placeholder="Step ID or leave blank for end">
            </div>
        </div>
    `).join("");
}

window.saveWorkflowNode = async (id) => {
    const card = document.querySelector(`[data-step-id="${id}"]`);
    if (!card) return;

    const payload = {
        step_id:         id,
        question_header: card.querySelector(".node-header")?.value.trim() || "",
        question_body:   card.querySelector(".node-body")?.value.trim()   || "",
        next_step_id:    card.querySelector(".node-next")?.value.trim()   || null
    };

    try {
        await fetchJson("/admin/workflow/step", {
            method: "POST",
            body: JSON.stringify({ tenantId: selectedTenantId, step: payload })
        });
        showToast("Workflow node saved", "success");
    } catch (err) {
        showToast("Node save failed", "error");
    }
};

window.deleteWorkflowNode = async (id) => {
    if (!confirm(`Delete workflow step "${id}"? This cannot be undone.`)) return;
    try {
        await fetchJson("/admin/workflow/step", {
            method: "DELETE",
            body: JSON.stringify({ tenantId: selectedTenantId, stepId: id })
        });
        showToast("Node deleted", "success");
        loadWorkflowData();
    } catch (err) {
        showToast("Delete failed", "error");
    }
};

async function addNewWorkflowStep() {
    const tenant = getSelectedTenant();
    if (!tenant) return showToast("Select a business first", "error");

    const stepId = `step_${Date.now()}`;
    const nextOrder = (workflowStepsData.length > 0)
        ? Math.max(...workflowStepsData.map(s => s.order_index || 0)) + 1
        : 1;

    try {
        await fetchJson("/admin/workflow/step", {
            method: "POST",
            body: JSON.stringify({
                tenantId: selectedTenantId,
                step: { step_id: stepId, question_header: "New Step", question_body: "", next_step_id: null, order_index: nextOrder, kind: "message" }
            })
        });
        showToast("New node added", "success");
        loadWorkflowData();
    } catch (err) {
        showToast("Could not add node", "error");
    }
}

// ==========================================
// 13. UI HELPERS
// ==========================================
function updateHeaderUI() {
    const selected = getSelectedTenant();
    if (els.tenantName) {
        els.tenantName.textContent = portalData.scope === "global"
            ? "Global Control"
            : (selected?.business_name || "Enterprise Control");
    }

    // Hide Workflow section for tenant-scoped users
    const workflowBtns = document.querySelectorAll(".workflow-nav-btn");
    const workflowScreen = document.getElementById("workflowScreen");
    if (portalData.scope === "tenant") {
        workflowBtns.forEach(b => b.style.display = "none");
        if (workflowScreen) workflowScreen.style.display = "none";
        // If currently on workflow screen, go to overview
        if (currentScreen === "workflowScreen") setActiveScreen("overviewScreen");
    } else {
        workflowBtns.forEach(b => b.style.display = "");
        if (workflowScreen) workflowScreen.style.display = "";
    }
}

function renderTenantOverview() {
    if (!els.tenantOverviewList) return;
    if (!portalData.tenants.length) {
        els.tenantOverviewList.innerHTML = `<p style="color:var(--text-muted);font-size:0.8rem;padding:16px">No business accounts found.</p>`;
    } else {
        els.tenantOverviewList.innerHTML = portalData.tenants.map(t => `
            <article class="tenant-node-card" onclick="selectTenantAndGo('${t.id}')">
                <div class="node-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </div>
                <div class="node-info">
                    <h4>${escHtml(t.business_name || 'Business')}</h4>
                    <p>ID: ${t.id} · ${t.timezone || 'UTC'}</p>
                </div>
            </article>
        `).join("");
    }

    if (els.overviewTenantCount) els.overviewTenantCount.textContent = `${portalData.tenants.length} Active`;
    if (els.overviewStatus) els.overviewStatus.textContent = "All accounts synced.";
}

window.selectTenantAndGo = (id) => {
    selectedTenantId = String(id);
    setActiveScreen("bookingsScreen");
    if (els.tenantFilter) els.tenantFilter.value = id;
    loadBookings();
};

function populateTenantSelectors() {
    const optionsHtml = `<option value="">All Businesses</option>` +
        portalData.tenants.map(t => `<option value="${t.id}">${escHtml(t.business_name)}</option>`).join("");

    if (els.tenantFilter) els.tenantFilter.innerHTML = optionsHtml;

    const commSelect = document.getElementById("commTenantSelect");
    if (commSelect) commSelect.innerHTML = optionsHtml;

    const listHtml = portalData.tenants.map(t => `
        <button class="v-list-item ${String(t.id) === String(selectedTenantId) ? "active" : ""}"
            onclick="selectLocalTenant('${t.id}')">
            ${escHtml(t.business_name)}
        </button>
    `).join("");

    const flowList = document.getElementById("tenantListWorkflow");
    const settList = document.getElementById("tenantListSettings");
    if (flowList) flowList.innerHTML = listHtml;
    if (settList) settList.innerHTML = listHtml;
}

window.selectLocalTenant = (id) => {
    selectedTenantId = String(id);
    populateTenantSelectors();
    if (currentScreen === "workflowScreen") loadWorkflowData();
    else if (currentScreen === "settingsScreen") loadSettings();
};

function setActiveScreen(id) {
    currentScreen = id;
    els.screens?.forEach(s => s.classList.toggle("hidden", s.id !== id));
    els.screenButtons?.forEach(b => b.classList.toggle("active", b.dataset.screenTarget === id));
}

function escHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ==========================================
// 14. REALTIME STREAM
// ==========================================
function initStream() {
    if (stream && stream.readyState === EventSource.OPEN) return;
    closeStream();

    const url = `/admin/bookings/stream?token=${adminToken}`;
    stream = new EventSource(url);

    stream.onopen = () => {
        if (els.connectionStatusDot) els.connectionStatusDot.className = "status-dot online";
        if (els.connectionStatusText) els.connectionStatusText.textContent = "Live";
    };
    stream.onerror = () => {
        if (els.connectionStatusDot) els.connectionStatusDot.className = "status-dot offline";
        if (els.connectionStatusText) els.connectionStatusText.textContent = "Reconnecting...";
    };
    stream.onmessage = (e) => {
        try {
            const event = JSON.parse(e.data);
            if (event.type === "connected") return;
            showToast(`New activity: ${event.type}`, "info");
            if (currentScreen === "bookingsScreen" || currentScreen === "overviewScreen") {
                refreshPortal(true);
            }
        } catch {}
    };
}

function closeStream() {
    if (stream) { stream.close(); stream = null; }
}

// ==========================================
// 15. TOAST NOTIFICATIONS
// ==========================================
const TOAST_ICONS = {
    success: "✓",
    error:   "✕",
    info:    "ℹ",
    warning: "⚠"
};

function showToast(msg, type = "success") {
    const c = document.getElementById("toastContainer");
    if (!c) return;
    const div = document.createElement("div");
    div.className = `toast-item ${type}`;
    div.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] || "•"}</span><span class="toast-msg">${msg}</span>`;
    c.appendChild(div);
    setTimeout(() => {
        div.classList.add("fade-out");
        setTimeout(() => div.remove(), 400);
    }, 4500);
}

// ==========================================
// 16. INITIALIZATION
// ==========================================
function initApp() {
    updateDomRefs();

    // ── Login ──
    els.loginForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const token = els.tenantInput?.value.trim();
        if (!token) return;
        const btn = document.getElementById("loginButton");
        if (btn) { btn.disabled = true; btn.innerHTML = `<span class="loader-ring" style="width:14px;height:14px;border-width:2px"></span> Authenticating...`; }
        adminToken = token;
        try {
            // Pass isLoginAttempt=true so 401 throws meaningful error instead of redirecting
            const data = await fetchJson("/admin/portal-data", {}, true);
            portalData = data;
            saveToken(token);
            await refreshPortal();
        } catch (err) {
            if (btn) { btn.disabled = false; btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Unlock Portal`; }
            const msg = err.message === "InvalidCredentials" ? "Invalid token. Please try again." : `Error: ${err.message}`;
            if (els.loginStatus) {
                els.loginStatus.textContent = msg;
                els.loginStatus.style.color = "var(--coral-400)";
            }
            adminToken = "";
        }
    });

    // ── Login show/hide token ──
    document.getElementById("loginShowToken")?.addEventListener("click", () => {
        const inp = document.getElementById("tenantId");
        if (inp) inp.type = inp.type === "password" ? "text" : "password";
    });

    // ── Logout ──
    els.logoutButton?.addEventListener("click", (e) => { e.preventDefault(); clearToken(); });

    // ── Navigation ──
    els.screenButtons?.forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const id = btn.dataset.screenTarget;
            setActiveScreen(id);
            if (id === "workflowScreen")       loadWorkflowData();
            else if (id === "settingsScreen")  loadSettings();
            else if (id === "analyticsScreen") loadAnalytics();
            else if (id === "bookingsScreen")  loadBookings();
            else if (id === "overviewScreen")  loadOverviewStats();
        });
    });

    // ── Bookings Filters ──
    document.querySelectorAll("#bookingsScreen .filter-segments .pill")?.forEach(pill => {
        pill.addEventListener("click", () => {
            currentFilter = pill.dataset.filter;
            currentPage   = 1;
            document.querySelectorAll("#bookingsScreen .filter-segments .pill").forEach(p => p.classList.toggle("active", p === pill));
            loadBookings();
        });
    });

    // ── Search (debounced) ──
    let searchTimeout;
    els.searchInput?.addEventListener("input", () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { currentPage = 1; loadBookings(); }, 500);
    });

    // ── Date & Tenant Filters ──
    els.dateInput?.addEventListener("change",   () => { currentPage = 1; loadBookings(); });
    els.tenantFilter?.addEventListener("change", () => { currentPage = 1; loadBookings(); });

    // ── Clear Filters ──
    document.getElementById("clearButton")?.addEventListener("click", () => {
        if (els.searchInput) els.searchInput.value = "";
        if (els.dateInput)   els.dateInput.value   = "";
        if (els.tenantFilter) els.tenantFilter.value = "";
        currentFilter = "all";
        currentPage   = 1;
        document.querySelectorAll("#bookingsScreen .filter-segments .pill").forEach(p => p.classList.toggle("active", p.dataset.filter === "all"));
        loadBookings();
    });

    // ── Pagination ──
    document.getElementById("prevPageButton")?.addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadBookings(); } });
    document.getElementById("nextPageButton")?.addEventListener("click", () => { currentPage++; loadBookings(); });

    // ── Action Modal ──
    els.actionModalDismiss?.addEventListener("click", closeActionModal);
    els.actionModalCancel?.addEventListener("click",  closeActionModal);
    els.actionForm?.addEventListener("submit", submitBookingAction);
    els.actionModal?.addEventListener("click", (e) => { if (e.target === els.actionModal) closeActionModal(); });

    // ── Confirm Dialog ──
    els.confirmDialogCancel?.addEventListener("click", () => {
        els.confirmDialog?.classList.add("hidden");
        pendingSaveCallback = null;
    });
    els.confirmDialogOk?.addEventListener("click", async () => {
        els.confirmDialog?.classList.add("hidden");
        if (pendingSaveCallback) {
            await pendingSaveCallback();
            pendingSaveCallback = null;
        }
    });

    // ── Settings Tabs ──
    els.settingsTabs?.forEach(tab => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.tab;
            els.settingsTabs.forEach(t  => t.classList.toggle("active", t === tab));
            els.settingsPanes?.forEach(p => p.classList.toggle("hidden", p.id !== `${target}SettingsPane`));
        });
    });

    // ── Settings Save Buttons ──
    document.getElementById("saveGeneralSettings")?.addEventListener("click", (e) => { e.preventDefault(); saveGeneralSettings(); });
    document.getElementById("saveScheduleSettings")?.addEventListener("click", (e) => { e.preventDefault(); saveScheduleSettings(); });

    // ── App Secret toggle ──
    document.getElementById("toggleAppSecret")?.addEventListener("click", () => {
        const inp = document.getElementById("appSecretInput");
        if (inp) inp.type = inp.type === "password" ? "text" : "password";
    });

    // ── Holiday Add ──
    document.getElementById("addHolidayBtn")?.addEventListener("click", () => {
        const input = document.getElementById("holidayInput");
        const val = input?.value;
        if (val && !currentSettingHolidays.includes(val)) {
            currentSettingHolidays.push(val);
            renderHolidays();
            input.value = "";
        }
    });

    // ── Workflow Buttons ──
    document.getElementById("addNewStepButton")?.addEventListener("click", addNewWorkflowStep);
    document.getElementById("refreshWorkflowButton")?.addEventListener("click", loadWorkflowData);

    // ── Refresh Buttons ──
    document.getElementById("refreshGlobalButton")?.addEventListener("click", () => refreshPortal(false));
    document.getElementById("refreshOverviewButton")?.addEventListener("click", () => loadPortalData(false));
    document.getElementById("refreshBookingsButton")?.addEventListener("click", () => loadBookings(false));
    document.getElementById("refreshAnalyticsButton")?.addEventListener("click", loadAnalytics);
    document.getElementById("refreshSettingsButton")?.addEventListener("click", loadSettings);
    document.getElementById("refreshCommunicationsButton")?.addEventListener("click", loadMessages);

    // ── Communications ──
    document.getElementById("messageType")?.addEventListener("change", (e) => {
        const phoneWrap = document.getElementById("targetPhoneWrap");
        if (phoneWrap) phoneWrap.style.display = e.target.value === "target" ? "" : "none";
    });
    document.getElementById("messageForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const content = document.getElementById("messageContent")?.value.trim();
        const messageType = document.getElementById("messageType")?.value;
        const targetPhone = document.getElementById("targetPhone")?.value.trim();
        const commTenant = document.getElementById("commTenantSelect")?.value;
        const submitBtn = document.getElementById("broadcastSubmitBtn");
        const statusEl = document.getElementById("broadcastStatus");

        if (!content) return showToast("Message content is empty", "error");
        if (messageType === "target" && !targetPhone) return showToast("Please enter a target phone number", "error");

        // Confirm before sending broadcast
        const confirmMsg = messageType === "broadcast"
            ? "Send this message to ALL your contacts? This cannot be undone."
            : `Send message to ${targetPhone}?`;
        if (!confirm(confirmMsg)) return;

        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = `<span class="loader-ring" style="width:13px;height:13px;border-width:2px"></span> Sending...`; }
        if (statusEl) { statusEl.style.display = ""; statusEl.textContent = "Sending..."; statusEl.style.color = "var(--text-muted)"; }

        try {
            const body = {
                tenantId: commTenant || selectedTenantId,
                message: content
            };
            if (messageType === "target" && targetPhone) body.targetPhone = targetPhone;

            const result = await fetchJson("/admin/broadcast", {
                method: "POST",
                body: JSON.stringify(body)
            });

            const sentMsg = `✓ Sent to ${result.sent} contact${result.sent === 1 ? "" : "s"}${result.failed > 0 ? ` (${result.failed} failed)` : ""}`;
            if (statusEl) { statusEl.textContent = sentMsg; statusEl.style.color = "var(--mint-400)"; }
            showToast(sentMsg, "success");
            document.getElementById("messageContent").value = "";
        } catch (err) {
            if (statusEl) { statusEl.textContent = `✕ Failed: ${err.message}`; statusEl.style.color = "var(--coral-400)"; }
            showToast(`Broadcast failed: ${err.message}`, "error");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Message`;
            }
        }
    });

    // ── Theme Picker ──
    const themes = [
        { id: "midnight-amber", icon: "🌑" },
        { id: "daylight",       icon: "☀️" },
        { id: "aurora",         icon: "🌌" },
        { id: "sunset",         icon: "🌅" }
    ];
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    const themePalette   = document.getElementById("themePalette");

    function applyTheme(themeId) {
        document.body.setAttribute("data-theme", themeId);
        localStorage.setItem("adminTheme", themeId);
        // Update active swatch
        document.querySelectorAll(".theme-swatch").forEach(s => {
            s.classList.toggle("active", s.dataset.theme === themeId);
        });
        // Do NOT overwrite the toggle button content (it has an SVG icon)
    }

    themeToggleBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        themePalette?.classList.toggle("hidden");
    });

    document.querySelectorAll(".theme-swatch").forEach(swatch => {
        swatch.addEventListener("click", () => {
            applyTheme(swatch.dataset.theme);
            themePalette?.classList.add("hidden");
        });
    });

    // Close palette if clicking outside
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#themePickerWrap")) {
            themePalette?.classList.add("hidden");
        }
    });

    // ── Restore Session ──
    const saved = localStorage.getItem("adminToken");
    if (saved) {
        adminToken = saved;
        if (els.tenantInput) els.tenantInput.value = saved;
        refreshPortal();
    } else {
        showLogin();
    }

    // ── Apply Saved Theme ──
    const savedTheme = localStorage.getItem("adminTheme") || "midnight-amber";
    applyTheme(savedTheme);
}

async function loadMessages() {
    try {
        const tenant = getSelectedTenant();
        if (!tenant) return;
        const data = await fetchJson(`/admin/messages?tenantId=${tenant.id}`);
        const tbody = document.getElementById("messagesTableBody");
        if (!tbody) return;
        if (!Array.isArray(data) || !data.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);font-size:0.8rem">No messages on record yet.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.map(m => `
            <tr>
                <td><span class="status-badge ${m.type || 'info'}">${m.type || 'broadcast'}</span></td>
                <td class="truncate" style="max-width:220px" title="${escHtml(m.preview || '')}">${escHtml(m.preview || '—')}</td>
                <td class="cell-sub">${m.sent_at ? new Date(m.sent_at).toLocaleString() : '—'}</td>
                <td><span class="status-badge ${m.status === 'sent' ? 'confirmed' : 'pending'}">${m.status || 'pending'}</span></td>
            </tr>
        `).join("");
    } catch {}
}

// ── Boot ──
document.addEventListener("DOMContentLoaded", initApp);

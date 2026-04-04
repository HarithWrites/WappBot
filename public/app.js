// ==========================================
// 1. STATE & CONFIGURATION
// ==========================================
let adminToken = "";
let stream = null;
let streamTenantToken = null;
let portalData = { scope: "tenant", tenants: [] };
let selectedTenantId = null;
let currentFilter = "all";
let currentRange = "all";
let currentPage = 1;
let pageSize = 14;
let currentScreen = "overviewScreen";
let summaryCounts = {
    today: 0,
    this_week: 0,
    this_month: 0,
    all: 0,
};
let bookingsResponse = {
    items: [],
    total: 0,
    page: 1,
    pageSize
};
let closeBookingMeta = null;

// ==========================================
// 2. DOM ELEMENTS
// ==========================================
const loginScreen = document.getElementById("loginScreen");
const dashboardShell = document.getElementById("dashboardShell");
const loginForm = document.getElementById("loginForm");
const tenantInput = document.getElementById("tenantId");
const loginStatus = document.getElementById("loginStatus");
const logoutButton = document.getElementById("logoutButton");
const tenantName = document.getElementById("tenantName");
const connectionStatus = document.getElementById("connectionStatus");
const overviewStatus = document.getElementById("overviewStatus");
const homeConnectionLabel = document.getElementById("homeConnectionLabel");
const tenantOverviewList = document.getElementById("tenantOverviewList");
const overviewTenantCount = document.getElementById("overviewTenantCount");
const screenButtons = document.querySelectorAll("[data-screen-target]");
const screens = document.querySelectorAll(".workspace-screen");
const refreshOverviewButton = document.getElementById("refreshOverviewButton");
const refreshBookingsButton = document.getElementById("refreshBookingsButton");
const bookingsTableBody = document.getElementById("bookingsTableBody");
const dashboardEmpty = document.getElementById("dashboardEmpty");
const bookingsStatus = document.getElementById("bookingsStatus");
const searchInput = document.getElementById("searchInput");
const dateInput = document.getElementById("dateFilter");
const tenantFilter = document.getElementById("tenantFilter");
const prevPageButton = document.getElementById("prevPageButton");
const nextPageButton = document.getElementById("nextPageButton");
const pageLabel = document.getElementById("pageLabel");
const closeModal = document.getElementById("closeModal");
const closeForm = document.getElementById("closeForm");
const closeRemarks = document.getElementById("closeRemarks");
const closeModalDismiss = document.getElementById("closeModalDismiss");
const closeModalSummary = document.getElementById("closeModalSummary");

// ==========================================
// 3. UTILITIES & HELPERS
// ==========================================
function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function normalizeDateValue(value) {
    if (!value) {
        return "";
    }

    const raw = String(value);
    return raw.includes("T") ? raw.slice(0, 10) : raw;
}

function normalizeTimeValue(value) {
    if (!value) {
        return "";
    }

    const raw = String(value);
    if (raw.includes("T")) {
        const timePart = raw.split("T")[1] || "";
        return timePart.replace("Z", "").slice(0, 8);
    }

    return raw.slice(0, 8);
}

function formatDisplayDate(dateString) {
    const normalizedDate = normalizeDateValue(dateString);
    if (!normalizedDate) {
        return "No date";
    }

    const date = new Date(`${normalizedDate}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return normalizedDate;
    }

    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date);
}

function formatDisplayTime(timeString) {
    const normalizedTime = normalizeTimeValue(timeString);
    const [hours, minutes] = normalizedTime.split(":");

    if (hours == null || minutes == null) {
        return normalizedTime || "No time";
    }

    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0, 0);

    if (Number.isNaN(date.getTime())) {
        return normalizedTime || "No time";
    }

    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function safeJsonParse(value, fallback = null) {
    try {
        return JSON.parse(value);
    } catch (err) {
        console.error("JSON Parse Error:", err.message);
        return { _error: err.message };
    }
}

function formatWorkflowConfig(value) {
    return JSON.stringify(value || {}, null, 2);
}

function getSelectedTenant() {
    if (!portalData.tenants.length) {
        return null;
    }

    return portalData.tenants.find((tenant) => String(tenant.id) === String(selectedTenantId))
        || portalData.tenants[0];
}

function getTenantLabel(tenant) {
    return tenant?.business_name || `Tenant ${tenant?.id || ""}`;
}

function formatWorkflowAnswers(answers) {
    if (!answers || typeof answers !== "object") {
        return "No extra answers";
    }

    const lines = Object.entries(answers).map(([key, value]) => {
        if (value && typeof value === "object") {
            return `${key}: ${value.title || value.value || value.option_id || "-"}`;
        }

        return `${key}: ${value}`;
    });

    return lines.length ? lines.join("\n") : "No extra answers";
}

function customizeSingleTenantUI() {
    if (portalData.scope === "global") return;
    
    // Find specific elements to remove/change (b, d, e, g, l)
    document.querySelectorAll('h2, h3, p, span').forEach(el => { // Exclude 'div' to prevent over-hiding
        // Prevent modifying/hiding large parent layout containers by skipping elements that have children
        // This check is less critical if 'div' is excluded, but still good for other tags
        if (el.children.length > 0 && el.tagName !== 'SPAN') return; // Allow spans with children (e.g., status badges)
        if (!el.textContent) return;
        const text = el.textContent.trim();
        
        // Remove "Bookings" header from its section
        if (text === 'Bookings') {
            el.style.display = 'none';
            return;
        }

        // g: Remove booking operation descriptions
        if (text.includes('Booking operations') || text.includes('Compact, paginated tables for high-volume booking operations across statuses and tenants.')) el.style.display = 'none';
        
        // l: Remove operations snapshot descriptions
        if (text.includes('Operations snapshot') || text.includes('Monitor all booking queues, tenant coverage, and live portal status at a glance.')) el.style.display = 'none';
    });

    // h. Move refresh button next to sign out button
    if (refreshBookingsButton && logoutButton && logoutButton.parentNode) {
        logoutButton.parentNode.insertBefore(refreshBookingsButton, logoutButton);
    }

    // i. Hide the tenant filter entirely
    if (tenantFilter) tenantFilter.style.display = 'none';

    // 1c & 1d. Layout for search bar, date picker, clear button, and toggles
    const bookingsScreen = document.getElementById('bookingsScreen');
    const controlsBar = bookingsScreen?.querySelector('.controls-bar');

    if (controlsBar) {
        // Ensure controlsBar is a flex container for proper alignment
        controlsBar.style.display = 'flex';
        controlsBar.style.justifyContent = 'space-between'; // Distribute space between items
        controlsBar.style.alignItems = 'center';
        controlsBar.style.flexWrap = 'wrap'; // Allow wrapping on smaller screens
        controlsBar.style.gap = '15px'; // Add some gap between main sections

        // Create or get toggle group (middle)
        let toggleGroup = document.querySelector('.date-toggles');
        if (!toggleGroup) {
            toggleGroup = document.createElement("div");
            toggleGroup.className = "date-toggles";
            toggleGroup.style.display = "flex";
            toggleGroup.style.gap = "5px";

            ['today', 'tomorrow', 'future', 'past'].forEach(range => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = `pill ${currentRange === range ? 'active' : ''}`;
                btn.textContent = range.charAt(0).toUpperCase() + range.slice(1);
                btn.dataset.range = range;
                
                btn.addEventListener("click", async () => {
                    currentRange = range;
                    currentFilter = "all";
                    if (dateInput) {
                        dateInput.value = "";
                        if (dateInput.type === "date") dateInput.type = "text";
                    }
                    
                    toggleGroup.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    currentPage = 1;
                    await loadBookings();
                });
                toggleGroup.appendChild(btn);
            });
            controlsBar.appendChild(toggleGroup); // Temporarily append
        } else {
            toggleGroup.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b.dataset.range === currentRange));
        }

        // Create or get search wrapper (right)
        let searchWrapper = document.getElementById('rightSearchWrapper');
        if (!searchWrapper) {
            searchWrapper = document.createElement('div');
            searchWrapper.id = 'rightSearchWrapper';
            searchWrapper.style.display = 'flex';
            searchWrapper.style.gap = '10px';
            searchWrapper.style.alignItems = 'center';
            
            // Move existing search elements into this wrapper if they are still in controlsBar
            if (searchInput && searchInput.parentElement === controlsBar) searchWrapper.appendChild(searchInput);
            if (dateInput && dateInput.parentElement === controlsBar) searchWrapper.appendChild(dateInput);
            const clearBtn = document.getElementById('clearButton');
            if (clearBtn && clearBtn.parentElement === controlsBar) searchWrapper.appendChild(clearBtn);
            
            controlsBar.appendChild(searchWrapper); // Temporarily append
        }

        // Final re-ordering of children in controlsBar: toggleGroup, searchWrapper
        const childrenInOrder = [];
        if (toggleGroup) childrenInOrder.push(toggleGroup);
        if (searchWrapper) childrenInOrder.push(searchWrapper);

        // Clear and re-append to ensure correct order
        controlsBar.innerHTML = ''; // Clear existing children
        childrenInOrder.forEach(child => controlsBar.appendChild(child));
    }
}

// ==========================================
// 4. AUTH & SESSION MANAGEMENT
// ==========================================
function saveToken(token) {
    adminToken = token;
    localStorage.setItem("adminToken", token);
}

function clearToken() {
    adminToken = "";
    localStorage.removeItem("adminToken");
    tenantInput.value = "";
}

function handleUnauthorized() {
    clearToken();
    showLogin("Your session expired or the token was invalid. Sign in again to continue.");
}

function showLogin(message = "Your token stays saved on this browser until you sign out.") {
    closeStream();
    closeCloseModal();
    portalData = { scope: "tenant", tenants: [] };
    selectedTenantId = null;
    bookingsResponse = { items: [], total: 0, page: 1, pageSize };
    summaryCounts = { today: 0, this_week: 0, this_month: 0, all: 0 };
    render();
    loginScreen.classList.remove("hidden");
    dashboardShell.classList.add("hidden");
    loginStatus.textContent = message;
    tenantInput.focus();
}

function showDashboard() {
    loginScreen.classList.add("hidden");
    dashboardShell.classList.remove("hidden");
}

// ==========================================
// 5. API SERVICE (Data & URLs)
// ==========================================
function getTokenQuery() {
    const params = new URLSearchParams();
    params.set("token", adminToken);
    return params;
}

function buildPortalDataUrl() {
    return `/admin/portal-data?${getTokenQuery().toString()}`;
}

function buildBookingsUrl() {
    const params = getTokenQuery();
    const selectedTenant = tenantFilter.value || "";

    if (selectedTenant) {
        params.set("tenantId", selectedTenant);
    }

    if (currentFilter && currentFilter !== "all") {
        params.set("status", currentFilter);
    }

    if (currentRange && currentRange !== "all") {
        params.set("range", currentRange);
    }

    if (searchInput.value.trim()) {
        params.set("search", searchInput.value.trim());
    }

    if (dateInput.value) {
        params.set("date", dateInput.value);
    }

    params.set("page", String(currentPage));
    params.set("pageSize", String(pageSize));

    return `/admin/bookings?${params.toString()}`;
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);

    if (res.status === 401 || res.status === 403) {
        handleUnauthorized();
        throw new Error("Unauthorized");
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
        throw new Error(data?.error || "Request failed");
    }

    return data;
}

async function loadPortalData(silent = false) {
    if (!adminToken) {
        return;
    }

    if (!silent) {
        overviewStatus.textContent = "Loading tenant controls and workflow data...";
    }

    const data = await fetchJson(buildPortalDataUrl());
    portalData = {
        scope: data.scope || "tenant",
        tenants: Array.isArray(data.tenants) ? data.tenants : []
    };

    if (!selectedTenantId || !portalData.tenants.some((tenant) => String(tenant.id) === String(selectedTenantId))) {
        selectedTenantId = portalData.tenants[0]?.id || null;
    }

    updateTenantFilterOptions();
    updateHeaderLabels();
    renderTenantOverview();
    customizeSingleTenantUI();
}

async function refreshSummaryCounts() {
    if (!adminToken) {
        return;
    }

    const selectedTenant = tenantFilter.value || "";

    // m. Unique count summaries based on scope
    if (portalData.scope === "global") {
        const ranges = ["today", "this_week", "this_month", "all"];
        const results = await Promise.all(ranges.map(async (range) => {
            const params = getTokenQuery();
            if (selectedTenant) params.set("tenantId", selectedTenant);
            params.set("page", "1");
            params.set("pageSize", "1");
            if (range !== "all") params.set("range", range);
            const response = await fetchJson(`/admin/bookings?${params.toString()}`);
            return [range, response.total || 0];
        }));
        summaryCounts = Object.fromEntries(results);
    } else {
        const statuses = ["pending", "waiting", "confirmed", "rejected", "closed"];
        const results = await Promise.all(statuses.map(async (status) => {
            const params = getTokenQuery();
            if (selectedTenant) params.set("tenantId", selectedTenant);
            // 1e. Dynamically sync with the active range (fixes "today showing 0" when fetching Future/Past stats)
            params.set("range", currentRange && currentRange !== "all" ? currentRange : "today");
            params.set("status", status);
            params.set("page", "1");
            params.set("pageSize", "1");
            const response = await fetchJson(`/admin/bookings?${params.toString()}`);
            return [status, response.total || 0];
        }));
        summaryCounts = Object.fromEntries(results);
        summaryCounts.last_updated = new Date().toLocaleString();
    }
}

async function loadBookings(silent = false) {
    if (!adminToken) {
        return;
    }

    if (!silent) {
        bookingsStatus.textContent = "Loading bookings...";
    }
    
    const response = await fetchJson(buildBookingsUrl());
    bookingsResponse = {
        items: Array.isArray(response.items) ? response.items : [],
        total: response.total || 0,
        page: response.page || currentPage,
        pageSize: response.pageSize || pageSize
    };
    currentPage = bookingsResponse.page;
    await refreshSummaryCounts();
    renderOverviewStats();
    renderBookingsTable();
}

async function refreshPortal(silent = false) {
    try {
        showDashboard();
        await loadPortalData(silent);

        // Enforce specific initial configuration per portal
        if (portalData.scope !== "global" && currentRange === "all") {
            currentRange = "today";
        }

        await loadBookings(silent);
        if (!silent) {
            // n. Dynamic text adjustment
            overviewStatus.textContent = portalData.scope === "global" ? `Portal ready. Managing ${portalData.tenants.length} tenant(s).` : `Portal ready.`;
            connectionStatus.textContent = "Live updates connected.";
            homeConnectionLabel.textContent = "Connected";
        }
        connectStream(adminToken);
    } catch (err) {
        if (err.message !== "Unauthorized") {
            console.error("refreshPortal error:", err);
            overviewStatus.textContent = "Could not load portal data right now.";
            connectionStatus.textContent = "Live connection unavailable.";
            homeConnectionLabel.textContent = "Error";
        }
    }
}

// ==========================================
// 6. REAL-TIME SERVICE (SSE)
// ==========================================
function connectStream(token) {
    if (!token || (stream && streamTenantToken === token)) {
        return;
    }

    closeStream();
    streamTenantToken = token;
    stream = new EventSource(`/admin/bookings/stream?token=${encodeURIComponent(token)}`);

    stream.onopen = () => {
        connectionStatus.textContent = "Live updates connected.";
        homeConnectionLabel.textContent = "Connected";
    };

    stream.onmessage = async (event) => {
        try {
            const payload = JSON.parse(event.data);
            if (payload.type === "connected") {
                return;
            }
            
            if (payload.type === "created") {
                showToast(`New booking received! (#${payload.bookingId})`, "success");
            } else if (payload.type === "updated") {
                showToast(`Booking #${payload.bookingId} was updated.`, "success");
            }
        } catch (err) {
            console.error("stream parse error:", err);
        }

        await refreshPortal(true); // Silent background refresh so UI doesn't flash
    };

    stream.onerror = () => {
        connectionStatus.textContent = "Live connection interrupted. Retrying...";
        homeConnectionLabel.textContent = "Retrying";
    };
}

function closeStream() {
    if (stream) {
        stream.close();
        stream = null;
    }
    streamTenantToken = null;
}

// ==========================================
// 7. UI & RENDERERS
// ==========================================
function setActiveScreen(screenId) {
    currentScreen = screenId;

    screenButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.screenTarget === screenId);
    });

    screens.forEach((screen) => {
        screen.classList.toggle("hidden", screen.id !== screenId);
    });
}

function updateHeaderLabels() {
    const selectedTenant = getSelectedTenant();
    const portalTitle = portalData.scope === "global"
        ? "All Tenant Control Center"
        : (selectedTenant ? getTenantLabel(selectedTenant) : "WappBot Control Center");

    tenantName.textContent = portalTitle;
}

function renderOverviewStats() {
    if (portalData.scope === "global") {
        const elToday = document.getElementById("statToday");
        if (elToday) elToday.textContent = summaryCounts.today || 0;
        const elWeek = document.getElementById("statThisWeek");
        if (elWeek) elWeek.textContent = summaryCounts.this_week || 0;
        const elMonth = document.getElementById("statThisMonth");
        if (elMonth) elMonth.textContent = summaryCounts.this_month || 0;
        const elTotal = document.getElementById("statTotal");
        if (elTotal) elTotal.textContent = summaryCounts.all || 0;
        if (overviewTenantCount) overviewTenantCount.textContent = `${portalData.tenants.length} tenant${portalData.tenants.length === 1 ? "" : "s"}`;
    } else {
        // m. Render completely new layout elements dynamically strictly for single tenants
        const statsContainer = document.getElementById("statToday")?.closest('.stats-grid') || document.getElementById("statToday")?.parentElement;
        if (statsContainer) {
            // 1e. Dynamically format label to reflect selected range
            const rangeStr = (currentRange && currentRange !== "all") ? currentRange : "today";
            const rangeLabel = rangeStr.charAt(0).toUpperCase() + rangeStr.slice(1);

            statsContainer.innerHTML = `
                <div class="stat-card"><h3>Pending (${rangeLabel})</h3><p class="stat-value">${summaryCounts.pending || 0}</p></div>
                <div class="stat-card"><h3>Waiting (${rangeLabel})</h3><p class="stat-value">${summaryCounts.waiting || 0}</p></div>
                <div class="stat-card"><h3>Confirmed (${rangeLabel})</h3><p class="stat-value">${summaryCounts.confirmed || 0}</p></div>
                <div class="stat-card"><h3>Rejected (${rangeLabel})</h3><p class="stat-value">${summaryCounts.rejected || 0}</p></div>
                <div class="stat-card"><h3>Closed (${rangeLabel})</h3><p class="stat-value">${summaryCounts.closed || 0}</p></div>
            `;
            let lastUpdatedEl = document.getElementById("lastUpdatedTime");
            if (!lastUpdatedEl) {
                lastUpdatedEl = document.createElement("p");
                lastUpdatedEl.id = "lastUpdatedTime";
                lastUpdatedEl.className = "status-note";
                statsContainer.parentNode.insertBefore(lastUpdatedEl, statsContainer.nextSibling);
            }
            lastUpdatedEl.textContent = `Last updated: ${summaryCounts.last_updated || new Date().toLocaleString()}`;
        }
        if (overviewTenantCount) overviewTenantCount.style.display = 'none';
    }
}

function renderTenantOverview() {
    tenantOverviewList.innerHTML = "";

    if (!portalData.tenants.length) {
        tenantOverviewList.innerHTML = '<p class="status-note">No tenants available.</p>';
        return;
    }

    portalData.tenants.forEach((tenant) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "tenant-overview-item";
        item.innerHTML = `
            <span class="tenant-overview-title">${getTenantLabel(tenant)}</span>
            <span class="tenant-overview-copy">${tenant.services.length} services, ${tenant.providers.length} providers</span>
        `;
        item.style.cursor = "default"; // Items are not clickable for now
        tenantOverviewList.appendChild(item);
    });
}

function updateTenantFilterOptions() {
    tenantFilter.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = portalData.scope === "global" ? "All tenants" : "Current tenant";
    tenantFilter.appendChild(allOption);

    portalData.tenants.forEach((tenant) => {
        const option = document.createElement("option");
        option.value = String(tenant.id);
        option.textContent = getTenantLabel(tenant);
        tenantFilter.appendChild(option);
    });

    if (portalData.scope !== "global") {
        tenantFilter.value = portalData.tenants[0] ? String(portalData.tenants[0].id) : "";
        tenantFilter.disabled = true;
        tenantFilter.style.display = "none";
    } else if (!portalData.tenants.some((tenant) => String(tenant.id) === tenantFilter.value)) {
        tenantFilter.value = "";
        tenantFilter.disabled = false;
        tenantFilter.style.display = "inline-block";
    }
}

function getActionMarkup(booking) {
    const status = booking.status || "pending";
    const tenantId = booking.tenant_id;

    if (status === "confirmed") {
        return `
            <div class="action-stack">
                <button class="secondary" data-action="close" data-id="${booking.id}" data-tenant-id="${tenantId}" type="button">Close</button>
            </div>
        `;
    }

    if (status === "pending") {
        return `
            <div class="action-stack">
                <button class="approve" data-action="approve" data-id="${booking.id}" data-tenant-id="${tenantId}" type="button">Confirm</button>
                <button class="waiting" data-action="waiting" data-id="${booking.id}" data-tenant-id="${tenantId}" type="button">Waiting</button>
                <button class="reject" data-action="reject" data-id="${booking.id}" data-tenant-id="${tenantId}" type="button">Reject</button>
            </div>
        `;
    }

    if (status === "waiting") {
        return `
            <div class="action-stack">
                <button class="approve" data-action="approve" data-id="${booking.id}" data-tenant-id="${tenantId}" type="button">Confirm</button>
                <button class="reject" data-action="reject" data-id="${booking.id}" data-tenant-id="${tenantId}" type="button">Reject</button>
            </div>
        `;
    }

    return '<span class="cell-copy">No actions</span>';
}

function renderBookingsTable() {
    bookingsTableBody.innerHTML = "";
    const bookings = bookingsResponse.items || [];

    if (!bookings.length) {
        dashboardEmpty.classList.remove("hidden");
        bookingsStatus.textContent = "No bookings found for the current view.";
        pageLabel.textContent = "Page 1";
        prevPageButton.disabled = true;
        nextPageButton.disabled = true;
        return;
    }

    dashboardEmpty.classList.add("hidden");

    // f. Hide generic Tenant Table Headers contextually 
    const table = bookingsTableBody.closest('table');
    if (table) {
        const ths = table.querySelectorAll('th');
        if (ths.length > 0 && ths[0].textContent.includes('Tenant')) {
            ths[0].style.display = portalData.scope === "global" ? '' : 'none';
        }
    }

    const isGlobal = portalData.scope === "global";

    bookings.forEach((booking) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            ${isGlobal ? `<td>
                <div class="cell-title">${booking.tenant_name || getTenantLabel(getSelectedTenant())}</div>
                <div class="cell-copy">Tenant ID ${booking.tenant_id}</div>
            </td>` : ''}
            <td>
                <div class="cell-title">${booking.service_name || "Unnamed service"}</div>
                <div class="cell-copy">Booking #${booking.id}</div>
            </td>
            <td>
                <div class="cell-title">${booking.provider_name || "Not selected"}</div>
                <div class="cell-copy">${booking.provider_id ? `Provider #${booking.provider_id}` : "Configured via workflow"}</div>
            </td>
            <td>
                <div class="cell-title">${booking.phone || "No phone"}</div>
            </td>
            <td>
                <div class="cell-title">${formatDisplayDate(booking.booking_date)}</div>
            </td>
            <td>
                <div class="cell-title">${formatDisplayTime(booking.booking_time)}</div>
            </td>
            <td>
                <span class="status-badge status-${booking.status || "pending"}">${booking.status || "pending"}</span>
            </td>
            <td>
                <pre class="inline-pre">${formatWorkflowAnswers(booking.workflow_answers)}</pre>
            </td>
            <td>
                <div class="cell-copy">${booking.close_remarks || "-"}</div>
            </td>
            <td>
                <div class="cell-copy">${booking.created_at ? new Date(booking.created_at).toLocaleString("en-IN") : "-"}</div>
            </td>
            <td>${getActionMarkup(booking)}</td>
        `;
        bookingsTableBody.appendChild(row);
    });

    const totalPages = Math.max(1, Math.ceil((bookingsResponse.total || 0) / bookingsResponse.pageSize));
    bookingsStatus.textContent = `Showing ${bookings.length} booking(s) on page ${bookingsResponse.page} of ${totalPages}. Total ${bookingsResponse.total} booking(s).`;
    pageLabel.textContent = `Page ${bookingsResponse.page} of ${totalPages}`;
    prevPageButton.disabled = bookingsResponse.page <= 1;
    nextPageButton.disabled = bookingsResponse.page >= totalPages;
}

function render() {
    updateHeaderLabels();
    renderOverviewStats();
    renderTenantOverview();
    renderBookingsTable();
}

// ==========================================
// 8. ACTIONS & BUSINESS LOGIC
// ==========================================

async function updateBookingStatus(bookingId, action, options = {}) {
    const endpoint = action === "approve"
        ? "/admin/approve"
        : action === "reject"
            ? "/admin/reject"
            : action === "waiting"
                ? "/admin/waiting"
                : "/admin/close";

    bookingsStatus.textContent = "Updating booking...";

    try {
        await fetchJson(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                token: adminToken,
                tenantId: options.tenantId,
                bookingId,
                remarks: options.remarks || ""
            })
        });

        closeCloseModal();
        showToast("Booking updated successfully", "success");
        await refreshPortal(true); // Silent refresh
    } catch (err) {
        if (err.message !== "Unauthorized") {
            console.error("updateBookingStatus error:", err);
            showToast(err.message || "Could not update the booking right now.", "error");
        }
    }
}

function openCloseModal(booking) {
    closeBookingMeta = booking;
    closeRemarks.value = booking.close_remarks || "";
    closeModalSummary.textContent = `${booking.service_name} - ${booking.phone} - ${formatDisplayDate(booking.booking_date)} at ${formatDisplayTime(booking.booking_time)}`;
    closeModal.classList.remove("hidden");
    closeRemarks.focus();
}

function closeCloseModal() {
    closeBookingMeta = null;
    closeRemarks.value = "";
    closeModal.classList.add("hidden");
}

// ==========================================
// 10. EVENT LISTENERS
// ==========================================
loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = tenantInput.value.trim();

    if (!token) {
        loginStatus.textContent = "Enter your admin token to continue.";
        return;
    }

    loginStatus.textContent = "Signing you in...";
    saveToken(token);
    await refreshPortal();
});

logoutButton.addEventListener("click", () => {
    clearToken();
    showLogin("Signed out. Enter your admin token to open the portal again.");
});

screenButtons.forEach((button) => {
    // Hide the settings button entirely
    if (button.dataset.screenTarget === "tenantControlsScreen") {
        button.style.display = "none";
    }

    button.addEventListener("click", () => {
        setActiveScreen(button.dataset.screenTarget);
    });
});

refreshOverviewButton.addEventListener("click", refreshPortal);
refreshBookingsButton.addEventListener("click", loadBookings);

let searchTimeout = null;
searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        currentPage = 1;
        await loadBookings();
    }, 400); // Wait 400ms after user stops typing
});

dateInput.addEventListener("change", async () => {
    currentPage = 1;
    await loadBookings();
});

tenantFilter.addEventListener("change", async () => {
    currentPage = 1;
    await loadBookings();
});

document.querySelectorAll(".pill").forEach((pill) => {
    pill.addEventListener("click", async () => {
        currentFilter = pill.dataset.filter;
        currentPage = 1;
        document.querySelectorAll(".pill").forEach((item) => item.classList.toggle("active", item === pill));
        await loadBookings();
    });
});

document.querySelectorAll(".stat-card").forEach((card) => {
    card.addEventListener("click", async () => {
        currentRange = card.dataset.range || "all";
        currentFilter = "all";
        dateInput.value = "";
        if (dateInput.type === "date") {
            dateInput.type = "text"; 
        }
        document.querySelectorAll(".pill").forEach((item) => item.classList.toggle("active", item.dataset.filter === "all"));
        
        setActiveScreen("bookingsScreen");
        currentPage = 1;
        await loadBookings();
    });
});

document.getElementById("clearButton").addEventListener("click", async () => {
    searchInput.value = "";
    dateInput.value = "";
    if (portalData.scope === "global") {
        tenantFilter.value = "";
    }
    currentFilter = "all";
    currentRange = "all";
    currentPage = 1;
    document.querySelectorAll(".pill").forEach((item) => item.classList.toggle("active", item.dataset.filter === "all"));
    await loadBookings();
});

prevPageButton.addEventListener("click", async () => {
    if (currentPage > 1) {
        currentPage -= 1;
        await loadBookings();
    }
});

nextPageButton.addEventListener("click", async () => {
    const totalPages = Math.max(1, Math.ceil((bookingsResponse.total || 0) / bookingsResponse.pageSize));
    if (currentPage < totalPages) {
        currentPage += 1;
        await loadBookings();
    }
});

bookingsTableBody.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-action]");

    if (!actionButton) {
        return;
    }

    const action = actionButton.dataset.action;
    const bookingId = actionButton.dataset.id;
    const tenantId = actionButton.dataset.tenantId;

    if (action === "close") {
        const booking = (bookingsResponse.items || []).find((item) => String(item.id) === String(bookingId));
        if (booking) {
            openCloseModal(booking);
        }
        return;
    }

    // Disable button to prevent double-clicks
    actionButton.disabled = true;
    const originalText = actionButton.textContent;
    actionButton.textContent = "...";

    try {
        await updateBookingStatus(bookingId, action, { tenantId });
    } finally {
        actionButton.disabled = false;
        actionButton.textContent = originalText;
    }
});

closeModalDismiss.addEventListener("click", closeCloseModal);
closeModal.addEventListener("click", (event) => {
    if (event.target === closeModal) {
        closeCloseModal();
    }
});

closeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!closeBookingMeta) {
        return;
    }

    await updateBookingStatus(closeBookingMeta.id, "close", {
        tenantId: closeBookingMeta.tenant_id,
        remarks: closeRemarks.value.trim()
    });
});

// ==========================================
// 11. INITIALIZATION
// ==========================================
tenantInput.value = localStorage.getItem("adminToken") || "";
setActiveScreen(currentScreen);

if (tenantInput.value.trim()) {
    saveToken(tenantInput.value.trim());
    loginStatus.textContent = "Restoring your session...";
    refreshPortal();
} else {
    showLogin();
}

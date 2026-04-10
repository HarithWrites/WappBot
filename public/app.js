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
let currentSettingsTab = "general";
let currentSettingHolidays = [];
let workflowStepsData = [];
let selectedWorkflowTenant = null;
let workflowCurrentPage = 1;
let workflowPageSize = 10;

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
const connectionStatusText = document.getElementById("connectionStatusText");
const connectionStatusDot = document.getElementById("connectionStatusDot");
const homeConnectionLabel = document.getElementById("homeConnectionLabel");
const overviewStatus = document.getElementById("overviewStatus");
const tenantOverviewList = document.getElementById("tenantOverviewList");
const overviewTenantCount = document.getElementById("overviewTenantCount");
const screenButtons = document.querySelectorAll("[data-screen-target]");
const screens = document.querySelectorAll(".workspace-screen");
const refreshGlobalButton = document.getElementById("refreshGlobalButton");
const refreshOverviewButton = document.getElementById("refreshOverviewButton");
const refreshBookingsButton = document.getElementById("refreshBookingsButton");
const refreshAnalyticsButton = document.getElementById("refreshAnalyticsButton");
const refreshWorkflowButton = document.getElementById("refreshWorkflowButton");
const refreshSettingsButton = document.getElementById("refreshSettingsButton");
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
    const headers = {
        ...options.headers,
        "Authorization": `Bearer ${adminToken}`
    };
    
    const res = await fetch(url, { ...options, headers });

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
    renderTenantLists();
    customizeSingleTenantUI();
}

function renderTenantLists() {
    renderTenantSettingsList("tenantListWorkflow");
    renderTenantSettingsList("tenantListSettings");
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
            params.set("range", currentRange || "all");
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
            overviewStatus.textContent = portalData.scope === "global" ? `Portal ready. Managing ${portalData.tenants.length} tenant(s).` : `Portal ready.`;
            connectionStatusText.textContent = "Live connected";
            connectionStatusDot.className = "status-dot connected";
            homeConnectionLabel.textContent = "Connected";
        }
        connectStream(adminToken);
    } catch (err) {
        if (err.message !== "Unauthorized") {
            console.error("refreshPortal error:", err);
            overviewStatus.textContent = "Could not load portal data right now.";
            connectionStatusText.textContent = "Disconnected";
            connectionStatusDot.className = "status-dot";
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
        connectionStatusText.textContent = "Live connected";
        connectionStatusDot.className = "status-dot connected";
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
        connectionStatusText.textContent = "Retrying...";
        connectionStatusDot.className = "status-dot retrying";
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
// NEW FUNCTIONS FOR ENHANCED DASHBOARD
// ==========================================

async function loadAnalytics() {
    if (!adminToken) return;

    try {
        // Load analytics data
        const analyticsData = await fetchJson(`/admin/analytics?${getTokenQuery().toString()}`);

        // Update metrics
        document.getElementById('totalConversations').textContent = analyticsData.totalConversations || 0;
        document.getElementById('conversionRate').textContent = `${analyticsData.conversionRate || 0}%`;
        document.getElementById('avgResponseTime').textContent = `${analyticsData.avgResponseTime || 0}s`;
        document.getElementById('popularService').textContent = analyticsData.popularService || 'N/A';

        // Update engagement table
        document.getElementById('messagesSent').textContent = analyticsData.messagesSent || 0;
        document.getElementById('messagesReceived').textContent = analyticsData.messagesReceived || 0;
        document.getElementById('activeUsers').textContent = analyticsData.activeUsers || 0;
        document.getElementById('avgSessionDuration').textContent = `${analyticsData.avgSessionDuration || 0}m`;

        // Render charts (placeholder for now)
        renderAnalyticsCharts(analyticsData);

    } catch (error) {
        console.error('Failed to load analytics:', error);
        showToast('Failed to load analytics data', 'error');
    }
}

async function loadCommunications() {
    if (!adminToken) return;

    try {
        // Load message history
        const messagesData = await fetchJson(`/admin/messages?${getTokenQuery().toString()}`);
        renderMessageHistory(messagesData);

        // Load user segments for targeting
        const usersData = await fetchJson(`/admin/users?${getTokenQuery().toString()}`);
        populateUserSegments(usersData);

    } catch (error) {
        console.error('Failed to load communications:', error);
        showToast('Failed to load communications data', 'error');
    }
}

async function loadWorkflowData() {
    if (!adminToken) return;

    const tenantSelect = document.getElementById('workflowTenantSelect');
    if (!tenantSelect) return;

    // Populate tenant dropdown
    tenantSelect.innerHTML = '<option value="">Choose a tenant...</option>';
    portalData.tenants.forEach(tenant => {
        const option = document.createElement('option');
        option.value = tenant.id;
        option.textContent = tenant.name;
        tenantSelect.appendChild(option);
    });

    // If a tenant was previously selected, keep it selected
    if (selectedWorkflowTenant) {
        tenantSelect.value = selectedWorkflowTenant;
        await loadWorkflowSteps(selectedWorkflowTenant);
    }
}

async function loadWorkflowSteps(tenantId) {
    if (!tenantId) {
        document.getElementById('workflowTableBody').innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-state-content">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14,2 14,8 20,8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10,9 9,9 8,9"></polyline>
                        </svg>
                        <p>Select a tenant to view workflow steps</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    try {
        const response = await fetchJson(`/admin/workflow/${tenantId}?${getTokenQuery().toString()}`);
        renderWorkflowTable(response.steps || []);
    } catch (error) {
        console.error('Failed to load workflow steps:', error);
        showToast('Failed to load workflow steps', 'error');
    }
}

function renderAnalyticsCharts(data) {
    // Placeholder for chart rendering
    // In a real implementation, you would use Chart.js or similar library
    console.log('Rendering analytics charts with data:', data);
}

function renderMessageHistory(messages) {
    const tbody = document.getElementById('messagesTableBody');
    if (!tbody) return;

    if (!messages || messages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No messages sent yet.</td></tr>';
        return;
    }

    // SECURITY: Clear existing content safely
    tbody.innerHTML = '';

    // SECURITY: Create elements safely to prevent XSS
    messages.forEach(msg => {
        const row = document.createElement('tr');

        // Type cell - safe
        const typeCell = document.createElement('td');
        typeCell.textContent = msg.type || '';
        row.appendChild(typeCell);

        // Content cell - ESCAPE HTML to prevent XSS
        const contentCell = document.createElement('td');
        const content = String(msg.content || '');
        contentCell.textContent = content.length > 50 ? content.substring(0, 50) + '...' : content;
        row.appendChild(contentCell);

        // Recipients cell - safe number
        const recipientsCell = document.createElement('td');
        recipientsCell.textContent = msg.recipientCount || 0;
        row.appendChild(recipientsCell);

        // Sent date - safe date formatting
        const sentCell = document.createElement('td');
        sentCell.textContent = msg.sentAt ? new Date(msg.sentAt).toLocaleDateString() : '';
        row.appendChild(sentCell);

        // Status cell - safe with CSS class
        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge ${msg.status || 'unknown'}`;
        statusBadge.textContent = msg.status || 'unknown';
        statusCell.appendChild(statusBadge);
        row.appendChild(statusCell);

        // Actions cell - safe button
        const actionsCell = document.createElement('td');
        const viewButton = document.createElement('button');
        viewButton.className = 'secondary compact-btn';
        viewButton.textContent = 'View';
        viewButton.onclick = () => viewMessage(msg.id);
        actionsCell.appendChild(viewButton);
        row.appendChild(actionsCell);

        tbody.appendChild(row);
    });
}

function populateUserSegments(users) {
    const select = document.getElementById('individualUsers');
    if (!select) return;

    select.innerHTML = '<option value="">Select users...</option>';
    users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.name} (${user.phone})`;
        select.appendChild(option);
    });
}

function renderWorkflowTable(steps) {
    const tbody = document.getElementById('workflowTableBody');
    if (!tbody) return;

    // Clear existing content
    tbody.innerHTML = '';

    if (!steps || steps.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.className = 'empty-state';

        const div = document.createElement('div');
        div.className = 'empty-state-content';

        const p = document.createElement('p');
        p.textContent = 'No workflow steps configured';

        const button = document.createElement('button');
        button.className = 'primary compact-btn';
        button.textContent = 'Add First Step';
        button.onclick = addNewWorkflowStep;

        div.appendChild(p);
        div.appendChild(button);
        td.appendChild(div);
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    steps.forEach((step, index) => {
        const tr = document.createElement('tr');

        // Order
        const tdOrder = document.createElement('td');
        tdOrder.textContent = step.order;
        tr.appendChild(tdOrder);

        // Type
        const tdType = document.createElement('td');
        const spanType = document.createElement('span');
        spanType.className = `step-type ${step.type}`;
        spanType.textContent = step.type;
        tdType.appendChild(spanType);
        tr.appendChild(tdType);

        // Message
        const tdMessage = document.createElement('td');
        tdMessage.textContent = step.message;
        tr.appendChild(tdMessage);

        // Options
        const tdOptions = document.createElement('td');
        tdOptions.textContent = step.options ? step.options.join(', ') : 'N/A';
        tr.appendChild(tdOptions);

        // Next Step
        const tdNext = document.createElement('td');
        tdNext.textContent = step.nextStep || 'End';
        tr.appendChild(tdNext);

        // Status
        const tdStatus = document.createElement('td');
        const spanStatus = document.createElement('span');
        spanStatus.className = `status-badge ${step.status}`;
        spanStatus.textContent = step.status;
        tdStatus.appendChild(spanStatus);
        tr.appendChild(tdStatus);

        // Actions
        const tdActions = document.createElement('td');

        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'icon-button small';
        editBtn.title = 'Edit';
        editBtn.onclick = () => editWorkflowStep(step.id);

        const editSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        editSvg.setAttribute('viewBox', '0 0 24 24');
        editSvg.setAttribute('width', '16');
        editSvg.setAttribute('height', '16');
        editSvg.setAttribute('fill', 'none');
        editSvg.setAttribute('stroke', 'currentColor');
        editSvg.setAttribute('stroke-width', '2');

        const editPath1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        editPath1.setAttribute('d', 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7');
        editSvg.appendChild(editPath1);

        const editPath2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        editPath2.setAttribute('d', 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z');
        editSvg.appendChild(editPath2);

        editBtn.appendChild(editSvg);
        tdActions.appendChild(editBtn);

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'icon-button small';
        deleteBtn.title = 'Delete';
        deleteBtn.onclick = () => deleteWorkflowStep(step.id);

        const deleteSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        deleteSvg.setAttribute('viewBox', '0 0 24 24');
        deleteSvg.setAttribute('width', '16');
        deleteSvg.setAttribute('height', '16');
        deleteSvg.setAttribute('fill', 'none');
        deleteSvg.setAttribute('stroke', 'currentColor');
        deleteSvg.setAttribute('stroke-width', '2');

        const deletePolyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        deletePolyline.setAttribute('points', '3,6 5,6 21,6');
        deleteSvg.appendChild(deletePolyline);

        const deletePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        deletePath.setAttribute('d', 'M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2');
        deleteSvg.appendChild(deletePath);

        const deleteLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        deleteLine1.setAttribute('x1', '10');
        deleteLine1.setAttribute('y1', '11');
        deleteLine1.setAttribute('x2', '10');
        deleteLine1.setAttribute('y2', '17');
        deleteSvg.appendChild(deleteLine1);

        const deleteLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        deleteLine2.setAttribute('x1', '14');
        deleteLine2.setAttribute('y1', '11');
        deleteLine2.setAttribute('x2', '14');
        deleteLine2.setAttribute('y2', '17');
        deleteSvg.appendChild(deleteLine2);

        deleteBtn.appendChild(deleteSvg);
        tdActions.appendChild(deleteBtn);

        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });
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
            const rangeStr = (currentRange && currentRange !== "all") ? currentRange : "all time";
            const rangeLabel = rangeStr === "all time" ? "Total" : rangeStr.charAt(0).toUpperCase() + rangeStr.slice(1);

            statsContainer.innerHTML = `
                <div class="stat-card stat-pending" data-filter="pending"><h3>Pending (${rangeLabel})</h3><p class="stat-value">${summaryCounts.pending || 0}</p></div>
                <div class="stat-card stat-waiting" data-filter="waiting"><h3>Waiting (${rangeLabel})</h3><p class="stat-value">${summaryCounts.waiting || 0}</p></div>
                <div class="stat-card stat-confirmed" data-filter="confirmed"><h3>Confirmed (${rangeLabel})</h3><p class="stat-value">${summaryCounts.confirmed || 0}</p></div>
                <div class="stat-card stat-rejected" data-filter="rejected"><h3>Rejected (${rangeLabel})</h3><p class="stat-value">${summaryCounts.rejected || 0}</p></div>
                <div class="stat-card stat-closed" data-filter="closed"><h3>Closed (${rangeLabel})</h3><p class="stat-value">${summaryCounts.closed || 0}</p></div>
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
        const p = document.createElement('p');
        p.className = 'status-note';
        p.textContent = 'No tenants available.';
        tenantOverviewList.appendChild(p);
        return;
    }

    portalData.tenants.forEach((tenant) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "tenant-overview-item";
        item.style.cursor = "default"; // Items are not clickable for now

        const titleSpan = document.createElement('span');
        titleSpan.className = 'tenant-overview-title';
        titleSpan.textContent = getTenantLabel(tenant);

        const copySpan = document.createElement('span');
        copySpan.className = 'tenant-overview-copy';
        copySpan.textContent = `${tenant.services.length} services, ${tenant.providers.length} providers`;

        item.appendChild(titleSpan);
        item.appendChild(copySpan);
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

    const icons = {
        approve: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"></path></svg>`,
        waiting: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
        reject: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
        close: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path></svg>`
    };

    if (status === "confirmed") {
        return `
            <div class="action-stack">
                <button class="action-btn close" data-action="close" data-id="${booking.id}" data-tenant-id="${tenantId}" title="Close Booking">
                    ${icons.close}
                </button>
            </div>
        `;
    }

    if (status === "pending") {
        return `
            <div class="action-stack">
                <button class="action-btn approve" data-action="approve" data-id="${booking.id}" data-tenant-id="${tenantId}" title="Confirm">
                    ${icons.approve}
                </button>
                <button class="action-btn waiting" data-action="waiting" data-id="${booking.id}" data-tenant-id="${tenantId}" title="Set to Waiting">
                    ${icons.waiting}
                </button>
                <button class="action-btn reject" data-action="reject" data-id="${booking.id}" data-tenant-id="${tenantId}" title="Reject">
                    ${icons.reject}
                </button>
            </div>
        `;
    }

    if (status === "waiting") {
        return `
            <div class="action-stack">
                <button class="action-btn approve" data-action="approve" data-id="${booking.id}" data-tenant-id="${tenantId}" title="Confirm">
                    ${icons.approve}
                </button>
                <button class="action-btn reject" data-action="reject" data-id="${booking.id}" data-tenant-id="${tenantId}" title="Reject">
                    ${icons.reject}
                </button>
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

        // Tenant column (if global scope)
        if (isGlobal) {
            const tenantCell = document.createElement('td');
            const tenantTitle = document.createElement('div');
            tenantTitle.className = 'cell-title';
            tenantTitle.textContent = booking.tenant_name || getTenantLabel(getSelectedTenant());
            const tenantCopy = document.createElement('div');
            tenantCopy.className = 'cell-copy';
            tenantCopy.textContent = `Tenant ID ${booking.tenant_id}`;
            tenantCell.appendChild(tenantTitle);
            tenantCell.appendChild(tenantCopy);
            row.appendChild(tenantCell);
        }

        // Service column
        const serviceCell = document.createElement('td');
        const serviceTitle = document.createElement('div');
        serviceTitle.className = 'cell-title';
        serviceTitle.textContent = booking.service_name || "Unnamed service";
        const serviceCopy = document.createElement('div');
        serviceCopy.className = 'cell-copy';
        serviceCopy.textContent = `Booking #${booking.id}`;
        serviceCell.appendChild(serviceTitle);
        serviceCell.appendChild(serviceCopy);
        row.appendChild(serviceCell);

        // Provider column
        const providerCell = document.createElement('td');
        const providerTitle = document.createElement('div');
        providerTitle.className = 'cell-title';
        providerTitle.textContent = booking.provider_name || "Not selected";
        const providerCopy = document.createElement('div');
        providerCopy.className = 'cell-copy';
        providerCopy.textContent = booking.provider_id ? `Provider #${booking.provider_id}` : "Configured via workflow";
        providerCell.appendChild(providerTitle);
        providerCell.appendChild(providerCopy);
        row.appendChild(providerCell);

        // Phone column
        const phoneCell = document.createElement('td');
        const phoneTitle = document.createElement('div');
        phoneTitle.className = 'cell-title';
        phoneTitle.textContent = booking.phone || "No phone";
        phoneCell.appendChild(phoneTitle);
        row.appendChild(phoneCell);

        // Date column
        const dateCell = document.createElement('td');
        const dateTitle = document.createElement('div');
        dateTitle.className = 'cell-title';
        dateTitle.textContent = formatDisplayDate(booking.booking_date);
        dateCell.appendChild(dateTitle);
        row.appendChild(dateCell);

        // Time column
        const timeCell = document.createElement('td');
        const timeTitle = document.createElement('div');
        timeTitle.className = 'cell-title';
        timeTitle.textContent = formatDisplayTime(booking.booking_time);
        timeCell.appendChild(timeTitle);
        row.appendChild(timeCell);

        // Status column
        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge status-${booking.status || "pending"}`;
        statusBadge.textContent = booking.status || "pending";
        statusCell.appendChild(statusBadge);
        row.appendChild(statusCell);

        // Answers column
        const answersCell = document.createElement('td');
        const answersPre = document.createElement('pre');
        answersPre.className = 'inline-pre';
        answersPre.textContent = formatWorkflowAnswers(booking.workflow_answers);
        answersCell.appendChild(answersPre);
        row.appendChild(answersCell);

        // Remarks column
        const remarksCell = document.createElement('td');
        const remarksDiv = document.createElement('div');
        remarksDiv.className = 'cell-copy';
        remarksDiv.textContent = booking.close_remarks || "-";
        remarksCell.appendChild(remarksDiv);
        row.appendChild(remarksCell);

        // Created column
        const createdCell = document.createElement('td');
        const createdDiv = document.createElement('div');
        createdDiv.className = 'cell-copy';
        createdDiv.textContent = booking.created_at ? new Date(booking.created_at).toLocaleString("en-IN") : "-";
        createdCell.appendChild(createdDiv);
        row.appendChild(createdCell);

        // Actions column
        const actionsCell = document.createElement('td');
        actionsCell.innerHTML = getActionMarkup(booking); // Keep this for now as it's complex
        row.appendChild(actionsCell);

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

function renderTenantSettingsList(containerId) {
    const list = document.getElementById(containerId);
    if (!list) return;

    list.innerHTML = "";

    // Hide sidebar if only one tenant or in tenant-scoped view
    const sidebar = list.closest(".tenant-directory");
    if (portalData.scope !== "global") {
        if (sidebar) sidebar.style.display = "none";
        return;
    }

    if (sidebar) sidebar.style.display = "block";

    portalData.tenants.forEach((tenant) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "tenant-directory-item";
        if (String(tenant.id) === String(selectedTenantId)) item.classList.add("active");

        item.innerHTML = `
            <div class="tenant-title">${getTenantLabel(tenant)}</div>
            <div class="tenant-id">ID ${tenant.id}</div>
        `;

        item.onclick = async () => {
            selectedTenantId = tenant.id;
            document.querySelectorAll(".tenant-directory-item").forEach(el => el.classList.remove("active"));
            
            // Sync all lists
            document.querySelectorAll(`[data-tenant-id="${tenant.id}"]`).forEach(el => el.classList.add('active'));
            
            if (currentScreen === "workflowScreen") {
                document.getElementById("workflowEditorTitle").textContent = getTenantLabel(tenant);
                await loadWorkflowData();
            } else if (currentScreen === "settingsScreen") {
                await loadSettings();
            }
        };
        item.dataset.tenantId = tenant.id;

        list.appendChild(item);
    });
}
// 8. SETTINGS MANAGEMENT
// ==========================================



async function loadSettings() {
    const selectedTenant = getSelectedTenant();
    if (!selectedTenant) return;

    try {
        const data = await fetchJson(`/admin/settings?tenantId=${selectedTenant.id}`);
        renderSettings(data);
    } catch (err) {
        console.error("loadSettings error:", err);
        showToast("Error loading settings", "error");
    }
}

function renderSettings(data) {
    const { tenant, services, providers } = data;
    
    // 1. General Tab
    document.getElementById("businessNameInput").value = tenant.business_name || "";
    document.getElementById("timezoneInput").value = tenant.timezone || "UTC";
    document.getElementById("parallelInput").value = tenant.max_parallel_appointments || 1;

    // WhatsApp Fields
    document.getElementById("phoneNumberIdInput").value = tenant.phone_number_id || "";
    document.getElementById("whatsappTokenInput").value = tenant.token || "";
    document.getElementById("appSecretInput").value = tenant.app_secret || "";
    document.getElementById("verifyTokenInput").value = tenant.webhook_verify_token || "";

    // 2. Schedule Tab
    document.getElementById("openingHourInput").value = tenant.opening_hour ?? 9;
    document.getElementById("closingHourInput").value = tenant.closing_hour ?? 21;
    document.getElementById("slotDurationInput").value = tenant.slot_duration ?? 60;

    // Week Offs
    const weekOffs = Array.isArray(tenant.week_offs) ? tenant.week_offs : [];
    document.querySelectorAll("#weekOffsContainer input[type='checkbox']").forEach(cb => {
        cb.checked = weekOffs.includes(parseInt(cb.value));
    });

    // Holidays
    currentSettingHolidays = Array.isArray(tenant.business_holidays) ? tenant.business_holidays : [];
    renderHolidayList();

    // 3. Services Tab
    renderServicesSettingsTable(services);

    // 4. Providers Tab
    renderProvidersSettingsTable(providers, services);
}



async function loadWorkflowData() {
    const selectedTenant = getSelectedTenant();
    if (!selectedTenant) return;

    try {
        const data = await fetchJson(`/admin/workflow?tenantId=${selectedTenant.id}`);
        workflowStepsData = data.steps || [];
        renderWorkflowBuilder();
    } catch (err) {
        console.error("loadWorkflowData error:", err);
        showToast("Error loading workflow", "error");
    }
}

function renderWorkflowBuilder() {
    const list = document.getElementById("workflowStepsList");
    if (!list) return;

    if (workflowStepsData.length === 0) {
        list.innerHTML = `<div class="empty-state"><p>No steps configured. Click "Add New Step" to begin.</p></div>`;
        return;
    }

    list.innerHTML = "";
    workflowStepsData.forEach((step, index) => {
        const card = createStepCard(step, index);
        list.appendChild(card);
    });
}

const STEP_KINDS = [
    { value: "service", label: "Service Selection" },
    { value: "custom_choice", label: "Custom Choices (Buttons/List)" },
    { value: "date_choice", label: "Date Selection" },
    { value: "relative_date_list", label: "Relative Date List" },
    { value: "time_period", label: "Time Window Selection" },
    { value: "time_slot", label: "Time Slot Selection" },
    { value: "confirmation", label: "Final Confirmation" },
    { value: "text", label: "Raw Text Input" }
];

function createStepCard(step, index) {
    const card = document.createElement("div");
    card.className = "step-card";
    card.dataset.id = step.step_id;

    const kindOptions = STEP_KINDS.map(k => `<option value="${k.value}" ${step.kind === k.value ? 'selected' : ''}>${k.label}</option>`).join("");
    
    // Build Options List
    const hasOptions = ["custom_choice", "date_choice", "confirmation"].includes(step.kind);
    const optionsHtml = step.options.map(opt => `
        <div class="option-item" data-opt-id="${opt.id}">
            <input type="text" value="${opt.title}" placeholder="Button Title" class="compact-input opt-title">
            <input type="text" value="${opt.value}" placeholder="Value" class="compact-input opt-value">
            <input type="text" value="${opt.next || ''}" placeholder="Next Step ID" class="compact-input opt-next">
            <button class="secondary btn-icon delete-opt" title="Remove">&times;</button>
        </div>
    `).join("");

    card.innerHTML = `
        <div class="step-card-header">
            <div class="step-title-row">
                <span class="step-id-badge">${step.step_id}</span>
                <span class="step-kind-badge">${step.kind}</span>
            </div>
            <div class="step-actions">
                <button class="secondary btn-icon move-up" ${index === 0 ? 'disabled' : ''} title="Move Up">↑</button>
                <button class="secondary btn-icon move-down" ${index === workflowStepsData.length - 1 ? 'disabled' : ''} title="Move Down">↓</button>
                <button class="danger-soft btn-icon delete-step" title="Delete Step">&times;</button>
            </div>
        </div>
        <div class="step-content">
            <div class="step-form-grid">
                <label>
                    <span>Question Kind</span>
                    <select class="compact-input step-kind">${kindOptions}</select>
                </label>
                <label>
                    <span>Question Header</span>
                    <input type="text" class="compact-input step-header" value="${step.question_header || ''}">
                </label>
                <label>
                    <span>Question Body</span>
                    <textarea class="compact-input step-body" rows="3">${step.question_body || ''}</textarea>
                </label>
                <label>
                    <span>Question Footer</span>
                    <input type="text" class="compact-input step-footer" value="${step.question_footer || ''}">
                </label>
                <label>
                    <span>Fallback Next Step</span>
                    <input type="text" class="compact-input step-next" value="${step.next_step_id || ''}">
                </label>
            </div>

            ${hasOptions ? `
                <div class="options-section">
                    <div class="builder-header">
                        <label class="eyebrow">Interactive Options (Buttons)</label>
                        <button class="secondary compact-btn add-opt-btn">+ Add Button</button>
                    </div>
                    <div class="options-list">${optionsHtml}</div>
                </div>
            ` : ''}

            <div class="form-actions" style="justify-content: flex-end; margin-top: 16px;">
                <button class="primary save-step-btn">Update Step</button>
            </div>
        </div>
    `;

    // Event Listeners for Step
    card.querySelector(".save-step-btn").onclick = () => saveWorkflowStep(step.step_id, card);
    card.querySelector(".delete-step").onclick = () => deleteWorkflowStepUI(step.step_id);
    card.querySelector(".move-up")?.addEventListener("click", () => reorderWorkflowStepUI(index, index - 1));
    card.querySelector(".move-down")?.addEventListener("click", () => reorderWorkflowStepUI(index, index + 1));

    if (hasOptions) {
        card.querySelector(".add-opt-btn").onclick = () => addOptionUI(step.id, card);
        card.querySelectorAll(".delete-opt").forEach(btn => {
            btn.onclick = () => btn.closest(".option-item").remove();
        });
    }

    return card;
}

async function saveWorkflowStep(stepId, card) {
    const selectedTenant = getSelectedTenant();
    if (!selectedTenant) return;

    const options = Array.from(card.querySelectorAll(".option-item")).map(opt => ({
        option_id: opt.querySelector(".opt-title").value.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        title: opt.querySelector(".opt-title").value,
        value: opt.querySelector(".opt-value").value,
        next_step_override: opt.querySelector(".opt-next").value
    }));

    const stepData = {
        step_id: stepId,
        kind: card.querySelector(".step-kind").value,
        question_header: card.querySelector(".step-header").value,
        question_body: card.querySelector(".step-body").value,
        question_footer: card.querySelector(".step-footer").value,
        next_step_id: card.querySelector(".step-next").value,
        options // Pass options too if needed for bulk upsert, but we'll stick to a simple strategy
    };

    try {
        const data = await fetchJson(`/admin/workflow/step`, {
            method: "POST",
            body: JSON.stringify({ tenantId: selectedTenant.id, step: stepData })
        });
        if (data.success) {
            // After step is saved, also upsert all options
            if (options.length > 0) {
                for (const opt of options) {
                    await fetchJson(`/admin/workflow/option`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ tenantId: selectedTenant.id, option: opt })
                    });
                }
            }
            showToast("Step updated successfully", "success");
            loadWorkflowData();
        }
    } catch (err) {
        showToast("Save step failed", "error");
    }
}

async function deleteWorkflowStepUI(stepId) {
    if (!confirm(`Are you sure you want to delete step '${stepId}'?`)) return;
    const selectedTenant = getSelectedTenant();
    try {
        await fetchJson(`/admin/workflow/step`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: selectedTenant.id, stepId })
        });
        showToast("Step deleted");
        loadWorkflowData();
    } catch (err) {
        showToast("Delete failed", "error");
    }
}

async function reorderWorkflowStepUI(fromIndex, toIndex) {
    const selectedTenant = getSelectedTenant();
    const updatedSteps = [...workflowStepsData];
    const [moved] = updatedSteps.splice(fromIndex, 1);
    updatedSteps.splice(toIndex, 0, moved);

    const steps = updatedSteps.map(s => s.step_id);

    try {
        await fetchJson(`/admin/workflow/reorder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: selectedTenant.id, steps })
        });
        loadWorkflowData();
    } catch (err) {
        showToast("Reorder failed", "error");
    }
}

function addOptionUI(stepDbId, card) {
    const list = card.querySelector(".options-list");
    const div = document.createElement("div");
    div.className = "option-item";
    div.innerHTML = `
        <input type="text" placeholder="Button Title" class="compact-input opt-title">
        <input type="text" placeholder="Value" class="compact-input opt-value">
        <input type="text" placeholder="Next Step ID" class="compact-input opt-next">
        <button class="secondary btn-icon delete-opt" title="Remove">&times;</button>
    `;
    div.querySelector(".delete-opt").onclick = () => div.remove();
    list.appendChild(div);
}

function renderHolidayList() {
    const list = document.getElementById("holidayList");
    list.innerHTML = "";
    currentSettingHolidays.sort().forEach((date, index) => {
        const li = document.createElement("li");
        li.className = "tag-item";
        li.innerHTML = `<span>${date}</span><button type="button" class="del-btn">&times;</button>`;
        li.querySelector(".del-btn").onclick = () => {
            currentSettingHolidays.splice(index, 1);
            renderHolidayList();
        };
        list.appendChild(li);
    });
}

function renderServicesSettingsTable(services) {
    const tbody = document.getElementById("servicesSettingsTableBody");
    tbody.innerHTML = "";
    services.forEach(s => {
        const tr = document.createElement("tr");

        // ID cell
        const idCell = document.createElement('td');
        idCell.textContent = s.id;
        tr.appendChild(idCell);

        // Name input cell
        const nameCell = document.createElement('td');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = s.name;
        nameInput.className = 'inline-edit service-name-input';
        nameCell.appendChild(nameInput);
        tr.appendChild(nameCell);

        // Status cell
        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge ${s.is_active ? 'active' : 'inactive'}`;
        statusBadge.textContent = s.is_active ? 'Active' : 'Disabled';
        statusCell.appendChild(statusBadge);
        tr.appendChild(statusCell);

        // Actions cell
        const actionsCell = document.createElement('td');
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'secondary compact-btn toggle-status';
        toggleBtn.textContent = s.is_active ? 'Disable' : 'Enable';
        toggleBtn.onclick = () => saveService(s.id, { name: tr.querySelector(".service-name-input").value, is_active: !s.is_active });

        const saveBtn = document.createElement('button');
        saveBtn.className = 'primary compact-btn save-service';
        saveBtn.textContent = 'Save';
        saveBtn.onclick = () => saveService(s.id, { name: tr.querySelector(".service-name-input").value, is_active: s.is_active });

        actionsCell.appendChild(toggleBtn);
        actionsCell.appendChild(saveBtn);
        tr.appendChild(actionsCell);

        tbody.appendChild(tr);
    });
}

function renderProvidersSettingsTable(providers, services) {
    const tbody = document.getElementById("providersSettingsTableBody");
    tbody.innerHTML = "";
    providers.forEach(p => {
        const tr = document.createElement("tr");

        // ID cell
        const idCell = document.createElement('td');
        idCell.textContent = p.id;
        tr.appendChild(idCell);

        // Name input cell
        const nameCell = document.createElement('td');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = p.name;
        nameInput.className = 'inline-edit provider-name-input';
        nameCell.appendChild(nameInput);
        tr.appendChild(nameCell);

        // Service select cell
        const serviceCell = document.createElement('td');
        const serviceSelect = document.createElement('select');
        serviceSelect.className = 'inline-edit provider-service-select';

        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = '(None - All Services)';
        serviceSelect.appendChild(noneOption);

        services.forEach(s => {
            const option = document.createElement('option');
            option.value = s.id;
            option.textContent = s.name;
            if (p.service_id == s.id) {
                option.selected = true;
            }
            serviceSelect.appendChild(option);
        });

        serviceCell.appendChild(serviceSelect);
        tr.appendChild(serviceCell);

        // Status cell
        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge ${p.is_active ? 'active' : 'inactive'}`;
        statusBadge.textContent = p.is_active ? 'Active' : 'Disabled';
        statusCell.appendChild(statusBadge);
        tr.appendChild(statusCell);

        // Actions cell
        const actionsCell = document.createElement('td');
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'secondary compact-btn toggle-status';
        toggleBtn.textContent = p.is_active ? 'Disable' : 'Enable';
        toggleBtn.onclick = () => saveProvider(p.id, {
            name: tr.querySelector(".provider-name-input").value,
            service_id: tr.querySelector(".provider-service-select").value,
            is_active: !p.is_active
        });

        const saveBtn = document.createElement('button');
        saveBtn.className = 'primary compact-btn save-provider';
        saveBtn.textContent = 'Save';
        saveBtn.onclick = () => saveProvider(p.id, {
            name: tr.querySelector(".provider-name-input").value,
            service_id: tr.querySelector(".provider-service-select").value,
            is_active: p.is_active
        });

        actionsCell.appendChild(toggleBtn);
        actionsCell.appendChild(saveBtn);
        tr.appendChild(actionsCell);

        tbody.appendChild(tr);
    });
}

async function saveSettingsConfig(settings) {
    const selectedTenant = getSelectedTenant();
    if (!selectedTenant) return;

    try {
        await fetchJson(`/admin/settings/config`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: selectedTenant.id, settings })
        });
        showToast("Settings saved", "success");
        await loadSettings();
    } catch (err) {
        showToast("Save failed", "error");
    }
}

async function saveService(id, data) {
    const selectedTenant = getSelectedTenant();
    try {
        await fetchJson(`/admin/settings/services`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: selectedTenant.id, service: { id, ...data } })
        });
        showToast("Service updated", "success");
        await loadSettings();
    } catch (err) {
        showToast("Service update failed", "error");
    }
}

async function saveProvider(id, data) {
    const selectedTenant = getSelectedTenant();
    try {
        await fetchJson(`/admin/settings/providers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: selectedTenant.id, provider: { id, ...data } })
        });
        showToast("Provider updated", "success");
        await loadSettings();
    } catch (err) {
        showToast("Provider update failed", "error");
    }
}

function initSettingsEvents() {
    const tabButtons = document.querySelectorAll(".settings-tabs .pill");
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            currentSettingsTab = btn.dataset.tab;
            tabButtons.forEach(b => b.classList.toggle("active", b === btn));
            document.querySelectorAll(".settings-tab-pane").forEach(pane => {
                pane.classList.toggle("hidden", pane.id !== `tab-${currentSettingsTab}`);
            });
        });
    });

    // General Form
    document.getElementById("generalSettingsForm").addEventListener("submit", (e) => {
        e.preventDefault();
        saveSettingsConfig({
            timezone: document.getElementById("timezoneInput").value,
            max_parallel_appointments: parseInt(document.getElementById("parallelInput").value),
            phone_number_id: document.getElementById("phoneNumberIdInput").value,
            token: document.getElementById("whatsappTokenInput").value,
            app_secret: document.getElementById("appSecretInput").value,
            webhook_verify_token: document.getElementById("verifyTokenInput").value
        });
    });

    // Schedule Form
    document.getElementById("scheduleSettingsForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const weekOffs = Array.from(document.querySelectorAll("#weekOffsContainer input:checked")).map(cb => parseInt(cb.value));
        saveSettingsConfig({
            opening_hour: parseInt(document.getElementById("openingHourInput").value),
            closing_hour: parseInt(document.getElementById("closingHourInput").value),
            slot_duration: parseInt(document.getElementById("slotDurationInput").value),
            week_offs: weekOffs,
            business_holidays: currentSettingHolidays
        });
    });

    // Holiday Addition
    document.getElementById("addHolidayBtn").onclick = () => {
        const val = document.getElementById("newHolidayInput").value;
        if (val && !currentSettingHolidays.includes(val)) {
            currentSettingHolidays.push(val);
            renderHolidayList();
            document.getElementById("newHolidayInput").value = "";
        }
    };

    // Add New Buttons
    document.getElementById("addNewStepButton").onclick = () => {
        const stepId = prompt("Enter a unique ID for this step (e.g. 'check_insurance'):");
        if (!stepId) return;
        const kind = prompt("Enter kind (service, custom_choice, date_choice, confirmation, text):", "custom_choice");
        if (!kind) return;
        
        saveWorkflowStep(stepId.trim().toLowerCase().replace(/ /g, '_'), {
            querySelector: (sel) => {
                const defaults = {
                    ".step-kind": { value: kind },
                    ".step-header": { value: "New Question" },
                    ".step-body": { value: "Please choose an option." },
                    ".step-footer": { value: "" },
                    ".step-next": { value: "" }
                };
                return defaults[sel] || { value: "" };
            },
            querySelectorAll: () => []
        });
    };

    document.getElementById("addNewServiceBtn").onclick = () => {
        const name = prompt("Enter service name:");
        if (name) saveService(null, { name, is_active: true });
    };

    document.getElementById("addNewProviderBtn").onclick = () => {
        const name = prompt("Enter provider name:");
        if (name) saveProvider(null, { name, is_active: true });
    };
}

// ==========================================
// WORKFLOW EVENT LISTENERS
// ==========================================

// Workflow tenant selection
document.getElementById('workflowTenantSelect')?.addEventListener('change', async (e) => {
    selectedWorkflowTenant = e.target.value;
    await loadWorkflowSteps(selectedWorkflowTenant);
});

// Workflow search
document.getElementById('workflowSearch')?.addEventListener('input', (e) => {
    // Implement search filtering
    const searchTerm = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#workflowTableBody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
});

// Workflow type filter
document.getElementById('stepTypeFilter')?.addEventListener('change', (e) => {
    const filter = e.target.value;
    const rows = document.querySelectorAll('#workflowTableBody tr');
    rows.forEach(row => {
        if (filter === 'all') {
            row.style.display = '';
        } else {
            const typeCell = row.querySelector('td:nth-child(2)');
            const type = typeCell?.textContent.toLowerCase();
            row.style.display = type === filter ? '' : 'none';
        }
    });
});

// Add workflow step button
document.getElementById('addWorkflowStepButton')?.addEventListener('click', () => {
    if (!selectedWorkflowTenant) {
        showToast('Please select a tenant first', 'error');
        return;
    }
    showWorkflowModal();
});

// Communications form
document.getElementById('messageForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Implement message sending logic
    showToast('Message sending functionality coming soon', 'info');
});

// Workflow modal functions
function showWorkflowModal(stepData = null) {
    const modal = document.getElementById('workflowModal');
    const form = document.getElementById('workflowStepForm');
    const title = document.getElementById('workflowModalTitle');

    if (stepData) {
        title.textContent = 'Edit Step';
        // Populate form with step data
        document.getElementById('stepOrder').value = stepData.order || '';
        document.getElementById('stepType').value = stepData.type || 'question';
        document.getElementById('stepMessage').value = stepData.message || '';
        document.getElementById('stepOptions').value = stepData.options ? stepData.options.join('\n') : '';
        document.getElementById('nextStep').value = stepData.nextStep || '';
        document.getElementById('stepStatus').value = stepData.status || 'active';
    } else {
        title.textContent = 'Add New Step';
        form.reset();
    }

    modal.classList.remove('hidden');
}

function hideWorkflowModal() {
    document.getElementById('workflowModal').classList.add('hidden');
}

// Global functions for workflow actions
function addNewWorkflowStep() {
    showWorkflowModal();
}

function editWorkflowStep(stepId) {
    // Find step data and show modal
    showToast('Edit functionality coming soon', 'info');
}

function deleteWorkflowStep(stepId) {
    if (confirm('Are you sure you want to delete this workflow step?')) {
        showToast('Delete functionality coming soon', 'info');
    }
}

function viewMessage(messageId) {
    showToast('View message functionality coming soon', 'info');
}

// Workflow modal event listeners
document.getElementById('workflowModalClose')?.addEventListener('click', hideWorkflowModal);
document.getElementById('workflowCancelButton')?.addEventListener('click', hideWorkflowModal);

document.getElementById('workflowStepForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Implement save logic
    showToast('Save functionality coming soon', 'info');
    hideWorkflowModal();
});

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
    button.addEventListener("click", () => {
        const target = button.dataset.screenTarget;
        setActiveScreen(target);
        if (target === "analyticsScreen") {
            loadAnalytics();
        } else if (target === "communicationsScreen") {
            loadCommunications();
        } else if (target === "workflowScreen") {
            loadWorkflowData();
        } else if (target === "settingsScreen") {
            loadSettings();
        }
    });
});

refreshGlobalButton.addEventListener("click", refreshPortal);
refreshBookingsButton.addEventListener("click", loadBookings);
refreshOverviewButton?.addEventListener("click", refreshPortal);
refreshAnalyticsButton?.addEventListener("click", loadAnalytics);
refreshWorkflowButton?.addEventListener("click", loadWorkflowData);
refreshSettingsButton?.addEventListener("click", loadSettings);

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

// // Use event delegation for stat cards to handle dynamically created elements
document.body.addEventListener("click", async (event) => {
    const card = event.target.closest('.stat-card');
    if (!card) return;

    let changed = false;

    // Handle range filter (global view)
    if (card.dataset.range) {
        currentRange = card.dataset.range;
        currentFilter = "all";
        dateInput.value = "";
        if (dateInput.type === "date") {
            dateInput.type = "text";
        }
        changed = true;
    }

    // Handle status filter (tenant view)
    if (card.dataset.filter) {
        currentFilter = card.dataset.filter;
        changed = true;
    }

    if (!changed) return;

    // Trigger navigation and filter update
    document.querySelectorAll(".pill").forEach((item) => {
        item.classList.toggle("active", item.dataset.filter === currentFilter);
    });

    setActiveScreen("bookingsScreen");
    currentPage = 1;
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
    const originalHtml = actionButton.innerHTML;
    actionButton.innerHTML = `<svg class="spin" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"></path></svg>`;

    try {
        await updateBookingStatus(bookingId, action, { tenantId });
    } finally {
        actionButton.disabled = false;
        actionButton.innerHTML = originalHtml;
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
initSettingsEvents();
tenantInput.value = localStorage.getItem("adminToken") || "";
setActiveScreen(currentScreen);

if (tenantInput.value.trim()) {
    saveToken(tenantInput.value.trim());
    loginStatus.textContent = "Restoring your session...";
    refreshPortal();
} else {
    showLogin();
}

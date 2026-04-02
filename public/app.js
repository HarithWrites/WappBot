let allBookings = [];
let currentFilter = "all";
let searchTerm = "";
let stream;
let streamTenantToken = null;
let adminToken = "";
let tenantSettings = null;

const loginScreen = document.getElementById("loginScreen");
const dashboardShell = document.getElementById("dashboardShell");
const loginForm = document.getElementById("loginForm");
const tenantInput = document.getElementById("tenantId");
const dateInput = document.getElementById("dateFilter");
const searchInput = document.getElementById("searchInput");
const bookingsTableBody = document.getElementById("bookingsTableBody");
const dashboardEmpty = document.getElementById("dashboardEmpty");
const connectionStatus = document.getElementById("connectionStatus");
const loginStatus = document.getElementById("loginStatus");
const logoutButton = document.getElementById("logoutButton");
const refreshSidebarButton = document.getElementById("refreshSidebarButton");
const settingsForm = document.getElementById("settingsForm");
const timezoneInput = document.getElementById("timezoneInput");
const parallelInput = document.getElementById("parallelInput");
const settingsStatus = document.getElementById("settingsStatus");
const tenantName = document.getElementById("tenantName");

function formatDisplayDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);

    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date);
}

function formatDisplayTime(timeString) {
    const [hours, minutes] = timeString.split(":");
    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0, 0);

    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function getWeekRange() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(today);
    start.setDate(today.getDate() + diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function isThisWeek(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    const { start, end } = getWeekRange();
    return date >= start && date <= end;
}

function setStats() {
    const weekCount = allBookings.filter((booking) => isThisWeek(booking.booking_date)).length;
    const pendingCount = allBookings.filter((booking) => booking.status === "pending").length;

    document.getElementById("statTotal").textContent = allBookings.length;
    document.getElementById("statWeek").textContent = weekCount;
    document.getElementById("statPending").textContent = pendingCount;
}

function getFilteredBookings() {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return allBookings.filter((booking) => {
        if (currentFilter !== "all" && booking.status !== currentFilter) {
            return false;
        }

        if (dateInput.value && booking.booking_date !== dateInput.value) {
            return false;
        }

        if (!normalizedSearch) {
            return true;
        }

        return [
            booking.service_name,
            booking.phone,
            booking.status,
            booking.booking_date,
            booking.booking_time
        ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
    });
}

function createBookingRow(booking) {
    const row = document.createElement("tr");
    const isCurrentWeek = isThisWeek(booking.booking_date);

    row.innerHTML = `
        <td>
            <div class="cell-title">${booking.service_name}</div>
            <div class="cell-copy">Booking #${booking.id}${isCurrentWeek ? " - this week" : ""}</div>
        </td>
        <td>
            <div class="cell-title">${booking.phone}</div>
            <div class="cell-copy">Tenant ${booking.tenant_id}</div>
        </td>
        <td>
            <div class="cell-title">${formatDisplayDate(booking.booking_date)}</div>
            <div class="cell-copy">${formatDisplayTime(booking.booking_time)}</div>
        </td>
        <td>
            <span class="status-badge status-${booking.status}">${booking.status}</span>
            <div class="cell-copy">${booking.created_at ? new Date(booking.created_at).toLocaleString("en-IN") : ""}</div>
        </td>
        <td>
            <div class="action-stack">
                <button class="approve" data-action="approve" data-id="${booking.id}" type="button">Confirm</button>
                <button class="pending" data-action="pending" data-id="${booking.id}" type="button">Pending</button>
                <button class="reject" data-action="reject" data-id="${booking.id}" type="button">Reject</button>
            </div>
        </td>
    `;

    return row;
}

function renderDashboard() {
    bookingsTableBody.innerHTML = "";
    const filteredBookings = getFilteredBookings();

    if (!filteredBookings.length) {
        dashboardEmpty.classList.remove("hidden");
        return;
    }

    dashboardEmpty.classList.add("hidden");

    filteredBookings.forEach((booking) => {
        bookingsTableBody.appendChild(createBookingRow(booking));
    });
}

function renderTenantSettings() {
    if (!tenantSettings) {
        return;
    }

    tenantName.textContent = tenantSettings.business_name || `Tenant ${tenantSettings.id}`;
    timezoneInput.value = tenantSettings.timezone || "UTC";
    parallelInput.value = tenantSettings.max_parallel_appointments || 1;
}

function render() {
    setStats();
    renderTenantSettings();
    renderDashboard();
}

function buildBookingsUrl() {
    const params = new URLSearchParams();
    params.set("token", adminToken);
    return `/admin/bookings?${params.toString()}`;
}

function buildSettingsUrl() {
    const params = new URLSearchParams();
    params.set("token", adminToken);
    return `/admin/settings?${params.toString()}`;
}

function closeStream() {
    if (stream) {
        stream.close();
        stream = null;
    }

    streamTenantToken = null;
}

function showLogin(message = "Your token stays saved on this browser until you sign out.") {
    closeStream();
    allBookings = [];
    tenantSettings = null;
    render();
    loginScreen.classList.remove("hidden");
    dashboardShell.classList.add("hidden");
    loginStatus.textContent = message;
    connectionStatus.textContent = "Signed out.";
    tenantInput.focus();
}

function showDashboard() {
    loginScreen.classList.add("hidden");
    dashboardShell.classList.remove("hidden");
}

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

async function loadBookings() {
    if (!adminToken) {
        showLogin();
        return;
    }

    connectionStatus.textContent = "Loading bookings...";

    try {
        const [bookings, settings] = await Promise.all([
            fetchJson(buildBookingsUrl()),
            fetchJson(buildSettingsUrl())
        ]);

        allBookings = Array.isArray(bookings) ? bookings : [];
        tenantSettings = settings;
        showDashboard();
        render();
        connectionStatus.textContent = "Live updates connected.";
        settingsStatus.textContent = `Only slots with remaining capacity are shown to users. Current parallel limit: ${tenantSettings.max_parallel_appointments}.`;
        connectStream(adminToken);
    } catch (err) {
        if (err.message !== "Unauthorized") {
            console.error(err);
            connectionStatus.textContent = "Could not load bookings right now.";
        }
    }
}

async function updateBookingStatus(bookingId, status) {
    const endpoint = status === "confirmed"
        ? "/admin/approve"
        : status === "pending"
            ? "/admin/pending"
            : "/admin/reject";
    const actionName = status === "confirmed" ? "approve" : status;
    const button = document.querySelector(`[data-id="${bookingId}"][data-action="${actionName}"]`);

    if (button) {
        button.disabled = true;
    }

    try {
        const data = await fetchJson(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ bookingId, token: adminToken })
        });

        if (!data.success) {
            throw new Error("Status update failed");
        }

        await loadBookings();
    } catch (err) {
        if (err.message !== "Unauthorized") {
            console.error(err);
            connectionStatus.textContent = "Status update failed. Please retry.";
        }
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

async function saveSettings(event) {
    event.preventDefault();

    settingsStatus.textContent = "Saving settings...";

    try {
        const data = await fetchJson("/admin/settings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                token: adminToken,
                timezone: timezoneInput.value.trim(),
                max_parallel_appointments: parallelInput.value
            })
        });

        tenantSettings = data.tenant;
        renderTenantSettings();
        settingsStatus.textContent = `Saved. Users will now see slots based on a parallel limit of ${tenantSettings.max_parallel_appointments}.`;
        await loadBookings();
    } catch (err) {
        if (err.message !== "Unauthorized") {
            console.error(err);
            settingsStatus.textContent = "Could not save settings right now.";
        }
    }
}

function connectStream(token) {
    if (!token || (stream && streamTenantToken === token)) {
        return;
    }

    closeStream();

    streamTenantToken = token;
    const query = `?token=${encodeURIComponent(token)}`;
    stream = new EventSource(`/admin/bookings/stream${query}`);

    stream.onopen = () => {
        connectionStatus.textContent = "Live updates connected.";
    };

    stream.onmessage = (event) => {
        try {
            const payload = JSON.parse(event.data);

            if (payload.type === "connected") {
                return;
            }
        } catch (err) {
            console.error(err);
        }

        loadBookings();
    };

    stream.onerror = () => {
        connectionStatus.textContent = "Live connection interrupted. Retrying...";
    };
}

function resetFilters() {
    dateInput.value = "";
    searchInput.value = "";
    searchTerm = "";
    currentFilter = "all";
    document.querySelectorAll(".pill").forEach((pill) => {
        pill.classList.toggle("active", pill.dataset.filter === "all");
    });
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = tenantInput.value.trim();

    if (!token) {
        loginStatus.textContent = "Enter your admin token to continue.";
        return;
    }

    loginStatus.textContent = "Signing you in...";
    saveToken(token);
    await loadBookings();
});

settingsForm.addEventListener("submit", saveSettings);
document.getElementById("loadButton").addEventListener("click", loadBookings);
document.getElementById("clearButton").addEventListener("click", () => {
    resetFilters();
    renderDashboard();
});
refreshSidebarButton.addEventListener("click", loadBookings);

logoutButton.addEventListener("click", () => {
    clearToken();
    resetFilters();
    showLogin("Signed out. Enter your admin token to open the dashboard again.");
});

document.querySelectorAll(".pill").forEach((pill) => {
    pill.addEventListener("click", () => {
        currentFilter = pill.dataset.filter;
        document.querySelectorAll(".pill").forEach((item) => {
            item.classList.toggle("active", item === pill);
        });
        renderDashboard();
    });
});

searchInput.addEventListener("input", (event) => {
    searchTerm = event.target.value;
    renderDashboard();
});

dateInput.addEventListener("change", renderDashboard);
bookingsTableBody.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");

    if (!actionButton) {
        return;
    }

    const { action, id } = actionButton.dataset;
    const nextStatus = action === "approve"
        ? "confirmed"
        : action === "pending"
            ? "pending"
            : "rejected";
    updateBookingStatus(id, nextStatus);
});

tenantInput.value = localStorage.getItem("adminToken") || "";

if (tenantInput.value.trim()) {
    saveToken(tenantInput.value.trim());
    loginStatus.textContent = "Restoring your session...";
    loadBookings();
} else {
    showLogin();
}

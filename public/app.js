let allBookings = [];
let currentFilter = "all";
let searchTerm = "";
let stream;
let streamTenantToken = null;
let adminToken = "";
let tenantSettings = null;
let activeScreen = "manageAppointments";
let closeBookingId = null;

const DEFAULT_TENANT_SETTINGS = {
    id: "",
    business_name: "Manage Appointments",
    timezone: "UTC",
    max_parallel_appointments: 1
};

const loginScreen = document.getElementById("loginScreen");
const dashboardShell = document.getElementById("dashboardShell");
const loginForm = document.getElementById("loginForm");
const tenantInput = document.getElementById("tenantId");
const dateInput = document.getElementById("dateFilter");
const searchInput = document.getElementById("searchInput");
const bookingsTableBody = document.getElementById("bookingsTableBody");
const weeklyBookingsTableBody = document.getElementById("weeklyBookingsTableBody");
const archiveTableBody = document.getElementById("archiveTableBody");
const dashboardEmpty = document.getElementById("dashboardEmpty");
const weeklyEmpty = document.getElementById("weeklyEmpty");
const archiveEmpty = document.getElementById("archiveEmpty");
const connectionStatus = document.getElementById("connectionStatus");
const loginStatus = document.getElementById("loginStatus");
const logoutButton = document.getElementById("logoutButton");
const settingsForm = document.getElementById("settingsForm");
const timezoneInput = document.getElementById("timezoneInput");
const parallelInput = document.getElementById("parallelInput");
const settingsStatus = document.getElementById("settingsStatus");
const tenantName = document.getElementById("tenantName");
const sidebarBusinessName = document.getElementById("sidebarBusinessName");
const screenButtons = document.querySelectorAll("[data-screen-target]");
const screens = document.querySelectorAll(".workspace-screen");
const homeRefreshButton = document.getElementById("homeRefreshButton");
const homeSearchButton = document.getElementById("homeSearchButton");
const homeWeekCount = document.getElementById("homeWeekCount");
const homeConnectionLabel = document.getElementById("homeConnectionLabel");
const archiveCount = document.getElementById("archiveCount");
const closeModal = document.getElementById("closeModal");
const closeForm = document.getElementById("closeForm");
const closeRemarks = document.getElementById("closeRemarks");
const closeModalDismiss = document.getElementById("closeModalDismiss");
const closeModalSummary = document.getElementById("closeModalSummary");

function formatDisplayDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);

    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date);
}

function formatDisplayTime(timeString) {
    const [hours, minutes] = String(timeString).split(":");
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

function getTenantSettings() {
    return tenantSettings || DEFAULT_TENANT_SETTINGS;
}

function getActiveBookings() {
    return allBookings.filter((booking) => booking.status !== "closed");
}

function getCurrentWeekBookings() {
    return getActiveBookings().filter((booking) => isThisWeek(booking.booking_date));
}

function getArchivedBookings() {
    return allBookings.filter((booking) => booking.status === "closed");
}

function setStats() {
    const activeBookings = getActiveBookings();
    const weekCount = getCurrentWeekBookings().length;
    const pendingCount = activeBookings.filter((booking) => booking.status === "pending").length;

    document.getElementById("statTotal").textContent = activeBookings.length;
    document.getElementById("statWeek").textContent = weekCount;
    document.getElementById("statPending").textContent = pendingCount;
    homeWeekCount.textContent = `${weekCount} appointments`;
    archiveCount.textContent = `${getArchivedBookings().length} archived appointments`;
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
            booking.booking_time,
            booking.tenant_name,
            booking.close_remarks
        ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
    });
}

function getBusinessLabel(booking) {
    return booking.tenant_name || getTenantSettings().business_name || `Tenant ${booking.tenant_id}`;
}

function getActionMarkup(booking) {
    if (booking.status === "closed") {
        return '<span class="cell-copy">Archived</span>';
    }

    return `
        <div class="action-stack">
            <button class="approve" data-action="approve" data-id="${booking.id}" type="button">Confirm</button>
            <button class="pending" data-action="pending" data-id="${booking.id}" type="button">Pending</button>
            <button class="reject" data-action="reject" data-id="${booking.id}" type="button">Reject</button>
            <button class="secondary" data-action="close" data-id="${booking.id}" type="button">Close</button>
        </div>
    `;
}

function createBookingRow(booking) {
    const row = document.createElement("tr");

    row.innerHTML = `
        <td>
            <div class="cell-title">${getBusinessLabel(booking)}</div>
            <div class="cell-copy">Tenant ID ${booking.tenant_id}</div>
        </td>
        <td>
            <div class="cell-title">${booking.service_name}</div>
            <div class="cell-copy">Booking #${booking.id}</div>
        </td>
        <td>
            <div class="cell-title">${booking.phone}</div>
            <div class="cell-copy">${booking.close_remarks || "No remarks"}</div>
        </td>
        <td>
            <div class="cell-title">${formatDisplayDate(booking.booking_date)}</div>
            <div class="cell-copy">${formatDisplayTime(booking.booking_time)}</div>
        </td>
        <td>
            <span class="status-badge status-${booking.status}">${booking.status}</span>
            <div class="cell-copy">${booking.created_at ? new Date(booking.created_at).toLocaleString("en-IN") : ""}</div>
        </td>
        <td>${getActionMarkup(booking)}</td>
    `;

    return row;
}

function createArchiveRow(booking) {
    const row = document.createElement("tr");

    row.innerHTML = `
        <td>
            <div class="cell-title">${getBusinessLabel(booking)}</div>
            <div class="cell-copy">Tenant ID ${booking.tenant_id}</div>
        </td>
        <td>
            <div class="cell-title">${booking.service_name}</div>
            <div class="cell-copy">Booking #${booking.id}</div>
        </td>
        <td>
            <div class="cell-title">${booking.phone}</div>
            <div class="cell-copy">${formatDisplayDate(booking.booking_date)} at ${formatDisplayTime(booking.booking_time)}</div>
        </td>
        <td>
            <div class="cell-title">${booking.close_remarks || "No remarks provided"}</div>
            <div class="cell-copy">${booking.closed_at ? new Date(booking.closed_at).toLocaleString("en-IN") : "Closed timestamp unavailable"}</div>
        </td>
        <td>
            <span class="status-badge status-closed">closed</span>
        </td>
    `;

    return row;
}

function renderTableBody(target, bookings, emptyState) {
    target.innerHTML = "";

    if (!bookings.length) {
        emptyState.classList.remove("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    bookings.forEach((booking) => {
        target.appendChild(createBookingRow(booking));
    });
}

function renderManageScreen() {
    renderTableBody(weeklyBookingsTableBody, getCurrentWeekBookings(), weeklyEmpty);
}

function renderSearchScreen() {
    renderTableBody(bookingsTableBody, getFilteredBookings(), dashboardEmpty);
}

function renderArchiveScreen() {
    archiveTableBody.innerHTML = "";
    const archivedBookings = getArchivedBookings();

    if (!archivedBookings.length) {
        archiveEmpty.classList.remove("hidden");
        return;
    }

    archiveEmpty.classList.add("hidden");
    archivedBookings.forEach((booking) => {
        archiveTableBody.appendChild(createArchiveRow(booking));
    });
}

function renderTenantSettings() {
    const settings = getTenantSettings();
    const displayName = settings.business_name
        || (settings.id ? `Tenant ${settings.id}` : DEFAULT_TENANT_SETTINGS.business_name);

    tenantName.textContent = displayName;
    sidebarBusinessName.textContent = displayName;
    timezoneInput.value = settings.timezone || DEFAULT_TENANT_SETTINGS.timezone;
    parallelInput.value = settings.max_parallel_appointments || DEFAULT_TENANT_SETTINGS.max_parallel_appointments;
}

function render() {
    setStats();
    renderTenantSettings();
    renderManageScreen();
    renderSearchScreen();
    renderArchiveScreen();
}

function setActiveScreen(screenId) {
    activeScreen = screenId;

    screenButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.screenTarget === screenId);
    });

    screens.forEach((screen) => {
        screen.classList.toggle("hidden", screen.id !== screenId);
    });
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

function closeArchiveModal() {
    closeBookingId = null;
    closeRemarks.value = "";
    closeModal.classList.add("hidden");
}

function openCloseModal(bookingId) {
    const booking = allBookings.find((item) => String(item.id) === String(bookingId));

    if (!booking) {
        return;
    }

    closeBookingId = bookingId;
    closeModalSummary.textContent = `${booking.service_name} for ${booking.phone} on ${formatDisplayDate(booking.booking_date)} at ${formatDisplayTime(booking.booking_time)}.`;
    closeRemarks.value = booking.close_remarks || "";
    closeModal.classList.remove("hidden");
    closeRemarks.focus();
}

function showLogin(message = "Your token stays saved on this browser until you sign out.") {
    closeStream();
    closeArchiveModal();
    allBookings = [];
    tenantSettings = null;
    render();
    loginScreen.classList.remove("hidden");
    dashboardShell.classList.add("hidden");
    loginStatus.textContent = message;
    connectionStatus.textContent = "Signed out.";
    homeConnectionLabel.textContent = "Signed out";
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
    homeConnectionLabel.textContent = "Loading";

    try {
        const bookings = await fetchJson(buildBookingsUrl());
        let settings = null;

        try {
            settings = await fetchJson(buildSettingsUrl());
        } catch (settingsError) {
            if (settingsError.message !== "Unauthorized") {
                console.error("settings load error:", settingsError);
            } else {
                throw settingsError;
            }
        }

        allBookings = Array.isArray(bookings) ? bookings : [];
        tenantSettings = {
            ...DEFAULT_TENANT_SETTINGS,
            ...(tenantSettings || {}),
            ...(settings || {})
        };

        showDashboard();
        render();
        connectionStatus.textContent = `Live updates connected. Loaded ${allBookings.length} bookings.`;
        homeConnectionLabel.textContent = "Connected";
        settingsStatus.textContent = settings
            ? `Settings loaded. Current parallel limit: ${tenantSettings.max_parallel_appointments}.`
            : "Bookings loaded. Settings could not be loaded, so the dashboard is using fallback values.";
        connectStream(adminToken);
    } catch (err) {
        if (err.message !== "Unauthorized") {
            console.error("loadBookings error:", err);
            connectionStatus.textContent = "Could not load bookings right now.";
            homeConnectionLabel.textContent = "Error";
        }
    }
}

async function updateBookingStatus(bookingId, status, options = {}) {
    const endpoint = status === "confirmed"
        ? "/admin/approve"
        : status === "pending"
            ? "/admin/pending"
            : status === "closed"
                ? "/admin/close"
                : "/admin/reject";
    const button = document.querySelector(`[data-id="${bookingId}"][data-action="${options.actionName || status}"]`);

    if (button) {
        button.disabled = true;
    }

    try {
        const data = await fetchJson(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                bookingId,
                token: adminToken,
                remarks: options.remarks || ""
            })
        });

        if (!data.success) {
            throw new Error("Status update failed");
        }

        closeArchiveModal();
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

        tenantSettings = {
            ...DEFAULT_TENANT_SETTINGS,
            ...(tenantSettings || {}),
            ...(data.tenant || {})
        };
        renderTenantSettings();
        settingsStatus.textContent = `Saved. Users now see availability using a parallel limit of ${tenantSettings.max_parallel_appointments}.`;
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
    stream = new EventSource(`/admin/bookings/stream?token=${encodeURIComponent(token)}`);

    stream.onopen = () => {
        connectionStatus.textContent = "Live updates connected.";
        homeConnectionLabel.textContent = "Connected";
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
        homeConnectionLabel.textContent = "Retrying";
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
    renderSearchScreen();
});
homeRefreshButton.addEventListener("click", loadBookings);
homeSearchButton.addEventListener("click", () => {
    setActiveScreen("searchAppointments");
});

screenButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setActiveScreen(button.dataset.screenTarget);
    });
});

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
        renderSearchScreen();
    });
});

searchInput.addEventListener("input", (event) => {
    searchTerm = event.target.value;
    renderSearchScreen();
});

dateInput.addEventListener("change", renderSearchScreen);

function handleTableAction(event) {
    const actionButton = event.target.closest("[data-action]");

    if (!actionButton) {
        return;
    }

    const { action, id } = actionButton.dataset;

    if (action === "close") {
        openCloseModal(id);
        return;
    }

    const nextStatus = action === "approve"
        ? "confirmed"
        : action === "pending"
            ? "pending"
            : "rejected";
    updateBookingStatus(id, nextStatus, { actionName: action });
}

bookingsTableBody.addEventListener("click", handleTableAction);
weeklyBookingsTableBody.addEventListener("click", handleTableAction);

closeModalDismiss.addEventListener("click", closeArchiveModal);
closeModal.addEventListener("click", (event) => {
    if (event.target === closeModal) {
        closeArchiveModal();
    }
});

closeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!closeBookingId) {
        return;
    }

    await updateBookingStatus(closeBookingId, "closed", {
        actionName: "close",
        remarks: closeRemarks.value.trim()
    });
});

tenantInput.value = localStorage.getItem("adminToken") || "";
renderTenantSettings();
setActiveScreen(activeScreen);

if (tenantInput.value.trim()) {
    saveToken(tenantInput.value.trim());
    loginStatus.textContent = "Restoring your session...";
    loadBookings();
} else {
    showLogin();
}

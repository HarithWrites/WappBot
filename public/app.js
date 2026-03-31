let allBookings = [];
let currentFilter = "all";
let stream;
let streamTenantId = null;

const tenantInput = document.getElementById("tenantId");
const dateInput = document.getElementById("dateFilter");
const bookingGroups = document.getElementById("bookingGroups");
const dashboardEmpty = document.getElementById("dashboardEmpty");
const weekHighlights = document.getElementById("weekHighlights");
const weekEmpty = document.getElementById("weekEmpty");
const connectionStatus = document.getElementById("connectionStatus");

function formatDisplayDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
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

function renderWeekHighlights() {
    const weekBookings = allBookings.filter((booking) => isThisWeek(booking.booking_date));
    weekHighlights.innerHTML = "";

    if (!weekBookings.length) {
        weekEmpty.classList.remove("hidden");
        return;
    }

    weekEmpty.classList.add("hidden");

    weekBookings.forEach((booking) => {
        const card = document.createElement("article");
        card.className = "highlight-card";
        card.innerHTML = `
            <div class="highlight-top">
                <span class="status-badge status-${booking.status}">${booking.status}</span>
                <span>Booking #${booking.id}</span>
            </div>
            <h3 class="booking-title">${booking.service_name}</h3>
            <p class="booking-copy">${formatDisplayDate(booking.booking_date)} at ${formatDisplayTime(booking.booking_time)}</p>
            <p class="booking-subtitle">Phone: ${booking.phone}</p>
            <p class="booking-subtitle">Tenant: ${booking.tenant_id}</p>
            <p class="booking-subtitle">Created: ${booking.created_at ? new Date(booking.created_at).toLocaleString("en-IN") : "N/A"}</p>
        `;
        weekHighlights.appendChild(card);
    });
}

function getFilteredBookings() {
    return allBookings.filter((booking) => {
        if (currentFilter !== "all" && booking.status !== currentFilter) {
            return false;
        }

        if (dateInput.value && booking.booking_date !== dateInput.value) {
            return false;
        }

        return true;
    });
}

function createBookingCard(booking) {
    const card = document.createElement("article");
    card.className = `booking-card${isThisWeek(booking.booking_date) ? " this-week" : ""}`;

    const isPending = booking.status === "pending";

    card.innerHTML = `
        <div class="booking-meta">
            <div>
                <h3 class="booking-title">${booking.service_name}</h3>
                <p class="booking-copy">${formatDisplayDate(booking.booking_date)} at ${formatDisplayTime(booking.booking_time)}</p>
                <p class="booking-subtitle">Phone: ${booking.phone}</p>
                <p class="booking-subtitle">Tenant: ${booking.tenant_id}</p>
                <p class="booking-subtitle">Created: ${booking.created_at ? new Date(booking.created_at).toLocaleString("en-IN") : "N/A"}</p>
            </div>
            <span class="status-badge status-${booking.status}">${booking.status}</span>
        </div>
        <div class="booking-actions">
            <p class="booking-subtitle">Booking #${booking.id}${isThisWeek(booking.booking_date) ? " is part of this week." : ""}</p>
            ${isPending ? `
                <div>
                    <button class="approve" data-action="approve" data-id="${booking.id}" type="button">Approve</button>
                    <button class="reject" data-action="reject" data-id="${booking.id}" type="button">Reject</button>
                </div>
            ` : ""}
        </div>
    `;

    return card;
}

function renderBookingGroup(title, bookings) {
    const section = document.createElement("section");
    section.className = "group-panel";

    section.innerHTML = `<h3>${title} (${bookings.length})</h3>`;

    const grid = document.createElement("div");
    grid.className = "booking-grid";

    bookings.forEach((booking) => {
        grid.appendChild(createBookingCard(booking));
    });

    section.appendChild(grid);
    return section;
}

function renderDashboard() {
    bookingGroups.innerHTML = "";
    const filteredBookings = getFilteredBookings();

    if (!filteredBookings.length) {
        dashboardEmpty.classList.remove("hidden");
        return;
    }

    dashboardEmpty.classList.add("hidden");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pending = filteredBookings.filter((booking) => booking.status === "pending" && !isThisWeek(booking.booking_date));
    const canceled = filteredBookings.filter((booking) => booking.status === "rejected");
    const upcoming = filteredBookings.filter((booking) => {
        const bookingDate = new Date(`${booking.booking_date}T00:00:00`);
        return booking.status !== "rejected" && booking.status !== "pending" && bookingDate >= today && !isThisWeek(booking.booking_date);
    });
    const old = filteredBookings.filter((booking) => {
        const bookingDate = new Date(`${booking.booking_date}T00:00:00`);
        return bookingDate < today && booking.status !== "rejected";
    });

    [
        ["Pending bookings", pending],
        ["Upcoming bookings", upcoming],
        ["Canceled bookings", canceled],
        ["Old bookings", old]
    ].forEach(([title, bookings]) => {
        if (bookings.length) {
            bookingGroups.appendChild(renderBookingGroup(title, bookings));
        }
    });

    if (!bookingGroups.children.length) {
        dashboardEmpty.classList.remove("hidden");
    }
}

function render() {
    setStats();
    renderWeekHighlights();
    renderDashboard();
}

function buildBookingsUrl() {
    const tenantId = tenantInput.value.trim();
    const params = new URLSearchParams();

    if (tenantId) {
        params.set("tenant_id", tenantId);
    }

    return `/admin/bookings?${params.toString()}`;
}

async function loadBookings() {
    const url = buildBookingsUrl();
    connectionStatus.textContent = "Loading bookings...";
    localStorage.setItem("tenantId", tenantInput.value.trim());

    try {
        const res = await fetch(url);
        const data = await res.json();

        allBookings = Array.isArray(data) ? data : [];
        render();
        connectionStatus.textContent = "Live updates connected.";
        connectStream(tenantInput.value.trim() || "");
    } catch (err) {
        console.error(err);
        connectionStatus.textContent = "Could not load bookings right now.";
    }
}

async function updateBookingStatus(bookingId, status) {
    const endpoint = status === "confirmed" ? "/admin/approve" : "/admin/reject";
    const button = document.querySelector(`[data-id="${bookingId}"][data-action="${status === "confirmed" ? "approve" : "reject"}"]`);

    if (button) {
        button.disabled = true;
    }

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ bookingId })
        });

        const data = await res.json();

        if (!data.success) {
            throw new Error("Status update failed");
        }

        await loadBookings();
    } catch (err) {
        console.error(err);
        connectionStatus.textContent = "Status update failed. Please retry.";
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

function connectStream(tenantId) {
    if (stream && streamTenantId === tenantId) {
        return;
    }

    if (stream) {
        stream.close();
    }

    streamTenantId = tenantId;
    const query = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
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

document.getElementById("loadButton").addEventListener("click", loadBookings);
document.getElementById("clearButton").addEventListener("click", () => {
    dateInput.value = "";
    currentFilter = "all";
    document.querySelectorAll(".pill").forEach((pill) => {
        pill.classList.toggle("active", pill.dataset.filter === "all");
    });
    loadBookings();
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

dateInput.addEventListener("change", renderDashboard);
bookingGroups.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");

    if (!actionButton) {
        return;
    }

    const { action, id } = actionButton.dataset;
    updateBookingStatus(id, action === "approve" ? "confirmed" : "rejected");
});

tenantInput.value = localStorage.getItem("tenantId") || "";
loadBookings();

const API = "https://your-app.up.railway.app"; // 🔥 replace

let allBookings = [];
let currentFilter = "all";

async function loadBookings() {
  document.getElementById("loading").style.display = "block";

  const res = await fetch(API + "/admin/bookings");
  allBookings = await res.json();

  document.getElementById("loading").style.display = "none";

  render();
}

function filterBookings(type) {
  currentFilter = type;
  render();
}

function render() {
  const list = document.getElementById("list");
  list.innerHTML = "";

  let data = allBookings;

  if (currentFilter !== "all") {
    data = data.filter(b => b.status === currentFilter);
  }

  if (data.length === 0) {
    document.getElementById("empty").style.display = "block";
    return;
  } else {
    document.getElementById("empty").style.display = "none";
  }

  data.forEach(b => {
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <h3>Booking #${b.id}</h3>
      <p><b>Phone:</b> ${b.phone}</p>
      <p><b>Service:</b> ${b.service_id}</p>
      <p><b>Date:</b> ${b.date}</p>
      <p><b>Time:</b> ${b.time}</p>
      <p><b>Status:</b> 
        <span class="status ${b.status}">${b.status}</span>
      </p>

      ${b.status === "pending" ? `
        <div class="actions">
          <button class="approve" onclick="approve(${b.id})">Approve</button>
          <button class="reject" onclick="reject(${b.id})">Reject</button>
        </div>
      ` : ""}
    `;

    list.appendChild(div);
  });
}

async function approve(id) {
  await fetch(API + "/admin/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId: id })
  });

  loadBookings();
}

async function reject(id) {
  await fetch(API + "/admin/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId: id })
  });

  loadBookings();
}

loadBookings();
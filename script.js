const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQao88aRPKS6-RFK403BkIXIPhbcYf9_NFH3sgKPSEVBc56ReBYvaWt-nYonNPB9YnX4CdP4Y5Uu3Nn/pub?gid=1622223229&single=true&output=csv";

const REFRESH_INTERVAL_MS = 30000;

let orders = [];
let currentFilter = "todos";

const pendingCount = document.querySelector("#pendingCount");
const ordersTable = document.querySelector("#ordersTable");
const searchInput = document.querySelector("#searchInput");
const statusMessage = document.querySelector("#statusMessage");
const filterButtons = document.querySelectorAll("[data-filter]");

document.addEventListener("DOMContentLoaded", () => {
  loadOrders();
  setInterval(loadOrders, REFRESH_INTERVAL_MS);
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;

    filterButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");

    renderOrders();
  });
});

searchInput.addEventListener("input", renderOrders);

async function loadOrders() {
  try {
    setStatus("Actualizando datos...");

    const response = await fetch(`${CSV_URL}&t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("No se pudo cargar el CSV.");
    }

    const csvText = await response.text();
    orders = csvToJson(csvText);

    updatePendingCount();
    renderOrders();
    setStatus(`Ultima actualizacion: ${formatTime(new Date())}`);
  } catch (error) {
    setStatus("No se pudieron cargar los datos. Reintentando en 30 segundos.");
    console.error(error);
  }
}

function csvToJson(csvText) {
  const rows = parseCsv(csvText.trim());

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => normalizeKey(header));

  return rows.slice(1).map((row) => {
    return headers.reduce((record, header, index) => {
      record[header] = row[index]?.trim() ?? "";
      return record;
    }, {});
  });
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  rows.push(row);

  return rows.filter((items) => items.some((item) => item.trim() !== ""));
}

function normalizeKey(key) {
  return key
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function updatePendingCount() {
  const totalPending = orders.filter((order) => isPending(order.estado)).length;
  pendingCount.textContent = totalPending;
}

function renderOrders() {
  const searchTerm = normalizeText(searchInput.value);
  const filteredOrders = orders.filter((order) => {
    const matchesStatus = currentFilter === "todos" || isPending(order.estado);
    const matchesSearch =
      normalizeText(order.cliente).includes(searchTerm) ||
      normalizeText(order.telefono).includes(searchTerm);

    return matchesStatus && matchesSearch;
  });

  if (filteredOrders.length === 0) {
    ordersTable.innerHTML = `<tr><td class="empty" colspan="6">No hay pedidos para mostrar.</td></tr>`;
    return;
  }

  ordersTable.innerHTML = filteredOrders.map(orderRowTemplate).join("");
}

function orderRowTemplate(order) {
  const statusClass = isPending(order.estado) ? " badge--pendiente" : "";

  return `
    <tr>
      <td>${escapeHtml(order.fecha)}</td>
      <td>${escapeHtml(order.cliente)}</td>
      <td>${escapeHtml(order.telefono)}</td>
      <td>${escapeHtml(order.mensaje)}</td>
      <td><span class="badge${statusClass}">${escapeHtml(order.estado)}</span></td>
      <td>${escapeHtml(order.accion)}</td>
    </tr>
  `;
}

function isPending(status) {
  return normalizeText(status) === "pendiente";
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function formatTime(date) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

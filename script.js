const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQao88aRPKS6-RFK403BkIXIPhbcYf9_NFH3sgKPSEVBc56ReBYvaWt-nYonNPB9YnX4CdP4Y5Uu3Nn/pub?gid=1622223229&single=true&output=csv";

const REFRESH_INTERVAL_MS = 30000;
const COMPLETED_STORAGE_KEY = "pedido_final_completed_orders";

let rows = [];
let groupedOrders = [];
let currentFilter = "todos";
const expandedOrders = new Set();

const totalOrders = document.querySelector("#totalOrders");
const pendingOrders = document.querySelector("#pendingOrders");
const completedOrders = document.querySelector("#completedOrders");
const ordersList = document.querySelector("#ordersList");
const searchInput = document.querySelector("#searchInput");
const statusMessage = document.querySelector("#statusMessage");
const filterButtons = document.querySelectorAll("[data-filter]");

document.addEventListener("DOMContentLoaded", () => {
  loadOrders();
  setInterval(loadOrders, REFRESH_INTERVAL_MS);
});

searchInput.addEventListener("input", renderOrders);

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;

    filterButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");

    renderOrders();
  });
});

ordersList.addEventListener("click", (event) => {
  const toggleButton = event.target.closest("[data-toggle-products]");
  const completeButton = event.target.closest("[data-toggle-completed]");

  if (toggleButton) {
    toggleProducts(toggleButton.dataset.orderId);
  }

  if (completeButton) {
    toggleCompleted(completeButton.dataset.orderId);
  }
});

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
    rows = csvToJson(csvText);
    groupedOrders = groupRowsByOrder(rows);

    updateTotals();
    renderOrders();
    setStatus(`Ultima actualizacion: ${formatTime(new Date())}`);
  } catch (error) {
    setStatus("No se pudieron cargar los datos. Reintentando en 30 segundos.");
    console.error(error);
  }
}

function csvToJson(csvText) {
  const rowsFromCsv = parseCsv(csvText.trim());

  if (rowsFromCsv.length < 2) {
    return [];
  }

  const headers = rowsFromCsv[0].map((header) => normalizeKey(header));

  return rowsFromCsv.slice(1).map((row) => {
    return headers.reduce((record, header, index) => {
      record[header] = row[index]?.trim() ?? "";
      return record;
    }, {});
  });
}

function groupRowsByOrder(sourceRows) {
  const orderMap = new Map();

  sourceRows.forEach((row) => {
    if (toNumber(row.cantidad_final) === 0) {
      return;
    }

    const pedidoId = row.pedido_id || "Sin pedido";

    if (!orderMap.has(pedidoId)) {
      orderMap.set(pedidoId, {
        pedido_id: pedidoId,
        telefono: row.telefono || "",
        productos: [],
      });
    }

    const order = orderMap.get(pedidoId);

    if (!order.telefono && row.telefono) {
      order.telefono = row.telefono;
    }

    order.productos.push({
      producto_normalizado: row.producto_normalizado || "",
      cantidad_final: row.cantidad_final || "",
      unidad: row.unidad || "",
    });
  });

  return Array.from(orderMap.values());
}

function parseCsv(csvText) {
  const rowsFromCsv = [];
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
      rowsFromCsv.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  rowsFromCsv.push(row);

  return rowsFromCsv.filter((items) => items.some((item) => item.trim() !== ""));
}

function updateTotals() {
  const completedIds = getCompletedIds();
  const completedTotal = groupedOrders.filter((order) => completedIds.has(order.pedido_id)).length;

  totalOrders.textContent = groupedOrders.length;
  pendingOrders.textContent = groupedOrders.length - completedTotal;
  completedOrders.textContent = completedTotal;
}

function renderOrders() {
  const searchTerm = normalizeText(searchInput.value);
  const completedIds = getCompletedIds();
  const visibleOrders = groupedOrders.filter((order) => {
    const isCompletedOrder = completedIds.has(order.pedido_id);
    const matchesFilter =
      currentFilter === "todos" ||
      (currentFilter === "pendientes" && !isCompletedOrder) ||
      (currentFilter === "completados" && isCompletedOrder);

    const matchesOrder = normalizeText(order.pedido_id).includes(searchTerm);
    const matchesPhone = normalizeText(order.telefono).includes(searchTerm);
    const matchesProduct = order.productos.some((product) =>
      normalizeText(product.producto_normalizado).includes(searchTerm),
    );
    const matchesSearch = !searchTerm || matchesOrder || matchesPhone || matchesProduct;

    return matchesFilter && matchesSearch;
  });

  if (visibleOrders.length === 0) {
    ordersList.innerHTML = `<div class="empty">No hay pedidos para mostrar.</div>`;
    return;
  }

  ordersList.innerHTML = visibleOrders
    .map((order) => orderRowTemplate(order, completedIds.has(order.pedido_id)))
    .join("");
}

function orderRowTemplate(order, isCompletedOrder) {
  const productLabel = order.productos.length === 1 ? "producto" : "productos";
  const isExpanded = expandedOrders.has(order.pedido_id);
  const status = isCompletedOrder ? "completado" : "pendiente";
  const itemClass = isCompletedOrder ? " order-item is-completed" : "order-item";
  const statusClass = isCompletedOrder ? "status-badge--completed" : "status-badge--pending";
  const detailId = `products-${slugify(order.pedido_id)}`;
  const toggleText = isExpanded ? "Ocultar productos" : "Ver productos";
  const completeText = isCompletedOrder ? "Reabrir" : "Completar";

  return `
    <article class="${itemClass}">
      <div class="order-summary">
        <span class="order-id">${escapeHtml(order.pedido_id)}</span>
        <span class="order-phone">${escapeHtml(order.telefono)}</span>
        <span class="product-count">${order.productos.length} ${productLabel}</span>
        <span class="status-badge ${statusClass}">${status}</span>
        <button
          class="action-button action-button--secondary"
          type="button"
          data-toggle-products
          data-order-id="${escapeHtml(order.pedido_id)}"
          aria-expanded="${isExpanded}"
          aria-controls="${escapeHtml(detailId)}"
        >
          ${toggleText}
        </button>
        <button
          class="action-button action-button--primary"
          type="button"
          data-toggle-completed
          data-order-id="${escapeHtml(order.pedido_id)}"
        >
          ${completeText}
        </button>
      </div>
      ${
        isExpanded
          ? `<div class="products" id="${escapeHtml(detailId)}">
              ${order.productos.map(productRowTemplate).join("")}
            </div>`
          : ""
      }
    </article>
  `;
}

function productRowTemplate(product) {
  return `
    <div class="product-row">
      <span class="product-name">${escapeHtml(product.producto_normalizado)}</span>
      <span class="product-quantity">
        ${escapeHtml(product.cantidad_final)} ${escapeHtml(product.unidad)}
      </span>
    </div>
  `;
}

function normalizeKey(key) {
  return key
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toggleProducts(orderId) {
  if (expandedOrders.has(orderId)) {
    expandedOrders.delete(orderId);
  } else {
    expandedOrders.add(orderId);
  }

  renderOrders();
}

function toggleCompleted(orderId) {
  const completedIds = getCompletedIds();

  if (completedIds.has(orderId)) {
    completedIds.delete(orderId);
  } else {
    completedIds.add(orderId);
  }

  saveCompletedIds(completedIds);
  updateTotals();
  renderOrders();
}

function getCompletedIds() {
  try {
    const savedValue = localStorage.getItem(COMPLETED_STORAGE_KEY);
    const ids = savedValue ? JSON.parse(savedValue) : [];

    return new Set(Array.isArray(ids) ? ids : []);
  } catch (error) {
    console.error(error);
    return new Set();
  }
}

function saveCompletedIds(completedIds) {
  localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(Array.from(completedIds)));
}

function slugify(value) {
  return normalizeText(value).replace(/[^a-z0-9_-]+/g, "-") || "sin-pedido";
}

function toNumber(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .replace(",", ".");

  return Number(normalizedValue);
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

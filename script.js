const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQao88aRPKS6-RFK403BkIXIPhbcYf9_NFH3sgKPSEVBc56ReBYvaWt-nYonNPB9YnX4CdP4Y5Uu3Nn/pub?gid=1622223229&single=true&output=csv";

const REFRESH_INTERVAL_MS = 30000;

let rows = [];
let groupedOrders = [];

const totalOrders = document.querySelector("#totalOrders");
const totalLines = document.querySelector("#totalLines");
const ordersList = document.querySelector("#ordersList");
const searchInput = document.querySelector("#searchInput");
const statusMessage = document.querySelector("#statusMessage");

document.addEventListener("DOMContentLoaded", () => {
  loadOrders();
  setInterval(loadOrders, REFRESH_INTERVAL_MS);
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
  totalOrders.textContent = groupedOrders.length;
  totalLines.textContent = groupedOrders.reduce((total, order) => total + order.productos.length, 0);
}

function renderOrders() {
  const searchTerm = normalizeText(searchInput.value);
  const visibleOrders = groupedOrders.filter((order) => {
    if (!searchTerm) {
      return true;
    }

    const matchesOrder = normalizeText(order.pedido_id).includes(searchTerm);
    const matchesPhone = normalizeText(order.telefono).includes(searchTerm);
    const matchesProduct = order.productos.some((product) =>
      normalizeText(product.producto_normalizado).includes(searchTerm),
    );

    return matchesOrder || matchesPhone || matchesProduct;
  });

  if (visibleOrders.length === 0) {
    ordersList.innerHTML = `<div class="empty">No hay pedidos para mostrar.</div>`;
    return;
  }

  ordersList.innerHTML = visibleOrders.map(orderCardTemplate).join("");
}

function orderCardTemplate(order) {
  const productLabel = order.productos.length === 1 ? "producto" : "productos";

  return `
    <article class="order-card">
      <header class="order-card__header">
        <div>
          <h2 class="order-card__id">${escapeHtml(order.pedido_id)}</h2>
          <p class="order-card__phone">${escapeHtml(order.telefono)}</p>
        </div>
        <span class="badge">${order.productos.length} ${productLabel}</span>
      </header>
      <div class="products">
        ${order.productos.map(productRowTemplate).join("")}
      </div>
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

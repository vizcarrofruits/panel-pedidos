const SHEET_ID = "2PACX-1vQLa3XHEje2Wncub80NpG--RPgK1efGfDTnRBlT_Cpia4Ldi4phs0Zz2ILo9Qb0NwDFA_uKFv51O56u";
const CSV_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?gid=0&single=true&output=csv`;
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/gviz/tq?gid=0`;
const REFRESH_MS = 10000;
const DONE_KEY = "pedidos_hechos_visualmente";

const tableBody = document.querySelector("#tableBody");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const filterInputs = document.querySelectorAll("input[name='filter']");
const loadStatus = document.querySelector("#loadStatus");
const pendingCount = document.querySelector("#pendingCount");
const summary = document.querySelector("#summary");
const localWarning = document.querySelector("#localWarning");

let rows = [];
let doneIds = new Set(JSON.parse(localStorage.getItem(DONE_KEY) || "[]"));

if (window.location.protocol === "file:") {
  localWarning.classList.add("is-visible");
}

function normalize(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim();
}

function slug(value) {
  return normalize(value).toLowerCase();
}

function cssToken(value) {
  return slug(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "sin-estado";
}

function rowId(row) {
  return [
    row.fecha,
    row.cliente,
    row.telefono,
    row.mensaje,
    row.estado
  ].map(normalize).join("|");
}

function getFilter() {
  return document.querySelector("input[name='filter']:checked").value;
}

function isPending(row) {
  return slug(row.estado) === "pendiente" && !doneIds.has(row.id);
}

function visibleEstado(row) {
  return doneIds.has(row.id) ? "hecho" : row.estado;
}

function detectDelimiter(text) {
  let commaCount = 0;
  let semicolonCount = 0;
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      break;
    } else if (char === "," && !inQuotes) {
      commaCount += 1;
    } else if (char === ";" && !inQuotes) {
      semicolonCount += 1;
    }
  }

  return semicolonCount > commaCount ? ";" : ",";
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      record.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      record.push(field);
      if (record.some((item) => item.trim() !== "")) records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }

  record.push(field);
  if (record.some((item) => item.trim() !== "")) records.push(record);
  return records;
}

function csvToObjects(text) {
  const records = parseCsv(text);
  if (!records.length) return [];

  const headers = records[0].map((header) => normalize(header).toLowerCase());
  return records.slice(1).map((record) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = normalize(record[index]);
    });

    return {
      fecha: item.fecha,
      cliente: item.cliente,
      telefono: item.telefono || item["tel\u00e9fono"],
      mensaje: item.mensaje,
      estado: item.estado
    };
  }).filter((row) => Object.values(row).some((value) => normalize(value) !== ""));
}

function gvizValue(cell) {
  if (!cell) return "";
  return normalize(cell.f ?? cell.v ?? "");
}

function rowsFromTable(table) {
  const headers = (table.cols || []).map((column) => normalize(column.label || column.id).toLowerCase());

  return (table.rows || []).map((record) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = gvizValue(record.c[index]);
    });

    return {
      fecha: item.fecha,
      cliente: item.cliente,
      telefono: item.telefono || item["tel\u00e9fono"],
      mensaje: item.mensaje,
      estado: item.estado
    };
  }).filter((row) => Object.values(row).some((value) => normalize(value) !== ""));
}

function loadWithJsonp() {
  return new Promise((resolve, reject) => {
    const callbackName = `recibirPedidos_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheets no respondio a tiempo"));
    }, 12000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (data) => {
      cleanup();
      console.log("Datos recibidos desde Google Sheets JSONP:", data);

      if (data.status === "error") {
        const detail = data.errors?.map((item) => item.detailed_message || item.message).join(" ");
        reject(new Error(detail || "Google Sheets devolvio un error"));
        return;
      }

      resolve(rowsFromTable(data.table || []));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("No se pudo cargar Google Sheets desde el navegador"));
    };

    script.src = `${GVIZ_URL}&tqx=${encodeURIComponent(`out:json;responseHandler:${callbackName}`)}&cacheBust=${Date.now()}`;
    document.body.appendChild(script);
  });
}

function saveDoneIds() {
  localStorage.setItem(DONE_KEY, JSON.stringify([...doneIds]));
}

function setStatus(message, isError = false) {
  loadStatus.textContent = message;
  loadStatus.classList.toggle("error", isError);
}

function showEmptyMessage(message) {
  emptyState.textContent = message;
  emptyState.hidden = false;
}

function getVisibleRows() {
  const query = slug(searchInput.value);
  const filter = getFilter();

  return rows.filter((row) => {
    const matchesSearch = !query || slug(`${row.cliente} ${row.telefono}`).includes(query);
    if (!matchesSearch) return false;
    if (filter === "pending") return isPending(row);
    return true;
  });
}

function render() {
  const visibleRows = getVisibleRows();
  const pendingRows = rows.filter(isPending);

  tableBody.innerHTML = "";
  if (visibleRows.length > 0) {
    emptyState.hidden = true;
  } else {
    showEmptyMessage("No se han encontrado pedidos");
  }
  pendingCount.textContent = pendingRows.length;

  visibleRows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td></td>
      <td></td>
      <td></td>
      <td class="message"></td>
      <td><span class="badge"></span></td>
      <td><button type="button">Marcar como hecho</button></td>
    `;

    const cells = tr.querySelectorAll("td");
    cells[0].textContent = row.fecha || "-";
    cells[1].textContent = row.cliente || "-";
    cells[2].textContent = row.telefono || "-";
    cells[3].textContent = row.mensaje || "-";

    const estado = visibleEstado(row) || "sin estado";
    const badge = tr.querySelector(".badge");
    badge.textContent = estado;
    badge.classList.add(cssToken(estado));

    const button = tr.querySelector("button");
    if (doneIds.has(row.id)) {
      button.textContent = "Hecho";
      button.disabled = true;
    } else {
      button.addEventListener("click", () => {
        doneIds.add(row.id);
        saveDoneIds();
        render();
      });
    }

    tableBody.appendChild(tr);
  });

  const totalText = rows.length === 1 ? "1 pedido cargado" : `${rows.length} pedidos cargados`;
  const visibleText = visibleRows.length === 1 ? "1 visible" : `${visibleRows.length} visibles`;
  const pendingText = pendingRows.length === 1 ? "1 pendiente" : `${pendingRows.length} pendientes`;
  summary.textContent = `${totalText}, ${visibleText}, ${pendingText}`;
}

async function loadData() {
  setStatus("Actualizando...");

  try {
    let loadedRows = [];

    try {
      const response = await fetch(`${CSV_URL}&cacheBust=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`No se pudo cargar el CSV (${response.status})`);

      const text = await response.text();
      console.log("Texto bruto recibido del CSV:", text);
      loadedRows = csvToObjects(text);
    } catch (fetchError) {
      console.warn("No se pudo leer el CSV con fetch. Probando carga compatible con navegador local.", fetchError);
      loadedRows = await loadWithJsonp();
    }

    rows = loadedRows.map((row) => ({
      ...row,
      id: rowId(row)
    }));

    render();
    if (!rows.length) showEmptyMessage("No se han encontrado pedidos");
    setStatus(`Actualizado ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);
  } catch (error) {
    console.error(error);
    tableBody.innerHTML = "";
    pendingCount.textContent = "0";
    showEmptyMessage(`Error al cargar el CSV: ${error.message}`);
    setStatus("Error al actualizar", true);
    summary.textContent = `Error al cargar el CSV: ${error.message}`;
  }
}

searchInput.addEventListener("input", render);
filterInputs.forEach((input) => input.addEventListener("change", render));
loadData();
setInterval(loadData, REFRESH_MS);

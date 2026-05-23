/**
 * BuildPilot Customer Shop — repair orders separate from project builds.
 * @namespace BuildPilotShop
 */
(function (global) {
  "use strict";

  const LS_VEHICLES_KEY = "buildpilot_vehicles";
  const LEGACY_LS_VEHICLES_KEY = "vehicles";
  const LS_CUSTOMERS_KEY = "buildpilot_customers";

  const VEHICLE_MODE_PROJECT = "project";
  const VEHICLE_MODE_CUSTOMER = "customer";

  const REPAIR_STATUSES = [
    "Waiting parts",
    "Waiting approval",
    "In progress",
    "Completed",
    "Delivered"
  ];

  const OPEN_REPAIR_STATUSES = ["Waiting parts", "Waiting approval", "In progress"];

  const MAX_PHOTOS = 16;
  const MAX_PHOTO_DIM = 1280;
  const JPEG_Q = 0.82;

  function el(tag, className, attrs, children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (v == null) return;
        if (k === "text") node.textContent = v;
        else node.setAttribute(k, v);
      });
    }
    const list = children == null ? [] : Array.isArray(children) ? children : [children];
    list.forEach((c) => {
      if (c == null) return;
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  function newId(prefix) {
    return `${prefix}${Date.now()}${Math.floor(Math.random() * 10000)}`;
  }

  function sanitizeText(v) {
    return String(v == null ? "" : v).trim();
  }

  function sanitizeNumber(v, fallback) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback != null ? fallback : 0;
  }

  function formatMoney(n) {
    const x = sanitizeNumber(n, 0);
    return "$" + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function loadVehicles() {
    try {
      let raw = localStorage.getItem(LS_VEHICLES_KEY);
      if (!raw) {
        const legacy = localStorage.getItem(LEGACY_LS_VEHICLES_KEY);
        if (legacy) {
          raw = legacy;
          localStorage.setItem(LS_VEHICLES_KEY, legacy);
        }
      }
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  function saveVehicles(vehicles) {
    const payload = JSON.stringify(vehicles);
    localStorage.setItem(LS_VEHICLES_KEY, payload);
    localStorage.setItem(LEGACY_LS_VEHICLES_KEY, payload);
    try {
      global.dispatchEvent(
        new CustomEvent("buildpilot:vehicles-updated", { detail: { source: "shop" } })
      );
    } catch (_e) { /* IE */ }
  }

  function loadCustomers() {
    try {
      const raw = localStorage.getItem(LS_CUSTOMERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  function saveCustomers(customers) {
    localStorage.setItem(LS_CUSTOMERS_KEY, JSON.stringify(customers));
  }

  function isProjectVehicle(v) {
    return !v || !v.vehicleMode || v.vehicleMode === VEHICLE_MODE_PROJECT;
  }

  function isCustomerVehicle(v) {
    return !!(v && v.vehicleMode === VEHICLE_MODE_CUSTOMER);
  }

  function normalizeRepairStatus(status) {
    const raw = sanitizeText(status);
    if (REPAIR_STATUSES.includes(raw)) return raw;
    const lower = raw.toLowerCase();
    const match = REPAIR_STATUSES.find((s) => s.toLowerCase() === lower);
    return match || "In progress";
  }

  function normalizeRepairOrder(raw) {
    const ro = raw && typeof raw === "object" ? raw : {};
    const partsSupplied = sanitizeNumber(ro.partsSupplied, 0);
    const laborHours = sanitizeNumber(ro.laborHours, 0);
    const laborRate = sanitizeNumber(ro.laborRate, 0);
    const deposit = sanitizeNumber(ro.deposit, 0);
    const laborTotal = laborHours * laborRate;
    const subtotal = partsSupplied + laborTotal;
    const balanceDue = Math.max(0, subtotal - deposit);
    return {
      status: normalizeRepairStatus(ro.status),
      partsSupplied,
      laborHours,
      laborRate,
      laborTotal,
      subtotal,
      deposit,
      balanceDue,
      complaint: sanitizeText(ro.complaint),
      internalNotes: sanitizeText(ro.internalNotes),
      photos: Array.isArray(ro.photos)
        ? ro.photos.filter((p) => p && p.dataUrl).slice(0, MAX_PHOTOS)
        : [],
      approvalNotes: Array.isArray(ro.approvalNotes) ? ro.approvalNotes.slice() : [],
      createdAt: ro.createdAt || new Date().toISOString(),
      updatedAt: ro.updatedAt || new Date().toISOString()
    };
  }

  function normalizeCustomer(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: raw.id || newId("cust_"),
      name: sanitizeText(raw.name) || "Customer",
      phone: sanitizeText(raw.phone),
      email: sanitizeText(raw.email),
      notes: sanitizeText(raw.notes),
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString()
    };
  }

  function normalizeShopVehicle(raw, customerId) {
    if (!raw || typeof raw !== "object") return null;
    const year = sanitizeText(raw.year);
    const make = sanitizeText(raw.make);
    const model = sanitizeText(raw.model);
    const ymm = [year, make, model].filter(Boolean).join(" ").trim();
    return {
      id: raw.id || newId("shopv_"),
      vehicleMode: VEHICLE_MODE_CUSTOMER,
      customerId: raw.customerId != null ? String(raw.customerId) : String(customerId),
      year,
      make,
      model,
      vin: sanitizeText(raw.vin),
      plate: sanitizeText(raw.plate),
      name: ymm || sanitizeText(raw.name) || "Customer vehicle",
      repairOrder: normalizeRepairOrder(raw.repairOrder),
      parts: [],
      tasks: [],
      labor: []
    };
  }

  function getCustomer(customerId) {
    return loadCustomers().find((c) => String(c.id) === String(customerId)) || null;
  }

  function saveCustomer(customer) {
    const customers = loadCustomers();
    const norm = normalizeCustomer(customer);
    const idx = customers.findIndex((c) => String(c.id) === String(norm.id));
    if (idx >= 0) customers[idx] = norm;
    else customers.push(norm);
    norm.updatedAt = new Date().toISOString();
    saveCustomers(customers);
    return norm;
  }

  function deleteCustomer(customerId) {
    const customers = loadCustomers().filter((c) => String(c.id) !== String(customerId));
    saveCustomers(customers);
    const vehicles = loadVehicles().filter(
      (v) => !(isCustomerVehicle(v) && String(v.customerId) === String(customerId))
    );
    saveVehicles(vehicles);
    return true;
  }

  function listCustomers() {
    return loadCustomers()
      .map(normalizeCustomer)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function getShopVehicle(vehicleId) {
    const v = loadVehicles().find((x) => String(x.id) === String(vehicleId));
    if (!v || !isCustomerVehicle(v)) return null;
    return normalizeShopVehicle(v, v.customerId);
  }

  function getCustomerVehicles(customerId) {
    return loadVehicles()
      .filter((v) => isCustomerVehicle(v) && String(v.customerId) === String(customerId))
      .map((v) => normalizeShopVehicle(v, customerId));
  }

  function saveShopVehicle(vehicle) {
    const norm = normalizeShopVehicle(vehicle, vehicle.customerId);
    norm.repairOrder.updatedAt = new Date().toISOString();
    const vehicles = loadVehicles();
    const idx = vehicles.findIndex((v) => String(v.id) === String(norm.id));
    if (idx >= 0) vehicles[idx] = norm;
    else vehicles.push(norm);
    saveVehicles(vehicles);
    return norm;
  }

  function deleteShopVehicle(vehicleId) {
    saveVehicles(loadVehicles().filter((v) => String(v.id) !== String(vehicleId)));
    return true;
  }

  function computeRepairTotals(ro) {
    const n = normalizeRepairOrder(ro);
    return {
      partsSupplied: n.partsSupplied,
      laborHours: n.laborHours,
      laborRate: n.laborRate,
      laborTotal: n.laborTotal,
      subtotal: n.subtotal,
      deposit: n.deposit,
      balanceDue: n.balanceDue
    };
  }

  function getCustomerDashboard(customerId) {
    const customer = getCustomer(customerId);
    if (!customer) return null;
    const vehicles = getCustomerVehicles(customerId);
    let openWork = 0;
    let partsTotal = 0;
    let laborHours = 0;
    let laborTotal = 0;
    let outstanding = 0;
    vehicles.forEach((v) => {
      const ro = v.repairOrder;
      if (OPEN_REPAIR_STATUSES.includes(ro.status)) openWork += 1;
      partsTotal += ro.partsSupplied;
      laborHours += ro.laborHours;
      laborTotal += ro.laborTotal;
      if (ro.status !== "Delivered") outstanding += ro.balanceDue;
    });
    return {
      customer,
      vehicles,
      openWork,
      partsTotal,
      laborHours,
      laborTotal,
      subtotal: partsTotal + laborTotal,
      outstanding
    };
  }

  function getShopOverview() {
    const customers = listCustomers();
    let openOrders = 0;
    let outstanding = 0;
    let laborHours = 0;
    loadVehicles()
      .filter(isCustomerVehicle)
      .forEach((v) => {
        const ro = normalizeRepairOrder(v.repairOrder);
        if (OPEN_REPAIR_STATUSES.includes(ro.status)) openOrders += 1;
        if (ro.status !== "Delivered") outstanding += ro.balanceDue;
        laborHours += ro.laborHours;
      });
    return { customers, openOrders, outstanding, laborHours };
  }

  function compressImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > MAX_PHOTO_DIM || h > MAX_PHOTO_DIM) {
            if (w >= h) {
              h = Math.round((h * MAX_PHOTO_DIM) / w);
              w = MAX_PHOTO_DIM;
            } else {
              w = Math.round((w * MAX_PHOTO_DIM) / h);
              h = MAX_PHOTO_DIM;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", JPEG_Q));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function addRepairPhoto(vehicleId, file, caption) {
    const v = getShopVehicle(vehicleId);
    if (!v || !file) return null;
    const dataUrl = await compressImageFile(file);
    v.repairOrder.photos.push({
      id: newId("rph_"),
      dataUrl,
      caption: sanitizeText(caption),
      at: new Date().toISOString()
    });
    return saveShopVehicle(v);
  }

  function addApprovalNote(vehicleId, text, approved) {
    const v = getShopVehicle(vehicleId);
    if (!v) return null;
    const trimmed = sanitizeText(text);
    if (!trimmed) return null;
    v.repairOrder.approvalNotes.push({
      id: newId("apn_"),
      text: trimmed,
      approved: !!approved,
      at: new Date().toISOString()
    });
    return saveShopVehicle(v);
  }

  function vehicleDisplayTitle(v) {
    if (!v) return "Vehicle";
    const ymm = [v.year, v.make, v.model].filter(Boolean).join(" ").trim();
    return ymm || v.name || "Vehicle";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildPrintableRepairSummary(vehicle, customer) {
    const ro = normalizeRepairOrder(vehicle.repairOrder);
    const title = vehicleDisplayTitle(vehicle);
    const photoRows = ro.photos.length
      ? ro.photos
          .map(
            (p) =>
              `<figure class="photo"><img src="${p.dataUrl}" alt="" /><figcaption>${escapeHtml(p.caption || formatShortDate(p.at))}</figcaption></figure>`
          )
          .join("")
      : "<p class='muted'>No photos documented.</p>";

    const approvalBlock = ro.approvalNotes.length
      ? ro.approvalNotes
          .map(
            (n) =>
              `<li><strong>${n.approved ? "Approved" : "Note"}</strong> — ${escapeHtml(n.text)} <span class="muted">(${formatShortDate(n.at)})</span></li>`
          )
          .join("")
      : "<li class='muted'>No approval notes.</li>";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Repair Summary — ${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Georgia, serif; color: #111; margin: 24px; max-width: 800px; }
    h1 { font-size: 1.4rem; margin: 0 0 4px; }
    .sub { color: #444; font-size: 0.9rem; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #ccc; }
    th { width: 40%; font-weight: 600; }
    .totals td { font-weight: 700; border-top: 2px solid #111; }
    .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 16px; }
    .photo img { width: 100%; height: auto; border: 1px solid #ccc; }
    .photo figcaption { font-size: 0.75rem; color: #555; margin-top: 4px; }
    .muted { color: #666; }
    ul { padding-left: 1.2rem; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Repair Order Summary</h1>
  <p class="sub">BuildPilot · ${escapeHtml(formatShortDate(new Date().toISOString()))}</p>
  <table>
    <tr><th>Customer</th><td>${escapeHtml(customer.name)}${customer.phone ? " · " + escapeHtml(customer.phone) : ""}</td></tr>
    <tr><th>Vehicle</th><td>${escapeHtml(title)}</td></tr>
    <tr><th>Plate</th><td>${escapeHtml(vehicle.plate || "—")}</td></tr>
    <tr><th>VIN</th><td>${escapeHtml(vehicle.vin || "—")}</td></tr>
    <tr><th>Status</th><td>${escapeHtml(ro.status)}</td></tr>
    ${ro.complaint ? `<tr><th>Customer concern</th><td>${escapeHtml(ro.complaint)}</td></tr>` : ""}
  </table>
  <h2>Charges</h2>
  <table>
    <tr><th>Parts supplied</th><td>${formatMoney(ro.partsSupplied)}</td></tr>
    <tr><th>Labor</th><td>${ro.laborHours} hrs × ${formatMoney(ro.laborRate)}/hr = ${formatMoney(ro.laborTotal)}</td></tr>
    <tr class="totals"><th>Subtotal</th><td>${formatMoney(ro.subtotal)}</td></tr>
    <tr><th>Deposit</th><td>${formatMoney(ro.deposit)}</td></tr>
    <tr class="totals"><th>Balance due</th><td>${formatMoney(ro.balanceDue)}</td></tr>
  </table>
  <h2>Approval notes</h2>
  <ul>${approvalBlock}</ul>
  <h2>Photo documentation</h2>
  <div class="photos">${photoRows}</div>
  <script>window.onload=function(){window.print();}</script>
</body>
</html>`;
  }

  function formatShortDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function openPrintableSummary(vehicleId) {
    const vehicle = getShopVehicle(vehicleId);
    if (!vehicle) return;
    const customer = getCustomer(vehicle.customerId);
    if (!customer) return;
    const html = buildPrintableRepairSummary(vehicle, customer);
    const w = window.open("", "_blank");
    if (!w) {
      alert("Allow pop-ups to print the repair summary.");
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  function shopPageUrl(page, params) {
    const base = `${page}.html`;
    if (!params) return base;
    return `${base}?${new URLSearchParams(params).toString()}`;
  }

  const UI = {
    el,
    statusBadge(status) {
      const slug = normalizeRepairStatus(status).toLowerCase().replace(/\s+/g, "-");
      return el("span", `shop-status shop-status--${slug}`, { text: normalizeRepairStatus(status) });
    }
  };

  global.BuildPilotShop = {
    LS_VEHICLES_KEY,
    LEGACY_LS_VEHICLES_KEY,
    LS_CUSTOMERS_KEY,
    VEHICLE_MODE_PROJECT,
    VEHICLE_MODE_CUSTOMER,
    REPAIR_STATUSES,
    OPEN_REPAIR_STATUSES,
    isProjectVehicle,
    isCustomerVehicle,
    loadVehicles,
    saveVehicles,
    loadCustomers,
    saveCustomers,
    listCustomers,
    getCustomer,
    saveCustomer,
    deleteCustomer,
    getShopVehicle,
    getCustomerVehicles,
    saveShopVehicle,
    deleteShopVehicle,
    normalizeRepairOrder,
    normalizeShopVehicle,
    computeRepairTotals,
    getCustomerDashboard,
    getShopOverview,
    addRepairPhoto,
    addApprovalNote,
    compressImageFile,
    vehicleDisplayTitle,
    buildPrintableRepairSummary,
    openPrintableSummary,
    formatMoney,
    formatShortDate,
    shopPageUrl,
    UI
  };
})(typeof window !== "undefined" ? window : globalThis);

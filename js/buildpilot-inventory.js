/**
 * BuildPilot Advanced Garage Inventory
 * @namespace BuildPilotInventory
 */
(function (global) {
  "use strict";

  const LS_VEHICLES_KEY = "buildpilot_vehicles";
  const LEGACY_LS_VEHICLES_KEY = "vehicles";

  /** MVP part statuses — exact strings stored and shown in UI */
  const MVP_PART_STATUSES = ["Needed", "Ordered", "Received", "Installed"];
  const INVENTORY_STATUSES = MVP_PART_STATUSES;
  const MVP_PART_STATUS_SET = new Set(MVP_PART_STATUSES);

  /** UI tabs → MVP statuses */
  const INVENTORY_TABS = [
    { id: "needed", label: "Needed", statuses: ["Needed"] },
    { id: "ordered", label: "Ordered", statuses: ["Ordered"] },
    { id: "received", label: "Received", statuses: ["Received"] },
    { id: "installed", label: "Installed", statuses: ["Installed"] }
  ];

  const LEGACY_STATUS_MAP = {
    Needed: "Needed",
    Pending: "Needed",
    Planned: "Needed",
    Ordered: "Ordered",
    Shipped: "Ordered",
    Received: "Received",
    Delivered: "Received",
    Installed: "Installed",
    Complete: "Installed",
    Completed: "Installed",
    Removed: "Needed",
    Researching: "Needed",
    Backordered: "Ordered",
    Archived: "Needed"
  };

  const EXPORT_LEGACY_STATUS = {
    Needed: "Needed",
    Ordered: "Ordered",
    Received: "Received",
    Installed: "Installed"
  };

  const BP_EMPTY_FIRST_ENTRY =
    "No items logged yet. Tap the button below to add your first entry!";

  const STATUS_TONE_CLASS = {
    Needed: "inv-status-needed",
    Ordered: "inv-status-ordered",
    Received: "inv-status-received",
    Installed: "inv-status-installed"
  };

  const MAX_RECEIPT_BYTES_HINT = 900000;

  /**
   * Tier 1 structural system categories (ACES/PIES) — canonical list lives in buildpilot-storage.js.
   * Saved part.category must be one of these strings (character-for-character) for per-system progress.
   */
  const TIER1_PART_CATEGORIES = (root.BuildPilotStorage && root.BuildPilotStorage.TIER1_PART_CATEGORIES)
    ? root.BuildPilotStorage.TIER1_PART_CATEGORIES.slice()
    : [
      "Engine",
      "Cooling System",
      "Fuel System",
      "Exhaust System",
      "Drivetrain",
      "Brakes",
      "Suspension & Steering",
      "Electrical & Ignition",
      "Body & Exterior",
      "Interior",
      "Wheels & Tires"
    ];
  const TIER1_CATEGORY_SET = new Set(TIER1_PART_CATEGORIES);

  /** Legacy / commercial labels → Tier 1 (commercial entries map to Engine) */
  const CATEGORY_LEGACY_ALIASES = {
    Suspension: "Suspension & Steering",
    Steering: "Suspension & Steering",
    "Suspension and Steering": "Suspension & Steering",
    Electrical: "Electrical & Ignition",
    Ignition: "Electrical & Ignition",
    "Electrical and Ignition": "Electrical & Ignition",
    Body: "Body & Exterior",
    Exterior: "Body & Exterior",
    "Body and Exterior": "Body & Exterior",
    Wheels: "Wheels & Tires",
    Tires: "Wheels & Tires",
    "Wheels and Tires": "Wheels & Tires",
    Cooling: "Cooling System",
    Fuel: "Fuel System",
    Exhaust: "Exhaust System",
    "Oil Change": "Engine",
    Inspection: "Engine",
    "Shop Supplies": "Engine",
    "Shop Supply": "Engine",
    Maintenance: "Engine",
    Service: "Engine",
    Miscellaneous: "Engine",
    Misc: "Engine",
    General: "Engine"
  };

  const REMOVED_COMMERCIAL_CATEGORY_KEYS = new Set([
    "oil change",
    "inspection",
    "shop supplies",
    "shop supply",
    "labor",
    "labor hours",
    "labor rate",
    "labor rates"
  ]);

  /** Returns exactly one of TIER1_PART_CATEGORIES (canonical spelling). */
  function exactTier1Category(category) {
    const raw = sanitizeText(category);
    if (!raw) return TIER1_PART_CATEGORIES[0];
    if (TIER1_CATEGORY_SET.has(raw)) return raw;
    const lower = raw.toLowerCase();
    if (REMOVED_COMMERCIAL_CATEGORY_KEYS.has(lower)) return TIER1_PART_CATEGORIES[0];
    const tierMatch = TIER1_PART_CATEGORIES.find((c) => c.toLowerCase() === lower);
    if (tierMatch) return tierMatch;
    if (CATEGORY_LEGACY_ALIASES[raw] && TIER1_CATEGORY_SET.has(CATEGORY_LEGACY_ALIASES[raw])) {
      return CATEGORY_LEGACY_ALIASES[raw];
    }
    const aliasKey = Object.keys(CATEGORY_LEGACY_ALIASES).find((k) => k.toLowerCase() === lower);
    if (aliasKey && TIER1_CATEGORY_SET.has(CATEGORY_LEGACY_ALIASES[aliasKey])) {
      return CATEGORY_LEGACY_ALIASES[aliasKey];
    }
    return TIER1_PART_CATEGORIES[0];
  }

  function normalizePartCategory(category) {
    return exactTier1Category(category);
  }

  function populateTier1CategorySelect(selectEl, selectedCategory) {
    if (!selectEl) return TIER1_PART_CATEGORIES[0];
    const selected = exactTier1Category(selectedCategory);
    if (root.BuildPilotStorage && root.BuildPilotStorage.populateTier1CategorySelect) {
      root.BuildPilotStorage.populateTier1CategorySelect(selectEl, selected, { includeAll: false });
      return selectEl.value;
    }
    selectEl.innerHTML = "";
    selectEl.required = true;
    TIER1_PART_CATEGORIES.forEach((canonical) => {
      const opt = document.createElement("option");
      opt.value = canonical;
      opt.textContent = canonical;
      selectEl.appendChild(opt);
    });
    selectEl.value = selected;
    return selectEl.value;
  }

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

  function sanitizeNumber(val, fallback) {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : fallback != null ? fallback : 0;
  }

  function sanitizeText(val) {
    return String(val == null ? "" : val).trim();
  }

  /** Returns exactly one of MVP_PART_STATUSES. */
  function exactMvpPartStatus(status) {
    const raw = sanitizeText(status);
    if (!raw) return MVP_PART_STATUSES[0];
    if (MVP_PART_STATUS_SET.has(raw)) return raw;
    if (LEGACY_STATUS_MAP[raw] && MVP_PART_STATUS_SET.has(LEGACY_STATUS_MAP[raw])) {
      return LEGACY_STATUS_MAP[raw];
    }
    const lower = raw.toLowerCase();
    const legacyKey = Object.keys(LEGACY_STATUS_MAP).find((k) => k.toLowerCase() === lower);
    if (legacyKey && MVP_PART_STATUS_SET.has(LEGACY_STATUS_MAP[legacyKey])) {
      return LEGACY_STATUS_MAP[legacyKey];
    }
    return MVP_PART_STATUSES[0];
  }

  function normalizePartStatus(status) {
    return exactMvpPartStatus(status);
  }

  function populateMvpStatusSelect(selectEl, selectedStatus) {
    if (!selectEl) return MVP_PART_STATUSES[0];
    const selected = exactMvpPartStatus(selectedStatus);
    selectEl.innerHTML = "";
    selectEl.required = true;
    MVP_PART_STATUSES.forEach((canonical) => {
      const opt = document.createElement("option");
      opt.value = canonical;
      opt.textContent = canonical;
      selectEl.appendChild(opt);
    });
    selectEl.value = selected;
    return selectEl.value;
  }

  function exportStatusForSpreadsheet(status) {
    const canon = normalizePartStatus(status);
    return EXPORT_LEGACY_STATUS[canon] || canon;
  }

  /** Parse currency-like input; empty/invalid → 0 */
  function parseMoneyAmount(amount) {
    if (amount == null || amount === "") return 0;
    if (typeof amount === "number") return Number.isFinite(amount) ? amount : 0;
    const clean = String(amount).trim().replace(/[^0-9.\-]/g, "");
    if (clean === "" || clean === "-" || clean === ".") return 0;
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : 0;
  }

  /** Display currency with $ prefix; missing/invalid/empty → $0 */
  function formatMoney(amount) {
    const n = parseMoneyAmount(amount);
    if (!Number.isFinite(n) || Math.abs(n) < 0.000001) return "$0";
    const rounded = Math.round(n * 100) / 100;
    const isWhole = Math.abs(rounded - Math.trunc(rounded)) < 0.000001;
    if (isWhole) {
      return "$" + Math.trunc(rounded).toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
    return "$" + rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function partLineTotal(part) {
    const qty = Math.max(1, sanitizeNumber(part.quantity, 1));
    const price = getPartPrice(part);
    const core = sanitizeNumber(part.coreCharge, 0);
    return price * qty + core;
  }

  function getPartPrice(part) {
    if (!part) return 0;
    if (part.price != null && part.price !== "") return sanitizeNumber(part.price, 0);
    return sanitizeNumber(part.cost, 0);
  }

  /** Unit cost for inventory list rows — always $-prefixed (e.g. 70 → $70, empty → $0). */
  function formatPartCostDisplay(part) {
    return formatMoney(getPartPrice(part));
  }

  function isPartMissing(part) {
    return normalizePartStatus(part && part.status) === "Needed";
  }

  function isPartInstalled(part) {
    return normalizePartStatus(part && part.status) === "Installed";
  }

  function isPartBudgetCommitted(part) {
    const s = normalizePartStatus(part && part.status);
    return s !== "Needed";
  }

  function tabForStatus(status) {
    const s = normalizePartStatus(status);
    const tab = INVENTORY_TABS.find((t) => t.statuses.includes(s));
    return tab ? tab.id : "needed";
  }

  /** Keep list filters in sync so a part remains visible after its status changes. */
  function alignInventoryListState(state, nextStatus) {
    if (!state) return;
    state.tab = tabForStatus(nextStatus);
    state.status = "";
    if (state.missing) state.missing = false;
  }

  function notifyPartInventoryChanged(detail) {
    try {
      global.dispatchEvent(new CustomEvent("buildpilot:part-inventory-changed", { detail: detail || {} }));
    } catch (_e) { /* ignore */ }
  }

  function loadVehicles() {
    if (root.BuildPilotStorage && root.BuildPilotStorage.readVehiclesArrayFromLocalStorage) {
      return root.BuildPilotStorage.readVehiclesArrayFromLocalStorage();
    }
    try {
      let raw = localStorage.getItem(LS_VEHICLES_KEY);
      if (raw == null || raw === "") {
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
  }

  function clearLegacyVehiclePartsKey(vehicleId) {
    if (vehicleId == null || vehicleId === "") return;
    try {
      localStorage.removeItem(`vehicle_parts_${vehicleId}`);
    } catch (_e) { /* ignore */ }
  }

  function notifyVehiclesUpdated(vehicleId) {
    try {
      window.dispatchEvent(
        new CustomEvent("buildpilot:vehicles-updated", {
          detail: { vehicleId: vehicleId != null ? String(vehicleId) : "" }
        })
      );
    } catch (_e) { /* ignore */ }
  }

  function getVehicle(vehicleId) {
    return loadVehicles().find((v) => v && String(v.id) === String(vehicleId)) || null;
  }

  function persistVehicle(vehicle) {
    const vehicles = loadVehicles();
    const idx = vehicles.findIndex((v) => v && String(v.id) === String(vehicle.id));
    if (idx < 0) return false;
    ensureVehicleInventory(vehicle);
    vehicles[idx] = vehicle;
    saveVehicles(vehicles);
    clearLegacyVehiclePartsKey(vehicle.id);
    notifyVehiclesUpdated(vehicle.id);
    return true;
  }

  function newPartId() {
    return `part${Date.now()}${Math.floor(Math.random() * 10000)}`;
  }

  /**
   * @param {object} raw
   * @param {string|number} vehicleId
   */
  function normalizePart(raw, vehicleId) {
    if (!raw || typeof raw !== "object") return null;
    const status = normalizePartStatus(raw.status);
    const price = raw.price != null && raw.price !== ""
      ? sanitizeNumber(raw.price, 0)
      : sanitizeNumber(raw.cost, 0);

    let installHistory = Array.isArray(raw.installHistory) ? raw.installHistory.slice() : [];
    if (status === "Installed" && installHistory.length === 0 && raw.installedAt) {
      installHistory.push({
        id: `inst_${Date.now()}`,
        date: raw.installedAt,
        mileage: raw.installedMileage || "",
        notes: "Migrated install record"
      });
    }

    return {
      id: raw.id || newPartId(),
      vehicleId: raw.vehicleId != null ? raw.vehicleId : vehicleId,
      name: sanitizeText(raw.name) || "Part",
      vendor: sanitizeText(raw.vendor),
      partNumber: sanitizeText(raw.partNumber),
      purchaseLink: sanitizeText(raw.purchaseLink || raw.partUrl),
      partUrl: sanitizeText(raw.purchaseLink || raw.partUrl),
      price,
      cost: price,
      quantity: Math.max(1, sanitizeNumber(raw.quantity, 1)),
      coreCharge: sanitizeNumber(raw.coreCharge, 0),
      status,
      category: normalizePartCategory(raw.category),
      installedMileage: sanitizeText(raw.installedMileage),
      warrantyExpiration: sanitizeText(raw.warrantyExpiration),
      receiptImage: sanitizeText(raw.receiptImage),
      serialNumber: sanitizeText(raw.serialNumber),
      locationStored: sanitizeText(raw.locationStored),
      reuseStatus: sanitizeText(raw.reuseStatus),
      photo: sanitizeText(raw.photo),
      linkedTaskId: raw.linkedTaskId != null ? String(raw.linkedTaskId) : "",
      trackingNumbers: Array.isArray(raw.trackingNumbers) ? raw.trackingNumbers.slice() : [],
      trackingNumber: sanitizeText(raw.trackingNumber),
      installHistory
    };
  }

  function ensureVehicleInventory(vehicle) {
    if (!vehicle) return vehicle;
    if (!Array.isArray(vehicle.parts)) vehicle.parts = [];
    vehicle.parts = vehicle.parts.map((p) => normalizePart(p, vehicle.id)).filter(Boolean);
    return vehicle;
  }

  function listParts(vehicleId) {
    const v = getVehicle(vehicleId);
    if (!v) return [];
    ensureVehicleInventory(v);
    return v.parts.slice();
  }

  function savePart(vehicleId, part) {
    const vehicle = getVehicle(vehicleId);
    if (!vehicle) return null;
    ensureVehicleInventory(vehicle);
    const normalized = normalizePart(part, vehicleId);
    const idx = vehicle.parts.findIndex((p) => String(p.id) === String(normalized.id));
    const prevStatus = idx >= 0 ? normalizePartStatus(vehicle.parts[idx].status) : null;
    if (idx >= 0) vehicle.parts[idx] = normalized;
    else vehicle.parts.push(normalized);
    vehicle.lastUpdatedAt = new Date().toISOString();
    persistVehicle(vehicle);
    notifyPartInventoryChanged({
      vehicleId: String(vehicleId),
      partId: String(normalized.id),
      prev: prevStatus,
      next: normalized.status,
      status: normalized.status
    });
    return normalized;
  }

  function deletePart(vehicleId, partId) {
    const vehicle = getVehicle(vehicleId);
    if (!vehicle || !Array.isArray(vehicle.parts)) return false;
    const before = vehicle.parts.length;
    vehicle.parts = vehicle.parts.filter((p) => String(p.id) !== String(partId));
    if (vehicle.parts.length === before) return false;
    persistVehicle(vehicle);
    return true;
  }

  function getLinkedTask(vehicle, part) {
    if (!vehicle || !part) return null;
    const tasks = Array.isArray(vehicle.tasks) ? vehicle.tasks : [];
    if (part.linkedTaskId) {
      const t = tasks.find((x) => String(x.id) === String(part.linkedTaskId));
      if (t) return t;
    }
    return tasks.find((t) => t && String(t.linkedPartId) === String(part.id)) || null;
  }

  function syncPartTaskLink(vehicle, part, taskId) {
    if (!vehicle || !part) return;
    const tasks = Array.isArray(vehicle.tasks) ? vehicle.tasks : [];
    tasks.forEach((t) => {
      if (t && String(t.linkedPartId) === String(part.id) && String(t.id) !== String(taskId)) {
        delete t.linkedPartId;
      }
    });
    if (taskId) {
      const task = tasks.find((t) => String(t.id) === String(taskId));
      if (task) task.linkedPartId = part.id;
    }
    part.linkedTaskId = taskId ? String(taskId) : "";
    vehicle.tasks = tasks;
  }

  function appendInstallHistory(part, entry) {
    if (!part) return;
    if (!Array.isArray(part.installHistory)) part.installHistory = [];
    part.installHistory.unshift({
      id: entry.id || `inst_${Date.now()}`,
      date: entry.date || new Date().toISOString(),
      mileage: sanitizeText(entry.mileage),
      notes: sanitizeText(entry.notes),
      taskId: entry.taskId ? String(entry.taskId) : ""
    });
    if (entry.mileage) part.installedMileage = entry.mileage;
  }

  function setPartStatus(vehicleId, partId, newStatus, options) {
    options = options || {};
    const vehicle = getVehicle(vehicleId);
    if (!vehicle) return null;
    ensureVehicleInventory(vehicle);
    const part = vehicle.parts.find((p) => String(p.id) === String(partId));
    if (!part) return null;
    const prev = part.status;
    const next = normalizePartStatus(newStatus);
    part.status = next;
    if (next === "Installed" && prev !== "Installed") {
      appendInstallHistory(part, {
        date: new Date().toISOString(),
        mileage: options.mileage || part.installedMileage || "",
        notes: options.notes || "Marked installed",
        taskId: part.linkedTaskId || ""
      });
    }
    persistVehicle(vehicle);
    notifyPartInventoryChanged({
      vehicleId: String(vehicleId),
      partId: String(partId),
      prev,
      next,
      status: next
    });
    return { part, prev, next, vehicle };
  }

  function filterParts(parts, filters) {
    const tab = filters.tab || "needed";
    const tabDef = INVENTORY_TABS.find((t) => t.id === tab) || INVENTORY_TABS[0];
    const vendor = sanitizeText(filters.vendor).toLowerCase();
    const status = filters.status ? normalizePartStatus(filters.status) : "";
    const category = sanitizeText(filters.category);
    const onlyInstalled = !!filters.installed;
    const onlyMissing = !!filters.missing;
    const query = sanitizeText(filters.query).toLowerCase();

    return parts.filter((part) => {
      const ps = normalizePartStatus(part.status);
      if (!tabDef.statuses.includes(ps)) return false;
      if (status && ps !== status) return false;
      if (vendor && !sanitizeText(part.vendor).toLowerCase().includes(vendor)) return false;
      if (category && normalizePartCategory(part.category) !== category) return false;
      if (onlyInstalled && !isPartInstalled(part)) return false;
      if (onlyMissing && !isPartMissing(part)) return false;
      if (query) {
        const hay = [part.name, part.vendor, part.partNumber, part.serialNumber, part.locationStored]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }

  function uniqueVendors(parts) {
    const set = new Set();
    parts.forEach((p) => {
      const v = sanitizeText(p.vendor);
      if (v) set.add(v);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function compressImageFile(file, maxDim) {
    maxDim = maxDim || 1200;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w >= h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function inventoryPageUrl(vehicleId, params) {
    const base = `inventory.html?id=${encodeURIComponent(vehicleId)}`;
    if (!params) return base;
    return `${base}&${new URLSearchParams(params).toString()}`;
  }

  const UI = {
    el,

    statusBadge(status) {
      const canon = normalizePartStatus(status);
      const span = el("span", `inv-status-badge ${STATUS_TONE_CLASS[canon] || ""}`, { text: canon });
      return span;
    },

    partCard(part, vehicle, handlers) {
      const card = el("button", "inv-part-card part-row", { type: "button" });
      const layout = el("div", "inv-part-row-layout");

      const thumb = el("div", "inv-part-thumb");
      const imgSrc = part.photo || part.receiptImage;
      if (imgSrc) {
        const img = el("img", "inv-part-thumb-img", { src: imgSrc, alt: "" });
        img.loading = "lazy";
        thumb.appendChild(img);
      } else {
        thumb.appendChild(el("span", "inv-part-thumb-ph", { text: "⚙" }));
      }

      const grid = el("div", "part-row-grid");

      const nameCol = el("div", "part-row-col part-row-col--name");
      nameCol.appendChild(el("h3", "inv-part-name", { text: part.name || "Part" }));

      const costCol = el("div", "part-row-col part-row-col--cost");
      costCol.appendChild(el("p", "inv-part-price", { text: formatPartCostDisplay(part) }));

      const statusCol = el("div", "part-row-col part-row-col--status inv-part-status-wrap");
      statusCol.appendChild(UI.statusBadge(part.status));

      grid.appendChild(nameCol);
      grid.appendChild(costCol);
      grid.appendChild(statusCol);

      layout.appendChild(thumb);
      layout.appendChild(grid);
      card.appendChild(layout);

      const task = getLinkedTask(vehicle, part);
      const meta = el("div", "inv-part-meta");
      if (part.vendor) {
        meta.appendChild(el("span", "inv-part-vendor", { text: part.vendor }));
      }
      meta.appendChild(el("p", "inv-part-task-rel", {
        text: task ? `Task: ${task.name || "Linked"}` : "No linked task"
      }));
      if (part.category) {
        meta.appendChild(el("span", "inv-part-cat", { text: part.category }));
      }
      card.appendChild(meta);

      card.addEventListener("click", () => handlers && handlers.onOpen && handlers.onOpen(part));
      return card;
    },

    tabBar(activeTab, onSelect) {
      const bar = el("div", "inv-tabs", { role: "tablist" });
      INVENTORY_TABS.forEach((tab) => {
        const btn = el("button", "inv-tab" + (activeTab === tab.id ? " is-active" : ""), {
          type: "button",
          role: "tab",
          "aria-selected": activeTab === tab.id ? "true" : "false",
          text: tab.label
        });
        btn.addEventListener("click", () => onSelect && onSelect(tab.id));
        bar.appendChild(btn);
      });
      return bar;
    },

    /**
     * Full parts dashboard (list + filters + optional editor mount)
     */
    renderDashboard(container, vehicle, state, handlers) {
      if (!container || !vehicle) return;
      ensureVehicleInventory(vehicle);
      container.innerHTML = "";

      const toolbar = el("div", "inv-toolbar");
      const search = el("input", "inv-input", {
        type: "search",
        placeholder: "Search parts…",
        "aria-label": "Search parts"
      });
      search.value = state.query || "";
      search.addEventListener("input", () => {
        state.query = search.value;
        handlers.onFilterChange && handlers.onFilterChange(state);
      });
      toolbar.appendChild(search);

      const filterGrid = el("div", "inv-filter-grid");
      const vendors = uniqueVendors(vehicle.parts);
      const vendorSel = el("select", "inv-input");
      vendorSel.appendChild(el("option", "", { value: "", text: "All vendors" }));
      vendors.forEach((v) => vendorSel.appendChild(el("option", "", { value: v, text: v })));
      vendorSel.value = state.vendor || "";
      vendorSel.addEventListener("change", () => {
        state.vendor = vendorSel.value;
        handlers.onFilterChange && handlers.onFilterChange(state);
      });

      const statusSel = el("select", "inv-input");
      statusSel.appendChild(el("option", "", { value: "", text: "All statuses" }));
      INVENTORY_STATUSES.forEach((s) => statusSel.appendChild(el("option", "", { value: s, text: s })));
      statusSel.value = state.status || "";
      statusSel.addEventListener("change", () => {
        state.status = statusSel.value;
        handlers.onFilterChange && handlers.onFilterChange(state);
      });

      const catSel = el("select", "inv-input");
      catSel.appendChild(el("option", "", { value: "", text: "All categories" }));
      TIER1_PART_CATEGORIES.forEach((c) => catSel.appendChild(el("option", "", { value: c, text: c })));
      catSel.value = state.category || "";
      catSel.addEventListener("change", () => {
        state.category = catSel.value;
        handlers.onFilterChange && handlers.onFilterChange(state);
      });

      const chkRow = el("div", "inv-chk-row");
      const missLbl = el("label", "inv-chk");
      const missCb = el("input", "", { type: "checkbox" });
      missCb.checked = !!state.missing;
      missCb.addEventListener("change", () => {
        state.missing = missCb.checked;
        handlers.onFilterChange && handlers.onFilterChange(state);
      });
      missLbl.appendChild(missCb);
      missLbl.appendChild(document.createTextNode(" Missing only"));
      const instLbl = el("label", "inv-chk");
      const instCb = el("input", "", { type: "checkbox" });
      instCb.checked = !!state.installed;
      instCb.addEventListener("change", () => {
        state.installed = instCb.checked;
        handlers.onFilterChange && handlers.onFilterChange(state);
      });
      instLbl.appendChild(instCb);
      instLbl.appendChild(document.createTextNode(" Installed only"));
      chkRow.appendChild(missLbl);
      chkRow.appendChild(instLbl);

      filterGrid.appendChild(wrapFilter("Vendor", vendorSel));
      filterGrid.appendChild(wrapFilter("Status", statusSel));
      filterGrid.appendChild(wrapFilter("Category", catSel));
      filterGrid.appendChild(chkRow);
      toolbar.appendChild(filterGrid);
      container.appendChild(toolbar);

      container.appendChild(UI.tabBar(state.tab || "needed", (tabId) => {
        state.tab = tabId;
        handlers.onFilterChange && handlers.onFilterChange(state);
      }));

      const list = el("div", "inv-list", { id: "inv-list-mount" });
      container.appendChild(list);

      function wrapFilter(label, input) {
        const w = el("div", "inv-filter-field");
        w.appendChild(el("span", "inv-filter-label", { text: label }));
        w.appendChild(input);
        return w;
      }

      function renderList() {
        const listMount = container.querySelector("#inv-list-mount") || list;
        if (!listMount) return;
        listMount.innerHTML = "";
        listMount.classList.remove("is-empty-primary");
        ensureVehicleInventory(vehicle);
        const fresh = getVehicle(vehicle.id);
        if (fresh) vehicle.parts = fresh.parts;
        const allParts = Array.isArray(vehicle.parts) ? vehicle.parts : [];
        const filtered = filterParts(allParts, state);
        const hasExtraFilters =
          !!sanitizeText(state.query) ||
          !!sanitizeText(state.vendor) ||
          !!sanitizeText(state.status) ||
          !!sanitizeText(state.category) ||
          !!state.missing ||
          !!state.installed;

        if (typeof document !== "undefined" && document.body) {
          document.body.classList.toggle("bp-empty-above-primary-action", allParts.length === 0);
        }

        if (!filtered.length) {
          const msg =
            allParts.length === 0
              ? BP_EMPTY_FIRST_ENTRY
              : hasExtraFilters
                ? "No parts match these filters."
                : `No parts in ${(INVENTORY_TABS.find((t) => t.id === (state.tab || "needed")) || INVENTORY_TABS[0]).label}. Try another tab or tap + Add Part below.`;
          listMount.classList.add("is-empty-primary");
          listMount.appendChild(el("div", "inv-empty bp-empty-state", { role: "status", text: msg }));
          return;
        }
        filtered.forEach((part) => {
          listMount.appendChild(UI.partCard(part, vehicle, {
            onOpen(p) {
              handlers.onOpenPart && handlers.onOpenPart(p);
            }
          }));
        });
      }

      function onPartInventoryChanged(e) {
        const d = e && e.detail;
        if (!d || String(d.vehicleId) !== String(vehicle.id)) return;
        if (d.status) alignInventoryListState(state, d.status);
        const freshVehicle = getVehicle(vehicle.id);
        if (freshVehicle) {
          vehicle.parts = freshVehicle.parts;
        }
        renderList();
      }

      global.addEventListener("buildpilot:part-inventory-changed", onPartInventoryChanged);
      renderList();
      return {
        renderList,
        destroy() {
          global.removeEventListener("buildpilot:part-inventory-changed", onPartInventoryChanged);
        }
      };
    },

    partEditorForm(part, vehicle, handlers) {
      const draft = part ? normalizePart(part, vehicle.id) : normalizePart({
        name: "",
        status: "Needed",
        category: "Engine",
        quantity: 1
      }, vehicle.id);

      const form = el("form", "inv-editor");
      form.setAttribute("novalidate", "");

      const addField = (label, node) => {
        const w = el("div", "inv-field");
        w.appendChild(el("label", "inv-field-label", { text: label }));
        w.appendChild(node);
        form.appendChild(w);
      };

      const nameInp = el("input", "inv-input", { type: "text", required: "true" });
      nameInp.value = draft.name;
      addField("Part name", nameInp);

      const vendorInp = el("input", "inv-input", { type: "text" });
      vendorInp.value = draft.vendor;
      addField("Vendor", vendorInp);

      const pnInp = el("input", "inv-input", { type: "text" });
      pnInp.value = draft.partNumber;
      addField("Part number", pnInp);

      const statusSel = el("select", "inv-input inv-status-select", {
        required: "true",
        id: "inv-part-status",
        "aria-label": "Part status"
      });
      populateMvpStatusSelect(statusSel, draft.status);
      statusSel.addEventListener("change", () => {
        if (!MVP_PART_STATUS_SET.has(statusSel.value)) {
          statusSel.value = exactMvpPartStatus(statusSel.value);
        }
      });
      addField("Status", statusSel);

      const catSel = el("select", "inv-input inv-category-select", {
        required: "true",
        id: "inv-part-category",
        "aria-label": "Structural system category"
      });
      populateTier1CategorySelect(catSel, draft.category);
      catSel.addEventListener("change", () => {
        if (!TIER1_CATEGORY_SET.has(catSel.value)) {
          catSel.value = exactTier1Category(catSel.value);
        }
      });
      addField("System category", catSel);

      const priceInp = el("input", "inv-input", { type: "number", min: "0", step: "0.01" });
      priceInp.value = draft.price || "";
      addField("Unit price", priceInp);

      const qtyInp = el("input", "inv-input", { type: "number", min: "1", step: "1" });
      qtyInp.value = String(draft.quantity || 1);
      addField("Quantity", qtyInp);

      const coreInp = el("input", "inv-input", { type: "number", min: "0", step: "0.01" });
      coreInp.value = draft.coreCharge || "";
      addField("Core charge", coreInp);

      const linkInp = el("input", "inv-input", { type: "url" });
      linkInp.value = draft.purchaseLink || "";
      addField("Purchase link", linkInp);

      const locInp = el("input", "inv-input", { type: "text" });
      locInp.value = draft.locationStored || "";
      addField("Storage location", locInp);

      const serialInp = el("input", "inv-input", { type: "text" });
      serialInp.value = draft.serialNumber || "";
      addField("Serial number", serialInp);

      const reuseInp = el("input", "inv-input", { type: "text" });
      reuseInp.value = draft.reuseStatus || "";
      addField("Reuse status", reuseInp);

      const mileInp = el("input", "inv-input", { type: "text" });
      mileInp.value = draft.installedMileage || "";
      addField("Installed mileage", mileInp);

      const warrantyInp = el("input", "inv-input", { type: "date" });
      if (draft.warrantyExpiration) warrantyInp.value = draft.warrantyExpiration.slice(0, 10);
      addField("Warranty expiration", warrantyInp);

      const taskSel = el("select", "inv-input");
      taskSel.appendChild(el("option", "", { value: "", text: "— No linked task —" }));
      (vehicle.tasks || []).forEach((t) => {
        const opt = el("option", "", { value: String(t.id), text: t.name || "Task" });
        if (String(draft.linkedTaskId) === String(t.id)) opt.selected = true;
        taskSel.appendChild(opt);
      });
      addField("Linked task", taskSel);

      let receiptImage = draft.receiptImage || "";
      let photo = draft.photo || "";
      const receiptPrev = el("div", "inv-receipt-preview");
      const photoPrev = el("div", "inv-receipt-preview");
      function paintPreviews() {
        receiptPrev.innerHTML = receiptImage
          ? `<img src="${receiptImage}" alt="Receipt" class="inv-receipt-img" />`
          : "<span class='inv-muted'>No receipt</span>";
        photoPrev.innerHTML = photo
          ? `<img src="${photo}" alt="Part" class="inv-receipt-img" />`
          : "<span class='inv-muted'>No photo</span>";
      }
      paintPreviews();

      const receiptFile = el("input", "inv-input", { type: "file", accept: "image/*" });
      receiptFile.addEventListener("change", async () => {
        const f = receiptFile.files && receiptFile.files[0];
        if (!f) return;
        receiptImage = await compressImageFile(f);
        receiptFile.value = "";
        paintPreviews();
      });
      addField("Receipt upload", receiptFile);
      addField("", receiptPrev);

      const photoFile = el("input", "inv-input", { type: "file", accept: "image/*" });
      photoFile.addEventListener("change", async () => {
        const f = photoFile.files && photoFile.files[0];
        if (!f) return;
        photo = await compressImageFile(f);
        photoFile.value = "";
        paintPreviews();
      });
      addField("Part photo", photoFile);
      addField("", photoPrev);

      if (draft.installHistory && draft.installHistory.length) {
        const hist = el("div", "inv-history");
        draft.installHistory.forEach((h) => {
          const row = el("div", "inv-history-row");
          const d = new Date(h.date);
          row.appendChild(el("span", "inv-history-date", {
            text: isNaN(d.getTime()) ? "—" : d.toLocaleDateString()
          }));
          if (h.mileage) row.appendChild(el("span", "", { text: `${h.mileage} mi` }));
          if (h.notes) row.appendChild(el("p", "inv-history-notes", { text: h.notes }));
          hist.appendChild(row);
        });
        addField("Install history", hist);
      }

      const actions = el("div", "inv-form-actions");
      const cancel = el("button", "inv-btn inv-btn--secondary", { type: "button", text: "Cancel" });
      cancel.addEventListener("click", (e) => {
        e.preventDefault();
        handlers.onCancel && handlers.onCancel();
      });
      const save = el("button", "inv-btn inv-btn--primary", { type: "submit", text: "Save part" });
      actions.appendChild(cancel);
      actions.appendChild(save);
      form.appendChild(actions);

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!nameInp.value.trim()) {
          nameInp.focus();
          return;
        }
        const payload = normalizePart({
          ...draft,
          name: nameInp.value.trim(),
          vendor: vendorInp.value.trim(),
          partNumber: pnInp.value.trim(),
          status: exactMvpPartStatus(statusSel.value),
          category: exactTier1Category(catSel.value),
          price: priceInp.value,
          quantity: qtyInp.value,
          coreCharge: coreInp.value,
          purchaseLink: linkInp.value.trim(),
          locationStored: locInp.value.trim(),
          serialNumber: serialInp.value.trim(),
          reuseStatus: reuseInp.value.trim(),
          installedMileage: mileInp.value.trim(),
          warrantyExpiration: warrantyInp.value ? new Date(warrantyInp.value + "T12:00:00").toISOString() : "",
          receiptImage,
          photo,
          linkedTaskId: taskSel.value
        }, vehicle.id);
        syncPartTaskLink(vehicle, payload, taskSel.value);
        handlers.onSave && handlers.onSave(payload);
      });

      return form;
    }
  };

  global.BuildPilotInventory = {
    LS_VEHICLES_KEY,
    LEGACY_LS_VEHICLES_KEY,
    MVP_PART_STATUSES,
    INVENTORY_STATUSES,
    INVENTORY_TABS,
    exactMvpPartStatus,
    populateMvpStatusSelect,
    TIER1_PART_CATEGORIES,
    exactTier1Category,
    normalizePartCategory,
    populateTier1CategorySelect,
    LEGACY_STATUS_MAP,
    EXPORT_LEGACY_STATUS,
    normalizePartStatus,
    exportStatusForSpreadsheet,
    normalizePart,
    ensureVehicleInventory,
    listParts,
    savePart,
    deletePart,
    setPartStatus,
    filterParts,
    parseMoneyAmount,
    formatMoney,
    formatPartCostDisplay,
    getPartPrice,
    partLineTotal,
    isPartMissing,
    isPartInstalled,
    isPartBudgetCommitted,
    tabForStatus,
    alignInventoryListState,
    notifyPartInventoryChanged,
    getLinkedTask,
    syncPartTaskLink,
    appendInstallHistory,
    getVehicle,
    persistVehicle,
    loadVehicles,
    inventoryPageUrl,
    compressImageFile,
    UI
  };
})(typeof window !== "undefined" ? window : globalThis);

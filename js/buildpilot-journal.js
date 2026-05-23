/**
 * BuildPilot Build Journal — local-first journal entries on vehicle records.
 * @namespace BuildPilotJournal
 */
(function (global) {
  "use strict";

  const LS_VEHICLES_KEY = "buildpilot_vehicles";
  const LEGACY_LS_VEHICLES_KEY = "vehicles";
  const LS_SELECTED_VEHICLE_ID_KEY = "selectedVehicleId";
  const JOURNAL_ENTRY_ID_PREFIX = "journal_";
  const MAX_PHOTOS_PER_ENTRY = 8;
  const MAX_PHOTO_DIMENSION = 1280;
  const JPEG_QUALITY = 0.82;

  /** @typedef {Object} JournalEntry */
  /**
   * @property {string} id
   * @property {string|number} vehicleId
   * @property {string} date ISO
   * @property {number} hoursWorked
   * @property {string} title
   * @property {string} notes
   * @property {string[]} photos data URLs
   * @property {string} problemsEncountered
   * @property {string} nextSteps
   * @property {string[]} partsInstalled part ids
   * @property {string[]} laborPerformed labor ids
   * @property {string[]} linkedTaskIds
   * @property {string} timelinePhase
   * @property {string} [createdAt]
   * @property {string} [updatedAt]
   */

  const TIMELINE_PHASES = [
    { id: "all", label: "All" },
    { id: "engine-teardown", label: "Engine Teardown" },
    { id: "machine-work", label: "Machine Work" },
    { id: "assembly", label: "Assembly" },
    { id: "first-startup", label: "First Startup" },
    { id: "road-test", label: "Road Test" }
  ];

  const PHASE_LABEL_BY_ID = Object.fromEntries(
    TIMELINE_PHASES.filter((p) => p.id !== "all").map((p) => [p.id, p.label])
  );

  function el(tag, className, attrs, children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (v == null) return;
        if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v;
        else node.setAttribute(k, v);
      });
    }
    const list = children == null ? [] : Array.isArray(children) ? children : [children];
    list.forEach((child) => {
      if (child == null) return;
      if (typeof child === "string") node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    });
    return node;
  }

  function loadVehicles() {
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

  function getVehicleById(vehicleId) {
    return loadVehicles().find((v) => v && String(v.id) === String(vehicleId)) || null;
  }

  function persistVehicle(vehicle) {
    const vehicles = loadVehicles();
    const idx = vehicles.findIndex((v) => v && String(v.id) === String(vehicle.id));
    if (idx < 0) return false;
    vehicles[idx] = vehicle;
    saveVehicles(vehicles);
    return true;
  }

  function newJournalId() {
    return `${JOURNAL_ENTRY_ID_PREFIX}${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  }

  function sanitizeNumber(val, fallback) {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : fallback != null ? fallback : 0;
  }

  function normalizeDateIso(val) {
    if (!val) return new Date().toISOString();
    const d = val instanceof Date ? val : new Date(val);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  function formatJournalDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  function formatHours(hrs) {
    const n = sanitizeNumber(hrs, 0);
    if (n <= 0) return "—";
    return n % 1 === 0 ? `${n} hr${n === 1 ? "" : "s"}` : `${n.toFixed(1)} hrs`;
  }

  function entrySummary(entry) {
    const parts = [];
    if (entry.notes) parts.push(String(entry.notes).trim());
    if (entry.problemsEncountered) parts.push(`Issue: ${String(entry.problemsEncountered).trim()}`);
    if (entry.nextSteps) parts.push(`Next: ${String(entry.nextSteps).trim()}`);
    const text = parts.join(" · ") || "No notes yet.";
    return text.length > 140 ? `${text.slice(0, 137)}…` : text;
  }

  function previewPhoto(entry) {
    const photos = Array.isArray(entry.photos) ? entry.photos : [];
    return photos.find(Boolean) || null;
  }

  function ensureJournalOnVehicle(vehicle) {
    if (!vehicle) return vehicle;
    if (!Array.isArray(vehicle.journalEntries)) vehicle.journalEntries = [];
    migrateBuildActivityIfNeeded(vehicle);
    return vehicle;
  }

  function migrateBuildActivityIfNeeded(vehicle) {
    if (!Array.isArray(vehicle.buildActivity) || !vehicle.buildActivity.length) return;
    if (!Array.isArray(vehicle.journalEntries)) vehicle.journalEntries = [];
    const existingIds = new Set(vehicle.journalEntries.map((e) => e.id));
    vehicle.buildActivity.forEach((act) => {
      const legacyId = act.id ? `legacy_${act.id}` : newJournalId();
      if (existingIds.has(legacyId)) return;
      vehicle.journalEntries.push(normalizeJournalEntry({
        id: legacyId,
        vehicleId: vehicle.id,
        date: act.date || act.createdAt,
        hoursWorked: act.hoursWorked ?? act.hours ?? 0,
        title: act.title || (act.notes ? String(act.notes).split("\n")[0].slice(0, 60) : "Garage session"),
        notes: act.notes || "",
        photos: act.photos || [],
        problemsEncountered: "",
        nextSteps: "",
        partsInstalled: [],
        laborPerformed: [],
        linkedTaskIds: [],
        timelinePhase: "",
        createdAt: act.createdAt
      }, vehicle.id));
    });
    delete vehicle.buildActivity;
  }

  /**
   * @param {Partial<JournalEntry>} raw
   * @param {string|number} vehicleId
   * @returns {JournalEntry}
   */
  function normalizeJournalEntry(raw, vehicleId) {
    const now = new Date().toISOString();
    const phase = String(raw.timelinePhase || "").trim();
    return {
      id: raw.id || newJournalId(),
      vehicleId: raw.vehicleId != null ? raw.vehicleId : vehicleId,
      date: normalizeDateIso(raw.date),
      hoursWorked: Math.max(0, sanitizeNumber(raw.hoursWorked, 0)),
      title: String(raw.title || "Untitled entry").trim() || "Untitled entry",
      notes: String(raw.notes || "").trim(),
      photos: Array.isArray(raw.photos) ? raw.photos.filter(Boolean).slice(0, MAX_PHOTOS_PER_ENTRY) : [],
      problemsEncountered: String(raw.problemsEncountered || "").trim(),
      nextSteps: String(raw.nextSteps || "").trim(),
      partsInstalled: Array.isArray(raw.partsInstalled) ? raw.partsInstalled.map(String) : [],
      laborPerformed: Array.isArray(raw.laborPerformed) ? raw.laborPerformed.map(String) : [],
      linkedTaskIds: Array.isArray(raw.linkedTaskIds) ? raw.linkedTaskIds.map(String) : [],
      timelinePhase: TIMELINE_PHASES.some((p) => p.id === phase) ? phase : "",
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || now
    };
  }

  function listJournalEntries(vehicleId) {
    const vehicle = getVehicleById(vehicleId);
    if (!vehicle) return [];
    ensureJournalOnVehicle(vehicle);
    return vehicle.journalEntries.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function getJournalEntry(vehicleId, entryId) {
    return listJournalEntries(vehicleId).find((e) => String(e.id) === String(entryId)) || null;
  }

  function saveJournalEntry(vehicleId, entry) {
    const vehicle = getVehicleById(vehicleId);
    if (!vehicle) return null;
    ensureJournalOnVehicle(vehicle);
    const normalized = normalizeJournalEntry({ ...entry, updatedAt: new Date().toISOString() }, vehicleId);
    const idx = vehicle.journalEntries.findIndex((e) => String(e.id) === String(normalized.id));
    if (idx >= 0) vehicle.journalEntries[idx] = normalized;
    else vehicle.journalEntries.unshift(normalized);
    vehicle.lastUpdatedAt = new Date().toISOString();
    persistVehicle(vehicle);
    return normalized;
  }

  function deleteJournalEntry(vehicleId, entryId) {
    const vehicle = getVehicleById(vehicleId);
    if (!vehicle || !Array.isArray(vehicle.journalEntries)) return false;
    const before = vehicle.journalEntries.length;
    vehicle.journalEntries = vehicle.journalEntries.filter((e) => String(e.id) !== String(entryId));
    if (vehicle.journalEntries.length === before) return false;
    vehicle.lastUpdatedAt = new Date().toISOString();
    persistVehicle(vehicle);
    return true;
  }

  function filterJournalEntries(entries, options) {
    const q = String(options.query || "").trim().toLowerCase();
    const phase = options.timelinePhase || "all";
    const from = options.dateFrom ? new Date(options.dateFrom + "T00:00:00") : null;
    const to = options.dateTo ? new Date(options.dateTo + "T23:59:59") : null;

    return entries.filter((entry) => {
      if (phase !== "all" && String(entry.timelinePhase || "") !== phase) return false;
      const d = new Date(entry.date);
      if (from && !isNaN(from.getTime()) && d < from) return false;
      if (to && !isNaN(to.getTime()) && d > to) return false;
      if (!q) return true;
      const hay = [
        entry.title,
        entry.notes,
        entry.problemsEncountered,
        entry.nextSteps,
        PHASE_LABEL_BY_ID[entry.timelinePhase] || entry.timelinePhase
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  function resolvePartLabels(vehicle, partIds) {
    const parts = Array.isArray(vehicle.parts) ? vehicle.parts : [];
    return (partIds || []).map((id) => {
      const p = parts.find((x) => String(x.id) === String(id));
      return p ? { id, label: p.name || "Part", category: p.category } : { id, label: "Unknown part", category: "" };
    });
  }

  function resolveTaskLabels(vehicle, taskIds) {
    const tasks = Array.isArray(vehicle.tasks) ? vehicle.tasks : [];
    return (taskIds || []).map((id) => {
      const t = tasks.find((x) => String(x.id) === String(id));
      return t ? { id, label: t.name || "Task", category: t.category } : { id, label: "Unknown task", category: "" };
    });
  }

  function resolveLaborLabels(vehicle, laborIds) {
    const labor = Array.isArray(vehicle.labor) ? vehicle.labor : [];
    return (laborIds || []).map((id) => {
      const l = labor.find((x) => String(x.id) === String(id));
      return l ? { id, label: l.shop || l.description || "Outside labor", category: l.category } : { id, label: "Unknown labor", category: "" };
    });
  }

  function compressImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          const max = MAX_PHOTO_DIMENSION;
          if (w > max || h > max) {
            if (w >= h) {
              h = Math.round((h * max) / w);
              w = max;
            } else {
              w = Math.round((w * max) / h);
              h = max;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function readPhotoFiles(fileList, existingCount) {
    const files = [...(fileList || [])];
    const room = MAX_PHOTOS_PER_ENTRY - (existingCount || 0);
    const urls = [];
    for (const file of files.slice(0, room)) {
      if (!file.type || !file.type.startsWith("image/")) continue;
      try {
        urls.push(await compressImageFile(file));
      } catch (_e) { /* skip */ }
    }
    return urls;
  }

  function getVehicleDisplayTitle(vehicle) {
    if (!vehicle) return "Vehicle";
    const ymm = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ").trim();
    return ymm || vehicle.name || "Vehicle";
  }

  function journalPageUrl(vehicleId, params) {
    const base = `journal.html?id=${encodeURIComponent(vehicleId)}`;
    if (!params) return base;
    const qs = new URLSearchParams(params).toString();
    return qs ? `${base}&${qs}` : base;
  }

  /* —— Reusable UI components —— */

  const UI = {
    el,

    fieldGroup(labelText, inputEl, hint) {
      const wrap = el("div", "bj-field");
      const label = el("label", "bj-field-label", { text: labelText });
      if (inputEl.id) label.setAttribute("for", inputEl.id);
      wrap.appendChild(label);
      wrap.appendChild(inputEl);
      if (hint) wrap.appendChild(el("p", "bj-field-hint", { text: hint }));
      return wrap;
    },

    textInput(id, placeholder, value) {
      const inp = el("input", "bj-input", { id, type: "text", placeholder: placeholder || "" });
      if (value != null) inp.value = value;
      return inp;
    },

    textarea(id, placeholder, value, rows) {
      const ta = el("textarea", "bj-input bj-textarea", { id, placeholder: placeholder || "", rows: String(rows || 4) });
      if (value != null) ta.value = value;
      return ta;
    },

    primaryButton(label, onClick) {
      const btn = el("button", "bj-btn bj-btn--primary", { type: "button", text: label });
      btn.addEventListener("click", onClick);
      return btn;
    },

    secondaryButton(label, onClick) {
      const btn = el("button", "bj-btn bj-btn--secondary", { type: "button", text: label });
      btn.addEventListener("click", onClick);
      return btn;
    },

    dangerButton(label, onClick) {
      const btn = el("button", "bj-btn bj-btn--danger", { type: "button", text: label });
      btn.addEventListener("click", onClick);
      return btn;
    },

    /**
     * Journal list card
     * @param {JournalEntry} entry
     * @param {{ onOpen?: function }} handlers
     */
    journalListCard(entry, handlers) {
      const card = el("button", "bj-card", { type: "button" });
      const thumbSrc = previewPhoto(entry);
      const thumb = el('div', "bj-card-thumb");
      if (thumbSrc) {
        const img = el("img", "bj-card-thumb-img", { src: thumbSrc, alt: "" });
        img.loading = "lazy";
        thumb.appendChild(img);
      } else {
        thumb.appendChild(el("span", "bj-card-thumb-placeholder", { text: "📷" }));
      }
      const body = el("div", "bj-card-body");
      const meta = el("div", "bj-card-meta");
      meta.appendChild(el("span", "bj-card-date", { text: formatJournalDate(entry.date) }));
      meta.appendChild(el("span", "bj-card-hours", { text: formatHours(entry.hoursWorked) }));
      body.appendChild(meta);
      body.appendChild(el("h3", "bj-card-title", { text: entry.title || "Untitled" }));
      if (entry.timelinePhase && PHASE_LABEL_BY_ID[entry.timelinePhase]) {
        body.appendChild(el("span", "bj-card-phase", { text: PHASE_LABEL_BY_ID[entry.timelinePhase] }));
      }
      body.appendChild(el("p", "bj-card-summary", { text: entrySummary(entry) }));
      card.appendChild(thumb);
      card.appendChild(body);
      card.addEventListener("click", () => handlers && handlers.onOpen && handlers.onOpen(entry));
      return card;
    },

    timelinePhaseBar(activePhase, onSelect) {
      const wrap = el('div', "bj-timeline-bar", { role: "tablist", "aria-label": "Build timeline phases" });
      TIMELINE_PHASES.forEach((phase) => {
        const btn = el("button", "bj-timeline-chip" + (activePhase === phase.id ? " is-active" : ""), {
          type: "button",
          role: "tab",
          "aria-selected": activePhase === phase.id ? "true" : "false",
          text: phase.label
        });
        btn.addEventListener("click", () => onSelect && onSelect(phase.id));
        wrap.appendChild(btn);
      });
      return wrap;
    },

    photoGrid(photos, options) {
      const wrap = el("div", "bj-photo-grid");
      (photos || []).forEach((src, i) => {
        if (!src) return;
        const cell = el("button", "bj-photo-cell", { type: "button", "aria-label": `Photo ${i + 1}` });
        const img = el("img", "bj-photo-img", { src, alt: "Journal photo" });
        img.loading = "lazy";
        cell.appendChild(img);
        if (options && options.onRemove) {
          const rm = el("span", "bj-photo-remove", { text: "×" });
          rm.addEventListener("click", (e) => {
            e.stopPropagation();
            options.onRemove(i);
          });
          cell.appendChild(rm);
        }
        cell.addEventListener("click", () => {
          if (options && options.onView) options.onView(src);
        });
        wrap.appendChild(cell);
      });
      return wrap;
    },

    linkedChips(items, emptyLabel) {
      const wrap = el("div", "bj-linked-chips");
      if (!items || !items.length) {
        wrap.appendChild(el("span", "bj-linked-empty", { text: emptyLabel || "None linked" }));
        return wrap;
      }
      items.forEach((item) => {
        wrap.appendChild(el("span", "bj-linked-chip", { text: item.label || item }));
      });
      return wrap;
    },

    detailSection(title, contentEl) {
      const sec = el("section", "bj-detail-section");
      sec.appendChild(el("h2", "bj-detail-heading", { text: title }));
      sec.appendChild(contentEl);
      return sec;
    },

    /**
     * Full journal entry detail view
     */
    journalDetailView(entry, vehicle, handlers) {
      const root = el("article", "bj-detail");
      const header = el("header", "bj-detail-header");
      const back = el("button", "bj-back-btn", { type: "button", "aria-label": "Back to journal list" });
      back.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>';
      back.addEventListener("click", () => handlers.onBack && handlers.onBack());
      const headText = el("div", "bj-detail-head-text");
      headText.appendChild(el("p", "bj-detail-date", { text: formatJournalDate(entry.date) }));
      headText.appendChild(el("h1", "bj-detail-title", { text: entry.title }));
      const meta = el("div", "bj-detail-meta");
      meta.appendChild(el("span", "bj-detail-hours", { text: formatHours(entry.hoursWorked) }));
      if (entry.timelinePhase && PHASE_LABEL_BY_ID[entry.timelinePhase]) {
        meta.appendChild(el("span", "bj-detail-phase", { text: PHASE_LABEL_BY_ID[entry.timelinePhase] }));
      }
      headText.appendChild(meta);
      header.appendChild(back);
      header.appendChild(headText);
      root.appendChild(header);

      const actions = el('div', "bj-detail-actions");
      actions.appendChild(UI.primaryButton("Edit Entry", () => handlers.onEdit && handlers.onEdit(entry)));
      actions.appendChild(UI.dangerButton("Delete", () => handlers.onDelete && handlers.onDelete(entry)));
      root.appendChild(actions);

      if (entry.notes) {
        const notes = el("p", "bj-detail-copy", { text: entry.notes });
        root.appendChild(UI.detailSection("Work Completed", notes));
      }
      if (entry.problemsEncountered) {
        root.appendChild(UI.detailSection("Issues Found", el("p", "bj-detail-copy bj-detail-copy--warn", { text: entry.problemsEncountered })));
      }
      if (entry.nextSteps) {
        root.appendChild(UI.detailSection("Next Steps", el("p", "bj-detail-copy", { text: entry.nextSteps })));
      }

      const photos = Array.isArray(entry.photos) ? entry.photos.filter(Boolean) : [];
      if (photos.length) {
        const grid = UI.photoGrid(photos, {
          onView(src) {
            const overlay = el("div", "bj-lightbox");
            const img = el("img", "bj-lightbox-img", { src, alt: "Full size photo" });
            overlay.appendChild(img);
            overlay.addEventListener("click", () => overlay.remove());
            document.body.appendChild(overlay);
          }
        });
        root.appendChild(UI.detailSection("Photos", grid));
      }

      const parts = resolvePartLabels(vehicle, entry.partsInstalled);
      root.appendChild(UI.detailSection("Linked Parts", UI.linkedChips(parts, "No parts linked")));

      const tasks = resolveTaskLabels(vehicle, entry.linkedTaskIds);
      root.appendChild(UI.detailSection("Linked Tasks", UI.linkedChips(tasks, "No tasks linked")));

      const labor = resolveLaborLabels(vehicle, entry.laborPerformed);
      root.appendChild(UI.detailSection("Labor Performed", UI.linkedChips(labor, "No outside labor linked")));

      return root;
    },

    /**
     * Journal entry form (add / edit)
     */
    journalEntryForm(entry, vehicle, handlers) {
      const isNew = !entry || !entry.id;
      const draft = normalizeJournalEntry(entry || {}, vehicle.id);
      const root = el("form", "bj-form");
      root.setAttribute("novalidate", "");

      const titleInp = UI.textInput("bj-title", "e.g. Installed fuel system", draft.title);
      root.appendChild(UI.fieldGroup("Title", titleInp));

      const dateInp = el("input", "bj-input", { id: "bj-date", type: "date" });
      dateInp.value = new Date(draft.date).toISOString().slice(0, 10);
      root.appendChild(UI.fieldGroup("Date", dateInp));

      const hrsInp = el("input", "bj-input", { id: "bj-hours", type: "number", min: "0", step: "0.5", placeholder: "0" });
      hrsInp.value = draft.hoursWorked ? String(draft.hoursWorked) : "";
      root.appendChild(UI.fieldGroup("Hours Worked", hrsInp));

      const phaseSel = el("select", "bj-input", { id: "bj-phase" });
      phaseSel.appendChild(el("option", "", { value: "", text: "— Phase —" }));
      TIMELINE_PHASES.filter((p) => p.id !== "all").forEach((p) => {
        const opt = el("option", "", { value: p.id, text: p.label });
        if (draft.timelinePhase === p.id) opt.selected = true;
        phaseSel.appendChild(opt);
      });
      root.appendChild(UI.fieldGroup("Timeline Phase", phaseSel));

      root.appendChild(UI.fieldGroup("Work Completed", UI.textarea("bj-notes", "What did you finish today?", draft.notes, 5)));
      root.appendChild(UI.fieldGroup("Issues Found", UI.textarea("bj-problems", "Problems, setbacks, surprises…", draft.problemsEncountered, 3)));
      root.appendChild(UI.fieldGroup("Next Steps", UI.textarea("bj-next", "What is next in the garage?", draft.nextSteps, 3)));

      let photoList = draft.photos.slice();
      const photoSection = el("div", "bj-photo-upload-section");
      const photoGridMount = el("div", "bj-photo-grid-mount");
      function renderPhotoGrid() {
        photoGridMount.innerHTML = "";
        photoGridMount.appendChild(UI.photoGrid(photoList, {
          onRemove(i) {
            photoList = photoList.filter((_, idx) => idx !== i);
            renderPhotoGrid();
          },
          onView(src) {
            const overlay = el('div', "bj-lightbox");
            overlay.appendChild(el("img", "bj-lightbox-img", { src, alt: "" }));
            overlay.addEventListener("click", () => overlay.remove());
            document.body.appendChild(overlay);
          }
        }));
      }
      renderPhotoGrid();
      const fileInp = el("input", "bj-input", { id: "bj-photos", type: "file", accept: "image/*", multiple: "multiple" });
      fileInp.addEventListener("change", async () => {
        const added = await readPhotoFiles(fileInp.files, photoList.length);
        photoList = photoList.concat(added).slice(0, MAX_PHOTOS_PER_ENTRY);
        fileInp.value = "";
        renderPhotoGrid();
      });
      photoSection.appendChild(photoGridMount);
      photoSection.appendChild(fileInp);
      root.appendChild(UI.fieldGroup("Photos", photoSection, `Up to ${MAX_PHOTOS_PER_ENTRY} images`));

      function multiSelectField(label, options, selectedIds) {
        const box = el("div", "bj-multi-select");
        const selected = new Set((selectedIds || []).map(String));
        options.forEach((opt) => {
          const row = el("label", "bj-check-row");
          const cb = el("input", "bj-check", { type: "checkbox" });
          cb.value = String(opt.id);
          cb.checked = selected.has(String(opt.id));
          row.appendChild(cb);
          row.appendChild(el("span", "bj-check-label", { text: opt.label }));
          box.appendChild(row);
        });
        return UI.fieldGroup(label, box);
      }

      const partOpts = (vehicle.parts || []).map((p) => ({ id: p.id, label: p.name || "Part" }));
      const taskOpts = (vehicle.tasks || []).map((t) => ({ id: t.id, label: t.name || "Task" }));
      const laborOpts = (vehicle.labor || []).map((l) => ({ id: l.id, label: l.shop || l.description || "Labor" }));

      root.appendChild(multiSelectField("Parts Installed", partOpts, draft.partsInstalled));
      root.appendChild(multiSelectField("Linked Tasks", taskOpts, draft.linkedTaskIds));
      root.appendChild(multiSelectField("Outside Labor Performed", laborOpts, draft.laborPerformed));

      function collectCheckedIds(containerLabel) {
        const fields = root.querySelectorAll(".bj-field");
        for (const field of fields) {
          const lbl = field.querySelector(".bj-field-label");
          if (!lbl || lbl.textContent !== containerLabel) continue;
          return [...field.querySelectorAll("input[type=checkbox]:checked")].map((cb) => cb.value);
        }
        return [];
      }

      const btnRow = el("div", "bj-form-actions");
      btnRow.appendChild(UI.secondaryButton("Cancel", (e) => {
        e.preventDefault();
        handlers.onCancel && handlers.onCancel();
      }));
      btnRow.appendChild(UI.primaryButton(isNew ? "Add Entry" : "Save Changes", (e) => {
        e.preventDefault();
        if (!titleInp.value.trim()) {
          titleInp.focus();
          return;
        }
        const payload = normalizeJournalEntry({
          ...draft,
          title: titleInp.value.trim(),
          date: new Date(dateInp.value + "T12:00:00").toISOString(),
          hoursWorked: hrsInp.value,
          timelinePhase: phaseSel.value,
          notes: root.querySelector("#bj-notes").value,
          problemsEncountered: root.querySelector("#bj-problems").value,
          nextSteps: root.querySelector("#bj-next").value,
          photos: photoList,
          partsInstalled: collectCheckedIds("Parts Installed"),
          linkedTaskIds: collectCheckedIds("Linked Tasks"),
          laborPerformed: collectCheckedIds("Outside Labor Performed")
        }, vehicle.id);
        handlers.onSave && handlers.onSave(payload);
      }));
      root.appendChild(btnRow);
      return root;
    }
  };

  global.BuildPilotJournal = {
    LS_VEHICLES_KEY,
    LS_SELECTED_VEHICLE_ID_KEY,
    TIMELINE_PHASES,
    PHASE_LABEL_BY_ID,
    MAX_PHOTOS_PER_ENTRY,
    loadVehicles,
    saveVehicles,
    getVehicleById,
    persistVehicle,
    ensureJournalOnVehicle,
    normalizeJournalEntry,
    listJournalEntries,
    getJournalEntry,
    saveJournalEntry,
    deleteJournalEntry,
    filterJournalEntries,
    resolvePartLabels,
    resolveTaskLabels,
    resolveLaborLabels,
    readPhotoFiles,
    formatJournalDate,
    formatHours,
    entrySummary,
    previewPhoto,
    getVehicleDisplayTitle,
    journalPageUrl,
    UI
  };
})(typeof window !== "undefined" ? window : globalThis);

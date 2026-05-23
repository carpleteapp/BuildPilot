/**
 * BuildPilot Garage Mode — fast, glove-friendly DIY project garage UI.
 * @namespace BuildPilotGarageMode
 */
(function (global) {
  "use strict";

  const LS_VEHICLES_KEY = "buildpilot_vehicles";
  const LEGACY_LS_VEHICLES_KEY = "vehicles";
  const SESSION_ID_PREFIX = "gs_";
  const MAX_SESSION_PHOTOS = 24;
  const MAX_PHOTO_DIMENSION = 1280;
  const JPEG_QUALITY = 0.82;

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

  function getVehicle(vehicleId) {
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

  function getVehicleDisplayTitle(vehicle) {
    if (!vehicle) return "Vehicle";
    const ymm = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ").trim();
    return ymm || vehicle.name || "Vehicle";
  }

  function formatDuration(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
    return `${s}s`;
  }

  function formatTime(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function formatDateLong(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  function ensureGarageSessionsOnVehicle(vehicle) {
    if (!vehicle) return vehicle;
    if (!Array.isArray(vehicle.garageSessions)) vehicle.garageSessions = [];
    return vehicle;
  }

  function normalizeSession(raw, vehicleId) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: raw.id || newId(SESSION_ID_PREFIX),
      vehicleId: raw.vehicleId != null ? raw.vehicleId : vehicleId,
      startedAt: raw.startedAt || new Date().toISOString(),
      endedAt: raw.endedAt || null,
      photos: Array.isArray(raw.photos) ? raw.photos.slice() : [],
      notes: Array.isArray(raw.notes) ? raw.notes.slice() : [],
      tasksCompleted: Array.isArray(raw.tasksCompleted) ? raw.tasksCompleted.slice() : [],
      partsInstalled: Array.isArray(raw.partsInstalled) ? raw.partsInstalled.slice() : [],
      timer: {
        running: !!(raw.timer && raw.timer.running),
        startedAt: raw.timer && raw.timer.startedAt ? raw.timer.startedAt : null,
        accumulatedMs: Math.max(0, Number(raw.timer && raw.timer.accumulatedMs) || 0)
      },
      summary: raw.summary || null
    };
  }

  function getActiveSession(vehicle) {
    ensureGarageSessionsOnVehicle(vehicle);
    if (!vehicle.activeGarageSessionId) return null;
    const s = vehicle.garageSessions.find(
      (x) => String(x.id) === String(vehicle.activeGarageSessionId) && !x.endedAt
    );
    return s ? normalizeSession(s, vehicle.id) : null;
  }

  function saveSessionOnVehicle(vehicle, session) {
    ensureGarageSessionsOnVehicle(vehicle);
    const norm = normalizeSession(session, vehicle.id);
    const idx = vehicle.garageSessions.findIndex((s) => String(s.id) === String(norm.id));
    if (idx >= 0) vehicle.garageSessions[idx] = norm;
    else vehicle.garageSessions.unshift(norm);
    vehicle.activeGarageSessionId = norm.endedAt ? "" : norm.id;
    vehicle.lastUpdatedAt = new Date().toISOString();
    persistVehicle(vehicle);
    return norm;
  }

  function startSession(vehicleId) {
    const vehicle = getVehicle(vehicleId);
    if (!vehicle) return null;
    const existing = getActiveSession(vehicle);
    if (existing) return existing;
    const session = normalizeSession({
      id: newId(SESSION_ID_PREFIX),
      vehicleId,
      startedAt: new Date().toISOString(),
      photos: [],
      notes: [],
      tasksCompleted: [],
      partsInstalled: [],
      timer: {
        running: true,
        startedAt: new Date().toISOString(),
        accumulatedMs: 0
      }
    }, vehicleId);
    vehicle.activeGarageSessionId = session.id;
    saveSessionOnVehicle(vehicle, session);
    return session;
  }

  function mutateActiveSession(vehicleId, mutator) {
    const vehicle = getVehicle(vehicleId);
    if (!vehicle) return null;
    const session = getActiveSession(vehicle);
    if (!session) return null;
    mutator(session, vehicle);
    return saveSessionOnVehicle(vehicle, session);
  }

  function getTimerElapsedMs(session) {
    if (!session || !session.timer) return 0;
    let ms = session.timer.accumulatedMs || 0;
    if (session.timer.running && session.timer.startedAt) {
      ms += Date.now() - new Date(session.timer.startedAt).getTime();
    }
    return Math.max(0, ms);
  }

  function getSessionWallMs(session) {
    if (!session || !session.startedAt) return 0;
    const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
    return Math.max(0, end - new Date(session.startedAt).getTime());
  }

  function toggleTimer(vehicleId) {
    return mutateActiveSession(vehicleId, (session) => {
      const t = session.timer;
      if (t.running) {
        t.accumulatedMs = getTimerElapsedMs(session);
        t.running = false;
        t.startedAt = null;
      } else {
        t.running = true;
        t.startedAt = new Date().toISOString();
      }
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
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function addSessionPhoto(vehicleId, file) {
    if (!file || !file.type || !file.type.startsWith("image/")) return null;
    const dataUrl = await compressImageFile(file);
    return mutateActiveSession(vehicleId, (session) => {
      if (session.photos.length >= MAX_SESSION_PHOTOS) return;
      session.photos.push({ id: newId("photo_"), dataUrl, at: new Date().toISOString() });
    });
  }

  function addSessionNote(vehicleId, text, source) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return null;
    return mutateActiveSession(vehicleId, (session) => {
      session.notes.push({
        id: newId("note_"),
        text: trimmed,
        at: new Date().toISOString(),
        source: source === "voice" ? "voice" : "typed"
      });
    });
  }

  function recordTaskCompleted(vehicleId, taskId, taskName) {
    const vehicle = getVehicle(vehicleId);
    if (!vehicle) return null;
    const tasks = Array.isArray(vehicle.tasks) ? vehicle.tasks : [];
    const task = tasks.find((t) => String(t.id) === String(taskId));
    if (task) {
      task.status = "Complete";
      task.completed = true;
      vehicle.tasks = tasks;
    }
    const session = mutateActiveSession(vehicleId, (s) => {
      if (s.tasksCompleted.some((x) => String(x.taskId) === String(taskId))) return;
      s.tasksCompleted.push({
        taskId: String(taskId),
        name: taskName || (task && task.name) || "Task",
        at: new Date().toISOString()
      });
    });
    if (vehicle && task) persistVehicle(vehicle);
    return session;
  }

  function recordPartInstalled(vehicleId, partId, partName) {
    let vehicle = getVehicle(vehicleId);
    if (!vehicle) return null;
    const existing = Array.isArray(vehicle.parts)
      ? vehicle.parts.find((x) => String(x.id) === String(partId))
      : null;
    const label = partName || (existing && existing.name) || "Part";
    if (global.BuildPilotInventory) {
      global.BuildPilotInventory.setPartStatus(vehicleId, partId, "Installed", { notes: "Garage session install" });
      vehicle = getVehicle(vehicleId);
    } else if (Array.isArray(vehicle.parts)) {
      const p = vehicle.parts.find((x) => String(x.id) === String(partId));
      if (p) p.status = "Installed";
      persistVehicle(vehicle);
    }
    return mutateActiveSession(vehicleId, (s) => {
      if (s.partsInstalled.some((x) => String(x.partId) === String(partId))) return;
      s.partsInstalled.push({
        partId: String(partId),
        name: label,
        at: new Date().toISOString()
      });
    });
  }

  function quickAddTask(vehicleId, name, category) {
    const vehicle = getVehicle(vehicleId);
    if (!vehicle) return null;
    const nm = String(name || "").trim();
    if (!nm) return null;
    if (!Array.isArray(vehicle.tasks)) vehicle.tasks = [];
    const task = {
      id: newId("task"),
      name: nm,
      description: "",
      category: category || "Engine",
      estHours: "",
      completed: false,
      status: "Pending"
    };
    vehicle.tasks.push(task);
    persistVehicle(vehicle);
    return task;
  }

  function quickAddPart(vehicleId, name, category) {
    const vehicle = getVehicle(vehicleId);
    if (!vehicle) return null;
    const nm = String(name || "").trim();
    if (!nm) return null;
    const raw = {
      id: newId("part"),
      name: nm,
      category: category || "Engine",
      status: "Needed",
      cost: 0,
      quantity: 1
    };
    if (window.BuildPilotInventory) {
      return window.BuildPilotInventory.savePart(vehicleId, raw);
    }
    if (!Array.isArray(vehicle.parts)) vehicle.parts = [];
    vehicle.parts.push(raw);
    persistVehicle(vehicle);
    return raw;
  }

  function generateSessionSummary(session, vehicle) {
    const title = getVehicleDisplayTitle(vehicle);
    const wall = getSessionWallMs(session);
    const timer = getTimerElapsedMs(session);
    const lines = [
      `Garage session — ${title}`,
      `Date: ${formatDateLong(session.startedAt)}`,
      `Started: ${formatTime(session.startedAt)}${session.endedAt ? ` · Ended: ${formatTime(session.endedAt)}` : ""}`,
      `Session length: ${formatDuration(wall)}`,
      `Work timer: ${formatDuration(timer)}`,
      "",
      `Photos: ${session.photos.length}`,
      `Notes: ${session.notes.length}`,
      `Tasks completed: ${session.tasksCompleted.length}`,
      `Parts installed: ${session.partsInstalled.length}`
    ];
    if (session.tasksCompleted.length) {
      lines.push("", "Tasks done:");
      session.tasksCompleted.forEach((t) => lines.push(`• ${t.name}`));
    }
    if (session.partsInstalled.length) {
      lines.push("", "Parts installed:");
      session.partsInstalled.forEach((p) => lines.push(`• ${p.name}`));
    }
    if (session.notes.length) {
      lines.push("", "Notes:");
      session.notes.forEach((n) => lines.push(`• ${n.text}`));
    }
    return lines.join("\n");
  }

  function publishSessionToJournal(vehicleId, session) {
    if (!global.BuildPilotJournal) return null;
    const J = global.BuildPilotJournal;
    const wallMs = getSessionWallMs(session);
    const hours = Math.round((wallMs / 3600000) * 100) / 100;
    const photoUrls = session.photos.map((p) => p.dataUrl).filter(Boolean);
    const noteBody = session.notes.map((n) => n.text).join("\n");
    return J.saveJournalEntry(vehicleId, J.normalizeJournalEntry({
      title: `Garage session — ${formatDateLong(session.startedAt)}`,
      date: session.endedAt || new Date().toISOString(),
      hoursWorked: hours || getTimerElapsedMs(session) / 3600000,
      notes: [session.summary || "", noteBody].filter(Boolean).join("\n\n"),
      photos: photoUrls,
      partsInstalled: session.partsInstalled.map((p) => p.partId),
      linkedTaskIds: session.tasksCompleted.map((t) => t.taskId),
      problemsEncountered: "",
      nextSteps: "",
      timelinePhase: ""
    }, vehicleId));
  }

  function endSession(vehicleId) {
    const vehicle = getVehicle(vehicleId);
    if (!vehicle) return null;
    const session = getActiveSession(vehicle);
    if (!session) return null;
    if (session.timer.running) {
      session.timer.accumulatedMs = getTimerElapsedMs(session);
      session.timer.running = false;
      session.timer.startedAt = null;
    }
    session.endedAt = new Date().toISOString();
    session.summary = generateSessionSummary(session, vehicle);
    saveSessionOnVehicle(vehicle, session);
    vehicle.activeGarageSessionId = "";
    persistVehicle(vehicle);
    publishSessionToJournal(vehicleId, session);
    return session;
  }

  function listOpenTasks(vehicle) {
    const tasks = Array.isArray(vehicle.tasks) ? vehicle.tasks : [];
    return tasks.filter((t) => {
      if (!t) return false;
      if (t.completed === true) return false;
      const s = String(t.status || "").trim().toLowerCase();
      return s !== "complete" && s !== "completed";
    });
  }

  function listInstallableParts(vehicle) {
    const parts = Array.isArray(vehicle.parts) ? vehicle.parts : [];
    return parts.filter((p) => {
      if (!p) return false;
      if (global.BuildPilotInventory) {
        return !global.BuildPilotInventory.isPartInstalled(p);
      }
      return String(p.status || "").toLowerCase() !== "installed";
    });
  }

  function garageModePageUrl(vehicleId) {
    return `garage-mode.html?id=${encodeURIComponent(vehicleId)}`;
  }

  function vehicleDetailPageUrl(vehicleId) {
    if (vehicleId == null || vehicleId === "") return "index.html";
    return `vehicle-detail.html?id=${encodeURIComponent(vehicleId)}`;
  }

  function isProjectVehicle(vehicle) {
    return !!vehicle && (!vehicle.vehicleMode || vehicle.vehicleMode === "project");
  }

  /** Web Speech API helper */
  function createVoiceRecognizer() {
    const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;
    return rec;
  }

  function speechSupported() {
    return !!(global.SpeechRecognition || global.webkitSpeechRecognition);
  }

  const UI = {
    el,

    actionButton(label, icon, variant, onClick, options) {
      const opts = options && typeof options === "object" ? options : {};
      let className = `gm-action gm-action--${variant || "default"}`;
      if (opts.active) className += " is-active";
      const btn = el("button", className, {
        type: "button",
        "aria-label": label,
        "aria-pressed": opts.active ? "true" : "false"
      });
      btn.appendChild(el("span", "gm-action-icon", { text: icon, "aria-hidden": "true" }));
      btn.appendChild(el("span", "gm-action-label", { text: label }));
      btn.addEventListener("click", onClick);
      return btn;
    },

    statChip(label, value) {
      const chip = el("div", "gm-stat-chip");
      chip.appendChild(el("span", "gm-stat-val", { text: String(value) }));
      chip.appendChild(el("span", "gm-stat-lbl", { text: label }));
      return chip;
    },

    renderSessionStats(session) {
      const row = el("div", "gm-stats-row");
      row.appendChild(UI.statChip("Photos", session.photos.length));
      row.appendChild(UI.statChip("Notes", session.notes.length));
      row.appendChild(UI.statChip("Tasks", session.tasksCompleted.length));
      row.appendChild(UI.statChip("Parts", session.partsInstalled.length));
      return row;
    },

    renderFeed(session) {
      const feed = el("div", "gm-feed");
      const items = [];
      session.photos.forEach((p) => items.push({ at: p.at, type: "photo", data: p }));
      session.notes.forEach((n) => items.push({ at: n.at, type: "note", data: n }));
      session.tasksCompleted.forEach((t) => items.push({ at: t.at, type: "task", data: t }));
      session.partsInstalled.forEach((p) => items.push({ at: p.at, type: "part", data: p }));
      items.sort((a, b) => new Date(b.at) - new Date(a.at));
      if (!items.length) {
        feed.appendChild(el("p", "gm-feed-empty", { text: "Session activity appears here." }));
        return feed;
      }
      items.slice(0, 12).forEach((item) => {
        const row = el("div", "gm-feed-item");
        if (item.type === "photo") {
          const img = el("img", "gm-feed-thumb", { src: item.data.dataUrl, alt: "" });
          row.appendChild(img);
          row.appendChild(el("span", "", { text: `Photo · ${formatTime(item.at)}` }));
        } else if (item.type === "note") {
          row.appendChild(el("span", "gm-feed-icon", { text: "📝" }));
          row.appendChild(el("span", "gm-feed-text", { text: item.data.text }));
        } else if (item.type === "task") {
          row.appendChild(el("span", "gm-feed-icon", { text: "✓" }));
          row.appendChild(el("span", "gm-feed-text", { text: `Done: ${item.data.name}` }));
        } else {
          row.appendChild(el("span", "gm-feed-icon", { text: "⚙" }));
          row.appendChild(el("span", "gm-feed-text", { text: `Installed: ${item.data.name}` }));
        }
        feed.appendChild(row);
      });
      return feed;
    }
  };

  global.BuildPilotGarageMode = {
    LS_VEHICLES_KEY,
    getVehicle,
    persistVehicle,
    getVehicleDisplayTitle,
    garageModePageUrl,
    vehicleDetailPageUrl,
    isProjectVehicle,
    normalizeSession,
    startSession,
    getActiveSession,
    endSession,
    addSessionPhoto,
    addSessionNote,
    recordTaskCompleted,
    recordPartInstalled,
    quickAddTask,
    quickAddPart,
    toggleTimer,
    getTimerElapsedMs,
    getSessionWallMs,
    generateSessionSummary,
    listOpenTasks,
    listInstallableParts,
    formatDuration,
    formatTime,
    compressImageFile,
    createVoiceRecognizer,
    speechSupported,
    ensureGarageSessionsOnVehicle,
    UI
  };
})(typeof window !== "undefined" ? window : globalThis);

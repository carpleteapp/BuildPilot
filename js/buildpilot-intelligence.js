/**
 * BuildPilot Build Progress Intelligence
 * @namespace BuildPilotIntelligence
 */
(function (global) {
  "use strict";

  const LS_CONFIG_KEY = "buildpilot_intelligence_config";
  const LS_VEHICLES_KEY = "buildpilot_vehicles";
  const LEGACY_LS_VEHICLES_KEY = "vehicles";

  const DEFAULT_CONFIG = {
    inactiveDays: 14,
    stalledDays: 21,
    deadlineWarningDays: 7,
    budgetOverrunPercent: 110,
    defaultLaborRate: 75,
    garageHoursPerDay: 2,
    alerts: {
      inactive: true,
      partsNotInstalled: true,
      blockedTasks: true,
      buildStalled: true,
      budgetOverrun: true,
      upcomingDeadline: true,
      missingTasks: true,
      uninstalledParts: true
    },
    widgets: {
      completion: true,
      predictedCost: true,
      remainingLabor: true,
      alerts: true
    }
  };

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

  function loadConfig() {
    if (global.BuildPilotConfigPanel && global.BuildPilotConfigPanel.loadConfig) {
      return global.BuildPilotConfigPanel.loadConfig();
    }
    try {
      const raw = localStorage.getItem(LS_CONFIG_KEY);
      if (!raw) return deepClone(DEFAULT_CONFIG);
      const parsed = JSON.parse(raw);
      return mergeConfig(DEFAULT_CONFIG, parsed);
    } catch (_e) {
      return deepClone(DEFAULT_CONFIG);
    }
  }

  function saveConfig(config) {
    if (global.BuildPilotConfigPanel && global.BuildPilotConfigPanel.saveConfig) {
      global.BuildPilotConfigPanel.saveConfig(config);
      return;
    }
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(mergeConfig(DEFAULT_CONFIG, config)));
  }

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function mergeConfig(base, patch) {
    const out = deepClone(base);
    if (!patch || typeof patch !== "object") return out;
    if (patch.inactiveDays != null) out.inactiveDays = Math.max(1, parseInt(patch.inactiveDays, 10) || base.inactiveDays);
    if (patch.stalledDays != null) out.stalledDays = Math.max(1, parseInt(patch.stalledDays, 10) || base.stalledDays);
    if (patch.deadlineWarningDays != null) out.deadlineWarningDays = Math.max(1, parseInt(patch.deadlineWarningDays, 10) || base.deadlineWarningDays);
    if (patch.budgetOverrunPercent != null) out.budgetOverrunPercent = Math.max(100, parseInt(patch.budgetOverrunPercent, 10) || 110);
    if (patch.defaultLaborRate != null) out.defaultLaborRate = Math.max(0, parseFloat(patch.defaultLaborRate) || 0);
    if (patch.garageHoursPerDay != null) out.garageHoursPerDay = Math.max(0.5, parseFloat(patch.garageHoursPerDay) || 2);
    if (patch.alerts) Object.assign(out.alerts, patch.alerts);
    if (patch.widgets) Object.assign(out.widgets, patch.widgets);
    return out;
  }

  function parseCost(v) {
    const n = parseFloat(String(v == null ? "" : v).replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function isProjectVehicle(v) {
    return !v || !v.vehicleMode || v.vehicleMode === "project";
  }

  function partStatus(part) {
    if (global.BuildPilotInventory) return global.BuildPilotInventory.normalizePartStatus(part && part.status);
    const s = String(part && part.status || "").trim();
    if (s === "Delivered") return "Received";
    if (s === "Planned" || s === "Removed") return "Needed";
    if (s === "Shipped") return "Ordered";
    return s || "Needed";
  }

  function isPartInstalled(part) {
    if (global.BuildPilotInventory) return global.BuildPilotInventory.isPartInstalled(part);
    return partStatus(part) === "Installed";
  }

  function isPartCommitted(part) {
    if (global.BuildPilotInventory) return global.BuildPilotInventory.isPartBudgetCommitted(part);
    const s = partStatus(part);
    return s !== "Needed";
  }

  function getPartPrice(part) {
    if (global.BuildPilotInventory) return global.BuildPilotInventory.getPartPrice(part);
    return parseCost(part && (part.price != null ? part.price : part.cost));
  }

  function isTaskComplete(task) {
    if (!task) return false;
    if (task.completed === true) return true;
    const s = String(task.status || "").trim().toLowerCase();
    return s === "complete" || s === "completed";
  }

  function isLaborComplete(entry) {
    if (!entry) return false;
    if (entry.complete === true || entry.completed === true) return true;
    const s = String(entry.status || "").trim().toLowerCase();
    return s === "complete" || s === "completed";
  }

  function daysSince(iso) {
    if (!iso) return Infinity;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return Infinity;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  function formatMoney(n) {
    return "$" + parseCost(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatShortDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function computeBudget(parts, tasks, labor, vehicle) {
    const purchase = parseCost(vehicle && vehicle.vehiclePurchasePrice);
    let partsTotal = 0;
    let partsRemaining = 0;
    parts.forEach((p) => {
      const price = getPartPrice(p);
      if (isPartCommitted(p)) partsTotal += price;
      if (!isPartInstalled(p)) partsRemaining += price;
    });
    const outsideWork = labor.reduce((s, l) => s + parseCost(l.cost), 0);
    const laborLogged = labor.reduce((s, l) => (isLaborComplete(l) ? s + parseCost(l.cost) : s), 0);
    const laborRemaining = labor.reduce((s, l) => (isLaborComplete(l) ? s : s + parseCost(l.cost)), 0);
    const spent = purchase + partsTotal + laborLogged;
    const estimatedRemaining = partsRemaining + laborRemaining;
    const predictedFinal = spent + estimatedRemaining;
    const target =
      parseCost(vehicle && vehicle.intelligenceBudgetTarget) ||
      (purchase > 0 ? purchase * 1.25 : 0);
    return { purchase, partsTotal, laborLogged, outsideWork, spent, estimatedRemaining, predictedFinal, target };
  }

  function computeCompletion(parts, tasks, labor) {
    const completedTasks = tasks.filter(isTaskComplete).length;
    const installedParts = parts.filter(isPartInstalled).length;
    const completedLabor = labor.filter(isLaborComplete).length;
    const total = tasks.length + parts.length + labor.length;
    const done = completedTasks + installedParts + completedLabor;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { pct, completedTasks, installedParts, completedLabor, total, done, remainingTasks: tasks.length - completedTasks };
  }

  function openTaskHours(tasks) {
    return tasks
      .filter((t) => !isTaskComplete(t))
      .reduce((s, t) => {
        const h = parseFloat(t.estHours || 0);
        return s + (Number.isFinite(h) ? h : 0);
      }, 0);
  }

  function findLinkedPart(task, parts) {
    if (!task || task.linkedPartId == null) return null;
    return parts.find((p) => p && String(p.id) === String(task.linkedPartId)) || null;
  }

  function isTaskBlocked(task, parts) {
    if (!task || isTaskComplete(task)) return false;
    const linked = findLinkedPart(task, parts);
    if (linked) {
      const st = partStatus(linked);
      if (st !== "Installed" && st !== "Received") return true;
      if (st === "Received") {
        const hasInstallTask = tasks.some(
          (t) => !isTaskComplete(t) && String(t.linkedPartId) === String(linked.id)
        );
        return !hasInstallTask;
      }
    }
    const deps = String(task.dependencies || "").trim().toLowerCase();
    if (deps && (deps.includes("waiting") || deps.includes("blocked") || deps.includes("parts"))) return true;
    return false;
  }

  function partNeedsInstallTask(part, tasks) {
    const st = partStatus(part);
    if (st !== "Received" && st !== "Ordered") return false;
    if (isPartInstalled(part)) return false;
    const linked = tasks.some(
      (t) => !isTaskComplete(t) && t.linkedPartId != null && String(t.linkedPartId) === String(part.id)
    );
    return !linked;
  }

  /**
   * @param {object} vehicle
   * @param {object[]} parts
   * @param {object[]} tasks
   * @param {object[]} labor
   * @param {object} [config]
   */
  function analyzeBuild(vehicle, parts, tasks, labor, config) {
    config = config || loadConfig();
    const completion = computeCompletion(parts, tasks, labor);
    const budget = computeBudget(parts, tasks, labor, vehicle);
    const hoursOpen = openTaskHours(tasks);
    const laborRate = parseCost(vehicle && vehicle.intelligenceLaborRate) || config.defaultLaborRate;
    const remainingLaborCost = hoursOpen * laborRate;
    const days = daysSince(vehicle && vehicle.lastUpdatedAt);
    const vehicleStatus = String(vehicle && vehicle.status || "active").toLowerCase();
    const isActiveBuild = vehicleStatus === "active";

    const partsDeliveredNotInstalled = parts.filter((p) => {
      const st = partStatus(p);
      return st === "Received" && !isPartInstalled(p);
    });
    const partsPurchasedNotInstalled = parts.filter((p) => isPartCommitted(p) && !isPartInstalled(p));
    const blockedTasks = tasks.filter((t) => isTaskBlocked(t, parts));
    const missingInstallTasks = parts.filter((p) => partNeedsInstallTask(p, tasks));
    const openTasks = tasks.filter((t) => !isTaskComplete(t));

    const upcomingDeadlines = tasks
      .filter((t) => {
        if (isTaskComplete(t) || !t.dueDate) return false;
        const due = new Date(t.dueDate);
        if (isNaN(due.getTime())) return false;
        const ms = due.getTime() - Date.now();
        const d = ms / 86400000;
        return d >= 0 && d <= config.deadlineWarningDays;
      })
      .map((t) => ({ task: t, dueDate: t.dueDate }));

    const alerts = [];
    function push(id, severity, title, detail) {
      alerts.push({ id, severity, title, detail });
    }

    if (config.alerts.inactive && isActiveBuild && completion.pct < 100 && days >= config.inactiveDays) {
      push("inactive", "watch", "No recent updates", `Last activity ${days} day${days === 1 ? "" : "s"} ago (threshold: ${config.inactiveDays}d).`);
    }
    if (config.alerts.buildStalled && isActiveBuild && completion.pct < 95 && days >= config.stalledDays && openTasks.length > 0) {
      push("stalled", "watch", "Build may be stalled", `${openTasks.length} open task(s); no updates in ${days} days.`);
    }
    if (config.alerts.partsNotInstalled && partsDeliveredNotInstalled.length > 0) {
      const names = partsDeliveredNotInstalled.slice(0, 2).map((p) => p.name || "Part").join(", ");
      const more = partsDeliveredNotInstalled.length > 2 ? ` +${partsDeliveredNotInstalled.length - 2} more` : "";
      push("parts-delivered", "info", "Parts ready to install", `${names}${more} — delivered but not installed.`);
    }
    if (config.alerts.uninstalledParts && partsPurchasedNotInstalled.length > 0 && partsDeliveredNotInstalled.length === 0) {
      push("parts-pending", "info", "Uninstalled parts on hand", `${partsPurchasedNotInstalled.length} purchased part(s) not yet installed.`);
    }
    if (config.alerts.blockedTasks && blockedTasks.length > 0) {
      push("blocked", "watch", "Blocked tasks", `${blockedTasks.length} task(s) waiting on parts or dependencies.`);
    }
    if (config.alerts.missingTasks && missingInstallTasks.length > 0) {
      push("missing-tasks", "info", "Missing install tasks", `${missingInstallTasks.length} part(s) may need an install task.`);
    }
    if (config.alerts.upcomingDeadline && upcomingDeadlines.length > 0) {
      const first = upcomingDeadlines[0];
      push("deadline", "info", "Upcoming deadline", `${first.task.name || "Task"} due ${formatShortDate(first.dueDate)}${upcomingDeadlines.length > 1 ? ` (+${upcomingDeadlines.length - 1})` : ""}.`);
    }
    if (config.alerts.budgetOverrun && budget.target > 0) {
      const limit = budget.target * (config.budgetOverrunPercent / 100);
      if (budget.predictedFinal > limit) {
        push("budget", "watch", "Budget watch", `Predicted ${formatMoney(budget.predictedFinal)} exceeds target ${formatMoney(limit)}.`);
      }
    }

    let finishLabel = "—";
    if (completion.pct >= 100 || openTasks.length === 0) {
      finishLabel = "Complete";
    } else if (hoursOpen > 0) {
      const finishDays = Math.max(1, Math.ceil(hoursOpen / config.garageHoursPerDay));
      const target = new Date();
      target.setDate(target.getDate() + finishDays);
      finishLabel = `~${finishDays}d (${formatShortDate(target.toISOString())})`;
    } else {
      finishLabel = `${openTasks.length} task(s) open`;
    }

    const health =
      alerts.some((a) => a.severity === "watch") ? "watch" : alerts.length ? "info" : "good";

    return {
      vehicleId: vehicle && vehicle.id,
      vehicleName: vehicle && (vehicle.name || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")),
      completion,
      budget,
      hoursOpen,
      laborRate,
      remainingLaborCost,
      daysSinceUpdate: days,
      finishLabel,
      alerts,
      health,
      counts: {
        partsDeliveredNotInstalled: partsDeliveredNotInstalled.length,
        partsPurchasedNotInstalled: partsPurchasedNotInstalled.length,
        blockedTasks: blockedTasks.length,
        missingInstallTasks: missingInstallTasks.length,
        upcomingDeadlines: upcomingDeadlines.length,
        openTasks: openTasks.length
      }
    };
  }

  function analyzeGarageProjectVehicles(vehicles, config) {
    config = config || loadConfig();
    const project = (vehicles || []).filter(isProjectVehicle).filter((v) => normalizeVehicleStatus(v) === "active");
    const analyses = project.map((v) => {
      const parts = Array.isArray(v.parts) ? v.parts : [];
      const tasks = Array.isArray(v.tasks) ? v.tasks : [];
      const labor = Array.isArray(v.labor) ? v.labor : [];
      return analyzeBuild(v, parts, tasks, labor, config);
    });
    const allAlerts = analyses.flatMap((a) =>
      a.alerts.map((al) => ({ ...al, vehicleId: a.vehicleId, vehicleName: a.vehicleName }))
    );
    return {
      analyses,
      alertCount: allAlerts.length,
      watchCount: allAlerts.filter((a) => a.severity === "watch").length,
      inactiveBuilds: analyses.filter((a) => a.daysSinceUpdate >= config.inactiveDays && a.completion.pct < 100).length,
      vehiclesNeedingAttention: analyses.filter((a) => a.alerts.length > 0).length
    };
  }

  function normalizeVehicleStatus(vehicle) {
    const s = String(vehicle && vehicle.status || "active").toLowerCase();
    if (s === "sold") return "completed";
    if (s === "completed") return "completed";
    return "active";
  }

  function loadProjectVehicles() {
    try {
      let raw = localStorage.getItem(LS_VEHICLES_KEY);
      if (raw == null || raw === "") {
        const legacy = localStorage.getItem(LEGACY_LS_VEHICLES_KEY);
        if (legacy) {
          raw = legacy;
          localStorage.setItem(LS_VEHICLES_KEY, legacy);
        }
      }
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(isProjectVehicle) : [];
    } catch (_e) {
      return [];
    }
  }

  function appendPanelHeadActions(summary, options) {
    const onConfigure = options && options.onConfigure;
    const onInfo = options && options.onInfo;
    if (!onConfigure && !onInfo) return;
    const actions = el("div", "bi-panel-actions");
    if (onInfo) {
      const infoBtn = el("button", "bi-panel-icon-btn bi-info-btn", {
        type: "button",
        "aria-label": "User guide",
        text: "i"
      });
      infoBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        onInfo();
      });
      actions.appendChild(infoBtn);
    }
    if (onConfigure) {
      const cfgBtn = el("button", "bi-panel-icon-btn bi-config-btn", {
        type: "button",
        "aria-label": "Settings",
        text: "⚙"
      });
      cfgBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        onConfigure();
      });
      actions.appendChild(cfgBtn);
    }
    summary.appendChild(actions);
  }

  const UI = {
    el,

    renderMetricsRow(analysis, config) {
      const row = el("div", "bi-metrics");
      if (config.widgets.completion) {
        row.appendChild(metric("Completion", `${analysis.completion.pct}%`));
      }
      if (config.widgets.predictedCost) {
        row.appendChild(metric("Predicted total", formatMoney(analysis.budget.predictedFinal)));
      }
      if (config.widgets.remainingLabor) {
        const hrs = analysis.hoursOpen > 0 ? `${analysis.hoursOpen.toFixed(1)}h` : "0h";
        const cost =
          analysis.remainingLaborCost > 0 ? ` · ${formatMoney(analysis.remainingLaborCost)}` : "";
        row.appendChild(metric("Labor remaining", hrs + cost));
      }
      row.appendChild(metric("Est. finish", analysis.finishLabel));
      return row;

      function metric(lbl, val) {
        const box = el("div", "bi-metric");
        box.appendChild(el("span", "bi-metric-val", { text: val }));
        box.appendChild(el("span", "bi-metric-lbl", { text: lbl }));
        return box;
      }
    },

    renderAlertsList(alerts, maxVisible) {
      const wrap = el("div", "bi-alerts", { role: "list" });
      if (!alerts.length) {
        wrap.appendChild(el("p", "bi-alerts-clear", { text: "No alerts — build looks on track." }));
        return wrap;
      }
      const show = alerts.slice(0, maxVisible == null ? 4 : maxVisible);
      show.forEach((a) => {
        const item = el("div", `bi-alert bi-alert--${a.severity}`, { role: "listitem" });
        item.appendChild(el("span", "bi-alert-title", { text: a.title }));
        if (a.detail) item.appendChild(el("span", "bi-alert-detail", { text: a.detail }));
        wrap.appendChild(item);
      });
      if (alerts.length > show.length) {
        wrap.appendChild(el("p", "bi-alerts-more", { text: `+${alerts.length - show.length} more insight(s)` }));
      }
      return wrap;
    },

    renderVehiclePanel(container, analysis, options) {
      if (!container) return;
      const config = (options && options.config) || loadConfig();
      const onConfigure = options && options.onConfigure;
      container.innerHTML = "";

      const details = el("details", "bi-panel-details bi-panel");
      const summary = el("summary", "bi-panel-head");
      summary.appendChild(el("h3", "bi-panel-title", { text: "Build Insights" }));
      const health = el("span", `bi-health bi-health--${analysis.health}`, {
        text: analysis.health === "good" ? "On track" : analysis.health === "watch" ? "Needs attention" : "Insights"
      });
      summary.appendChild(health);
      appendPanelHeadActions(summary, options);
      details.appendChild(summary);

      const body = el("div", "bi-panel-body");
      if (config.widgets.completion || config.widgets.predictedCost || config.widgets.remainingLabor) {
        body.appendChild(UI.renderMetricsRow(analysis, config));
      }
      if (config.widgets.alerts) {
        body.appendChild(UI.renderAlertsList(analysis.alerts, options && options.maxAlerts));
      }
      details.appendChild(body);
      container.appendChild(details);
    },

    renderGarageInsightsContent(container, garageSummary) {
      if (!container) return;
      container.innerHTML = "";

      const wrap = el("div", "bi-garage-embedded");
      wrap.appendChild(el("p", "project-stats-insights-label", { text: "Garage Insights" }));

      if (!garageSummary.analyses || !garageSummary.analyses.length) {
        wrap.appendChild(el("p", "bi-alerts-clear", { text: "No build data yet." }));
        container.appendChild(wrap);
        return;
      }

      const stats = el("div", "bi-metrics");
      stats.appendChild(gStat(String(garageSummary.vehiclesNeedingAttention), "Builds flagged"));
      stats.appendChild(gStat(String(garageSummary.inactiveBuilds), "Inactive"));
      stats.appendChild(gStat(String(garageSummary.watchCount), "Watch items"));
      stats.appendChild(gStat(String(garageSummary.alertCount), "Total insights"));
      wrap.appendChild(stats);

      const top = garageSummary.analyses
        .filter((a) => a.alerts.length > 0)
        .sort((a, b) => b.alerts.length - a.alerts.length)
        .slice(0, 3);
      top.forEach((a) => {
        const row = el("a", "bi-garage-row", {
          href: `vehicle-detail.html?id=${encodeURIComponent(a.vehicleId)}`
        });
        row.appendChild(el("span", "bi-garage-row-name", { text: a.vehicleName || "Build" }));
        row.appendChild(el("span", "bi-garage-row-meta", {
          text: `${a.completion.pct}% · ${a.alerts.length} insight${a.alerts.length === 1 ? "" : "s"}`
        }));
        wrap.appendChild(row);
      });
      container.appendChild(wrap);

      function gStat(val, lbl) {
        const box = el("div", "bi-metric");
        box.appendChild(el("span", "bi-metric-val", { text: val }));
        box.appendChild(el("span", "bi-metric-lbl", { text: lbl }));
        return box;
      }
    },

    renderGaragePanel(container, garageSummary, options) {
      if (!container) return;
      container.innerHTML = "";

      const details = el("details", "bi-panel-details bi-panel bi-panel--garage");
      const summary = el("summary", "bi-panel-head");
      summary.appendChild(el("h3", "bi-panel-title", { text: "Garage Insights" }));
      appendPanelHeadActions(summary, options);
      details.appendChild(summary);

      const bodyMount = el("div", "bi-panel-body");
      details.appendChild(bodyMount);
      container.appendChild(details);
      UI.renderGarageInsightsContent(bodyMount, garageSummary);
    },

    renderConfigPanel(target, config, onSave, options) {
      if (global.BuildPilotConfigPanel && global.BuildPilotConfigPanel.renderConfigPanel) {
        return global.BuildPilotConfigPanel.renderConfigPanel(target, config, onSave, options);
      }
      return null;
    },

    openConfigSheet(overlay, config, onSave) {
      UI.renderConfigPanel(overlay, config, onSave, { page: false });
    }
  };

  global.BuildPilotIntelligence = {
    DEFAULT_CONFIG,
    loadConfig,
    saveConfig,
    analyzeBuild,
    analyzeGarageProjectVehicles,
    loadProjectVehicles,
    formatMoney,
    UI
  };
})(typeof window !== "undefined" ? window : globalThis);

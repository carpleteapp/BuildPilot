/**
 * BuildPilot insight settings — shared config load/save and settings UI.
 * Used by settings.html and buildpilot-intelligence.js (modal).
 */
(function (global) {
  "use strict";

  const LS_CONFIG_KEY = "buildpilot_intelligence_config";

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
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v == null) return;
        if (k === "text") node.textContent = v;
        else node.setAttribute(k, v);
      });
    }
    const list = children == null ? [] : Array.isArray(children) ? children : [children];
    list.forEach(function (c) {
      if (c == null) return;
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function mergeConfig(base, patch) {
    const out = deepClone(base);
    if (!patch || typeof patch !== "object") return out;
    if (patch.inactiveDays != null) out.inactiveDays = Math.max(1, parseInt(patch.inactiveDays, 10) || base.inactiveDays);
    if (patch.stalledDays != null) out.stalledDays = Math.max(1, parseInt(patch.stalledDays, 10) || base.stalledDays);
    if (patch.deadlineWarningDays != null) {
      out.deadlineWarningDays = Math.max(1, parseInt(patch.deadlineWarningDays, 10) || base.deadlineWarningDays);
    }
    if (patch.budgetOverrunPercent != null) {
      out.budgetOverrunPercent = Math.max(100, parseInt(patch.budgetOverrunPercent, 10) || 110);
    }
    if (patch.defaultLaborRate != null) out.defaultLaborRate = Math.max(0, parseFloat(patch.defaultLaborRate) || 0);
    if (patch.garageHoursPerDay != null) out.garageHoursPerDay = Math.max(0.5, parseFloat(patch.garageHoursPerDay) || 2);
    if (patch.alerts) Object.assign(out.alerts, patch.alerts);
    if (patch.widgets) Object.assign(out.widgets, patch.widgets);
    return out;
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(LS_CONFIG_KEY);
      if (!raw) return deepClone(DEFAULT_CONFIG);
      return mergeConfig(DEFAULT_CONFIG, JSON.parse(raw));
    } catch (_e) {
      return deepClone(DEFAULT_CONFIG);
    }
  }

  function saveConfig(config) {
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(mergeConfig(DEFAULT_CONFIG, config)));
  }

  function labelForAlert(k) {
    const map = {
      inactive: "No recent activity on active builds",
      buildStalled: "Stalled build (open tasks, no progress)",
      partsNotInstalled: "Parts received, not installed",
      uninstalledParts: "Purchased parts not yet installed",
      missingTasks: "Parts missing an install task",
      blockedTasks: "Tasks blocked by parts or dependencies",
      upcomingDeadline: "Task due dates approaching",
      budgetOverrun: "Predicted spend over budget target"
    };
    return map[k] || k;
  }

  function labelForWidget(k) {
    const map = {
      completion: "Show completion percentage",
      predictedCost: "Show predicted total cost",
      remainingLabor: "Show remaining labor estimate",
      alerts: "Show insight alert list"
    };
    return map[k] || k;
  }

  function renderConfigPanel(target, config, onSave, options) {
    options = options || {};
    const page = !!options.page;
    if (!target) return null;
    target.innerHTML = "";

    const modal = el("div", "modal-content bi-config-modal" + (page ? " bi-config-modal--page" : ""));
    modal.appendChild(el("div", "modal-title", { text: options.title || "Insight Settings" }));
    modal.appendChild(el("p", "bi-config-hint", {
      text:
        "Control how BuildPilot flags builds in Project Stats (Garage Insights) and on each project's Build Insights panel. Insights are quiet summaries only — no push notifications."
    }));

    const form = el("div", "bi-config-form");

    form.appendChild(el("p", "bi-config-section-lbl", { text: "Activity thresholds" }));
    form.appendChild(numField(
      "Mark inactive after (days)",
      "inactiveDays",
      config.inactiveDays,
      "Flags active builds with no saved changes for this many days (Garage Insights)."
    ));
    form.appendChild(numField(
      "Stalled build after (days)",
      "stalledDays",
      config.stalledDays,
      "Alerts when open tasks remain but nothing has been updated for this long."
    ));
    form.appendChild(numField(
      "Task deadline warning (days ahead)",
      "deadlineWarningDays",
      config.deadlineWarningDays,
      "Applies to tasks that have a due date set in Build Segments."
    ));
    form.appendChild(numField(
      "Estimated garage hours per day",
      "garageHoursPerDay",
      config.garageHoursPerDay,
      "Used with open task hours to estimate completion timing on Build Insights.",
      "0.5"
    ));

    form.appendChild(el("p", "bi-config-section-lbl", { text: "Budget & labor" }));
    form.appendChild(numField(
      "Budget alert at (% of target)",
      "budgetOverrunPercent",
      config.budgetOverrunPercent,
      "Compares predicted spend to a target (defaults to 125% of purchase price when set)."
    ));
    form.appendChild(numField(
      "Default labor rate ($/hr)",
      "defaultLaborRate",
      config.defaultLaborRate,
      "Multiplies open task estimated hours for remaining labor cost on Build Insights.",
      "1"
    ));

    form.appendChild(el("p", "bi-config-section-lbl", { text: "Insight alerts" }));
    [
      "inactive",
      "buildStalled",
      "partsNotInstalled",
      "uninstalledParts",
      "missingTasks",
      "blockedTasks",
      "upcomingDeadline",
      "budgetOverrun"
    ].forEach(function (key) {
      if (config.alerts[key] == null) return;
      form.appendChild(checkField(labelForAlert(key), key, config.alerts[key]));
    });

    form.appendChild(el("p", "bi-config-section-lbl", { text: "Build Insights panel (project page)" }));
    Object.keys(config.widgets).forEach(function (key) {
      form.appendChild(checkField(labelForWidget(key), key, config.widgets[key], "widget"));
    });

    modal.appendChild(form);

    const row = el("div", page ? "bp-settings-form-actions modal-btn-row" : "modal-btn-row");
    const cancel = el(
      "button",
      page ? "bp-settings-back-btn modal-btn-cancel" : "modal-btn-cancel",
      { type: "button", text: page ? "Back to Dashboard" : "Cancel" }
    );
    if (page && options.backHref) {
      cancel.onclick = function () {
        global.location.href = options.backHref;
      };
    } else {
      cancel.onclick = function () {
        target.classList.remove("active");
      };
    }
    const save = el(
      "button",
      page ? "bp-settings-save-btn modal-btn-primary" : "w-full modal-btn-primary",
      { type: "button", text: "Save" }
    );
    save.onclick = function () {
      const next = loadConfig();
      form.querySelectorAll("[data-cfg-num]").forEach(function (inp) {
        next[inp.dataset.cfgNum] = inp.value;
      });
      form.querySelectorAll("[data-cfg-alert]").forEach(function (inp) {
        next.alerts[inp.dataset.cfgAlert] = inp.checked;
      });
      form.querySelectorAll("[data-cfg-widget]").forEach(function (inp) {
        next.widgets[inp.dataset.cfgWidget] = inp.checked;
      });
      saveConfig(next);
      if (!page) target.classList.remove("active");
      if (onSave) onSave(next);
    };
    row.appendChild(cancel);
    row.appendChild(save);
    modal.appendChild(row);
    target.appendChild(modal);
    if (!page) {
      target.classList.add("active");
      target.onclick = function (e) {
        if (e.target === target) target.classList.remove("active");
      };
    }
    return modal;

    function numField(label, key, val, hint, step) {
      const w = el("div", "bi-config-field");
      w.appendChild(el("label", "bi-config-label", { text: label }));
      const inp = el("input", "form-input", {
        type: "number",
        min: "0",
        step: step || "1",
        "data-cfg-num": key
      });
      inp.value = String(val);
      w.appendChild(inp);
      if (hint) {
        w.appendChild(el("p", "bi-config-field-hint", { text: hint }));
      }
      return w;
    }

    function checkField(label, key, checked, kind) {
      const w = el("label", "bi-config-check");
      const inp = el("input", "", { type: "checkbox" });
      if (kind === "widget") inp.dataset.cfgWidget = key;
      else inp.dataset.cfgAlert = key;
      inp.checked = !!checked;
      w.appendChild(inp);
      w.appendChild(el("span", "bi-config-check-label", { text: label }));
      return w;
    }
  }

  global.BuildPilotConfigPanel = {
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    renderConfigPanel: renderConfigPanel
  };
})(typeof window !== "undefined" ? window : globalThis);

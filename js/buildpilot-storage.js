/**
 * BuildPilot — local user data keys, Tier 1 categories, vehicle schema, beta reset.
 */
(function (root) {
  "use strict";

  const BETA_RESET_VERSION = "beta-2026-05";
  const BETA_RESET_MARKER_KEY = "buildpilot_beta_reset_version";
  const LS_VEHICLES_KEY = "buildpilot_vehicles";
  const LEGACY_LS_VEHICLES_KEY = "vehicles";

  /** ACES/PIES Tier 1 structural systems (canonical spellings). */
  const TIER1_PART_CATEGORIES = [
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

  function isBuildPilotUserDataKey(key) {
    if (!key || key === BETA_RESET_MARKER_KEY) return false;
    if (key === "vehicles" || key === "selectedVehicleId") return true;
    if (key.startsWith("buildpilot_")) return true;
    if (key.startsWith("vehicle_")) return true;
    return false;
  }

  function clearAllBuildPilotUserData() {
    const keys = [];
    for (let i = 0; i < root.localStorage.length; i += 1) {
      const key = root.localStorage.key(i);
      if (isBuildPilotUserDataKey(key)) keys.push(key);
    }
    keys.forEach((key) => root.localStorage.removeItem(key));
    root.localStorage.setItem(BETA_RESET_MARKER_KEY, BETA_RESET_VERSION);
    try {
      root.dispatchEvent(
        new CustomEvent("buildpilot:vehicles-updated", { detail: { source: "beta-reset" } })
      );
    } catch (_e) { /* IE */ }
    return keys.length;
  }

  /** Wipes legacy dev/sample data once per beta reset version (fresh trial install). */
  function ensureBetaCleanStorageForTrial() {
    if (root.localStorage.getItem(BETA_RESET_MARKER_KEY) === BETA_RESET_VERSION) return false;
    clearAllBuildPilotUserData();
    return true;
  }

  function normalizeBuildType(vehicleOrRaw) {
    const raw = typeof vehicleOrRaw === "object"
      ? String(vehicleOrRaw && vehicleOrRaw.buildType || "standard")
      : String(vehicleOrRaw || "standard");
    return raw.toLowerCase() === "custom" ? "custom" : "standard";
  }

  function normalizeCustomSegmentEntry(seg, index) {
    if (seg == null) return null;
    if (typeof seg === "string") {
      const name = seg.trim();
      return name ? { id: `seg${Date.now()}${index}`, name } : null;
    }
    if (typeof seg === "object") {
      const name = String(
        seg.name || seg.title || seg.label || seg.segment || seg.chapter || ""
      ).trim();
      if (!name) return null;
      return {
        id: String(seg.id || `seg${Date.now()}${index}`),
        name
      };
    }
    return null;
  }

  function normalizeCustomSegmentsArray(segments) {
    if (!Array.isArray(segments)) return [];
    const out = [];
    segments.forEach((seg, index) => {
      const normalized = normalizeCustomSegmentEntry(seg, index);
      if (normalized) out.push(normalized);
    });
    return out;
  }

  function collectCustomSegmentsFromVehicle(vehicle) {
    if (!vehicle || typeof vehicle !== "object") return [];
    const sources = [
      vehicle.customSegments,
      vehicle.custom_segments,
      vehicle.customBuilds,
      vehicle.custom_builds,
      vehicle.segments
    ];
    for (let i = 0; i < sources.length; i += 1) {
      const normalized = normalizeCustomSegmentsArray(sources[i]);
      if (normalized.length) return normalized;
    }
    return [];
  }

  function ensureVehicleBuildSchema(vehicle) {
    if (!vehicle || typeof vehicle !== "object") return vehicle;
    vehicle.buildType = normalizeBuildType(vehicle);
    vehicle.customSegments = collectCustomSegmentsFromVehicle(vehicle);
    if (vehicle.customSegments.length && vehicle.buildType !== "custom") {
      vehicle.buildType = "custom";
    }
    delete vehicle.custom_segments;
    delete vehicle.customBuilds;
    delete vehicle.custom_builds;
    if (Array.isArray(vehicle.segments) && vehicle.buildType === "custom") {
      delete vehicle.segments;
    }
    return vehicle;
  }

  function parseVehiclesJson(raw) {
    if (raw == null || raw === "") return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  /** Read vehicles; migrate legacy key when canonical store is missing or empty. */
  function readVehiclesArrayFromLocalStorage() {
    let canonicalRaw = root.localStorage.getItem(LS_VEHICLES_KEY);
    const legacyRaw = root.localStorage.getItem(LEGACY_LS_VEHICLES_KEY);
    let vehicles = parseVehiclesJson(canonicalRaw);
    if (!vehicles.length && legacyRaw) {
      vehicles = parseVehiclesJson(legacyRaw);
      if (vehicles.length) {
        root.localStorage.setItem(LS_VEHICLES_KEY, legacyRaw);
      }
    } else if (!canonicalRaw && legacyRaw) {
      root.localStorage.setItem(LS_VEHICLES_KEY, legacyRaw);
    }
    return vehicles;
  }

  function writeVehiclesArrayToLocalStorage(vehicles) {
    const payload = JSON.stringify(vehicles);
    root.localStorage.setItem(LS_VEHICLES_KEY, payload);
    root.localStorage.setItem(LEGACY_LS_VEHICLES_KEY, payload);
  }

  function populateTier1CategorySelect(selectEl, selectedCategory, options) {
    if (!selectEl) return TIER1_PART_CATEGORIES[0];
    const includeAll = !!(options && options.includeAll);
    const selected = String(selectedCategory == null ? "" : selectedCategory).trim();
    selectEl.innerHTML = "";
    if (includeAll) {
      const allOpt = document.createElement("option");
      allOpt.value = "";
      allOpt.textContent = "All categories";
      selectEl.appendChild(allOpt);
    } else {
      selectEl.required = true;
    }
    TIER1_PART_CATEGORIES.forEach((canonical) => {
      const opt = document.createElement("option");
      opt.value = canonical;
      opt.textContent = canonical;
      selectEl.appendChild(opt);
    });
    if (selected && TIER1_PART_CATEGORIES.includes(selected)) {
      selectEl.value = selected;
    } else if (!includeAll) {
      selectEl.value = TIER1_PART_CATEGORIES[0];
    }
    return selectEl.value;
  }

  root.BuildPilotStorage = {
    BETA_RESET_VERSION,
    BETA_RESET_MARKER_KEY,
    LS_VEHICLES_KEY,
    LEGACY_LS_VEHICLES_KEY,
    TIER1_PART_CATEGORIES,
    isBuildPilotUserDataKey,
    clearAllBuildPilotUserData,
    ensureBetaCleanStorageForTrial,
    normalizeBuildType,
    normalizeCustomSegmentEntry,
    normalizeCustomSegmentsArray,
    collectCustomSegmentsFromVehicle,
    ensureVehicleBuildSchema,
    readVehiclesArrayFromLocalStorage,
    writeVehiclesArrayToLocalStorage,
    populateTier1CategorySelect
  };
})(typeof window !== "undefined" ? window : globalThis);

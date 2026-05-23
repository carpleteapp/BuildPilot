/**
 * Settings page bootstrap (settings.html).
 */
(function () {
  "use strict";

  function showLoadError(mount) {
    if (!mount) return;
    mount.innerHTML =
      "<p class=\"bp-settings-error\">Settings could not load. Return to the dashboard and try again.</p>";
  }

  function init() {
    const mount = document.getElementById("settings-mount");
    const statusEl = document.getElementById("settings-save-status");
    const panel = window.BuildPilotConfigPanel;

    if (!mount || !panel || typeof panel.renderConfigPanel !== "function") {
      showLoadError(mount);
      return;
    }

    try {
      if (window.BuildPilotStorage && window.BuildPilotStorage.ensureBetaCleanStorageForTrial) {
        window.BuildPilotStorage.ensureBetaCleanStorageForTrial();
      }
    } catch (_e) { /* ignore */ }

    try {
      panel.renderConfigPanel(
        mount,
        panel.loadConfig(),
        function () {
          if (statusEl) {
            statusEl.hidden = false;
            statusEl.textContent = "Settings saved.";
          }
          try {
            window.dispatchEvent(
              new CustomEvent("buildpilot:vehicles-updated", { detail: { source: "settings" } })
            );
          } catch (_e2) { /* ignore */ }
        },
        {
          page: true,
          backHref: "index.html",
          title: "Build insights"
        }
      );
    } catch (err) {
      console.error("BuildPilot settings init failed:", err);
      showLoadError(mount);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

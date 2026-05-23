/**
 * BuildPilot — shared Excel template metadata & styling helpers.
 */
(function (root) {
  "use strict";

  const TEMPLATE = {
    HEADER_ROW: 7,
    FIRST_ROW: 8,
    LAST_ROW: 102,
    get ITEM_ROWS() {
      return this.LAST_ROW - this.FIRST_ROW + 1;
    }
  };

  /** Matches index.html app-header-logo (2.125rem) and BuildPilot_Logo_blue2.png aspect */
  const BRAND = {
    LOGO_ASPECT: 883 / 475,
    LOGO_DISPLAY_HEIGHT_PX: 34,
    /** ~1.25rem app header title */
    TITLE_FONT_SIZE: 15,
    TITLE: "BuildPilot",
    SHEET_TAG: "Build Manifest",
    /** ~0.6rem gap between logo and title (Excel indent units) */
    LOGO_TITLE_GAP_INDENT: 2
  };

  function brandLogoExcelWidth() {
    return Math.round(BRAND.LOGO_DISPLAY_HEIGHT_PX * BRAND.LOGO_ASPECT);
  }

  function resolveBuildPilotLogoBase64(logoBase64) {
    if (logoBase64) return logoBase64;
    const embedded = root.BUILDPILOT_LOGO_DATA_URL;
    if (typeof embedded !== "string" || !embedded.startsWith("data:image/")) return "";
    const match = embedded.match(/^data:image\/\w+;base64,(.+)$/);
    return match ? match[1] : embedded.replace(/^data:image\/\w+;base64,/, "");
  }

  function normalizeVehicleStatus(vehicle) {
    if (!vehicle) return "active";
    const raw = vehicle.status != null ? vehicle.status : vehicle;
    const s = String(raw).trim().toLowerCase();
    if (s === "completed" || s === "complete" || s === "archived") return "completed";
    return "active";
  }

  function isCustomBuildVehicle(vehicle) {
    if (!vehicle) return false;
    if (root.BuildPilotStorage && root.BuildPilotStorage.normalizeBuildType) {
      return root.BuildPilotStorage.normalizeBuildType(vehicle) === "custom";
    }
    const raw = String(vehicle.buildType || "standard").toLowerCase();
    return raw === "custom";
  }

  function buildOrganizationLabel(vehicle) {
    return isCustomBuildVehicle(vehicle) ? "Custom segments" : "Standard systems";
  }

  function projectStatusLabel(vehicle) {
    return normalizeVehicleStatus(vehicle) === "completed" ? "Completed" : "Active";
  }

  function computeProgressPct(parts, tasks, labor) {
    const Inv = root.BuildPilotInventory;
    const completedTasks = (tasks || []).filter((t) => {
      const s = String(t && t.status || "").trim();
      return t && (t.completed === true || /^(complete|completed)$/i.test(s));
    }).length;
    const installedParts = (parts || []).filter((p) => {
      if (Inv && Inv.isPartInstalled) return Inv.isPartInstalled(p);
      return String(p && p.status || "").toLowerCase() === "installed";
    }).length;
    const completedLabor = (labor || []).filter((l) => {
      return l && (l.complete === true || l.completed === true);
    }).length;
    const total = (parts || []).length + (tasks || []).length + (labor || []).length;
    const done = completedTasks + installedParts + completedLabor;
    return total === 0 ? 0 : Math.round((done / total) * 100);
  }

  function sumCompletedTaskHours(tasks) {
    let total = 0;
    (tasks || []).forEach((t) => {
      const s = String(t && t.status || "").trim();
      const done = t && (t.completed === true || /^(complete|completed)$/i.test(s));
      if (!done) return;
      const hrs = parseFloat(t.estHours || t.hours || 0);
      if (Number.isFinite(hrs) && hrs > 0) total += hrs;
    });
    if (total === 0) return "0 hrs";
    if (total === 1) return "1 hr";
    return total % 1 === 0 ? `${total} hrs` : `${total.toFixed(1)} hrs`;
  }

  function inventorySummary(parts, tasks, labor) {
    const p = (parts || []).length;
    const t = (tasks || []).length;
    const l = (labor || []).length;
    return `${p} parts · ${t} tasks · ${l} labor`;
  }

  /**
   * @param {object} vehicle
   * @param {object} ctx
   * @param {Array} ctx.parts
   * @param {Array} ctx.tasks
   * @param {Array} ctx.labor
   * @param {number} ctx.totalInv
   * @param {number} ctx.purchase
   * @param {function} ctx.formatUsd
   * @param {function} ctx.getRegistrationLine
   * @param {function} [ctx.getEstimatedFinishLine]
   */
  function buildVehicleManifestMetaLines(vehicle, ctx) {
    const v = vehicle || {};
    const formatUsd = ctx.formatUsd || ((n) => `$${Number(n || 0).toFixed(2)}`);
    const yearMakeModel = [v.year, v.make, v.model].filter(Boolean).join(" ").trim() || v.name || "Vehicle";
    const vin = String(v.vin || "").trim();
    const projectName = String(v.name || "").trim();
    const pct = computeProgressPct(ctx.parts, ctx.tasks, ctx.labor);
    const status = projectStatusLabel(v);
    const buildOrg = buildOrganizationLabel(v);
    const hours = sumCompletedTaskHours(ctx.tasks);
    const purchase = Number(ctx.purchase) || 0;
    const totalInv = Number(ctx.totalInv) || 0;
    const regLine = typeof ctx.getRegistrationLine === "function"
      ? ctx.getRegistrationLine(v)
      : "Registration: Not set";
    const estFinish = typeof ctx.getEstimatedFinishLine === "function"
      ? ctx.getEstimatedFinishLine(v)
      : "";

    const line2 = `Vehicle: ${yearMakeModel}`;
    const vinBit = vin ? `VIN: ${vin}` : "";
    const nameBit = projectName && projectName !== yearMakeModel ? `Project: ${projectName}` : "";
    const line3Parts = [vinBit, nameBit, `Status: ${status}`, `Progress: ${pct}%`].filter(Boolean);
    const line3 = line3Parts.join(" | ");
    const line4 = [
      `Total Investment: ${formatUsd(totalInv)}`,
      `Purchase: ${formatUsd(purchase)}`,
      `Completed Hours: ${hours}`,
      `Organization: ${buildOrg}`
    ].join(" | ");
    const line5Parts = [regLine, estFinish, inventorySummary(ctx.parts, ctx.tasks, ctx.labor)].filter(Boolean);
    const line5 = line5Parts.join(" | ");

    return { line2, line3, line4, line5, yearMakeModel, progressPct: pct };
  }

  function brandTitleFont() {
    return {
      name: "Calibri",
      bold: true,
      size: BRAND.TITLE_FONT_SIZE,
      color: { argb: "FF111111" }
    };
  }

  function brandTagFont() {
    return {
      name: "Calibri",
      bold: true,
      size: 9,
      color: { argb: "FF6E7888" }
    };
  }

  /**
   * Row 1 brand band — white background; column A = logo + "BuildPilot" (index .app-header-brand).
   */
  function applyManifestBrandHeaderRow(worksheet, workbook, logoBase64) {
    const embeddedBase64 = resolveBuildPilotLogoBase64(logoBase64);
    const logoH = BRAND.LOGO_DISPLAY_HEIGHT_PX;
    const logoW = brandLogoExcelWidth();
    const rowH = embeddedBase64 ? Math.max(48, logoH + 14) : 44;
    const whiteFill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFFFF" }
    };
    const headerBorder = {
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } }
    };

    worksheet.getRow(1).height = rowH;

    function paintRow1Cells() {
      for (let c = 1; c <= 9; c += 1) {
        const cell = worksheet.getRow(1).getCell(c);
        cell.fill = whiteFill;
        cell.border = headerBorder;
      }
    }

    function applyBrandTagColumn() {
      worksheet.mergeCells("B1:I1");
      const tagCell = worksheet.getCell("B1");
      tagCell.value = BRAND.SHEET_TAG;
      tagCell.font = brandTagFont();
      tagCell.fill = whiteFill;
      tagCell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
      tagCell.border = headerBorder;
    }

    if (embeddedBase64 && workbook) {
      paintRow1Cells();
      // Column A: logo (floating left) + title indented beside it — like app-header-brand
      const titleIndent = Math.ceil(logoW / 7) + BRAND.LOGO_TITLE_GAP_INDENT;
      const colAWidth = Math.max(16, titleIndent + BRAND.TITLE.length + 3);
      worksheet.getColumn(1).width = colAWidth;

      const brandCell = worksheet.getCell("A1");
      brandCell.value = BRAND.TITLE;
      brandCell.font = brandTitleFont();
      brandCell.fill = whiteFill;
      brandCell.alignment = {
        vertical: "middle",
        horizontal: "left",
        indent: titleIndent,
        shrinkToFit: false
      };
      brandCell.border = headerBorder;

      applyBrandTagColumn();

      const imageId = workbook.addImage({ base64: embeddedBase64, extension: "png" });
      worksheet.addImage(imageId, {
        tl: { col: 0.06, row: 0.14 },
        ext: { width: logoW, height: logoH }
      });
      return;
    }

    paintRow1Cells();
    worksheet.getColumn(1).width = BRAND.TITLE.length + 4;
    const brandCell = worksheet.getCell("A1");
    brandCell.value = BRAND.TITLE;
    brandCell.font = brandTitleFont();
    brandCell.fill = whiteFill;
    brandCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    brandCell.border = headerBorder;
    applyBrandTagColumn();
  }

  function applyProfessionalTemplateHeaderStyle(worksheet, headerRowNum) {
    const headerRow = worksheet.getRow(headerRowNum);
    headerRow.height = 24;
    headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum < 1 || colNum > 9) return;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Calibri" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D0D11" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        bottom: { style: "medium", color: { argb: "FF2A2A36" } }
      };
    });
  }

  function applyProfessionalTemplateGridStyle(worksheet, firstRow, lastRow) {
    const thinEdge = { style: "thin", color: { argb: "FFD4D4D8" } };
    const gridBorder = { top: thinEdge, left: thinEdge, bottom: thinEdge, right: thinEdge };
    const dropdownFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
    const cfFill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

    for (let r = firstRow; r <= lastRow; r++) {
      const row = worksheet.getRow(r);
      row.height = row.height && row.height > 18 ? row.height : 18;
      for (let c = 1; c <= 9; c++) {
        const cell = row.getCell(c);
        cell.border = gridBorder;
        cell.font = { name: "Calibri", size: 10, color: { argb: "FF111111" } };
        if (c === 6) cell.numFmt = "$#,##0.00";
        if (c === 5) cell.numFmt = "0.0";
        if (c === 2 || c === 7) cell.fill = dropdownFill;
      }
    }

    return cfFill;
  }

  root.BuildPilotManifestExport = {
    TEMPLATE,
    normalizeVehicleStatus,
    isCustomBuildVehicle,
    buildOrganizationLabel,
    projectStatusLabel,
    computeProgressPct,
    sumCompletedTaskHours,
    buildVehicleManifestMetaLines,
    applyManifestBrandHeaderRow,
    resolveBuildPilotLogoBase64,
    BRAND,
    applyProfessionalTemplateHeaderStyle,
    applyProfessionalTemplateGridStyle
  };
})(typeof window !== "undefined" ? window : globalThis);

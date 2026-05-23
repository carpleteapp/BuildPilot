# BuildPilot UX Audit & Implementation Report

**Date:** May 19, 2026  
**Scope:** Garage / project-build surfaces (index, vehicle detail, garage mode, inventory, journal, shop)  
**Constraint:** No existing features removed; responsive dark mode preserved.

---

## Executive summary

A cross-app **UX system layer** (`css/buildpilot-ux.css`) standardizes touch targets, cards, buttons, spacing, typography, and dark-mode behavior. Targeted changes **reduce taps** for the highest-frequency garage paths (Add Vehicle, Garage Mode) and improve **one-hand / thumb-zone** placement without restructuring workflows.

---

## Audit findings

### Mobile usability

| Area | Finding | Severity |
|------|---------|----------|
| Viewport & safe areas | `viewport-fit=cover` and safe-area insets present on main shells | Good |
| iOS input zoom | Some fields used &lt;16px font → zoom on focus | Medium → **fixed** (16px min on mobile) |
| Horizontal scroll | `max-w-md` / `28rem` shells limit width | Good |
| Garage Mode | Strong mobile-first layout (76px action tiles, bottom nav) | Good |
| Index / detail | Large inline styles; inconsistent micro-controls | Medium → **partially standardized** |

### Thumb reach

| Pattern | Before | After |
|---------|--------|-------|
| Add Vehicle | Top of “My Builds” (reach zone) | **Sticky bottom dock** duplicates action (same handler) |
| Garage Mode (detail) | Mid-page link in Today section | **Bottom dock** next to Dashboard |
| Garage Mode (index) | Open card → detail → Garage | **“Garage Mode” on active cards** (1 tap from list) |
| Back to dashboard | Bottom dock on detail | Unchanged (already thumb-friendly) |

### Touch size

| Control | Before | Standard (post) |
|---------|--------|-----------------|
| Global `button` | 48px min (index/detail) | 48px retained |
| Info / config icons | 40–44px | **48px** via UX layer |
| Mission modal actions | 40px | **48px** |
| Segment edit/delete | Variable (~36px mobile) | **48px min** |
| Garage chips | 44px | **48px** |

Reference: Apple HIG / Material — **48×48dp** minimum for primary actions in glove/grease contexts.

### Navigation depth

| Task | Clicks before | Clicks after |
|------|---------------|--------------|
| Add vehicle (index) | 1 (top) | **1** (bottom dock; same modal) |
| Garage Mode from garage home | Card → Detail → Garage | **1** (card shortcut, active builds) |
| Garage Mode from detail | Scroll → Today → Garage | **1** (bottom dock) |
| Full inventory | WF → Full Inventory | Unchanged (2) |
| Customer shop | Mode tab → shop.html | Unchanged (by design) |

Typical depth remains **2–3** for deep editing (segments, Excel, vault); shop floor actions target **1–2**.

### Screen clutter

| Source | Assessment | Mitigation |
|--------|------------|------------|
| Garage Intelligence panel | Useful but dense on phone | **Collapsible `<details>`** on viewports &lt;520px |
| Templates / Project Stats drawers | Hidden until expanded | Kept (progressive disclosure) |
| Vehicle card metrics | 4+ lines per card | Kept; added single action row only for active |
| Workflow sections (detail) | Many sections | No removal; bottom dock reduces scroll-to-exit |

### Repeated actions

| Repetition | Note |
|------------|------|
| Add Vehicle top + bottom | Intentional: top hidden visually on small screens when dock shown; **same `#add-vehicle-btn` click** |
| Garage Mode link (Today + dock + card) | Multiple entry points = fewer scrolls, not duplicate workflows |
| Status selects on cards | Unchanged |

### Typing / fast entry

| Feature | Status |
|---------|--------|
| Garage Mode voice note | Already present |
| Quick chips (garage sheets) | 48px chips post-UX |
| `font-size: 16px` on inputs (mobile) | Reduces accidental zoom, faster refocus |
| Excel / vault | Desktop-oriented; unchanged |

### Dark mode

| Check | Result |
|-------|--------|
| `color-scheme: dark` on `html` | Enforced in UX layer + key pages |
| `theme-color` meta | `#000000` on garage surfaces |
| Form autofill | Dark inset override in UX layer |
| Module palettes (`--svc-*`, `--gm-*`, `--shop-*`) | Unchanged; UX maps borders where shared |

### Standardization gap (pre-implementation)

Each module used separate `:root` tokens (`--svc-*`, `--gm-*`, `--inv-*`, `--shop-*`, `--bj-*`) with similar but not identical radii (10–16px) and tap heights (44 vs 48 vs 76). **Post:** shared `--bp-*` tokens in `buildpilot-ux.css` with utility classes `.bp-btn`, `.bp-card` hooks on existing components.

---

## Implementation delivered

### 1. Shared UX stylesheet

**File:** `css/buildpilot-ux.css`

- Design tokens: color, spacing, radius, tap minima, safe areas  
- Utility buttons: `.bp-btn`, `--primary`, `--secondary`, `--ghost`, `--compact`  
- Touch upgrades for icons, modals, segment actions, intelligence gear  
- Mobile input `font-size: 16px`  
- Index thumb dock + body padding  
- Vehicle card quick actions layout  
- Split bottom dock (detail)  
- Collapsible intelligence (`details.bi-panel-details`)  
- `prefers-reduced-motion` + `:focus-visible`  
- WebKit autofill dark styling  

### 2. Page integration

`buildpilot-ux.css` linked on:

- `index.html`
- `vehicle-detail.html`
- `garage-mode.html`
- `inventory.html`
- `journal.html`
- `shop.html`
- `customer.html`
- `shop-vehicle.html`

### 3. Index (`index.html`)

- Sticky **Add Vehicle** thumb dock (`#add-vehicle-thumb` → triggers `#add-vehicle-btn`)  
- `body.bp-has-index-dock` for safe padding  
- **Garage Mode** shortcut on **active** vehicle cards  
- `color-scheme: dark` on `<html>`  

### 4. Vehicle detail (`vehicle-detail.html`)

- Bottom nav: **Garage Mode** + **Dashboard** (split dock)  
- Garage href wired to existing `getGarageModeUrl()` logic  
- UX stylesheet linked  

### 5. Intelligence (`js/buildpilot-intelligence.js`)

- Panels wrapped in `<details class="bi-panel-details">` for mobile collapse  
- Desktop (≥520px): summary non-interactive, always expanded feel  

### 6. Intelligence CSS

- Config button aligned to 48px via UX layer  

---

## Files changed

| File | Change |
|------|--------|
| `css/buildpilot-ux.css` | **New** — UX system |
| `docs/UX-IMPLEMENTATION-REPORT.md` | **New** — this report |
| `index.html` | Dock, card shortcuts, UX link, dark html |
| `vehicle-detail.html` | Split bottom nav, UX link |
| `js/buildpilot-intelligence.js` | Collapsible panels |
| `garage-mode.html`, `inventory.html`, `journal.html`, `shop.html`, `customer.html`, `shop-vehicle.html` | UX link |

---

## Verification checklist

- [ ] **Index (phone):** Bottom “+ Add Vehicle” opens same flow as before; top button hidden &lt;520px but still in DOM for accessibility/screen readers  
- [ ] **Index:** Active card “Garage Mode” opens `garage-mode.html?id=…`  
- [ ] **Detail:** Bottom Garage + Dashboard; no overlap with build sheet  
- [ ] **Intelligence:** Tap section header to collapse on phone; expanded on desktop  
- [ ] **Dark mode:** System dark UI; inputs readable; no white flashes on focus  
- [ ] **Rotate / notch:** Safe-area padding on docks and shells  
- [ ] **Reduced motion:** OS setting disables scale animations  

---

## Recommended follow-ups (not in scope)

1. **Unify tokens in source** — Replace duplicate `:root` blocks in each CSS file with `@import` or shared `buildpilot-tokens.css` to avoid drift.  
2. **Segment quick-add sheet** — Default focus first field with numeric keyboard where appropriate (`inputmode="decimal"`).  
3. **Index intelligence** — Optional collapse same as vehicle panel.  
4. **Haptic feedback** — `navigator.vibrate(10)` on garage actions (Android; guarded).  
5. **PWA manifest** — `display: standalone` for shop-floor home-screen install.  

---

## Design tokens reference

```css
--bp-tap-min: 48px;
--bp-radius-md: 14px;
--bp-space-md: 0.75rem;
--bp-accent: #007aff;
--bp-garage: #39ff14;
```

Use `.bp-btn.bp-btn--primary` / `--secondary` for new garage UI; prefer existing class names on legacy screens so UX layer applies touch rules automatically.

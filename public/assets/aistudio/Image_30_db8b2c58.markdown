---
name: Cupertino Precision
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daea'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eefe'
  surface-container-high: '#e2e8f8'
  surface-container-highest: '#dce2f3'
  on-surface: '#151c27'
  on-surface-variant: '#45464d'
  inverse-surface: '#2a313d'
  inverse-on-surface: '#ebf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#006c4a'
  on-secondary: '#ffffff'
  secondary-container: '#82f5c1'
  on-secondary-container: '#00714e'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#2f1500'
  on-tertiary-container: '#c76c00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#85f8c4'
  secondary-fixed-dim: '#68dba9'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#005137'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#f9f9ff'
  on-background: '#151c27'
  surface-variant: '#dce2f3'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.005em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system embodies high-end digital craftsmanship, drawing deep heritage from modern macOS and iPadOS Pro productivity tools. Guided by the principles of **"Content before chrome"** and **"Simplicity is the ultimate sophistication,"** the interface recedes gracefully into the background to allow user work, analytics, and primary documents to occupy center stage.

### Aesthetic Persona & Philosophy
- **Quiet Authority:** Premium experience is delivered through structural balance, optical alignment, and generous breathing room rather than decorative flourishes or heavy structural chrome.
- **Micro-tactile Precision:** Interactive items feel tangible yet weightless, relying on ultra-fine hairline dividers, ambient occlusion, and optical squircle geometries.
- **Target Audience:** High-performing professionals, executives, creatives, and power users who require high data throughput without visual fatigue.
- **Design Movement:** Modern Minimalist with subtle translucent Glassmorphism accents (structural frosted sidebars, ambient layered canvas, and razor-sharp typographic hierarchy).

## Colors

The palette is rooted in an immaculate, neutral architecture with surgically applied semantic tints. The system eliminates saturated synthetic primaries in favor of deep system ink and organic status accents.

### Palette Architecture
- **Primary Ink (`#0F172A`):** Pure systemic depth used for prominent actions, critical icons, and dominant headlines. Never use pure black (`#000000`) for text to avoid optical vibration against bright white canvases.
- **Secondary / Success (`#059669`):** Deep Cupertino emerald. Represents positive performance, settled balances, active connections, and affirmative decisions. Paired with an ultra-subtle tinted wash (`rgba(5, 150, 105, 0.08)`) for badge foundations.
- **Tertiary / Warning (`#D97706`):** Warm, grounded amber designating pending actions, schedule alerts, and caution states without inducing panic.
- **Error / Critical (`#E11D48`):** Razor-sharp crimson rose for destructive triggers, overdue obligations, and threshold breaches.
- **Canvas & Containers:** Base canvas is pure luminous white (`#FFFFFF`). Secondary structural surfaces use neutral step-downs (`#F9FAFB` and `#F3F4F6`), creating natural visual containment without physical friction.
- **Structural Lines:** Borders strictly avoid heavy fills, leveraging an ultra-fine hairline tone (`rgba(15, 23, 42, 0.06)` or `#E5E7EB`).

## Typography

The typography relies on **Inter** configured with disciplined, Apple-caliber tracking and optical proportional balancing.

### Typographic Guidelines
- **Negative Tracking on Headlines:** Tight tracking (`-0.015em` to `-0.03em`) on display and headline tiers creates unified, high-density word marks reminiscent of SF Pro Display.
- **Tabular Figures for Data:** All metrics, monetary amounts, data tables, and telemetry counters must activate tabular figures (`font-variant-numeric: tabular-nums;`) to maintain rock-solid column alignment under updating figures.
- **Quiet Micro-labels:** Small categorization tags and auxiliary indicators leverage uppercase transformation with deliberate positive tracking (`+0.03em`) in medium-to-semibold weights, rendering them legible yet unobtrusive.
- **Line Length:** Optimal prose width is clamped between 55 and 70 characters to maintain relaxed horizontal scanning.

## Layout & Spacing

The layout model favors open, breathing compositions where visual grouping is achieved through negative space rather than explicit boundaries.

### Layout Philosophy
- **Adaptive Canvas Model:** Standard desktop productivity views use an asymmetric dual-pane or tri-pane layout (fixed-width navigation sidebar at `260px`, fluid main stage with a maximum readability threshold of `1440px`, and contextual inspector sheets).
- **Whitespace Allocation:** Minimum padding inside operational cards is set to `24px` (`space-lg`), expanding to `32px` (`space-xl`) on expansive monitors. Grouped related controls rely on micro intervals (`4px` to `8px`), whereas disparate sections demand structural gulfs (`24px` to `32px`).
- **Responsive Transitions:**
  - **Desktop (1024px+):** Full multi-pane arrangement, 12-column grid with `24px` gutters and `32px` page margins.
  - **Tablet (768px – 1023px):** Sidebars collapse into floating slide-over sheets; content shifts to an 8-column layout with `24px` gutters.
  - **Mobile (< 768px):** Single-column stacked flow with `16px` gutters and `20px` exterior margins. Toolbars pin smoothly to bottom or top safe areas.

## Elevation & Depth

Visual hierarchy is maintained without heavy, dark drop-shadows or dense outlines. The interface leans on **ambient occlusion, frosted glass, and tone-step surfaces**.

### Surface Tiers
- **Canvas (Level 0):** Pure `#FFFFFF` or translucent blur overlay (`backdrop-filter: blur(20px); background: rgba(255, 255, 255, 0.85)`).
- **Raised Containers (Level 1):** Subordinate functional cards sit either on a tinted wash (`#F9FAFB`) with a zero-shadow hairline perimeter (`1px solid rgba(15, 23, 42, 0.06)`), or on `#FFFFFF` with an imperceptible ambient contact shadow: `0 1px 2px rgba(15, 23, 42, 0.03), 0 4px 12px rgba(15, 23, 42, 0.02)`.
- **Floating Overlays & Popovers (Level 2):** Menus, pickers, and tooltips float visibly above the plane: `0 12px 32px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04)` with a crisp inner highlight border (`box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6)`).
- **Modal Sheets (Level 3):** Modal centers utilize deep ambient diffusion (`0 24px 64px rgba(15, 23, 42, 0.12)`) alongside a soft backdrop scrim (`rgba(15, 23, 42, 0.2)` with `backdrop-filter: blur(4px)`).

## Shapes

The geometric signature mirrors the continuous curvature of Apple squircle radii, avoiding harsh structural corners as well as juvenile, over-rounded pills on standard content boxes.

### Curvature Taxonomy
- **Standard Controls & Small Elements (`rounded` / `8px`):** Checkboxes, form fields, action chips, and nested list items.
- **Card Containers & Modules (`rounded-lg` / `16px`):** Dashboard modules, analytical charts, data tables, and surface panels.
- **Modal Dialogs & Large Sheets (`rounded-xl` / `24px`):** Floating dialogs, command palettes, and primary view overlays.
- **Interactive Badges & Circular Actions (`rounded-full` / `9999px`):** Restricted solely to status indicator dots, avatars, and discreet tag chips.

## Components

### Buttons
- **Primary:** Deep system ink background (`#0F172A`), high-contrast white text (`#FFFFFF`), subtle top-edge highlight. On hover, smooth opacity transition to `90%`. Active state settles into scale `0.985`.
- **Secondary / Soft:** Flat surface (`#F3F4F6`), system ink text (`#1F2937`), no border. On hover, background deepens to `#E5E7EB`.
- **Tertiary / Ghost:** Completely transparent background, `#4B5563` text, shifting to `#F9FAFB` with `#111827` on pointer hover.
- **Destructive:** Ultra-light rose container (`rgba(225, 29, 72, 0.08)`), crisp rose text (`#E11D48`), evolving into solid crimson upon intentional confirmation steps.

### Chips & Badges
- Strict minimal footprint (`h-6` or `h-7`, text `11px-12px`, font weight `500`).
- Consists of a faint tinted canvas (`8%` opacity of the semantic color) accompanied by deep text derived from that hue (e.g., `#047857` on `#ECFDF5`). No hard outer border lines.
- Dot indicators: Status chips pair with a `6px` solid status bead placed to the left of the label.

### Input Fields
- Background is `#F9FAFB` in resting state with an ultra-subtle border (`#E5E7EB`).
- Padding: `10px 14px` for compact balance.
- Focus: Transitions to `#FFFFFF` background with a hairline border in `#0F172A`, accompanied by a `2px` focus halo (`rgba(15, 23, 42, 0.08)`). No aggressive saturated outlines.
- Typography: Sharp placeholder tone (`#9CA3AF`) with body-level entered ink (`#0F172A`).

### Cards & Panels
- Constructed with `#FFFFFF` background, framed by `1px solid rgba(15, 23, 42, 0.06)`, padded with `24px` (`space-lg`).
- Header regions contain a title in `title-md`, secondary metadata in `body-sm` (`#6B7280`), and aligned right-hand micro-actions without horizontal dividers whenever possible. Whitespace acts as the structural divide.

### Checkboxes & Radio Buttons
- Precision `16px` footprint.
- Resting: `#FFFFFF` surface with `1.5px` border in `#D1D5DB`.
- Selected: Smooth fill in `#0F172A` with pure white checkmark icon. Corner radius is `4px` for checkboxes and full circle for radios.

### Lists & Tables
- Dense, highly readable layouts with subtle row separators (`1px solid rgba(15, 23, 42, 0.04)`).
- Alternate zebra striping is omitted; hover states reveal `#F9FAFB` smoothly across the entire row target.
- Column headers leverage `label-sm` in `#6B7280` with right-alignment strictly enforced on all numerical and monetary metrics.
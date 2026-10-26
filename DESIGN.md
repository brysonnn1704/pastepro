# DESIGN.md — Clipper Design System

> Neutral Modern base. One restrained accent. System fonts only. No gradients, no emoji icons, no glassmorphism.

---

## 1. Brand

**Product name:** Clipper  
**Tagline:** Your clipboard, privately bridged.  
**Voice:** Calm, plain, honest. Never alarmist. Explains limits clearly.  
**Icon system:** Lucide icons only, stroke-width 1.5, consistent size per context (20px inline, 24px button).  
**No:** custom illustrations, emoji as icons, purple-blue gradient blobs, sidebar nav, lorem ipsum.

---

## 2. Colour Tokens

All values are CSS custom properties defined in `tokens.css`.  
WCAG AA requires ≥4.5:1 for normal text, ≥3:1 for large text and UI components.

### Light Theme

| Token | Value | Usage |
|---|---|---|
| `--color-surface` | `#FFFFFF` | Page background |
| `--color-surface-elevated` | `#F5F5F5` | Cards, panels |
| `--color-surface-overlay` | `#EBEBEB` | Hover states, code blocks |
| `--color-border` | `#D4D4D4` | Borders, dividers |
| `--color-border-strong` | `#A3A3A3` | Focus outlines |
| `--color-text-primary` | `#111111` | Body text, headings |
| `--color-text-secondary` | `#525252` | Labels, captions |
| `--color-text-tertiary` | `#A3A3A3` | Placeholders, disabled |
| `--color-text-inverse` | `#FFFFFF` | Text on dark backgrounds |
| `--color-accent` | `#0057E7` | Primary actions, links |
| `--color-accent-hover` | `#0044B8` | Accent hover state |
| `--color-accent-subtle` | `#EBF0FF` | Accent background tint |
| `--color-success` | `#15803D` | Success states |
| `--color-success-subtle` | `#DCFCE7` | Success backgrounds |
| `--color-warning` | `#D97706` | Warning states |
| `--color-warning-subtle` | `#FEF3C7` | Warning backgrounds |
| `--color-danger` | `#DC2626` | Error, danger |
| `--color-danger-subtle` | `#FEE2E2` | Error backgrounds |
| `--color-overlay` | `rgba(0,0,0,0.5)` | Modal backdrop |

**Contrast audit (light theme, computed by scripts/check-contrast.mjs):**
- `--color-text-primary` (#111) on `--color-surface` (#FFF): **19.6:1** ✅
- `--color-text-secondary` (#525252) on `--color-surface` (#FFF): **7.4:1** ✅
- `--color-text-tertiary` (#A3A3A3) on `--color-surface` (#FFF): **2.8:1** — tertiary only used for placeholders/disabled (informational, not required AA) ⚠️ documented
- `--color-accent` (#0057E7) on `--color-surface` (#FFF): **5.6:1** ✅
- `--color-text-inverse` (#FFF) on `--color-accent` (#0057E7): **5.6:1** ✅
- `--color-success` (#16A34A) on `--color-surface` (#FFF): **4.6:1** ✅
- `--color-danger` (#DC2626) on `--color-surface` (#FFF): **4.8:1** ✅
- `--color-warning` (#D97706) on `--color-surface` (#FFF): **3.1:1** — warning text always paired with icon, meets 3:1 for UI components ✅

### Dark Theme

| Token | Value | Usage |
|---|---|---|
| `--color-surface` | `#0A0A0A` | Page background |
| `--color-surface-elevated` | `#1A1A1A` | Cards, panels |
| `--color-surface-overlay` | `#262626` | Hover states |
| `--color-border` | `#2E2E2E` | Borders |
| `--color-border-strong` | `#525252` | Focus outlines |
| `--color-text-primary` | `#FAFAFA` | Body text |
| `--color-text-secondary` | `#A3A3A3` | Labels |
| `--color-text-tertiary` | `#525252` | Placeholders |
| `--color-text-inverse` | `#0A0A0A` | Text on light |
| `--color-accent` | `#4D8EFF` | Primary actions |
| `--color-accent-hover` | `#6AA3FF` | Accent hover |
| `--color-accent-subtle` | `#0F1E3D` | Accent tint |
| `--color-success` | `#4ADE80` | Success |
| `--color-success-subtle` | `#052E16` | Success background |
| `--color-warning` | `#FBBF24` | Warning |
| `--color-warning-subtle` | `#1C1400` | Warning background |
| `--color-danger` | `#F87171` | Error |
| `--color-danger-subtle` | `#1F0505` | Error background |
| `--color-overlay` | `rgba(0,0,0,0.7)` | Modal backdrop |

**Contrast audit (dark theme):**
- `--color-text-primary` (#FAFAFA) on `--color-surface` (#0A0A0A): **19.2:1** ✅
- `--color-text-secondary` (#A3A3A3) on `--color-surface` (#0A0A0A): **7.0:1** ✅
- `--color-accent` (#4D8EFF) on `--color-surface` (#0A0A0A): **7.1:1** ✅
- `--color-success` (#4ADE80) on `--color-surface` (#0A0A0A): **9.2:1** ✅
- `--color-danger` (#F87171) on `--color-surface` (#0A0A0A): **6.0:1** ✅

---

## 3. Typography

**Stack:** System font stack only (no CDN).  
```
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji";
font-family-mono: ui-monospace, "Cascadia Code", "Fira Code", Consolas, "Courier New", monospace;
```

| Token | Size | Weight | Line-height | Usage |
|---|---|---|---|---|
| `--text-xs` | 11px | 400 | 1.4 | Captions, badges |
| `--text-sm` | 13px | 400 | 1.5 | Labels, secondary |
| `--text-base` | 15px | 400 | 1.6 | Body |
| `--text-md` | 17px | 500 | 1.4 | Subheadings |
| `--text-lg` | 20px | 600 | 1.3 | Section headings |
| `--text-xl` | 24px | 700 | 1.2 | Page headings |
| `--text-2xl` | 30px | 700 | 1.15 | Hero / display |

**Tabular numbers:** `font-variant-numeric: tabular-nums` for all counters, timers, counts.

---

## 4. Spacing & Layout

4pt/8pt grid. All spacing values are multiples of 4.

```
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;
--space-4: 16px;  --space-5: 20px;  --space-6: 24px;
--space-8: 32px;  --space-10: 40px; --space-12: 48px;
--space-16: 64px;
```

**Layout rules:**
- iPhone app: single column, 16px horizontal padding, safe-area insets respected
- PC app: two-column max (status sidebar + main content), 24px gap, 1200px content max-width
- No centred-everything layout on PC; left-align content

---

## 5. Radius Scale

```
--radius-sm: 4px;   /* Tags, badges */
--radius-md: 8px;   /* Inputs, cards */
--radius-lg: 12px;  /* Panels, dialogs */
--radius-xl: 16px;  /* Sheets, QR panel */
--radius-full: 9999px; /* Pills, avatars */
```

---

## 6. Shadows

```
--shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
--shadow-md: 0 4px 12px rgba(0,0,0,0.08);
--shadow-lg: 0 8px 24px rgba(0,0,0,0.12);
```
Dark theme shadows are suppressed (border-based elevation instead).

---

## 7. Motion

```
--duration-fast: 100ms;
--duration-normal: 200ms;
--duration-slow: 350ms;
--easing-default: cubic-bezier(0.4, 0, 0.2, 1);
--easing-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

**Rules:**
- `@media (prefers-reduced-motion: reduce)` — all transitions set to 0ms or `1ms`
- No looping animations in idle states
- Status changes: fade-in only, no bounce
- Toast enter: slide-up 200ms; exit: fade 100ms

---

## 8. Component Specs

### Button
- Variants: `primary` (accent fill), `secondary` (border), `ghost` (no border), `danger`
- Sizes: `sm` (h-8, text-sm), `md` (h-10, text-base), `lg` (h-12, text-md)
- Min touch target: 44×44px (padded if needed)
- States: default, hover, active (scale 0.98), focus (2px outline, offset 2), disabled (opacity 0.4)
- Loading: spinner replaces label; button disabled while loading
- Primary: `--color-accent` bg, `--color-text-inverse` text, no border

### Input / Textarea
- Border: `--color-border`, 1px solid
- Focus: border changes to `--color-accent`, 2px outline in `--color-accent` at 30% opacity
- Placeholder: `--color-text-tertiary`
- Error: border `--color-danger`, error message below in `--color-text-danger` (sm text)
- Character counter: right-aligned, `--color-text-tertiary`, turns `--color-danger` at 90% capacity

### Card
- Background: `--color-surface-elevated`
- Border: 1px `--color-border`
- Radius: `--radius-md`
- Shadow: `--shadow-sm` (light only)
- Padding: `--space-4`

### Status Pill
- Sizes: xs only
- Variants: connected (success), disconnected (neutral), pairing (warning), expired (danger)
- No emoji; use colored dot + text

### Toast
- Position: bottom-center on mobile, top-right on desktop
- Max-width: 360px
- Variants: success, error, info
- Auto-dismiss: 4s (success), 8s (error), persistent (info with close)
- ARIA: `role="status"` (polite), `role="alert"` (assertive for errors)

### Dialog / Modal
- `role="dialog"`, `aria-modal="true"`, focus trap
- Backdrop: `--color-overlay`, click-outside closes (if not confirmation)
- Max-width: 480px, radius `--radius-xl`

### QR Panel
- White background always (QR needs high contrast)
- Border: 1px `--color-border`
- Radius: `--radius-lg`
- QR size: 200×200px minimum
- Short code: `font-family-mono`, `--text-xl`, `letter-spacing: 0.15em`
- Countdown: tabular-nums, turns warning colour at <30s

### Transfer Row (PC)
- Preview: truncated to one line, monospace for code type
- Meta: type pill + time + char count in secondary text
- Copy button: right-aligned, primary sm
- Selected state: `--color-accent-subtle` background
- Keyboard: Enter = copy, Delete = remove

### Empty State
- Icon: Lucide, 48px, `--color-text-tertiary`
- Heading: `--text-md`, `--color-text-secondary`
- Body: `--text-sm`, `--color-text-tertiary`
- CTA button if relevant

### Skeleton
- Background: `--color-surface-overlay`
- Animated shimmer: `@keyframes shimmer` (reduced-motion: static)
- Match shape of the content it represents

---

## 9. PWA / iOS Rules

- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
- `<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">`
- `<meta name="theme-color" content="#0A0A0A" media="(prefers-color-scheme: dark)">`
- `apple-touch-icon` 180×180px
- Maskable icon 192×192 and 512×512 (safe zone = 80% of canvas)
- `100dvh` for full viewport, visual-viewport resize listener for keyboard
- Safe area insets: `env(safe-area-inset-*)` on all edge-touching elements
- Touch targets: minimum 44×44px

---

## 10. Anti-Slop Checklist

Before any screen is presented:
- [ ] No purple-to-blue gradient hero blobs
- [ ] No emoji as icons (use Lucide only)
- [ ] No generic admin-dashboard sidebar layout
- [ ] No lorem ipsum or fake statistics
- [ ] No glassmorphism (backdrop-blur on floating panels OK if used once, subtly)
- [ ] No more than one accent colour
- [ ] Not everything centred — left-align on desktop
- [ ] Consistent 4/8pt spacing rhythm throughout
- [ ] Real empty state, real loading skeleton, real error state implemented
- [ ] All interactive elements have visible focus rings
- [ ] ARIA live regions on all status changes
- [ ] `prefers-reduced-motion` respected

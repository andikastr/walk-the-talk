---
version: 1
name: Paper & Lime Performance Mobile
description: A high-contrast editorial mobile aesthetic on warm off-white paper, anchored by near-black ink and a single electric lime accent with a secondary ember orange. Display-grade geometric sans for numerals and headings, neutral humanist sans for body. Generous 24px corner radii, flat surfaces with subtle tonal layering (paper / paper-alt / white / ink), tabular numerals everywhere, all-caps tracked-out micro-labels, and dramatic photography in soft-rounded rectangular frames.
colors:
  primary: "#D7FE47"            # electric lime — accent only, never page surface
  primary-deep: "#C8F02A"       # pressed lime
  on-primary: "#0E0F0C"         # ink on lime
  accent: "#FF5A1F"             # ember — reserved for hero metrics & alerts
  surface: "#F4F2EC"            # warm paper — global page background
  surface-alt: "#EBE8E0"        # paper-alt — secondary tiles & cards
  surface-raised: "#FFFFFF"     # pure white — list-row cards on paper
  surface-inverse: "#0E0F0C"    # ink — dark cards & nav
  on-surface: "#0E0F0C"         # ink — primary text
  on-surface-variant: "#8A8A82" # mute — metadata, secondary text
  on-inverse: "#F4F2EC"         # paper text on ink
  border: "#E3E0D7"             # hairline / dividers / ring track
  border-strong: "#DDDAD1"      # progress track fill
  neutral-soft: "#C8C5BA"       # de-emphasized data bar fill
typography:
  display-xl:
    fontFamily: Space Grotesk
    fontSize: 84px
    fontWeight: 700
    lineHeight: 0.9
    letterSpacing: -0.04em
  display-md:
    fontFamily: Space Grotesk
    fontSize: 34px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -0.04em
  numeral-md:
    fontFamily: Space Grotesk
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -0.04em
  numeral-sm:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -0.04em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  card-title:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 450
    lineHeight: 1.4
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: -0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.01em
  label-uppercase:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.18em        # tracked-out caps for kickers / metric labels
  caption:
    fontFamily: Inter
    fontSize: 9px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.15em
rounded:
  sm: 8px
  md: 18px       # photo thumbs
  lg: 24px       # cards, tiles
  full: 9999px   # all chips, pills, nav, avatars
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  3xl: 32px
  gutter: 24px
  card-padding: 20px
  tile-padding: 16px
  section-gap: 24px
icons:
  set: lucide
  default_variant: regular   # lucide has no variant suffix; stroke controls weight
  active_variant: regular
  stroke_weight: 2px
  default_size: 18px
components:
  card:
    backgroundColor: "{colors.surface-alt}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  card-raised:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  card-inverse:
    backgroundColor: "{colors.surface-inverse}"
    textColor: "{colors.on-inverse}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  card-accent:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  button-primary:
    backgroundColor: "{colors.surface-inverse}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    height: 44px
    paddingX: 20px
    pressedBackground: "darken(8%)"
  button-icon:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    size: 40px
    iconSize: 18px
  chip:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    paddingX: 10px
    paddingY: 4px
  chip-active:
    backgroundColor: "{colors.surface-inverse}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    paddingX: 10px
    paddingY: 4px
  chip-accent:
    backgroundColor: "{colors.surface-inverse}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    paddingX: 10px
    paddingY: 4px
  badge-dot:
    backgroundColor: "{colors.accent}"
    size: 6px
    rounded: "{rounded.full}"
  avatar:
    backgroundColor: "{colors.surface-alt}"
    size: 40px
    rounded: "{rounded.full}"
  list-row:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
    gap: "{spacing.lg}"
  thumb:
    backgroundColor: "{colors.surface-inverse}"
    rounded: "{rounded.md}"
    size: 72px
  tab-bar:
    backgroundColor: "{colors.surface-inverse}"
    textColor: "{colors.on-inverse}"
    rounded: "{rounded.full}"
    paddingX: 8px
    paddingY: 8px
    height: 60px
  tab-item-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    paddingX: 16px
    paddingY: 10px
  tab-item-inactive:
    backgroundColor: transparent
    textColor: "{colors.on-inverse}"
    rounded: "{rounded.full}"
    size: 44px
    iconSize: 18px
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
---

# Paper & Lime Performance Mobile

## Overview

**Editorial. Performance-grade. Quietly loud.**

The aesthetic is built on a warm-paper canvas with near-black ink, broken once by a single electric-lime accent and once more by a controlled shot of ember orange. It feels like a contemporary print magazine grafted onto a sportswear lookbook — generous whitespace, oversized geometric numerals, tabular precision, all-caps micro-kickers, and dramatic photography sitting flat against paper.

Density is balanced — not airy, not cramped. Numbers are hero objects: they get tabular alignment, the heaviest weight, and the largest type. Everything else (labels, metadata, body) recedes to a quiet humanist sans in muted neutrals.

The mood is disciplined and confident, never cute. No drop shadows on content, no gradients, no skeuomorphic embellishment. Color is rationed — the lime is a reward, not a wallpaper.

## Colors

**Mode:** light, on warm off-white paper.

**Palette boundaries:**
- `{colors.surface}` (warm paper `#F4F2EC`) is the global canvas. Never used as a card fill against itself.
- `{colors.surface-alt}` (`#EBE8E0`) is for soft tiles and grouped data tiles — the default card on the page.
- `{colors.surface-raised}` (pure white) is reserved for list-row items that need to "lift" off the paper without using shadow. Use it when a row needs separation from a paper-toned neighborhood.
- `{colors.surface-inverse}` (ink `#0E0F0C`) is for dark feature cards and the floating tab bar. It carries `{colors.on-inverse}` for text.
- `{colors.primary}` (lime `#D7FE47`) is an **accent only** — chip-accent, single feature tile, active tab pill, single bar in a chart, single dot accent. **Never** a full page surface, never a card background covering more than ~25% of the screen.
- `{colors.accent}` (ember `#FF5A1F`) is rationed even more tightly: hero metric numerals, alert dots, single semantic ring, one figure inside a row's stat group. Never two ember elements adjacent.
- `{colors.on-surface-variant}` (`#8A8A82`) is the workhorse for metadata, kicker labels, and inactive states.
- `{colors.border}` is hairline dividers and ring tracks — never a fill.

The lime and ember never touch each other directly; they always have ink, paper, or paper-alt between them.

## Typography

**Two families, sharply role-separated:**
- **Space Grotesk** — geometric display sans. Used for every numeral, every heading, and every card title. Weights 600 and 700 only. Tight tracking (-0.01em on headings, -0.04em on numerals).
- **Inter** — humanist neutral sans. Used for body, labels, captions, kickers. Weights 400/450/500. Tracking is neutral on body, dramatically opened (+0.18em) on uppercase kickers.

**Role map:**
- `{typography.display-xl}` — singular hero numerals (the one big number per screen). Always tabular, tight, often colored ember.
- `{typography.display-md}` — tile-level headline numerals (stat tiles).
- `{typography.numeral-md}`, `{typography.numeral-sm}` — secondary tabular numerals inside data strips and rings.
- `{typography.headline-md}` — top-bar greeting / primary screen title.
- `{typography.headline-sm}` — section anchors above grids and lists.
- `{typography.card-title}` — title inside a list-row card.
- `{typography.body-md}` / `{typography.body-sm}` — paragraphs and metadata text.
- `{typography.label-md}` — chip and button text.
- `{typography.label-uppercase}` — the signature move: tracked-out 10px all-caps labels for every kicker, every metric name, every micro-section header. This is load-bearing.
- `{typography.caption}` — the smallest day labels under bars, axis ticks.

**Numerals always use `font-variant-numeric: tabular-nums`** so columns of figures align. **Active vs. idle weight shift:** "active" numerals (current/featured stats) use weight 700 with -0.04em tracking; "idle" numerals (secondary / passive) use weight 500 with -0.02em tracking. This shift is how the screen tells you what to look at.

## Spacing & Layout

Side gutter is `{spacing.gutter}` (24px) — generous but not soft. Vertical rhythm runs in 24–32px section gaps.

Grids are 2-column for stat tiles with 12px gaps, full-width for list rows with 12px between cards. Cards have 16–20px internal padding; dark feature cards use 20px. Inline icon-text gaps run 6–10px.

The aesthetic is **balanced-density**: not Bloomberg-dense, not wellness-airy. There's always room for one big number to breathe.

## Elevation & Depth

**Almost entirely flat.** Hierarchy comes from:
1. **Tonal layering** — paper → paper-alt → white → ink, four steps total.
2. **Color reservation** — the rare lime or ember tile reads as elevated by saturation alone.
3. **Hairlines** — `{colors.border}` 1px lines for in-card section breaks.

The **only** shadow in the system is on the floating bottom nav: `box-shadow: 0 10px 30px -8px rgba(14,15,12,0.35), 0 2px 0 rgba(14,15,12,0.06);`. This is the signature "cta-shadow." Cards do not use it. Photos do not use it.

## Shapes

The radius vocabulary is small and intentional:
- `{rounded.sm}` (8px) — micro-progress bars, tiny inline pills.
- `{rounded.md}` (18px) — photo thumbnails inside list rows.
- `{rounded.lg}` (24px) — every card, tile, and grouped surface. **This is the default.**
- `{rounded.full}` — every chip, button, avatar, badge, the entire tab bar, and all icon buttons.

Rule of thumb: **interactive things are pills, surfaces are 24, photos are 18.** No sharp corners anywhere except inside SVG charts.

## Components

### card

Default soft tile. Paper-alt fill, 24px radius, 20px padding, no border, no shadow.

```html
<div class="rounded-[24px] bg-[#EBE8E0] p-5">
  <div class="flex items-center justify-between mb-3">
    <h3 class="font-['Space_Grotesk'] text-[15px] font-semibold tracking-tight">[Card title]</h3>
    <span class="text-[11px] text-[#8A8A82] tabular-nums">[Metadata]</span>
  </div>
  <!-- card body -->
</div>
```

### card-raised

White-on-paper variant for list rows that need separation without shadow.

```html
<div class="rounded-[24px] bg-white p-4 flex items-center gap-4">
  <!-- row content -->
</div>
```

### card-inverse

The dark feature card — ink fill, paper text. Used for one prominent block per screen.

```html
<div class="rounded-[24px] bg-[#0E0F0C] text-[#F4F2EC] p-5">
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center gap-2">
      <iconify-icon icon="lucide:[icon-name]" class="size-4 text-[#D7FE47]"></iconify-icon>
      <span class="text-[11px] uppercase tracking-[0.2em] text-[#F4F2EC]/60">[Kicker]</span>
    </div>
    <div class="font-['Space_Grotesk'] tabular-nums font-bold text-[18px]">
      <span class="text-[#D7FE47]">[Value]</span>
      <span class="text-[#F4F2EC]/50 text-[13px] ml-1">[Unit]</span>
    </div>
  </div>
  <!-- body -->
</div>
```

### card-accent

The single lime tile per screen — used to flag the most positive or active stat in a grid.

```html
<div class="rounded-[24px] bg-[#D7FE47] p-4 aspect-[1/0.95] flex flex-col justify-between">
  <div class="flex items-center justify-between">
    <iconify-icon icon="lucide:[icon-name]" class="size-[18px]"></iconify-icon>
    <span class="text-[10px] uppercase tracking-[0.18em] opacity-60">[Label]</span>
  </div>
  <div>
    <div class="font-['Space_Grotesk'] tabular-nums font-bold tracking-[-0.04em] text-[34px] leading-none">
      [Value]<span class="text-[16px] font-medium opacity-50 ml-1">[Unit]</span>
    </div>
    <div class="flex items-center justify-between mt-2">
      <span class="text-[11px] opacity-60 tabular-nums">[Comparison]</span>
      <iconify-icon icon="lucide:[icon-name]" class="size-[14px]"></iconify-icon>
    </div>
  </div>
</div>
```

### button-primary

Ink pill. Used sparingly — most actions are chips or icon buttons.

```html
<button class="h-11 px-5 rounded-full bg-[#0E0F0C] text-[#F4F2EC] text-[12px] font-medium tracking-tight active:bg-black flex items-center justify-center gap-2">
  [Action label]
</button>
```

### button-icon

Round paper-alt icon button — top-bar utility actions.

```html
<button class="w-10 h-10 rounded-full bg-[#EBE8E0] flex items-center justify-center">
  <iconify-icon icon="lucide:[icon-name]" class="size-[18px]"></iconify-icon>
</button>
```

### chip / chip-active

Filter chips. Inactive: paper-alt with mute text. Active: ink with paper text.

```html
<div class="flex items-center gap-1">
  <button class="rounded-full bg-[#0E0F0C] text-[#F4F2EC] text-[11px] px-2.5 py-1">[Filter A]</button>
  <button class="rounded-full bg-[#EBE8E0] text-[#8A8A82] text-[11px] px-2.5 py-1">[Filter B]</button>
  <button class="rounded-full bg-[#EBE8E0] text-[#8A8A82] text-[11px] px-2.5 py-1">[Filter C]</button>
</div>
```

### chip (label-only inside cards)

For inline status labels on dark surfaces or in headers — slightly larger padding when used with display numerals.

```html
<span class="rounded-full bg-[#0E0F0C] text-[#F4F2EC] text-[11px] font-medium px-2.5 py-1 tracking-wide">[STATUS] [Value]</span>
```

### badge-dot

A 6px ember dot for unread/alert states. Always sits on a circular icon button or beside an inline icon.

```html
<span class="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-[#FF5A1F]"></span>
```

### avatar

Plain circular photo, paper-alt fallback fill, no ring, no border.

```html
<div class="w-10 h-10 rounded-full overflow-hidden bg-[#EBE8E0]">
  <img src="[avatar-url]" class="w-full h-full object-cover"/>
</div>
```

### list-row

White card containing a 72×72 thumb on the left, a stack of kicker / title / inline tabular metadata on the right, and a chevron. The metric numerals inside the metadata row use ink for primary values, ember for the single calorie/effort metric, and mute for everything else; vertical hairlines separate stats.

```html
<div class="rounded-[24px] bg-white p-4 flex items-center gap-4">
  <div class="rounded-[18px] w-[72px] h-[72px] shrink-0 bg-[#0E0F0C] overflow-hidden">
    <img src="[thumb-url]" class="w-full h-full object-cover"/>
  </div>
  <div class="flex-1 min-w-0">
    <div class="flex items-center gap-2 mb-1">
      <span class="text-[10px] uppercase tracking-[0.18em] text-[#8A8A82]">[Type label]</span>
    </div>
    <div class="font-['Space_Grotesk'] font-semibold text-[16px] leading-tight">[Row title]</div>
    <div class="flex items-center gap-3 mt-1.5 tabular-nums text-[12px] text-[#8A8A82]">
      <span><span class="text-[#0E0F0C] font-medium">[Value]</span> [unit]</span>
      <span class="bg-[#E3E0D7] w-px h-3"></span>
      <span><span class="text-[#FF5A1F] font-medium">[Value]</span> [unit]</span>
      <span class="bg-[#E3E0D7] w-px h-3"></span>
      <span>[Value]</span>
    </div>
  </div>
  <iconify-icon icon="lucide:chevron-right" class="size-[18px] text-[#8A8A82]"></iconify-icon>
</div>
```

### top-app-bar

Avatar + two-line greeting on the left; two icon buttons on the right. No bar fill — sits on paper.

```html
<header class="px-6 pt-8 pb-6 flex items-center justify-between">
  <div class="flex items-center gap-3">
    <div class="w-10 h-10 rounded-full overflow-hidden bg-[#EBE8E0]">
      <img src="[avatar-url]" class="w-full h-full object-cover"/>
    </div>
    <div class="leading-tight">
      <div class="text-[11px] uppercase tracking-[0.18em] text-[#8A8A82]">[Kicker]</div>
      <div class="font-['Space_Grotesk'] text-[17px] font-semibold -mt-0.5">[Greeting]</div>
    </div>
  </div>
  <div class="flex items-center gap-2">
    <button class="w-10 h-10 rounded-full bg-[#EBE8E0] flex items-center justify-center">
      <iconify-icon icon="lucide:[icon-name]" class="size-[18px]"></iconify-icon>
    </button>
    <button class="w-10 h-10 rounded-full bg-[#EBE8E0] flex items-center justify-center relative">
      <iconify-icon icon="lucide:[icon-name]" class="size-[18px]"></iconify-icon>
      <span class="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-[#FF5A1F]"></span>
    </button>
  </div>
</header>
```

### tab-bar (floating)

Centered floating ink pill with a lime active item, an inverted paper-on-ink center action, and three reduced-opacity icon-only items.

```html
<nav class="fixed bottom-5 left-1/2 -translate-x-1/2 z-30">
  <div class="bg-[#0E0F0C]/95 backdrop-blur-md text-[#F4F2EC] rounded-full px-2 py-2 flex items-center gap-1"
       style="box-shadow:0 10px 30px -8px rgba(14,15,12,.35), 0 2px 0 rgba(14,15,12,.06);">
    <button class="bg-[#D7FE47] text-[#0E0F0C] rounded-full px-4 py-2.5 flex items-center gap-2">
      <iconify-icon icon="lucide:[icon-name]" class="size-[18px]"></iconify-icon>
      <span class="text-[12px] font-semibold tracking-tight">[Active label]</span>
    </button>
    <button class="rounded-full w-11 h-11 flex items-center justify-center text-[#F4F2EC]/70">
      <iconify-icon icon="lucide:[icon-name]" class="size-[18px]"></iconify-icon>
    </button>
    <button class="rounded-full w-11 h-11 flex items-center justify-center bg-[#F4F2EC] text-[#0E0F0C] ml-1">
      <iconify-icon icon="lucide:plus" class="size-5"></iconify-icon>
    </button>
    <button class="rounded-full w-11 h-11 flex items-center justify-center text-[#F4F2EC]/70">
      <iconify-icon icon="lucide:[icon-name]" class="size-[18px]"></iconify-icon>
    </button>
    <button class="rounded-full w-11 h-11 flex items-center justify-center text-[#F4F2EC]/70">
      <iconify-icon icon="lucide:[icon-name]" class="size-[18px]"></iconify-icon>
    </button>
  </div>
</nav>
```

### data-strip (composite)

A signature treatment: 4-column tabular-numeral row with all-caps tracked kickers above each numeral, optionally followed by a hairline divider and a vertical bar chart underneath.

```html
<div class="rounded-[24px] bg-[#EBE8E0] p-5">
  <div class="grid grid-cols-4 gap-3">
    <div>
      <div class="text-[10px] uppercase tracking-[0.18em] text-[#8A8A82] mb-1">[Label]</div>
      <div class="font-['Space_Grotesk'] tabular-nums font-bold tracking-[-0.04em] text-[26px] leading-none">[Value]</div>
    </div>
    <!-- repeat -->
  </div>
  <div class="h-px bg-[#E3E0D7] my-5"></div>
  <div class="flex items-end justify-between h-16 gap-2">
    <div class="flex-1 flex flex-col items-center gap-2">
      <div class="w-full bg-[#0E0F0C] rounded-t-md" style="height:60%"></div>
      <span class="text-[9px] text-[#8A8A82] tabular-nums">[Tick]</span>
    </div>
    <!-- one bar may be lime to mark "today" / featured -->
  </div>
</div>
```

## Iconography

**Set:** `lucide` — clean 2px-stroke geometric line icons with rounded terminals. Lucide has no variant suffix; the icon name is the bare name (`lucide:home`, `lucide:flame`, `lucide:bell`).

**Default size:** 18px in chrome and tile headers, 14px inline next to small numerals, 20px for the central "create" affordance in the tab bar.

**Color:** ink by default; `{colors.on-surface-variant}` for inactive/metadata icons; `{colors.primary}` for a single icon inside an inverse card to denote brand/active; `{colors.accent}` for alert dots only.

**No filled variants** — the aesthetic is line-only. Active state is conveyed by background pill (lime), not by a filled icon.

## Illustration & Imagery

**Style / Technique:** dramatic high-contrast photography, athletic and editorial. Studio-grade lighting with strong directional key light, deep shadow falloff, and quiet midtones. Subjects are tightly composed, often anatomical fragments (hands on equipment, profile portraits, mid-stride figures, silhouettes against light). Treatment is photographic, not illustrative — never a drawing, never a render.

**Edge treatment:** none — photos are photos, no outlines, no stroke, no posterization.

**Shading & light:** high-contrast continuous tone. One dominant light source, deep shadow side. Embrace silhouettes — figures partially or fully in shadow against a luminous gradient backdrop are on-aesthetic.

**Composition & framing:** subject fills 60–95% of the frame; tight crops are preferred over wide environmental shots. Either centered with breathing room above the head, or off-center along a strong diagonal of motion. Negative space is intentional and quiet — often a soft gradient wall.

**Background within the illustration:** soft tonal gradient (light-to-shadow wall, studio backdrop, dark gym floor with blurred window light). Never a busy environment, never a colored backdrop.

**Container styling:** photos sit inside an `{rounded.md}` (18px) frame for thumbnails (72×72) inside list rows, or a larger `{rounded.lg}` (24px) frame for hero photographs. The container has an ink (`#0E0F0C`) background as a fallback while the image loads — this means partial-load states still feel intentional. No border, no padding inside the frame — the image bleeds edge-to-edge.

**CSS treatment on the `<img>` element:** `object-cover` always — the image fills its container and crops as needed. No `mix-blend-mode`. No `opacity` reduction. No CSS filters.

**Box-shadow on the image or its frame:** none — images sit flat on the surface. Their visual weight comes from internal contrast, not elevation.

**Aspect ratio rule:** thumbnails are square (1:1). Hero photos may be square or 4:5 portrait. Avoid 16:9 and other wide ratios — they read as "stock" and break the editorial-portrait feel. Always preserve the source ratio inside the rounded frame; never letterbox.

**Anti-references:**
- NOT 3D rendered
- NOT illustration or vector art
- NOT cartoon or stylized
- NOT pastel
- NOT sepia or duotoned with a color cast
- NOT lifestyle stock photography (no group smiles, no logos, no branded apparel)

**Style recipe prompt:**

> *Editorial photograph of [SUBJECT], dramatic high-contrast studio lighting with one strong directional key light and deep shadow falloff, tight intimate crop, soft tonal gradient backdrop, quiet negative space, anatomical or silhouette emphasis, magazine-grade composition. Photographic, not illustrated. NOT 3D, NOT cartoon, NOT bright, NOT stock-lifestyle.*

## Hierarchy & Emphasis

What earns visual weight, in order:
1. **Hero numerals** — the single biggest tabular numeral on the screen, often colored ember.
2. **Saturated tiles** — one lime tile, one ink tile per grid maximum.
3. **Photographic thumbs** — rich imagery inside ink-backed rounded containers pull the eye.
4. **Display headings** — Space Grotesk 600 in ink.
5. **Tracked-out kickers** — uppercase 10px labels that organize the page without shouting.
6. **Body and metadata** — humanist sans in mute gray, deliberately recessive.

Active state always promotes via background fill (ink or lime pill), never via type weight or color shift on text alone.

## Distinctive Details

1. **The active/idle numeral weight shift.** Featured numerals jump to weight 700 with -0.04em tracking; passive numerals stay at 500 with -0.02em. The page literally tells you what's "today" with type weight.
2. **The tracked-out 10px uppercase kicker.** Every metric label, every section eyebrow, every kicker uses Inter 500 at 10–11px with +0.18em letter-spacing. It's the connective tissue that makes paper-alt tiles feel editorial instead of generic.
3. **Single-color rationing across photo, lime, and ember.** A photo, a lime tile, and an ember numeral coexist on one screen — and never repeat. If you see two lime objects or two ember numerals, the rationing has broken.
4. **The pill-pill-pill-pill nav.** A floating ink capsule containing four pill-shaped icon slots and one inverted paper-on-ink center action — the only element in the entire system carrying a real shadow.

## Do's and Don'ts

### Do
- Use lime exactly once per screen — as a tile, an active tab pill, or a single chart bar.
- Use ember exactly once per screen — typically for the hero numeral or one inline metric.
- Set `tabular-nums` on every numeral, no exceptions.
- Keep all uppercase labels at +0.15em tracking minimum.
- Use Space Grotesk 600/700 for numbers and headings; Inter 400–500 for everything else.
- Default all surfaces to `{rounded.lg}` (24px) and all interactive elements to `{rounded.full}`.
- Render photos with dramatic high-contrast lighting inside ink-backed rounded containers.
- Use `card-raised` (white) only when a row needs to lift off paper without shadow.

### Don't
- Don't use lime as a page background or a card filling more than ~25% of viewport.
- Don't apply box-shadow to cards, photos, or buttons — only the floating tab bar carries shadow.
- Don't introduce a third accent color or replace lime/ember with a tinted variant.
- Don't use Inter for numerals or Space Grotesk for body — the family-to-role mapping is strict.
- Don't put two ember elements or two lime tiles on the same screen.
- Don't add borders to cards — separation is tonal (paper / paper-alt / white / ink), not lined.
- Don't use filled icon variants — lucide line icons only; active state is a background pill.
- Don't drop the all-caps tracked kickers — they are the aesthetic's connective grammar.
- Don't crop photos to wide cinematic ratios — square or 4:5 portrait only.
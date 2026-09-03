# Authoring QR frame assets

An illustrated QR frame is **one self-describing SVG file** in
[`frontend/public/frames/`](../public/frames/). Drop a file in, rebuild, and it
appears in the picker with the right category. There is no code to edit.

```bash
# after adding/editing frame SVGs
pnpm frames:build      # validates + regenerates src/lib/qr-frame-manifest.ts
pnpm frames:preview    # renders every frame to .frames-preview.html — open it
```

`pnpm build` runs `frames:build` first, so an invalid frame **fails the build**
rather than shipping broken.

---

## 1. The contract

Everything the app needs lives in attributes on the **root `<svg>`**:

| Attribute | Required | Meaning |
|---|---|---|
| `width` / `height` | — | Ignored. The renderer rewrites the root size from the viewBox, so `viewBox="0 0 2000 2000" width="300"` (what design tools usually emit) is fine. |
| `viewBox` | ✅ | Must start at `0 0`, e.g. `0 0 1000 1000`. Units are arbitrary — treat them as design pixels. |
| `data-frame-id` | ✅ | Unique kebab-case id. **This is persisted to the database**, so never rename it once customers have used it. |
| `data-frame-label` | ✅ | Name shown in the picker, e.g. `Pumpkins & Bats`. Escape `&` as `&amp;`. |
| `data-frame-category` | ✅ | Picker group, e.g. `Halloween`. Spelling must be consistent — see gotchas. |
| `data-qr` | ✅ | `"x y w h"` — where the QR is composited. **Must be square.** |
| `data-text` | optional | `"x y w h size color align"` — the CTA text slot. Omit if the frame has no text. |
| `data-tintable` | optional | `"true"` if the artwork uses `currentColor` (see §4). |

`data-text` fields: `x y w h` is the box, `size` the font size in the same units,
`color` a hex value, `align` one of `start` / `center` / `end`.

---

## 2. Layout — and the one rule that matters

**Artwork is always composited *underneath* the QR.** This is deliberate: it makes
it structurally impossible for a frame to cover the QR modules and produce an
unscannable code. The practical consequences:

- Anything you draw inside the QR slot **will be hidden**. Don't put detail there.
- The slot renders as a **solid block of the QR's own background colour** (the
  customer picks that separately). Design as if a solid square sits in that hole.
- Decoration must live in the margins around the slot.

```
 ┌─────────────────────────────────┐
 │   ← artwork (top margin)        │   0 .. qr.y
 │      ┌───────────────────┐      │
 │  ←   │                   │   →  │   the QR slot: keep it clear.
 │  art │    data-qr        │  art │   Whatever you draw here is
 │      │                   │      │   painted over.
 │      └───────────────────┘      │
 │   ← data-text slot / artwork    │
 └─────────────────────────────────┘
```

### Recommended proportions

A 1000×1000 canvas with `data-qr="180 170 640 640"` and
`data-text="60 840 880 100 44 #333333 center"` is the layout the built-in frames
use. It gives ~170px of top margin, ~180px sides, and a bottom band for the CTA.

- The slot must be **at least 45%** of the shorter canvas side (the validator
  enforces this — a smaller code is hard to scan).
- **55–65% is the sweet spot.** Lower = more room for illustration and a bolder
  frame; higher = a bigger, easier-to-scan code.
- Non-square canvases are fine (see `standard-phone.svg`, 1000×1180).

---

## 3. What will reject your file

The build refuses anything that could carry active content or phone home, because
these SVGs get **inlined into the SVG and PDF files customers download**:

- `<script>`, `<foreignObject>`, `<iframe>`
- inline event handlers (`onload=`, `onclick=`, …)
- `javascript:` URIs
- `<!DOCTYPE` or `<!ENTITY` (XXE surface)
- any remote URL — in `href`, `xlink:href`, or a CSS `url()`
- `<image>` — embed vectors; don't reference rasters

Plus correctness rules: missing/duplicate id, non-kebab-case id, missing
label/category, bad or non-square `data-qr`, a slot outside the viewBox, a slot
under 45%, malformed `data-text`, and two categories differing only by case.

Error messages name the file and the problem.

---

## 4. Tintable frames

If you want the customer's **frame colour** to drive part of the artwork, paint
that part with `currentColor` and set `data-tintable="true"`:

```svg
<path d="M0 866h1000v86a48 48 0 0 1-48 48H48a48 48 0 0 1-48-48z" fill="currentColor"/>
```

Every `currentColor` is substituted with the chosen colour at render time, and the
colour picker appears in the editor for that frame. Frames without it keep their
artwork colours fixed and show no colour picker.

Use it for the "Standard"/business frames where brand colour matters. Occasion
frames (Christmas, Diwali…) generally shouldn't be tintable — their palette *is*
the design.

---

## 5. Design-tool CSS just works

Illustrator, Figma and friends often export styling as a stylesheet plus classes
rather than presentation attributes:

```svg
<defs><style>.cls-1{fill:#f2cf6b}.cls-2{fill:#d12519}</style></defs>
<path d="…" class="cls-1"/>
```

**Export however your tool likes — there is no restriction.** This was verified in
a real browser across all three export paths: the `<style>` block is inlined
verbatim into the SVG and PDF, and `svg2pdf.js` resolves the class selectors
correctly. The PDF colour operators match the source hex exactly:

| class | hex | PDF operator |
|---|---|---|
| `.c1` | `#f2cf6b` | `0.95 0.81 0.42 rg` |
| `.c2` | `#d12519` | `0.82 0.15 0.1 rg` |
| `.c3` | `#1f7a3f` | `0.12 0.48 0.25 rg` |

Complex selectors (`path{}`, `g .cls{}`, `#id`, `@media`) are accepted too.

> An earlier version of this pipeline flattened class rules into inline styles and
> rejected anything but simple class selectors, assuming svg2pdf could not resolve
> CSS. That assumption was false; the flattener and the restriction were both
> removed. Do not reintroduce either without a failing case to point at.

---

## 6. Fonts: convert decorative text to paths

The engine draws the CTA text itself (via `data-text`) using a system font stack.
**Any `<text>` you leave inside the artwork is a liability** — remote fonts are
blocked, so it renders in whatever the viewer happens to have, and `svg2pdf`
handles it inconsistently in the PDF export.

If a frame needs lettering as part of the illustration, **convert it to outlines**
in your design tool before exporting.

---

## 7. Template

Copy this, replace the artwork, keep the attributes:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"
     data-frame-id="my-frame"
     data-frame-label="My Frame"
     data-frame-category="Birthday"
     data-qr="180 170 640 640"
     data-text="60 840 880 100 44 #333333 center">

  <!-- background -->
  <rect width="1000" height="1000" rx="44" fill="#fdfcff"/>

  <!-- artwork: top margin y < 170, bottom y > 810, sides x < 180 / x > 820 -->
  <!-- reuse a motif instead of repeating paths -->
  <defs>
    <g id="motif"><circle r="24" fill="#7c3aed"/></g>
  </defs>
  <use href="#motif" transform="translate(110 100)"/>
  <use href="#motif" transform="translate(890 100) scale(.8)"/>

</svg>
```

---

## 8. Gotchas

- **`data-frame-id` is database state.** It's stored in `QRDesign.frameStyle`.
  Renaming an id orphans every QR code already using it. Deleting a frame file
  does the same — those codes fall back to no frame. Retire, don't rename.
- **Category spelling creates the group.** `Christmas` and `christmas` would be
  two groups; the validator now rejects case-only collisions, but it can't catch
  `Xmas` vs `Christmas`. Pick a name per occasion and reuse it exactly.
- **Keep the filename and the id matching** (`halloween-pumpkins.svg` →
  `halloween-pumpkins`). Not enforced, but it makes the folder navigable.
- **Optimise before committing.** Run exports through SVGO or similar; designer
  tools emit a lot of dead metadata. These files are downloaded by every visitor
  who opens the picker.
- **Artwork ships as separate cached files**, not bundled JS — so a large library
  costs page-load nothing until the picker opens.

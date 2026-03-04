# 🔍 Full Website Audit — lwrcs.com

## 1. Architecture & Structure

### 🔴 No templating or component system
Every page (`index.html`, `music/index.html`, `visuals/index.html`) copy-pastes the **entire** nav, loader, mobile hamburger menu, and footer HTML. Adding a new page means duplicating ~55 lines of boilerplate and keeping them all in sync manually. This is the single biggest barrier to expansion.

**Recommendation:** Introduce a lightweight templating/component approach. Options:
- **Static site generator** (e.g. Eleventy/11ty — zero config, pure HTML/JS, perfect for GitHub Pages)
- **Web Components** (vanilla `<lwrcs-nav>`, `<lwrcs-loader>` custom elements)
- **JS-based include system** — load shared partials from a `_partials/` folder at build or runtime

### 🔴 Homepage immediately redirects away
`index.html` (line 10) has `window.location.href = "../visuals/index.html"` — the homepage just redirects to visuals. The HTML below it (a "Visuals / Music" split landing page) is **never seen**. The music page also redirects to visuals. This makes the root page useless and the music section unreachable.

### 🔴 No shared layout / base template
Each page re-declares its own `<head>`, fonts, stylesheets, and script tags independently. There's no canonical way to add a new page — you just copy an existing one and hope you get the right scripts.

---

## 2. CSS Issues

### 🟡 Single monolithic CSS file (1,941 lines)
`styles.css` contains **everything** — nav, loader, gallery, homepage, contact form, skills section, project cards, animations, responsive rules — all in one file with no logical separation or CSS custom property system beyond a few root vars.

**Problems:**
- Duplicate rule blocks: `#gallery-container` is defined at lines 1428 and 1767; `#gallery` at 1433 and 1772; `contact-section` at 533 and 801; `contact-wrap` at 539 and 805. These overwrite each other silently.
- Uses `orientation: landscape/portrait` media queries instead of standard `min-width`/`max-width` breakpoints. This causes bizarre behavior on tablets, split-screen, or unusual aspect ratios.
- Hardcoded colors throughout (e.g. `#fff`, `rgb(40, 40, 40)`, `#121212`) instead of using the CSS custom properties already defined in `:root`.
- `styles.dark.css` only overrides ~5 properties and is loaded with `rel="dark stylesheet"` which isn't a valid `rel` value — **dark mode doesn't actually work**.

### 🟡 Heavy font loading
**8 custom font files** loaded via `@font-face` plus a Google Font loaded via `@font-face src: url(...)` (line 56) which is **incorrect** — that `src:` should be a `<link>` tag, not an `@font-face` `src`. Most of these fonts don't appear to be used anywhere visible.

### 🟡 Negative z-index usage
Multiple elements use `z-index: -1` or `z-index: -100` (`.hero-vid`, `.hero-text`, `.intro`, `.caption` in portrait mode). This pushes elements behind `<body>` and can make them unclickable.

---

## 3. JavaScript Issues

### 🔴 `menu.js` loaded via `<script>` inside `<ul>` — twice per page
The menu is injected by `menu.js` using `window.onload`, but it's included as a `<script>` tag **inside** the `<ul>` elements (once for desktop nav, once for mobile dropdown) — on every page. This means:
- The script executes twice (loaded via two separate `<script>` tags)
- The second `window.onload` assignment **overwrites** the first — only one will fire
- If any other script uses `window.onload`, the menu breaks

### 🔴 Duplicate script includes in `visuals/index.html`
- `youtubeOverlay.js` is loaded **twice** (lines 116 and 120)
- `renderProjects.js` is loaded **twice** (lines 108 and 121)
- This causes `renderProjects(1)` to execute twice, duplicating all gallery items

### 🟡 Console.log spam in production
`renderProjects.js` has **20+ console.log statements** left in from debugging — every single project render, YouTube extraction, filter init, etc. gets logged to the console.

### 🟡 No module system
All JS files are plain `<script>` tags with global functions/variables. `projects` is a global array, `renderProjects` is a global function, `youtubePlayers` is a global array. No ES modules, no bundler, no import/export. This makes dependency order critical and fragile.

### 🟡 `vidPause.js` and `vidClickPlay.js` don't work with dynamically-rendered content
Both scripts query `.vid` elements on `DOMContentLoaded`, but videos are added **after** DOM ready by `renderProjects.js`. These scripts find zero elements and do nothing.

### 🟡 `vimeoOverlay.js` references `Vimeo.Player` but the Vimeo SDK is never loaded
The script will throw a `ReferenceError` for any page that includes it.

### 🟡 `hover.js` defines two global functions (`changeBorderColor`, `resetBorderColor`) that are never called anywhere
Dead code.

### 🟡 Tag filter system is commented out
The entire filter UI in `visuals/index.html` is wrapped in an HTML comment (lines 58–73), so `tagFilter.js` initializes but has no buttons to work with.

---

## 4. Project Data & Content Management

### 🟡 Project data hardcoded in a JS array
Adding a new project means editing `projects.js` directly — a single syntax error breaks the entire gallery. There's no validation, no schema, and the `visible` field is manually toggled per-item.

**Recommendation:** Move to a JSON or YAML data file, or use a headless CMS / markdown-based system. If sticking with JS, at minimum add a JSON schema or TypeScript types.

### 🟡 Inconsistent data
- Some projects have `name`, others don't (e.g. `DataBeasts Animation` has no `name`)
- Some have `links: {}` (empty object), some have no `links` property at all
- `visible: false` on most projects — only 7 of 19 are actually shown

---

## 5. Performance & SEO

### 🔴 No lazy loading for videos
All videos use `preload="none"` (good), but there's no Intersection Observer or lazy loading for the gallery — all video elements are created in the DOM immediately. With 19 projects this is manageable but won't scale.

### 🔴 Missing SEO fundamentals
- No `<meta name="description">` on any page
- No Open Graph tags (`og:title`, `og:image`, etc.)
- No `<html lang="en">`
- No favicon / `<link rel="icon">`
- No structured data
- Page titles are generic ("lwrcs | Visual & Audio")

### 🟡 Large media files served directly from the repo
The `img/portfolio/` folder contains `.mov` and `.mp4` files that are likely very large. GitHub Pages has a soft 1GB repo limit and 100MB file limit. No CDN, no compression, no adaptive bitrate.

### 🟡 No caching headers, no service worker
Static assets have no versioning or cache-busting strategy.

---

## 6. Accessibility

### 🔴 No alt text on most images
Gallery items, thumbnails, and icons lack meaningful alt text.

### 🔴 Hamburger menu has no ARIA attributes
The checkbox-based mobile menu toggle has no `aria-label`, `aria-expanded`, or `role` attributes.

### 🔴 No focus management or keyboard navigation
The gallery is mouse-hover dependent — no keyboard or screen reader path to content.

---

## 7. Expansion Blockers — Summary

| Blocker | Impact | Fix Difficulty |
|---|---|---|
| No templating — copy-paste pages | Can't add pages easily | Medium (adopt 11ty) |
| Homepage is a dead redirect | Wastes the landing page | Easy |
| Duplicate/broken script loading | Gallery renders twice, scripts collide | Easy |
| Monolithic CSS with duplicates | Hard to style new pages predictably | Medium |
| No module system for JS | Fragile dependency ordering | Medium |
| Project data in raw JS array | Error-prone content updates | Easy–Medium |
| Dark mode stylesheet doesn't load | Feature is broken | Easy |
| Media served from repo | Won't scale, slow loads | Medium (use CDN) |

---

## 8. Recommended Action Plan (prioritized)

1. **Fix the immediate bugs** — remove duplicate script tags, fix `menu.js` to use `addEventListener` instead of `window.onload`, remove the redirect from `index.html`
2. **Introduce a static site generator** (11ty) for shared layouts, partials, and data files — this is the single biggest unlock for expansion
3. **Split CSS** into logical files (or use CSS layers/partials via a build step): `base.css`, `nav.css`, `gallery.css`, `animations.css`
4. **Adopt ES modules** — convert scripts to `type="module"` with proper `import`/`export`
5. **Move project data to JSON** and render with a proper data pipeline
6. **Add lazy loading** (Intersection Observer) for the video gallery
7. **Fix dark mode** — either use `prefers-color-scheme` media query in CSS, or implement a proper toggle
8. **Add SEO basics** — meta tags, OG tags, favicon, `lang` attribute
9. **Add accessibility** — ARIA labels, alt text, keyboard navigation

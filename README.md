# lwrcs.com

Portfolio website for lwrcs — 3D animation, music video production, and visual design.

---

## Homepage: the CRT desk (`index.html` + `app/`)

The homepage is a first-person desk scene. On desktop, a WebGL room (`app/room.js`) is drawn
over a real DOM "screen" (`#screen`), with the monitor glass cut out and the DOM warped onto it
every frame with a `matrix3d` homography, so everything on the monitor is ordinary, clickable HTML.
On phones and small windows the screen is the whole page.

```
app/
├── main.js      ← modes, homography, cursor zones, frame loop
├── screen.js    ← the desktop UI inside the monitor (folders, files, viewer, terminal)
├── room.js      ← desk, CRT, keyboard, mouse and the items you can reach for
├── pov.js       ← first-person arms: mouse, keyboard, reach, press, grab
├── inner.js     ← the character living inside VIEW.EXE (a room behind the glass)
├── rig.js       ← procedural rig control (IK, hand frames, finger poses)
├── springs.js   ← critically damped springs: things can lag, never jump
├── halftone.js  ← web port of the "Pixel Shaded.005" Blender material, plus blue mode
└── dev/         ← tuning pages (rest pose, inner view, clips)
assets/models/lifetime.glb         ← character and his lifetime_* clips, exported by tools/export_character.py
assets/models/lifetime-moves.json  ← Mixamo idle/walk/nod/shake retargeted by tools/retarget_mixamo.mjs;
                                     only used when the model carries no clips
vendor/three/               ← three.js r170 (MIT)
```

Re-export the character after editing the .blend (Blender 4.5+ Python module):
`python tools/export_character.py`, then `npx gltf-transform weld` and `quantize` on the result.
The export evaluates every action named `lifetime_*` on the full rig (IK included) and bakes it
into the GLB; the site plays `lifetime_idle`, `lifetime_walk` (in place: the site moves him and
matches his speed to the stride), `lifetime_nod` and `lifetime_shake`. A looping action (Cyclic
Animation on, manual frame range) plays its range and wraps to the first frame, so its last key sits
one frame past the range as a copy of the first; its curves carry Cycles modifiers.

To edit the moves in Blender, `python tools/moves_to_blender.py <character.blend> assets/models/lifetime.glb
assets/models/lifetime-moves.json lifetime_moves_for_blender.py` writes a script that, run in Blender's
Scripting tab, keys those four actions onto the rig's own controls (IK targets, poles, spine).

Dev panel: open the page with `#dev` (or `?dev`), or type `dev` at the terminal. It steps the
character's pose like hand-drawn animation (on 1s to 6s of a 24 or 30 fps clock) and sets how far in
front of him the point he looks at sits when the cursor is off the glass. Settings stay in that browser.

Blue mode (on by default) draws everything in black and #0000FF only. Toggle it with the first
knob on the monitor's chin, the `color` terminal command, or `?blue=0`.

## Project Structure

```
lwrcs.github.io/
├── index.html              ← Homepage (CRT desk, see above)
├── styles.css              ← Main CSS entry point (imports partials)
├── CNAME                   ← Custom domain config
│
├── css/                    ← CSS partials (imported by styles.css)
│   ├── base.css            ← Variables, fonts, reset, dark mode
│   ├── animations.css      ← All keyframes, loader, back-to-top
│   ├── nav.css             ← Desktop nav, mobile hamburger, responsive
│   ├── gallery.css         ← Gallery grid, captions, icons, filters
│   └── homepage.css        ← Landing page split layout
│
├── js/                     ← JavaScript
│   ├── menu.js             ← Shared nav injection (ES module)
│   ├── loader.js           ← Page loader animation
│   ├── projects.js         ← Fetches project data from JSON
│   ├── renderProjects.js   ← Renders projects into gallery DOM
│   ├── lazyLoad.js         ← Intersection Observer video lazy loading
│   ├── tagFilter.js        ← Gallery tag filter buttons
│   ├── vidClickPlay.js     ← Click-to-play for video containers
│   ├── vidPause.js         ← Pauses other videos when one plays
│   ├── click.js            ← Brightness control on play/pause
│   ├── b2t.js              ← Back-to-top button visibility
│   ├── youtubeOverlay.js   ← YouTube IFrame API integration
│   └── vimeoOverlay.js     ← Vimeo player overlay integration
│
├── data/
│   └── projects.json       ← All project data (edit this to add projects)
│
├── fonts/                  ← Custom font files
├── img/                    ← Images, thumbnails, icons, portfolio videos
│
├── visuals/                ← Visuals page
│   ├── index.html
│   └── CNAME
│
└── music/                  ← Music page
    ├── index.html
    └── CNAME
```

---

## Creating a New Page

### 1. Create the folder and HTML file

Create a new folder at the root with an `index.html` inside it. For example, to create an "About" page:

```
about/
└── index.html
```

### 2. Use this starter template

Copy this into your new `index.html`. It includes the loader, desktop nav, mobile hamburger menu, back-to-top button, and all required scripts/styles:

```html
<!DOCTYPE html>
<html lang="en">

<head>
    <base href="../">
    <title>lwrcs | Your Page Title</title>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="lwrcs — Brief description of this page." />
    <meta property="og:title" content="lwrcs | Your Page Title" />
    <meta property="og:description" content="Brief description of this page." />
    <meta property="og:type" content="website" />
    <link rel="stylesheet" href="styles.css" />
</head>

<body>
    <!-- Loader Animation -->
    <div id="loader-wrapper" role="status" aria-label="Loading">
        <div class="blob">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <div class="content">
                <h2>Loading...</h2>
            </div>
        </div>
    </div>

    <!-- Navigation Desktop -->
    <div class="nav-wrap">
        <header>
            <h1 class="logo"><a href="/">lwrcs</a></h1>
            <nav aria-label="Main navigation">
                <ul></ul>
            </nav>
            <div class="nav-gradient"></div>
        </header>
    </div>

    <!-- Navigation Mobile -->
    <input type="checkbox" class="dropdown-toggle" id="dropdown-menu" aria-hidden="true" />
    <label for="dropdown-menu" class="dropdown-label" aria-label="Toggle navigation menu">
        <div class="hamburger">
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
        </div>
    </label>
    <ul class="dropdown-menu" role="navigation" aria-label="Mobile navigation"></ul>

    <!-- ======================== -->
    <!-- YOUR PAGE CONTENT HERE  -->
    <!-- ======================== -->

    <!-- Back to Top Button -->
    <button id="back-to-top" class="b2t-image" aria-label="Back to top">
        <img src="img/BacktoTop.png" alt="Back to Top" />
    </button>

    <!-- JavaScript -->
    <script type="module" src="js/menu.js"></script>
    <script src="js/b2t.js"></script>
    <script src="js/loader.js"></script>
</body>

</html>
```

### 3. Key things to customize

| Item | What to change |
|---|---|
| `<title>` | Page title shown in browser tab |
| `<meta name="description">` | SEO description for search engines |
| `<meta property="og:title">` | Title shown when shared on social media |
| `<meta property="og:description">` | Description shown when shared on social media |
| Content area | Replace the `YOUR PAGE CONTENT HERE` comment with your HTML |

### 4. Add the page to the nav menu

Open `js/menu.js` and add a new `<li>` entry:

```js
const menuHTML = `
    <li><a href="/visuals/">Visuals</a></li>
    <li><a href="/about/">About</a></li>
`;
```

This automatically updates the nav on **every page** — both desktop and mobile.

### 5. Important notes

- **`<base href="../">`** is required for subpages so that `styles.css`, `js/`, `img/`, and `data/` paths resolve correctly back to the root.
- **Do NOT add `<base href>`** to `index.html` at the root — it's only for pages inside subfolders.
- The nav `<ul>` elements should be **empty** in the HTML. `menu.js` fills them in automatically.
- All shared styles come through `styles.css` which imports the CSS partials. No need to add extra `<link>` tags unless you have page-specific styles.

---

## Adding a New Project to the Gallery

Edit `data/projects.json` and add a new object to the array. No JavaScript changes needed.

### Project schema

```json
{
    "title": "Project Title",
    "name": "Client or Artist Name",
    "tags": ["3d", "anim", "promo"],
    "poster": "img/thumbnail/your-thumbnail.jpg",
    "src": "img/portfolio/your-video.mp4",
    "roles": "What you did on this project",
    "links": {
        "youtube": "https://...",
        "spotify": "https://...",
        "soundcloud": "https://...",
        "appleMusic": "https://...",
        "tidal": "https://...",
        "deezer": "https://...",
        "vimeo": "https://..."
    },
    "visible": true
}
```

### Field reference

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | yes | Project title displayed in caption |
| `name` | string | yes | Client/artist name (use `""` if none) |
| `tags` | string[] | yes | Filter tags — must match button `data-tag` values |
| `poster` | string | yes | Path to thumbnail image |
| `src` | string | yes | Path to video file |
| `roles` | string | yes | Role description shown in caption |
| `links` | object | yes | Streaming/platform links (use `{}` if none) |
| `visible` | boolean | yes | `true` to show in gallery, `false` to hide |

### Available tags

These match the filter buttons on the Visuals page:

| Tag | Button label |
|---|---|
| `3d` | 3D Animation |
| `mv` | Music Videos |
| `promo` | Promotional |
| `anim` | Animation |
| `comm` | Commission |
| `personal` | Personal |
| `logo` | Logo Animation |

### Available link platforms

Each key in `links` maps to an icon in `img/icon/`. Available platforms:

`youtube`, `spotify`, `soundcloud`, `appleMusic`, `tidal`, `deezer`, `vimeo`

---

## Adding Page-Specific CSS

If a new page needs its own styles, create a new file in `css/` (e.g. `css/about.css`) and add it to `styles.css`:

```css
@import url("css/base.css");
@import url("css/animations.css");
@import url("css/nav.css");
@import url("css/gallery.css");
@import url("css/homepage.css");
@import url("css/about.css");       /* ← new */
```

Or, if the styles are only needed on one page, add a `<style>` block in that page's `<head>` after the `<link>` to `styles.css`.

---

## Dark Mode

Dark mode is automatic via `@media (prefers-color-scheme: dark)` in `css/base.css`. It follows the user's OS/browser setting. No toggle button is needed — but one could be added later if desired.

---

## CSS Architecture

`styles.css` is a thin entry point that imports 5 partials:

| File | What it contains |
|---|---|
| `css/base.css` | CSS variables, font faces, reset, dark mode overrides |
| `css/animations.css` | All `@keyframes`, loader blob, back-to-top button |
| `css/nav.css` | Desktop nav bar, mobile hamburger menu, gradient |
| `css/gallery.css` | Video gallery grid, captions, streaming icons, filter buttons |
| `css/homepage.css` | Landing page split layout, footer |

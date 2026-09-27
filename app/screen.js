// The monitor's desktop: folders, files, a preview pane, a media viewer and a tiny terminal.
// The same DOM is the CRT screen on desktop and the whole page on phones.

export const SCREEN_W = 960, SCREEN_H = 720;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (s) => s.toLowerCase().replace(/["'\[\]!]/g, '').replace(/music video|animation|visual(izer)?/g, '').trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'untitled';
const ytId = (url) => (String(url || '').match(/(?:v=|youtu\.be\/)([\w-]{11})/) || [])[1];
const extOf = (src) => (src.split('.').pop() || 'mp4').toLowerCase();

const LINKS = {
  instagram: 'https://www.instagram.com/lwrcs/',
  linkedin: 'https://www.linkedin.com/in/harrison-kalman-819b81295/',
  // From the previous version of the site; confirm before launch.
  email: 'work@lwrcs.com',
};

const BIO = "I'm lwrcs, an animator, director and musician. I make 3D animation and direct music videos for artists, from modeling and rigging to cinematography, editing and color. When I'm not making visuals for other people, I'm making my own music.";
const SERVICES = [
  ['3D animation', 'Character modeling, rigging, animation and rendering for music videos and commercial work.'],
  ['Music videos', 'Full creative direction: directing, cinematography, editing and color.'],
  ['Visual design', 'Cover art, brand identity, motion graphics and everything in between.'],
];

export class ScreenUI {
  constructor(root, { base = '' } = {}) {
    this.root = root;
    this.base = base;
    this.$ = (s) => root.querySelector(s);
    this.folders = this.$('#folders');
    this.files = this.$('#files');
    this.info = this.$('#info');
    this.preview = this.$('#preview');
    this.nav = this.$('#nav');
    this.viewer = this.$('#viewer');
    this.viewTitle = this.$('#view-title');
    this.termIn = this.$('#term-in');
    this.termOut = this.$('#term-out');
    this.tree = { home: [], projects: [], music: [], about: [], contact: [] };
    this.cwd = 'home';
    this.history = ['/'];
    this.onChange = () => {};
    this.typed = '';

    this.folders.addEventListener('click', (e) => { const li = e.target.closest('[data-dir]'); if (li) this.cd(li.dataset.dir); });
    this.nav.addEventListener('click', (e) => { const li = e.target.closest('[data-dir]'); if (li) this.cd(li.dataset.dir); });
    this.files.addEventListener('click', (e) => {
      const li = e.target.closest('[data-i]');
      if (li && !e.target.closest('a')) this.open(this.tree[this.cwd][+li.dataset.i]);
    });
    this.files.addEventListener('pointerover', (e) => { const li = e.target.closest('[data-i]'); if (li) this.select(+li.dataset.i); });
    this.$('#view-close').addEventListener('click', () => this.closeViewer());
  }

  async load(url) {
    let projects = [];
    try { projects = await (await fetch(url)).json(); } catch { /* the rest of the desktop still works */ }
    const shown = projects.filter((p) => p.visible !== false && !p.tags?.includes('mymusic'));
    const n = (i) => String(i + 1).padStart(3, '0');
    const asFile = (p, i, prefix = true) => ({
      name: (prefix ? n(i) + '_' : '') + slug(p.title) + '.' + (p.src ? extOf(p.src) : 'mp4'),
      kind: 'video', title: p.title.replace(/"/g, ''), client: p.name, roles: p.roles, text: p.description,
      yt: ytId(p.links?.youtube), src: p.src, poster: p.poster,
      thumb: p.poster || (ytId(p.links?.youtube) ? `https://i.ytimg.com/vi/${ytId(p.links.youtube)}/mqdefault.jpg` : ''),
    });
    this.tree.projects = shown.map((p, i) => asFile(p, i));
    const reels = shown.filter((p) => p.name === 'lwrcs');
    this.tree.home = [
      { name: 'readme.txt', kind: 'text', title: 'readme', text: 'hi. this is lwrcs.\n\nanimator, director, musician.\n\nmove your mouse off the monitor. the things on the desk do things.\n\ntry typing too.' },
      ...reels.map((p) => ({ ...asFile(p, 0, false), name: slug(p.title) + '.mp4' })),
    ];
    const music = projects.filter((p) => p.tags?.includes('mymusic'));
    this.tree.music = music.map((p) => {
      const L = p.links || {};
      const links = [];
      for (const u of Object.values(L)) {
        const host = (u.match(/\/\/(?:www\.|open\.|music\.)?([^./]+)/) || [])[1] || 'link';
        links.push([host, u]);
      }
      const name = slug(p.title).replace(/_$/, '');
      return {
        name: name + '.wav', kind: 'music', title: p.title.replace(/"/g, '').replace(/ \[visualizer\]| visual$/i, ''),
        client: 'lwrcs', roles: 'Music + visual', yt: ytId(L.youtube), src: p.src, poster: p.poster, thumb: p.poster, links,
      };
    });
    this.tree.about = [
      { name: 'bio.txt', kind: 'text', title: 'bio', text: BIO },
      { name: 'services.txt', kind: 'text', title: 'services', text: SERVICES.map(([a, b]) => '* ' + a + '\n  ' + b).join('\n\n') },
      { name: 'portrait.bmp', kind: 'image', title: 'portrait', src: 'img/portfolio/lwrcs_portrait.jpeg', thumb: 'img/portfolio/lwrcs_portrait.jpeg' },
    ];
    this.tree.contact = [
      { name: 'email.txt', kind: 'link', title: 'email', text: LINKS.email, href: 'mailto:' + LINKS.email },
      { name: 'instagram.lnk', kind: 'link', title: 'instagram', text: '@lwrcs', href: LINKS.instagram },
      { name: 'linkedin.lnk', kind: 'link', title: 'linkedin', text: 'Harrison Kalman', href: LINKS.linkedin },
    ];
    this.renderFolders();
    this.cd('home', true);
  }

  renderFolders() {
    const dirs = ['home', 'projects', 'music', 'about', 'contact'];
    this.folders.innerHTML = dirs.map((d) => `<li data-dir="${d}" tabindex="0"><i class="ico dir"></i>${d}</li>`).join('');
    this.nav.innerHTML = ['/', ...dirs.map((d) => '/' + d)].map((p) => `<li data-dir="${p === '/' ? 'home' : p.slice(1)}">${p}</li>`).join('');
  }

  cd(dir, quiet) {
    if (!this.tree[dir]) return;
    this.cwd = dir;
    for (const li of this.folders.children) li.classList.toggle('on', li.dataset.dir === dir);
    for (const li of this.nav.children) li.classList.toggle('on', li.textContent === '/' + dir);
    this.$('#files-title').textContent = 'FILES:/' + (dir === 'home' ? '' : dir);
    // link files are real links, so they open even where scripted popups are blocked
    this.files.innerHTML = this.tree[dir].map((f, i) => f.kind === 'link'
      ? `<li data-i="${i}"><a href="${esc(f.href)}" target="_blank" rel="noopener"><i class="ico link"></i>${esc(f.name)}</a></li>`
      : `<li data-i="${i}" tabindex="0"><i class="ico ${f.kind}"></i>${esc(f.name)}</li>`).join('') || '<li class="dim">(empty)</li>';
    this.files.scrollTop = 0;
    this.showFolderInfo();
    if (!quiet) this.onChange({ type: 'cd', dir });
  }

  showFolderInfo() {
    const d = this.cwd;
    const lines = d === 'home'
      ? [['user', 'guest'], ['location', 'unknown'], ['status', 'online']]
      : [['dir', '/' + d], ['files', String(this.tree[d].length)], ['status', 'online']];
    this.setInfo(lines);
    this.setPreview(null);
  }

  setInfo(lines) {
    this.info.innerHTML = lines.map(([k, v], i) => `<p class="k">&gt; ${esc(k)}</p><p class="v">&gt; ${esc(v)}${i === lines.length - 1 ? '<b class="caret">_</b>' : ''}</p>`).join('');
  }

  select(i) {
    const f = this.tree[this.cwd][i];
    if (!f || f === this.sel) return;
    this.sel = f;
    for (const li of this.files.children) li.classList.toggle('on', +li.dataset.i === i);
    const lines = [['file', f.name]];
    if (f.client) lines.push(['by', f.client]);
    if (f.roles) lines.push(['role', f.roles]);
    if (f.text && f.kind !== 'text') lines.push([f.kind === 'link' ? 'open' : 'about', f.text]);
    if (f.kind === 'text') lines.push(['size', f.text.length + ' bytes']);
    this.setInfo(lines);
    this.setPreview(f);
  }

  setPreview(f) {
    const src = f?.thumb;
    if (!src) { this.preview.innerHTML = '<img class="tpose" alt="" src="assets/img/preview.png">'; return; }
    const img = new Image();
    img.alt = ''; img.className = 'dither';
    img.onerror = () => { if (this.sel === f) this.preview.innerHTML = `<p class="dim">${esc(f.name)}</p>`; };
    img.src = src;
    this.preview.replaceChildren(img);
  }

  open(f) {
    if (!f) return;
    this.select(this.tree[this.cwd].indexOf(f));
    if (f.kind === 'link') { this.files.querySelector(`[data-i="${this.tree[this.cwd].indexOf(f)}"] a`)?.click(); return; }
    let body = '';
    if (f.kind === 'video' || f.kind === 'music') {
      if (f.yt) body = `<iframe src="https://www.youtube-nocookie.com/embed/${f.yt}?autoplay=1&rel=0&modestbranding=1" title="${esc(f.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
      else if (f.src) body = `<video src="${esc(encodeURI(f.src))}" ${f.poster ? `poster="${esc(encodeURI(f.poster))}"` : ''} controls autoplay playsinline></video>`;
      const links = f.kind === 'music' ? f.links : f.yt ? [['youtube', 'https://www.youtube.com/watch?v=' + f.yt]] : [];
      body += `<ul class="links">${links.map(([h, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(h)} &#8599;</a></li>`).join('')}</ul>`;
      if (f.text) body += `<p class="blurb">${esc(f.text)}</p>`;
    } else if (f.kind === 'image') {
      body = `<img class="dither big" alt="${esc(f.title)}" src="${esc(f.src)}">`;
    } else {
      body = `<pre>${esc(f.text)}</pre>`;
    }
    this.viewer.innerHTML = `<div class="viewer-body k-${f.kind}">${body}</div>`;
    this.viewTitle.textContent = 'VIEW.EXE - ' + f.name;
    this.root.classList.add('viewing');
    this.onChange({ type: 'open', file: f });
  }

  closeViewer() {
    if (!this.root.classList.contains('viewing')) return;
    this.root.classList.remove('viewing');
    this.viewTitle.textContent = 'VIEW.EXE';
    // let the fade finish before the iframe (and its audio) goes away
    setTimeout(() => { if (!this.root.classList.contains('viewing')) this.viewer.innerHTML = ''; }, 350);
    this.onChange({ type: 'close' });
  }

  // ---- terminal: typing on a real keyboard lands here ----
  key(e) {
    if (e.key === 'Enter') { this.run(this.typed.trim()); this.typed = ''; }
    else if (e.key === 'Backspace') this.typed = this.typed.slice(0, -1);
    else if (e.key === 'Escape') { this.typed = ''; this.closeViewer(); }
    else if (e.key.length === 1 && this.typed.length < 24) this.typed += e.key;
    else return false;
    this.termIn.textContent = this.typed;
    return true;
  }

  print(text) {
    this.termOut.textContent = text;
    this.termOut.classList.toggle('show', !!text);
    clearTimeout(this._pt);
    if (text) this._pt = setTimeout(() => this.termOut.classList.remove('show'), 4000);
  }

  run(cmd) {
    const [c, ...rest] = cmd.toLowerCase().split(/\s+/);
    const arg = rest.join(' ');
    if (!c) return this.print('');
    if (this.tree[c]) { this.cd(c); return this.print('ok'); }
    if (c === 'cd' && this.tree[arg.replace(/^\//, '')]) { this.cd(arg.replace(/^\//, '')); return this.print('ok'); }
    if (c === 'cd' && (arg === '/' || arg === '..' || !arg)) { this.cd('home'); return this.print('ok'); }
    if (c === 'ls' || c === 'dir') return this.print(this.tree[this.cwd].map((f) => f.name).join('  '));
    if (c === 'help' || c === '?') return this.print('home projects music about contact  ls  open <n>  color  cls');
    if (c === 'cls' || c === 'clear') { this.closeViewer(); return this.print(''); }
    if (c === 'open' || c === 'run') {
      const list = this.tree[this.cwd];
      const f = list[+arg - 1] || list.find((x) => x.name.startsWith(arg));
      if (f) { this.open(f); return this.print('ok'); }
      return this.print('file not found');
    }
    if (c === 'whoami') return this.print('guest');
    if (c === 'color' || c === 'colour' || c === 'blue') { this.onChange({ type: 'color' }); return this.print(document.documentElement.classList.contains('blue') ? 'blue only' : 'colour'); }
    if (c === 'lifetime') { this.cd('music'); this.open(this.tree.music[0]); return this.print('♪'); }
    this.print(`'${cmd}' is not recognized. try help`);
  }

  // ---- boot / power ----
  bootLine(text) {
    const b = this.$('#boot');
    const p = document.createElement('p'); p.textContent = text; b.appendChild(p);
    return p;
  }
  booted() { this.root.classList.add('ready'); }
  power(on) {
    this.root.classList.toggle('off', !on);
    if (!on) this.closeViewer();
  }
}

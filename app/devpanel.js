// Development controls for the character in VIEW.EXE. Hidden unless the page is opened with #dev
// (or ?dev), or `dev` is typed at the terminal. Settings are kept in this browser only.
const KEY = 'lwrcs-dev';
const DEFAULTS = { step: 0, fps: 24, look: 0.6 };

export function devPanel(inner) {
  let s = { ...DEFAULTS };
  try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}

  const el = document.createElement('aside');
  el.id = 'devpanel';
  el.hidden = true;
  el.innerHTML = `
    <header>DEV <button type="button" data-close aria-label="Close">x</button></header>
    <label>pose <output data-step></output>
      <input type="range" min="0" max="6" step="1" data-k="step"></label>
    <label>clock <select data-k="fps"><option value="24">24 fps</option><option value="30">30 fps</option></select></label>
    <label>look <output data-look></output>
      <input type="range" min="0" max="1.6" step="0.05" data-k="look"></label>
    <button type="button" data-reset>reset</button>`;
  document.body.append(el);

  const apply = () => {
    inner.step = s.step; inner.stepFps = s.fps; inner.lookAhead = s.look;
    el.querySelector('[data-step]').textContent = s.step ? `on ${s.step}s, ${+(s.fps / s.step).toFixed(1)}/s` : 'every frame';
    el.querySelector('[data-look]').textContent = `${s.look.toFixed(2)} in front`;
    for (const i of el.querySelectorAll('[data-k]')) i.value = s[i.dataset.k];
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  };
  el.addEventListener('input', (e) => {
    const k = e.target.dataset?.k;
    if (k) { s[k] = +e.target.value; apply(); }
  });
  el.querySelector('[data-reset]').addEventListener('click', () => { s = { ...DEFAULTS }; apply(); });
  el.querySelector('[data-close]').addEventListener('click', () => { el.hidden = true; });
  apply();

  const q = new URLSearchParams(location.search);
  if (location.hash === '#dev' || q.has('dev')) el.hidden = false;
  addEventListener('hashchange', () => { if (location.hash === '#dev') el.hidden = false; });
  return { toggle() { el.hidden = !el.hidden; return !el.hidden; } };
}

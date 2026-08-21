import { api, formatTime, formatDateLong, formatWeekRange, visDatoPåNorsk, icon } from '/shared/api.js';

const root = document.getElementById('root');
let user = null;

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
// Escaper tekst før den settes inn som HTML (tolket menytekst kommer fra OpenAI).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const go = (hash) => { location.hash = hash; };
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = el(`<div class="toast" style="position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#1a2230;color:#fff;padding:12px 18px;border-radius:12px;font-weight:600;z-index:60">${msg}</div>`);
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
const initials = (n) => n.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Lager brukernavn "fornavn.etternavn" fra fullt navn.
// Normaliserer norske tegn (æ→ae, ø→oe, å→aa) og fjerner aksenter.
function slugName(s) {
  // Norske og andre bokstaver beholdes (Bjørn Åsen -> bjørn.åsen). NFC gjør at
  // «å» alltid lagres som ett tegn, slik at innlogging matcher. Speiler
  // normalizeUsername/slugName på serveren.
  return String(s).trim().toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '');
}
function makeUsername(fullName) {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = slugName(parts[0]);
  const last = parts.length > 1 ? slugName(parts[parts.length - 1]) : '';
  return last ? `${first}.${last}` : first;
}
const ymd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const todayStr = () => ymd(new Date());

// Klasser: VGXY der X = 1/2/3 og Y = A/B.
const CLASSES = ['VG1A', 'VG1B', 'VG2A', 'VG2B', 'VG3A', 'VG3B'];

// Hovedinstrument, brukt til gruppering i øvekonkurransen. Endre denne listen
// hvis skolen har andre instrumenter – den er fasit både i elevskjemaet og når
// OpenAI tolker en opplastet elevliste.
const INSTRUMENTS = [
  'Sang',
  'Piano',
  'Orgel',
  'Gitar',
  'Bassgitar',
  'Trommer/slagverk',
  'Fiolin',
  'Bratsj',
  'Cello',
  'Kontrabass',
  'Fløyte',
  'Klarinett',
  'Obo',
  'Fagott',
  'Saksofon',
  'Trompet',
  'Trombone',
  'Horn',
  'Tuba',
  'Harpe',
];

// Skolens internat. Endre denne listen hvis navn skal legges til/fjernes.
const DORMS = [
  'Treet 1',
  'Treet 2',
  'Svingen nede',
  'Svingen oppe',
  'Nedre Vestheim',
  'Øvre Vestheim',
  'Granhaug',
  'Nedre Austheim',
  'Øvre Austheim',
];

// SVG-ikoner spesifikke for admin
const nav = {
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87"/></svg>',
  flame: icon.flame,
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20 20v.01M17 20h.01M20 17h.01"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M9 12l2 2 4-4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>',
  food: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2"/><path d="M5 2v20"/><path d="M17 2v20"/><path d="M17 8c0-3 1-6 3-6v20"/></svg>',
  guest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 19v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="7.5" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  broom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 3 12.75 11.25"/><path d="M10 8.5 15.5 14 9 20.5 3.5 15Z"/><path d="M6.75 11.75 12.25 17.25"/></svg>',
  timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13.5" r="8"/><path d="M12 13.5V9"/><path d="M9.5 2h5"/><path d="m18.5 6.5 1.5-1.5"/></svg>',
};

init();
async function init() {
  try { const d = await api('/api/auth/me'); user = d.user; if (user.role !== 'admin') throw 0; }
  catch { user = null; }
  window.addEventListener('hashchange', render);
  render();
}

function render() {
  if (!user) return renderLogin();
  if (user.mustChangePassword) return renderChangePassword();
  const route = (location.hash || '#/').slice(2);
  if (route.startsWith('storskjerm')) return renderStorskjerm();
  if (route.startsWith('brukere')) return page('brukere', renderBrukere);
  if (route.startsWith('administratorer')) return page('administratorer', renderAdmins);
  if (route.startsWith('brannliste')) return page('brannliste', renderBrannliste);
  if (route.startsWith('gjester')) return page('gjester', renderGuests);
  if (route.startsWith('andakt')) return page('andakt', renderAndakt);
  if (route.startsWith('middag')) return page('middag', renderKitchen);
  if (route.startsWith('internat')) return page('internat', renderInternat);
  if (route.startsWith('ovekonkurranse')) return page('ovekonkurranse', renderPractice);
  if (route.startsWith('varsler')) return page('varsler', renderVarsler);
  if (route.startsWith('innstillinger')) return page('innstillinger', renderSettings);
  return page('dashboard', renderDashboard);
}

// ── 2.1 Innlogging ───────────────────────────────────────────
function renderLogin() {
  root.innerHTML = '';
  const wrap = el(`
    <div style="display:flex;min-height:100dvh">
      <div style="width:46%;background:var(--navy-dark);display:none;flex-direction:column;justify-content:space-between;padding:44px;color:#fff" class="loginside">
        <div style="display:flex;align-items:center;gap:12px"><div style="width:40px;height:40px;border-radius:12px;background:var(--navy-2);display:flex;align-items:center;justify-content:center"><div style="width:22px;height:22px">${icon.home}</div></div><div style="font-size:16px;font-weight:700">Kongshaug Elevapp</div></div>
        <div style="color:#9fb0c6;font-size:15px;line-height:1.6;max-width:340px">Brannliste og andaktsregistrering for internatet. Kun for ansatte.</div>
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:32px">
        <div style="max-width:360px;width:100%">
          <div style="font-size:30px;font-weight:800;letter-spacing:-.02em">Logg inn</div>
          <p style="font-size:15px;color:var(--muted);margin:8px 0 28px">Administrasjon · ansatte</p>
          <div id="feideBox"></div>
          <form id="f">
            <label class="field-label">Brukernavn</label>
            <input class="field" name="username" autocapitalize="none" spellcheck="false" required />
            <label class="field-label" style="margin-top:16px">Passord</label>
            <input class="field" name="password" type="password" required />
            <p id="err" style="color:var(--red-ink);font-size:14px;font-weight:600;margin:14px 0 0;display:none"></p>
            <button class="btn btn-primary" style="width:100%;height:54px;margin-top:24px;font-size:16px">Logg inn</button>
          </form>
          <p style="font-size:13px;color:var(--muted-2);text-align:center;margin:18px 0 0">Problemer med innlogging? Kontakt IT-ansvarlig.</p>
          <p style="font-size:12.5px;text-align:center;margin:10px 0 0"><a href="/personvern/" target="_blank" style="color:var(--muted-2);font-weight:600">Personvernerklæring</a></p>
        </div>
      </div>
    </div>`);
  if (window.innerWidth > 820) wrap.querySelector('.loginside').style.display = 'flex';
  root.appendChild(wrap);
  const f = wrap.querySelector('#f'); const err = wrap.querySelector('#err');

  const feideErr = new URLSearchParams(location.search).get('feide_error');
  if (feideErr) { err.textContent = feideErr; err.style.display = 'block'; history.replaceState(null, '', '/admin/'); }
  api('/api/config').then((cfg) => {
    if (!cfg.feide) return;
    wrap.querySelector('#feideBox').innerHTML = `
      <a href="/api/auth/feide/login" class="btn" style="width:100%;height:52px;font-size:16px;background:#1a1a2e;color:#fff;text-decoration:none;margin-bottom:6px">Logg inn med Feide</a>
      <div style="display:flex;align-items:center;gap:12px;color:var(--muted-2);font-size:13px;margin:14px 0 18px"><div style="flex:1;height:1px;background:var(--line-2)"></div>eller<div style="flex:1;height:1px;background:var(--line-2)"></div></div>`;
  }).catch(() => {});
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); err.style.display = 'none';
    const btn = f.querySelector('button'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try {
      const d = await api('/api/auth/login', { method: 'POST', body: { username: f.username.value, password: f.password.value } });
      if (d.user.role !== 'admin') throw new Error('Denne kontoen har ikke administrator-tilgang');
      user = d.user; go('/'); render();
    } catch (ex) { err.textContent = ex.message; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Logg inn'; }
  });
}

// ── Påtvunget passordbytte ved første innlogging ─────────────
function renderChangePassword() {
  root.innerHTML = '';
  const wrap = el(`
    <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:32px">
      <div style="max-width:400px;width:100%">
        <div style="width:56px;height:56px;border-radius:16px;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:18px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>
        <div style="font-size:28px;font-weight:800;letter-spacing:-.02em">Velg ditt eget passord</div>
        <p style="font-size:15px;color:var(--muted);line-height:1.5;margin:10px 0 24px">Du logget inn med et midlertidig passord. Velg et nytt passord som bare du kjenner.</p>
        <form id="cpf">
          <label class="field-label">Nytt passord</label>
          <input class="field" name="p1" type="password" autocomplete="new-password" required />
          <label class="field-label" style="margin-top:16px">Gjenta nytt passord</label>
          <input class="field" name="p2" type="password" autocomplete="new-password" required />
          <p style="font-size:13px;color:var(--muted-2);margin:10px 2px 0">Minst 8 tegn.</p>
          <p id="err" style="color:var(--red-ink);font-size:14px;font-weight:600;margin:14px 0 0;display:none"></p>
          <button class="btn btn-primary" style="width:100%;height:54px;font-size:16px;margin-top:22px">Lagre og fortsett</button>
        </form>
      </div>
    </div>`);
  root.appendChild(wrap);
  const f = wrap.querySelector('#cpf'); const err = wrap.querySelector('#err');
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); err.style.display = 'none';
    if (f.p1.value !== f.p2.value) { err.textContent = 'Passordene er ikke like'; err.style.display = 'block'; return; }
    if (f.p1.value.length < 8) { err.textContent = 'Passordet må ha minst 8 tegn'; err.style.display = 'block'; return; }
    const btn = f.querySelector('button'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { newPassword: f.p1.value } });
      user.mustChangePassword = false; go('/'); render();
    } catch (ex) { err.textContent = ex.message; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Lagre og fortsett'; }
  });
}

// ── Layout med sidemeny ──────────────────────────────────────
function page(active, renderMain) {
  const items = [
    ['dashboard', 'Dashboard', nav.dash, '/'],
    ['brukere', 'Elever', nav.users, '/brukere'],
    ['administratorer', 'Administratorer', nav.shield, '/administratorer'],
    ['brannliste', 'Brannliste', nav.flame, '/brannliste'],
    ['gjester', 'Gjester', nav.guest, '/gjester'],
    ['andakt', 'Andakt / QR', nav.qr, '/andakt'],
    ['middag', 'Kjøkken', nav.food, '/middag'],
    ['internat', 'Internat', nav.broom, '/internat'],
    ['ovekonkurranse', 'Øvekonkurranse', nav.timer, '/ovekonkurranse'],
    ['varsler', 'Varsler', nav.bell, '/varsler'],
    ['innstillinger', 'Innstillinger', nav.gear, '/innstillinger'],
  ];
  root.innerHTML = '';
  const layout = el(`
    <div class="layout">
      <aside class="side">
        <div class="brand"><div style="width:38px;height:38px;border-radius:11px;background:var(--navy-2);color:#fff;display:flex;align-items:center;justify-content:center">${icon.home}</div>
          <div><div style="font-size:15px;font-weight:800;color:#fff">Kongshaug</div><div style="font-size:12px">Elevapp</div></div></div>
        <nav style="display:flex;flex-direction:column;gap:4px">
          ${items.map(([id, label, ic, hash]) => `<a class="navitem ${active === id ? 'active' : ''}" href="#${hash}">${ic}${label}${id === 'gjester' ? '<span id="gjesterBadge" style="display:none;margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--red);color:#fff;font-size:12px;font-weight:800;align-items:center;justify-content:center"></span>' : ''}</a>`).join('')}
        </nav>
        <div style="margin-top:auto;display:flex;align-items:center;gap:10px;padding:12px;border-radius:12px;background:rgba(255,255,255,.06)">
          <div style="width:38px;height:38px;border-radius:50%;background:#e5b769;color:#3a2c0a;display:flex;align-items:center;justify-content:center;font-weight:800">${initials(user.fullName)}</div>
          <div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:700;color:#fff">${user.fullName}</div><div style="font-size:12px">Administrator</div></div>
          <button id="logout" title="Logg ut" style="background:none;border:none;color:#9fb0c6;padding:4px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg></button>
        </div>
      </aside>
      <main class="content"><div id="main" style="flex:1;display:flex;flex-direction:column;min-height:0"></div></main>
    </div>`);
  root.appendChild(layout);
  layout.querySelector('#logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); user = null; go('/'); render(); });
  // Varsel-badge på Gjester: antall ventende besøksforespørsler.
  api('/api/firelist/guests/pending-count').then((r) => {
    const badge = layout.querySelector('#gjesterBadge');
    if (badge && r.count > 0) { badge.textContent = r.count; badge.style.display = 'inline-flex'; }
  }).catch(() => {});
  renderMain(layout.querySelector('#main'));
}

function header(main, title, subtitle, right = '') {
  main.appendChild(el(`<div class="topbar"><div><div style="font-size:20px;font-weight:800;letter-spacing:-.02em">${title}</div><div class="page-sub" style="font-size:13px;color:var(--muted-2);font-weight:600">${subtitle}</div></div><div style="display:flex;gap:12px">${right}</div></div>`));
}

// ── 2.2 Dashboard ────────────────────────────────────────────
async function renderDashboard(main) {
  header(main, 'Dashboard', formatDateLong(todayStr()),
    `<button class="btn btn-primary" id="screen" style="height:44px;padding:0 20px;font-size:14.5px">${nav.qr}Vis QR på storskjerm</button>`);
  main.querySelector('#screen').addEventListener('click', () => window.open('/admin/#/storskjerm', '_blank'));

  const page = el(`<div class="page"><div id="guestNotice"></div><div id="kpis" style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-bottom:22px"></div><div id="missing"></div></div>`);
  main.appendChild(page);

  const [fire, andakt, users, guests] = await Promise.all([
    api('/api/firelist/overview').catch(() => null),
    api('/api/andakt/checkins').catch(() => null),
    api('/api/users').catch(() => ({ users: [] })),
    api('/api/firelist/guests').catch(() => ({ pending: [] })),
  ]);

  // Varsel: ubehandlede besøksforespørsler fra elever.
  const pend = guests.pending || [];
  if (pend.length) {
    page.querySelector('#guestNotice').innerHTML = `
      <a href="#/gjester" style="display:flex;align-items:center;gap:14px;background:var(--amber-bg);border:1px solid var(--amber);border-radius:16px;padding:16px 20px;margin-bottom:22px;text-decoration:none;color:inherit">
        <div style="width:40px;height:40px;border-radius:11px;background:var(--amber-ink);color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto">${nav.guest}</div>
        <div style="flex:1;min-width:0"><div style="font-size:16px;font-weight:800;color:var(--amber-ink)">${pend.length} besøksforespørsel${pend.length > 1 ? 'er' : ''} venter på godkjenning</div>
          <div style="font-size:13px;font-weight:600;color:var(--amber-ink);opacity:.85">${pend.map((g) => esc(g.guestName) + ' (hos ' + esc(g.hostName) + ')').join(', ')}</div></div>
        <span class="pill" style="background:var(--amber-ink);color:#fff;flex:0 0 auto">Gå til Gjester →</span>
      </a>`;
  }
  const activeStudents = users.users.filter((u) => u.role === 'student' && u.active).length;
  const deactivated = users.users.filter((u) => u.role === 'student' && !u.active).length;

  page.querySelector('#kpis').innerHTML = `
    <div class="kpi"><div style="display:flex;align-items:center;gap:9px;font-size:14px;font-weight:700;color:var(--muted);margin-bottom:14px"><span style="width:18px;height:18px;color:var(--navy)">${icon.flame}</span>På skolen i natt</div>
      <div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:38px;font-weight:800">${fire?.present ?? '–'}</span><span style="font-size:17px;font-weight:700;color:var(--muted-2)">av ${fire?.total ?? '–'} elever</span></div>
      <div style="height:8px;background:#eef1f5;border-radius:99px;margin:14px 0 8px;overflow:hidden"><div style="width:${fire && fire.total ? Math.round((fire.present / fire.total) * 100) : 0}%;height:100%;background:var(--green)"></div></div>
      <div style="display:flex;gap:14px;font-size:13px;font-weight:700"><span style="color:var(--red-ink)">${fire?.missing ?? 0} mangler</span><span style="color:var(--navy)">${fire?.away ?? 0} borte</span></div></div>
    <div class="kpi"><div style="display:flex;align-items:center;gap:9px;font-size:14px;font-weight:700;color:var(--muted);margin-bottom:14px"><span style="width:18px;height:18px;color:var(--navy)">${icon.book}</span>Andakt i dag</div>
      <div style="display:flex;align-items:baseline;gap:6px"><span style="font-size:38px;font-weight:800;color:var(--green)">${andakt?.count ?? '–'}</span><span style="font-size:14px;font-weight:700;color:var(--muted-2)">til stede</span></div>
      <div style="display:flex;gap:10px;margin-top:12px"><span class="pill pill-red">${andakt?.absent ?? 0} fravær</span><span class="pill pill-grey">av ${andakt?.totalStudents ?? 0}</span></div></div>
    <div class="kpi"><div style="display:flex;align-items:center;gap:9px;font-size:14px;font-weight:700;color:var(--muted);margin-bottom:14px"><span style="width:18px;height:18px;color:var(--navy)">${nav.users}</span>Aktive brukere</div>
      <div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:38px;font-weight:800">${activeStudents}</span><span style="font-size:17px;font-weight:700;color:var(--muted-2)">elever</span></div>
      <div style="font-size:13px;font-weight:600;color:var(--muted-2);margin-top:14px">${deactivated} deaktiverte kontoer</div></div>`;

  const missing = [];
  for (const d of fire?.dorms || []) for (const s of d.students) if (s.status === 'missing') missing.push({ ...s, dorm: d.dorm });
  page.querySelector('#missing').innerHTML = `
    <div style="background:#fff;border:1px solid #f0c4c0;border-radius:18px;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:#fdf0ef;border-bottom:1px solid #f5d6d2">
        <div style="display:flex;align-items:center;gap:11px"><div style="width:34px;height:34px;border-radius:9px;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:center"><span style="width:19px;height:19px">${icon.warn}</span></div>
          <div><div style="font-size:16px;font-weight:800;color:var(--red-ink)">Ikke registrert på brannlisten i kveld</div><div style="font-size:13px;color:#b0574d;font-weight:600">${missing.length} elever · viktig for brannsikkerheten</div></div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr">
        ${missing.length ? missing.map((s, i) => `<div style="display:flex;align-items:center;gap:12px;padding:14px 22px;border-bottom:1px solid #f2eeee;${i % 2 === 0 ? 'border-right:1px solid #f2eeee' : ''}"><span class="dot" style="background:var(--red)"></span><span style="font-size:15px;font-weight:700;flex:1">${s.fullName}</span><span style="font-size:13px;color:var(--muted-2);font-weight:600">${s.dorm} · rom ${s.room ?? '–'}</span></div>`).join('')
          : '<div style="padding:22px;color:var(--green-ink);font-weight:700">Alle elever er registrert 🎉</div>'}
      </div>
    </div>`;
}

// ── 2.3 Elever ───────────────────────────────────────────────
function renderBrukere(main) {
  return renderUserList(main, {
    role: 'student', title: 'Elever', unit: 'elever',
    addLabel: 'Legg til elev', search: true,
  });
}

// ── Administratorer (ansatte) ────────────────────────────────
function renderAdmins(main) {
  return renderUserList(main, {
    role: 'admin', title: 'Administratorer', unit: 'administratorer',
    addLabel: 'Legg til administrator', search: false,
  });
}

async function renderUserList(main, cfg) {
  const isStudent = cfg.role === 'student';
  header(main, cfg.title, 'Laster…',
    `<button class="btn btn-primary" id="bulk" style="height:44px;padding:0 18px;font-size:14.5px"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Legg til flere</button>`);
  const searchBar = cfg.search
    ? `<div style="margin-bottom:16px"><input id="search" class="field" placeholder="Søk navn eller brukernavn…" style="max-width:340px;height:42px;border-radius:12px" /></div>`
    : '';
  const page = el(`<div class="page">${searchBar}
    <div id="bulkbar" style="display:none;align-items:center;gap:14px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px 16px;margin-bottom:14px">
      <span id="bulkcount" style="font-weight:700"></span>
      <div style="flex:1"></div>
      <button id="bulkclear" class="btn btn-ghost" style="height:38px;padding:0 14px;font-size:13.5px">Fjern valg</button>
      <button id="bulkdel" class="btn" style="height:38px;padding:0 16px;font-size:13.5px;background:var(--red);color:#fff">Slett valgte</button>
    </div>
    <div id="table" style="background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden"></div></div>`);
  main.appendChild(page);

  const selected = new Set();
  const bulkbar = page.querySelector('#bulkbar');
  let lastRows = [];

  // ── Sortering på kolonne ───────────────────────────────────
  // key = null betyr serverens rekkefølge (aktive først, så navn).
  let sort = { key: null, dir: 1 };
  // numeric: rom 3 < 8 < 53. 'nb': æ, ø, å havner sist, slik norsk krever.
  const coll = new Intl.Collator('nb', { numeric: true, sensitivity: 'base' });
  // Tomme felt («–») skal alltid ligge nederst, uansett sorteringsretning.
  const cmp = (a, b, dir) => {
    const ea = !a, eb = !b;
    if (ea || eb) return ea && eb ? 0 : (ea ? 1 : -1);
    return coll.compare(a, b) * dir;
  };
  // Lik verdi -> sorter på navn, så rekkefølgen er forutsigbar.
  const byName = (fn) => (a, b, d) => fn(a, b, d) || coll.compare(a.fullName, b.fullName);
  const sorters = {
    name: (a, b, d) => cmp(a.fullName, b.fullName, d),
    username: (a, b, d) => cmp(a.username, b.username, d),
    class: byName((a, b, d) => cmp(a.className, b.className, d)),
    dorm: byName((a, b, d) => cmp(a.dorm, b.dorm, d) || cmp(a.room, b.room, d)),
    status: byName((a, b, d) => (Number(b.active) - Number(a.active)) * d),
  };
  const th = (key, label) => {
    const on = sort.key === key;
    const arrow = on ? (sort.dir === 1 ? '▲' : '▼') : '▾';
    return `<div data-sort="${key}" title="Sorter på ${label.toLowerCase()}">${label}<span class="sortarrow" style="opacity:${on ? 1 : .3}">${arrow}</span></div>`;
  };

  function updateBulk() {
    bulkbar.style.display = selected.size ? 'flex' : 'none';
    page.querySelector('#bulkcount').textContent = `${selected.size} valgt`;
    const selAll = page.querySelector('#selAll');
    if (selAll) {
      const sel = lastRows.filter((u) => u.id !== user.id);
      const chosen = sel.filter((u) => selected.has(u.id)).length;
      selAll.checked = sel.length > 0 && chosen === sel.length;
      selAll.indeterminate = chosen > 0 && chosen < sel.length;
    }
  }

  let users = [];
  async function load() {
    const d = await api('/api/users'); users = d.users;
    selected.clear();
    const mine = users.filter((u) => u.role === cfg.role);
    main.querySelector('.page-sub').textContent =
      `${mine.filter((u) => u.active).length} aktive ${cfg.unit} · ${mine.filter((u) => !u.active).length} deaktiverte`;
    draw();
  }
  function draw() {
    const q = cfg.search ? page.querySelector('#search').value.trim().toLowerCase() : '';
    const rows = users.filter((u) => u.role === cfg.role)
      .filter((u) => !q || u.fullName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
    if (sort.key && sorters[sort.key]) rows.sort((a, b) => sorters[sort.key](a, b, sort.dir));
    lastRows = rows;
    const cols = isStudent ? '42px 1.6fr 1.4fr .8fr 1.2fr .9fr 60px' : '42px 1.8fr 1.6fr 1fr 60px';
    const headCells = '<div><input type="checkbox" id="selAll" style="width:18px;height:18px;cursor:pointer" /></div>' + (isStudent
      ? th('name', 'Navn') + th('username', 'Brukernavn') + th('class', 'Klasse') + th('dorm', 'Internat / rom') + th('status', 'Status') + '<div></div>'
      : th('name', 'Navn') + th('username', 'Brukernavn') + th('status', 'Status') + '<div></div>');
    page.querySelector('#table').innerHTML = `
      <div class="th" style="grid-template-columns:${cols};gap:12px">${headCells}</div>
      ${rows.map((u) => `
        <div class="tr" style="grid-template-columns:${cols};gap:12px;${u.active ? '' : 'opacity:.62'}${selected.has(u.id) ? ';background:#f4f6fa' : ''}">
          <div><input type="checkbox" data-sel="${u.id}" ${selected.has(u.id) ? 'checked' : ''} ${u.id === user.id ? 'disabled' : ''} style="width:18px;height:18px;cursor:pointer" /></div>
          <div style="font-size:14.5px;font-weight:700">${u.fullName}${u.id === user.id ? ' <span style="font-size:11px;font-weight:700;color:var(--muted-2)">(deg)</span>' : ''}</div>
          <div style="font-size:14px;color:var(--slate)">${u.username}</div>
          ${isStudent ? `<div style="font-size:14px;color:var(--slate)">${u.className || '–'}</div>
          <div style="font-size:14px;color:var(--slate)">${u.dorm || '–'}${u.room ? ' · ' + u.room : ''}</div>` : ''}
          <div>${u.active ? '<span class="pill pill-green">Aktiv</span>' : '<span class="pill pill-grey">Deaktivert</span>'}</div>
          <div style="text-align:right"><button data-edit="${u.id}" title="Rediger" style="background:none;border:none;color:var(--muted-2);cursor:pointer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg></button></div>
        </div>`).join('') || '<div style="padding:26px;color:var(--muted-2)">Ingen treff.</div>'}`;

    // Klikk på kolonneoverskrift: samme kolonne igjen snur retningen.
    page.querySelectorAll('[data-sort]').forEach((h) => h.addEventListener('click', () => {
      const key = h.dataset.sort;
      if (sort.key === key) sort.dir = -sort.dir;
      else { sort.key = key; sort.dir = 1; }
      draw();
    }));

    page.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => userModal(users.find((u) => u.id === Number(b.dataset.edit)), load, cfg)));
    page.querySelectorAll('[data-sel]').forEach((cb) => cb.addEventListener('change', () => {
      const id = Number(cb.dataset.sel);
      if (cb.checked) selected.add(id); else selected.delete(id);
      cb.closest('.tr').style.background = cb.checked ? '#f4f6fa' : '';
      updateBulk();
    }));
    const selAll = page.querySelector('#selAll');
    selAll.addEventListener('change', () => {
      const sel = lastRows.filter((u) => u.id !== user.id);
      if (selAll.checked) sel.forEach((u) => selected.add(u.id)); else sel.forEach((u) => selected.delete(u.id));
      draw();
    });
    updateBulk();
  }

  page.querySelector('#bulkclear').addEventListener('click', () => { selected.clear(); draw(); });
  page.querySelector('#bulkdel').addEventListener('click', async () => {
    if (!selected.size) return;
    if (!confirm(`Slette ${selected.size} ${selected.size === 1 ? 'bruker' : 'brukere'}? Dette kan ikke angres, og fjerner alle registreringer for dem.`)) return;
    const btn = page.querySelector('#bulkdel'); btn.disabled = true;
    try {
      const r = await api('/api/users/bulk-delete', { method: 'POST', body: { ids: [...selected] } });
      toast(`${r.deleted} slettet`);
      await load();
    } catch (ex) { toast(ex.message); btn.disabled = false; }
  });

  if (cfg.search) page.querySelector('#search').addEventListener('input', draw);
  main.querySelector('#bulk')?.addEventListener('click', () => bulkAddModal(cfg, load));
  await load();
}

function optionsHTML(list, placeholder, selected) {
  return ['', ...list]
    .map((v) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${v || placeholder}</option>`)
    .join('');
}

function userModal(existing, onSaved, cfg) {
  const isEdit = !!existing;
  const role = existing?.role || cfg.role;
  const isStudent = role === 'student';
  const noun = isStudent ? 'elev' : 'administrator';
  const canDelete = isEdit && existing.id !== user.id;
  const dormOptions = optionsHTML(DORMS, 'Velg internat…', existing?.dorm);
  const classOptions = optionsHTML(CLASSES, 'Velg klasse…', existing?.className);
  const instrumentOptions = optionsHTML(INSTRUMENTS, 'Velg instrument…', existing?.instrument);
  const studentFields = isStudent ? `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:16px">
          <div><label class="field-label">Klasse</label><select class="field field-sm" name="className" style="background:#f7f8fa">${classOptions}</select></div>
          <div><label class="field-label">Internat</label><select class="field field-sm" name="dorm" style="background:#f7f8fa">${dormOptions}</select></div>
          <div><label class="field-label">Rom</label><input class="field field-sm" name="room" value="${existing?.room || ''}" placeholder="9" /></div>
        </div>
        <div style="margin-top:16px">
          <label class="field-label">Hovedinstrument</label>
          <select class="field field-sm" name="instrument" style="background:#f7f8fa">${instrumentOptions}</select>
        </div>` : '';
  const bg = el(`
    <div class="modal-bg"><div class="modal">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:22px 26px 18px;border-bottom:1px solid #eef0f3">
        <div><div style="font-size:20px;font-weight:800;letter-spacing:-.02em">${isEdit ? 'Rediger ' + noun : 'Legg til ' + noun}</div>
          <div style="font-size:13px;color:var(--muted-2);font-weight:600">${isStudent ? 'Kun admin oppretter kontoer – ingen selvregistrering.' : 'Administratorer har full tilgang til systemet.'}</div></div>
        <button id="close" style="background:none;border:none;cursor:pointer;color:var(--muted-2)"><span style="width:22px;height:22px;display:block">${icon.x}</span></button>
      </div>
      <form id="uf" style="padding:22px 26px">
        <label class="field-label">Fullt navn</label>
        <input class="field field-sm" name="fullName" value="${existing?.fullName || ''}" required />
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px">
          <div><label class="field-label">Brukernavn</label><input class="field field-sm" name="username" autocapitalize="none" placeholder="fornavn.etternavn" ${isEdit ? 'disabled' : ''} value="${existing?.username || ''}" ${isEdit ? '' : 'required'} /></div>
          <div><label class="field-label">Passord</label><div style="display:flex;gap:8px"><input class="field field-sm" name="password" type="text" placeholder="${isEdit ? 'La stå tomt for uendret' : 'Auto hvis tomt'}" style="flex:1;min-width:0" /><button type="button" id="gen" class="btn btn-ghost" style="height:46px;padding:0 12px;font-size:13px">Generer</button></div></div>
        </div>
        ${studentFields}
        ${isEdit ? `<label style="display:flex;align-items:center;gap:9px;margin-top:18px;font-size:14px;font-weight:600;color:var(--slate)"><input type="checkbox" name="active" ${existing.active ? 'checked' : ''} style="width:18px;height:18px" />Aktiv konto</label>` : ''}
        <p id="uerr" style="color:var(--red-ink);font-size:14px;font-weight:600;margin:14px 0 0;display:none"></p>
      </form>
      <div style="display:flex;align-items:center;gap:12px;padding:16px 26px 22px;border-top:1px solid #eef0f3">
        ${canDelete ? `<button id="delete" class="btn" style="height:46px;padding:0 18px;font-size:14.5px;background:#fff;color:var(--red-ink);border:1.5px solid #f0c4c0">${nav.trash}Slett</button>` : ''}
        <div style="flex:1"></div>
        <button id="cancel" class="btn btn-ghost" style="height:46px;padding:0 22px;font-size:14.5px">Avbryt</button>
        <button id="save" class="btn btn-primary" style="height:46px;padding:0 22px;font-size:14.5px">${isEdit ? 'Lagre' : 'Opprett ' + noun}</button>
      </div>
    </div></div>`);
  document.body.appendChild(bg);
  const f = bg.querySelector('#uf'); const uerr = bg.querySelector('#uerr');
  const close = () => bg.remove();
  bg.querySelector('#close').addEventListener('click', close);
  bg.querySelector('#cancel').addEventListener('click', close);
  bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
  bg.querySelector('#gen').addEventListener('click', () => {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    f.password.value = Array.from({ length: 10 }, () => a[Math.floor(Math.random() * a.length)]).join('');
  });

  // Nye kontoer: fyll brukernavn automatisk fra navnet (fornavn.etternavn),
  // helt til admin evt. redigerer brukernavnet manuelt.
  if (!isEdit) {
    let usernameTouched = false;
    f.username.addEventListener('input', () => { usernameTouched = true; });
    f.fullName.addEventListener('input', () => {
      if (!usernameTouched) f.username.value = makeUsername(f.fullName.value);
    });
  }

  bg.querySelector('#delete')?.addEventListener('click', async () => {
    if (!confirm(`Slette ${existing.fullName}? Dette kan ikke angres, og fjerner alle registreringer for brukeren.`)) return;
    const btn = bg.querySelector('#delete'); btn.disabled = true;
    try {
      await api(`/api/users/${existing.id}`, { method: 'DELETE' });
      toast('Bruker slettet'); close(); onSaved();
    } catch (ex) { uerr.textContent = ex.message; uerr.style.display = 'block'; btn.disabled = false; }
  });

  bg.querySelector('#save').addEventListener('click', async () => {
    uerr.style.display = 'none';
    const body = { fullName: f.fullName.value };
    if (isStudent) {
      body.className = f.className.value; body.dorm = f.dorm.value; body.room = f.room.value;
      body.instrument = f.instrument.value;
    }
    if (f.password.value) body.password = f.password.value;
    const btn = bg.querySelector('#save'); btn.disabled = true;
    try {
      if (isEdit) {
        body.active = f.active?.checked ?? true;
        await api(`/api/users/${existing.id}`, { method: 'PATCH', body });
        toast('Bruker oppdatert');
      } else {
        body.username = f.username.value;
        body.role = role;
        const r = await api('/api/users', { method: 'POST', body });
        if (r.generatedPassword) toast(`${noun[0].toUpperCase() + noun.slice(1)} opprettet. Passord: ${r.generatedPassword}`);
        else toast('Bruker opprettet');
      }
      close(); onSaved();
    } catch (ex) { uerr.textContent = ex.message; uerr.style.display = 'block'; btn.disabled = false; }
  });
}

// ── Legg til flere brukere (bulk) + brukerkort ───────────────
// Samme flyt for elever og administratorer. Elever har klasse/internat/rom;
// administratorer bare navn (brukernavn + passord genereres for begge).
// Navnekolonnen får en nedre grense: uten den spiser de faste kolonnene hele
// bredden, og «Fullt navn» kollapser til et par tegn.
const BULK_COLS_STUDENT = 'minmax(170px, 1fr) 96px 132px 68px 140px 30px';
const BULK_COLS_ADMIN = '1fr 32px';
const bulkCols = (isStudent) => (isStudent ? BULK_COLS_STUDENT : BULK_COLS_ADMIN);

function bulkRowHTML(isStudent) {
  const rmBtn = `<button type="button" class="rm-row" title="Fjern rad" style="background:none;border:none;cursor:pointer;color:var(--muted-2)"><span style="width:18px;height:18px;display:block">${icon.x}</span></button>`;
  const studentFields = isStudent ? `
      <select class="field field-sm" name="className" style="background:#f7f8fa">${optionsHTML(CLASSES, 'Klasse', '')}</select>
      <select class="field field-sm" name="dorm" style="background:#f7f8fa">${optionsHTML(DORMS, 'Internat', '')}</select>
      <input class="field field-sm" name="room" placeholder="Rom" />
      <select class="field field-sm" name="instrument" style="background:#f7f8fa">${optionsHTML(INSTRUMENTS, 'Instrument', '')}</select>` : '';
  return `
    <div class="brow" style="display:grid;grid-template-columns:${bulkCols(isStudent)};gap:8px;margin-bottom:8px">
      <input class="field field-sm" name="fullName" placeholder="Fullt navn" />
      ${studentFields}
      ${rmBtn}
    </div>`;
}

function parseBulkRows(rowsEl, isStudent) {
  return Array.from(rowsEl.querySelectorAll('.brow')).map((row) => {
    const base = { fullName: row.querySelector('[name="fullName"]').value.trim() };
    if (isStudent) {
      base.className = row.querySelector('[name="className"]').value;
      base.dorm = row.querySelector('[name="dorm"]').value;
      base.room = row.querySelector('[name="room"]').value.trim();
      base.instrument = row.querySelector('[name="instrument"]').value;
    }
    return base;
  }).filter((s) => s.fullName);
}

function bulkAddModal(cfg, onSaved) {
  const isStudent = cfg.role === 'student';
  const unit = cfg.unit;              // 'elever' | 'administratorer'
  const nounCap = isStudent ? 'elever' : 'administratorer';
  const headLabels = isStudent
    ? `<label class="field-label" style="margin:0">Navn</label>
       <label class="field-label" style="margin:0">Klasse</label>
       <label class="field-label" style="margin:0">Internat</label>
       <label class="field-label" style="margin:0">Rom</label>
       <label class="field-label" style="margin:0">Instrument</label>
       <span></span>`
    : `<label class="field-label" style="margin:0">Navn</label><span></span>`;
  const bg = el(`
    <div class="modal-bg"><div class="modal" style="width:${isStudent ? 780 : 520}px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:22px 26px 18px;border-bottom:1px solid #eef0f3">
        <div><div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Legg til flere ${unit}</div>
          <div style="font-size:13px;color:var(--muted-2);font-weight:600">Én rad per ${isStudent ? 'elev' : 'administrator'}. Brukernavn og passord lages automatisk.</div></div>
        <button id="close" style="background:none;border:none;cursor:pointer;color:var(--muted-2)"><span style="width:22px;height:22px;display:block">${icon.x}</span></button>
      </div>
      <div id="body" style="padding:22px 26px">
        ${isStudent ? `
        <div style="background:#eef4fb;border:1px solid #d7e4f4;border-radius:10px;padding:12px 14px;margin-bottom:18px">
          <div style="font-size:13.5px;font-weight:800;margin-bottom:2px">Importer fra Excel</div>
          <div style="font-size:12.5px;color:var(--muted-2);line-height:1.5;margin-bottom:10px">Last opp elevlista – OpenAI henter ut navn, klasse, internat og rom. Du kan rette radene før du oppretter.</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <input type="file" id="bxlsx" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="font-size:13px" />
            <button type="button" class="btn btn-ghost" id="bxlsxRead" style="height:38px;padding:0 16px;font-size:13.5px">Les inn fra Excel</button>
          </div>
          <div id="bximport" style="font-size:12.5px;margin-top:9px;display:none"></div>
        </div>` : ''}
        <div style="display:grid;grid-template-columns:${bulkCols(isStudent)};gap:8px;margin-bottom:6px">${headLabels}</div>
        <div id="rows" style="max-height:340px;overflow-y:auto;padding-right:2px"></div>
        <button type="button" id="addrow" class="btn btn-ghost" style="height:38px;padding:0 16px;font-size:13.5px;margin-top:4px">+ Legg til rad</button>
        <p id="berr" style="color:var(--red-ink);font-size:14px;font-weight:600;margin:14px 0 0;display:none"></p>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 26px 22px;border-top:1px solid #eef0f3">
        <span id="cnt" style="font-size:14px;color:var(--muted-2);font-weight:600">0 ${unit}</span>
        <div style="display:flex;gap:12px">
          <button id="cancel" class="btn btn-ghost" style="height:46px;padding:0 22px;font-size:14.5px">Avbryt</button>
          <button id="create" class="btn btn-primary" style="height:46px;padding:0 22px;font-size:14.5px">Opprett ${nounCap}</button>
        </div>
      </div>
    </div></div>`);
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.querySelector('#close').addEventListener('click', close);
  bg.querySelector('#cancel').addEventListener('click', close);
  bg.addEventListener('click', (e) => { if (e.target === bg) close(); });

  const rowsEl = bg.querySelector('#rows');
  const cnt = bg.querySelector('#cnt');
  const updateCount = () => { cnt.textContent = `${parseBulkRows(rowsEl, isStudent).length} ${unit}`; };
  const addRow = (focus) => {
    const row = el(bulkRowHTML(isStudent));
    rowsEl.appendChild(row);
    if (focus) row.querySelector('[name="fullName"]').focus();
    row.querySelector('.rm-row').addEventListener('click', () => {
      if (rowsEl.querySelectorAll('.brow').length > 1) row.remove(); else row.querySelectorAll('input').forEach((i) => (i.value = ''));
      updateCount();
    });
    // Legg automatisk til en ny tom rad når man begynner å fylle ut den siste.
    row.querySelector('[name="fullName"]').addEventListener('input', () => {
      updateCount();
      if (row === rowsEl.lastElementChild && row.querySelector('[name="fullName"]').value.trim()) addRow(false);
    });
    row.querySelectorAll('select').forEach((s) => s.addEventListener('change', updateCount));
    return row;
  };
  for (let i = 0; i < 6; i++) addRow(false);
  bg.querySelector('#addrow').addEventListener('click', () => addRow(true));

  // Excel-import: tolk arket med OpenAI og fyll radene, slik at admin kan
  // rette før opprettelsen. Elever som allerede finnes hoppes over.
  if (isStudent) {
    const note = bg.querySelector('#bximport');
    const showNote = (html, color) => { note.innerHTML = html; note.style.color = color || 'var(--muted-2)'; note.style.display = 'block'; };
    bg.querySelector('#bxlsxRead').addEventListener('click', async () => {
      const input = bg.querySelector('#bxlsx');
      const file = input.files[0];
      if (!file) { showNote('Velg en Excel-fil (.xlsx).', 'var(--red-ink)'); return; }
      const btn = bg.querySelector('#bxlsxRead'); btn.disabled = true; const old = btn.textContent; btn.textContent = 'Leser…';
      showNote('Leser arket med OpenAI…');
      try {
        const qs = `classes=${encodeURIComponent(CLASSES.join(','))}&dorms=${encodeURIComponent(DORMS.join(','))}`
          + `&instruments=${encodeURIComponent(INSTRUMENTS.join(','))}`;
        const res = await fetch(`/api/users/parse-xlsx?${qs}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
          body: file, credentials: 'same-origin',
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Kunne ikke lese arket'); }
        const d = await res.json();
        rowsEl.innerHTML = '';
        for (const s of d.students) {
          const row = addRow(false);
          row.querySelector('[name="fullName"]').value = s.fullName;
          if (s.className) row.querySelector('[name="className"]').value = s.className;
          if (s.instrument) row.querySelector('[name="instrument"]').value = s.instrument;
          if (s.dorm) row.querySelector('[name="dorm"]').value = s.dorm;
          if (s.room) row.querySelector('[name="room"]').value = s.room;
        }
        addRow(false);                       // én tom rad til slutt
        updateCount();
        input.value = '';
        const n = d.students.length;
        let html = `<b>Fant ${n} ${n === 1 ? 'ny elev' : 'nye elever'}.</b> Sjekk radene under før du oppretter.`;
        if (d.existing.length) html += `<br>${d.existing.length} fantes allerede og ble utelatt: ${d.existing.map(esc).join(', ')}.`;
        showNote(html, 'var(--navy)');
      } catch (ex) { showNote(esc(ex.message), 'var(--red-ink)'); }
      finally { btn.disabled = false; btn.textContent = old; }
    });
  }

  bg.querySelector('#create').addEventListener('click', async () => {
    const berr = bg.querySelector('#berr'); berr.style.display = 'none';
    const students = parseBulkRows(rowsEl, isStudent);
    if (!students.length) { berr.textContent = `Fyll ut minst én ${isStudent ? 'elev' : 'administrator'}.`; berr.style.display = 'block'; return; }
    const btn = bg.querySelector('#create'); btn.disabled = true; btn.textContent = 'Oppretter…';
    try {
      const r = await api('/api/users/bulk', { method: 'POST', body: { students, role: cfg.role } });
      bulkResultView(bg, r, unit, onSaved);
    } catch (ex) { berr.textContent = ex.message; berr.style.display = 'block'; btn.disabled = false; btn.textContent = `Opprett ${nounCap}`; }
  });
}

function bulkResultView(bg, result, unit, onSaved) {
  const { created, errors } = result;
  bg.querySelector('#body').innerHTML = `
    <div style="text-align:center;padding:6px 0 4px">
      <div style="width:64px;height:64px;border-radius:50%;background:var(--green-bg);color:var(--green);display:flex;align-items:center;justify-content:center;margin:0 auto 12px"><span style="width:34px;height:34px">${icon.check}</span></div>
      <div style="font-size:20px;font-weight:800">${created.length} ${unit} opprettet</div>
      <p style="font-size:14px;color:var(--muted);line-height:1.5;margin:8px 0 0">Passordene vises <b>kun nå</b>. Last ned brukerkortene og del dem ut.</p>
    </div>
    ${errors.length ? `<div style="background:var(--amber-bg);color:var(--amber-ink);border:1px solid #f0dca0;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;margin:16px 0 0">${errors.length} linjer ble hoppet over: ${errors.map((e) => 'linje ' + e.line + (e.fullName ? ' (' + e.fullName + ')' : '')).join(', ')}</div>` : ''}`;
  // Bytt ut bunnknappene
  const footer = bg.querySelector('#body').nextElementSibling;
  footer.innerHTML = `
    <div></div>
    <div style="display:flex;gap:12px">
      <button id="done" class="btn btn-ghost" style="height:46px;padding:0 22px;font-size:14.5px">Lukk</button>
      <button id="cards" class="btn btn-primary" style="height:46px;padding:0 22px;font-size:14.5px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>Skriv ut brukerkort</button>
    </div>`;
  footer.querySelector('#done').addEventListener('click', () => { bg.remove(); onSaved(); });
  footer.querySelector('#cards').addEventListener('click', () => printCredentialCards(created));
}

// Åpner en utskriftsvennlig side med brukerkort i rutenett (klippes med skjærekniv).
function printCredentialCards(students) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const cards = students.map((s) => {
    const meta = [s.className, s.dorm, s.room ? 'rom ' + s.room : ''].filter(Boolean).join(' · ');
    return `<div class="card">
      <div class="sch">Kongshaug Musikkgymnas</div>
      <div class="name">${esc(s.fullName)}</div>
      ${meta ? `<div class="meta">${esc(meta)}</div>` : '<div class="meta">&nbsp;</div>'}
      <div class="row"><span class="lbl">Brukernavn</span><span class="val">${esc(s.username)}</span></div>
      <div class="row"><span class="lbl">Passord</span><span class="val mono">${esc(s.password)}</span></div>
      <div class="note">Midlertidig passord – byttes ved første innlogging.</div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="nb"><head><meta charset="utf-8"><title>Brukerkort</title>
<style>
  *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
  body{margin:0}
  .grid{display:grid;grid-template-columns:1fr 1fr}
  .card{height:150px;border:0.5pt solid #333;padding:10px 14px;break-inside:avoid;page-break-inside:avoid;display:flex;flex-direction:column;justify-content:center}
  .sch{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.04em}
  .name{font-size:15px;font-weight:bold;color:#000;margin-top:2px}
  .meta{font-size:11px;color:#555;margin-bottom:8px}
  .row{display:flex;justify-content:space-between;align-items:baseline;border-top:0.5pt solid #ddd;padding:4px 0;font-size:12px}
  .lbl{color:#666}
  .val{font-weight:bold;color:#000}
  .val.mono{font-family:"Courier New",monospace;font-size:14px;letter-spacing:1px}
  .note{font-size:8.5px;color:#888;margin-top:6px}
  .toolbar{padding:16px;text-align:center}
  @page{size:A4;margin:10mm}
  @media print{.toolbar{display:none}}
</style></head>
<body>
  <div class="grid">${cards}</div>
  <div class="toolbar"><button onclick="window.print()">Skriv ut / lagre som PDF</button></div>
  <script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { toast('Tillat popup-vinduer for å skrive ut brukerkort.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

// ── 2.4 Andakt / QR ──────────────────────────────────────────
let andaktTimer = null;
async function renderAndakt(main) {
  header(main, 'Andakt / QR-kode', formatDateLong(todayStr()),
    `<button class="btn btn-ghost" id="exportAbsent" style="height:44px;padding:0 18px;font-size:14px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>Eksporter ukens fravær (Excel)</button>`);
  const page = el(`
    <div class="page" style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:0 0 380px;max-width:100%;background:#fff;border:1px solid var(--line);border-radius:20px;padding:28px;display:flex;flex-direction:column;align-items:center;text-align:center">
        <span class="pill pill-green" id="qrPill" style="margin-bottom:6px"><span class="dot" id="qrDot" style="background:var(--green)"></span><span id="qrPillText">Gyldig i dag</span></span>
        <div style="font-size:16px;font-weight:700;color:var(--slate);margin:8px 0 18px">${formatDateLong(todayStr())}</div>
        <div id="qrLive" style="display:flex;flex-direction:column;align-items:center">
          <div style="width:244px;height:244px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px;box-sizing:border-box"><img id="qr" alt="QR" style="width:100%;height:100%;image-rendering:pixelated" /></div>
          <p style="font-size:13px;color:var(--muted-2);line-height:1.5;margin:18px 0 20px;text-align:center">Koden roterer automatisk. Et avfotografert bilde slutter å virke etter noen sekunder.</p>
        </div>
        <div id="qrClosed" style="display:none;width:244px;min-height:244px;background:var(--soft,#f5f7f9);border:1px dashed var(--line-2);border-radius:16px;padding:20px;box-sizing:border-box;flex-direction:column;align-items:center;justify-content:center;gap:10px;margin-bottom:8px"></div>
        <div style="display:flex;flex-direction:column;gap:10px;width:100%">
          <button class="btn btn-primary" id="screen" style="height:48px">${nav.qr}Åpne storskjerm</button>
          <button class="btn btn-ghost" id="rotate" style="height:48px"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/></svg>Ugyldiggjør koder nå</button>
        </div>
      </div>
      <div style="flex:1;min-width:320px;background:#fff;border:1px solid var(--line);border-radius:20px;display:flex;flex-direction:column;overflow:hidden">
        <div style="display:flex;gap:8px;padding:14px 16px;border-bottom:1px solid #eef0f3">
          <button id="tabPresent" data-view="present" style="flex:1;height:44px;border:none;border-radius:11px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">Til stede <span id="countPresent" style="font-weight:800">0</span></button>
          <button id="tabAbsent" data-view="absent" style="flex:1;height:44px;border:none;border-radius:11px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">Ikke møtt <span id="countAbsent" style="font-weight:800">0</span></button>
        </div>
        <div id="list" style="overflow:auto;max-height:520px"></div>
      </div>
    </div>`);
  main.appendChild(page);
  page.querySelector('#screen').addEventListener('click', () => window.open('/admin/#/storskjerm', '_blank'));
  page.querySelector('#rotate').addEventListener('click', async () => { await api('/api/andakt/rotate', { method: 'POST' }); toast('Alle tidligere koder er nå ugyldige'); refreshQr(); });

  async function refreshQr() {
    try {
      const d = await api('/api/andakt/qr');
      const pill = page.querySelector('#qrPill'), pillText = page.querySelector('#qrPillText'), dot = page.querySelector('#qrDot');
      const live = page.querySelector('#qrLive'), closed = page.querySelector('#qrClosed');
      if (d.open) {
        page.querySelector('#qr').src = d.qr;
        live.style.display = 'flex'; closed.style.display = 'none';
        pill.className = 'pill pill-green'; dot.style.background = 'var(--green)';
        pillText.textContent = `Gyldig nå · til kl. ${d.closesAt}`;
      } else {
        live.style.display = 'none'; closed.style.display = 'flex';
        pill.className = 'pill pill-amber'; dot.style.background = 'var(--amber)';
        const m = d.state === 'before'
          ? { pill: `Åpner kl. ${d.opensAt}`, big: 'Ikke tilgjengelig ennå', sub: `QR-koden vises fra kl. ${d.opensAt} – 30 min før fristen.` }
          : d.state === 'after'
            ? { pill: 'Andakten er over', big: 'Andakten er over for i dag', sub: `Registrering var åpen til kl. ${d.closesAt}.` }
            : { pill: 'Ingen andakt', big: 'Ingen andakt i dag', sub: 'Andakt holdes kun på ukedager.' };
        pillText.textContent = m.pill;
        closed.innerHTML = `<div style="font-size:15px;font-weight:800;color:var(--slate)">${m.big}</div><div style="font-size:13px;color:var(--muted-2);line-height:1.5">${m.sub}</div>`;
      }
    } catch {}
  }

  let view = 'present';
  let data = { checkins: [], absentList: [], count: 0, absent: 0 };
  const tabPresent = page.querySelector('#tabPresent');
  const tabAbsent = page.querySelector('#tabAbsent');

  // Eksporter fravær + for sent for HELE uken (mandag–søndag rundt i dag) til
  // én samlet Excel-fil, siden admin uansett bare sjekker dette ukentlig.
  main.querySelector('#exportAbsent')?.addEventListener('click', async () => {
    const btn = main.querySelector('#exportAbsent'); btn.disabled = true;
    try {
      const week = await api('/api/andakt/week');
      // s: 1=overskrift, 2=rød (fravær), 3=gul (for sent)
      const header = ['Navn', 'Klasse', 'Internat', 'Rom', 'Dato', 'Status', 'Hvor sent'].map((v) => ({ v, s: 1 }));
      const rows = [header];
      for (const day of week.days) {
        const dato = formatDateNorsk(day.sessionDate);
        for (const s of day.absentList || []) {
          rows.push([s.fullName, s.className || '', s.dorm || '', s.room || '', dato, 'Fravær', ''].map((v) => ({ v, s: 2 })));
        }
        for (const c of (day.checkins || []).filter((x) => x.status === 'late')) {
          const how = c.minutesLate != null
            ? `${c.minutesLate} min for sent (kl. ${formatTime(c.checkedAt)})`
            : `kl. ${formatTime(c.checkedAt)}`;
          rows.push([c.fullName, c.className || '', c.dorm || '', c.room || '', dato, 'For sent', how].map((v) => ({ v, s: 3 })));
        }
      }
      if (rows.length === 1) { toast('Ingen fravær eller for sent denne uken 🎉'); return; }
      downloadBlob(`andakt-fravaer-${week.weekStart}-til-${week.weekEnd}.xlsx`,
        buildXlsx({ rows, sheetName: 'Fravær og for sent', cols: [28, 11, 18, 8, 14, 12, 30] }));
    } catch (ex) { toast(ex.message); }
    finally { btn.disabled = false; }
  });

  function styleTabs() {
    tabPresent.style.background = view === 'present' ? 'var(--navy)' : '#f4f5f7';
    tabPresent.style.color = view === 'present' ? '#fff' : 'var(--slate)';
    // Fremhev "Ikke møtt" i rødt når det er valgt.
    tabAbsent.style.background = view === 'absent' ? 'var(--red)' : '#f4f5f7';
    tabAbsent.style.color = view === 'absent' ? '#fff' : 'var(--slate)';
    page.querySelector('#countPresent').style.color = view === 'present' ? '#fff' : 'var(--green-ink)';
    page.querySelector('#countAbsent').style.color = view === 'absent' ? '#fff' : 'var(--red-ink)';
  }

  // 48×48 – samme trykkflate som statusknappene på brannlisten (Apple HIG: 44pt).
  const andBtn = (uid, set, ic, activeColor, active, title) =>
    `<button data-uid="${uid}" data-andset="${set}" title="${title}" style="width:48px;height:48px;border-radius:12px;border:1.5px solid ${active ? activeColor : 'var(--line-2)'};background:${active ? activeColor : '#fff'};color:${active ? '#fff' : 'var(--muted-2)'};cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;touch-action:manipulation"><span style="width:22px;height:22px;display:block">${ic}</span></button>`;
  const andCtrl = (uid, cur) => `<div style="display:flex;gap:8px;flex:0 0 auto">
    ${andBtn(uid, 'present', icon.check, 'var(--green)', cur === 'present', 'Sett til stede')}
    ${andBtn(uid, 'late', icon.warn, 'var(--amber)', cur === 'late', 'Sett for sent')}
    ${andBtn(uid, 'clear', icon.x, 'var(--red)', !cur, 'Fjern (fravær)')}
  </div>`;

  async function adminSet(uid, status) {
    try { await api('/api/andakt/admin-checkin', { method: 'POST', body: { userId: uid, status } }); await refreshList(); }
    catch (ex) { toast(ex.message); }
  }

  function draw() {
    page.querySelector('#countPresent').textContent = data.count;
    page.querySelector('#countAbsent').textContent = data.absent;
    styleTabs();
    const list = page.querySelector('#list');
    if (data.andaktToday === false) {
      list.innerHTML = '<div style="padding:26px;color:var(--muted-2)">Ingen andakt i dag – andakt holdes kun på ukedager.</div>';
      return;
    }
    if (view === 'present') {
      list.innerHTML = (data.checkins || []).map((c) => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid #f2f4f6">
          <span style="width:30px;height:30px;border-radius:50%;background:${c.status === 'late' ? 'var(--amber-bg)' : 'var(--green-bg)'};color:${c.status === 'late' ? 'var(--amber)' : 'var(--green)'};display:flex;align-items:center;justify-content:center;flex:0 0 auto"><span style="width:15px;height:15px">${c.status === 'late' ? icon.warn : icon.check}</span></span>
          <span style="flex:1;min-width:0;font-size:14.5px;font-weight:700">${c.fullName}</span>
          <span style="font-size:12.5px;color:var(--muted-2);font-weight:700">${c.status === 'late' ? 'For sent · ' : ''}${formatTime(c.checkedAt)}</span>
          ${andCtrl(c.id, c.status)}
        </div>`).join('') || '<div style="padding:26px;color:var(--muted-2)">Ingen har registrert oppmøte ennå.</div>';
    } else {
      list.innerHTML = (data.absentList || []).map((s) => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid #f2f4f6">
          <span style="width:30px;height:30px;border-radius:50%;background:var(--red-bg);color:var(--red);display:flex;align-items:center;justify-content:center;flex:0 0 auto"><span style="width:15px;height:15px">${icon.x}</span></span>
          <span style="flex:1;min-width:0;font-size:14.5px;font-weight:700">${s.fullName}</span>
          <span style="font-size:12.5px;color:var(--muted-2);font-weight:600">${[s.className, s.dorm].filter(Boolean).join(' · ') || ''}</span>
          ${andCtrl(s.id, null)}
        </div>`).join('') || '<div style="padding:26px;color:var(--green-ink);font-weight:700">Alle elever har registrert oppmøte 🎉</div>';
    }
    list.querySelectorAll('[data-andset]').forEach((b) => b.addEventListener('click', () => adminSet(Number(b.dataset.uid), b.dataset.andset)));
  }

  tabPresent.addEventListener('click', () => { view = 'present'; draw(); });
  tabAbsent.addEventListener('click', () => { view = 'absent'; draw(); });

  async function refreshList() {
    try { data = await api('/api/andakt/checkins'); draw(); } catch {}
  }

  await refreshQr(); await refreshList();
  clearInterval(andaktTimer);
  andaktTimer = setInterval(() => { refreshQr(); refreshList(); }, 5000);
}
window.addEventListener('hashchange', () => clearInterval(andaktTimer));

// ── Middag (kjøkken) ─────────────────────────────────────────
async function renderKitchen(main) {
  const d = await api('/api/dinner/overview').catch(() => null);
  header(main, 'Kjøkken', formatDateLong(todayStr()),
    `<button class="btn btn-ghost" id="sendKitchen" style="height:44px;padding:0 18px;font-size:14px">Send til kjøkken nå</button>`);
  const page = el(`<div class="page" style="max-width:820px"></div>`);
  main.appendChild(page);

  main.querySelector('#sendKitchen').addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true; const old = btn.textContent; btn.textContent = 'Sender…';
    try { const r = await api('/api/settings/test-kitchen-email', { method: 'POST' }); toast('Sendt til ' + r.recipient); }
    catch (ex) { toast(ex.message); }
    finally { btn.disabled = false; btn.textContent = old; }
  });

  const kpi = (n, txt, color) => `<div class="kpi"><div style="font-size:13px;font-weight:700;color:var(--muted);margin-bottom:8px">${txt}</div><div style="font-size:38px;font-weight:800;color:${color}">${n}</div></div>`;
  // Dagens tall. Feiler oppslaget viser vi bare det – kjøkkentjeneste og
  // ukemeny under skal fortsatt være tilgjengelig.
  const duty = d?.kitchenDuty;
  page.innerHTML = !d ? '<p style="color:var(--muted-2)">Kunne ikke laste middagsoversikten.</p>' : `
    <div style="display:flex;align-items:center;gap:14px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 18px;margin-bottom:18px">
      <div style="width:42px;height:42px;border-radius:12px;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto">${nav.food}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;font-weight:700;color:var(--muted-2);text-transform:uppercase;letter-spacing:.05em">Kjøkkentjeneste · uke ${duty.isoWeek}</div>
        <div style="font-size:15px;font-weight:700;margin-top:2px;color:${duty.students.length ? 'inherit' : 'var(--muted-2)'}">${duty.students.length ? esc(duty.students.map((s) => s.fullName).join(', ')) : 'Ingen elever satt opp denne uken'}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin-bottom:22px">
      ${kpi(`${d.eating} <span style="font-size:18px;color:var(--muted-2)">/ ${d.total}</span>`, 'Spiser middag', 'var(--green)')}
      ${kpi(d.total - d.eating, 'Spiser ikke', 'var(--red)')}
    </div>
    <div style="background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden">
      <div style="padding:16px 22px;background:#f7f8fa;border-bottom:1px solid var(--line);font-size:16px;font-weight:800">Spiser ikke i dag <span style="font-weight:600;color:var(--muted-2);font-size:13px">(${d.notEating.length})</span></div>
      ${d.notEating.length ? d.notEating.map((n) => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 22px;border-bottom:1px solid #f2f4f6">
          <span class="dot" style="background:var(--red)"></span>
          <span style="flex:1;font-size:14.5px;font-weight:700">${esc(n.name)}</span>
          <span class="pill pill-red">Meldt av</span>
        </div>`).join('') : '<div style="padding:22px;color:var(--muted-2)">Alle spiser middag i dag.</div>'}
    </div>`;

  mountDutyModule(page, 'kitchen');
  mountMenuManager(page);
}

// ── Ukestjeneste (kjøkkentjeneste / internatvask) ─────────────
// Elevene har tjeneste én uke av gangen, på rundgang. Admin blar mellom uker og
// legger til eksisterende elever; uken identifiseres av mandagsdatoen.
//
// Samme modul for begge tjenestene – de oppfører seg likt, og bare tekstene og
// API-stien skiller dem. Serveren deler koden på samme måte (se duty.js), så de
// to kan ikke komme i utakt.
const DUTY_KINDS = {
  kitchen: {
    navn: 'Kjøkkentjeneste',
    base: '/api/dinner/kitchen-duty',
    hjelp: 'Legg til elevene som har tjeneste, én uke av gangen. Bla framover for å planlegge kommende uker. Elevene ser sin egen tjenesteuke på hjemskjermen i appen.',
    importHjelp: 'Last opp en Excel-liste med kjøkkentjeneste – OpenAI leser ut hvem som har tjeneste hvilke uker, og du bekrefter før det legges inn.',
    lasteFeil: 'Kunne ikke laste kjøkkentjenesten.',
  },
  dorm: {
    navn: 'Internatvask',
    base: '/api/dorm-duty',
    hjelp: 'Legg til elevene som har vask, én uke av gangen. Bla framover for å planlegge kommende uker. Elevene ser sin egen vaskeuke på hjemskjermen i appen.',
    importHjelp: 'Last opp en Excel-liste med internatvask – OpenAI leser ut hvem som har vask hvilke uker, og du bekrefter før det legges inn.',
    lasteFeil: 'Kunne ikke laste internatvasken.',
  },
};

function mountDutyModule(container, kind, { standalone = false } = {}) {
  const cfg = DUTY_KINDS[kind];
  const card = el(`
    <div style="margin-top:${standalone ? 0 : 26}px">
      <div style="font-size:17px;font-weight:800;margin-bottom:2px">${cfg.navn}</div>
      <div style="font-size:13px;color:var(--muted-2);margin-bottom:14px">${cfg.hjelp}</div>
      <div style="background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:#f7f8fa;border-bottom:1px solid var(--line)">
          <button class="btn btn-ghost" id="prevWeek" title="Forrige uke" style="height:38px;width:38px;padding:0;font-size:16px">‹</button>
          <div style="flex:1;text-align:center">
            <div id="weekTitle" style="font-size:16px;font-weight:800">Uke –</div>
            <div id="weekRange" style="font-size:12.5px;color:var(--muted-2);font-weight:600"></div>
          </div>
          <button class="btn btn-ghost" id="nextWeek" title="Neste uke" style="height:38px;width:38px;padding:0;font-size:16px">›</button>
        </div>
        <div id="dutyList"></div>
        <div style="padding:14px 18px;border-top:1px solid var(--line);position:relative">
          <input type="text" id="dutySearch" class="field" placeholder="Søk opp elev å legge til…" autocomplete="off" style="height:44px" />
          <div id="dutyResults" style="display:none;position:absolute;left:18px;right:18px;bottom:62px;max-height:260px;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 32px rgba(16,24,40,.14);z-index:20"></div>
        </div>
      </div>
      <div style="margin-top:14px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px 18px">
        <div style="font-size:14px;font-weight:800;margin-bottom:4px">Importer fra Excel</div>
        <div style="font-size:12.5px;color:var(--muted-2);margin-bottom:12px">${cfg.importHjelp}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <input type="file" id="dutyXlsx" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="font-size:14px" />
          <button class="btn btn-primary" id="dutyXlsxUpload" style="height:44px;padding:0 18px">Les inn Excel</button>
        </div>
        <div id="dutyImportPreview" style="margin-top:14px"></div>
      </div>
      <div style="font-size:15px;font-weight:800;margin:22px 0 10px">Kommende uker</div>
      <div id="dutyUpcoming" style="background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden"></div>
    </div>`);
  container.appendChild(card);

  const shiftWeek = (ws, n) => {
    const [y, m, d] = ws.split('-').map(Number);
    return ymd(new Date(y, m - 1, d + n * 7));
  };

  const listEl = card.querySelector('#dutyList');
  const searchEl = card.querySelector('#dutySearch');
  const resultsEl = card.querySelector('#dutyResults');
  const upcomingEl = card.querySelector('#dutyUpcoming');

  let weekStart = null;      // uken som vises nå (mandagsdato)
  let currentStart = null;   // uken vi faktisk er i – for «Denne uken»-merket
  let students = [];         // alle aktive elever, til søket
  let assigned = [];         // elevene på uken som vises

  api('/api/users')
    .then((d) => { students = d.users.filter((u) => u.role === 'student' && u.active); })
    .catch(() => {});

  async function loadWeek(ws) {
    const q = ws ? `?from=${ws}` : '';
    const d = await api(`${cfg.base}${q}`).catch(() => null);
    if (!d) { listEl.innerHTML = `<div style="padding:22px;color:var(--muted-2)">${cfg.lasteFeil}</div>`; return; }
    currentStart = d.currentWeek.weekStart;
    renderWeek(d.weeks[0]);
  }

  function renderWeek(w) {
    weekStart = w.weekStart;
    assigned = w.students;
    card.querySelector('#weekTitle').textContent = `Uke ${w.isoWeek}${w.isCurrent ? ' · denne uken' : ''}`;
    card.querySelector('#weekRange').textContent = formatWeekRange(w.weekStart, w.weekEnd);
    listEl.innerHTML = w.students.length ? w.students.map((s) => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid #f2f4f6">
        <span style="flex:1;font-size:14.5px;font-weight:700">${esc(s.fullName)}</span>
        <span style="font-size:13px;color:var(--muted-2);font-weight:600">${esc(s.className || '')}</span>
        <button class="btn btn-ghost" data-remove="${s.id}" title="Fjern fra uken" style="height:34px;padding:0 12px;font-size:13px">Fjern</button>
      </div>`).join('') : '<div style="padding:22px;color:var(--muted-2);font-size:14px">Ingen elever satt opp denne uken ennå.</div>';

    listEl.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const r = await api(`${cfg.base}/${weekStart}/${b.dataset.remove}`, { method: 'DELETE' });
        renderWeek(r.week); loadUpcoming();
      } catch (ex) { toast(ex.message); b.disabled = false; }
    }));
  }

  async function addStudent(id) {
    try {
      const r = await api(cfg.base, { method: 'POST', body: { weekStart, userIds: [id] } });
      searchEl.value = ''; resultsEl.style.display = 'none';
      renderWeek(r.week); loadUpcoming();
    } catch (ex) { toast(ex.message); }
  }

  function renderResults() {
    const q = searchEl.value.trim().toLowerCase();
    if (!q) { resultsEl.style.display = 'none'; return; }
    const taken = new Set(assigned.map((s) => s.id));
    const hits = students
      .filter((u) => !taken.has(u.id) && (u.fullName.toLowerCase().includes(q) || (u.className || '').toLowerCase().includes(q)))
      .slice(0, 8);
    resultsEl.innerHTML = hits.length ? hits.map((u) => `
      <button type="button" data-add="${u.id}" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid #f2f4f6;padding:11px 14px;cursor:pointer">
        <span style="flex:1;font-size:14px;font-weight:700">${esc(u.fullName)}</span>
        <span style="font-size:12.5px;color:var(--muted-2);font-weight:600">${esc([u.className, u.dorm].filter(Boolean).join(' · '))}</span>
      </button>`).join('') : '<div style="padding:14px;color:var(--muted-2);font-size:13.5px">Ingen treff.</div>';
    resultsEl.style.display = 'block';
    resultsEl.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => addStudent(Number(b.dataset.add))));
  }

  // Oversikt over rundgangen framover, så admin ser hull før de oppstår.
  async function loadUpcoming() {
    const d = await api(`${cfg.base}?weeks=8`).catch(() => null);
    if (!d) { upcomingEl.innerHTML = ''; return; }
    upcomingEl.innerHTML = d.weeks.map((w) => `
      <button type="button" data-week="${w.weekStart}" style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid #f2f4f6;padding:12px 18px;cursor:pointer">
        <span style="flex:0 0 76px;font-size:14px;font-weight:800">Uke ${w.isoWeek}</span>
        <span style="flex:0 0 175px;font-size:12.5px;color:var(--muted-2);font-weight:600">${formatWeekRange(w.weekStart, w.weekEnd)}</span>
        <span style="flex:1;font-size:14px;font-weight:600;color:${w.students.length ? 'var(--ink, #1a2230)' : 'var(--muted-2)'}">${w.students.length ? esc(w.students.map((s) => s.fullName).join(', ')) : 'Ingen satt opp'}</span>
        ${w.isCurrent ? '<span class="pill pill-green">Nå</span>' : ''}
      </button>`).join('');
    upcomingEl.querySelectorAll('[data-week]').forEach((b) => b.addEventListener('click', () => loadWeek(b.dataset.week)));
  }

  card.querySelector('#prevWeek').addEventListener('click', () => loadWeek(shiftWeek(weekStart, -1)));
  card.querySelector('#nextWeek').addEventListener('click', () => loadWeek(shiftWeek(weekStart, 1)));
  searchEl.addEventListener('input', renderResults);
  searchEl.addEventListener('focus', renderResults);
  // Klikk utenfor lukker trefflisten (uten å spise klikket på et treff).
  document.addEventListener('click', (e) => {
    if (!card.contains(e.target)) resultsEl.style.display = 'none';
  });

  // ── Excel-import: last opp → OpenAI-forhåndsvisning → bekreft ──
  const previewEl = card.querySelector('#dutyImportPreview');
  const weekEndOf = (ws) => { const [y, m, d] = ws.split('-').map(Number); const e = new Date(y, m - 1, d + 6); return ymd(e); };

  function renderDutyPreview(data) {
    const weeks = data.weeks || [];
    if (!weeks.length) { previewEl.innerHTML = '<div style="color:var(--muted-2);font-size:13.5px">Fant ingen uker i arket.</div>'; return; }
    previewEl.innerHTML = `
      <div style="border:1px solid var(--line);border-radius:12px;overflow:hidden">
        ${weeks.map((w, i) => {
          const chips = w.matched.map((m) => `<span style="display:inline-block;background:var(--green-bg);color:var(--green-ink,#166534);font-size:12.5px;font-weight:700;padding:3px 9px;border-radius:20px">${esc(m.fullName)}</span>`).join(' ');
          const miss = w.unmatched.map((n) => `<span style="display:inline-block;background:var(--amber-bg);color:var(--amber-ink);font-size:12.5px;font-weight:700;padding:3px 9px;border-radius:20px" title="Ikke funnet blant elevene">${esc(n)} · ikke funnet</span>`).join(' ');
          return `
          <div style="display:flex;gap:12px;padding:12px 14px;border-bottom:1px solid #f2f4f6">
            <input type="checkbox" data-wk="${i}" ${w.matched.length ? 'checked' : ''} ${w.matched.length ? '' : 'disabled'} style="width:20px;height:20px;flex:0 0 auto;margin-top:2px" />
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:800">Uke ${w.week} <span style="font-weight:600;color:var(--muted-2)">· ${esc(formatWeekRange(w.weekStart, weekEndOf(w.weekStart)))}</span></div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${chips || '<span style="font-size:12.5px;color:var(--muted-2)">Ingen elever funnet</span>'} ${miss}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px">
        <button class="btn btn-ghost" id="dutyImportCancel" style="height:42px;padding:0 16px">Avbryt</button>
        <button class="btn btn-primary" id="dutyImportApply" style="height:42px;padding:0 18px">Legg til valgte uker</button>
      </div>`;

    previewEl.querySelector('#dutyImportCancel').addEventListener('click', () => { previewEl.innerHTML = ''; });
    previewEl.querySelector('#dutyImportApply').addEventListener('click', async () => {
      const chosen = weeks.filter((_, i) => previewEl.querySelector(`[data-wk="${i}"]`)?.checked)
        .map((w) => ({ weekStart: w.weekStart, userIds: w.matched.map((m) => m.id) }))
        .filter((w) => w.userIds.length);
      if (!chosen.length) { toast('Ingen uker valgt'); return; }
      const btn = previewEl.querySelector('#dutyImportApply'); btn.disabled = true; btn.textContent = 'Legger til…';
      try {
        const r = await api(`${cfg.base}/bulk`, { method: 'POST', body: { weeks: chosen } });
        const n = (r.weeks || []).length;
        previewEl.innerHTML = '';
        toast(`La til tjeneste for ${n} uke${n === 1 ? '' : 'r'}`);
        loadWeek(weekStart); loadUpcoming();
      } catch (ex) { toast(ex.message); btn.disabled = false; btn.textContent = 'Legg til valgte uker'; }
    });
  }

  card.querySelector('#dutyXlsxUpload').addEventListener('click', async () => {
    const input = card.querySelector('#dutyXlsx');
    const file = input.files[0];
    if (!file) { toast('Velg en Excel-fil (.xlsx).'); return; }
    const btn = card.querySelector('#dutyXlsxUpload'); btn.disabled = true; const old = btn.textContent; btn.textContent = 'Leser…';
    previewEl.innerHTML = '<div style="color:var(--muted-2);font-size:13.5px">Leser arket med OpenAI…</div>';
    try {
      const res = await fetch(`${cfg.base}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        body: file, credentials: 'same-origin',
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Kunne ikke lese arket'); }
      const data = await res.json();
      input.value = '';
      renderDutyPreview(data);
    } catch (ex) { previewEl.innerHTML = ''; toast(ex.message); }
    finally { btn.disabled = false; btn.textContent = old; }
  });

  loadWeek();
  loadUpcoming();
}

// ── Ukemeny (PDF): opplasting, OpenAI-tolkning, forhåndsvis + rediger ──
// ── Øvekonkurranse ───────────────────────────────────────────
// Elevene øver på hovedinstrumentet sitt i en avgrenset periode. Her setter
// admin perioden og oppvarmingen, og ser stillingen med øktene under hver elev.

// «1 t 25 min» / «42 min» / «40 sek». Sekunder vises bare for de helt korte
// øktene – ellers er de bare støy i en oversikt over timer.
function formatDuration(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  if (n < 60) return `${n} sek`;
  const t = Math.floor(n / 3600);
  const m = Math.round((n % 3600) / 60);
  if (!t) return `${m} min`;
  return m ? `${t} t ${m} min` : `${t} t`;
}

// Datoen et UTC-tidsstempel fra databasen faller på i norsk tid, som
// 'YYYY-MM-DD'. Å klippe de ti første tegnene av tidsstempelet ville gitt
// UTC-datoen, og bommet med en dag på alt som skjer sent på kvelden.
function localDate(iso) {
  const d = new Date(String(iso).replace(' ', 'T') + 'Z');
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Datostempelet på dokumentasjonsbildet, i formen gamle digitalkameraer brente
// inn nederst til høyre – med norsk datorekkefølge: «21.08.2026  19:42».
function photoStamp(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T') + 'Z');
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Bildet med stempelet lagt over. Stempelet tegnes ved visning, fra serverens
// tidsstempel på økten – ikke brent inn i filen av telefonen. Da kan det ikke
// forfalskes av en app, og det ser likt ut overalt det vises.
// `maxHeight` gjør at bildet skaleres ned til det får plass, i stedet for å
// dytte vinduet utenfor skjermen. Rammen krymper med bildet (inline-block uten
// fast bredde), slik at stempelet lander i hjørnet av selve bildet og ikke i
// hjørnet av en tom boks rundt det.
function stampedPhoto(sessionId, iso, { maxHeight = '60vh', radius = 12, stampSize = 15 } = {}) {
  return `
    <div style="position:relative;display:inline-block;max-width:100%;background:#0b0e13;border-radius:${radius}px;overflow:hidden;line-height:0">
      <img src="/api/practice/sessions/${sessionId}/photo" alt="Dokumentasjon" style="display:block;max-width:100%;max-height:${maxHeight};width:auto;height:auto" />
      <div style="position:absolute;right:${Math.round(stampSize * 0.7)}px;bottom:${Math.round(stampSize * 0.55)}px;font-family:'Courier New',ui-monospace,monospace;font-weight:700;font-size:${stampSize}px;letter-spacing:.08em;color:#ffa22b;text-shadow:0 0 7px rgba(255,120,0,.6),0 1px 2px rgba(0,0,0,.95);line-height:1.1">${photoStamp(iso)}</div>
    </div>`;
}

function photoLightbox(sessionId, iso) {
  const bg = el(`
    <div class="modal-bg"><div class="modal" style="max-width:640px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 14px;border-bottom:1px solid #eef0f3">
        <div><div style="font-size:18px;font-weight:800;letter-spacing:-.02em">Dokumentasjon</div>
          <div style="font-size:13px;color:var(--muted-2);font-weight:600">Tatt ${formatDateLong(localDate(iso))} kl. ${formatTime(iso)}</div></div>
        <button id="close" style="background:none;border:none;cursor:pointer;color:var(--muted-2)"><span style="width:22px;height:22px;display:block">${icon.x}</span></button>
      </div>
      <div style="padding:18px 24px 24px;text-align:center">${stampedPhoto(sessionId, iso, { stampSize: 20, maxHeight: 'calc(100vh - 220px)' })}</div>
    </div></div>`);
  document.body.appendChild(bg);
  const lukk = () => bg.remove();
  bg.querySelector('#close').addEventListener('click', lukk);
  bg.addEventListener('click', (e) => { if (e.target === bg) lukk(); });
}

const PRACTICE_SORTS = [
  ['time', 'Total tid'],
  ['class', 'Klasse'],
  ['instrument', 'Instrument'],
];

async function renderPractice(main) {
  header(main, 'Øvekonkurranse', 'Periode, stilling og dokumentasjon');
  const page = el(`<div class="page" style="max-width:880px"><div id="body" style="color:var(--muted-2)">Laster…</div></div>`);
  main.appendChild(page);

  const s = await api('/api/settings').catch(() => null);
  if (!s) { page.querySelector('#body').textContent = 'Kunne ikke laste innstillingene.'; return; }

  let sort = 'time';

  page.querySelector('#body').innerHTML = `
    <div class="kpi" style="padding:8px 24px 20px;margin-bottom:22px">
      <div style="font-size:17px;font-weight:800;margin:18px 0 2px">Konkurranseperiode</div>
      <div style="font-size:13px;color:var(--muted-2);margin-bottom:6px">Elevene kan bare registrere øving mellom disse datoene, begge dager inkludert. La feltene stå tomme for å slå konkurransen av.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:14px 0">
        <div><label class="field-label">Starter</label><input type="date" name="practiceStartDate" value="${s.practiceStartDate || ''}" class="field field-sm" /><div data-vist="practiceStartDate" style="font-size:12.5px;color:var(--muted-2);font-weight:600;margin-top:5px;min-height:17px"></div></div>
        <div><label class="field-label">Slutter</label><input type="date" name="practiceEndDate" value="${s.practiceEndDate || ''}" class="field field-sm" /><div data-vist="practiceEndDate" style="font-size:12.5px;color:var(--muted-2);font-weight:600;margin-top:5px;min-height:17px"></div></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-top:1px solid #f0f2f4">
        <div><div style="font-size:15px;font-weight:700">Obligatorisk oppvarming</div><div style="font-size:13px;color:var(--muted-2);margin-top:2px">Eleven må gjennom denne før stoppeklokken tar over. Tiden teller med i totalen.</div></div>
        <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto">
          <input type="number" name="practiceWarmupMinutes" value="${s.practiceWarmupMinutes}" min="1" max="60" step="1" class="field" style="width:100px;height:46px" />
          <span style="color:var(--muted-2);font-weight:700;font-size:14px">minutter</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-top:1px solid #f0f2f4">
        <div><div style="font-size:15px;font-weight:700">Andel økter som må dokumenteres</div><div style="font-size:13px;color:var(--muted-2);margin-top:2px">Trekkes for hver økt når eleven starter. Sett 100 % mens elevene læres opp, eller 0 % for å slå dokumentasjonen av.</div></div>
        <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto">
          <input type="number" name="practicePhotoPercent" value="${s.practicePhotoPercent}" min="0" max="100" step="5" class="field" style="width:100px;height:46px" />
          <span style="color:var(--muted-2);font-weight:700;font-size:14px">%</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:16px;margin-top:6px">
        <span id="msg" style="color:var(--green-ink);font-weight:700;display:none">Lagret ✓</span>
        <button class="btn btn-primary" id="saveComp" style="height:46px;padding:0 22px">Lagre</button>
      </div>
    </div>

    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:14px;margin-bottom:12px">
      <div><div style="font-size:17px;font-weight:800">Stilling</div><div id="compState" style="font-size:13px;color:var(--muted-2);font-weight:600"></div></div>
      <div style="display:flex;gap:6px;flex:0 0 auto">
        ${PRACTICE_SORTS.map(([k, navn]) => `<button class="btn btn-ghost" data-sort="${k}" style="height:36px;padding:0 14px;font-size:13px">${navn}</button>`).join('')}
      </div>
    </div>
    <div id="board" style="background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden"><div style="padding:22px;color:var(--muted-2)">Laster…</div></div>`;

  const boardEl = page.querySelector('#board');
  const stateEl = page.querySelector('#compState');

  for (const navn of ['practiceStartDate', 'practiceEndDate']) {
    visDatoPåNorsk(page.querySelector(`[name=${navn}]`), page.querySelector(`[data-vist="${navn}"]`));
  }

  function markerSort() {
    page.querySelectorAll('[data-sort]').forEach((b) => {
      const aktiv = b.dataset.sort === sort;
      b.style.background = aktiv ? 'var(--navy)' : '#fff';
      b.style.color = aktiv ? '#fff' : 'var(--slate)';
      b.style.fontWeight = aktiv ? '700' : '600';
    });
  }

  async function loadBoard() {
    markerSort();
    const d = await api(`/api/practice/leaderboard?sort=${sort}`).catch(() => null);
    if (!d) { boardEl.innerHTML = '<div style="padding:22px;color:var(--muted-2)">Kunne ikke laste stillingen.</div>'; return; }

    const c = d.competition;
    stateEl.textContent = !c.configured
      ? 'Ingen periode satt opp ennå'
      : `${formatDateLong(c.startDate)} – ${formatDateLong(c.endDate)} · ${c.active ? 'pågår nå' : 'ikke aktiv'} · ${formatDuration(d.totalSeconds)} øvd til sammen`;

    if (!c.configured) {
      boardEl.innerHTML = '<div style="padding:22px;color:var(--muted-2);font-size:14px">Sett en start- og sluttdato over for å åpne konkurransen. Elevene ser den i appen først da.</div>';
      return;
    }
    if (!d.students.length) {
      boardEl.innerHTML = '<div style="padding:22px;color:var(--muted-2);font-size:14px">Ingen aktive elever å vise.</div>';
      return;
    }

    // Plassering gis bare når det faktisk er øvd, og bare når lista er sortert
    // på tid – i en klasse- eller instrumentsortering ville tallene lyve.
    let plass = 0;
    boardEl.innerHTML = d.students.map((r) => {
      if (r.totalSeconds > 0) plass++;
      const nr = sort === 'time' && r.totalSeconds > 0 ? `${plass}.` : '';
      return `
      <div data-rad="${r.id}">
        <button type="button" data-open="${r.id}" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid #f2f4f6;padding:13px 20px;cursor:pointer">
          <span style="flex:0 0 34px;font-size:14px;font-weight:800;color:var(--muted-2)">${nr}</span>
          <span style="flex:1;min-width:0;font-size:14.5px;font-weight:700">${esc(r.fullName)}</span>
          <span style="flex:0 0 74px;font-size:13px;color:var(--muted-2);font-weight:600">${esc(r.className || '')}</span>
          <span style="flex:0 0 150px;font-size:13px;color:var(--muted-2);font-weight:600">${esc(r.instrument || '– uten instrument')}</span>
          <span style="flex:0 0 62px;font-size:13px;color:var(--muted-2);font-weight:600;text-align:right">${r.sessions || ''}${r.sessions ? ' økt' + (r.sessions === 1 ? '' : 'er') : ''}</span>
          <span style="flex:0 0 96px;text-align:right;font-size:14.5px;font-weight:800;color:${r.totalSeconds ? 'inherit' : 'var(--muted-2)'}">${r.totalSeconds ? formatDuration(r.totalSeconds) : '–'}</span>
        </button>
        <div data-panel="${r.id}" style="display:none;background:#f7f8fa;border-bottom:1px solid #f2f4f6"></div>
      </div>`;
    }).join('');

    boardEl.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => toggle(Number(b.dataset.open))));
  }

  async function toggle(userId) {
    const panel = boardEl.querySelector(`[data-panel="${userId}"]`);
    if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    panel.innerHTML = '<div style="padding:16px 20px;color:var(--muted-2);font-size:13.5px">Laster økter…</div>';

    const d = await api(`/api/practice/sessions/${userId}`).catch(() => null);
    if (!d) { panel.innerHTML = '<div style="padding:16px 20px;color:var(--muted-2);font-size:13.5px">Kunne ikke laste øktene.</div>'; return; }
    if (!d.sessions.length) { panel.innerHTML = '<div style="padding:16px 20px;color:var(--muted-2);font-size:13.5px">Ingen registrerte økter i perioden.</div>'; return; }

    panel.innerHTML = d.sessions.map((o) => `
      <div style="display:flex;align-items:center;gap:14px;padding:11px 20px;border-bottom:1px solid #edeff2">
        <span style="flex:0 0 168px;font-size:13.5px;font-weight:600">${formatDateLong(o.sessionDate)}</span>
        <span style="flex:0 0 60px;font-size:13px;color:var(--muted-2);font-weight:600">kl. ${formatTime(o.startedAt)}</span>
        <span style="flex:1;font-size:14px;font-weight:700">${formatDuration(o.totalSeconds)}</span>
        <span style="flex:0 0 auto;font-size:12.5px;color:var(--muted-2);font-weight:600">${formatDuration(o.warmupSeconds)} oppvarming${o.pausedSeconds ? ` · ${formatDuration(o.pausedSeconds)} pause` : ''}</span>
        <span style="flex:0 0 96px;text-align:right">
          ${o.hasPhoto
            ? `<button type="button" data-photo="${o.id}" data-tid="${o.photoAt || o.startedAt}" style="background:none;border:none;padding:0;cursor:pointer;line-height:0">
                 <img src="/api/practice/sessions/${o.id}/photo" alt="Dokumentasjon" style="width:58px;height:44px;object-fit:cover;border-radius:8px;border:1px solid var(--line)" /></button>`
            : o.photoRequired
              ? '<span class="pill pill-red" style="font-size:11.5px">Bilde mangler</span>'
              : '<span style="font-size:12.5px;color:var(--muted-2);font-weight:600">Ikke krevd</span>'}
        </span>
        <button type="button" data-del="${o.id}" title="Slett økten" style="background:none;border:none;cursor:pointer;color:var(--muted-2);padding:6px;flex:0 0 auto"><span style="width:17px;height:17px;display:block">${nav.trash}</span></button>
      </div>`).join('');

    panel.querySelectorAll('[data-photo]').forEach((b) =>
      b.addEventListener('click', () => photoLightbox(Number(b.dataset.photo), b.dataset.tid)));
    panel.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Slette denne økten? Tiden forsvinner fra stillingen, og dokumentasjonsbildet slettes.')) return;
      b.disabled = true;
      try { await api(`/api/practice/sessions/${b.dataset.del}`, { method: 'DELETE' }); await loadBoard(); toggle(userId); }
      catch (ex) { toast(ex.message); b.disabled = false; }
    }));
  }

  page.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { sort = b.dataset.sort; loadBoard(); }));

  page.querySelector('#saveComp').addEventListener('click', async () => {
    const btn = page.querySelector('#saveComp'); btn.disabled = true;
    const v = (n) => page.querySelector(`[name=${n}]`).value;
    try {
      await api('/api/settings', {
        method: 'PUT',
        body: {
          practiceStartDate: v('practiceStartDate'),
          practiceEndDate: v('practiceEndDate'),
          practiceWarmupMinutes: Number(v('practiceWarmupMinutes')),
          practicePhotoPercent: Number(v('practicePhotoPercent')),
        },
      });
      const msg = page.querySelector('#msg'); msg.style.display = 'inline';
      setTimeout(() => { msg.style.display = 'none'; }, 2500);
      loadBoard();
    } catch (ex) { toast(ex.message); }
    finally { btn.disabled = false; }
  });

  loadBoard();
}

// ── Internat ─────────────────────────────────────────────────
// Egen side for internatvask, med samme modul som kjøkkentjenesten bruker.
async function renderInternat(main) {
  header(main, 'Internat', 'Internatvask – hvem vasker hvilken uke');
  const page = el(`<div class="page" style="max-width:820px"></div>`);
  main.appendChild(page);
  mountDutyModule(page, 'dorm', { standalone: true });
}

// Selvstendig modul som monteres på Innstillinger-siden.
function mountMenuManager(container) {
  const card = el(`
    <div class="kpi" style="padding:8px 24px 20px;margin-bottom:20px">
      <div style="font-size:17px;font-weight:800;margin:18px 0 2px">Ukemeny</div>
      <div style="font-size:13px;color:var(--muted-2);margin-bottom:12px">Last opp ukeoppslaget fra kjøkkenet – OpenAI leser ut middagsmeny og internatvakt – eller legg inn info direkte uten PDF. Elevene ser det i appen under «Middag» og «Brannliste».</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <input type="text" id="menuTitle" class="field" placeholder="Tittel, f.eks. «Uke 29»" style="flex:1;min-width:180px;height:46px" />
        <input type="file" id="menuFile" accept="application/pdf,.pdf" style="font-size:14px" />
        <button class="btn btn-primary" id="menuUpload" style="height:46px;padding:0 20px">Last opp PDF</button>
        <button class="btn btn-ghost" id="menuManual" style="height:46px;padding:0 20px">+ Legg til uten PDF</button>
      </div>
      <div id="menuList" style="margin-top:16px"></div>
    </div>`);
  container.appendChild(card);

  const menuListEl = card.querySelector('#menuList');
  const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const parseBadge = (s) => {
    if (s === 'ok') return '<span style="font-size:11.5px;font-weight:700;color:var(--green);background:var(--green-bg);padding:2px 8px;border-radius:20px">Tolket ✓</span>';
    if (s === 'pending') return '<span style="font-size:11.5px;font-weight:700;color:var(--amber-ink);background:var(--amber-bg);padding:2px 8px;border-radius:20px">Tolker…</span>';
    if (s === 'error') return '<span style="font-size:11.5px;font-weight:700;color:var(--red);background:var(--red-bg);padding:2px 8px;border-radius:20px">Tolkning feilet</span>';
    return '';
  };

  // Forhåndsvisning av det OpenAI leste ut – slik admin kan kontrollere mot PDF-en.
  function parsedPreviewHTML(menu) {
    const days = (menu?.days || []).filter((d) => (d.dishes && d.dishes.length) || d.day);
    const rows = days.map((d) => `
      <div style="display:flex;gap:12px;padding:8px 0;border-top:1px solid #edeff2">
        <div style="flex:0 0 92px;font-size:12px;font-weight:800;color:var(--red);text-transform:uppercase;letter-spacing:.03em;padding-top:2px">${esc(d.day)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;color:var(--navy);line-height:1.45">${d.dishes && d.dishes.length ? d.dishes.map(esc).join('<br>') : '<span style="color:var(--muted-2);font-weight:500">—</span>'}</div>
          ${d.note ? `<div style="font-size:12px;color:var(--muted-2);margin-top:2px">${esc(d.note)}</div>` : ''}
        </div>
      </div>`).join('');
    const note = menu.note ? `<div style="font-size:12px;color:var(--muted-2);margin-top:8px;line-height:1.5">${esc(menu.note)}</div>` : '';
    const guards = (menu?.nightGuards || []).filter((g) => g.day || g.name);
    const guardsHTML = guards.length ? `
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid #e2e5e9">
        <div style="font-size:11px;font-weight:700;color:var(--muted-2);text-transform:uppercase;letter-spacing:.05em;padding:0 0 2px">Internatvakt</div>
        ${guards.map((g) => `<div style="display:flex;gap:12px;padding:5px 0"><div style="flex:0 0 92px;font-size:12px;font-weight:800;color:var(--navy);text-transform:uppercase;letter-spacing:.03em">${esc(g.day)}</div><div style="flex:1;font-size:14px;font-weight:600;color:var(--navy)">${esc(g.name)}</div></div>`).join('')}
      </div>` : '';
    if (!days.length && !guards.length) return '<div style="color:var(--muted-2);font-size:13px;padding:10px 0">Ingen data ble funnet i tolkningen.</div>';
    return `<div style="background:#f7f8fa;border-radius:12px;padding:4px 14px 12px;margin:2px 0 8px">
      <div style="font-size:11px;font-weight:700;color:var(--muted-2);text-transform:uppercase;letter-spacing:.05em;padding:10px 0 2px">Tolket av OpenAI · kontrollér mot PDF-en</div>
      ${rows}${note}${guardsHTML}</div>`;
  }

  // Siste hentede/lagrede meny per id, så redigering slipper å hente på nytt.
  const previewMenus = {};

  function renderMenuReadonly(panel, id) {
    panel.innerHTML = parsedPreviewHTML(previewMenus[id]) +
      '<div style="display:flex;justify-content:flex-end;padding:0 0 10px"><button class="btn btn-ghost" data-edit style="height:36px;padding:0 14px;font-size:13px">Rediger</button></div>';
    panel.querySelector('[data-edit]').addEventListener('click', () => renderMenuEditor(panel, id));
  }

  function renderMenuEditor(panel, id) {
    const menu = previewMenus[id];
    const dayBlock = (d = { day: '', dishes: [], note: null }) => `
      <div class="menu-day" style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:8px">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <input class="field field-sm" data-f="day" value="${esc(d.day)}" placeholder="Dag (f.eks. Mandag)" style="flex:1" />
          <button type="button" data-rm title="Fjern dag" style="background:none;border:none;color:var(--muted-2);cursor:pointer;padding:6px"><span style="width:18px;height:18px;display:block">${nav.trash}</span></button>
        </div>
        <textarea class="field" data-f="dishes" rows="2" placeholder="Én rett per linje" style="height:auto;padding:8px 10px;font-size:13.5px;font-family:inherit;line-height:1.5;resize:vertical">${esc((d.dishes || []).join('\n'))}</textarea>
        <input class="field field-sm" data-f="note" value="${esc(d.note || '')}" placeholder="Merknad for dagen (valgfritt)" style="margin-top:8px" />
      </div>`;
    const guardBlock = (g = { day: '', name: '' }) => `
      <div class="menu-guard" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input class="field field-sm" data-g="day" value="${esc(g.day)}" placeholder="Dag" style="flex:0 0 140px" />
        <input class="field field-sm" data-g="name" value="${esc(g.name)}" placeholder="Lærer (internatvakt)" style="flex:1" />
        <button type="button" data-rmg title="Fjern vakt" style="background:none;border:none;color:var(--muted-2);cursor:pointer;padding:6px"><span style="width:18px;height:18px;display:block">${nav.trash}</span></button>
      </div>`;
    const guards = (menu.nightGuards && menu.nightGuards.length) ? menu.nightGuards : [{ day: '', name: '' }];
    panel.innerHTML = `
      <div style="background:#f7f8fa;border-radius:12px;padding:12px 14px;margin:2px 0 8px">
        <div style="font-size:11px;font-weight:700;color:var(--muted-2);text-transform:uppercase;letter-spacing:.05em;padding:0 0 10px">Rediger meny</div>
        <div data-days>${(menu.days.length ? menu.days : [undefined]).map((d) => dayBlock(d)).join('')}</div>
        <button type="button" data-add class="btn btn-ghost" style="height:36px;padding:0 14px;font-size:13px">+ Legg til dag</button>
        <div style="margin-top:12px"><label class="field-label">Generell merknad</label>
          <input class="field field-sm" data-note value="${esc(menu.note || '')}" placeholder="F.eks. allergener (valgfritt)" /></div>
        <div style="font-size:11px;font-weight:700;color:var(--muted-2);text-transform:uppercase;letter-spacing:.05em;padding:16px 0 8px">Internatvakt</div>
        <div data-guards>${guards.map((g) => guardBlock(g)).join('')}</div>
        <button type="button" data-addg class="btn btn-ghost" style="height:36px;padding:0 14px;font-size:13px">+ Legg til vakt</button>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">
          <button type="button" data-cancel class="btn btn-ghost" style="height:40px;padding:0 18px;font-size:13.5px">Avbryt</button>
          <button type="button" data-save class="btn btn-primary" style="height:40px;padding:0 18px;font-size:13.5px">Lagre meny</button>
        </div>
      </div>`;
    const daysEl = panel.querySelector('[data-days]');
    const wireDay = (block) => block.querySelector('[data-rm]').addEventListener('click', () => {
      if (daysEl.querySelectorAll('.menu-day').length > 1) block.remove();
      else block.querySelectorAll('input,textarea').forEach((i) => (i.value = ''));
    });
    daysEl.querySelectorAll('.menu-day').forEach(wireDay);
    panel.querySelector('[data-add]').addEventListener('click', () => {
      const b = el(dayBlock()); daysEl.appendChild(b); wireDay(b); b.querySelector('[data-f="day"]').focus();
    });
    const guardsEl = panel.querySelector('[data-guards]');
    const wireGuard = (block) => block.querySelector('[data-rmg]').addEventListener('click', () => {
      if (guardsEl.querySelectorAll('.menu-guard').length > 1) block.remove();
      else block.querySelectorAll('input').forEach((i) => (i.value = ''));
    });
    guardsEl.querySelectorAll('.menu-guard').forEach(wireGuard);
    panel.querySelector('[data-addg]').addEventListener('click', () => {
      const b = el(guardBlock()); guardsEl.appendChild(b); wireGuard(b); b.querySelector('[data-g="day"]').focus();
    });
    panel.querySelector('[data-cancel]').addEventListener('click', () => renderMenuReadonly(panel, id));
    panel.querySelector('[data-save]').addEventListener('click', async () => {
      const days = Array.from(daysEl.querySelectorAll('.menu-day')).map((b) => ({
        day: b.querySelector('[data-f="day"]').value.trim(),
        dishes: b.querySelector('[data-f="dishes"]').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
        note: b.querySelector('[data-f="note"]').value.trim() || null,
      })).filter((d) => d.day || d.dishes.length);
      const nightGuards = Array.from(guardsEl.querySelectorAll('.menu-guard')).map((b) => ({
        day: b.querySelector('[data-g="day"]').value.trim(),
        name: b.querySelector('[data-g="name"]').value.trim(),
      })).filter((g) => g.day || g.name);
      if (!days.length) { toast('Menyen må ha minst én dag med innhold.'); return; }
      const menuBody = { days, note: panel.querySelector('[data-note]').value.trim() || null, nightGuards };
      const saveBtn = panel.querySelector('[data-save]'); saveBtn.disabled = true; saveBtn.textContent = 'Lagrer…';
      try {
        const r = await api(`/api/menus/${id}/parsed`, { method: 'PUT', body: { menu: menuBody } });
        previewMenus[id] = r.menu; toast('Meny lagret'); renderMenuReadonly(panel, id);
      } catch (ex) { toast(ex.message); saveBtn.disabled = false; saveBtn.textContent = 'Lagre meny'; }
    });
  }

  async function loadMenus() {
    const d = await api('/api/menus').catch(() => ({ menus: [] }));
    menuListEl.innerHTML = d.menus.length ? d.menus.map((m) => `
      <div style="border-top:1px solid #f0f2f4">
        <div style="display:flex;align-items:center;gap:12px;padding:12px 0">
          <div style="width:34px;height:34px;border-radius:9px;background:${m.hasFile ? 'var(--red-bg);color:var(--red)' : '#eef1f5;color:var(--slate)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800">${m.hasFile ? 'PDF' : '✎'}</div>
          <div style="flex:1;min-width:0"><div style="font-size:14.5px;font-weight:700;display:flex;align-items:center;gap:8px">${m.title} ${parseBadge(m.parseStatus)}</div><div style="font-size:12.5px;color:var(--muted-2)">${formatDateLong(m.uploadedAt.slice(0, 10))} · ${m.hasFile ? fmtSize(m.size) : 'lagt til manuelt'}</div></div>
          ${m.parseStatus === 'ok' ? `<button class="btn btn-ghost" data-preview="${m.id}" style="height:38px;padding:0 14px;font-size:13.5px">Forhåndsvis</button>` : ''}
          ${m.hasFile && m.parseStatus && m.parseStatus !== 'none' ? `<button class="btn btn-ghost" data-parse="${m.id}" title="Tolk menyen på nytt" style="height:38px;padding:0 14px;font-size:13.5px">Tolk på nytt</button>` : ''}
          ${m.hasFile ? `<button class="btn btn-ghost" data-open="${m.id}" style="height:38px;padding:0 14px;font-size:13.5px">Vis</button>` : ''}
          <button data-del="${m.id}" title="Slett" style="background:none;border:none;color:var(--muted-2);cursor:pointer;padding:6px"><span style="width:18px;height:18px;display:block">${nav.trash}</span></button>
        </div>
        <div data-preview-panel="${m.id}" style="display:none"></div>
      </div>`).join('') : '<div style="font-size:13.5px;color:var(--muted-2)">Ingen menyer lastet opp ennå.</div>';
    menuListEl.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => window.open(`/api/menus/${b.dataset.open}/file`, '_blank')));
    menuListEl.querySelectorAll('[data-preview]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.preview;
      const panel = menuListEl.querySelector(`[data-preview-panel="${id}"]`);
      if (panel.style.display !== 'none') { panel.style.display = 'none'; b.textContent = 'Forhåndsvis'; return; }
      b.disabled = true;
      try {
        const p = await api(`/api/menus/${id}/parsed`);
        if (p.status === 'ok' && p.menu) { previewMenus[id] = p.menu; renderMenuReadonly(panel, id); }
        else panel.innerHTML = `<div style="color:var(--red);font-size:13px;padding:8px 0">${esc(p.error || 'Ingen tolkning tilgjengelig ennå.')}</div>`;
        panel.style.display = 'block'; b.textContent = 'Skjul';
      } catch (ex) { toast(ex.message); }
      finally { b.disabled = false; }
    }));
    menuListEl.querySelectorAll('[data-parse]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = 'Tolker…';
      try {
        const r = await api(`/api/menus/${b.dataset.parse}/parse`, { method: 'POST' });
        toast(r.status === 'ok' ? 'Menyen ble tolket' : (r.error || 'Tolkning feilet'));
      } catch (ex) { toast(ex.message); }
      loadMenus();
    }));
    menuListEl.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Slette denne menyen?')) return;
      try { await api(`/api/menus/${b.dataset.del}`, { method: 'DELETE' }); loadMenus(); } catch (ex) { toast(ex.message); }
    }));
    if (d.menus.some((m) => m.parseStatus === 'pending')) setTimeout(loadMenus, 4000);
  }

  card.querySelector('#menuUpload').addEventListener('click', async () => {
    const fileInput = card.querySelector('#menuFile');
    const file = fileInput.files[0];
    if (!file) { toast('Velg en PDF-fil.'); return; }
    if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { toast('Filen må være en PDF.'); return; }
    const title = card.querySelector('#menuTitle').value.trim() || file.name.replace(/\.pdf$/i, '');
    const btn = card.querySelector('#menuUpload'); btn.disabled = true; btn.textContent = 'Laster opp…';
    try {
      const res = await fetch(`/api/menus?title=${encodeURIComponent(title)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file, credentials: 'same-origin',
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Opplasting feilet'); }
      card.querySelector('#menuTitle').value = ''; fileInput.value = '';
      toast('Meny lastet opp'); loadMenus();
    } catch (ex) { toast(ex.message); }
    finally { btn.disabled = false; btn.textContent = 'Last opp PDF'; }
  });

  // Legg til uten PDF: oppretter en tom oppføring og åpner redigeringsskjemaet
  // med det samme, slik at admin kan fylle inn middag og internatvakt direkte.
  card.querySelector('#menuManual').addEventListener('click', async () => {
    const titleInput = card.querySelector('#menuTitle');
    const title = titleInput.value.trim() || `Uke ${new Date().toLocaleDateString('nb-NO')}`;
    const btn = card.querySelector('#menuManual'); btn.disabled = true;
    try {
      const r = await api('/api/menus/manual', { method: 'POST', body: { title } });
      titleInput.value = '';
      await loadMenus();
      previewMenus[r.id] = r.menu;
      const panel = menuListEl.querySelector(`[data-preview-panel="${r.id}"]`);
      const previewBtn = menuListEl.querySelector(`[data-preview="${r.id}"]`);
      renderMenuEditor(panel, r.id);
      panel.style.display = 'block';
      if (previewBtn) previewBtn.textContent = 'Skjul';
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (ex) { toast(ex.message); }
    finally { btn.disabled = false; }
  });

  loadMenus();
}

// ── Innstillinger ────────────────────────────────────────────
// ── Varsler: push-varsel til alle i mobilappen ───────────────
async function renderVarsler(main) {
  header(main, 'Varsler', 'Send push-varsel til alle i appen');
  const s = await api('/api/settings').catch(() => null);
  const page = el(`
    <div class="page" style="max-width:560px">
      <div class="kpi" style="padding:8px 24px 20px;margin-bottom:20px">
        <div style="font-size:17px;font-weight:800;margin:18px 0 2px">Automatisk påminnelse: husk brannlisten</div>
        <div style="font-size:13px;color:var(--muted-2);margin-bottom:6px">Sender et push-varsel i mobilappen kl. 20:00 til elever som ikke har krysset seg av for kvelden. Tidspunktet er fast og uavhengig av åpningstidene for innsjekksvinduet i Innstillinger.</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0">
          <div><div style="font-size:15px;font-weight:700">Automatisk påminnelse</div><div style="font-size:13px;color:var(--muted-2);margin-top:2px">Kl. 20:00 hver dag.</div></div>
          <input type="checkbox" id="reminderEnabled" ${s?.fireReminderPushEnabled ? 'checked' : ''} style="width:22px;height:22px;flex:0 0 auto" />
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:14px">
          <button class="btn btn-ghost" id="testPushReminder" style="height:44px;padding:0 18px;font-size:14px">Send test nå</button>
        </div>
      </div>
      <div class="kpi" style="padding:8px 24px 20px;margin-bottom:20px">
        <div style="font-size:17px;font-weight:800;margin:18px 0 2px">Varsel om ukestjeneste</div>
        <div style="font-size:13px;color:var(--muted-2);margin-bottom:6px">Sender et push-varsel søndag kl. 18:00 til elevene som har kjøkkentjeneste eller internatvask uken som starter dagen etter. Har eleven begge deler samme uke, kommer det ett varsel om hver.</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0">
          <div><div style="font-size:15px;font-weight:700">Varsle om tjenesteuke</div><div style="font-size:13px;color:var(--muted-2);margin-top:2px">Søndag kl. 18:00, uken før.</div></div>
          <input type="checkbox" id="dutyPushEnabled" ${s?.dutyPushEnabled ? 'checked' : ''} style="width:22px;height:22px;flex:0 0 auto" />
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:14px">
          <button class="btn btn-ghost" id="testDutyPush" style="height:44px;padding:0 18px;font-size:14px">Send test nå</button>
        </div>
      </div>
      <div class="kpi" style="padding:24px">
        <div style="font-size:17px;font-weight:800;margin-bottom:14px">Send til alle nå</div>
        <div style="font-size:15px;font-weight:700;margin-bottom:6px">Tittel</div>
        <input class="field" id="title" maxlength="80" style="height:46px" />
        <div style="font-size:15px;font-weight:700;margin:18px 0 6px">Tekst</div>
        <textarea class="field" id="body" maxlength="240" rows="4" style="padding:12px;resize:vertical"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:18px">
          <button class="btn btn-primary" id="send" style="height:46px;padding:0 22px">Send til alle</button>
        </div>
      </div>
    </div>`);
  main.appendChild(page);

  page.querySelector('#reminderEnabled').addEventListener('change', async (e) => {
    const checkbox = e.target;
    checkbox.disabled = true;
    try {
      await api('/api/settings', { method: 'PUT', body: { fireReminderPushEnabled: checkbox.checked } });
      toast(checkbox.checked ? 'Automatisk påminnelse slått på' : 'Automatisk påminnelse slått av');
    } catch (ex) {
      checkbox.checked = !checkbox.checked;
      toast(ex.message);
    } finally {
      checkbox.disabled = false;
    }
  });

  page.querySelector('#dutyPushEnabled').addEventListener('change', async (e) => {
    const checkbox = e.target;
    checkbox.disabled = true;
    try {
      await api('/api/settings', { method: 'PUT', body: { dutyPushEnabled: checkbox.checked } });
      toast(checkbox.checked ? 'Varsel om tjenesteuke slått på' : 'Varsel om tjenesteuke slått av');
    } catch (ex) {
      checkbox.checked = !checkbox.checked;
      toast(ex.message);
    } finally {
      checkbox.disabled = false;
    }
  });

  page.querySelector('#testDutyPush').addEventListener('click', async () => {
    const btn = page.querySelector('#testDutyPush'); btn.disabled = true; const old = btn.textContent; btn.textContent = 'Sender…';
    try {
      const r = await api('/api/settings/test-duty-push', { method: 'POST' });
      toast(r.targeted
        ? `Uke ${r.isoWeek}: sendt til ${r.sent} av ${r.targeted} elever`
        : `Ingen har tjeneste i uke ${r.isoWeek} ennå`);
    } catch (ex) { toast(ex.message); }
    finally { btn.disabled = false; btn.textContent = old; }
  });

  page.querySelector('#testPushReminder').addEventListener('click', async () => {
    const btn = page.querySelector('#testPushReminder'); btn.disabled = true; const old = btn.textContent; btn.textContent = 'Sender…';
    try {
      const r = await api('/api/settings/test-push-reminder', { method: 'POST' });
      toast(`Sendt til ${r.sent} av ${r.targeted} elever`);
    } catch (ex) { toast(ex.message); }
    finally { btn.disabled = false; btn.textContent = old; }
  });

  page.querySelector('#send').addEventListener('click', async () => {
    const title = page.querySelector('#title').value.trim();
    const body = page.querySelector('#body').value.trim();
    if (!title || !body) { toast('Fyll ut tittel og tekst'); return; }
    const btn = page.querySelector('#send');
    btn.disabled = true; btn.textContent = 'Sender…';
    try {
      const r = await api('/api/push/broadcast', { method: 'POST', body: { title, body } });
      toast(`Sendt til ${r.sent} enhet${r.sent === 1 ? '' : 'er'}${r.failed ? ` (${r.failed} feilet)` : ''}`);
      page.querySelector('#title').value = '';
      page.querySelector('#body').value = '';
    } catch (ex) {
      toast(ex.message || 'Kunne ikke sende varsel');
    } finally {
      btn.disabled = false; btn.textContent = 'Send til alle';
    }
  });
}

async function renderSettings(main) {
  header(main, 'Innstillinger', 'Tidspunkter for andakt og brannliste, e-post, lagringstid');
  const page = el(`<div class="page" style="max-width:720px"><div id="body" style="color:var(--muted-2)">Laster…</div></div>`);
  main.appendChild(page);

  const s = await api('/api/settings').catch(() => null);
  if (!s) { page.querySelector('#body').textContent = 'Kunne ikke laste innstillinger.'; return; }

  const timeRow = (name, label, val, hint) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid #f0f2f4">
      <div><div style="font-size:15px;font-weight:700">${label}</div>${hint ? `<div style="font-size:13px;color:var(--muted-2);margin-top:2px">${hint}</div>` : ''}</div>
      <input type="time" name="${name}" value="${val}" class="field" style="width:150px;height:46px;flex:0 0 auto" />
    </div>`;

  // Tallrad (lagringstid) – samme oppsett som timeRow, men med enhet bak feltet.
  const numRow = (name, label, val, unit, min, max, hint) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid #f0f2f4">
      <div><div style="font-size:15px;font-weight:700">${label}</div>${hint ? `<div style="font-size:13px;color:var(--muted-2);margin-top:2px">${hint}</div>` : ''}</div>
      <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto">
        <input type="number" name="${name}" value="${val}" min="${min}" max="${max}" step="1" class="field" style="width:100px;height:46px" />
        <span style="color:var(--muted-2);font-weight:700;font-size:14px">${unit}</span>
      </div>
    </div>`;

  // Åpne–lukke-par for brannliste-vinduet.
  const windowRow = (label, openName, openVal, closeName, closeVal, hint) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid #f0f2f4">
      <div><div style="font-size:15px;font-weight:700">${label}</div>${hint ? `<div style="font-size:13px;color:var(--muted-2);margin-top:2px">${hint}</div>` : ''}</div>
      <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto">
        <input type="time" name="${openName}" value="${openVal}" class="field" style="width:118px;height:46px" title="Åpner" />
        <span style="color:var(--muted-2);font-weight:700">–</span>
        <input type="time" name="${closeName}" value="${closeVal}" class="field" style="width:118px;height:46px" title="Lukker" />
      </div>
    </div>`;

  page.querySelector('#body').innerHTML = `
    <div class="kpi" style="padding:8px 24px 20px;margin-bottom:20px">
      <div style="font-size:17px;font-weight:800;margin:18px 0 2px">Andakt</div>
      <div style="font-size:13px;color:var(--muted-2);margin-bottom:6px">Daglig samling på ukedagene.</div>
      ${timeRow('andaktDeadline', 'Frist for oppmøte', s.andaktDeadline, 'Oppmøte etter dette regnes som «for sent» / fravær.')}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0">
        <div><div style="font-size:15px;font-weight:700">Kun ukedager</div><div style="font-size:13px;color:var(--muted-2);margin-top:2px">Ingen andakt lørdag og søndag.</div></div>
        <input type="checkbox" name="andaktWeekdaysOnly" ${s.andaktWeekdaysOnly ? 'checked' : ''} style="width:22px;height:22px;flex:0 0 auto" />
      </div>
    </div>
    <div class="kpi" style="padding:8px 24px 20px;margin-bottom:20px">
      <div style="font-size:17px;font-weight:800;margin:18px 0 2px">Brannliste – innsjekksvindu</div>
      <div style="font-size:13px;color:var(--muted-2);margin-bottom:6px">Tidsrom om kvelden der elevene kan melde seg til stede (åpner–lukker). Utenfor vinduet er registrering stengt. Lukketid i helgen kan settes etter midnatt, f.eks. 00:30.</div>
      ${windowRow('Hverdag (søn–tor)', 'fireOpenWeekday', s.fireOpenWeekday, 'fireCloseWeekday', s.fireCloseWeekday, 'Skoledag neste dag.')}
      ${windowRow('Fredag', 'fireOpenFriday', s.fireOpenFriday, 'fireCloseFriday', s.fireCloseFriday, 'Kan stenge etter midnatt.')}
      ${windowRow('Lørdag', 'fireOpenSaturday', s.fireOpenSaturday, 'fireCloseSaturday', s.fireCloseSaturday, 'Kan stenge etter midnatt.')}
    </div>
    <div class="kpi" style="padding:8px 24px 20px;margin-bottom:20px">
      <div style="font-size:17px;font-weight:800;margin:18px 0 2px">E-post: gjesteforespørsler</div>
      <div style="font-size:13px;color:var(--muted-2);margin-bottom:6px">Send en e-post med én gang en elev melder gjest, med direktelenke til godkjenning.</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid #f0f2f4">
        <div><div style="font-size:15px;font-weight:700">Varsle ved ny forespørsel</div><div style="font-size:13px;color:var(--muted-2);margin-top:2px">Sendes umiddelbart, ikke på et fast tidspunkt.</div></div>
        <input type="checkbox" name="guestEmailEnabled" ${s.guestEmailEnabled ? 'checked' : ''} style="width:22px;height:22px;flex:0 0 auto" />
      </div>
      <div style="padding:16px 0">
        <div style="font-size:15px;font-weight:700;margin-bottom:6px">Mottaker (e-post)</div>
        <input type="email" name="guestEmailRecipient" value="${s.guestEmailRecipient || ''}" placeholder="internatleder@kongshaug.no" class="field" style="height:46px" autocapitalize="none" spellcheck="false" />
      </div>
    </div>
    <div class="kpi" style="padding:8px 24px 20px;margin-bottom:20px">
      <div style="font-size:17px;font-weight:800;margin:18px 0 2px">E-post: brannliste</div>
      <div style="font-size:13px;color:var(--muted-2);margin-bottom:6px">Send brannlisten automatisk til ansvarlig lærer, med PDF vedlagt.</div>
      ${!s.mailConfigured ? `<div style="background:var(--amber-bg);color:var(--amber-ink);border:1px solid #f0dca0;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;margin:6px 0 4px">⚠ Brevo er ikke satt opp ennå. Legg inn BREVO_API_KEY og MAIL_FROM i server/.env og start serveren på nytt.</div>` : ''}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid #f0f2f4">
        <div><div style="font-size:15px;font-weight:700">Automatisk utsending</div><div style="font-size:13px;color:var(--muted-2);margin-top:2px">Send hver dag på tidspunktet under.</div></div>
        <input type="checkbox" name="fireEmailEnabled" ${s.fireEmailEnabled ? 'checked' : ''} style="width:22px;height:22px;flex:0 0 auto" />
      </div>
      <div style="padding:16px 0;border-bottom:1px solid #f0f2f4">
        <div style="font-size:15px;font-weight:700;margin-bottom:6px">Mottaker (e-post)</div>
        <input type="email" name="fireEmailRecipient" value="${s.fireEmailRecipient || ''}" placeholder="larer@kongshaug.no" class="field" style="height:46px" autocapitalize="none" spellcheck="false" />
      </div>
      ${timeRow('fireEmailTime', 'Sendetidspunkt', s.fireEmailTime, 'Før kl. 18 sendes natt til i dag (natten som nettopp er ferdig). Fra kl. 18 sendes natt til i morgen (kveldens kommende liste).')}
      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button class="btn btn-ghost" id="testEmail" style="height:44px;padding:0 18px;font-size:14px">Send test nå</button>
      </div>
    </div>
    <div class="kpi" style="padding:8px 24px 20px;margin-bottom:20px">
      <div style="font-size:17px;font-weight:800;margin:18px 0 2px">E-post: middag (kjøkken)</div>
      <div style="font-size:13px;color:var(--muted-2);margin-bottom:6px">Send oversikt over hvor mange som spiser i dag.</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid #f0f2f4">
        <div><div style="font-size:15px;font-weight:700">Automatisk utsending</div><div style="font-size:13px;color:var(--muted-2);margin-top:2px">Send hver dag på tidspunktet under.</div></div>
        <input type="checkbox" name="kitchenEmailEnabled" ${s.kitchenEmailEnabled ? 'checked' : ''} style="width:22px;height:22px;flex:0 0 auto" />
      </div>
      <div style="padding:16px 0;border-bottom:1px solid #f0f2f4">
        <div style="font-size:15px;font-weight:700;margin-bottom:6px">Mottaker (e-post til kjøkkenet)</div>
        <input type="email" name="kitchenEmailRecipient" value="${s.kitchenEmailRecipient || ''}" placeholder="kjokken@kongshaug.no" class="field" style="height:46px" autocapitalize="none" spellcheck="false" />
      </div>
      <div style="padding:16px 0;border-bottom:1px solid #f0f2f4">
        <div style="font-size:15px;font-weight:700;margin-bottom:2px">Avsendernavn</div>
        <div style="font-size:13px;color:var(--muted-2);margin-bottom:6px">Navnet middags-e-posten vises med (kan være annet enn brannlisten). Trenger ingen ekstra API-nøkkel.</div>
        <input type="text" name="kitchenEmailFromName" value="${(s.kitchenEmailFromName || '').replace(/"/g, '&quot;')}" placeholder="Kongshaug Kjøkken" class="field" style="height:46px" />
      </div>
      ${timeRow('kitchenEmailTime', 'Sendetidspunkt', s.kitchenEmailTime, 'Sendes før middag, med dagens tall.')}
      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button class="btn btn-ghost" id="testKitchen" style="height:44px;padding:0 18px;font-size:14px">Send test nå</button>
      </div>
    </div>
    <div class="kpi" style="padding:8px 24px 20px;margin-bottom:20px">
      <div style="font-size:17px;font-weight:800;margin:18px 0 2px">Personvern: lagringstid</div>
      <div style="font-size:13px;color:var(--muted-2);margin-bottom:6px">Hvor lenge opplysningene blir liggende før de fjernes automatisk. Sletting er endelig – dataen kan ikke hentes tilbake etterpå.</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid #f0f2f4">
        <div><div style="font-size:15px;font-weight:700">Slett gammel historikk automatisk</div><div style="font-size:13px;color:var(--muted-2);margin-top:2px">Oppmøte, planlagt fravær, gjester, middagsvalg og kjøkkentjeneste eldre enn perioden under slettes for godt. Kjøres én gang i døgnet.</div></div>
        <input type="checkbox" name="retentionEnabled" ${s.retentionEnabled ? 'checked' : ''} style="width:22px;height:22px;flex:0 0 auto" />
      </div>
      ${numRow('retentionDays', 'Lagringstid', s.retentionDays, 'dager', 30, 3650, '365 dager ≈ ett skoleår.')}
      ${numRow('gpsRetentionHours', 'GPS-koordinater', s.gpsRetentionHours, 'timer', 1, 168, 'Etter dette nulles posisjonen, mens statusen (til stede / borte / for sent) blir stående. Brannlista trenger statusen, ikke stedet.')}
      <div style="display:flex;justify-content:flex-end;margin-top:14px">
        <button class="btn btn-ghost" id="runRetention" style="height:44px;padding:0 18px;font-size:14px">Kjør sletting nå</button>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:flex-end;gap:16px">
      <span id="msg" style="color:var(--green-ink);font-weight:700;display:none">Lagret ✓</span>
      <button class="btn btn-primary" id="save" style="height:48px;padding:0 26px">Lagre endringer</button>
    </div>`;

  const collectBody = () => {
    const val = (n) => page.querySelector(`[name=${n}]`);
    return {
      andaktDeadline: val('andaktDeadline').value,
      andaktWeekdaysOnly: val('andaktWeekdaysOnly').checked,
      fireOpenWeekday: val('fireOpenWeekday').value,
      fireCloseWeekday: val('fireCloseWeekday').value,
      fireOpenFriday: val('fireOpenFriday').value,
      fireCloseFriday: val('fireCloseFriday').value,
      fireOpenSaturday: val('fireOpenSaturday').value,
      fireCloseSaturday: val('fireCloseSaturday').value,
      fireEmailEnabled: val('fireEmailEnabled').checked,
      fireEmailRecipient: val('fireEmailRecipient').value.trim(),
      fireEmailTime: val('fireEmailTime').value,
      kitchenEmailEnabled: val('kitchenEmailEnabled').checked,
      kitchenEmailRecipient: val('kitchenEmailRecipient').value.trim(),
      kitchenEmailTime: val('kitchenEmailTime').value,
      kitchenEmailFromName: val('kitchenEmailFromName').value.trim(),
      guestEmailEnabled: val('guestEmailEnabled').checked,
      guestEmailRecipient: val('guestEmailRecipient').value.trim(),
      retentionEnabled: val('retentionEnabled').checked,
      retentionDays: Number(val('retentionDays').value),
      gpsRetentionHours: Number(val('gpsRetentionHours').value),
    };
  };

  page.querySelector('#save').addEventListener('click', async () => {
    const btn = page.querySelector('#save'); btn.disabled = true;
    try {
      await api('/api/settings', { method: 'PUT', body: collectBody() });
      const msg = page.querySelector('#msg'); msg.style.display = 'inline';
      setTimeout(() => { msg.style.display = 'none'; }, 2500);
    } catch (ex) { toast(ex.message); }
    finally { btn.disabled = false; }
  });

  page.querySelector('#testEmail').addEventListener('click', async () => {
    const btn = page.querySelector('#testEmail'); btn.disabled = true; const old = btn.textContent; btn.textContent = 'Sender…';
    try {
      await api('/api/settings', { method: 'PUT', body: collectBody() }); // lagre mottaker/tid først
      const r = await api('/api/settings/test-email', { method: 'POST' });
      toast('Test-e-post sendt til ' + r.recipient);
    } catch (ex) { toast(ex.message); }
    finally { btn.disabled = false; btn.textContent = old; }
  });

  page.querySelector('#runRetention').addEventListener('click', async () => {
    const dager = Number(page.querySelector('[name=retentionDays]').value);
    if (!confirm(`Slette all historikk eldre enn ${dager} dager nå? Dette kan ikke angres.`)) return;
    const btn = page.querySelector('#runRetention'); btn.disabled = true; const old = btn.textContent; btn.textContent = 'Rydder…';
    try {
      await api('/api/settings', { method: 'PUT', body: collectBody() }); // lagre periodene først
      const r = await api('/api/settings/run-retention', { method: 'POST' });
      const nullet = r.scrubbed.fire + r.scrubbed.andakt;
      // Null på begge betyr at alt allerede er ryddet – ikke at noe gikk galt.
      // «0 rader slettet · 0 posisjoner nullet» leses lett som en feil.
      const antall = (n, ental, flertall) => `${n} ${n === 1 ? ental : flertall}`;
      const deler = [];
      if (r.deleted.total) deler.push(`${antall(r.deleted.total, 'rad', 'rader')} slettet`);
      if (nullet) deler.push(`${antall(nullet, 'posisjon', 'posisjoner')} nullet`);
      toast(deler.length
        ? deler.join(' · ')
        : `Alt er allerede ryddet – ingenting er eldre enn ${r.retentionDays} dager, og alle posisjoner er nullet.`);
    } catch (ex) { toast(ex.message); }
    finally { btn.disabled = false; btn.textContent = old; }
  });

  page.querySelector('#testKitchen').addEventListener('click', async () => {
    const btn = page.querySelector('#testKitchen'); btn.disabled = true; const old = btn.textContent; btn.textContent = 'Sender…';
    try {
      await api('/api/settings', { method: 'PUT', body: collectBody() });
      const r = await api('/api/settings/test-kitchen-email', { method: 'POST' });
      toast('Test-e-post sendt til ' + r.recipient);
    } catch (ex) { toast(ex.message); }
    finally { btn.disabled = false; btn.textContent = old; }
  });
}

// ── 2.5 Storskjerm ───────────────────────────────────────────
let screenTimer = null;
async function renderStorskjerm() {
  clearInterval(screenTimer);
  root.innerHTML = '';
  const wrap = el(`
    <div style="height:100dvh;background:#f7f8fa;display:flex;flex-direction:column;align-items:center;position:relative;padding:28px 40px 32px;box-sizing:border-box">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:48px;height:48px;border-radius:14px;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center"><div style="width:26px;height:26px">${icon.home}</div></div>
        <div style="font-size:28px;font-weight:800;letter-spacing:-.02em">Kongshaug Musikkgymnas</div>
      </div>
      <div style="font-size:clamp(24px,4vw,40px);font-weight:800;letter-spacing:-.02em;margin-top:16px">Andakt · ${formatDateLong(todayStr())}</div>
      <div id="ssSub" style="font-size:clamp(16px,2vw,22px);font-weight:700;color:var(--muted-2);margin-top:4px">Skann koden for å registrere oppmøte</div>
      <div style="flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;margin-top:18px">
        <div id="ssQrBox" style="height:100%;aspect-ratio:1;max-width:100%;background:#fff;border:1px solid var(--line);border-radius:26px;padding:2.2%;box-sizing:border-box;box-shadow:0 18px 50px -18px rgba(15,26,43,.28);display:flex"><img id="qr" alt="QR" style="width:100%;height:100%;image-rendering:pixelated" /></div>
        <div id="ssClosed" style="display:none;text-align:center;max-width:80%"></div>
      </div>
      <button id="exit" style="position:absolute;top:28px;right:40px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-weight:700;color:var(--slate);cursor:pointer">Lukk</button>
    </div>`);
  root.appendChild(wrap);
  wrap.querySelector('#exit').addEventListener('click', () => go('/andakt'));

  async function tick() {
    try {
      const d = await api('/api/andakt/qr');
      const box = wrap.querySelector('#ssQrBox'), closed = wrap.querySelector('#ssClosed'), sub = wrap.querySelector('#ssSub');
      if (d.open) {
        wrap.querySelector('#qr').src = d.qr;
        box.style.display = 'flex'; closed.style.display = 'none';
        sub.textContent = 'Skann koden for å registrere oppmøte';
      } else {
        box.style.display = 'none'; closed.style.display = 'block';
        const m = d.state === 'before'
          ? { sub: `Andakt kl. ${d.deadline}`, big: 'QR-koden vises snart', small: `Registreringen åpner kl. ${d.opensAt}.` }
          : d.state === 'after'
            ? { sub: 'Registreringen er stengt', big: 'Andakten er over', small: `Var åpen til kl. ${d.closesAt}.` }
            : { sub: '', big: 'Ingen andakt i dag', small: 'Andakt holdes kun på ukedager.' };
        sub.textContent = m.sub;
        closed.innerHTML = `<div style="font-size:clamp(30px,5vw,54px);font-weight:800;letter-spacing:-.02em">${m.big}</div><div style="font-size:clamp(18px,2.4vw,26px);font-weight:700;color:var(--muted-2);margin-top:12px">${m.small}</div>`;
      }
    }
    catch (ex) { if (ex.status === 401) { go('/'); render(); } }
  }
  await tick();
  screenTimer = setInterval(tick, 4000);
}
window.addEventListener('hashchange', () => { if (!location.hash.includes('storskjerm')) clearInterval(screenTimer); });

// ── 2.6 Brannliste-oversikt ──────────────────────────────────
// ── Gjester: registrer gjester på internatet, godkjenn elev-forespørsler ──
async function renderGuests(main) {
  header(main, 'Gjester', 'Registreres på brannlisten for hver natt i perioden');
  const page = el(`<div class="page" style="max-width:760px">
    <div class="kpi" style="padding:8px 24px 22px;margin-bottom:22px">
      <div style="font-size:17px;font-weight:800;margin:18px 0 2px">Legg til gjest</div>
      <div style="font-size:13px;color:var(--muted-2);margin-bottom:14px">Gjesten føres på brannlisten i internatet den sover i, merket «Gjest hos [elev]».</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div style="grid-column:1/3;position:relative" id="hostField">
          <label class="field-label">Vert (elev)</label>
          <input type="text" class="field field-sm" id="hostSearch" placeholder="Søk opp elev…" autocomplete="off" />
          <div id="hostResults" style="display:none;position:absolute;left:0;right:0;top:100%;margin-top:4px;max-height:260px;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 32px rgba(16,24,40,.14);z-index:20"></div>
        </div>
        <div style="grid-column:1/3"><label class="field-label">Gjestens navn</label><input class="field field-sm" id="gname" placeholder="Fullt navn" /></div>
        <div style="grid-column:1/3"><label class="field-label">Kommentar (valgfritt)</label><input class="field field-sm" id="gnote" placeholder="F.eks. foreldre, søsken…" /></div>
        <div><label class="field-label">Internat gjesten sover i</label><select class="field field-sm" id="gdorm" style="background:#f7f8fa">${optionsHTML(DORMS, 'Velg internat…', '')}</select></div>
        <div><label class="field-label">Rom (valgfritt)</label><input class="field field-sm" id="groom" placeholder="Rom" /></div>
        <div><label class="field-label">Første natt</label><input class="field field-sm" type="date" id="gfrom" /><div id="gfromVist" style="font-size:12.5px;color:var(--muted-2);font-weight:600;margin-top:5px;min-height:17px"></div></div>
        <div><label class="field-label">Siste natt</label><input class="field field-sm" type="date" id="gto" /><div id="gtoVist" style="font-size:12.5px;color:var(--muted-2);font-weight:600;margin-top:5px;min-height:17px"></div></div>
      </div>
      <div style="background:#eef4fb;border:1px solid #d7e4f4;border-radius:10px;padding:11px 14px;margin-top:12px">
        <div style="font-size:12.5px;color:var(--slate,#33415a);line-height:1.5">🌙 Datoene er <b>netter</b>. «Siste natt» er den siste natten gjesten sover på internatet – gjesten reiser <b>morgenen etter</b>. Velger du samme dato i begge felt, er det ett døgn (én natt).</div>
        <div id="gpreview" style="font-size:13.5px;font-weight:800;color:var(--navy);margin-top:7px;display:none"></div>
      </div>
      <p id="gerr" style="color:var(--red-ink);font-size:14px;font-weight:600;margin:12px 0 0;display:none"></p>
      <button class="btn btn-primary" id="gadd" style="height:46px;padding:0 22px;margin-top:16px">Legg til gjest</button>
    </div>
    <div id="pendingBox"></div>
    <div style="font-size:15px;font-weight:800;margin:22px 2px 10px">Kommende gjester</div>
    <div id="upcomingBox" style="background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden"></div>
  </div>`);
  main.appendChild(page);

  const today = todayStr();
  page.querySelector('#gfrom').value = today;
  page.querySelector('#gto').value = today;

  // Vertsvalg: søk blant aktive elever, sortert på navn.
  const students = (await api('/api/users').catch(() => ({ users: [] }))).users
    .filter((u) => u.role === 'student' && u.active)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'nb'));

  let hostId = null;
  const hostField = page.querySelector('#hostField');
  const hostSearch = page.querySelector('#hostSearch');
  const hostResults = page.querySelector('#hostResults');

  function selectHost(u) {
    hostId = u.id;
    hostSearch.value = u.fullName;
    hostResults.style.display = 'none';
    // Forhåndsvelg vertens eget internat som gjestens internat (kan endres).
    if (u.dorm && !page.querySelector('#gdorm').value) page.querySelector('#gdorm').value = u.dorm;
  }

  function renderHostResults() {
    hostId = null;
    const q = hostSearch.value.trim().toLowerCase();
    if (!q) { hostResults.style.display = 'none'; return; }
    const hits = students.filter((u) => u.fullName.toLowerCase().includes(q) || (u.dorm || '').toLowerCase().includes(q)).slice(0, 8);
    hostResults.innerHTML = hits.length ? hits.map((u) => `
      <button type="button" data-host="${u.id}" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid #f2f4f6;padding:11px 14px;cursor:pointer">
        <span style="flex:1;font-size:14px;font-weight:700">${esc(u.fullName)}</span>
        <span style="font-size:12.5px;color:var(--muted-2);font-weight:600">${esc(u.dorm || '')}</span>
      </button>`).join('') : '<div style="padding:14px;color:var(--muted-2);font-size:13.5px">Ingen treff.</div>';
    hostResults.style.display = 'block';
    hostResults.querySelectorAll('[data-host]').forEach((b) => b.addEventListener('click', () => {
      const u = students.find((s) => s.id === Number(b.dataset.host));
      if (u) selectHost(u);
    }));
  }
  hostSearch.addEventListener('input', renderHostResults);
  hostSearch.addEventListener('focus', renderHostResults);
  // Klikk utenfor lukker trefflisten (uten å spise klikket på et treff).
  document.addEventListener('click', (e) => {
    if (!hostField.contains(e.target)) hostResults.style.display = 'none';
  });

  const dates = (g) => g.startDate === g.endDate ? formatDateNorsk(g.startDate) : formatDateNorsk(g.startDate) + ' – ' + formatDateNorsk(g.endDate);
  // Datoene er NETTER: en dato = natten fra den datoen til dagen etter. Gjesten
  // sover altså siste natt og reiser morgenen etter siste dato.
  const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const nights = (g) => Math.round((parseD(g.endDate) - parseD(g.startDate)) / 86400000) + 1;
  const dayAfter = (s) => { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + 1)); };
  const stayInfo = (g) => `${nights(g)} ${nights(g) === 1 ? 'natt' : 'netter'} · reiser ${formatDateNorsk(dayAfter(g.endDate))}`;

  // Live forhåndsvisning i skjemaet: antall netter + når gjesten reiser, så
  // admin ser med en gang hva datovalget faktisk betyr.
  const gpreview = page.querySelector('#gpreview');
  function updateGuestPreview() {
    const from = page.querySelector('#gfrom').value, to = page.querySelector('#gto').value;
    if (!from || !to || to < from) { gpreview.style.display = 'none'; return; }
    const n = nights({ startDate: from, endDate: to });
    gpreview.textContent = `${n} ${n === 1 ? 'natt' : 'netter'} · gjesten reiser ${formatDateNorsk(dayAfter(to))}`;
    gpreview.style.display = 'block';
  }
  page.querySelector('#gfrom').addEventListener('change', updateGuestPreview);
  page.querySelector('#gto').addEventListener('change', updateGuestPreview);
  visDatoPåNorsk(page.querySelector('#gfrom'), page.querySelector('#gfromVist'));
  visDatoPåNorsk(page.querySelector('#gto'), page.querySelector('#gtoVist'));
  updateGuestPreview();

  // Godkjent/kommende gjest: viser tildelt internat + rom.
  const upcomingRow = (g) => `
    <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #f2f4f6">
      <div style="width:40px;height:40px;border-radius:11px;background:var(--amber-bg);color:var(--amber-ink);display:flex;align-items:center;justify-content:center;flex:0 0 auto">${nav.guest}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:800">${esc(g.guestName)} <span style="font-size:12.5px;font-weight:700;color:var(--muted-2)">· ${esc(g.dorm || '–')}${g.room ? ' · rom ' + esc(g.room) : ''}</span></div>
        <div style="font-size:13px;color:var(--muted-2);font-weight:600">Hos ${esc(g.hostName)}${g.hostDorm && g.hostDorm !== g.dorm ? ` (${esc(g.hostDorm)})` : ''} · ${dates(g)}${g.note ? ' · ' + esc(g.note) : ''}</div>
        <div style="font-size:12.5px;color:var(--amber-ink);font-weight:700;margin-top:2px">🌙 ${stayInfo(g)}</div>
      </div>
      <button class="btn btn-ghost" data-del="${g.id}" style="height:40px;padding:0 14px;font-size:13.5px;flex:0 0 auto">Slett</button>
    </div>`;

  // Ventende forespørsel: admin tildeler internat + rom før godkjenning.
  const pendingRow = (g) => `
    <div style="padding:14px 18px;border-bottom:1px solid #f2f4f6">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;border-radius:11px;background:var(--amber-bg);color:var(--amber-ink);display:flex;align-items:center;justify-content:center;flex:0 0 auto">${nav.guest}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:800">${esc(g.guestName)}${g.note ? ` <span style="font-size:12.5px;font-weight:700;color:var(--amber-ink)">· ${esc(g.note)}</span>` : ''}</div>
          <div style="font-size:13px;color:var(--muted-2);font-weight:600">Hos ${esc(g.hostName)}${g.hostDorm ? ` (${esc(g.hostDorm)})` : ''} · ${dates(g)} · meldt av eleven</div>
          <div style="font-size:12.5px;color:var(--amber-ink);font-weight:700;margin-top:2px">🌙 ${stayInfo(g)}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end;margin-top:12px;flex-wrap:wrap">
        <div><label class="field-label" style="margin-bottom:4px">Internat</label><select class="field field-sm" data-adorm="${g.id}" style="background:#f7f8fa;width:180px">${optionsHTML(DORMS, 'Velg internat…', g.hostDorm || '')}</select></div>
        <div><label class="field-label" style="margin-bottom:4px">Rom</label><input class="field field-sm" data-aroom="${g.id}" placeholder="Rom" style="width:90px" /></div>
        <div style="flex:1"></div>
        <button class="btn btn-primary" data-approve="${g.id}" style="height:46px;padding:0 18px;font-size:14px">Godkjenn</button>
        <button class="btn btn-ghost" data-del="${g.id}" style="height:46px;padding:0 14px;font-size:14px">Avvis</button>
      </div>
    </div>`;

  async function load() {
    const d = await api('/api/firelist/guests').catch(() => ({ pending: [], upcoming: [] }));
    const pendingBox = page.querySelector('#pendingBox');
    pendingBox.innerHTML = d.pending.length ? `
      <div style="font-size:15px;font-weight:800;margin:2px 2px 10px;color:var(--amber-ink)">Venter på godkjenning (${d.pending.length})</div>
      <div style="background:#fff;border:1px solid var(--amber);border-radius:16px;overflow:hidden;margin-bottom:8px">
        ${d.pending.map(pendingRow).join('')}
      </div>` : '';
    const upBox = page.querySelector('#upcomingBox');
    upBox.innerHTML = d.upcoming.length
      ? d.upcoming.map(upcomingRow).join('')
      : '<div style="padding:22px;color:var(--muted-2);font-size:14px">Ingen kommende gjester.</div>';

    page.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.approve;
      const dorm = page.querySelector(`[data-adorm="${id}"]`).value;
      const room = page.querySelector(`[data-aroom="${id}"]`).value.trim();
      if (!dorm) { toast('Velg internat for gjesten.'); return; }
      b.disabled = true;
      try { await api(`/api/firelist/guests/${id}/approve`, { method: 'POST', body: { dorm, room } }); toast('Gjest godkjent'); load(); }
      catch (ex) { toast(ex.message); b.disabled = false; }
    }));
    page.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Slette denne gjesten?')) return;
      try { await api(`/api/firelist/guests/${b.dataset.del}`, { method: 'DELETE' }); load(); }
      catch (ex) { toast(ex.message); }
    }));
  }

  page.querySelector('#gadd').addEventListener('click', async () => {
    const gerr = page.querySelector('#gerr'); gerr.style.display = 'none';
    const body = {
      hostUserId: hostId,
      guestName: page.querySelector('#gname').value.trim(),
      note: page.querySelector('#gnote').value.trim(),
      dorm: page.querySelector('#gdorm').value,
      room: page.querySelector('#groom').value.trim(),
      startDate: page.querySelector('#gfrom').value,
      endDate: page.querySelector('#gto').value,
    };
    if (!body.hostUserId) { gerr.textContent = 'Velg hvilken elev som har gjesten.'; gerr.style.display = 'block'; return; }
    const btn = page.querySelector('#gadd'); btn.disabled = true;
    try {
      await api('/api/firelist/guests', { method: 'POST', body });
      page.querySelector('#gname').value = ''; page.querySelector('#gnote').value = '';
      hostSearch.value = ''; hostId = null;
      page.querySelector('#gdorm').value = ''; page.querySelector('#groom').value = '';
      toast('Gjest lagt til'); load();
    } catch (ex) { gerr.textContent = ex.message; gerr.style.display = 'block'; }
    finally { btn.disabled = false; }
  });

  load();
}

async function renderBrannliste(main) {
  let d = await api('/api/firelist/overview').catch(() => null);
  header(main, `Brannliste — natt til ${d ? formatDateLong(shiftDate(d.nightDate, 1)) : ''}`, 'Klikk knappene i hver rad for å sette status manuelt',
    d ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span id="hcPresent" class="pill" style="background:var(--navy);color:#fff;font-size:15px;padding:10px 18px;white-space:nowrap">Til stede: ${d.present} / ${d.total}</span>
        <span id="hcAway" class="pill" style="background:#e7edf5;color:var(--navy);padding:10px 16px;white-space:nowrap">${d.away} borte</span>
        <span id="hcMissing" class="pill pill-red" style="padding:10px 16px;white-space:nowrap">${d.missing} mangler</span>
        <button class="btn btn-ghost" id="exportPdf" style="height:40px;padding:0 16px;font-size:14px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>Eksporter PDF</button>
      </div>` : '');
  const page = el(`<div class="page"></div>`);
  main.appendChild(page);
  if (!d) { page.innerHTML = '<p>Kunne ikke laste brannlisten.</p>'; return; }
  main.querySelector('#exportPdf')?.addEventListener('click', () => exportFireListPdf(d));

  const filters = ['Alle', ...d.dorms.map((x) => x.dorm)];
  let activeFilter = 'Alle';
  const chips = el(`<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">${filters.map((f) => `<button class="chip" data-f="${esc(f)}" style="height:46px;padding:0 22px;border-radius:99px;font-size:15px;font-weight:700;border:1.5px solid var(--line-2);background:#fff;color:var(--slate);cursor:pointer;touch-action:manipulation">${esc(f)}</button>`).join('')}</div>`);
  // Bredere minstebredde enn før: radene rommer nå 48px-knapper uten å bli trange.
  // min() gjør at kolonnen krymper i stedet for å stikke utenfor på smale skjermer.
  const grid = el(`<div id="grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(420px,100%),1fr));gap:20px"></div>`);
  page.appendChild(chips); page.appendChild(grid);

  function updateHeaderCounts() {
    const set = (id, t) => { const e = main.querySelector(id); if (e) e.textContent = t; };
    set('#hcPresent', `Til stede: ${d.present} / ${d.total}`);
    set('#hcAway', `${d.away} borte`);
    set('#hcMissing', `${d.missing} mangler`);
  }

  async function setStatus(uid, status) {
    try {
      await api('/api/firelist/admin-checkin', { method: 'POST', body: { userId: uid, status } });
      d = await api('/api/firelist/overview');
      updateHeaderCounts();
      draw();
    } catch (ex) { toast(ex.message); }
  }

  // Brannlisten krysses av på nettbrett, ofte i hui og hast. Knappene er derfor
  // 48×48 – minste trykkflate som er komfortabel med finger (Apple HIG: 44pt).
  function statusBtn(uid, set, ic, activeColor, active, title) {
    return `<button data-uid="${uid}" data-set="${set}" title="${title}" style="width:48px;height:48px;border-radius:12px;border:1.5px solid ${active ? activeColor : 'var(--line-2)'};background:${active ? activeColor : '#fff'};color:${active ? '#fff' : 'var(--muted-2)'};cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;touch-action:manipulation"><span style="width:22px;height:22px;display:block">${ic}</span></button>`;
  }

  // Gjesterad: ingen status-knapper, merket «Gjest hos [vert]». Vises rett under
  // verten når de deler internat, ellers i gjestens internat med vertens angitt.
  function guestRowHTML(g, sameDorm) {
    const hos = sameDorm ? `Gjest hos ${esc(g.hostName)}` : `Gjest hos ${esc(g.hostName)} (${esc(g.hostDorm || '–')})`;
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px 12px 20px;border-bottom:1px solid #f2f4f6;background:#fbf6ee">
        <span class="dot" style="background:var(--amber)"></span>
        <div style="flex:1;min-width:0">
          <div style="font-size:19px;font-weight:700;line-height:1.25">${esc(g.name)}</div>
          <div style="font-size:14px;color:var(--amber-ink);font-weight:700;margin-top:2px">Rom ${esc(g.room ?? '–')} · ${hos}</div>
        </div>
        <span class="pill pill-amber" style="flex:0 0 auto">Gjest</span>
      </div>`;
  }

  function draw() {
    const dorms = activeFilter === 'Alle' ? d.dorms : d.dorms.filter((x) => x.dorm === activeFilter);
    grid.innerHTML = dorms.map((dorm) => {
      const guests = dorm.guests || [];
      const hostIds = new Set(dorm.students.map((s) => s.id));
      const studentRows = dorm.students.map((s) => {
        const dot = s.status === 'present' ? 'var(--green)' : s.status === 'away' ? 'var(--navy)' : 'var(--red)';
        const rowBg = s.status === 'missing' ? 'background:#fdf5f4' : (s.status === 'away' ? 'background:#f4f6fa' : '');
        const timeTitle = s.status === 'present' && s.checkedAt ? ' · ' + formatTime(s.checkedAt) : '';
        // Gjester hvis vert er denne eleven (samme internat) – rett under.
        const own = guests.filter((g) => g.hostId === s.id).map((g) => guestRowHTML(g, true)).join('');
        return `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 16px 12px 20px;border-bottom:1px solid #f2f4f6;${rowBg}">
            <span class="dot" style="background:${dot}"></span>
            <div style="flex:1;min-width:0">
              <div style="font-size:19px;font-weight:700;line-height:1.25">${esc(s.fullName)}</div>
              <div style="font-size:14px;color:var(--muted-2);font-weight:600;margin-top:2px">Rom ${esc(s.room ?? '–')}</div>
            </div>
            <div style="display:flex;gap:8px;flex:0 0 auto">
              ${statusBtn(s.id, 'present', icon.check, 'var(--green)', s.status === 'present', 'Sett til stede' + timeTitle)}
              ${statusBtn(s.id, 'away', icon.home, 'var(--navy)', s.status === 'away', 'Sett borte')}
              ${statusBtn(s.id, 'clear', icon.x, 'var(--red)', s.status === 'missing', 'Fjern (ikke registrert)')}
            </div>
          </div>${own}`;
      }).join('');
      // Gjester som sover her, men hvor verten bor i et annet internat – nederst.
      const orphanRows = guests.filter((g) => !hostIds.has(g.hostId)).map((g) => guestRowHTML(g, false)).join('');
      return `
      <div style="background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:#f7f8fa;border-bottom:1px solid var(--line)"><span style="font-size:19px;font-weight:800">${esc(dorm.dorm)}</span><span style="font-size:15px;font-weight:700;color:var(--muted-2)">${dorm.present} av ${dorm.total}${guests.length ? ` · ${guests.length} gjest${guests.length > 1 ? 'er' : ''}` : ''}</span></div>
        ${studentRows}${orphanRows}
      </div>`;
    }).join('');
    grid.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => setStatus(Number(b.dataset.uid), b.dataset.set)));
  }
  chips.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    activeFilter = c.dataset.f;
    chips.querySelectorAll('.chip').forEach((x) => { x.style.background = '#fff'; x.style.color = 'var(--slate)'; x.style.border = '1px solid var(--line-2)'; });
    c.style.background = 'var(--navy)'; c.style.color = '#fff'; c.style.border = '1px solid var(--navy)';
    draw();
  }));
  chips.querySelector('.chip').click();
}

// ── Ekte .xlsx uten avhengigheter ────────────────────────────
// Bygger en gyldig Excel-fil ved å sette sammen OOXML-delene og pakke dem i en
// ZIP (lagret/ukomprimert) med egen CRC32. Tekst lagres som UTF-8 – norske tegn
// bevares (ingen ASCII-konvertering).
function xmlEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}
function colLetter(i) {
  let s = '', n = i + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function crc32(bytes) {
  if (!crc32.table) {
    const t = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    crc32.table = t;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ crc32.table[(crc ^ bytes[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function zipStore(files) {
  const enc = new TextEncoder();
  const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
  const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  const parts = [], central = [];
  let offset = 0, entries = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
    parts.push(new Uint8Array(local), name, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += local.length + name.length + data.length;
    entries++;
  }
  let centralSize = 0;
  for (const c of central) centralSize += c.length;
  const eocd = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entries), ...u16(entries), ...u32(centralSize), ...u32(offset), ...u16(0)]);
  return new Blob([...parts, ...central, eocd], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
// rows: array av rader; hver celle er enten en streng (stil 0) eller { v, s } der
// s er stilindeks: 1=overskrift, 2=rød (fravær), 3=gul (for sent).
// cols: valgfri array med kolonnebredder.
function buildXlsx({ rows, sheetName = 'Ark1', cols = [] }) {
  const cellXml = (c, ref) => {
    const cell = (c && typeof c === 'object') ? c : { v: c };
    const s = cell.s ? ` s="${cell.s}"` : '';
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(cell.v)}</t></is></c>`;
  };
  const rowsXml = rows.map((row, r) =>
    `<row r="${r + 1}">${row.map((c, i) => cellXml(c, colLetter(i) + (r + 1))).join('')}</row>`
  ).join('');
  const colsXml = cols.length
    ? `<cols>${cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    + '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFBE0E0"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFDF0CE"/></patternFill></fill></fills>'
    + '<borders count="1"><border/></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="4">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
    + '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>'
    + '<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: styles },
    { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${colsXml}<sheetData>${rowsXml}</sheetData></worksheet>` },
  ];
  return zipStore(files);
}
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Åpner en ren, utskriftsvennlig visning av brannlisten og starter utskrift
// (velg «Lagre som PDF» i dialogen, eller skriv ut på papir).
function exportFireListPdf(d) {
  const html = buildFireListPrintHTML(d);
  const w = window.open('', '_blank');
  if (!w) { toast('Tillat popup-vinduer for å eksportere PDF.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function buildFireListPrintHTML(d) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nightLabel = formatDateLong(shiftDate(d.nightDate, 1));
  const printedAt = new Date().toLocaleString('nb-NO', { dateStyle: 'long', timeStyle: 'short' });
  const statusText = { present: 'Til stede', away: 'Borte', missing: 'MANGLER' };

  const guestTr = (g, sameDorm) => `<tr class="guest">
    <td>${esc(g.name)}</td>
    <td>${esc(g.room ?? '–')}</td>
    <td colspan="2">Gjest hos ${esc(g.hostName)}${sameDorm ? '' : ` (${esc(g.hostDorm || '–')})`}</td>
  </tr>`;
  const dorms = d.dorms.map((dorm) => {
    const guests = dorm.guests || [];
    const hostIds = new Set(dorm.students.map((s) => s.id));
    const rows = dorm.students.map((s) => `<tr class="${s.status === 'missing' ? 'miss' : ''}">
            <td>${esc(s.fullName)}</td>
            <td>${esc(s.room ?? '–')}</td>
            <td>${statusText[s.status] || ''}</td>
            <td>${s.status === 'present' ? formatTime(s.checkedAt) : ''}</td>
          </tr>` + guests.filter((g) => g.hostId === s.id).map((g) => guestTr(g, true)).join('')).join('')
      + guests.filter((g) => !hostIds.has(g.hostId)).map((g) => guestTr(g, false)).join('');
    return `
    <div class="dorm">
      <h2>${esc(dorm.dorm)} <span class="cnt">${dorm.present} / ${dorm.total} til stede${guests.length ? ` · ${guests.length} gjest${guests.length > 1 ? 'er' : ''}` : ''}</span></h2>
      <table>
        <thead><tr><th>Navn</th><th class="c-room">Rom</th><th class="c-status">Status</th><th class="c-time">Tid</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="nb"><head><meta charset="utf-8"><title>Brannliste ${esc(d.nightDate)}</title>
<style>
  *{font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}
  body{margin:24px;color:#000}
  h1{font-size:20px;margin:0 0 2px}
  .meta{font-size:12px;color:#333}
  .summary{font-size:14px;font-weight:bold;margin:10px 0 18px;padding:8px 0;border-top:2px solid #000;border-bottom:2px solid #000}
  .dorm{margin-bottom:16px;page-break-inside:avoid}
  .dorm h2{font-size:14px;margin:0 0 4px;padding-bottom:3px;border-bottom:2px solid #000;display:flex;justify-content:space-between;align-items:baseline}
  .cnt{font-weight:normal;font-size:12px;color:#444}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #bbb;vertical-align:top}
  th{font-size:10.5px;text-transform:uppercase;color:#555;letter-spacing:.03em}
  .c-room{width:56px}.c-status{width:104px}.c-time{width:64px}
  tr.guest td{font-style:italic;color:#6b4e00}
  tr.miss td{font-weight:bold}
  .toolbar{margin-top:26px}
  .toolbar button{font-size:14px;padding:8px 16px;cursor:pointer}
  @page{size:A4;margin:15mm}
  @media print{body{margin:0}.toolbar{display:none}}
</style></head>
<body>
  <h1>Brannliste — natt til ${esc(nightLabel)}</h1>
  <div class="meta">Kongshaug Musikkgymnas · skrevet ut ${esc(printedAt)}</div>
  <div class="summary">Til stede: ${d.present} / ${d.total} &nbsp;·&nbsp; Borte: ${d.away} &nbsp;·&nbsp; Mangler: ${d.missing}</div>
  ${dorms}
  <div class="toolbar"><button onclick="window.print()">Skriv ut / lagre som PDF</button></div>
  <script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>
</body></html>`;
}

// 'YYYY-MM-DD' -> 'DD.MM.ÅÅÅÅ', norsk tallformat for datoer i Excel-eksport.
// Cellene i buildXlsx skrives som ren tekst (inlineStr), ikke ekte dato-typer,
// så dette er hva som faktisk vises – ISO-formatet ville stått uendret ellers.
function formatDateNorsk(dstr) {
  const [y, m, dd] = String(dstr).split('-');
  return `${dd}.${m}.${y}`;
}

function shiftDate(dstr, days) {
  const [y, m, dd] = dstr.split('-').map(Number);
  return ymd(new Date(y, m - 1, dd + days));
}

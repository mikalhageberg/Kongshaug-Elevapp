import { api, getPosition, formatTime, formatDateLong, formatDateShort, formatWeekRange, formatNightRange, countNights, icon } from '/shared/api.js';

const root = document.getElementById('root');
let user = null;

// ── Hjelpere ─────────────────────────────────────────────────
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
// Escaper tekst før den settes inn som HTML (menytekst kommer fra tolket PDF).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = el(`<div class="toast">${msg}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
const go = (hash) => { location.hash = hash; };

function initials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// Tidsriktig hilsen basert på klokkeslettet.
function greeting(d = new Date()) {
  const h = d.getHours();
  if (h >= 23 || h < 5) return 'God natt';
  if (h < 10) return 'God morgen';
  if (h < 14) return 'God formiddag';
  if (h < 18) return 'God ettermiddag';
  return 'God kveld';
}

// ── Oppstart ─────────────────────────────────────────────────
init();
async function init() {
  try {
    const data = await api('/api/auth/me');
    user = data.user;
    if (user.role === 'admin') { location.href = '/admin/'; return; }
  } catch { user = null; }
  window.addEventListener('hashchange', render);
  render();
}

function render() {
  if (!user) return renderLogin();
  if (user.mustChangePassword) return renderChangePassword();
  const route = (location.hash || '#/').slice(2);
  if (route.startsWith('planlegg')) return renderPlanlegg();
  if (route.startsWith('brannliste')) return renderBrannliste();
  if (route.startsWith('andakt')) return renderAndakt();
  if (route.startsWith('middag')) return renderMiddag();
  return renderDashboard();
}

// ── 1.1 Innlogging ───────────────────────────────────────────
function renderLogin() {
  root.innerHTML = '';
  const screen = el(`
    <div class="screen fadein" style="justify-content:center">
      <div class="pad" style="padding:0 26px">
        <div style="display:flex;align-items:center;gap:11px;margin-bottom:26px">
          <div style="width:44px;height:44px;border-radius:12px;background:var(--navy);display:flex;align-items:center;justify-content:center;color:#fff">${icon.home}</div>
          <div><div style="font-size:19px;font-weight:800;line-height:1.1">Kongshaug</div><div style="font-size:13px;font-weight:700;color:var(--muted-2)">Musikkgymnas</div></div>
        </div>
        <div class="h1" style="font-size:28px">Logg inn</div>
        <p class="sub" style="margin:8px 0 24px">Elevapp · brannliste og andakt</p>
        <div id="feideBox"></div>
        <form id="loginForm">
          <label class="field-label">Brukernavn</label>
          <input class="field" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required />
          <label class="field-label" style="margin-top:16px">Passord</label>
          <input class="field" name="password" type="password" autocomplete="current-password" required />
          <p id="err" style="color:var(--red-ink);font-size:14px;font-weight:600;margin:14px 0 0;display:none"></p>
          <button class="btn btn-primary" type="submit" style="width:100%;height:56px;font-size:17px;margin-top:22px">Logg inn</button>
        </form>
        <p style="font-size:13px;color:var(--muted-2);text-align:center;margin:16px 0 0;line-height:1.5">Elever får utdelt bruker av administrasjonen.</p>
        <p style="font-size:12.5px;text-align:center;margin:12px 0 0"><a href="/personvern/" target="_blank" style="color:var(--muted-2);font-weight:600">Personvernerklæring</a></p>
      </div>
    </div>`);
  root.appendChild(screen);
  const form = screen.querySelector('#loginForm');
  const err = screen.querySelector('#err');

  // Vis en feilmelding hvis vi nettopp kom tilbake fra Feide med en feil.
  const feideErr = new URLSearchParams(location.search).get('feide_error');
  if (feideErr) { err.textContent = feideErr; err.style.display = 'block'; history.replaceState(null, '', '/app/'); }

  // Vis «Logg inn med Feide» hvis skolen har aktivert det.
  api('/api/config').then((cfg) => {
    if (!cfg.feide) return;
    screen.querySelector('#feideBox').innerHTML = `
      <a href="/api/auth/feide/login" class="btn" style="width:100%;height:54px;font-size:16px;background:#1a1a2e;color:#fff;text-decoration:none;margin-bottom:6px">Logg inn med Feide</a>
      <div style="display:flex;align-items:center;gap:12px;color:var(--muted-2);font-size:13px;margin:14px 0 18px"><div style="flex:1;height:1px;background:var(--line-2)"></div>eller<div style="flex:1;height:1px;background:var(--line-2)"></div></div>`;
  }).catch(() => {});
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.style.display = 'none';
    const btn = form.querySelector('button');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: {
        username: form.username.value, password: form.password.value } });
      user = data.user;
      if (user.role === 'admin') { location.href = '/admin/'; return; }
      go('/');
      render();
    } catch (ex) {
      err.textContent = ex.message; err.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Logg inn';
    }
  });
}

// Påtvunget passordbytte ved første innlogging
function renderChangePassword() {
  root.innerHTML = '';
  const screen = el(`
    <div class="screen fadein" style="justify-content:center">
      <div class="pad" style="padding:0 26px">
        <div style="width:56px;height:56px;border-radius:16px;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:18px"><div style="width:28px;height:28px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div></div>
        <div class="h1" style="font-size:26px">Velg ditt eget passord</div>
        <p class="sub" style="line-height:1.5;margin:10px 0 22px">Du logget inn med et midlertidig passord fra skolen. Velg et nytt passord som bare du kjenner.</p>
        <form id="cpf">
          <label class="field-label">Nytt passord</label>
          <input class="field" name="p1" type="password" autocomplete="new-password" required />
          <label class="field-label" style="margin-top:16px">Gjenta nytt passord</label>
          <input class="field" name="p2" type="password" autocomplete="new-password" required />
          <p class="sub" style="margin:10px 2px 0">Minst 8 tegn.</p>
          <p id="err" style="color:var(--red-ink);font-size:14px;font-weight:600;margin:14px 0 0;display:none"></p>
          <button class="btn btn-primary" type="submit" style="width:100%;height:56px;font-size:17px;margin-top:22px">Lagre og fortsett</button>
        </form>
      </div>
    </div>`);
  root.appendChild(screen);
  const form = screen.querySelector('#cpf');
  const err = screen.querySelector('#err');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.style.display = 'none';
    if (form.p1.value !== form.p2.value) { err.textContent = 'Passordene er ikke like'; err.style.display = 'block'; return; }
    if (form.p1.value.length < 8) { err.textContent = 'Passordet må ha minst 8 tegn'; err.style.display = 'block'; return; }
    const btn = form.querySelector('button'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { newPassword: form.p1.value } });
      user.mustChangePassword = false;
      go('/'); render();
    } catch (ex) { err.textContent = ex.message; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Lagre og fortsett'; }
  });
}

// Bunn-navigasjon
function tabbar(active) {
  const tab = (id, label, ic, hash) => `
    <button class="tab ${active === id ? 'active' : ''}" data-go="${hash}">${ic}<span>${label}</span></button>`;
  const bar = el(`<div class="tabbar">
    ${tab('home', 'Hjem', icon.home, '/')}
    ${tab('brann', 'Brannliste', icon.flame, '/brannliste')}
    ${tab('andakt', 'Andakt', icon.book, '/andakt')}
    ${tab('middag', 'Middag', icon.food, '/middag')}
  </div>`);
  bar.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  return bar;
}

// ── 1.2 Dashboard ────────────────────────────────────────────
async function renderDashboard() {
  root.innerHTML = '';
  const today = ymd(new Date());
  const screen = el(`<div class="screen fadein"><div style="flex:1;overflow:auto" class="noscroll" id="body"></div></div>`);
  const body = screen.querySelector('#body');
  body.innerHTML = `
    <div class="pad" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:8px">
      <div style="flex:1;min-width:0"><div class="h1" style="font-size:24px">${greeting()}, ${user.fullName.split(' ')[0]}</div>
        <div class="sub" style="font-weight:700;color:var(--muted-2)">${formatDateLong(today)}</div></div>
      <div style="width:42px;height:42px;border-radius:50%;background:#dbe4ef;color:var(--navy);display:flex;align-items:center;justify-content:center;font-weight:800;flex:0 0 auto">${initials(user.fullName)}</div>
    </div>
    <div style="padding:0 22px"><div id="geo" class="banner pill-grey">Sjekker posisjon…</div></div>
    <div id="kitchenDuty" style="padding:0 22px"></div>
    <div class="pad" style="display:flex;flex-direction:column;gap:14px;padding-top:16px">
      <div class="card" data-go="/brannliste" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
          <div style="width:50px;height:50px;border-radius:15px;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center">${icon.flame}</div>
          <div style="flex:1"><div style="font-size:18px;font-weight:800">Brannliste i kveld</div><div class="sub" style="color:var(--muted-2);font-weight:600">Meld deg til stede</div></div>
        </div>
        <div id="fireStatus"><span class="pill pill-grey">Laster…</span></div>
      </div>
      <div class="card" data-go="/andakt" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
          <div style="width:50px;height:50px;border-radius:15px;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center">${icon.book}</div>
          <div style="flex:1"><div style="font-size:18px;font-weight:800">Andakt i dag</div><div class="sub" style="color:var(--muted-2);font-weight:600">Skann på storskjerm</div></div>
        </div>
        <div id="andaktStatus"><span class="pill pill-grey">Laster…</span></div>
      </div>
      <button class="btn btn-ghost" id="logout" style="height:48px;margin-top:6px">Logg ut</button>
    </div>`;
  screen.appendChild(tabbar('home'));
  root.appendChild(screen);

  body.querySelectorAll('[data-go]').forEach((c) => c.addEventListener('click', () => go(c.dataset.go)));
  body.querySelector('#logout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' }); user = null; go('/'); render();
  });

  // Status
  api('/api/firelist/status').then((s) => {
    let html;
    if (s.status === 'present') html = `<span class="pill pill-green">${icon.check} Registrert ${formatTime(s.checkedAt)}</span>`;
    else if (s.status === 'away') html = `<span class="pill pill-grey" style="background:#e7edf5;color:var(--navy)">${icon.home} Meldt borte i natt</span>`;
    else html = `<span class="pill pill-red"><span class="dot" style="background:var(--red)"></span> Ikke registrert</span>`;
    body.querySelector('#fireStatus').innerHTML = html;
  });
  api('/api/andakt/status').then((s) => {
    const map = {
      present: `<span class="pill pill-green">${icon.check} Registrert ${formatTime(s.checkedAt)}</span>`,
      late: `<span class="pill pill-amber">${icon.warn} Registrert for sent</span>`,
    };
    body.querySelector('#andaktStatus').innerHTML = s.registered
      ? map[s.status]
      : `<span class="pill pill-grey"><span class="dot" style="background:var(--muted-2)"></span> Ikke registrert ennå</span>`;
  });

  // Kjøkkentjeneste: tydelig kort i tjenesteuken, diskret varsel uken før.
  api('/api/dinner/kitchen-duty/me').then((d) => {
    const box = body.querySelector('#kitchenDuty');
    if (d.thisWeek) {
      box.innerHTML = `
        <div class="card" data-go="/middag" style="cursor:pointer;margin-top:14px;border-color:var(--amber);background:var(--amber-bg)">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:50px;height:50px;border-radius:15px;background:var(--amber-ink);color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto">${icon.food}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:17px;font-weight:800;color:var(--amber-ink)">Du har kjøkkentjeneste denne uken</div>
              <div style="font-size:13.5px;font-weight:600;color:var(--amber-ink);opacity:.85;margin-top:2px">Uke ${d.thisWeek.isoWeek} · ${formatWeekRange(d.thisWeek.weekStart, d.thisWeek.weekEnd)}${dutyPartners(d.thisWeek)}</div>
            </div>
          </div>
        </div>`;
    } else if (d.nextWeek) {
      box.innerHTML = `
        <div class="banner pill-grey" data-go="/middag" style="cursor:pointer;margin-top:12px;background:#e7edf5;color:var(--navy)">
          ${icon.food} Du har kjøkkentjeneste neste uke · uke ${d.nextWeek.isoWeek}
        </div>`;
    } else { return; }
    box.querySelectorAll('[data-go]').forEach((c) => c.addEventListener('click', () => go(c.dataset.go)));
  }).catch(() => {});

  // GPS-banner
  updateGeoBanner(body.querySelector('#geo'));
}

// «sammen med X og Y» – hvem eleven deler tjenesteuken med.
function dutyPartners(week, meId = user.id) {
  const others = week.students.filter((s) => s.id !== meId).map((s) => s.fullName);
  if (!others.length) return '';
  const list = others.length === 1 ? others[0] : `${others.slice(0, -1).join(', ')} og ${others[others.length - 1]}`;
  return ` · sammen med ${esc(list)}`;
}

async function updateGeoBanner(node) {
  try {
    await getPosition();
    node.className = 'banner pill-green';
    node.innerHTML = `${icon.pin} Posisjon funnet · sjekkes ved registrering`;
  } catch (ex) {
    node.className = 'banner pill-red';
    node.innerHTML = `${icon.pin} ${ex.message}`;
  }
}

// Felles topplinje for underskjermer
function subHeader(title, back = '/') {
  const h = el(`<div class="topbar"><button data-back style="background:none;border:none;padding:0;display:flex">${icon.back}</button><span style="font-size:16px;font-weight:700">${title}</span></div>`);
  h.querySelector('[data-back]').addEventListener('click', () => go(back));
  return h;
}

// ── 1.3 Brannliste ───────────────────────────────────────────
async function renderBrannliste() {
  root.innerHTML = '';
  const screen = el(`<div class="screen fadein"><div id="body" style="flex:1;display:flex;flex-direction:column"></div></div>`);
  const body = screen.querySelector('#body');
  screen.appendChild(tabbar('brann'));
  root.appendChild(screen);
  body.appendChild(subHeader('Brannliste'));

  const status = await api('/api/firelist/status').catch(() => ({ status: null }));
  if (status.status === 'present') fireConfirmed(body, status);
  else if (status.status === 'away') fireAway(body, status);
  else fireForm(body, status);

  // Internatvakt-oversikt: står nederst uansett hvilken brannliste-tilstand som vises.
  fetchLatestNightGuards().then((guards) => {
    if (!guards.length) return;
    body.appendChild(el(`<div class="pad" data-keep style="padding-top:0">${nightGuardsCardHTML(guards)}</div>`));
  }).catch(() => {});
}

// Fjerner alt som kommer etter topplinjen, UNNTATT elementer markert med
// data-keep (f.eks. internatvakt-kortet, som skal overleve tilstandsbytter).
function clearFireBody(body) { body.querySelectorAll('.topbar ~ *:not([data-keep])').forEach((n) => n.remove()); }

// Flytter bevarte elementer (data-keep) til bunnen, slik at de alltid havner
// under det ferske innholdet som nettopp ble satt inn – ikke over.
function sinkKeptNodes(body) { body.querySelectorAll('.topbar ~ [data-keep]').forEach((n) => body.appendChild(n)); }

async function fireForm(body, status) {
  clearFireBody(body);
  const content = el(`
    <div class="pad" style="flex:1;display:flex;flex-direction:column">
      <div class="h1">Meld deg til stede i kveld</div>
      <p class="sub" style="line-height:1.5;margin:10px 0 22px">Kryss av så vi vet hvem som er på skolen i natt ved brann.</p>
      <div id="geobox"></div>
      <div style="margin-top:auto;padding-bottom:24px">
        <button class="btn btn-green" id="present" style="width:100%;height:62px;font-size:19px" disabled>${icon.check} Jeg er til stede</button>
        <p id="hint" class="sub" style="text-align:center;margin:14px 0 12px">Sjekker posisjon…</p>
        <button class="btn btn-ghost" id="away" style="width:100%;height:52px">Jeg er ikke på skolen i natt</button>
        <button id="plan" style="background:none;border:none;color:var(--navy);font-weight:700;font-size:14px;width:100%;margin-top:14px;cursor:pointer">📅 Planlegg fravær fremover</button>
      </div>
    </div>`);
  body.appendChild(content);
  sinkKeptNodes(body);
  content.querySelector('#plan').addEventListener('click', () => go('/planlegg'));

  const geobox = content.querySelector('#geobox');
  const btn = content.querySelector('#present');
  const hint = content.querySelector('#hint');
  let coords = null;

  try {
    coords = await getPosition();
    geobox.innerHTML = `<div class="banner pill-green" style="padding:16px;border-radius:18px">
      <div style="width:44px;height:44px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto">${icon.pin}</div>
      <div style="flex:1"><div style="font-size:16px;font-weight:800">Posisjon funnet</div><div style="font-size:13px;font-weight:600">Bekreftes mot skolens område</div></div></div>`;
    btn.disabled = false;
    hint.textContent = status.deadline ? `Meld deg til stede før kl. ${status.deadline}.` : 'Gjelder natten som kommer.';
  } catch (ex) {
    geobox.innerHTML = `<div class="banner pill-red" style="padding:16px;border-radius:18px">
      <div style="width:44px;height:44px;border-radius:50%;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto">${icon.x}</div>
      <div style="flex:1"><div style="font-size:16px;font-weight:800">${ex.message}</div></div></div>`;
    hint.textContent = 'Du må gi tilgang til posisjon for å melde deg til stede.';
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try {
      const r = await api('/api/firelist/checkin', { method: 'POST', body: coords });
      fireConfirmed(body, r);
    } catch (ex) {
      btn.disabled = false; btn.innerHTML = `${icon.check} Jeg er til stede`;
      if (ex.code === 'offsite') {
        geobox.innerHTML = `<div class="banner pill-red" style="padding:16px;border-radius:18px">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto">${icon.x}</div>
          <div style="flex:1"><div style="font-size:16px;font-weight:800">Du er ikke på skolens område</div><div style="font-size:13px;font-weight:600">Kan ikke registrere herfra</div></div></div>`;
        btn.disabled = true;
        hint.textContent = 'Du må være innenfor skolens område for å melde deg til stede.';
      } else toast(ex.message);
    }
  });

  content.querySelector('#away').addEventListener('click', async () => {
    const ab = content.querySelector('#away'); ab.disabled = true; ab.innerHTML = '<span class="spin" style="border-top-color:var(--slate)"></span>';
    try { const r = await api('/api/firelist/away', { method: 'POST', body: { noDinner: true } }); fireAway(body, { ...r, noDinner: true }); }
    catch (ex) { ab.disabled = false; ab.textContent = 'Jeg er ikke på skolen i natt'; toast(ex.message); }
  });
}

function fireConfirmed(body, data) {
  clearFireBody(body);
  body.appendChild(el(`
    <div style="flex:1;display:flex;flex-direction:column">
      <div class="pad fadein" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
        <div style="width:104px;height:104px;border-radius:50%;background:var(--green-bg);display:flex;align-items:center;justify-content:center;margin-bottom:24px">
          <div style="width:74px;height:74px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center"><div style="width:42px;height:42px">${icon.check}</div></div></div>
        <div class="h1" style="font-size:26px">Du er registrert</div>
        <p class="sub" style="line-height:1.5;margin:10px 0 18px">på brannlisten for natt til<br>${formatDateLong(shiftDate(data.nightDate, 1))}</p>
        <div class="pill pill-grey" style="background:#fff;border:1px solid var(--line-2)">${icon.clock} Registrert kl. ${formatTime(data.checkedAt)}</div>
        <p class="sub" style="margin:22px 0 0">God natt. Sov godt. 🌙</p>
      </div>
      <div class="pad"><button class="btn btn-ghost" id="toaway" style="width:100%;height:48px">Jeg er likevel ikke på skolen</button></div>
    </div>`));
  sinkKeptNodes(body);
  body.querySelector('#toaway').addEventListener('click', async () => {
    try { const r = await api('/api/firelist/away', { method: 'POST', body: { noDinner: true } }); fireAway(body, { ...r, noDinner: true }); } catch (ex) { toast(ex.message); }
  });
}

function fireAway(body, data) {
  clearFireBody(body);
  const title = data.scheduled ? 'Planlagt borte i natt' : 'Meldt borte i natt';
  const note = data.scheduled
    ? 'Dette er en planlagt fraværsdag. Du kan endre planen under «Planlegg fravær».'
    : 'Da vet brannvakten at du ikke er i bygget.';
  body.appendChild(el(`
    <div style="flex:1;display:flex;flex-direction:column">
      <div class="pad fadein" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
        <div style="width:104px;height:104px;border-radius:50%;background:#e7edf5;display:flex;align-items:center;justify-content:center;margin-bottom:20px">
          <div style="width:74px;height:74px;border-radius:50%;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center"><div style="width:40px;height:40px">${icon.home}</div></div></div>
        <div class="h1" style="font-size:26px">${title}</div>
        <p class="sub" style="line-height:1.5;margin:10px 0 8px">Du er registrert som <b>ikke på skolen</b> natt til<br>${formatDateLong(shiftDate(data.nightDate, 1))}.</p>
        <p class="sub">${note}</p>
        <label style="display:flex;align-items:center;gap:12px;width:100%;margin-top:20px;padding:14px 16px;background:#fff;border:1px solid var(--line);border-radius:14px;cursor:pointer;text-align:left">
          <input type="checkbox" id="noDinner" ${data.noDinner ? 'checked' : ''} style="width:22px;height:22px;flex:0 0 auto" />
          <div><div style="font-weight:800;font-size:15px">Jeg skal heller ikke ha middag i dag</div><div class="sub" style="font-size:13px">Så slipper kjøkkenet å lage mat til deg.</div></div>
        </label>
      </div>
      <div class="pad">
        <button class="btn btn-green" id="here" style="width:100%;height:56px;font-size:18px">${icon.check} Jeg er likevel på skolen</button>
        <button id="plan" style="background:none;border:none;color:var(--navy);font-weight:700;font-size:14px;width:100%;margin-top:14px;cursor:pointer">📅 Planlegg fravær fremover</button>
      </div>
    </div>`));
  sinkKeptNodes(body);
  body.querySelector('#here').addEventListener('click', () => fireForm(body, data));
  body.querySelector('#plan').addEventListener('click', () => go('/planlegg'));
  body.querySelector('#noDinner').addEventListener('change', async (e) => {
    try { await api('/api/firelist/away', { method: 'POST', body: { noDinner: e.target.checked } }); data.noDinner = e.target.checked; }
    catch (ex) { toast(ex.message); e.target.checked = !e.target.checked; }
  });
}

// ── Ukemeny: pen dag-for-dag-visning + PDF ───────────────────
// Bygger dag-kortene fra den tolkede menyen (fra OpenAI-tolkning på serveren).
function parsedMenuHTML(menu) {
  const days = (menu?.days || []).filter((d) => d.dishes?.length || d.day);
  if (!days.length) return '';
  const dayRows = days.map((d) => `
    <div style="padding:12px 0;border-top:1px solid var(--line)">
      <div style="font-size:13px;font-weight:800;color:var(--red);text-transform:uppercase;letter-spacing:.03em">${esc(d.day)}</div>
      <div style="font-size:15px;font-weight:600;color:var(--navy);margin-top:3px;line-height:1.45">${d.dishes.map(esc).join('<br>') || '<span style="color:var(--muted-2);font-weight:500">—</span>'}</div>
      ${d.note ? `<div class="sub" style="font-size:12.5px;margin-top:3px">${esc(d.note)}</div>` : ''}
    </div>`).join('');
  const note = menu.note ? `<div class="sub" style="font-size:12.5px;margin-top:10px;line-height:1.5">${esc(menu.note)}</div>` : '';
  return dayRows + note;
}

// Henter internatvakt fra siste tolkede ukeoppslag – uavhengig av hvor mange
// menyer som er lastet opp, slik at Brannliste alltid viser nyeste vaktliste.
async function fetchLatestNightGuards() {
  const d = await api('/api/menus').catch(() => ({ menus: [] }));
  for (const m of d.menus) {
    if (m.parseStatus !== 'ok') continue;
    const p = await api(`/api/menus/${m.id}/parsed`).catch(() => null);
    const guards = (p?.menu?.nightGuards || []).filter((g) => g.day || g.name);
    if (guards.length) return guards;
  }
  return [];
}

// Bygger internatvakt-kortet som vises på Brannliste-siden.
function nightGuardsCardHTML(guards) {
  const rows = guards.map((g) => `
    <div style="display:flex;gap:12px;padding:9px 0;border-top:1px solid var(--line)">
      <div style="flex:0 0 96px;font-size:13px;font-weight:800;color:var(--navy);text-transform:uppercase;letter-spacing:.03em">${esc(g.day)}</div>
      <div style="flex:1;font-size:15px;font-weight:600;color:var(--navy)">${esc(g.name)}</div>
    </div>`).join('');
  return `<div class="card" style="border-radius:16px;margin-top:16px">
    <div style="font-size:13px;font-weight:800;color:var(--muted-2);text-transform:uppercase;letter-spacing:.04em;display:flex;align-items:center;gap:6px">🌙 Internatvakt denne uken</div>
    ${rows}
  </div>`;
}

async function renderMenus(menusEl) {
  let d;
  try { d = await api('/api/menus'); } catch { menusEl.innerHTML = ''; return; }
  if (!d.menus.length) { menusEl.innerHTML = '<p class="sub" style="padding:0 2px">Ingen meny lastet opp ennå.</p>'; return; }

  menusEl.innerHTML = d.menus.map((m) => `
    <div class="card" data-menu="${m.id}" style="border-radius:16px;padding:0;margin-bottom:12px;overflow:hidden;border:1px solid var(--line)">
      <div style="display:flex;align-items:center;gap:12px;padding:14px 16px">
        <div style="flex:1;min-width:0"><div style="font-size:16px;font-weight:800">${esc(m.title)}</div>
          <div class="sub" data-state style="font-size:12.5px">${m.parseStatus === 'pending' ? 'Tolker meny…' : ''}</div></div>
        ${m.hasFile ? `<button data-open="${m.id}" class="btn btn-ghost" style="height:38px;padding:0 14px;font-size:13px;flex:0 0 auto">Åpne PDF</button>` : ''}
      </div>
      <div data-days style="padding:0 16px 4px"></div>
    </div>`).join('');

  menusEl.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => window.open(`/api/menus/${b.dataset.open}/file`, '_blank')));

  // Tolkning pågår? Hent listen på nytt om litt så dagene dukker opp av seg selv.
  if (d.menus.some((m) => m.parseStatus === 'pending')) setTimeout(() => renderMenus(menusEl), 5000);

  // Hent tolket innhold for hver meny som er ferdig tolket, og fyll inn dagene.
  for (const m of d.menus) {
    if (m.parseStatus !== 'ok') continue;
    const card = menusEl.querySelector(`[data-menu="${m.id}"]`);
    api(`/api/menus/${m.id}/parsed`).then((p) => {
      if (p.status !== 'ok' || !p.menu) return;
      const html = parsedMenuHTML(p.menu);
      if (html) { card.querySelector('[data-days]').innerHTML = html; card.querySelector('[data-state]').textContent = ''; }
    }).catch(() => { /* la kortet stå med bare PDF-knappen */ });
  }
}

// Kjøkkentjeneste: denne uken i detalj, og hele planen framover.
async function renderDutyPlan(node) {
  const d = await api('/api/dinner/kitchen-duty?weeks=12').catch(() => null);
  const weeks = d?.weeks;
  if (!weeks?.length) return;
  const now = weeks[0];

  // Klipp planen etter den siste uken noen faktisk er satt opp – tomme uker
  // midt i beholdes, så eleven ser hullene i rundgangen.
  let last = 0;
  weeks.forEach((w, i) => { if (w.students.length) last = i; });
  const upcoming = weeks.slice(1, last + 1);

  // Når er eleven selv nestemann?
  const mine = upcoming.find((w) => w.students.some((s) => s.id === user.id));

  node.innerHTML = `
    <div class="h1" style="font-size:19px">Kjøkkentjeneste</div>
    <div class="sub" style="font-weight:700;color:var(--muted-2);margin-top:2px">Uke ${now.isoWeek} · ${formatWeekRange(now.weekStart, now.weekEnd)}</div>
    <div class="card" style="border-radius:18px;margin-top:10px;padding:6px 0">
      ${now.students.length ? now.students.map((s, i) => `
        <div style="display:flex;align-items:center;gap:12px;padding:11px 18px;${i ? 'border-top:1px solid var(--line)' : ''}">
          <span style="flex:1;font-size:15px;font-weight:700">${esc(s.fullName)}${s.id === user.id ? ' <span class="pill pill-amber" style="margin-left:6px">Deg</span>' : ''}</span>
          <span style="font-size:13px;color:var(--muted-2);font-weight:600">${esc(s.className || '')}</span>
        </div>`).join('')
      : '<div style="padding:16px 18px;color:var(--muted-2);font-size:14px">Ingen satt opp denne uken.</div>'}
    </div>
    ${mine ? `<div class="banner pill-grey" style="margin-top:10px;background:#e7edf5;color:var(--navy)">${icon.clock} Din neste tjeneste: uke ${mine.isoWeek} · ${formatWeekRange(mine.weekStart, mine.weekEnd)}</div>` : ''}
    ${upcoming.length ? `
      <button class="btn btn-ghost" id="planToggle" style="width:100%;height:46px;margin-top:10px;font-size:14.5px">Vis hele planen</button>
      <div id="planList" style="display:none;margin-top:10px"></div>` : ''}`;

  if (!upcoming.length) return;

  const listEl = node.querySelector('#planList');
  listEl.innerHTML = upcoming.map((w) => {
    const isMine = w.students.some((s) => s.id === user.id);
    const names = w.students.map((s) => esc(s.fullName)).join(', ');
    return `
      <div class="card" style="border-radius:14px;padding:12px 16px;margin-bottom:8px;${isMine ? 'border-color:var(--amber);background:var(--amber-bg)' : ''}">
        <div style="display:flex;align-items:baseline;gap:8px">
          <span style="font-size:14px;font-weight:800;${isMine ? 'color:var(--amber-ink)' : ''}">Uke ${w.isoWeek}</span>
          <span style="font-size:12.5px;color:var(--muted-2);font-weight:600">${formatWeekRange(w.weekStart, w.weekEnd)}</span>
        </div>
        <div style="font-size:14.5px;font-weight:600;margin-top:3px;${w.students.length ? (isMine ? 'color:var(--amber-ink)' : '') : 'color:var(--muted-2)'}">${names || 'Ingen satt opp'}</div>
      </div>`;
  }).join('');

  const toggle = node.querySelector('#planToggle');
  toggle.addEventListener('click', () => {
    const open = listEl.style.display === 'block';
    listEl.style.display = open ? 'none' : 'block';
    toggle.textContent = open ? 'Vis hele planen' : 'Vis mindre';
  });
}

// ── Middag ───────────────────────────────────────────────────
async function renderMiddag() {
  root.innerHTML = '';
  const screen = el(`<div class="screen fadein"><div id="body" style="flex:1;overflow:auto" class="noscroll"></div></div>`);
  const body = screen.querySelector('#body');
  screen.appendChild(tabbar('middag'));
  root.appendChild(screen);
  const today = ymd(new Date());

  body.innerHTML = `<div class="pad">
    <div class="h1" style="font-size:24px">Middag</div>
    <div class="sub" style="font-weight:700;color:var(--muted-2)">${formatDateLong(today)}</div>
    <div id="dinner" style="margin-top:16px"></div>
    <div id="duty" style="margin-top:26px"></div>
    <div style="margin-top:26px">
      <div class="h1" style="font-size:19px">Ukemeny</div>
      <div id="menus" style="margin-top:10px"></div>
    </div>
  </div>`;

  const menusEl = body.querySelector('#menus');
  renderMenus(menusEl);
  renderDutyPlan(body.querySelector('#duty'));

  const dinnerEl = body.querySelector('#dinner');
  async function loadDinner() {
    const s = await api('/api/dinner/status').catch(() => null);
    if (!s) { dinnerEl.innerHTML = ''; return; }
    if (s.fromPeriod) {
      dinnerEl.innerHTML = `<div class="card" style="border-radius:18px;display:flex;align-items:center;gap:14px">
        <div style="width:50px;height:50px;border-radius:15px;background:#e7edf5;color:var(--navy);display:flex;align-items:center;justify-content:center"><div style="width:26px;height:26px">${icon.home}</div></div>
        <div><div style="font-size:16px;font-weight:800">Meldt av middag i dag</div><div class="sub">Del av et planlagt fravær. Endre det under «Brannliste → Planlegg fravær».</div></div></div>`;
      return;
    }
    dinnerEl.innerHTML = s.optedOut
      ? `<div class="card" style="border-radius:18px">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px"><div style="width:50px;height:50px;border-radius:15px;background:var(--red-bg);color:var(--red);display:flex;align-items:center;justify-content:center"><div style="width:24px;height:24px">${icon.x}</div></div>
          <div><div style="font-size:16px;font-weight:800">Du har meldt fra</div><div class="sub">Du får ikke middag i dag.</div></div></div>
          <button class="btn btn-primary" id="dinnerToggle" style="width:100%;height:52px">Jeg spiser likevel middag</button></div>`
      : `<div class="card" style="border-radius:18px">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px"><div style="width:50px;height:50px;border-radius:15px;background:var(--green-bg);color:var(--green);display:flex;align-items:center;justify-content:center"><div style="width:26px;height:26px">${icon.check}</div></div>
          <div><div style="font-size:16px;font-weight:800">Du får middag i dag</div><div class="sub">Meld fra hvis du ikke skal spise, så unngår vi matsvinn.</div></div></div>
          <button class="btn btn-ghost" id="dinnerToggle" style="width:100%;height:52px">Meld fra – jeg spiser ikke i dag</button></div>`;
    dinnerEl.querySelector('#dinnerToggle')?.addEventListener('click', async () => {
      const btn = dinnerEl.querySelector('#dinnerToggle'); btn.disabled = true;
      try {
        await api('/api/dinner/optout', { method: s.optedOut ? 'DELETE' : 'POST' });
        loadDinner();
      } catch (ex) { toast(ex.message); btn.disabled = false; }
    });
  }
  loadDinner();
}

// ── Planlagt fravær ──────────────────────────────────────────
async function renderPlanlegg() {
  root.innerHTML = '';
  const screen = el(`<div class="screen fadein"><div id="body" style="flex:1;overflow:auto" class="noscroll"></div></div>`);
  const body = screen.querySelector('#body');
  screen.appendChild(tabbar('brann'));
  root.appendChild(screen);
  body.appendChild(subHeader('Planlagt fravær', '/brannliste'));

  body.appendChild(el(`
    <div class="pad">
      <div class="h1" style="font-size:22px">Planlegg fravær</div>
      <p class="sub" style="line-height:1.5;margin:8px 0 12px">Meld på forhånd hvilke netter du er borte fra internatet. Én natt = velg samme dato i begge felt.</p>
      <div style="background:#e7edf5;color:var(--navy);border-radius:12px;padding:12px 14px;font-size:13.5px;font-weight:600;line-height:1.45;margin-bottom:18px">
        🌙 Fraværet gjelder natten. Velger du <strong>19. juli</strong>, blir du meldt borte <strong>natt til 20. juli</strong>.
      </div>
      <div id="confirm" style="display:none;margin-bottom:14px"></div>
      <div class="card" style="border-radius:18px">
        <label class="field-label">Første kveld borte</label>
        <input class="field" type="date" id="from" />
        <label class="field-label" style="margin-top:14px">Siste kveld borte</label>
        <input class="field" type="date" id="to" />
        <div id="preview" style="display:none;margin-top:12px;font-size:14px;font-weight:700;color:var(--navy);background:#f2f5f9;border-radius:10px;padding:10px 12px"></div>
        <label style="display:flex;align-items:center;gap:12px;margin-top:16px;cursor:pointer">
          <input type="checkbox" id="noDinner" checked style="width:22px;height:22px;flex:0 0 auto" />
          <div style="font-size:14px;font-weight:700;color:var(--slate)">Jeg skal heller ikke ha middag i perioden</div>
        </label>
        <p id="perr" style="color:var(--red-ink);font-size:14px;font-weight:600;margin:12px 0 0;display:none"></p>
        <button class="btn btn-primary" id="add" style="width:100%;height:52px;margin-top:16px">Legg til fravær</button>
      </div>
      <div style="font-size:12px;font-weight:800;color:var(--muted-2);text-transform:uppercase;letter-spacing:.04em;margin:24px 6px 10px">Kommende fravær</div>
      <div id="list"><span class="pill pill-grey">Laster…</span></div>
    </div>`));

  const listEl = body.querySelector('#list');
  async function load() {
    const d = await api('/api/firelist/away-periods').catch(() => ({ periods: [] }));
    if (!d.periods.length) { listEl.innerHTML = '<p class="sub" style="padding:0 6px">Ingen planlagte fravær.</p>'; return; }
    listEl.innerHTML = d.periods.map((p) => `
      <div class="card" style="border-radius:14px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px">
        <div style="width:38px;height:38px;border-radius:11px;background:#e7edf5;color:var(--navy);display:flex;align-items:center;justify-content:center;flex:0 0 auto"><div style="width:20px;height:20px">${icon.home}</div></div>
        <div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700">${formatNightRange(p.startDate, p.endDate)}</div><div class="sub" style="font-size:12.5px">${countNights(p.startDate, p.endDate)} ${countNights(p.startDate, p.endDate) === 1 ? 'natt' : 'netter'}${p.noDinner ? ' · 🍽️ uten middag' : ''}</div></div>
        <button data-del="${p.id}" style="background:none;border:none;color:var(--muted-2);padding:6px;cursor:pointer;flex:0 0 auto"><div style="width:20px;height:20px">${icon.x}</div></button>
      </div>`).join('');
    listEl.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await api(`/api/firelist/away-period/${b.dataset.del}`, { method: 'DELETE' }); load(); }
      catch (ex) { toast(ex.message); b.disabled = false; }
    }));
  }

  // Fortløpende forhåndsvisning: eleven ser hvilke NETTER valget dekker før de
  // trykker, ikke bare hvilke datoer de har fylt inn.
  const previewEl = body.querySelector('#preview');
  function updatePreview() {
    const from = body.querySelector('#from').value;
    const to = body.querySelector('#to').value || from;
    if (!from || to < from) { previewEl.style.display = 'none'; return; }
    const n = countNights(from, to);
    previewEl.textContent = `🌙 ${n} ${n === 1 ? 'natt' : 'netter'} · ${formatNightRange(from, to)}`;
    previewEl.style.display = 'block';
  }
  body.querySelector('#from').addEventListener('change', updatePreview);
  body.querySelector('#to').addEventListener('change', updatePreview);

  const confirmEl = body.querySelector('#confirm');
  body.querySelector('#add').addEventListener('click', async () => {
    const from = body.querySelector('#from').value;
    const to = body.querySelector('#to').value || from;
    const perr = body.querySelector('#perr'); perr.style.display = 'none';
    confirmEl.style.display = 'none';
    if (!from) { perr.textContent = 'Velg minst én dato.'; perr.style.display = 'block'; return; }
    if (to < from) { perr.textContent = 'Siste kveld kan ikke være før den første.'; perr.style.display = 'block'; return; }
    const noDinner = body.querySelector('#noDinner').checked;
    const btn = body.querySelector('#add'); btn.disabled = true;
    try {
      await api('/api/firelist/away-period', { method: 'POST', body: { startDate: from, endDate: to, noDinner } });
      // Kvitteringen gjentar nøyaktig hva som ble lagret, i «natt til»-form, så
      // eleven kan se med én gang om de bommet med en dag.
      const n = countNights(from, to);
      confirmEl.innerHTML = `
        <div class="card" style="border-radius:14px;border-color:var(--green);background:var(--green-bg);padding:14px 16px">
          <div style="font-size:15.5px;font-weight:800;color:var(--green-ink)">✓ Fraværet er lagret</div>
          <div style="font-size:13.5px;color:var(--green-ink);margin-top:3px;line-height:1.45">Du er meldt borte ${n} ${n === 1 ? 'natt' : 'netter'}: ${formatNightRange(from, to)}.${noDinner ? ' Du får ikke middag i perioden.' : ' Du får middag som vanlig.'}</div>
        </div>`;
      confirmEl.style.display = 'block';
      body.querySelector('#from').value = ''; body.querySelector('#to').value = '';
      updatePreview();
      load();
    } catch (ex) { perr.textContent = ex.message; perr.style.display = 'block'; }
    finally { btn.disabled = false; }
  });

  load();
}

function ymd(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function shiftDate(dstr, days) {
  const [y, m, d] = dstr.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + days));
}

// ── 1.4 Andakt – QR-skanning ─────────────────────────────────
let qrScanner = null;
async function stopScanner() {
  if (qrScanner) { try { await qrScanner.stop(); } catch {} try { qrScanner.clear(); } catch {} qrScanner = null; }
}
window.addEventListener('hashchange', stopScanner);

async function renderAndakt() {
  await stopScanner();
  root.innerHTML = '';
  const screen = el(`<div class="screen fadein"><div id="body" style="flex:1;display:flex;flex-direction:column"></div></div>`);
  const body = screen.querySelector('#body');
  screen.appendChild(tabbar('andakt'));
  root.appendChild(screen);
  body.appendChild(subHeader('Andakt'));

  const status = await api('/api/andakt/status').catch(() => ({ registered: false }));
  if (status.andaktToday === false) {
    body.appendChild(el(`
      <div class="pad fadein" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
        <div style="width:104px;height:104px;border-radius:50%;background:#eef1f5;display:flex;align-items:center;justify-content:center;margin-bottom:24px"><div style="width:74px;height:74px;border-radius:50%;background:var(--muted-2);color:#fff;display:flex;align-items:center;justify-content:center"><div style="width:38px;height:38px">${icon.book}</div></div></div>
        <div class="h1" style="font-size:24px">Ingen andakt i dag</div>
        <p class="sub" style="line-height:1.5;margin:10px 0 0">Det er andakt på ukedager (mandag–fredag).</p>
      </div>`));
    return;
  }
  if (status.registered) return andaktResult(body, status.status, status.checkedAt, status.sessionDate);

  const content = el(`
    <div style="flex:1;display:flex;flex-direction:column">
      <div class="pad" style="padding-bottom:8px">
        <div class="h1" style="font-size:22px">Registrer oppmøte på andakt</div>
        <p class="sub" style="margin:8px 0 0">Skann QR-koden som vises på storskjerm.</p>
      </div>
      <div style="margin:6px 22px;flex:1;min-height:280px;background:#0f1a2b;border-radius:22px;overflow:hidden;position:relative">
        <div id="reader" style="width:100%;height:100%"></div>
        <div id="scanhint" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9fb0c6;font-size:14px;font-weight:600;text-align:center;padding:20px">Starter kamera…</div>
      </div>
      <div class="pad"><div id="geo" class="banner pill-grey" style="justify-content:center">Sjekker posisjon…</div></div>
    </div>`);
  body.appendChild(content);
  updateGeoBanner(content.querySelector('#geo'));

  // Hent posisjon i forkant slik at innsending går raskt.
  let coords = null;
  getPosition().then((c) => { coords = c; }).catch(() => {});

  let handled = false;
  const onScan = async (text) => {
    if (handled) return; handled = true;
    await stopScanner();
    if (!coords) { try { coords = await getPosition(); } catch (ex) { return andaktError(body, 'offsite', ex.message); } }
    try {
      const r = await api('/api/andakt/checkin', { method: 'POST', body: { token: text, ...coords } });
      andaktResult(body, r.status, r.checkedAt, r.sessionDate);
    } catch (ex) {
      andaktError(body, ex.code || 'invalid', ex.message);
    }
  };

  try {
    qrScanner = new Html5Qrcode('reader', { verbose: false });
    content.querySelector('#scanhint').style.display = 'none';
    await qrScanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, onScan, () => {});
  } catch (ex) {
    content.querySelector('#scanhint').textContent = 'Fikk ikke tilgang til kamera. Gi appen kameratilgang og prøv igjen.';
    content.querySelector('#scanhint').style.display = 'flex';
  }
}

function centerCard(body, { ring, ink, title, text, btnLabel, onBtn }) {
  body.querySelectorAll('.topbar ~ *').forEach((n) => n.remove());
  const node = el(`
    <div style="flex:1;display:flex;flex-direction:column">
      <div class="pad fadein" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
        <div style="width:104px;height:104px;border-radius:50%;background:${ring.bg};display:flex;align-items:center;justify-content:center;margin-bottom:24px">
          <div style="width:74px;height:74px;border-radius:50%;background:${ring.fg};color:#fff;display:flex;align-items:center;justify-content:center"><div style="width:40px;height:40px">${ring.icon}</div></div></div>
        <div class="h1" style="font-size:24px;color:${ink || 'var(--ink)'}">${title}</div>
        <div style="margin:12px 0 0;max-width:300px">${text}</div>
      </div>
      <div class="pad" style="flex:0 0 auto"><button class="btn btn-primary" id="cardBtn" style="width:100%;height:56px;font-size:17px">${btnLabel}</button></div>
    </div>`);
  body.appendChild(node);
  node.querySelector('#cardBtn').addEventListener('click', onBtn);
}

function andaktResult(body, status, checkedAt, date) {
  if (status === 'late') {
    return centerCard(body, {
      ring: { bg: 'var(--amber-bg)', fg: 'var(--amber)', icon: icon.warn },
      title: 'Registrert etter fristen',
      text: `<div class="banner pill-amber" style="text-align:left"><div>Oppmøtet ditt kl. ${formatTime(checkedAt)} er etter fristen og kan telle som fravær.</div></div>`,
      btnLabel: 'Ferdig', onBtn: () => go('/'),
    });
  }
  return centerCard(body, {
    ring: { bg: 'var(--green-bg)', fg: 'var(--green)', icon: icon.check },
    title: 'Oppmøte registrert',
    text: `<p class="sub" style="line-height:1.5">Andakt · ${formatDateLong(date)}</p>
      <div class="pill pill-grey" style="background:#fff;border:1px solid var(--line-2);margin-top:8px">${icon.clock} Registrert kl. ${formatTime(checkedAt)}</div>`,
    btnLabel: 'Ferdig', onBtn: () => go('/'),
  });
}

function andaktError(body, code, message) {
  const offsite = code === 'offsite';
  const expired = code === 'expired';
  centerCard(body, {
    ring: { bg: 'var(--red-bg)', fg: 'var(--red)', icon: offsite ? icon.pin : icon.x },
    title: offsite ? 'Du er ikke på skolens område' : (expired ? 'QR-koden er ikke gyldig lenger' : 'Ugyldig QR-kode'),
    text: `<p class="sub" style="line-height:1.5">${message}</p>`,
    btnLabel: offsite ? 'Prøv igjen' : 'Skann på nytt',
    onBtn: () => renderAndakt(),
  });
}

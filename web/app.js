// Haat web client. All market logic runs on the server; this file is the game around it.

import { dayIntro, playDay } from './cinema.js';
import { Coach } from './coach.js';
import { confetti, countUp, floatText, sleep, toast } from './fx.js';
import { GOOD_ICON, Scene } from './scene.js';
import { sfx } from './sfx.js';
import { NARRATION, TUTORIAL } from './tutorial.js';

const app = document.getElementById('app');
const statsEl = document.getElementById('stats');
const titleEl = document.getElementById('title');
const endDialog = document.getElementById('end');
const endBody = document.getElementById('end-body');
const COLORS = { grain: 'var(--grain)', bread: 'var(--bread)', tools: 'var(--tools)', cloth: 'var(--cloth)' };

let state = null;
let mode = 'play';
let moves = {};
let shownDay = null;
let busy = false;
let autoplay = false;
let tab = 'stall'; // phone only: stall | market | town
let shown = { coins: null, score: null };

const coach = new Coach();
/** The tutorial is played like a normal stall, with a coach on top. */
const isPlay = () => mode !== 'watch';
const tutorialDone = () => { try { return localStorage.getItem('haat-tutorial') === 'done'; } catch { return false; } };
const coachCtx = {
  moves: () => moves,
  layout: () => layout(),
  setTab: (t) => { tab = t; render(); },
  onFinish: () => {
    try { localStorage.setItem('haat-tutorial', 'done'); } catch {}
    startGame('play');
  },
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = (h) => (h.length > 14 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h);

// ---------- layout: PC and phone get different screens ----------

const phoneQuery = matchMedia('(max-width: 760px)');
const layout = () => (phoneQuery.matches ? 'mobile' : 'desktop');
document.body.dataset.layout = layout();
const scene = new Scene(document.getElementById('scene'), layout());
phoneQuery.addEventListener('change', () => {
  document.body.dataset.layout = layout();
  scene.setLayout(layout());
  if (state) syncScene(true);
  render();
});

async function call(method, path, body) {
  // Static build (Vercel): the engine runs in this page instead of on a server.
  if (window.HaatLocal) {
    const { status, data } = await window.HaatLocal.call(method, path, body);
    if (status >= 400) throw new Error(data.error ?? `HTTP ${status}`);
    return data;
  }
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function syncScene(gather = false) {
  scene.setSellers(state.stallOrder, state.sellers, isPlay());
  scene.setBuyers(state.buyers);
  scene.setEvents(state.today ? state.today.events.map((e) => e.name) : []);
  scene.setTime(state.finished ? 'dusk' : 'day');
  if (gather && state.today) scene.gather(state.today.swarms);
}

// ---------- title screen ----------

async function showTitle() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('haat-game') ?? 'null'); } catch {}
  let resumable = null;
  if (saved?.id) {
    try {
      resumable = await call('GET', `/api/games/${saved.id}`);
      if (resumable.finished || resumable.mode === 'tutorial') resumable = null;
    } catch {}
  }
  titleEl.innerHTML = `
    <div class="title-card">
      <div class="title-logo">🏮</div>
      <h1>Haat</h1>
      <p>A market town run by AI agents with their own wallets.<br>Out-trade them for ten days.</p>
      <div class="title-buttons">
        ${!tutorialDone() ? '<button class="btn big" data-title="tutorial">🎓 Start here: tutorial</button>' : ''}
        ${resumable ? `<button class="btn ${tutorialDone() ? 'big' : 'ghost'}" data-title="continue">Continue · day ${resumable.day} ${resumable.mode === 'watch' ? '(watching)' : ''}</button>` : ''}
        <button class="btn ${resumable || !tutorialDone() ? 'ghost' : 'big'}" data-title="play">🧺 Run a stall</button>
        ${tutorialDone() ? '<button class="btn ghost" data-title="tutorial">🎓 Replay tutorial</button>' : ''}
        <button class="btn ghost" data-title="watch">👀 Watch the swarm</button>
      </div>
      <small>20 buyers · 5 sellers · sealed bids · one price clears each market</small>
    </div>`;
  titleEl.hidden = false;
  titleEl.onclick = (e) => {
    const what = e.target.closest('[data-title]')?.dataset.title;
    if (!what) return;
    sfx.click();
    titleEl.classList.add('out');
    setTimeout(() => { titleEl.hidden = true; titleEl.classList.remove('out'); }, 350);
    if (what === 'continue') loadGame(resumable);
    else startGame(what);
  };
}

// ---------- game flow ----------

function setModeTabs() {
  document.querySelectorAll('.modes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
}

async function startGame(nextMode = mode) {
  stopAuto();
  coach.stop();
  busy = false; // a day of the previous game may still be animating; it stops itself when it sees the new game
  mode = nextMode;
  setModeTabs();
  app.innerHTML = '<p class="loading">Opening the market…</p>';
  try {
    state = await call('POST', '/api/games', { mode });
  } catch (e) {
    app.innerHTML = `<p class="loading">Could not reach the market: ${esc(e.message)}</p>`;
    return;
  }
  try { localStorage.setItem('haat-game', JSON.stringify({ id: state.id })); } catch {}
  shown = { coins: null, score: null };
  shownDay = null;
  tab = 'stall';
  resetMoves();
  syncScene();
  render();
  const id = state.id;
  await morning();
  if (state.id !== id) return;
  if (mode === 'watch') startAuto();
  if (mode === 'tutorial') coach.start(TUTORIAL, coachCtx);
}

function loadGame(s) {
  busy = false;
  state = s;
  mode = s.mode;
  setModeTabs();
  resetMoves();
  syncScene(true);
  render();
  if (mode === 'watch') startAuto();
}

async function morning() {
  if (!state?.today) return;
  scene.setTime('dawn');
  await sleep(250);
  scene.setTime('day');
  const today = state.today;
  await dayIntro(today, { speed: mode === 'watch' ? 1.6 : 1 });
  scene.gather(today.swarms);
}

async function nextDay(body = {}) {
  if (busy || !state || state.finished) return;
  if (mode === 'tutorial' && !coach.allows('sealed')) {
    toast(coach.lang === 'hi' ? '👉 Pehle tutorial ka ye step poora karo' : '👉 Finish this tutorial step first');
    return;
  }
  const id = state.id;
  busy = true;
  render();
  sfx.seal();
  if (mode === 'tutorial') coach.emit('sealed');
  const before = state.player;
  try {
    const next = await call('POST', `/api/games/${id}/day`, body);
    if (state.id !== id) return;
    state = next;
  } catch (e) {
    toast(`⚠️ ${esc(e.message)}`);
    busy = false;
    return render();
  }
  const day = state.days[state.days.length - 1];
  const speed = mode === 'watch' ? 1.8 : mode === 'tutorial' ? 0.7 : 1;
  const narrate = mode === 'tutorial' ? Object.fromEntries(Object.entries(NARRATION).map(([k, v]) => [k, v[coach.lang] ?? v.en])) : null;
  scene.setTime('dusk');
  await playDay(day, { me: isPlay(), speed, narrate, lang: coach.lang, manual: mode === 'tutorial', explain: mode === 'tutorial' });
  if (state.id !== id) return; // another game started meanwhile
  scene.setSellers(state.stallOrder, state.sellers, isPlay());
  await scene.settle(day, { speed, sfx });
  if (state.id !== id) return;
  shownDay = null;
  resetMoves();
  busy = false;
  if (isPlay()) {
    tab = 'market';
    summarize(day, before);
  }
  render();
  if (mode === 'tutorial') await coach.emit('dayDone'); // the coach explains the results before the day moves on
  if (state.id !== id) return; // the player left this game meanwhile
  if (state.finished) {
    stopAuto();
    scene.setTime('night');
    if (isPlay()) showEnd();
    return;
  }
  scene.setTime('night');
  await sleep(mode === 'watch' ? 300 : 500);
  if (state.id !== id) return;
  syncScene();
  if (isPlay()) tab = 'stall';
  render();
  await morning();
  if (mode === 'tutorial' && state.id === id) coach.emit('morning');
}

function summarize(day, before) {
  let units = 0;
  let coins = 0;
  for (const r of day.rounds) for (const p of r.payments) if (p.to === 'player') { units += p.units ?? 0; coins += p.amount; }
  if (!units) for (const r of day.rounds) units += r.fills.find((f) => f.account === 'player' && f.side === 'sell')?.units ?? 0;
  const delta = state.player.score - before.score;
  const msg = coins
    ? `🪙 You sold <b>${units}</b> for <b>${coins}</b> coins · score ${delta >= 0 ? '+' : ''}${delta}`
    : `😶 Nothing sold on day ${day.day}. ${state.player.rank <= 2 ? 'Still near the top.' : 'Try pricing nearer the last price.'}`;
  toast(msg, 3200);
  floatText(document.querySelector('[data-stat="score"]'), `${delta >= 0 ? '+' : ''}${delta}`, delta >= 0);
}

async function autoLoop() {
  while (autoplay && state && !state.finished) {
    await nextDay();
    await sleep(500);
  }
}
function startAuto() {
  if (autoplay) return;
  autoplay = true;
  render();
  autoLoop();
}
function stopAuto() {
  autoplay = false;
}

// ---------- player moves ----------

function resetMoves() {
  moves = {};
  if (!state?.today) return;
  for (const g of state.goods) {
    const last = state.today.lastPrice[g];
    moves[g] = { make: 0, units: state.player.stock[g], price: last ?? state.today.cost[g] + 2 };
  }
}

const spend = () => state.goods.reduce((s, g) => s + (moves[g]?.make ?? 0) * state.today.cost[g], 0);

function readMoves() {
  const produce = {};
  const asks = {};
  for (const g of state.goods) {
    const m = moves[g];
    if (m.make > 0) produce[g] = m.make;
    if (m.units > 0 && m.price > 0) asks[g] = { units: m.units, price: m.price };
  }
  return { produce, asks };
}

function setMove(good, key, value) {
  const n = Math.max(0, Math.min(999, Math.floor(Number(value)) || 0));
  const prevHave = state.player.stock[good] + moves[good].make;
  moves[good][key] = n;
  if (key === 'make' && moves[good].units === prevHave) moves[good].units = state.player.stock[good] + n;
}

// ---------- rendering ----------

let lastScreen = '';

function render() {
  if (!state) return;
  // Entry animations play once per new screen (new day, tab or mode), not on every +/- click.
  const screen = `${state.id}:${state.day}:${tab}:${mode}:${shownDay}:${layout()}`;
  app.classList.toggle('fresh', screen !== lastScreen);
  lastScreen = screen;
  renderStats();
  const latest = state.days[state.days.length - 1];
  const day = shownDay ?? latest?.day ?? null;
  const shownLog = state.days.find((d) => d.day === day);
  const main = isPlay() ? stallView() : watchView();
  const results = shownLog ? resultsView(shownLog) : '<p class="muted empty">No market has run yet. Results show here after the first day.</p>';
  const side = `${boardView()}<div class="panel">${document.getElementById('how').innerHTML}</div>`;

  if (layout() === 'mobile') {
    const current = mode === 'watch' && tab === 'stall' ? 'market' : tab;
    const body = current === 'stall' ? main : current === 'market' ? (mode === 'watch' ? watchBar() : '') + results : side;
    const tabs = [
      ...(isPlay() ? [['stall', '🧺', 'Stall']] : []),
      ['market', '⚖️', 'Market'],
      ['town', '🏆', 'Town'],
    ];
    app.innerHTML = `<div class="m-body">${body}</div>
      ${isPlay() && current === 'stall' && state.today ? sealBar() : ''}
      <nav class="tabbar">${tabs.map(([k, i, l]) => `<button data-tab="${k}" aria-pressed="${k === current}"><span>${i}</span>${l}</button>`).join('')}</nav>`;
  } else {
    app.innerHTML = `<div class="grid"><section>${main}${results}</section><aside class="side">${side}</aside></div>`;
  }
  coach.refresh();
}

function renderStats() {
  const p = state.player;
  const items =
    isPlay()
      ? [['day', 'Day', `${Math.min(state.day, state.totalDays)}/${state.totalDays}`], ['coins', '🪙 Coins', p.coins], ['score', '⭐ Score', p.score], ['rank', 'Rank', `#${p.rank}`]]
      : [['day', 'Day', `${Math.min(state.day, state.totalDays)}/${state.totalDays}`], ['agents', 'Agents', 26], ['rounds', 'Rounds', state.days.reduce((s, d) => s + d.rounds.length, 0)]];
  statsEl.innerHTML =
    items.map(([k, label, v]) => `<div class="stat" data-stat="${k}"><b>${esc(v)}</b><span>${label}</span></div>`).join('') +
    `<button class="help" title="Tutorial" aria-label="Play the tutorial">🎓</button>` +
    `<button class="mute" title="Sound" aria-label="Toggle sound">${sfx.muted ? '🔇' : '🔊'}</button>` +
    `<span class="net ${state.network}" title="Where trades are recorded">${state.network === 'testnet' ? 'NEAR testnet' : 'offline'}</span>`;
  if (isPlay()) {
    for (const k of ['coins', 'score']) {
      const node = statsEl.querySelector(`[data-stat="${k}"] b`);
      if (shown[k] !== null && shown[k] !== p[k]) countUp(node, shown[k], p[k]);
      shown[k] = p[k];
    }
  }
}

function eventsView() {
  if (!state.today) return '';
  const ev = state.today.events;
  const icon = { drought: '☀️', festival: '🎉', 'new-road': '🛤️' };
  if (!ev.length) return '<div class="events"><div class="event">🌤️ A calm day in town.</div></div>';
  return `<div class="events">${ev
    .map((e) => {
      const [name, rest] = e.label.split(':');
      return `<div class="event hot">${icon[e.name] ?? ''} <b>${esc(name)}</b>:${esc(rest)} <span class="muted">· ${e.daysLeft}d</span></div>`;
    })
    .join('')}</div>`;
}

function stepper(good, key, value, label) {
  return `<div class="field" data-field="${key}"><label for="${good}-${key}">${label}</label>
    <div class="stepper">
      <button type="button" data-step="-1" data-good="${good}" data-key="${key}" aria-label="less ${label}">−</button>
      <input id="${good}-${key}" inputmode="numeric" data-good="${good}" data-key="${key}" value="${value}">
      <button type="button" data-step="1" data-good="${good}" data-key="${key}" aria-label="more ${label}">+</button>
    </div></div>`;
}

function stallView() {
  if (!state.today) {
    return `<div class="panel closed"><h2>The market is closed</h2>
      <p class="muted">Ten days are up. Final score <b>${state.player.score}</b>, rank ${state.player.rank} of ${state.sellers.length}.</p>
      <button class="btn" data-action="new">Play again</button></div>`;
  }
  const t = state.today;
  const cards = state.goods
    .map((g, i) => {
      const swarm = t.swarms.find((s) => s.good === g);
      const m = moves[g];
      const have = state.player.stock[g] + m.make;
      const over = m.units > have;
      const last = t.lastPrice[g];
      const note = over
        ? `You only have ${have}. Over-asking voids your offer and costs the bond.`
        : !swarm
          ? 'Nobody needs this today. Stock waits, and a quarter spoils overnight.'
          : m.units > 0 && m.price < t.cost[g]
            ? `Below today's cost of ${t.cost[g]}: a loss if the price clears low.`
            : m.make > 0
              ? `Making ${m.make} costs ${m.make * t.cost[g]} coins now.`
              : '';
      return `<article class="good ${swarm ? '' : 'quiet'}" data-good="${g}" style="--c:${COLORS[g]};--i:${i}">
        <header><h3><span class="gicon">${GOOD_ICON[g]}</span>${g}</h3>${t.scarce.includes(g) ? '<span class="pill scarce">scarce</span>' : ''}</header>
        <div class="demand">${swarm ? `<b>${swarm.totalDemand}</b> wanted by ${swarm.buyers} buyers` : '<span class="muted">No swarm today</span>'}</div>
        <div class="facts">
          <div class="fact" data-fact="cost"><span>Cost</span><b>${t.cost[g]}</b></div>
          <div class="fact" data-fact="last"><span>Last price</span><b>${last ?? '—'}</b></div>
          <div class="fact"><span>Stock</span><b>${state.player.stock[g]}</b></div>
        </div>
        <div class="controls">
          ${stepper(g, 'make', m.make, 'Make')}
          ${stepper(g, 'units', m.units, 'Sell')}
          ${stepper(g, 'price', m.price, 'Min price')}
        </div>
        <div class="note ${over ? 'warn' : ''}">${esc(note)}</div>
        <div class="rivals">vs ${t.rivals[g].map(esc).join(', ')}</div>
      </article>`;
    })
    .join('');
  return `${eventsView()}<div class="goods">${cards}</div>${layout() === 'desktop' ? sealBar() : ''}`;
}

function sealBar() {
  const t = state.today;
  const cost = spend();
  const left = state.player.coins - cost;
  return `<div class="actionbar">
      <div class="sum">🪙 <b>${cost}</b> to make · <b class="${left < state.bond * 4 ? 'low' : ''}">${left}</b> left</div>
      <button class="btn seal" data-action="submit" ${busy ? 'disabled' : ''}>${busy ? '✉️ Sealing…' : `✉️ Seal day ${t.day}`}</button>
    </div>`;
}

function watchBar() {
  return `<div class="watchbar">
      <button class="btn" data-action="${autoplay ? 'pause' : 'resume'}" ${state.finished ? 'disabled' : ''}>${autoplay ? '⏸ Pause' : '▶ Run'}</button>
      <button class="btn ghost" data-action="step" ${busy || state.finished || autoplay ? 'disabled' : ''}>Next day</button>
      <button class="btn ghost" data-action="new">New town</button>
    </div>`;
}

function watchView() {
  return `${eventsView()}${watchBar()}<p class="muted watch-note">26 agents, each with its own wallet, trading with no human in the loop. Seed ${state.seed}.</p>`;
}

function boardView() {
  const rows = state.sellers
    .map(
      (s, i) => `<li class="${s.isPlayer && isPlay() ? 'me' : ''}">
        <span class="rank">${['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
        <span class="who"><b>${esc(s.isPlayer && isPlay() ? 'You' : s.name)}</b><small>${esc(s.makes.length === 4 ? 'any good' : s.makes.join(', '))} · ${esc(s.strategy === 'human' ? 'you' : s.strategy)}</small></span>
        <span class="score">${s.score}</span>
      </li>`,
    )
    .join('');
  return `<div class="panel board"><h2>Town board</h2><ol>${rows}</ol></div>`;
}

function txView(tx) {
  if (!tx) return '';
  return tx.url ? `<a class="tx" href="${esc(tx.url)}" target="_blank" rel="noopener">${esc(short(tx.hash))}</a>` : `<span class="tx" title="${esc(tx.hash)}">${esc(short(tx.hash))}</span>`;
}

function chartView(r) {
  const valid = r.reveals.filter((v) => v.valid && v.units > 0);
  const bids = valid.filter((v) => v.side === 'buy').sort((a, b) => b.price - a.price);
  const asks = valid.filter((v) => v.side === 'sell').sort((a, b) => a.price - b.price);
  if (!bids.length || !asks.length) return '';
  const total = Math.max(bids.reduce((s, v) => s + v.units, 0), asks.reduce((s, v) => s + v.units, 0));
  const top = Math.max(...valid.map((v) => v.price)) * 1.15 + 1;
  const W = 320, H = 110, pad = 4;
  const x = (u) => pad + (u / total) * (W - 2 * pad);
  const y = (p) => H - pad - (p / top) * (H - 2 * pad);
  const steps = (list) => {
    let u = 0;
    let d = '';
    for (const v of list) {
      d += `${d ? 'L' : 'M'}${x(u)},${y(v.price)} L${x(u + v.units)},${y(v.price)} `;
      u += v.units;
    }
    return d;
  };
  const priceLine = r.price === null ? '' : `<line x1="${pad}" x2="${W - pad}" y1="${y(r.price)}" y2="${y(r.price)}" stroke="var(--ink)" stroke-dasharray="3 3"/><text x="${W - pad}" y="${y(r.price) - 4}" text-anchor="end" font-size="10" fill="var(--ink)">price ${r.price}</text>`;
  const qLine = r.units ? `<line x1="${x(r.units)}" x2="${x(r.units)}" y1="${pad}" y2="${H - pad}" stroke="var(--muted)" stroke-dasharray="2 3"/>` : '';
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bids and asks for ${r.good}">${qLine}${priceLine}
      <path d="${steps(bids)}" fill="none" stroke="var(--good)" stroke-width="2"/><path d="${steps(asks)}" fill="none" stroke="var(--accent)" stroke-width="2"/>
      <text x="${pad + 2}" y="12" font-size="10" fill="var(--good)">bids</text><text x="${pad + 34}" y="12" font-size="10" fill="var(--accent)">asks</text></svg></div>`;
}

function roundView(r) {
  const filled = Object.fromEntries(r.fills.map((f) => [f.account, f.units]));
  const order = [...r.reveals].sort((a, b) => (a.side === b.side ? (a.side === 'sell' ? a.price - b.price : b.price - a.price) : a.side === 'sell' ? -1 : 1));
  const revealed = new Set(r.reveals.map((v) => v.account));
  const missing = r.commits.filter((c) => !revealed.has(c.account));
  const me = (a) => a === 'player' && isPlay();
  const reveals = order
    .map((v) => {
      const got = filled[v.account] ?? 0;
      const outcome = !v.valid ? `<span class="bad">${esc(v.reason)}</span>` : got ? `<span class="won">${v.side === 'sell' ? 'sold' : 'got'} ${got}</span>` : '<span class="lost">—</span>';
      return `<li class="${me(v.account) ? 'me' : ''}"><span class="who ${v.side === 'buy' ? 'side-buy' : ''}">${v.side === 'sell' ? 'Ask' : 'Bid'} · ${esc(me(v.account) ? 'You' : v.name)}</span><span class="mono">${v.units} @ ${v.price}</span>${outcome}</li>`;
    })
    .concat(missing.map((c) => `<li><span class="who">${esc(c.name)}</span><span></span><span class="bad">no reveal · bond lost</span></li>`))
    .join('');
  const sealed = r.commits.map((c) => `<li class="${me(c.account) ? 'me' : ''}"><span class="who">${esc(me(c.account) ? 'You' : c.name)}</span><span class="hash" title="${esc(c.hash)}">${esc(short(c.hash))}</span>${txView(c.tx)}</li>`).join('');
  const pays = r.payments.map((p) => `<li><span class="who">${esc(p.fromName)} → ${esc(me(p.to) ? 'You' : p.toName)}</span><span class="mono">🪙 ${p.amount}</span>${txView(p.tx)}</li>`).join('');
  return `<article class="round" data-good="${r.good}" style="--c:${COLORS[r.good]}">
    <header><h3>${GOOD_ICON[r.good]} ${r.good}</h3><span class="clear">${r.price === null ? '<span class="muted">no trade</span>' : `<b>${r.units}</b> @ <b>${r.price}</b>`}</span></header>
    <div class="muted small">Swarm of ${r.buyers} wanted ${r.totalDemand} · ${r.commits.length} sealed offers</div>
    ${chartView(r)}
    <div class="phase">Revealed</div><ul class="offers">${reveals}</ul>
    ${pays ? `<div class="phase">Paid · ${r.payments.length}</div><ul class="offers">${pays}</ul>` : ''}
    <details class="sealed"><summary>Sealed hashes</summary><ul class="offers">${sealed}</ul></details>
  </article>`;
}

function resultsView(d) {
  const picks = state.days.map((x) => `<button data-day="${x.day}" aria-pressed="${x.day === d.day}">${x.day}</button>`).join('');
  const chain = d.chain.errors.length
    ? `<p class="chain-note err">Chain: ${esc(d.chain.errors.join('; '))}</p>`
    : d.chain.network === 'testnet'
      ? '<p class="chain-note">Every commit, reveal and payment is a NEAR testnet transaction signed by that agent. Click a hash to open it.</p>'
      : '<p class="chain-note">Offline ledger: ids are local. Run with HAAT_CHAIN=testnet to sign every step on NEAR testnet.</p>';
  return `<section class="results">
    <div class="results-head"><h2>Day ${d.day} at the market</h2><div class="daypick" aria-label="Pick a day">${picks}</div></div>
    <div class="rounds">${d.rounds.map(roundView).join('') || '<p class="muted">No swarms formed this day.</p>'}</div>
    ${chain}
  </section>`;
}

function showEnd() {
  const rank = state.player.rank;
  const top = rank <= 3;
  const headline = rank === 1 ? 'Best stall in town!' : top ? 'A solid run at the haat.' : 'The agents out-traded you.';
  endBody.innerHTML = `<div class="trophy">${['🏆', '🥈', '🥉'][rank - 1] ?? '🧺'}</div><h2>${headline}</h2>
    <div class="big">${state.player.score}</div><p class="muted">final score · rank ${rank} of ${state.sellers.length}</p>
    <ol>${state.sellers.map((s) => `<li class="${s.isPlayer ? 'me' : ''}">${esc(s.isPlayer ? 'You' : s.name)} <span>${s.score}</span></li>`).join('')}</ol>
    <div class="row"><button class="btn" data-end="again">Play again</button><button class="btn ghost" data-end="close">See the rounds</button></div>`;
  endDialog.showModal();
  if (top) { confetti(); sfx.fanfare(); } else sfx.sad();
}

// ---------- input ----------

app.addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]');
  if (step) {
    const { good, key } = step.dataset;
    setMove(good, key, moves[good][key] + Number(step.dataset.step));
    sfx.click();
    return render();
  }
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; sfx.click(); return render(); }
  const day = e.target.closest('[data-day]');
  if (day) { shownDay = Number(day.dataset.day); return render(); }
  const act = e.target.closest('[data-action]');
  if (!act || act.disabled) return;
  const a = act.dataset.action;
  if (a === 'submit') nextDay(readMoves());
  else if (a === 'new') startGame(mode);
  else if (a === 'pause') { stopAuto(); render(); }
  else if (a === 'resume') startAuto();
  else if (a === 'step') nextDay();
});
app.addEventListener('change', (e) => {
  const inp = e.target.closest('.stepper input');
  if (!inp) return;
  setMove(inp.dataset.good, inp.dataset.key, inp.value);
  render();
});
statsEl.addEventListener('click', (e) => {
  if (e.target.closest('.help')) return startGame('tutorial');
  if (!e.target.closest('.mute')) return;
  sfx.toggle();
  renderStats();
});
document.querySelectorAll('.modes button').forEach((b) => b.addEventListener('click', () => b.dataset.mode !== mode && startGame(b.dataset.mode)));
endBody.addEventListener('click', (e) => {
  const what = e.target.closest('[data-end]')?.dataset.end;
  if (!what) return;
  endDialog.close();
  if (what === 'again') startGame('play');
});

showTitle();

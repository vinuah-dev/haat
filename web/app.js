// Haat web client. Talks to server/index.ts; all market logic runs on the server.

const app = document.getElementById('app');
const statsEl = document.getElementById('stats');
const endDialog = document.getElementById('end');
const endBody = document.getElementById('end-body');

const COLORS = { grain: 'var(--grain)', bread: 'var(--bread)', tools: 'var(--tools)', cloth: 'var(--cloth)' };

let state = null;
let mode = 'play';
let moves = {};
let shownDay = null;
let busy = false;
let autoplay = null;
let freshDay = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = (h) => (h.length > 14 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h);

async function call(method, path, body) {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

// ---------- game flow ----------

async function startGame(nextMode = mode) {
  stopAuto();
  mode = nextMode;
  document.querySelectorAll('.modes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  app.innerHTML = '<p class="loading">Opening the market…</p>';
  try {
    state = await call('POST', '/api/games', { mode });
  } catch (e) {
    app.innerHTML = `<p class="loading">Could not reach the market: ${esc(e.message)}</p>`;
    return;
  }
  try { localStorage.setItem('haat-game', JSON.stringify({ id: state.id, mode })); } catch {}
  shownDay = null;
  resetMoves();
  render();
  if (mode === 'watch') startAuto();
}

async function resume() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('haat-game') ?? 'null'); } catch {}
  if (saved?.id) {
    try {
      state = await call('GET', `/api/games/${saved.id}`);
      mode = state.mode;
      document.querySelectorAll('.modes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
      resetMoves();
      render();
      if (mode === 'watch' && !state.finished) startAuto();
      return;
    } catch {}
  }
  startGame('play');
}

async function nextDay(body = {}) {
  if (busy || !state || state.finished) return;
  busy = true;
  render();
  try {
    state = await call('POST', `/api/games/${state.id}/day`, body);
    freshDay = state.days[state.days.length - 1]?.day ?? null;
    shownDay = null;
    resetMoves();
  } catch (e) {
    alert(e.message);
  } finally {
    busy = false;
  }
  render();
  if (state.finished) {
    stopAuto();
    if (mode === 'play') showEnd();
  }
}

function startAuto() {
  stopAuto();
  autoplay = setInterval(() => nextDay(), 2600);
  render();
}
function stopAuto() {
  if (autoplay) clearInterval(autoplay);
  autoplay = null;
}

// ---------- player moves ----------

function resetMoves() {
  moves = {};
  if (!state?.today) return;
  for (const g of state.goods) {
    const cost = state.today.cost[g];
    const last = state.today.lastPrice[g];
    moves[g] = { make: 0, units: state.player.stock[g], price: last ?? cost + 2 };
  }
}

function spend() {
  return state.goods.reduce((s, g) => s + (moves[g]?.make ?? 0) * state.today.cost[g], 0);
}

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

// ---------- rendering ----------

function render() {
  if (!state) return;
  renderStats();
  const latest = state.days[state.days.length - 1];
  const day = shownDay ?? latest?.day ?? null;
  const shown = state.days.find((d) => d.day === day);

  const main = mode === 'play' ? stallView() : watchView();
  app.innerHTML = `
    <div class="grid">
      <section>${main}${shown ? resultsView(shown) : ''}</section>
      <aside class="side">${boardView()}<div class="panel">${document.getElementById('how').innerHTML}</div></aside>
    </div>`;
  if (shown && freshDay === shown.day) {
    freshDay = null;
    const rounds = app.querySelector('.rounds');
    if (rounds) {
      rounds.classList.add('sealed');
      setTimeout(() => rounds.classList.remove('sealed'), 900);
    }
  }
}

function renderStats() {
  const p = state.player;
  const items =
    mode === 'play'
      ? [
          ['Day', `${Math.min(state.day, state.totalDays)}/${state.totalDays}`],
          ['Coins', p.coins],
          ['Score', p.score],
          ['Rank', `${p.rank}/${state.sellers.length}`],
        ]
      : [
          ['Day', `${Math.min(state.day, state.totalDays)}/${state.totalDays}`],
          ['Agents', 26],
          ['Rounds', state.days.reduce((s, d) => s + d.rounds.length, 0)],
        ];
  statsEl.innerHTML =
    items.map(([k, v]) => `<div class="stat"><b>${esc(v)}</b><span>${k}</span></div>`).join('') +
    `<span class="net ${state.network}" title="Where trades are recorded">${state.network === 'testnet' ? 'NEAR testnet' : 'offline ledger'}</span>`;
}

function eventsView() {
  if (!state.today) return '';
  const ev = state.today.events;
  if (ev.length === 0) return `<div class="events"><div class="event">A calm day in town.</div></div>`;
  return `<div class="events">${ev
    .map((e) => {
      const [name, rest] = e.label.split(':');
      return `<div class="event hot"><b>${esc(name)}</b>:${esc(rest)} <span class="muted">· ${e.daysLeft} day${e.daysLeft > 1 ? 's' : ''} left</span></div>`;
    })
    .join('')}</div>`;
}

function stepper(good, key, value, label) {
  return `<div class="field"><label for="${good}-${key}">${label}</label>
    <div class="stepper">
      <button type="button" data-step="-1" data-good="${good}" data-key="${key}" aria-label="less">−</button>
      <input id="${good}-${key}" inputmode="numeric" data-good="${good}" data-key="${key}" value="${value}">
      <button type="button" data-step="1" data-good="${good}" data-key="${key}" aria-label="more">+</button>
    </div></div>`;
}

function stallView() {
  if (!state.today) {
    return `<div class="panel" style="padding:18px"><h2 style="margin:0 0 8px;font-size:20px;text-transform:none;letter-spacing:0;color:var(--ink)">The market is closed</h2>
      <p class="muted">Ten days are up. Your final score is <b>${state.player.score}</b>, rank ${state.player.rank} of ${state.sellers.length}.</p>
      <button class="btn" data-action="new">Play again</button></div>`;
  }
  const t = state.today;
  const cards = state.goods
    .map((g) => {
      const swarm = t.swarms.find((s) => s.good === g);
      const m = moves[g];
      const scarce = t.scarce.includes(g);
      const have = state.player.stock[g] + m.make;
      const over = m.units > have;
      const last = t.lastPrice[g];
      const note = over
        ? `You only have ${have}. Asking for more than you hold voids your offer and costs the bond.`
        : !swarm
          ? 'Nobody needs this today. Anything you make waits, and a quarter spoils overnight.'
          : m.units > 0 && m.price < t.cost[g]
            ? `Below today's cost of ${t.cost[g]}: you would sell at a loss if the price clears low.`
            : m.make > 0
              ? `Making ${m.make} costs ${m.make * t.cost[g]} coins now.`
              : '';
      return `<article class="good" style="--c:${COLORS[g]}">
        <header><h3><span class="dot"></span>${g}</h3>${scarce ? '<span class="pill scarce">scarce</span>' : ''}</header>
        <div class="demand">${swarm ? `<b>${swarm.totalDemand}</b> units wanted by a swarm of ${swarm.buyers}` : '<span class="muted">No swarm today</span>'}</div>
        <div class="facts">
          <div class="fact"><span>Cost</span><b>${t.cost[g]}</b></div>
          <div class="fact"><span>Last price</span><b>${last ?? '—'}</b></div>
          <div class="fact"><span>Your stock</span><b>${state.player.stock[g]}</b></div>
        </div>
        <div class="rivals">Rivals: ${t.rivals[g].map(esc).join(', ')}</div>
        <div class="controls">
          ${stepper(g, 'make', m.make, 'Make')}
          ${stepper(g, 'units', m.units, 'Sell units')}
          ${stepper(g, 'price', m.price, 'Lowest price')}
        </div>
        <div class="note ${over ? 'warn' : ''}">${esc(note)}</div>
      </article>`;
    })
    .join('');
  const cost = spend();
  const left = state.player.coins - cost;
  return `${eventsView()}
    <div class="goods">${cards}</div>
    <div class="actionbar">
      <div class="sum">Making costs <b>${cost}</b> · coins after: <b style="color:${left < state.bond * 4 ? 'var(--bad)' : 'inherit'}">${left}</b>
        <span class="muted">· keep ${state.bond * 4} for bonds</span></div>
      <button class="btn" data-action="submit" ${busy ? 'disabled' : ''}>${busy ? 'Sealing offers…' : `Seal offers for day ${t.day} →`}</button>
    </div>`;
}

function watchView() {
  const running = Boolean(autoplay);
  return `${eventsView()}
    <div class="watchbar">
      <button class="btn" data-action="${running ? 'pause' : 'resume'}" ${state.finished ? 'disabled' : ''}>${running ? 'Pause' : 'Run'}</button>
      <button class="btn ghost" data-action="step" ${busy || state.finished || running ? 'disabled' : ''}>Next day</button>
      <button class="btn ghost" data-action="new">New town</button>
      <p>20 buyer agents and 6 seller agents, each with its own wallet, trading with no human in the loop. Seed ${state.seed}.</p>
    </div>
    ${state.days.length === 0 ? '<p class="muted">The first day is about to open…</p>' : ''}`;
}

function boardView() {
  const rows = state.sellers
    .map(
      (s, i) => `<li class="${s.isPlayer && mode === 'play' ? 'me' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="who"><b>${esc(s.isPlayer && mode === 'play' ? 'You' : s.name)}</b><small>${esc(s.makes.length === 4 ? 'any good' : s.makes.join(', '))} · ${esc(s.strategy === 'human' ? 'you' : s.strategy)}</small></span>
        <span class="score" title="coins ${s.coins} + stock">${s.score}</span>
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
  const priceLine = r.price === null ? '' : `<line x1="${pad}" x2="${W - pad}" y1="${y(r.price)}" y2="${y(r.price)}" stroke="var(--ink)" stroke-dasharray="3 3" stroke-width="1"/>
    <text x="${W - pad}" y="${y(r.price) - 4}" text-anchor="end" font-size="10" fill="var(--ink)">price ${r.price}</text>`;
  const qLine = r.units ? `<line x1="${x(r.units)}" x2="${x(r.units)}" y1="${pad}" y2="${H - pad}" stroke="var(--muted)" stroke-dasharray="2 3"/>` : '';
  return `<div class="chart reveal"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bids and asks for ${r.good}">
      ${qLine}${priceLine}
      <path d="${steps(bids)}" fill="none" stroke="var(--good)" stroke-width="2"/>
      <path d="${steps(asks)}" fill="none" stroke="var(--accent)" stroke-width="2"/>
      <text x="${pad + 2}" y="12" font-size="10" fill="var(--good)">bids</text>
      <text x="${pad + 34}" y="12" font-size="10" fill="var(--accent)">asks</text>
    </svg></div>`;
}

function roundView(r) {
  const filled = Object.fromEntries(r.fills.map((f) => [f.account, f.units]));
  const commits = Object.fromEntries(r.commits.map((c) => [c.account, c]));
  const order = [...r.reveals].sort((a, b) => (a.side === b.side ? (a.side === 'sell' ? a.price - b.price : b.price - a.price) : a.side === 'sell' ? -1 : 1));
  const revealed = new Set(r.reveals.map((v) => v.account));
  const missing = r.commits.filter((c) => !revealed.has(c.account));
  const me = (a) => a === 'player' && mode === 'play';

  const sealed = r.commits
    .map((c) => `<li class="${me(c.account) ? 'me' : ''}"><span class="who">${esc(me(c.account) ? 'You' : c.name)}</span><span class="hash" title="${esc(c.hash)}">${esc(short(c.hash))}</span>${txView(c.tx)}</li>`)
    .join('');
  const reveals = order
    .map((v) => {
      const got = filled[v.account] ?? 0;
      const outcome = !v.valid ? `<span class="bad">${esc(v.reason)}</span>` : got ? `<span class="won">${v.side === 'sell' ? 'sold' : 'got'} ${got}</span>` : `<span class="lost">—</span>`;
      const label = me(v.account) ? 'You' : v.name;
      return `<li class="${me(v.account) ? 'me' : ''}"><span class="who ${v.side === 'buy' ? 'side-buy' : ''}">${v.side === 'sell' ? 'Ask' : 'Bid'} · ${esc(label)}</span><span class="mono">${v.units} @ ${v.price}</span>${outcome}</li>`;
    })
    .concat(missing.map((c) => `<li><span class="who">${esc(c.name)}</span><span></span><span class="bad">never revealed · bond lost</span></li>`))
    .join('');
  const pays = r.payments.length;

  return `<article class="round" style="--c:${COLORS[r.good]}">
    <header><h3>${r.good}</h3><span class="clear reveal">${r.price === null ? '<span class="muted">no trade</span>' : `<b>${r.units}</b> @ <b>${r.price}</b>`}</span></header>
    <div class="muted" style="font-size:13px">Swarm of ${r.buyers} wanted ${r.totalDemand} · ${r.commits.length} sealed offers</div>
    ${chartView(r)}
    <div class="phase">Sealed</div><ul class="offers">${sealed}</ul>
    <div class="reveal"><div class="phase">Revealed</div><ul class="offers">${reveals}</ul>
    ${pays ? `<div class="phase">Settled · ${pays} payment${pays > 1 ? 's' : ''}</div><ul class="offers">${r.payments
      .map((p) => `<li><span class="who">${esc(p.fromName)} →${esc(me(p.to) ? 'You' : p.toName)}</span><span class="mono">${p.amount}</span>${txView(p.tx)}</li>`)
      .join('')}</ul>` : ''}</div>
  </article>`;
}

function resultsView(d) {
  const picks = state.days
    .map((x) => `<button data-day="${x.day}" aria-pressed="${x.day === d.day}">${x.day}</button>`)
    .join('');
  const chain = d.chain.errors.length
    ? `<p class="chain-note err">Chain: ${esc(d.chain.errors.join('; '))}</p>`
    : d.chain.network === 'testnet'
      ? '<p class="chain-note">Every commit, reveal and payment above is a NEAR testnet transaction signed by that agent\'s own account. Click a hash to open it.</p>'
      : '<p class="chain-note">Offline ledger: ids are local. Run the server with HAAT_CHAIN=testnet to sign every step on NEAR testnet.</p>';
  return `<section class="results">
    <div class="results-head"><h2>Day ${d.day} at the market</h2><div class="daypick" aria-label="Pick a day">${picks}</div>
      <span class="muted">${esc(d.events.map((e) => e.split(':')[0]).join(', ') || 'Calm')}</span></div>
    <div class="rounds">${d.rounds.map(roundView).join('') || '<p class="muted">No swarms formed this day.</p>'}</div>
    ${chain}
  </section>`;
}

function showEnd() {
  const rank = state.player.rank;
  const n = state.sellers.length;
  const headline = rank === 1 ? 'You ran the best stall in town.' : rank <= 3 ? 'A solid run at the haat.' : 'The agents out-traded you this time.';
  endBody.innerHTML = `<h2>${headline}</h2>
    <div class="big">${state.player.score}</div><p class="muted">final score · rank ${rank} of ${n}</p>
    <ol>${state.sellers.map((s) => `<li>${esc(s.isPlayer ? 'You' : s.name)} · ${s.score}</li>`).join('')}</ol>
    <div class="row"><button class="btn" data-end="again">Play again</button><button class="btn ghost" data-end="close">Look at the rounds</button></div>`;
  endDialog.showModal();
}

// ---------- events ----------

function setMove(good, key, value) {
  const n = Math.max(0, Math.min(999, Math.floor(Number(value)) || 0));
  const prevHave = state.player.stock[good] + moves[good].make;
  moves[good][key] = n;
  // Keep "sell" in step with what you make, unless you set it yourself to something else.
  if (key === 'make' && moves[good].units === prevHave) moves[good].units = state.player.stock[good] + n;
}

// One delegated listener survives every re-render, so fast clicks are never lost.
app.addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]');
  if (step) {
    const { good, key } = step.dataset;
    setMove(good, key, moves[good][key] + Number(step.dataset.step));
    return render();
  }
  const day = e.target.closest('[data-day]');
  if (day) {
    shownDay = Number(day.dataset.day);
    return render();
  }
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

document.querySelectorAll('.modes button').forEach((b) => b.addEventListener('click', () => b.dataset.mode !== mode && startGame(b.dataset.mode)));
endBody.addEventListener('click', (e) => {
  const what = e.target.closest('[data-end]')?.dataset.end;
  if (!what) return;
  endDialog.close();
  if (what === 'again') startGame('play');
});

resume();

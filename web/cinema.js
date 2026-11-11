// The round cinematic and the morning intro.
// PC: a centred stage, sealed cards dealt into a grid and flipped sideways, a big stamp.
// Phone: a bottom sheet, cards slide in as a list and flip top-to-bottom, the phone buzzes on the stamp.

import { reducedMotion, sleep } from './fx.js';
import { GOOD_ICON } from './scene.js';
import { sfx } from './sfx.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = (h) => `${h.slice(0, 5)}…${h.slice(-3)}`;
const mobile = () => document.body.dataset.layout === 'mobile';
const buzz = (p) => mobile() && navigator.vibrate?.(p);

const EVENT_ICON = { drought: '☀️', festival: '🎉', 'new-road': '🛤️' };

let root = null;
let skipping = false;

function ensureRoot() {
  if (root) return root;
  root = document.createElement('div');
  root.className = 'cine';
  root.hidden = true;
  root.innerHTML = `
    <div class="cine-panel" role="dialog" aria-modal="true" aria-label="Market round">
      <div class="cine-grip"></div>
      <div class="cine-head">
        <span class="cine-icon"></span>
        <div class="cine-title"><h2></h2><p></p></div>
        <span class="cine-step"></span>
      </div>
      <div class="cine-deck"></div>
      <div class="cine-stamp" aria-live="polite"></div>
      <div class="cine-foot"><span class="cine-count"></span><button type="button" class="cine-skip">Skip ▸▸</button></div>
    </div>`;
  document.body.appendChild(root);
  root.querySelector('.cine-skip').addEventListener('click', () => (skipping = true));
  return root;
}

const wait = (ms) => (skipping ? Promise.resolve() : sleep(ms));

function cardHtml(r, c, reveal, filled, me) {
  const isMe = c.account === 'player' && me;
  const name = isMe ? 'You' : c.name;
  let back;
  if (!reveal) back = `<small>NO SHOW</small><b class="v">—</b><span class="n">${esc(name)}</span><em class="o void">bond lost</em>`;
  else {
    const side = reveal.side === 'sell' ? 'ASK' : 'BID';
    const got = filled[c.account] ?? 0;
    const o = !reveal.valid ? `<em class="o void">${esc(reveal.reason)}</em>` : got ? `<em class="o win">${reveal.side === 'sell' ? 'sold' : 'got'} ${got}</em>` : '<em class="o miss">missed</em>';
    back = `<small>${side}</small><b class="v">${reveal.units} @ ${reveal.price}</b><span class="n">${esc(name)}</span>${o}`;
  }
  const result = !reveal || !reveal.valid ? 'void' : (filled[c.account] ?? 0) > 0 ? 'won' : 'lost';
  return `<div class="card ${c.side} ${isMe ? 'me' : ''}" data-result="${result}">
      <div class="card-inner">
        <div class="card-face card-front"><span class="lock">🔒</span><span class="n">${esc(name)}</span><span class="h">${esc(short(c.hash))}</span></div>
        <div class="card-face card-back">${back}</div>
      </div>
    </div>`;
}

/** Play every round of a finished day. Resolves when done or skipped. */
export async function playDay(day, { me = true, speed = 1 } = {}) {
  if (!day.rounds.length) return;
  const el = ensureRoot();
  const t = (ms) => (reducedMotion() ? Math.min(ms, 150) : ms) / speed;
  skipping = false;
  el.hidden = false;
  el.classList.remove('closing');
  requestAnimationFrame(() => el.classList.add('open'));
  const deck = el.querySelector('.cine-deck');
  const stamp = el.querySelector('.cine-stamp');
  const step = el.querySelector('.cine-step');

  for (const [i, r] of day.rounds.entries()) {
    if (skipping) break;
    el.style.setProperty('--gcol', `var(--${r.good})`);
    el.querySelector('.cine-icon').textContent = GOOD_ICON[r.good];
    el.querySelector('.cine-title h2').textContent = `${r.good[0].toUpperCase()}${r.good.slice(1)} market`;
    el.querySelector('.cine-title p').textContent = `Day ${day.day} · swarm of ${r.buyers} wants ${r.totalDemand}`;
    el.querySelector('.cine-count').textContent = `Round ${i + 1} of ${day.rounds.length}`;
    stamp.className = 'cine-stamp';
    stamp.textContent = '';

    const reveals = Object.fromEntries(r.reveals.map((v) => [v.account, v]));
    const filled = Object.fromEntries(r.fills.map((f) => [f.account, f.units]));
    const order = [...r.commits].sort((a, b) => (a.side === b.side ? a.seq - b.seq : a.side === 'sell' ? -1 : 1));
    deck.innerHTML = order.map((c) => cardHtml(r, c, reveals[c.account], filled, me)).join('');
    const cards = [...deck.children];

    // 1. deal sealed cards
    step.textContent = 'Sealed offers';
    for (const c of cards) {
      if (skipping) break;
      c.classList.add('dealt');
      sfx.deal();
      await wait(t(mobile() ? 55 : 75));
    }
    cards.forEach((c) => c.classList.add('dealt'));
    await wait(t(450));

    // 2. reveal
    step.textContent = 'Reveal!';
    for (const c of cards) {
      if (skipping) break;
      c.classList.add('flipped');
      sfx.flip();
      await wait(t(mobile() ? 70 : 90));
    }
    cards.forEach((c) => c.classList.add('flipped'));
    await wait(t(500));

    // 3. clear
    step.textContent = 'Clearing';
    deck.classList.add('judged');
    await wait(t(250));
    if (r.price === null) {
      stamp.textContent = 'NO DEAL';
      stamp.classList.add('show', 'none');
      sfx.nodeal();
    } else {
      stamp.innerHTML = `SOLD <b>${r.units}</b> @ <b>${r.price}</b>`;
      stamp.classList.add('show');
      sfx.stamp();
      buzz([25, 40, 25]);
    }
    await wait(t(1150));
    deck.classList.remove('judged');
  }

  el.classList.add('closing');
  el.classList.remove('open');
  await sleep(250);
  el.hidden = true;
  skipping = false;
}

/** Big "Day N" card with the day's events and swarms. */
export async function dayIntro(today, { speed = 1 } = {}) {
  if (!today) return;
  const el = document.createElement('div');
  el.className = 'intro';
  const events = today.events.length
    ? today.events.map((e) => `<div class="intro-ev ${e.isNew ? 'new' : ''}">${EVENT_ICON[e.name] ?? '✨'} ${esc(e.label)}</div>`).join('')
    : '<div class="intro-ev calm">🌤️ A calm day in town</div>';
  const swarms = today.swarms.map((s) => `<span>${GOOD_ICON[s.good]} ${s.totalDemand}</span>`).join('');
  el.innerHTML = `<div class="intro-card"><small>Morning</small><h2>Day ${today.day}</h2>${events}<div class="intro-swarms">${swarms || '<span>No swarms today</span>'}</div></div>`;
  document.body.appendChild(el);
  sfx.rooster();
  let done;
  const finished = new Promise((r) => (done = r));
  el.addEventListener('click', () => done());
  setTimeout(done, (reducedMotion() ? 600 : 1900) / speed);
  await finished;
  el.classList.add('out');
  await sleep(300);
  el.remove();
}

// The round cinematic and the morning intro.
// PC: a centred stage, sealed cards dealt into a grid and flipped sideways, a big stamp.
// Phone: a bottom sheet, cards slide in as a list and flip top-to-bottom, the phone buzzes on the stamp.

import { reducedMotion, sleep } from './fx.js';
import { GOOD_ICON } from './scene.js';
import { sfx } from './sfx.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = (h) => `${h.slice(0, 5)}…${h.slice(-3)}`;
const mobile = () => document.body.dataset.layout === 'mobile';
const buzz = (p) => mobile() && navigator.userActivation?.hasBeenActive && navigator.vibrate?.(p);

const EVENT_ICON = { drought: '☀️', festival: '🎉', 'new-road': '🛤️' };

let root = null;
let skipping = false;
let resume = null; // set while the cinematic is paused on a round's result
let auto = true;
try { auto = localStorage.getItem('haat-auto') !== '0'; } catch {}

// ---------- reading a round ----------

const TXT = {
  en: {
    title: 'How to read this round',
    ask: '🟧 <b>ASK</b> = a seller. <b>8 @ 4</b> means: offers 8, will not sell any below 4 each.',
    bid: '🟩 <b>BID</b> = a buyer. <b>3 @ 7</b> means: wants 3, will pay up to 7 each.',
    order: 'The cheapest asks are matched with the highest bids, one unit at a time, until the next bid is lower than the next ask. Equal prices: whoever sealed first goes first.',
    outcome: '<b>sold / got</b> = units that traded. <b>missed</b> = their price did not reach the market price, or the demand ran out first.',
    stamp: (q, p) => `<b>SOLD ${q} @ ${p}</b> = ${q} units changed hands, every one of them at ${p}, for buyers and sellers alike.`,
    nodeal: '<b>NO DEAL</b> = no buyer bid as high as the cheapest ask, so nothing traded.',
    legend: '🟧 ASK = seller · 🟩 BID = buyer · <b>8 @ 4</b> = 8 units, 4 each',
    you: {
      void: (r) => `<b>You:</b> your offer was void (${r}) and the bond was lost.`,
      all: (u, a, p) => `<b>You:</b> asked ${u} @ ${a} → all ${u} sold at ${p} each = <b>${u * p} coins</b>.`,
      some: (u, a, s, p, q) => `<b>You:</b> asked ${u} @ ${a} → ${s} sold at ${p} each = <b>${s * p} coins</b>. The other ${u - s} did not sell: at ${p} the buyers wanted only ${q} in total, and the queue goes cheapest first, then earliest.`,
      noDeal: (u, a) => `<b>You:</b> asked ${u} @ ${a} → nothing sold. No buyer would pay that much.`,
      above: (u, a, p) => `<b>You:</b> asked ${u} @ ${a} → nothing sold. Your lowest price ${a} was above the market price ${p}.`,
      beaten: (u, a) => `<b>You:</b> asked ${u} @ ${a} → nothing sold. Cheaper or earlier asks filled the demand first.`,
    },
    next: 'Next round →', done: 'Done ✓', skip: 'Skip ▸▸',
  },
  hi: {
    title: 'Is round ko kaise padhein',
    ask: '🟧 <b>ASK</b> = bechne wala. <b>8 @ 4</b> matlab: 8 bechega, 4 se kam mein ek bhi nahi.',
    bid: '🟩 <b>BID</b> = khareedne wala. <b>3 @ 7</b> matlab: 3 chahiye, ek ke 7 tak dega.',
    order: 'Sabse saste ASK ko sabse oonchi BID se milaate hain, ek-ek unit karke, jab tak agli BID agle ASK se neeche na aa jaaye. Price barabar ho toh jisne pehle seal kiya, woh pehle.',
    outcome: '<b>sold / got</b> = jitne bike ya mile. <b>missed</b> = uska price market price tak nahi pahuncha, ya demand pehle hi khatam ho gayi.',
    stamp: (q, p) => `<b>SOLD ${q} @ ${p}</b> = ${q} units ka len-den hua, aur har ek ${p} pe, buyer aur seller dono ke liye.`,
    nodeal: '<b>NO DEAL</b> = kisi buyer ki BID sabse saste ASK tak nahi pahunchi, toh kuch nahi bika.',
    legend: '🟧 ASK = bechne wala · 🟩 BID = khareedne wala · <b>8 @ 4</b> = 8 units, 4 ka ek',
    you: {
      void: (r) => `<b>Tum:</b> tumhara offer radd ho gaya (${r}), bond kat gaya.`,
      all: (u, a, p) => `<b>Tum:</b> ${u} @ ${a} maange → saare ${u} bik gaye, ${p} ke rate pe = <b>${u * p} coin</b>.`,
      some: (u, a, s, p, q) => `<b>Tum:</b> ${u} @ ${a} maange → ${s} bike, ${p} ke rate pe = <b>${s * p} coin</b>. Baaki ${u - s} nahi bike: ${p} pe buyers ko kul ${q} hi chahiye the, aur line mein pehle saste, phir pehle aane wale.`,
      noDeal: (u, a) => `<b>Tum:</b> ${u} @ ${a} maange → kuch nahi bika. Itna price koi buyer nahi deta.`,
      above: (u, a, p) => `<b>Tum:</b> ${u} @ ${a} maange → kuch nahi bika. Tumhara min price ${a}, market price ${p} se zyada tha.`,
      beaten: (u, a) => `<b>Tum:</b> ${u} @ ${a} maange → kuch nahi bika. Saste ya pehle wale sellers ne demand pehle hi poori kar di.`,
    },
    next: 'Agla round →', done: 'Ho gaya ✓', skip: 'Skip ▸▸',
  },
};

/** One line on how the player did in this round, and why. Null if the player was not in it. */
export function youLine(r, lang = 'en') {
  const L = (TXT[lang] ?? TXT.en).you;
  if (!r.commits.some((c) => c.account === 'player')) return null;
  const v = r.reveals.find((x) => x.account === 'player');
  if (!v || !v.valid) return L.void(v?.reason ?? 'not revealed');
  if (v.side !== 'sell') return null;
  const sold = r.fills.find((f) => f.account === 'player' && f.side === 'sell')?.units ?? 0;
  if (sold >= v.units) return L.all(v.units, v.price, r.price);
  if (sold > 0) return L.some(v.units, v.price, sold, r.price, r.units);
  if (r.price === null) return L.noDeal(v.units, v.price);
  if (v.price > r.price) return L.above(v.units, v.price, r.price);
  return L.beaten(v.units, v.price);
}

function explainHtml(r, lang, full) {
  const T = TXT[lang] ?? TXT.en;
  const you = youLine(r, lang);
  const deal = r.price === null ? T.nodeal : T.stamp(r.units, r.price);
  if (!full) return `<p class="legend">${T.legend}</p>${you ? `<p class="you">${you}</p>` : ''}`;
  return `<h4>${T.title}</h4><ul><li>${T.ask}</li><li>${T.bid}</li><li>${T.order}</li><li>${T.outcome}</li><li>${deal}</li></ul>${you ? `<p class="you">${you}</p>` : ''}`;
}

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
      <div class="cine-narr" hidden></div>
      <div class="cine-deck"></div>
      <div class="cine-stamp" aria-live="polite"></div>
      <div class="cine-explain" hidden></div>
      <div class="cine-foot">
        <span class="cine-count"></span>
        <div class="cine-ctrl">
          <button type="button" class="cine-auto" aria-pressed="true" title="Play every round on its own, or stop after each one">Auto</button>
          <button type="button" class="cine-skip">Skip ▸▸</button>
          <button type="button" class="btn cine-next" hidden>Next →</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);
  const go = () => { const r = resume; resume = null; r?.(); };
  root.querySelector('.cine-skip').addEventListener('click', () => { skipping = true; go(); });
  root.querySelector('.cine-next').addEventListener('click', go);
  root.querySelector('.cine-auto').addEventListener('click', () => {
    auto = !auto;
    try { localStorage.setItem('haat-auto', auto ? '1' : '0'); } catch {}
    syncAuto();
    if (auto) go(); // turning Auto on while paused carries on
  });
  addEventListener('keydown', (e) => {
    if (!resume || root.hidden) return;
    if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(); }
  });
  return root;
}

function syncAuto() {
  const b = root?.querySelector('.cine-auto');
  if (!b) return;
  b.setAttribute('aria-pressed', String(auto));
  b.textContent = auto ? '▶ Auto: on' : '⏸ Auto: off';
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
export async function playDay(day, { me = true, speed = 1, narrate = null, manual = false, explain = false, lang = 'en' } = {}) {
  if (!day.rounds.length) return;
  const el = ensureRoot();
  const saved = auto;
  if (manual) auto = false; // the tutorial stops on every round; the player's own choice is restored after
  syncAuto();
  const T = TXT[lang] ?? TXT.en;
  el.querySelector('.cine-skip').textContent = T.skip;
  const nextBtn = el.querySelector('.cine-next');
  const explainEl = el.querySelector('.cine-explain');
  const t = (ms) => (reducedMotion() ? Math.min(ms, 150) : ms) / speed;
  skipping = false;
  el.hidden = false;
  el.classList.remove('closing');
  requestAnimationFrame(() => el.classList.add('open'));
  const deck = el.querySelector('.cine-deck');
  const stamp = el.querySelector('.cine-stamp');
  const step = el.querySelector('.cine-step');
  const narr = el.querySelector('.cine-narr');
  narr.hidden = !narrate;
  const say = (k) => { if (narrate) narr.textContent = narrate[k]; };

  for (const [i, r] of day.rounds.entries()) {
    if (skipping) break;
    el.style.setProperty('--gcol', `var(--${r.good})`);
    el.querySelector('.cine-icon').textContent = GOOD_ICON[r.good];
    el.querySelector('.cine-title h2').textContent = `${r.good[0].toUpperCase()}${r.good.slice(1)} market`;
    el.querySelector('.cine-title p').textContent = `Day ${day.day} · swarm of ${r.buyers} wants ${r.totalDemand} · round ${i + 1}/${day.rounds.length}`;
    el.querySelector('.cine-count').textContent = `Round ${i + 1} of ${day.rounds.length}`;
    stamp.className = 'cine-stamp';
    stamp.textContent = '';
    explainEl.hidden = true;
    nextBtn.hidden = true;
    el.classList.remove('paused');

    const reveals = Object.fromEntries(r.reveals.map((v) => [v.account, v]));
    const filled = Object.fromEntries(r.fills.map((f) => [f.account, f.units]));
    const order = [...r.commits].sort((a, b) => (a.side === b.side ? a.seq - b.seq : a.side === 'sell' ? -1 : 1));
    deck.innerHTML = order.map((c) => cardHtml(r, c, reveals[c.account], filled, me)).join('');
    const cards = [...deck.children];

    // 1. deal sealed cards
    step.textContent = 'Sealed offers';
    say('deal');
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
    say('reveal');
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
    say('clear');
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
    await wait(t(750));
    if (!auto && !skipping) {
      // Stop on the result: dock the stamp so every card can be read, explain it, wait for Next.
      el.classList.add('paused');
      stamp.classList.add('docked');
      step.textContent = '';
      explainEl.innerHTML = explainHtml(r, lang, explain);
      explainEl.hidden = false;
      nextBtn.textContent = i === day.rounds.length - 1 ? T.done : T.next;
      nextBtn.hidden = false;
      nextBtn.focus({ preventScroll: true });
      await new Promise((res) => (resume = res));
      nextBtn.hidden = true;
      explainEl.hidden = true;
      el.classList.remove('paused');
    } else {
      await wait(t(400));
    }
    deck.classList.remove('judged');
  }
  resume = null;
  if (manual) {
    try { auto = localStorage.getItem('haat-auto') !== '0'; } catch { auto = saved; }
    syncAuto();
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

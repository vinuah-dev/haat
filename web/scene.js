// The market square: stalls, villagers, sky and weather.
// Two layouts: a wide street on PC, a two-row square on phones. Everything is plain SVG.

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
};

export const GOOD_COLOR = { grain: '#d9a83a', bread: '#c4753a', tools: '#6b7f94', cloth: '#9a5aa0' };
export const GOOD_ICON = { grain: '🌾', bread: '🍞', tools: '🔨', cloth: '🧵' };
const ROLE_COLOR = { household: '#e07a5f', miller: '#d9a83a', workshop: '#5d7b96', farmhand: '#6a994e' };
const AWNING = ['#c0392b', '#2e86ab', '#6a994e', '#8e44ad', '#d35400', '#c9a227'];
const SKY = { night: '#1d2440', dawn: '#f2a07b', day: '#9fd3e8', dusk: '#e8875b' };

const LAYOUTS = {
  desktop: {
    W: 1000, H: 270, ground: 196, scale: 1,
    stall: (i, n) => ({ x: 70 + i * (860 / Math.max(1, n - 1)) - 60, y: 92 }),
    zones: { grain: 180, bread: 395, tools: 610, cloth: 825 },
    plaza: [214, 258], sun: { dawn: [90, 190], day: [500, 46], dusk: [910, 190], night: [500, 340] },
  },
  mobile: {
    W: 400, H: 340, ground: 230, scale: 0.72,
    stall: (i) => ({ x: 22 + (i % 3) * 128, y: i < 3 ? 34 : 128 }),
    zones: { grain: 58, bread: 158, tools: 252, cloth: 344 },
    plaza: [262, 330], sun: { dawn: [40, 120], day: [200, 26], dusk: [360, 120], night: [200, 400] },
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Scene {
  constructor(host, layout = 'desktop') {
    this.host = host;
    this.folk = new Map();
    this.stalls = new Map();
    this.timers = [];
    this.build(layout);
  }

  build(layout) {
    this.layout = layout;
    const L = (this.L = LAYOUTS[layout]);
    this.host.innerHTML = '';
    this.folk.clear();
    this.stalls.clear();
    // Fill the full width; on very wide screens the top of the sky is cropped, never the stalls.
    const svg = (this.svg = el('svg', { viewBox: `0 0 ${L.W} ${L.H}`, preserveAspectRatio: 'xMidYMax slice', class: `scene-svg ${layout}`, role: 'img', 'aria-label': 'The market square' }, this.host));

    this.sky = el('rect', { x: 0, y: 0, width: L.W, height: L.H, class: 'sky' }, svg);
    const stars = el('g', { class: 'stars' }, svg);
    for (let i = 0; i < 24; i++) el('circle', { cx: (i * 137) % L.W, cy: 10 + ((i * 53) % (L.ground - 60)), r: i % 3 ? 1.2 : 1.8, fill: '#fff' }, stars);
    this.sun = el('g', { class: 'sun' }, svg);
    el('circle', { r: 30, fill: '#ffe08a', opacity: 0.35 }, this.sun);
    el('circle', { r: 20, fill: '#ffd04d' }, this.sun);
    const clouds = el('g', { class: 'clouds' }, svg);
    for (const [x, y, s] of [[0.15, 40, 1], [0.55, 26, 0.8], [0.85, 58, 1.1]]) {
      const c = el('g', { class: 'cloud', transform: `translate(${x * L.W} ${y}) scale(${s})` }, clouds);
      el('ellipse', { cx: 0, cy: 0, rx: 34, ry: 12, fill: '#fff', opacity: 0.85 }, c);
      el('ellipse', { cx: 16, cy: -8, rx: 18, ry: 12, fill: '#fff', opacity: 0.85 }, c);
    }
    el('path', { d: `M0 ${L.ground - 40} Q ${L.W * 0.25} ${L.ground - 90} ${L.W * 0.5} ${L.ground - 45} T ${L.W} ${L.ground - 55} V ${L.ground} H 0 Z`, fill: '#8cbf73', class: 'hill' }, svg);
    el('path', { d: `M0 ${L.ground - 18} Q ${L.W * 0.35} ${L.ground - 55} ${L.W * 0.7} ${L.ground - 22} T ${L.W} ${L.ground - 28} V ${L.ground} H 0 Z`, fill: '#6fa75c', class: 'hill' }, svg);

    el('rect', { x: 0, y: L.ground, width: L.W, height: L.H - L.ground, fill: '#ead6a6', class: 'ground' }, svg);
    for (let i = 0; i < L.W / 40; i++) el('rect', { x: i * 40 + (i % 2) * 14, y: L.ground + 14 + (i % 3) * 18, width: 18, height: 4, rx: 2, fill: '#d9c08a' }, svg);

    // weather and events
    const cracks = el('g', { class: 'deco drought' }, svg);
    for (let i = 0; i < 7; i++) el('path', { d: `M${60 + i * (L.W / 7)} ${L.ground + 30} l10 8 l-6 10 l12 6`, stroke: '#b98d4a', 'stroke-width': 2, fill: 'none' }, cracks);
    const bunting = el('g', { class: 'deco festival' }, svg);
    const by = layout === 'mobile' ? 20 : 78;
    el('path', { d: `M0 ${by} Q ${L.W / 2} ${by + 22} ${L.W} ${by}`, stroke: '#6b4a2b', 'stroke-width': 1.5, fill: 'none' }, bunting);
    for (let i = 0; i < L.W / 30; i++) {
      const x = i * 30 + 10;
      const t = x / L.W;
      const y = by + 4 * t * (1 - t) * 22;
      el('path', { d: `M${x} ${y} l12 0 l-6 13 z`, fill: AWNING[i % AWNING.length], class: 'flag', style: `animation-delay:${(i % 5) * 0.15}s` }, bunting);
    }
    const road = el('g', { class: 'deco new-road' }, svg);
    el('rect', { x: 0, y: L.H - 16, width: L.W, height: 16, fill: '#8c8c8c' }, road);
    el('line', { x1: 0, x2: L.W, y1: L.H - 8, y2: L.H - 8, stroke: '#f5f5f5', 'stroke-width': 2, 'stroke-dasharray': '14 10' }, road);
    const cart = el('g', { class: 'cart' }, road);
    el('rect', { x: 0, y: -14, width: 28, height: 10, rx: 2, fill: '#a0703c' }, cart);
    el('circle', { cx: 6, cy: -3, r: 4, fill: '#333' }, cart);
    el('circle', { cx: 22, cy: -3, r: 4, fill: '#333' }, cart);
    cart.style.setProperty('--y', `${L.H - 6}px`);
    cart.style.setProperty('--w', `${L.W + 40}px`);

    this.stallLayer = el('g', {}, svg);
    this.zoneLayer = el('g', { class: 'zones' }, svg);
    this.folkLayer = el('g', {}, svg);
    this.fxLayer = el('g', {}, svg);
    this.setTime('day');
  }

  setLayout(layout) {
    if (layout === this.layout) return;
    const sellers = this.lastSellers;
    const buyers = this.lastBuyers;
    const events = this.lastEvents;
    this.build(layout);
    if (sellers) this.setSellers(sellers.order, sellers.list, sellers.playerMode);
    if (buyers) this.setBuyers(buyers);
    if (events) this.setEvents(events);
  }

  setTime(phase) {
    this.sky.style.fill = SKY[phase];
    this.svg.classList.toggle('night', phase === 'night');
    const [x, y] = this.L.sun[phase];
    this.sun.style.transform = `translate(${x}px, ${y}px)`;
  }

  setEvents(names) {
    this.lastEvents = names;
    for (const n of ['drought', 'festival', 'new-road']) this.svg.classList.toggle(`ev-${n}`, names.includes(n));
  }

  // ---------- stalls ----------

  setSellers(order, list, playerMode) {
    this.lastSellers = { order, list, playerMode };
    const byId = Object.fromEntries(list.map((s) => [s.account, s]));
    const key = order.join('|') + playerMode;
    if (this.stallKey !== key) {
      this.stallKey = key;
      this.stallLayer.innerHTML = '';
      this.stalls.clear();
      order.forEach((acc, i) => this.drawStall(acc, byId[acc], i, order.length, playerMode));
    }
    for (const acc of order) this.updateStall(acc, byId[acc], playerMode);
  }

  drawStall(acc, s, i, n, playerMode) {
    const L = this.L;
    const { x, y } = L.stall(i, n);
    const g = el('g', { class: 'stall', transform: `translate(${x} ${y}) scale(${L.scale})` }, this.stallLayer);
    const color = AWNING[i % AWNING.length];
    el('rect', { x: 6, y: 30, width: 6, height: 80, fill: '#6b4a2b' }, g);
    el('rect', { x: 108, y: 30, width: 6, height: 80, fill: '#6b4a2b' }, g);
    el('rect', { x: -4, y: 2, width: 128, height: 10, rx: 3, fill: '#5a3a20' }, g);
    for (let k = 0; k < 6; k++) {
      const fill = k % 2 ? '#fff6e6' : color;
      el('rect', { x: k * 20, y: 10, width: 20, height: 24, fill }, g);
      el('circle', { cx: k * 20 + 10, cy: 34, r: 10, fill }, g);
    }
    el('rect', { x: 0, y: 78, width: 120, height: 32, rx: 3, fill: '#a0703c' }, g);
    el('rect', { x: 0, y: 92, width: 120, height: 3, fill: '#8a5e30' }, g);
    const crates = el('g', { transform: 'translate(8 54)' }, g);
    const signG = el('g', { transform: 'translate(60 -12)' }, g);
    el('rect', { x: -44, y: -12, width: 88, height: 22, rx: 5, fill: '#fff6e6', stroke: '#6b4a2b', 'stroke-width': 2 }, signG);
    const isMe = s.isPlayer && playerMode;
    const name = el('text', { x: 0, y: 4, 'text-anchor': 'middle', class: 'stall-name' }, signG);
    name.textContent = isMe ? 'You' : s.name;
    const coins = el('text', { x: 60, y: 130, 'text-anchor': 'middle', class: 'stall-coins' }, g);
    if (isMe) {
      g.classList.add('me');
      const flag = el('g', { transform: 'translate(114 -30)' }, g);
      el('rect', { x: 0, y: 0, width: 3, height: 40, fill: '#5a3a20' }, flag);
      el('path', { d: 'M3 2 h26 l-6 8 l6 8 h-26 z', fill: '#ffcc33', class: 'flag' }, flag);
    }
    const seller = { g, crates, coins, cx: x + 60 * L.scale, cy: y + 112 * L.scale };
    this.stalls.set(acc, seller);
  }

  updateStall(acc, s) {
    const st = this.stalls.get(acc);
    if (!st || !s) return;
    st.coins.textContent = `● ${s.coins}`;
    st.crates.innerHTML = '';
    // Crates on the counter, two high, one colour per good; a new good starts a new column.
    let slot = 0;
    for (const g of ['grain', 'bread', 'tools', 'cloth']) {
      const n = Math.min(s.stock[g], 6);
      for (let k = 0; k < n && slot < 16; k++, slot++) {
        el('rect', { x: Math.floor(slot / 2) * 13, y: slot % 2 ? 1 : 12, width: 11, height: 10, rx: 1.5, fill: GOOD_COLOR[g], stroke: 'rgba(0,0,0,.25)' }, st.crates);
      }
      if (slot % 2) slot++;
    }
  }

  // ---------- villagers ----------

  home(i) {
    const L = this.L;
    const [y0, y1] = L.plaza;
    return { x: 20 + ((i * 97) % (L.W - 40)), y: y0 + ((i * 31) % (y1 - y0)) };
  }

  setBuyers(buyers) {
    this.lastBuyers = buyers;
    if (this.folk.size === buyers.length) return;
    this.folkLayer.innerHTML = '';
    this.folk.clear();
    buyers.forEach((b, i) => {
      const g = el('g', { class: 'folk' }, this.folkLayer);
      const bob = el('g', { class: 'bob', style: `animation-delay:${(i % 7) * 0.09}s` }, g);
      const s = this.layout === 'mobile' ? 0.9 : 1;
      const body = el('g', { transform: `scale(${s})` }, bob);
      el('ellipse', { cx: 0, cy: 2, rx: 8, ry: 3, fill: 'rgba(0,0,0,.15)' }, body);
      el('path', { d: 'M-7 0 Q-7 -16 0 -16 Q7 -16 7 0 Z', fill: ROLE_COLOR[b.role] }, body);
      el('circle', { cx: 0, cy: -21, r: 6.5, fill: '#f2c9a0' }, body);
      el('circle', { cx: -2.2, cy: -21.5, r: 0.9, fill: '#3a2a1a' }, body);
      el('circle', { cx: 2.2, cy: -21.5, r: 0.9, fill: '#3a2a1a' }, body);
      el('title', {}, g).textContent = b.name;
      const f = { g, i, busy: false, ...this.home(i) };
      this.place(f, f.x, f.y, 0);
      this.folk.set(b.account, f);
    });
    this.startWander();
  }

  place(f, x, y, ms) {
    f.x = x;
    f.y = y;
    f.g.style.transition = ms ? `transform ${ms}ms ease-in-out` : 'none';
    f.g.style.transform = `translate(${x}px, ${y}px)`;
    if (ms) {
      f.g.classList.add('walking');
      clearTimeout(f.walkT);
      f.walkT = setTimeout(() => f.g.classList.remove('walking'), ms);
    }
  }

  startWander() {
    this.timers.forEach(clearInterval);
    this.timers = [
      setInterval(() => {
        if (document.hidden || this.holding) return;
        for (const f of this.folk.values()) {
          if (f.busy || Math.random() > 0.35) continue;
          const [y0, y1] = this.L.plaza;
          const x = Math.max(14, Math.min(this.L.W - 14, f.x + (Math.random() - 0.5) * 60));
          const y = Math.max(y0, Math.min(y1, f.y + (Math.random() - 0.5) * 16));
          this.place(f, x, y, 1400);
        }
      }, 1700),
    ];
  }

  /** Morning: swarm members gather under their good's banner. */
  gather(swarms) {
    this.zoneLayer.innerHTML = '';
    const L = this.L;
    const inSwarm = new Set();
    for (const s of swarms) {
      const zx = L.zones[s.good];
      const label = el('g', { class: 'zone', transform: `translate(${zx} ${L.plaza[0] - 10})` }, this.zoneLayer);
      el('rect', { x: -34, y: -13, width: 68, height: 20, rx: 10, fill: GOOD_COLOR[s.good] }, label);
      const t = el('text', { x: 0, y: 2, 'text-anchor': 'middle', class: 'zone-text' }, label);
      t.textContent = `${GOOD_ICON[s.good]} ×${s.totalDemand}`;
      s.members.forEach((acc, k) => {
        const f = this.folk.get(acc);
        if (!f) return;
        inSwarm.add(acc);
        f.busy = true;
        const cols = 4;
        const spread = this.layout === 'mobile' ? 14 : 18;
        this.place(f, zx + ((k % cols) - (cols - 1) / 2) * spread, L.plaza[0] + 12 + Math.floor(k / cols) * 14, 1100 + k * 60);
      });
    }
    for (const [acc, f] of this.folk) {
      f.g.classList.toggle('idle', !inSwarm.has(acc));
      if (!inSwarm.has(acc)) f.busy = false;
    }
  }

  release() {
    this.zoneLayer.innerHTML = '';
    for (const f of this.folk.values()) {
      f.busy = false;
      f.g.classList.remove('idle');
      const h = this.home(f.i);
      this.place(f, h.x, h.y, 1300);
    }
  }

  /** Buyers walk to the stalls they bought from; coins fly to the counter. */
  async settle(day, { speed = 1, sfx } = {}) {
    const t = (ms) => ms / speed;
    this.holding = true;
    for (const r of day.rounds) {
      if (!r.payments.length) continue;
      const walkers = new Map();
      for (const p of r.payments) {
        const f = this.folk.get(p.from);
        const st = this.stalls.get(p.to);
        if (!f || !st) continue;
        if (!walkers.has(p.from)) {
          walkers.set(p.from, true);
          f.busy = true;
          this.place(f, st.cx + (Math.random() - 0.5) * 40 * this.L.scale, st.cy + 8, t(700));
        }
      }
      await sleep(t(720));
      for (const p of r.payments) {
        const f = this.folk.get(p.from);
        const st = this.stalls.get(p.to);
        if (!f || !st) continue;
        this.coins(f.x, f.y - 20, st.cx, st.cy - 30 * this.L.scale, Math.min(5, 1 + Math.floor(p.amount / 10)), t);
      }
      sfx?.coin();
      if (navigator.vibrate && this.layout === 'mobile') navigator.vibrate(18);
      await sleep(t(650));
    }
    this.holding = false;
    this.release();
  }

  coins(x1, y1, x2, y2, n, t) {
    for (let k = 0; k < n; k++) {
      const c = el('g', {}, this.fxLayer);
      el('circle', { r: 5, fill: '#f6c945', stroke: '#b8860b', 'stroke-width': 1.5 }, c);
      el('circle', { r: 2, fill: '#fff3b0' }, c);
      const mx = (x1 + x2) / 2;
      const my = Math.min(y1, y2) - 50;
      const a = c.animate(
        [
          { transform: `translate(${x1}px, ${y1}px) scale(.6)`, opacity: 0 },
          { transform: `translate(${mx}px, ${my}px) scale(1.2)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${x2}px, ${y2}px) scale(.8)`, opacity: 1 },
        ],
        { duration: t(620), delay: t(k * 70), easing: 'ease-in-out', fill: 'forwards' },
      );
      a.onfinish = () => c.remove();
    }
  }
}

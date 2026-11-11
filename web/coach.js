// Coach marks: a spotlight on one part of the screen and a speech bubble that explains it.
// A step can wait for the player to do something (`require`) or for the game to reach a point (`waitFor`).

const LANG_KEY = 'haat-lang';

function defaultLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved) return saved;
  } catch {}
  return /-IN$|^hi/i.test(navigator.language || '') ? 'hi' : 'en';
}

const UI = {
  en: { next: 'Next', skip: 'Skip tutorial', step: 'Step', lang: 'हिंglish', doIt: 'Do this to continue', },
  hi: { next: 'Aage', skip: 'Tutorial chhodo', step: 'Step', lang: 'English', doIt: 'Aage badhne ke liye ye karo', },
};

export class Coach {
  constructor() {
    this.lang = defaultLang();
    this.steps = [];
    this.i = -1;
    this.ctx = null;
    this.waiters = [];
    this.spot = document.createElement('div');
    this.spot.className = 'coach-spot';
    this.spot.hidden = true;
    this.bubble = document.createElement('div');
    this.bubble.className = 'coach-bubble';
    this.bubble.hidden = true;
    this.bubble.setAttribute('role', 'dialog');
    this.bubble.setAttribute('aria-live', 'polite');
    document.body.append(this.spot, this.bubble);
    this.bubble.addEventListener('click', (e) => {
      const a = e.target.closest('[data-coach]')?.dataset.coach;
      if (a === 'next') this.next();
      else if (a === 'skip') this.finish(true);
      else if (a === 'lang') this.toggleLang();
    });
    addEventListener('resize', () => this.place());
    addEventListener('scroll', () => this.place(), { passive: true });
  }

  get active() {
    return this.i >= 0 && this.i < this.steps.length;
  }
  get step() {
    return this.active ? this.steps[this.i] : null;
  }
  t(obj) {
    if (!obj) return '';
    const v = typeof obj === 'function' ? obj(this.ctx) : obj;
    return typeof v === 'string' ? v : (v[this.lang] ?? v.en);
  }

  start(steps, ctx) {
    this.steps = steps;
    this.ctx = ctx;
    this.i = 0;
    this.enter();
  }

  /** The game reached a point (sealed, dayDone, morning). Resolves when the coach next needs the game to move. */
  emit(name) {
    const s = this.step;
    if (s && s.waitFor === name) this.next();
    return this.untilGame();
  }

  untilGame() {
    if (!this.active || this.step.waitFor) return Promise.resolve();
    return new Promise((r) => this.waiters.push(r));
  }

  release() {
    const w = this.waiters;
    this.waiters = [];
    w.forEach((r) => r());
  }

  allows(name) {
    const s = this.step;
    return s && s.waitFor === name && (!s.require || s.require(this.ctx));
  }

  next() {
    if (!this.active) return;
    this.i++;
    if (this.i >= this.steps.length) return this.finish(false);
    this.enter();
  }

  enter() {
    const s = this.step;
    s.onEnter?.(this.ctx);
    if (s.tab && this.ctx.layout() === 'mobile') this.ctx.setTab(s.tab);
    if (s.waitFor && s.hidden) {
      this.hide();
      this.release();
      return;
    }
    if (s.waitFor) this.release();
    this.draw(true);
  }

  hide() {
    this.spot.hidden = true;
    this.bubble.hidden = true;
  }

  /** Close without calling onFinish, e.g. when the player starts another game. */
  stop() {
    this.i = -1;
    this.hide();
    this.release();
  }

  finish(skipped) {
    const done = this.ctx?.onFinish;
    this.i = -1;
    this.hide();
    this.release();
    done?.(skipped);
  }

  toggleLang() {
    this.lang = this.lang === 'en' ? 'hi' : 'en';
    try { localStorage.setItem(LANG_KEY, this.lang); } catch {}
    this.ctx?.onLang?.(this.lang);
    this.draw(false);
  }

  /** Called by the game after every render: re-check the step's task and follow the target. */
  refresh() {
    const s = this.step;
    if (!s || (s.waitFor && s.hidden)) return;
    if (s.require && s.auto && s.require(this.ctx)) {
      clearTimeout(this.autoT);
      this.autoT = setTimeout(() => this.step === s && s.require(this.ctx) && this.next(), 450);
    }
    this.draw(false);
  }

  target() {
    const s = this.step;
    if (!s?.target) return null;
    const sel = typeof s.target === 'function' ? s.target(this.ctx) : s.target;
    return sel ? document.querySelector(sel) : null;
  }

  draw(scroll) {
    const s = this.step;
    if (!s) return;
    const ui = UI[this.lang];
    const done = !s.require || s.require(this.ctx);
    const visible = this.steps.filter((x) => !x.hidden);
    const n = visible.indexOf(s) + 1;
    const showNext = !s.waitFor && !s.final && !(s.require && s.auto);
    this.bubble.innerHTML = `
      <div class="coach-top"><span class="coach-count">${ui.step} ${n}/${visible.length}</span>
        <button type="button" class="coach-lang" data-coach="lang">${ui.lang}</button></div>
      ${s.title ? `<h3>${this.t(s.title)}</h3>` : ''}
      <p>${this.t(s.text)}</p>
      ${s.require && !done ? `<p class="coach-todo">👉 ${this.t(s.hint) || ui.doIt}</p>` : ''}
      <div class="coach-actions">
        ${s.final ? '' : `<button type="button" class="coach-skip" data-coach="skip">${ui.skip}</button>`}
        ${showNext ? `<button type="button" class="btn" data-coach="next" ${done ? '' : 'disabled'}>${ui.next} →</button>` : ''}
        ${s.final ? `<button type="button" class="btn big" data-coach="next">${this.t(s.button)}</button>` : ''}
      </div>`;
    this.bubble.classList.toggle('waiting', Boolean(s.waitFor) || Boolean(s.require && s.auto));
    this.bubble.hidden = false;
    const el = this.target();
    if (el && scroll) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => this.place(), 380);
    }
    if (scroll) {
      this.bubble.classList.remove('pop');
      void this.bubble.offsetWidth;
      this.bubble.classList.add('pop');
    }
    this.place();
  }

  place() {
    if (!this.step || this.bubble.hidden) return;
    const el = this.target();
    const mobile = this.ctx.layout() === 'mobile';
    const b = this.bubble;
    const bh = b.offsetHeight;
    const bw = b.offsetWidth;
    if (!el) {
      this.spot.hidden = false;
      this.spot.classList.add('full');
      Object.assign(this.spot.style, { top: '50%', left: '50%', width: '0px', height: '0px' });
      Object.assign(b.style, { top: `${Math.max(16, (innerHeight - bh) / 2)}px`, left: `${(innerWidth - bw) / 2}px` });
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 8;
    this.spot.hidden = false;
    this.spot.classList.remove('full');
    Object.assign(this.spot.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    let top;
    if (mobile) {
      // Phones: dock the bubble to whichever end of the screen the target is not in.
      const bottomSafe = 84;
      top = r.top + r.height / 2 > innerHeight / 2 ? 12 : innerHeight - bh - bottomSafe;
      Object.assign(b.style, { top: `${Math.max(8, top)}px`, left: `${(innerWidth - bw) / 2}px` });
      return;
    }
    top = r.bottom + 14 + bh < innerHeight ? r.bottom + 14 : r.top - bh - 14;
    if (top < 8) top = Math.min(innerHeight - bh - 8, r.bottom + 14);
    const left = Math.min(innerWidth - bw - 12, Math.max(12, r.left + r.width / 2 - bw / 2));
    Object.assign(b.style, { top: `${top}px`, left: `${left}px` });
  }
}

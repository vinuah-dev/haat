// Tiny synthesized sounds, no audio files. Starts muted until the first click (browser rule).

let ctx = null;
let muted = false;
try { muted = localStorage.getItem('haat-muted') === '1'; } catch {}

function tone(freq, dur, { type = 'triangle', vol = 0.05, when = 0, slide = 0 } = {}) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {}
}

export const sfx = {
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('haat-muted', muted ? '1' : '0'); } catch {}
    if (!muted) this.coin();
    return muted;
  },
  click() { tone(660, 0.05, { vol: 0.03 }); },
  deal() { tone(880 + Math.random() * 200, 0.04, { type: 'square', vol: 0.018 }); },
  flip() { tone(420, 0.07, { type: 'triangle', vol: 0.04, slide: 760 }); },
  stamp() { tone(150, 0.22, { type: 'sawtooth', vol: 0.07, slide: 55 }); tone(90, 0.25, { type: 'sine', vol: 0.09 }); },
  nodeal() { tone(300, 0.25, { type: 'triangle', vol: 0.05, slide: 150 }); },
  coin() { tone(1318, 0.08, { type: 'square', vol: 0.025 }); tone(1760, 0.12, { type: 'square', vol: 0.025, when: 0.07 }); },
  seal() { tone(240, 0.12, { type: 'triangle', vol: 0.05, slide: 480 }); },
  rooster() { tone(700, 0.12, { vol: 0.04, slide: 1100 }); tone(1000, 0.25, { vol: 0.04, when: 0.12, slide: 650 }); },
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { vol: 0.05, when: i * 0.12 })); },
  sad() { [392, 349, 311].forEach((f, i) => tone(f, 0.28, { vol: 0.04, when: i * 0.18 })); },
};

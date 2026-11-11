// Small game-feel effects: toasts, number count-ups, confetti, coin pops.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function toast(html, ms = 2600) {
  let host = document.querySelector('.toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = html;
  host.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 400);
  }, ms);
}

export function countUp(node, from, to, ms = 700) {
  if (!node || from === to || reducedMotion()) {
    if (node) node.textContent = to;
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / ms);
    node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  const parent = node.closest('.stat');
  if (parent) {
    parent.classList.remove('up', 'down');
    void parent.offsetWidth;
    parent.classList.add(to > from ? 'up' : 'down');
  }
}

export function confetti(n = 90) {
  if (reducedMotion()) return;
  const colors = ['#f6c945', '#e07a5f', '#6a994e', '#2e86ab', '#9a5aa0', '#c4753a'];
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 200}px`);
    p.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    p.style.animationDuration = `${2.2 + Math.random() * 1.4}s`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4500);
}

/** "+24" floating up from a node. */
export function floatText(anchor, text, good = true) {
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = `float-text ${good ? 'good' : 'bad'}`;
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1300);
}

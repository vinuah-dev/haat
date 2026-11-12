// Static build for hosting without a server (Vercel): the engine is bundled into the page.
//   npm run build   ->   dist/
import { build } from 'esbuild';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
cpSync('web', 'dist', { recursive: true });

await build({
  entryPoints: ['web-src/local.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  outfile: 'dist/engine.js',
  logLevel: 'info',
});

// Load the engine before the game so app.js finds window.HaatLocal.
const html = readFileSync('dist/index.html', 'utf8');
const tag = '<script src="app.js" type="module"></script>';
if (!html.includes(tag)) throw new Error('index.html no longer loads app.js as expected');
writeFileSync('dist/index.html', html.replace(tag, `<script src="engine.js"></script>\n  ${tag}`));
console.log('Built dist/ (static, engine runs in the browser)');

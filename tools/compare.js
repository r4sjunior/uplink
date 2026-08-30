/* =========================================================
   compare.js — monta uma prancha de comparação lado a lado.

   Coloca uma captura NOSSA ao lado de uma captura do UPLINK
   ORIGINAL, na mesma altura, com rótulos neutros (A / B) para
   que o agente crítico julgue sem saber de antemão qual é qual
   quando quisermos um teste cego.

   uso:
     node tools/compare.js --ours tools/shots/ui-desktop.png \
                           --ref assets/ref/uplink-real-04.jpg \
                           --out tools/shots/cmp-desktop.png \
                           --title "Área de trabalho"
     node tools/compare.js --blind ...      # embaralha A/B e grava a chave
     node tools/compare.js --grid           # prancha com todos os pares de compare.json
   ========================================================= */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}

function dataUri(file) {
  const abs = path.resolve(ROOT, file);
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,` + fs.readFileSync(abs).toString('base64');
}

const PAGE = (panes, title, note) => `<!doctype html><meta charset="utf-8">
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box;margin:0}
  body{background:#0b0d10;color:#d7dde5;font:14px/1.45 -apple-system,"Segoe UI",Roboto,sans-serif;padding:28px 28px 34px}
  h1{font-size:19px;font-weight:600;letter-spacing:.01em;margin-bottom:4px}
  .note{font-size:12.5px;color:#7c8794;margin-bottom:20px}
  .row{display:grid;grid-template-columns:repeat(${panes.length},1fr);gap:22px;align-items:start}
  figure{background:#000;border:1px solid #232830;border-radius:7px;overflow:hidden}
  figcaption{display:flex;justify-content:space-between;align-items:baseline;gap:10px;
    padding:9px 13px;background:#151a21;border-bottom:1px solid #232830;font-size:12px}
  .tag{font-weight:700;letter-spacing:.14em;color:#e8edf3}
  .dim{color:#6f7987;font-size:11px;font-variant-numeric:tabular-nums}
  img{display:block;width:100%;height:auto;background:#000}
</style>
<h1>${title}</h1>
<div class="note">${note}</div>
<div class="row">
${panes.map(p => `  <figure>
    <figcaption><span class="tag">${p.tag}</span><span class="dim">${p.dim}</span></figcaption>
    <img src="${p.src}">
  </figure>`).join('\n')}
</div>`;

async function main() {
  const ours = String(arg('ours', ''));
  const ref = String(arg('ref', ''));
  const out = path.resolve(ROOT, String(arg('out', 'tools/shots/compare.png')));
  const title = String(arg('title', 'Comparação lado a lado'));
  const blind = !!arg('blind', false);
  const width = Number(arg('w', 2200));

  if (!ours || !ref) { console.error('faltam --ours e --ref'); process.exit(1); }
  for (const f of [ours, ref]) {
    if (!fs.existsSync(path.resolve(ROOT, f))) { console.error('não existe: ' + f); process.exit(1); }
  }

  let panes = [
    { tag: 'A', src: dataUri(ours), dim: path.basename(ours), _is: 'nosso' },
    { tag: 'B', src: dataUri(ref), dim: path.basename(ref), _is: 'original' }
  ];
  if (blind && Math.random() < 0.5) { panes = [panes[1], panes[0]]; panes[0].tag = 'A'; panes[1].tag = 'B'; }
  if (blind) panes.forEach(p => { p.dim = ''; });

  const note = blind
    ? 'Teste cego: um dos painéis é o Uplink original de 2001, o outro é a nossa reconstrução. Julgue apenas pela imagem.'
    : 'A = nossa reconstrução em Three.js &nbsp;·&nbsp; B = Uplink: Hacker Elite (Introversion, 2001)';

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars'] });
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await page.setContent(PAGE(panes, title, note), { waitUntil: 'load' });
  await page.evaluate(() => Promise.all(Array.from(document.images).map(i => i.decode().catch(() => {}))));
  const h = await page.evaluate(() => Math.ceil(document.body.scrollHeight) + 8);
  await page.setViewport({ width, height: h, deviceScaleFactor: 1 });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  await browser.close();

  if (blind) {
    const key = path.join(path.dirname(out), path.basename(out, '.png') + '.chave.txt');
    fs.writeFileSync(key, panes.map(p => `${p.tag} = ${p._is}`).join('\n') + '\n');
    console.log('chave do teste cego: ' + path.relative(ROOT, key));
  }
  console.log('prancha: ' + path.relative(ROOT, out));
}

main().catch(e => { console.error(e); process.exit(1); });

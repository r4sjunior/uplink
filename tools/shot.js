/* =========================================================
   shot.js - harness de captura para os agentes de QA visual.
   Sobe o servidor, abre a página com WebGL real (headless=new
   + swiftshader/ANGLE), roda um cenário e salva PNG + log.

   uso:
     node tools/shot.js                          # captura padrão
     node tools/shot.js --scenario desktop       # tools/scenarios/desktop.js
     node tools/shot.js --out shots/x.png --w 2560 --h 1440 --dpr 2
     node tools/shot.js --all                    # roda todos os cenários
   ========================================================= */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tools', 'shots');
const SCEN = path.join(ROOT, 'tools', 'scenarios');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}

const PORT = Number(arg('port', 8123));
const W = Number(arg('w', 1920));
const H = Number(arg('h', 1080));
const DPR = Number(arg('dpr', 1));
const WAIT = Number(arg('wait', 0));
const ALL = !!arg('all', false);

fs.mkdirSync(SHOTS, { recursive: true });

function startServer() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.js'), String(PORT)], {
      stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT
    });
    let done = false;
    p.stdout.on('data', d => { if (!done && String(d).includes('http://')) { done = true; resolve(p); } });
    p.stderr.on('data', d => process.stderr.write('[serve] ' + d));
    p.on('error', reject);
    setTimeout(() => { if (!done) { done = true; resolve(p); } }, 2500);
  });
}

async function run() {
  const server = await startServer();
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-webgl', '--ignore-gpu-blocklist',
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
      '--force-color-profile=srgb',
      '--hide-scrollbars',
      `--window-size=${W},${H}`
    ]
  });

  const names = ALL
    ? fs.readdirSync(SCEN).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''))
    : [String(arg('scenario', 'default'))];

  const report = [];

  for (const name of names) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: DPR });
    const logs = [];
    page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
    page.on('requestfailed', r => logs.push(`[404/fail] ${r.url()} :: ${r.failure()?.errorText}`));

    let scenario = null;
    const file = path.join(SCEN, name + '.js');
    if (fs.existsSync(file)) scenario = (await import(pathToFileURL(file).href)).default;

    const url = `http://localhost:${PORT}/` + String(arg('page', 'index.html'));
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => logs.push('[goto] ' + e.message));

    // o jogo sinaliza prontidão em window.__UPLINK_READY
    await page.waitForFunction('window.__UPLINK_READY === true', { timeout: 45000 })
      .catch(() => logs.push('[warn] window.__UPLINK_READY nunca ficou true (timeout 45s)'));

    const ctx = {
      shot: async (tag) => {
        const out = path.join(SHOTS, `${name}${tag ? '-' + tag : ''}.png`);
        await page.screenshot({ path: out });
        report.push(out);
        return out;
      },
      wait: (ms) => new Promise(r => setTimeout(r, ms)),
      page
    };

    if (WAIT) await ctx.wait(WAIT);

    if (scenario) {
      try { await scenario(page, ctx); } catch (e) { logs.push('[scenario] ' + e.message + '\n' + e.stack); }
    }
    // sempre garante ao menos um frame salvo
    if (!report.some(r => r.includes(path.sep + name))) await ctx.shot('');

    // métricas de render, se o jogo expuser
    const stats = await page.evaluate(() => window.__UPLINK_STATS ? window.__UPLINK_STATS() : null).catch(() => null);

    const logFile = path.join(SHOTS, name + '.log.txt');
    fs.writeFileSync(logFile,
      `# cenário: ${name}\n# viewport: ${W}x${H} @${DPR}x\n# ${new Date().toISOString()}\n\n` +
      (stats ? '## stats\n' + JSON.stringify(stats, null, 2) + '\n\n' : '') +
      '## console\n' + (logs.length ? logs.join('\n') : '(vazio — nenhum erro)') + '\n');

    console.log(`\n=== ${name} ===`);
    if (stats) console.log('stats:', JSON.stringify(stats));
    const bad = logs.filter(l => /pageerror|\[error\]|404\/fail|warn/.test(l));
    if (bad.length) { console.log('PROBLEMAS:'); bad.slice(0, 40).forEach(l => console.log('  ' + l)); }
    else console.log('console limpo.');
    await page.close();
  }

  console.log('\nPNGs:'); report.forEach(r => console.log('  ' + path.relative(ROOT, r)));
  await browser.close();
  server.kill();
}

run().catch(e => { console.error(e); process.exit(1); });

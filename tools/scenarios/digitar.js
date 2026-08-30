/* Mede a latência de digitação: quantos quadros e quantos ms entre a
   tecla e o caractere aparecer no estado do campo. */
async function quadros(page, n) {
  await page.evaluate((k) => new Promise(res => {
    let i = 0; const f = () => { if (++i > k) res(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), n);
}
export default async function (page, ctx) {
  await quadros(page, 3);
  await page.evaluate(() => {
    window.__UPLINK.Shell._boot.skip();
    window.__UPLINK.Game.newGame('lat');
  });
  await quadros(page, 14);

  await page.evaluate(async () => {
    const m = await import('/src/ui/windows.js');
    m.Windows.closeAll();
    const a = await import('/src/ui/apps/index.js');
    a.Apps.open('links');
  });
  await quadros(page, 10);

  /* foca o campo de busca */
  const p = await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    return t.UI.centerOf('links:busca');
  });
  if (!p) { console.log('LATENCIA sem campo'); return; }
  await page.mouse.move(p.x, p.y);
  await quadros(page, 2);
  await page.mouse.down(); await quadros(page, 1); await page.mouse.up();
  await quadros(page, 4);

  /* instrumenta: marca o tempo de cada keydown e de cada desenho */
  await page.evaluate(() => {
    window.__LAT = { teclas: [], desenhos: [] };
    window.addEventListener('keydown', e => {
      window.__LAT.teclas.push({ k: e.key, t: performance.now() });
    }, true);
    const S = window.__UPLINK.Shell;
    const orig = S.draw.bind(S);
    S.draw = function (surf, dt) {
      const t0 = performance.now();
      orig(surf, dt);
      const t1 = performance.now();
      window.__LAT.desenhos.push({ t0, ms: t1 - t0 });
    };
  });

  await page.keyboard.type('kobayashi', { delay: 60 });
  await quadros(page, 8);

  const r = await page.evaluate(async () => {
    const L = window.__LAT;
    const t = await import('/src/ui/toolkit.js');
    /* para cada tecla, o primeiro desenho depois dela */
    const lat = [];
    for (const k of L.teclas) {
      const d = L.desenhos.find(x => x.t0 >= k.t);
      if (d) lat.push(d.t0 - k.t);
    }
    const soma = a => a.reduce((s, v) => s + v, 0);
    const ms = L.desenhos.map(d => d.ms);
    return {
      teclas: L.teclas.length,
      desenhos: L.desenhos.length,
      latenciaMedia: +(soma(lat) / Math.max(1, lat.length)).toFixed(1),
      latenciaMax: +Math.max(...lat, 0).toFixed(1),
      desenhoMedio: +(soma(ms) / Math.max(1, ms.length)).toFixed(2),
      desenhoMax: +Math.max(...ms, 0).toFixed(2),
      campo: t.UI.state('links').busca
    };
  });
  console.log('LATENCIA ' + JSON.stringify(r));
}

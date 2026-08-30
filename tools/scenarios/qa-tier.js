async function quadros(page, n) {
  await page.evaluate((k) => new Promise(res => {
    let i = 0; const f = () => { if (++i > k) res(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), n);
}
export default async function (page, ctx) {
  await quadros(page, 3);
  await page.evaluate(() => window.__UPLINK.Shell._boot.skip());
  await quadros(page, 6);
  await page.evaluate(() => window.__UPLINK.Game.newGame('ghost_in_wire'));
  await quadros(page, 14);
  console.log('TIER ' + await page.evaluate(() => JSON.stringify({
    tier: window.__UPLINK.CFG.tier,
    stats: window.__UPLINK_STATS ? window.__UPLINK_STATS() : null,
    objetos: (() => { let n = 0, m = 0; window.__UPLINK.Stage.scene.traverse(o => { n++; if (o.isMesh) m++; }); return { nos: n, malhas: m }; })(),
    luzes: (() => { const L = []; window.__UPLINK.Stage.scene.traverse(o => { if (o.isLight) L.push(o.type); }); return L; })(),
    materiais: (() => { const s = new Set(); window.__UPLINK.Stage.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => s.add(m.type)); }); return [...s]; })()
  })));
  await ctx.shot('desktop');
}

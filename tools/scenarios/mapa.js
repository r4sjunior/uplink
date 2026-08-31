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
    window.__UPLINK.Game.newGame('mapista');
  });
  await quadros(page, 14);
  await page.evaluate(async () => {
    const m = await import('/src/ui/windows.js');
    m.Windows.closeAll();
    const a = await import('/src/ui/apps/index.js');
    a.Apps.open('route');
    const w = m.Windows.get('route');
    const s = window.__UPLINK.surface;
    if (w) { w.x = 12; w.y = 52; w.w = s.W - 356; w.h = s.H - 140; }
  });
  await quadros(page, 10);
  await ctx.shot('01-mundo');

  /* aproxima na Europa */
  const caixa = await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    return t.UI.rectOf('route:mapa');
  });
  const cx = Math.round(caixa[0] + caixa[2] * 0.52);
  const cy = Math.round(caixa[1] + caixa[3] * 0.28);
  await page.mouse.move(cx, cy);
  await quadros(page, 2);
  for (let i = 0; i < 7; i++) { await page.mouse.wheel({ deltaY: -120 }); await quadros(page, 2); }
  await quadros(page, 6);
  await ctx.shot('02-aproximado');

  const z = await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    return t.UI.state('route').vista.zoom;
  });
  console.log('ZOOM ' + z.toFixed(2));

  /* monta rota e disca, capturando a discagem em andamento */
  await page.evaluate(() => {
    const G = window.__UPLINK.Game;
    const S = G.state;
    const pub = Object.values(S.world.servers).filter(s => s.publicList && s.type !== 'uis');
    G.net.clearRoute();
    pub.slice(0, 5).forEach(s => G.net.addHop(s.ip));
    const alvo = Object.values(S.world.servers).find(s => s.type === 'cctv');
    G.net.setTarget(alvo.ip);
    G.net.connect();
  });
  await quadros(page, 6);
  await ctx.shot('03-discando');
  const emDiscagem = await page.evaluate(() => !!window.__UPLINK.Game.state.conn.dial);
  console.log('DISCANDO ' + emDiscagem);
}

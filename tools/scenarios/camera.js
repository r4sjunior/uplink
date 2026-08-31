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
    window.__UPLINK.Game.newGame('camera');
  });
  await quadros(page, 14);

  /* conecta num CFTV e abre a central de vídeo */
  await page.evaluate(() => {
    const G = window.__UPLINK.Game;
    const S = G.state;
    const cam = Object.values(S.world.servers).find(s => s.type === 'cctv');
    G.net.clearRoute();
    G.net.setTarget(cam.ip);
    G.net.connect({ instant: true });
    const sv = S.world.servers[cam.ip];
    sv.st.logged = true; sv.st.fwDown = true; sv.st.proxyDown = true;
  });
  await quadros(page, 10);
  await page.evaluate(async () => {
    const m = await import('/src/ui/windows.js');
    const w = m.Windows.get('server');
    const s = window.__UPLINK.surface;
    if (w) { w.x = 12; w.y = 52; w.w = s.W - 356; w.h = s.H - 140; }
    const t = await import('/src/ui/toolkit.js');
    t.UI.state('server').aba = 0;
  });
  await quadros(page, 10);
  await ctx.shot('01-mosaico');

  /* amplia uma câmera CLICANDO nela, como o jogador faz */
  const alvo = await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    for (const k of t.UI.qaIds()) {
      if (k.startsWith('server:cam')) {
        const rr = t.UI.rectOf(k);
        if (rr) return { id: k, x: Math.round(rr[0] + rr[2] / 2), y: Math.round(rr[1] + rr[3] / 2) };
      }
    }
    return null;
  });
  console.log('CELULA ' + JSON.stringify(alvo));
  if (alvo) {
    await page.mouse.move(alvo.x, alvo.y);
    await quadros(page, 3);
    await page.mouse.down(); await quadros(page, 1); await page.mouse.up();
    await quadros(page, 10);
  }
  const ampliada = await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    return t.UI.state('server').cam;
  });
  console.log('AMPLIADA ' + ampliada);
  await ctx.shot('02-ampliada');

  /* volta ao mosaico e amplia uma noturna */
  await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    const S = window.__UPLINK.Game.state;
    const sv = S.world.servers[S.conn.target];
    const n = sv.cams.find(c => c.night) || sv.cams[0];
    t.UI.state('server').cam = n.id;
    window.__UPLINK.surface.invalidate();
  });
  await quadros(page, 14);
  await ctx.shot('03-noturna');
}

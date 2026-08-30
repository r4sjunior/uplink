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
    window.__UPLINK.Game.newGame('agente');
  });
  await quadros(page, 14);
  await ctx.shot('00-inicial');

  /* cada aplicativo sozinho, para julgar sem oclusão */
  for (const app of ['email', 'route', 'gateway', 'links', 'finance', 'news', 'help']) {
    await page.evaluate(async (a) => {
      const m = await import('/src/ui/windows.js');
      m.Windows.closeAll();
      const ap = await import('/src/ui/apps/index.js');
      ap.Apps.open(a);
      const w = m.Windows.get(a);
      const s = window.__UPLINK.surface;
      if (w) { w.x = 16; w.y = 52; w.w = s.W - 360; w.h = s.H - 150; }
    }, app);
    await quadros(page, 8);
    await ctx.shot('01-' + app);
  }
}

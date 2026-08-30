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
    window.__UPLINK.Game.newGame('perf_test');
  });
  await quadros(page, 12);
  console.log('PADRAO  ' + JSON.stringify(await page.evaluate(() => window.__UPLINK_STATS())));

  /* abre o painel e testa os três perfis */
  await page.keyboard.press('F1');
  await quadros(page, 4);
  for (const q of ['baixa', 'media', 'alta']) {
    await page.evaluate((n) => {
      window.__UPLINK.PerfHUD.el.querySelector('[data-q="' + n + '"]').click();
    }, q);
    await quadros(page, 10);
    console.log(q.toUpperCase().padEnd(7) + ' ' + JSON.stringify(await page.evaluate(() => window.__UPLINK_STATS())));
  }
  await ctx.shot('hud');
  /* estado do som */
  console.log('AUDIO ' + JSON.stringify(await page.evaluate(() => window.__UPLINK.Audio.stats())));
}

/* Mede o custo por etapa com o ponteiro em movimento — que é o pior
   caso real: mexer o mouse invalida a interface. */
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

  const parado = await page.evaluate(() => window.__UPLINK_STATS());
  console.log('PARADO  ' + JSON.stringify(parado));

  /* varre o ponteiro pela tela, como um jogador faz */
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(300 + i * 45, 300 + Math.sin(i / 3) * 180);
  }
  await quadros(page, 20);
  const movendo = await page.evaluate(() => window.__UPLINK_STATS());
  console.log('MOVENDO ' + JSON.stringify(movendo));
  await ctx.shot('perf');
}

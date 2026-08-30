/* Percorre o jogo inteiro esperando QUADROS REAIS, não tempo de
   relógio: no headless com swiftshader um quadro leva mais de um
   segundo, e esperar por tempo captura sempre o passado. */
async function quadros(page, n) {
  await page.evaluate((k) => new Promise(res => {
    let i = 0;
    const f = () => { if (++i > k) res(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), n);
}

export default async function (page, ctx) {
  await quadros(page, 3);
  await ctx.shot('01-boot');

  await page.evaluate(() => window.__UPLINK.Shell._boot.skip());
  await quadros(page, 6);
  await ctx.shot('02-login');

  await page.evaluate(() => window.__UPLINK.Game.newGame('ghost_in_wire'));
  await quadros(page, 10);
  await ctx.shot('03-desktop');

  /* percorre os aplicativos */
  for (const app of ['route', 'gateway', 'links', 'finance', 'news', 'help']) {
    await page.evaluate((a) => {
      const U = window.__UPLINK;
      U.Shell._surface.invalidate();
      import('/src/ui/apps/index.js').then(m => m.Apps.open(a));
    }, app);
    await quadros(page, 5);
    await ctx.shot('04-' + app);
  }

  /* uma invasão de verdade: rota, conexão, trace */
  await page.evaluate(() => {
    const U = window.__UPLINK;
    const G = U.Game;
    const alvo = G.missions.boardView().available[0];
    G.missions.accept(alvo.id);
    G.net.clearRoute();
    G.world.bounceCandidates().slice(0, 3).forEach(s => G.net.addHop(s.ip));
    G.net.setTarget(alvo.targetIp);
    G.net.connect();
  });
  await quadros(page, 8);
  await ctx.shot('05-conectado');

  /* dispara o trace */
  await page.evaluate(() => {
    const U = window.__UPLINK;
    const S = U.Game.state;
    const sv = S.world.servers[S.conn.target];
    sv.st.logged = true;
    U.Game.net.illegal(sv, 3);
  });
  await quadros(page, 8);
  await ctx.shot('06-trace');
}

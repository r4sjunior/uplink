/* QA: confirma boot/login e roda o trace por muitos quadros. */
async function quadros(page, n) {
  await page.evaluate((k) => new Promise(res => {
    let i = 0;
    const f = () => { if (++i > k) res(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), n);
}
export default async function (page, ctx) {
  await quadros(page, 12);
  await ctx.shot('01-boot-12f');
  await quadros(page, 25);
  await ctx.shot('02-boot-37f');

  await page.evaluate(() => window.__UPLINK.Shell._boot.skip());
  await quadros(page, 25);
  await ctx.shot('03-login-25f');

  await page.evaluate(() => window.__UPLINK.Game.newGame('ghost_in_wire'));
  await quadros(page, 12);

  await page.evaluate(() => {
    const G = window.__UPLINK.Game;
    const alvo = G.missions.boardView().available[0];
    G.missions.accept(alvo.id);
    G.net.clearRoute();
    G.world.bounceCandidates().slice(0, 3).forEach(s => G.net.addHop(s.ip));
    G.net.setTarget(alvo.targetIp);
    G.net.connect();
  });
  await quadros(page, 10);
  await page.evaluate(() => {
    const U = window.__UPLINK, S = U.Game.state;
    const sv = S.world.servers[S.conn.target];
    sv.st.logged = true;
    U.Game.net.illegal(sv, 3);
  });
  await quadros(page, 40);
  await ctx.shot('04-trace-40f');
  const est = await page.evaluate(() => {
    const S = window.__UPLINK.Game.state;
    return JSON.stringify({ trace: S.trace, conn: S.conn && { target: S.conn.target }, });
  });
  console.log('ESTADO_TRACE ' + est);
  await quadros(page, 60);
  await ctx.shot('05-trace-100f');
}

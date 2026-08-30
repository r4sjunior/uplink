export default async function (page, ctx) {
  await ctx.wait(1000);
  await page.evaluate(() => {
    const U = window.__UPLINK;
    U.Shell._boot.skip();
    U.Game.newGame('ghost_in_wire');
  });
  /* espera quadros de verdade, não tempo de relógio */
  await page.evaluate(() => new Promise(res => {
    let n = 0;
    const f = () => { if (++n > 6) res(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }));
  await ctx.shot('desktop');
  const info = await page.evaluate(() => ({
    tela: window.__UPLINK.Shell.currentScreen(),
    objetos: window.__UPLINK.Stage.scene.children.length,
    camZ: +window.__UPLINK.Stage.camera.position.z.toFixed(3),
    fov: window.__UPLINK.Stage.camera.fov,
    preset: window.__UPLINK.Stage.rig.preset,
    malhas: (() => { let n = 0; window.__UPLINK.Stage.scene.traverse(o => { if (o.isMesh) n++; }); return n; })()
  }));
  console.log('DIAG ' + JSON.stringify(info));
}

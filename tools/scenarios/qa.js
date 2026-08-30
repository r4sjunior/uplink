export default async function (page, ctx) {
  await ctx.wait(1500);
  await ctx.shot('01-boot');
  /* pula o boot */
  await page.mouse.click(800, 500);
  await ctx.wait(2500);
  await ctx.shot('02-login');
  /* cria um agente */
  await page.evaluate(() => window.__UPLINK.Game.newGame('ghost_in_wire'));
  await ctx.wait(2500);
  await ctx.shot('03-desktop');
}

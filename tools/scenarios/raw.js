import fs from 'node:fs';
import path from 'node:path';
export default async function (page, ctx) {
  await ctx.wait(800);
  await page.evaluate(() => {
    window.__UPLINK.Shell._boot.skip();
    window.__UPLINK.Game.newGame('ghost_in_wire');
  });
  await page.evaluate(() => new Promise(res => {
    let n = 0; const f = () => { if (++n > 5) res(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }));
  /* despeja o canvas da interface diretamente, sem passar pelo 3D */
  const dataUrl = await page.evaluate(() => window.__UPLINK.surface.canvas.toDataURL('image/png'));
  const out = path.resolve('tools/shots/raw-surface.png');
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('SURFACE ' + out);
}

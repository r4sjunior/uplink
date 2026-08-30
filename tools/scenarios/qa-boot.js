async function quadros(page, n) {
  await page.evaluate((k) => new Promise(res => {
    let i = 0; const f = () => { if (++i > k) res(); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), n);
}
const probe = () => {
  const U = window.__UPLINK;
  const cv = U.surface.canvas || (U.surface.ctx && U.surface.ctx.canvas);
  let nz = 0, w = 0, h = 0;
  if (cv) {
    w = cv.width; h = cv.height;
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, w, h).data;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i+1] + d[i+2] > 12) nz++;
  }
  return JSON.stringify({ screen: U.Shell.currentScreen(), canvas: w + 'x' + h, amostrasClaras: nz });
};
export default async function (page, ctx) {
  for (const n of [2, 6, 14, 30, 60]) {
    await quadros(page, n);
    console.log('PROBE apos frames: ' + await page.evaluate(probe));
  }
  await ctx.shot('boot-112f');
}

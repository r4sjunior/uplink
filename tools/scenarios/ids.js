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
    window.__UPLINK.Game.newGame('ids');
  });
  await quadros(page, 10);
  await page.evaluate(async () => {
    const m = await import('/src/ui/windows.js');
    m.Windows.closeAll();
    const a = await import('/src/ui/apps/index.js');
    a.Apps.open('gateway');
  });
  await quadros(page, 10);
  const ids = await page.evaluate(async () => {
    const t = await import('/src/ui/toolkit.js');
    return t.UI.qaIds().filter(x => x.startsWith('gateway'));
  });
  console.log('IDS_GATEWAY ' + JSON.stringify(ids));
}

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
const [src, X, Y, W, H, Z, out] = process.argv.slice(2);
const x = +X, y = +Y, w = +W, h = +H, z = +Z;
const ext = path.extname(src).toLowerCase();
const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
const uri = `data:${mime};base64,` + fs.readFileSync(src).toString('base64');
const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:#000;overflow:hidden}
#v{width:${w*z}px;height:${h*z}px;overflow:hidden;position:relative}
img{position:absolute;left:0;top:0;transform-origin:0 0;
  transform:scale(${z}) translate(${-x}px,${-y}px);image-rendering:pixelated}
</style><div id="v"><img src="${uri}"></div>`;
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--force-color-profile=srgb','--hide-scrollbars'] });
const p = await b.newPage();
await p.setViewport({ width: Math.ceil(w*z), height: Math.ceil(h*z), deviceScaleFactor: 1 });
await p.setContent(html, { waitUntil: 'load' });
await p.evaluate(() => Promise.all(Array.from(document.images).map(i => i.decode().catch(()=>{}))));
await p.screenshot({ path: out });
await b.close();
console.log('ok ' + out);

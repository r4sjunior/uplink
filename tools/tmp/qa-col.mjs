import puppeteer from 'puppeteer';
import fs from 'node:fs'; import path from 'node:path';
const src=process.argv[2], mode=process.argv[3];
const a=+process.argv[4],b=+process.argv[5],c=+process.argv[6];
const ext=path.extname(src).toLowerCase();
const mime=ext==='.jpg'||ext==='.jpeg'?'image/jpeg':'image/png';
const uri=`data:${mime};base64,`+fs.readFileSync(src).toString('base64');
const br=await puppeteer.launch({headless:true,args:['--no-sandbox','--force-color-profile=srgb']});
const p=await br.newPage(); await p.setContent('<img id=i src="'+uri+'">');
const out=await p.evaluate(async(mode,a,b,c)=>{
 const im=document.getElementById('i'); await im.decode();
 const cv=document.createElement('canvas'); cv.width=im.naturalWidth; cv.height=im.naturalHeight;
 const g=cv.getContext('2d',{willReadFrequently:true}); g.drawImage(im,0,0);
 const r=[];
 if(mode==='vcol'){ // a=x, b=y0, c=y1  -> coluna vertical
  const d=g.getImageData(a,b,1,c-b).data;
  for(let i=0;i<d.length;i+=4) r.push((b+i/4)+': '+d[i]+','+d[i+1]+','+d[i+2]);
 } else { // hrow: a=y, b=x0, c=x1
  const d=g.getImageData(b,a,c-b,1).data;
  for(let i=0;i<d.length;i+=4) r.push((b+i/4)+': '+d[i]+','+d[i+1]+','+d[i+2]);
 }
 return r;
},mode,a,b,c);
console.log(out.join('\n'));
await br.close();

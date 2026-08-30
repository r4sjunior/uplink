import puppeteer from 'puppeteer';
import fs from 'node:fs'; import path from 'node:path';
const src=process.argv[2], thr=+(process.argv[3]||14);
const ext=path.extname(src).toLowerCase();
const mime=ext==='.jpg'||ext==='.jpeg'?'image/jpeg':'image/png';
const uri=`data:${mime};base64,`+fs.readFileSync(src).toString('base64');
const br=await puppeteer.launch({headless:true,args:['--no-sandbox','--force-color-profile=srgb']});
const p=await br.newPage(); await p.setContent('<img id=i src="'+uri+'">');
console.log(JSON.stringify(await p.evaluate(async(thr)=>{
 const im=document.getElementById('i'); await im.decode();
 const cv=document.createElement('canvas'); cv.width=im.naturalWidth; cv.height=im.naturalHeight;
 const g=cv.getContext('2d',{willReadFrequently:true}); g.drawImage(im,0,0);
 const d=g.getImageData(0,0,cv.width,cv.height).data;
 let x0=1e9,y0=1e9,x1=-1,y1=-1,lit=0;
 for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++){
  const i=(y*cv.width+x)*4;
  if(d[i]+d[i+1]+d[i+2]>thr){lit++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
 }
 return {img:cv.width+'x'+cv.height,bbox:[x0,y0,x1,y1],w:x1-x0+1,h:y1-y0+1,
   pctPixeisAcesos:+(100*lit/(cv.width*cv.height)).toFixed(2)};
},thr)));
await br.close();

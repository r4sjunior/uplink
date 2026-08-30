import puppeteer from 'puppeteer';
import fs from 'node:fs'; import path from 'node:path';
const src=process.argv[2], y=+process.argv[3], thr=+(process.argv[4]||60);
const uri='data:image/png;base64,'+fs.readFileSync(src).toString('base64');
const br=await puppeteer.launch({headless:true,args:['--no-sandbox','--force-color-profile=srgb']});
const p=await br.newPage(); await p.setContent('<img id=i src="'+uri+'">');
console.log(JSON.stringify(await p.evaluate(async(y,thr)=>{
 const im=document.getElementById('i'); await im.decode();
 const cv=document.createElement('canvas'); cv.width=im.naturalWidth; cv.height=im.naturalHeight;
 const g=cv.getContext('2d',{willReadFrequently:true}); g.drawImage(im,0,0);
 const d=g.getImageData(0,y,cv.width,1).data; const on=[];
 for(let x=0;x<cv.width;x++){const i=x*4; if(d[i]+d[i+1]+d[i+2]>thr) on.push(x);}
 return {y, primeiro:on[0], ultimo:on[on.length-1], largura:on.length?on[on.length-1]-on[0]+1:0};
},y,thr)));
await br.close();

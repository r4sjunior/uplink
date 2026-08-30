import puppeteer from 'puppeteer';
import fs from 'node:fs'; import path from 'node:path';
const src = process.argv[2];
const regions = JSON.parse(process.argv[3]); // [{name,x,y,w,h}]
const ext=path.extname(src).toLowerCase();
const mime = ext==='.jpg'||ext==='.jpeg'?'image/jpeg':'image/png';
const uri = `data:${mime};base64,`+fs.readFileSync(src).toString('base64');
const b = await puppeteer.launch({headless:true,args:['--no-sandbox','--force-color-profile=srgb']});
const p = await b.newPage();
await p.setContent('<img id=i src="'+uri+'">');
const out = await p.evaluate(async (regs)=>{
  const im=document.getElementById('i'); await im.decode();
  const c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight;
  const g=c.getContext('2d',{willReadFrequently:true}); g.drawImage(im,0,0);
  const lum=(r,gg,bb)=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
    return 0.2126*f(r)+0.7152*f(gg)+0.0722*f(bb)};
  const res=[];
  for(const R of regs){
    const d=g.getImageData(R.x,R.y,R.w,R.h).data;
    let maxL=-1,maxC=null,minL=2,minC=null,sum=0,n=0;
    const hist={};
    for(let i=0;i<d.length;i+=4){
      const L=lum(d[i],d[i+1],d[i+2]);
      if(L>maxL){maxL=L;maxC=[d[i],d[i+1],d[i+2]]}
      if(L<minL){minL=L;minC=[d[i],d[i+1],d[i+2]]}
      sum+=L;n++;
      const k=d[i]+','+d[i+1]+','+d[i+2]; hist[k]=(hist[k]||0)+1;
    }
    const top=Object.entries(hist).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>k+' x'+v);
    res.push({name:R.name,bright:maxC,brightL:+maxL.toFixed(4),dark:minC,darkL:+minL.toFixed(4),
      ratio:+(((maxL+0.05)/(minL+0.05))).toFixed(2),avgL:+(sum/n).toFixed(4),top});
  }
  return res;
},regions);
console.log(JSON.stringify(out,null,1));
await b.close();

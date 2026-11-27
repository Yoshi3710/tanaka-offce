"use strict";
// Generate PDFs from the actual current four templates using Chrome's print layout.
// No production changes and no real customer data.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{spawnSync}=require("node:child_process"),{pathToFileURL}=require("node:url"),assert=require("node:assert/strict");
const chrome=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(x=>spawnSync(x,["--version"],{encoding:"utf8"}).status===0);
assert(chrome,"Chrome required");
const live=process.env.TANAKA_LIVE_URL;
const evidence=path.resolve("pdf-evidence");fs.mkdirSync(evidence,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"tanaka-print-"));
async function main(){try{
 const source=fs.readFileSync("index.html","utf8");
 assert(source.includes(".print-meta tr:last-child td{white-space:nowrap;font-size:11px}"),"document date single line");
 assert(source.includes(".paper table{border-collapse:collapse;table-layout:fixed;max-width:100%}"),"table border uniform");
 assert(!source.includes("--form-line"),"no variable border compensation");
 assert(!source.includes("vertical-align:middle"),"all table text top-aligned");
 assert(source.includes("登録番号　T2120001158559"),"company registration number");
 assert(!/大阪信用金庫|振込先|お支払い日/.test(source),"bank details not added");
 assert(source.includes(".order-memo{display:flex;flex-direction:column;"),"order and quote remarks below heading");
 assert(source.includes('<b style="display:block">備考：</b>'),"delivery and invoice remarks below heading");
 fs.mkdirSync(path.join(temp,"assets"));fs.copyFileSync("assets/logo.webp",path.join(temp,"assets/logo.webp"));
 const pdfInfo=spawnSync("pdfinfo",["-v"],{encoding:"utf8"}).status===0;
 const textExtract=spawnSync("pdftotext",["-v"],{encoding:"utf8"}).status===0;
 const rasterPDF=spawnSync("pdftoppm",["-v"],{encoding:"utf8"}).status===0;
 assert(pdfInfo&&textExtract&&rasterPDF,"Poppler PDF inspection utilities required");
 // Check actual rendered right edge with reduced zoom (not merely computed CSS).
 function decodePNG(bytes){
  let p=8,w,h,channels,parts=[];
  while(p+12<=bytes.length){let n=bytes.readUInt32BE(p),type=bytes.toString("ascii",p+4,p+8),d=bytes.subarray(p+8,p+8+n);if(type==="IHDR"){w=d.readUInt32BE(0);h=d.readUInt32BE(4);assert.equal(d[8],8);channels=d[9]===2?3:d[9]===6?4:0;assert(channels,"RGB PNG");}if(type==="IDAT")parts.push(d);p+=12+n;}
  let raw=require("node:zlib").inflateSync(Buffer.concat(parts)),stride=w*channels,out=Buffer.alloc(stride*h),pos=0;
  for(let y=0;y<h;y++){let filter=raw[pos++];for(let x=0;x<stride;x++){let i=y*stride+x,a=x>=channels?out[i-channels]:0,b=y?out[i-stride]:0,c=y&&x>=channels?out[i-stride-channels]:0,v=a+b-c,pa=Math.abs(v-a),pb=Math.abs(v-b),pc=Math.abs(v-c);out[i]=(raw[pos++]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?(pa<=pb&&pa<=pc?a:pb<=pc?b:c):0))&255;}}
  return {w,h,dark(x,y){if(x<0||x>=w||y<0||y>=h)return false;let i=(y*w+x)*channels;return out[i]<150&&out[i+1]<150&&out[i+2]<150;}};
 }

 async function rasterEdges(type,sparse=false){
  const label=type+(sparse?"-sparse":"");
  const profile=path.join(temp,"raster-profile-"+label);
  const child=require("node:child_process").spawn(chrome,["--headless","--no-sandbox","--disable-dev-shm-usage","--hide-scrollbars","--disable-background-networking","--remote-debugging-port=0","--force-device-scale-factor=1","--user-data-dir="+profile,pathToFileURL(path.resolve("index.html")).href],{stdio:"ignore"});
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  let ws;
  try{
   let port;
   for(let i=0;i<100&&!port;i++){try{port=Number(fs.readFileSync(path.join(profile,"DevToolsActivePort"),"utf8").split("\n")[0]);}catch{}if(!port)await delay(100);}
   assert(port,"CDP port");
   const tabs=await(await fetch("http://127.0.0.1:"+port+"/json/list")).json();
   ws=new WebSocket(tabs.find(t=>t.type==="page").webSocketDebuggerUrl);
   await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true});});
   let seq=0,pending=new Map();ws.addEventListener("message",e=>{const msg=JSON.parse(e.data);if(pending.has(msg.id)){let p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}});
   const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
   await send("Emulation.setDeviceMetricsOverride",{width:900,height:1400,deviceScaleFactor:1,mobile:false});
   await send("Page.enable");
   await send("Page.navigate",{url:live||pathToFileURL(path.resolve("index.html")).href});
   let ready=false;for(let i=0;i<100&&!ready;i++){let v=await send("Runtime.evaluate",{expression:'document.readyState==="complete"&&!!document.getElementById("sample")'});ready=v.result.value===true;if(!ready)await delay(100);}
   assert(ready,"form ready");
   const expression=`(async()=>{window.confirm=()=>true;document.getElementById("sample").click();let t=document.getElementById("type");t.value=${JSON.stringify(type)};t.dispatchEvent(new Event("change",{bubbles:true}));if(${JSON.stringify(sparse)}){for(const [k,v] of Object.entries({school:"架空・みどり中学校",maker:"架空・教材メーカーA",schoolAddress:"架空県サンプル市1丁目",schoolContact:"",schoolTel:"000-0000-0001",className:"",quoteExpiry:""})){const e=document.querySelector("#paper [data-field='"+k+"']");if(e){e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));}}}let st=document.createElement("style");st.textContent=".head,.notice,.editor,.sheet-top{display:none!important}.layout{display:block!important;margin:0!important;padding:0!important}.sheet-panel,.sheet-wrap{padding:0!important;border:0!important;background:white!important}@media screen{.paper{margin:20px!important;zoom:.65!important}}";document.head.append(st);await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const paper=document.getElementById("paper");paper.style.setProperty("zoom","1","important");const cells=[...document.querySelectorAll("#paper table,#paper table th,#paper table td,#paper .order-address-heading,#paper input,#paper textarea")];for(const e of cells){const c=getComputedStyle(e);if(!["rgb(255, 255, 255)","rgba(0, 0, 0, 0)"].includes(c.backgroundColor))throw Error("nonwhite document background "+e.className+" "+c.backgroundColor);if(e.matches("th,td,input,textarea,.order-address-heading")&&c.color!=="rgb(0, 0, 0)")throw Error("nonblack document text "+c.color);if(e.matches("th,td:not(.address-gap)")&&["Top","Right","Bottom","Left"].some(side=>c["border"+side+"Color"]!=="rgba(0, 0, 0, 0)"||Math.abs(parseFloat(c["border"+side+"Width"])-1)>.01))throw Error("nontransparent cell layout border "+e.className);}const pair=paper.querySelector(".order-addresses");if(pair){for(const row of pair.rows){const r=[...row.cells].filter(e=>!e.classList.contains("address-gap")).map(e=>e.getBoundingClientRect());if(r.some(e=>Math.abs(e.top-r[0].top)>.1||Math.abs(e.bottom-r[0].bottom)>.1))throw Error("address row alignment");}}paper.style.removeProperty("zoom");window.dispatchEvent(new Event("resize"));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const grid=paper.querySelector(".paper-grid path");if(!grid||getComputedStyle(grid).vectorEffect!=="non-scaling-stroke"||!grid.getAttribute("d"))throw Error("missing fixed-width SVG grid");return [...document.querySelectorAll("#paper table th,#paper table td:not(.address-gap)")].map(e=>{let r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]});})()`;
   const geometry=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});assert(!geometry.exceptionDetails,JSON.stringify(geometry.exceptionDetails));let rects=geometry.result.value;
   const shot=await send("Page.captureScreenshot",{format:"png",fromSurface:true,captureBeyondViewport:false});let img=decodePNG(Buffer.from(shot.data,"base64"));
   assert(rects.length>0);
   for(let [l,t,r,b] of rects){for(let vertical of [true,false]){for(let edge of vertical?[l,r]:[t,b]){let hits=0,total=0;for(let p=Math.ceil(vertical?t:l)+3;p<Math.floor(vertical?b:r)-3;p++){total++;if([-2,-1,0,1].some(d=>vertical?img.dark(Math.round(edge)+d,p):img.dark(p,Math.round(edge)+d)))hits++;}if(total>0)assert(hits/total>.9,type+" cell "+(vertical?"vertical":"horizontal")+" edge "+edge+" coverage "+hits+"/"+total);}}}
   fs.writeFileSync(path.join(evidence,label+"-screen.png"),Buffer.from(shot.data,"base64"));
   console.log("PASS "+type+" fixed SVG and all actual cell edges at 65% zoom");
   // Print from the SAME browser session after a reduced screen preview.
   await send("Emulation.setEmulatedMedia",{media:"print"});
   const printGeometry=await send("Runtime.evaluate",{expression:`(async()=>{await document.fonts.ready;window.dispatchEvent(new Event("beforeprint"));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const p=document.getElementById("paper"),r=p.getBoundingClientRect();return [...p.querySelectorAll("table th,table td:not(.address-gap)")].map(e=>{let b=e.getBoundingClientRect();return [b.left-r.left,b.top-r.top,b.right-r.left,b.bottom-r.top]});})()`,awaitPromise:true,returnByValue:true});
   assert(!printGeometry.exceptionDetails,JSON.stringify(printGeometry.exceptionDetails));
   const printed=await send("Page.printToPDF",{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
   const output=path.join(evidence,label+".pdf");fs.writeFileSync(output,Buffer.from(printed.data,"base64"));
   const result=spawnSync("pdftoppm",["-r","300","-png","-singlefile",output,path.join(evidence,label+"-300dpi")],{encoding:"utf8"});assert.equal(result.status,0,result.stderr);
   const image=decodePNG(fs.readFileSync(path.join(evidence,label+"-300dpi.png")));
   const extracted=spawnSync("pdftotext",[output,"-"],{encoding:"utf8"});assert(extracted.status===0&&extracted.stdout.includes("株式会社タナカ"),type+" Japanese text rendered in PDF");
   // CSS @page 10mm margin, 96 CSS px per inch, 300 raster px per inch.
   const scale=300/96,offset=300*10/25.4;
   for(const rect of printGeometry.result.value){const [l,t,r,b]=rect.map(v=>v*scale+offset);for(const vertical of [true,false])for(const edge of vertical?[l,r]:[t,b]){let hits=0,total=0;for(let p=Math.ceil(vertical?t:l)+2;p<Math.floor(vertical?b:r)-2;p++){total++;const pixels=[-5,-4,-3,-2,-1,0,1,2,3,4,5].filter(d=>vertical?image.dark(Math.round(edge)+d,p):image.dark(p,Math.round(edge)+d));if(pixels.length)hits++;if(p%17===0&&p>Math.ceil(vertical?t:l)+10&&p<Math.floor(vertical?b:r)-10){assert(pixels.length>=2&&pixels.length<=4,type+" PDF physical line width "+pixels.length+" at "+edge+","+p);}}if(total)assert(hits===total,type+" PDF expected cell edge "+edge+" coverage "+hits+"/"+total);}}
   console.log("PASS "+type+" PDF 300dpi all expected horizontal and vertical cell positions after scaled preview");
  }finally{if(ws)ws.close();child.kill();}
 }

 for(const type of ["order","quote","delivery","invoice"]){
  const file=path.join(temp,type+".html"),pdf=path.join(temp,type+".pdf");
  const script='<script>window.confirm=()=>true;document.getElementById("sample").click();let type=document.getElementById("type");type.value='+JSON.stringify(type)+';type.dispatchEvent(new Event("change",{bubbles:true}));document.querySelector(".editor").append("PRINT-EDITOR-NOT-SHOW");let del=document.querySelector(".order-delete-controls");if(del)del.append("PRINT-ROW-CONTROL-NOT-SHOW");let paper=document.getElementById("paper");if([...paper.querySelectorAll("table")].some(t=>{let c=getComputedStyle(t);return c.borderCollapse!=="collapse"||c.borderLeftWidth!==c.borderRightWidth||c.borderLeftColor!==c.borderRightColor;} )||[...paper.querySelectorAll("th,td")].some(t=>getComputedStyle(t).verticalAlign!=="top"))paper.innerHTML="FORM-LAYOUT-FAIL";document.title="print-test";<\/script>';
  fs.writeFileSync(file,source.replace("</body>",script+"</body>"));
  const p=spawnSync(chrome,["--headless","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--no-first-run","--no-pdf-header-footer","--user-data-dir="+path.join(temp,"profile-"+type),"--virtual-time-budget=1500","--print-to-pdf="+pdf,pathToFileURL(file).href],{encoding:"utf8",timeout:25000,maxBuffer:2*1024*1024});
  assert.equal(p.status,0,p.error?.message||p.stderr?.slice(-1000));const bytes=fs.readFileSync(pdf);
  assert(bytes.length>3000&&bytes.subarray(0,4).toString()==="%PDF",type+" PDF output");
  if(!pdfInfo){const raw=bytes.toString("latin1"),pages=[...raw.matchAll(/\/Type\s*\/Page\b/g)],sizes=[...raw.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];assert.equal(pages.length,1,type+" one page (PDF dictionary)");assert(sizes.length&&sizes.every(m=>Math.abs(Number(m[1])-595)<3&&Math.abs(Number(m[2])-842)<3),type+" A4 portrait (PDF dictionary)");}
  if(pdfInfo){
   const info=spawnSync("pdfinfo",[pdf],{encoding:"utf8"});assert.equal(info.status,0);assert(/^Pages:\s+1\s*$/m.test(info.stdout),type+" sample single page: "+info.stdout);
   const size=info.stdout.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);
   assert(size&&Math.abs(Number(size[1])-595)<3&&Math.abs(Number(size[2])-842)<3,type+" A4 portrait");
  }
  if(textExtract){
   const txt=spawnSync("pdftotext",["-layout",pdf,"-"],{encoding:"utf8"});assert.equal(txt.status,0);assert(txt.stdout.includes("A-001")&&txt.stdout.includes("B-002"),type+" printed sample SKUs");
   assert(!txt.stdout.includes("FORM-LAYOUT-FAIL"),type+" actual browser cell alignment and outer borders");
   assert.equal(txt.stdout.includes("T2120001158559"),type!=="order",type+" registration number scope");
   assert(!/PRINT-EDITOR-NOT-SHOW|PRINT-ROW-CONTROL-NOT-SHOW/.test(txt.stdout),type+" print controls excluded");
   assert(!/学校提出用|ご確認をお願いいたします|試作帳票|正式な見積には使用しないでください|正式な注文|（未入力）/.test(txt.stdout),type+" print omits old trial messages");
  }
  const raster=spawnSync("pdftoppm",["-f","1","-l","1","-r","192","-png","-singlefile",pdf,path.join(temp,type+"-print")],{encoding:"utf8"});assert.equal(raster.status,0,raster.stderr);
  const print=decodePNG(fs.readFileSync(path.join(temp,type+"-print.png")));
  // Long vertical strokes in the actual printed page: locate runs and compare their thickness.
  const runs=[];for(let x=0;x<print.w;x++){let start=-1;for(let y=0;y<=print.h;y++){if(y<print.h&&print.dark(x,y)){if(start<0)start=y;}else if(start>=0){if(y-start>=80)runs.push({x,start,end:y});start=-1;}}}
  const bands=[];for(const r of runs){let b=bands.find(b=>r.x===b.right+1&&Math.min(b.end,r.end)-Math.max(b.start,r.start)>=.8*Math.min(b.end-b.start,r.end-r.start));if(b){b.right=r.x;b.start=Math.max(b.start,r.start);b.end=Math.min(b.end,r.end);}else bands.push({left:r.x,right:r.x,start:r.start,end:r.end});}
  assert(bands.length>=7,type+" printed grid vertical strokes");
  assert(bands.every(b=>b.right-b.left+1<=3),type+" no thick doubled vertical borders: "+JSON.stringify(bands.filter(b=>b.right-b.left+1>3)));
  console.log("PASS "+type+" printed PDF raster vertical strokes: "+bands.length);
  await rasterEdges(type);
  if(type==="quote")await rasterEdges(type,true);
  console.log("PASS "+type+" PDF"+" / A4 portrait single page"+(textExtract?" / product text and controls":" / text not checked"));
 }
}finally{fs.rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:150});}}
main().catch(e=>{console.error(e);process.exitCode=1;});

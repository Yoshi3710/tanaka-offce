"use strict";
// Generate PDFs from the actual current four templates using Chrome's print layout.
// No production changes and no real customer data.
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{spawnSync}=require("node:child_process"),{pathToFileURL}=require("node:url"),assert=require("node:assert/strict");
const chrome=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(x=>spawnSync(x,["--version"],{encoding:"utf8"}).status===0);
assert(chrome,"Chrome required");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"tanaka-print-"));
try{
 const source=fs.readFileSync("index.html","utf8");
 assert(source.includes(".print-meta td{overflow-wrap:normal;white-space:nowrap}"),"document date single line");
 assert(source.includes(".print-meta,.info-table,.doc-items,.totals,.order-address-table{border:var(--form-line,1px) solid #333;border-collapse:separate;border-spacing:0;outline:var(--form-line,1px) solid #333;"),"table border uniform");
 assert(!source.includes("vertical-align:middle"),"all table text top-aligned");
 assert(source.includes("登録番号　T2120001158559"),"company registration number");
 assert(!/大阪信用金庫|振込先|お支払い日/.test(source),"bank details not added");
 assert(source.includes(".order-memo{display:flex;flex-direction:column;"),"order and quote remarks below heading");
 assert(source.includes('<b style="display:block">備考：</b>'),"delivery and invoice remarks below heading");
 fs.mkdirSync(path.join(temp,"assets"));fs.copyFileSync("assets/logo.webp",path.join(temp,"assets/logo.webp"));
 const pdfInfo=spawnSync("pdfinfo",["-v"],{encoding:"utf8"}).status===0;
 const textExtract=spawnSync("pdftotext",["-v"],{encoding:"utf8"}).status===0;
 // Check actual rendered right edge with reduced zoom (not merely computed CSS).
 function decodePNG(bytes){
  let p=8,w,h,channels,parts=[];
  while(p+12<=bytes.length){let n=bytes.readUInt32BE(p),type=bytes.toString("ascii",p+4,p+8),d=bytes.subarray(p+8,p+8+n);if(type==="IHDR"){w=d.readUInt32BE(0);h=d.readUInt32BE(4);assert.equal(d[8],8);channels=d[9]===2?3:d[9]===6?4:0;assert(channels,"RGB PNG");}if(type==="IDAT")parts.push(d);p+=12+n;}
  let raw=require("node:zlib").inflateSync(Buffer.concat(parts)),stride=w*channels,out=Buffer.alloc(stride*h),pos=0;
  for(let y=0;y<h;y++){let filter=raw[pos++];for(let x=0;x<stride;x++){let i=y*stride+x,a=x>=channels?out[i-channels]:0,b=y?out[i-stride]:0,c=y&&x>=channels?out[i-stride-channels]:0,v=a+b-c,pa=Math.abs(v-a),pb=Math.abs(v-b),pc=Math.abs(v-c);out[i]=(raw[pos++]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?(pa<=pb&&pa<=pc?a:pb<=pc?b:c):0))&255;}}
  return {w,h,dark(x,y){if(x<0||x>=w||y<0||y>=h)return false;let i=(y*w+x)*channels;return out[i]<150&&out[i+1]<150&&out[i+2]<150;}};
 }
 function rasterEdges(type){
  const html=path.join(temp,"raster-"+type+".html"),png=path.join(temp,"raster-"+type+".png");
  const script='<script>window.confirm=()=>true;document.getElementById("sample").click();let t=document.getElementById("type");t.value='+JSON.stringify(type)+';t.dispatchEvent(new Event("change",{bubbles:true}));let p=document.getElementById("paper");document.body.replaceChildren(p);document.body.style.background="white";p.style.margin="20px";p.style.zoom=".65";p.style.setProperty("--form-line","2px");let a=[...p.querySelectorAll("table,.order-address-heading")].map(e=>{let r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]});let pre=document.createElement("pre");pre.id="edge-geometry";pre.hidden=true;pre.textContent=JSON.stringify(a);document.body.append(pre);<\/script>';
  fs.writeFileSync(html,source.replace("</body>",script+"</body>"));
  const args=["--headless","--no-sandbox","--disable-dev-shm-usage","--hide-scrollbars","--window-size=900,1400","--force-device-scale-factor=1","--virtual-time-budget=1000","--user-data-dir="+path.join(temp,"raster-profile-"+type)];
  const u=pathToFileURL(html).href,d=spawnSync(chrome,[...args,"--dump-dom",u],{encoding:"utf8",timeout:25000,maxBuffer:4*1024*1024});assert.equal(d.status,0);let m=d.stdout.match(/<pre id="edge-geometry" hidden="">(.*?)<\/pre>/);assert(m,type+" geometry");let rects=JSON.parse(m[1]);
  const shot=spawnSync(chrome,[...args,"--screenshot="+png,u],{encoding:"utf8",timeout:25000});assert.equal(shot.status,0);let img=decodePNG(fs.readFileSync(png));
  for(let [l,t,r,b] of rects){for(let edge of [l,r]){let hits=0,total=0;for(let y=Math.ceil(t)+3;y<Math.floor(b)-3;y++){total++;if([-2,-1,0,1].some(dx=>img.dark(Math.round(edge)+dx,y)))hits++;}assert(total>0&&hits/total>.85,type+" rendered vertical edge "+edge+" coverage "+hits+"/"+total);}}
  console.log("PASS "+type+" actual raster left/right borders at 65% zoom");
 }

 for(const type of ["order","quote","delivery","invoice"]){
  const file=path.join(temp,type+".html"),pdf=path.join(temp,type+".pdf");
  const script='<script>window.confirm=()=>true;document.getElementById("sample").click();let type=document.getElementById("type");type.value='+JSON.stringify(type)+';type.dispatchEvent(new Event("change",{bubbles:true}));document.querySelector(".editor").append("PRINT-EDITOR-NOT-SHOW");let del=document.querySelector(".order-delete-controls");if(del)del.append("PRINT-ROW-CONTROL-NOT-SHOW");let paper=document.getElementById("paper");if([...paper.querySelectorAll("table")].some(t=>{let c=getComputedStyle(t);return c.borderCollapse!=="separate"||c.borderLeftWidth!==c.borderRightWidth||c.borderLeftColor!==c.borderRightColor;} )||[...paper.querySelectorAll("th,td")].some(t=>getComputedStyle(t).verticalAlign!=="top"))paper.innerHTML="FORM-LAYOUT-FAIL";document.title="print-test";<\/script>';
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
  rasterEdges(type);
  console.log("PASS "+type+" PDF"+" / A4 portrait single page"+(textExtract?" / product text and controls":" / text not checked"));
 }
}finally{fs.rmSync(temp,{recursive:true,force:true});}

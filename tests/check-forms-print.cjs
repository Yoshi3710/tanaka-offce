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
 assert(source.includes(".print-meta,.info-table,.doc-items,.totals{border:1px solid #333}"),"table border uniform");
 assert(!/大阪信用金庫|振込先|お支払い日/.test(source),"bank details not added");
 assert(source.includes(".order-memo{display:flex;flex-direction:column;"),"order and quote remarks below heading");
 assert(source.includes('<b style="display:block">備考：</b>'),"delivery and invoice remarks below heading");
 fs.mkdirSync(path.join(temp,"assets"));fs.copyFileSync("assets/logo.webp",path.join(temp,"assets/logo.webp"));
 const pdfInfo=spawnSync("pdfinfo",["-v"],{encoding:"utf8"}).status===0;
 const textExtract=spawnSync("pdftotext",["-v"],{encoding:"utf8"}).status===0;
 for(const type of ["order","quote","delivery","invoice"]){
  const file=path.join(temp,type+".html"),pdf=path.join(temp,type+".pdf");
  const script='<script>window.confirm=()=>true;document.getElementById("sample").click();let type=document.getElementById("type");type.value='+JSON.stringify(type)+';type.dispatchEvent(new Event("change",{bubbles:true}));document.querySelector(".editor").append("PRINT-EDITOR-NOT-SHOW");let del=document.querySelector(".order-delete-controls");if(del)del.append("PRINT-ROW-CONTROL-NOT-SHOW");document.title="print-test";<\/script>';
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
   assert(!/PRINT-EDITOR-NOT-SHOW|PRINT-ROW-CONTROL-NOT-SHOW/.test(txt.stdout),type+" print controls excluded");
   assert(!/学校提出用|ご確認をお願いいたします|試作帳票|正式な見積には使用しないでください|正式な注文|（未入力）/.test(txt.stdout),type+" print omits old trial messages");
  }
  console.log("PASS "+type+" PDF"+" / A4 portrait single page"+(textExtract?" / product text and controls":" / text not checked"));
 }
}finally{fs.rmSync(temp,{recursive:true,force:true});}

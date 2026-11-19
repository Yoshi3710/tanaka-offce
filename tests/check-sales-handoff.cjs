"use strict";
// HTTP上の実ブラウザで、window.openと両方向のpostMessageによる帳票引継ぎを検査する。
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),http=require("node:http"),{spawn,spawnSync}=require("node:child_process"),assert=require("node:assert/strict");
const chrome=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(x=>spawnSync(x,["--version"],{encoding:"utf8"}).status===0);
assert(chrome,"Chrome / Chromium が必要です");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tanaka-handoff-"));
const browserTest=String.raw`
(async()=>{
const out=document.getElementById("result");
const wait=(fn,msg)=>new Promise((resolve,reject)=>{let count=0;const t=setInterval(()=>{try{if(fn()){clearInterval(t);resolve();}else if(++count>150){clearInterval(t);reject(Error(msg));}}catch{}},40);});
const ok=(v,m)=>{if(!v)throw Error(m)};
let popup;
const frame=document.getElementById("sales"),w=frame.contentWindow,d=w.document,$=id=>d.getElementById(id);
await wait(()=>d.getElementById("rep")?.options.length===7,"sales load");
ok($("rep").value===""&&$("salesWorkspace").hidden,"no default rep");
$("rep").value="大田";$("rep").dispatchEvent(new w.Event("change",{bubbles:true}));
const realOpen=w.open.bind(w);
w.open=(...args)=>{popup=realOpen(...args);return popup;};
w.confirm=()=>true;
function click(sel){const b=d.querySelector(sel);ok(b,"missing "+sel);b.click();}
function set(id,v){$(id).value=v;$(id).dispatchEvent(new w.Event("change",{bubbles:true}));}
function field(key,v){const e=d.querySelector('[data-work="'+key+'"]');ok(e,"missing "+key);e.value=v;e.dispatchEvent(new w.Event("input",{bubbles:true}));}
async function draft(type,rep,school,qty,number,expectedLines,expectedMaker){
 click("#nextWork");ok(popup,"popup opened");
 await wait(()=>!!popup&&!popup.closed&&popup.document.querySelector(".notice")?.textContent.includes("下書きを読み込みました"),"handoff not loaded: "+type);
 const pd=popup.document;
 ok(!pd.querySelector(".order-page"),"common template only "+type);
 ok([...pd.querySelectorAll("#paper .order-row-no")].every(el=>/^\d+$/.test(el.textContent.trim())&&!el.querySelector("button")),"number cells contain no delete controls "+type);
 ok(pd.getElementById("type").value===type,"type "+type);
 ok(pd.getElementById("rep").value===rep,"rep "+rep);
 ok(pd.getElementById("school").value===school,"school "+school);
 ok(pd.querySelector('#paper [data-col="qty"]')?.value===String(qty)||pd.querySelector('#items [data-col="qty"]')?.value===String(qty),"quantity "+type);
 ok(pd.getElementById(type==="quote"?"quoteNumber":"number").value===number,"document number "+type);
 if(expectedLines){
  const editor=type==="quote"||type==="order"?pd.getElementById("paper"):pd.getElementById("items");
  const lines=Array.from(editor.querySelectorAll('[data-col="sku"]')).filter(e=>e.value).map(e=>({sku:e.value,qty:editor.querySelector('[data-row="'+e.dataset.row+'"][data-col="qty"]').value}));
  ok(JSON.stringify(lines)===JSON.stringify(expectedLines),"exact manufacturer/quantity lines: "+JSON.stringify(lines));
 }
 if(expectedMaker)ok(pd.getElementById("maker").value===expectedMaker,"maker "+expectedMaker);
 await wait(()=>!!$("reopenDoc"),"ack not received "+type);
 popup.close();popup=null;
}
// 見積→返信→注文待ち。帳票を開くだけでは進捗を更新しない。
click('#taskRows [data-case="DEMO-001"]');
await draft("quote","大田","架空・みどり中学校",20,"DEMO-Q-001");
ok($("workPanel").textContent.includes("見積書の準備"),"no automatic stage change");
click("#nextWork");ok($("workPanel").textContent.includes("学校への返信を記録する"),"reply");
click("#nextWork");ok($("workPanel").textContent.includes("学校からの注文を記録する"),"wait for order");
click("#nextWork");ok($("workPanel").textContent.includes("注文内容を確認する"),"order confirmation");
click("#nextWork");
await draft("order","大田","架空・みどり中学校",20,"DEMO-PO-001");
click("#nextWork");ok($("workPanel").textContent.includes("納期確認を記録する"),"eta");
field("eta","2026-12-31");click("#nextWork");
field("shipQty","8");click("#nextWork");
await draft("delivery","大田","架空・みどり中学校",8,"DEMO-D-001-1");
click("#nextWork");ok($("workPanel").textContent.includes("未出荷 12 点"),"partial remaining");
field("shipQty","12");click("#nextWork");
await draft("delivery","大田","架空・みどり中学校",12,"DEMO-D-001-2");
click("#nextWork");ok($("workPanel").textContent.includes("納品確認済み：20 点"),"all delivered");
await draft("invoice","大田","架空・みどり中学校",20,"DEMO-I-001");
click("#nextWork");ok($("workPanel").textContent.includes("この案件は完了"),"completed");
// 藤井：3品目、2メーカーを発注先ごとに分けて処理。
set("rep","藤井");
click('#taskRows [data-case="DEMO-003"]');
ok(d.querySelectorAll('[data-work="maker"]').length===3,"three initial lines");
click("#addProduct");ok(d.querySelectorAll('[data-work="maker"]').length===4,"add fourth");
click('[data-remove-line="3"]');ok(d.querySelectorAll('[data-work="maker"]').length===3,"remove fourth");
click("#nextWork");
ok($("workPanel").textContent.includes("メーカー別の発注書：2社"),"two automatically grouped suppliers");
const a="架空・教材メーカーA",b="架空・教材メーカーB",school="架空・ひかり中学校",who="藤井";
const A1={sku:"DEMO-A01",qty:"10"},A2={sku:"DEMO-A02",qty:"10"},B1={sku:"DEMO-B01",qty:"10"};
await draft("order",who,school,10,"DEMO-PO-003-1",[A1,A2],a);
click("#nextWork");ok($("workPanel").textContent.includes("現在の発注先："+b),"second maker guided");ok($("workPanel").textContent.includes("2品目 ／ 20点 ／ 確認済み"),"first maker confirmed");
await draft("order",who,school,10,"DEMO-PO-003-2",[B1],b);
click("#nextWork");
field("eta","2026-12-30");field("eta1","2026-12-31");click("#nextWork");
field("shipQty","6");field("shipQty1","11");click("#nextWork");ok($("workFeedback").textContent.includes("未出荷数量"),"per-line excess rejected");
field("shipQty1","4");click("#nextWork");
await draft("delivery",who,school,6,"DEMO-D-003-1",[{sku:"DEMO-A01",qty:"6"},{sku:"DEMO-A02",qty:"4"}]);
click("#nextWork");ok($("workPanel").textContent.includes("未出荷 20 点"),"remaining each line");
field("shipQty","4");field("shipQty1","6");field("shipQty2","10");click("#nextWork");
await draft("delivery",who,school,4,"DEMO-D-003-2",[{sku:"DEMO-A01",qty:"4"},{sku:"DEMO-A02",qty:"6"},B1]);
click("#nextWork");ok($("workPanel").textContent.includes("納品確認済み：30 点"),"all products delivered");
await draft("invoice",who,school,10,"DEMO-I-003",[A1,A2,B1]);
click("#nextWork");ok($("workPanel").textContent.includes("この案件は完了"),"multi completed");

// 直接帳票作成→仮保管→再編集→案件へ引き継ぎ
set("rep","大田");
click('[data-workspace="document"]');ok(popup,"manual workspace opens");
await wait(()=>popup.document.getElementById("workspaceSave")&&!popup.document.getElementById("workspaceSave").classList.contains("hidden"),"manual workspace ready");
let pd=popup.document;popup.confirm=()=>true;
function pset(id,v,event="change"){const el=pd.getElementById(id);ok(el,"missing "+id);el.value=v;el.dispatchEvent(new popup.Event(event,{bubbles:true}));}
pset("workspaceSchool","0");pset("workspaceMaker","0");
ok(pd.getElementById("school").value==="架空・みどり中学校","school master");
ok(pd.getElementById("makerCode").value==="DEMO-A","supplier master");
pset("type","quote");pset("quoteNumber","Q-DIRECT-1","input");
function pfield(k,v){const el=pd.querySelector('#paper [data-row="0"][data-col="'+k+'"]');ok(el,"missing document product "+k);el.value=v;el.dispatchEvent(new popup.Event("input",{bubbles:true}));}
pfield("sku","TEST-DIRECT");pfield("name","架空の手動教材");pfield("qty","7");pfield("price","300");
pd.getElementById("workspaceSave").click();
await wait(()=>$("archiveCount").textContent==="1","direct document saved");
popup.close();popup=null;click('[data-open="archive"]');
ok($("archiveRows").textContent.includes("見積書")&&$("archiveRows").textContent.includes("架空・みどり中学校"),"archive listing");
click('[data-archive-open="ARCH-001"]');
await wait(()=>popup?.document.getElementById("quoteNumber")?.value==="Q-DIRECT-1","restore quote number");
pd=popup.document;ok(pd.querySelector('#paper [data-row="0"][data-col="sku"]').value==="TEST-DIRECT","restore product");ok(pd.getElementById("school").value==="架空・みどり中学校","restore school");
popup.close();popup=null;
click('[data-archive-next="ARCH-001"]');
ok($("nextWork").textContent.includes("学校への返信へ")&&$("workPanel").textContent.includes("作り直す必要はありません"),"archived quote reused");
click("#nextWork");ok($("nextWork").textContent.includes("学校への返信を記録する"),"continue from saved quote");
ok($("detailContent").textContent.includes("ARCH-001"),"source document linked");
click('[data-tab="home"]');
// 元OTAを統合した画面。外部CDNなしの手動確認経路で帳票作成・保管・復元を検証。
// OCR認識そのものは実画像を使う別検査が必要。
click('[data-workspace="ocr"]');
await wait(()=>popup?.document.getElementById("schoolMasterBox")&&!popup.document.getElementById("schoolMasterBox").hidden,"ocr workspace ready");
pd=popup.document;popup.confirm=()=>true;pd.getElementById("manualCreateBtn").click();
pset("schoolMasterChoice","0");
pset("teacherName","架空担当者","input");pset("schoolPostal","000-0000","input");
const fields=[...pd.querySelector("#rowsBody tr").querySelectorAll("input,select")];
for(const [i,v] of [[0,"1年"],[1,"美術"],[3,"131801"],[4,"イエロー"],[5,"12"]]){fields[i].value=v;fields[i].dispatchEvent(new popup.Event("input",{bubbles:true}));fields[i].dispatchEvent(new popup.Event("change",{bubbles:true}));}
pd.getElementById("makeBtn").click();
await wait(()=>popup?.document.getElementById("workspaceSave")&&!popup.document.getElementById("workspaceSave").classList.contains("hidden"),"OCR converted to common document");
pd=popup.document;popup.confirm=()=>true;
ok(pd.getElementById("type").value==="order"&&pd.querySelector(".order-form"),"OCR uses the common order template");
ok(!pd.querySelector(".order-page")&&pd.querySelector("#paper .order-row-no").textContent==="1","no old template or row cross");
ok(pd.querySelector('#paper [data-row="0"][data-col="sku"]').value==="131801","OCR transferred SKU");
ok(pd.querySelector('#paper [data-row="0"][data-col="qty"]').value==="12","OCR transferred quantity");
ok(pd.querySelector('#paper [data-row="0"][data-col="note"]').value.includes("美術"),"OCR retained grade/subject");
pd.getElementById("workspaceSave").click();
await wait(()=>$("archiveCount").textContent==="2","ocr order archived");
popup.close();popup=null;click('[data-open="archive"]');
ok($("archiveRows").textContent.includes("発注書（FAX・注文書読取）"),"ocr archived label");
click('[data-archive-open="ARCH-002"]');
await wait(()=>popup?.document.querySelector('#paper [data-row="0"][data-col="sku"]')?.value==="131801","OCR archive restored as common order");
popup.close();popup=null;
click('[data-archive-next="ARCH-002"]');
ok($("workPanel").textContent.includes("注文内容を確認する"),"ocr routed to order check");
ok(d.querySelector('[data-line="0"][data-work="sku"]').value==="131801","ocr item transferred");
ok(d.querySelector('[data-line="0"][data-work="qty"]').value==="12","ocr quantity transferred");
ok(d.querySelector('[data-line="0"][data-work="price"]').value==="","no invented selling price");
ok(d.querySelector('[data-line="0"][data-work="note"]').value.includes("美術"),"grade and class retained");
field("price","100");click("#nextWork");ok($("nextWork").textContent.includes("このメーカーの発注を試作記録する")&&$("workPanel").textContent.includes("作り直す必要はありません"),"source OTA order reused after price confirmation");
click('[data-tab="home"]');set("rep","恩田");ok($("archiveCount").textContent==="0","archive isolation");
set("rep","大田");click('[data-open="archive"]');
let exported=null;
const createUrl=w.URL.createObjectURL,anchorClick=w.HTMLAnchorElement.prototype.click;
w.URL.createObjectURL=function(blob){exported=blob;return createUrl.call(this,blob);};w.HTMLAnchorElement.prototype.click=function(){};
click('[data-archive-download="ARCH-001"]');w.URL.createObjectURL=createUrl;w.HTMLAnchorElement.prototype.click=anchorClick;
ok(exported,"archive export blob");
const json=await exported.text();ok(JSON.parse(json).data.form.quoteNumber==="Q-DIRECT-1","export exact document");
const fresh=document.createElement("iframe");fresh.src="/sales.html";document.body.appendChild(fresh);
await wait(()=>fresh.contentDocument?.getElementById("rep")?.options.length===7,"fresh sales screen");
const fw=fresh.contentWindow,fd=fresh.contentDocument;
ok(fd.getElementById("rep").value===""&&fd.getElementById("salesWorkspace").hidden,"fresh screen requires rep selection");
fd.getElementById("rep").value="大田";fd.getElementById("rep").dispatchEvent(new fw.Event("change",{bubbles:true}));
fd.querySelector('[data-open="archive"]').click();
const dt=new fw.DataTransfer();dt.items.add(new fw.File([json],"archive.json",{type:"application/json"}));const input=fd.getElementById("archiveFile");input.files=dt.files;input.dispatchEvent(new fw.Event("change",{bubbles:true}));
await wait(()=>fd.getElementById("archiveRows").textContent.includes("見積書"),"import exported archive into fresh screen");
fd.getElementById("rep").value="恩田";fd.getElementById("rep").dispatchEvent(new fw.Event("change",{bubbles:true}));fd.querySelector('[data-open="archive"]').click();
ok(fd.getElementById("greeting").textContent.includes("恩田"),"fresh rep switched");
const otherDt=new fw.DataTransfer();otherDt.items.add(new fw.File([json],"archive.json",{type:"application/json"}));input.files=otherDt.files;ok(input.files.length===1,"second import file selected");input.dispatchEvent(new fw.Event("change",{bubbles:true}));
await wait(()=>fd.getElementById("feedback").textContent.trim().length>0,"other rep import response");
ok(fd.getElementById("feedback").textContent.includes("一致しません"),"reject import to another rep: "+fd.getElementById("feedback").textContent);
ok(!fd.getElementById("archiveRows").textContent.includes("見積書"),"no foreign archived data");
fresh.remove();
// 旧6ページ様式の見本で、30件超の読取明細も集計漏れなく共通帳票へ。
click('[data-tab="home"]');click('[data-workspace="ocr"]');
await wait(()=>popup?.document.getElementById("schoolMasterBox")&&!popup.document.getElementById("schoolMasterBox").hidden,"OCR sample ready");
pd=popup.document;popup.confirm=()=>true;pd.getElementById("sampleBtn").click();
const originalRows=[...pd.querySelectorAll("#rowsBody tr")].map(tr=>[...tr.querySelectorAll("input,select")].map(el=>el.value));
ok(originalRows.length>30,"original sample has many rows");
const expected=new Map();
for(const r of originalRows)expected.set(r[3],(expected.get(r[3])||0)+Number(r[5]));
const total=originalRows.reduce((a,r)=>a+Number(r[5]),0);
pd.getElementById("makeBtn").click();
await wait(()=>popup?.document.getElementById("workspaceSave")&&!popup.document.getElementById("workspaceSave").classList.contains("hidden"),"sample converted to standard document");
pd=popup.document;
const converted=[...pd.querySelectorAll("#paper .doc-items tbody tr")].map(tr=>({sku:tr.querySelector('[data-col="sku"]').value,qty:Number(tr.querySelector('[data-col="qty"]').value),note:tr.querySelector('[data-col="note"]').value}));
ok(converted.length===expected.size&&converted.reduce((n,p)=>n+p.qty,0)===total,"sample quantities not lost");
ok(converted.every(p=>expected.get(p.sku)===p.qty),"same SKU totals");
ok(converted.some(p=>p.note.includes("1年")&&p.note.includes("2年")&&p.note.includes("3年")),"grade breakdown retained");
popup.close();popup=null;
out.textContent="PASS: all common documents, archive restore and unified OCR line totals";
})().catch(e=>{document.getElementById("result").textContent="FAIL "+String(e.stack||e);});
`;
const harness='<!doctype html><meta charset="utf-8"><pre id="result">PENDING</pre><iframe id="sales" src="/sales.html" width="1280" height="900"></iframe><script>const f=document.getElementById("sales");f.addEventListener("load",()=>{'+browserTest+'});<\/script>';
const root=path.resolve(".");
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,"http://127.0.0.1").pathname;
 if(pathname==="/test"){res.setHeader("Content-Type","text/html; charset=utf-8");res.end(harness);return;}
 const files={"/sales.html":"sales.html","/index.html":"index.html","/assets/logo.webp":"assets/logo.webp","/ocr.html":"ocr.html"};
 if(!files[pathname]){res.writeHead(404);res.end();return;}
 res.setHeader("Content-Type",pathname.endsWith(".webp")?"image/webp":"text/html; charset=utf-8");if(pathname==="/ocr.html"){res.end(fs.readFileSync(path.join(root,files[pathname]),"utf8").replace(/<script src="https:[^"]+"[^>]*><\/script>/g,""));return;}res.end(fs.readFileSync(path.join(root,files[pathname])));
});
(async()=>{
 try{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  const args=["--headless","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--disable-popup-blocking","--no-first-run","--window-size=1450,1050","--user-data-dir="+path.join(dir,"profile"),"--virtual-time-budget=40000","--dump-dom","http://127.0.0.1:"+port+"/test"];
  const result=await new Promise((resolve,reject)=>{
   let stdout="",stderr="";const p=spawn(chrome,args,{stdio:["ignore","pipe","pipe"]});
   const t=setTimeout(()=>{p.kill("SIGKILL");reject(Error("Chrome timeout"));},50000);
   p.stdout.on("data",x=>stdout+=x);p.stderr.on("data",x=>stderr+=x);
   p.on("error",e=>{clearTimeout(t);reject(e);});p.on("close",code=>{clearTimeout(t);resolve({code,stdout,stderr});});
  });
  assert.equal(result.code,0,result.stderr.slice(-1500));const match=result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);
  assert(match&&match[1].startsWith("PASS:"),match?.[1]||result.stdout.slice(0,1500));console.log(match[1]);
 }finally{server.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

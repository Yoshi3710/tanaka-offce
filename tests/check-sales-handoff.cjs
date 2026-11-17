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
await wait(()=>d.getElementById("greeting")?.textContent.includes("大田"),"sales load");
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
out.textContent="PASS: single and multi manufacturer orders, per-item split delivery and invoice";
})().catch(e=>{document.getElementById("result").textContent="FAIL "+String(e.stack||e);});
`;
const harness='<!doctype html><meta charset="utf-8"><pre id="result">PENDING</pre><iframe id="sales" src="/sales.html" width="1280" height="900"></iframe><script>const f=document.getElementById("sales");f.addEventListener("load",()=>{'+browserTest+'});<\/script>';
const root=path.resolve(".");
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,"http://127.0.0.1").pathname;
 if(pathname==="/test"){res.setHeader("Content-Type","text/html; charset=utf-8");res.end(harness);return;}
 const files={"/sales.html":"sales.html","/index.html":"index.html","/assets/logo.webp":"assets/logo.webp"};
 if(!files[pathname]){res.writeHead(404);res.end();return;}
 res.setHeader("Content-Type",pathname.endsWith(".webp")?"image/webp":"text/html; charset=utf-8");res.end(fs.readFileSync(path.join(root,files[pathname])));
});
(async()=>{
 try{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  const args=["--headless","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--disable-popup-blocking","--no-first-run","--window-size=1450,1050","--user-data-dir="+path.join(dir,"profile"),"--virtual-time-budget=20000","--dump-dom","http://127.0.0.1:"+port+"/test"];
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

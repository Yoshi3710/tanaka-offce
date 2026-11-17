"use strict";
// 実ブラウザ・PC幅／スマホ幅の回帰検査。外部npmパッケージは不要。
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{spawnSync}=require("node:child_process"),{pathToFileURL}=require("node:url"),assert=require("node:assert/strict");
const chrome=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(x=>spawnSync(x,["--version"],{encoding:"utf8"}).status===0);
assert(chrome,"Chrome / Chromium が必要です");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"tanaka-sales-"));
try{
 const app=pathToFileURL(path.resolve("sales.html")).href;
 const test=String.raw`
function checks(w,label){
 const d=w.document,$=id=>d.getElementById(id);w.confirm=()=>true;
 const ok=(v,m)=>{if(!v)throw Error(label+": "+m);};
 const set=(id,v,ev="input")=>{$(id).value=v;$(id).dispatchEvent(new w.Event(ev,{bubbles:true}));};
 const click=sel=>{const b=d.querySelector(sel);ok(b,"missing "+sel);b.click();};
 const visible=id=>!$(id).hidden;
 function width(name){ok(d.documentElement.scrollWidth<=d.documentElement.clientWidth+1,name+" horizontal overflow "+d.documentElement.scrollWidth+"/"+d.documentElement.clientWidth);}
 ok($("greeting").textContent.includes("大田"),"initial rep");width("home");
 ok($("openCount").textContent==="1","own open count");
 ok($("taskRows").textContent.includes("架空・みどり中学校")&&!$("taskRows").textContent.includes("架空・あおぞら中学校"),"scope");
 click('[data-task-filter="late"]');ok($("taskTitle").textContent==="期限超過","task filter");
 click('[data-tab="schools"]');width("schools");ok($("schoolRows").querySelectorAll(".school-card").length===2,"own schools");
 click('[data-school="S1"]');ok(visible("entryView"),"entry route");width("entry");
 ok($("entrySchool").value==="S1"&&$("entryRep").value==="大田","prefill");
 set("entryNote","架空の教材・長文確認"+"長い文章".repeat(35));set("entryQty","12");
 click('[data-tab="schools"]');click('[data-school="S7"]');
 ok($("entrySchool").value==="S1"&&$("entryNote").value.includes("長文確認"),"school draft must not silently change");
 set("rep","恩田","change");ok(visible("homeView"),"rep switch");
 ok($("openCount").textContent==="1"&&$("taskRows").textContent.includes("架空・あおぞら中学校")&&!$("taskRows").textContent.includes("架空・みどり中学校"),"other rep scope");
 click('[data-tab="entry"]');ok($("entryNote").value===""&&$("entrySchool").value==="","other rep draft isolation");
 set("rep","大田","change");click('[data-tab="entry"]');ok($("entryNote").value.includes("長文確認")&&$("entryQty").value==="12","draft restored");
 $("entryForm").requestSubmit();
 ok(visible("homeView")&&$("openCount").textContent==="2","new draft accepted once");width("new draft long text");
 click('[data-tab="cases"]');width("cases");
 set("caseSearch","DEMO-008");ok($("caseRows").querySelectorAll("[data-case]").length===1,"search");
 click('#caseRows [data-case="DEMO-008"]');ok(visible("detailView"),"detail route");width("detail");
 ok($("workPanel").textContent.includes("依頼内容を確認する"),"one clear action");
 click("#nextWork");ok($("workPanel").textContent.includes("見積書を作成する"),"quote routing");width("quote action");
 $("manualDetail").open=true;
 set("detailNote","<img src=x onerror=alert(1)>");
 set("detailStage","完了","change");$("detailForm").requestSubmit();
 ok(!$("detailContent").querySelector("img")&&$("detailContent").textContent.includes("<img src=x onerror=alert(1)>"),"escaped history");
 click('[data-tab="home"]');ok($("openCount").textContent==="1","completion reflected");
 set("rep","藤井","change");click('#taskRows [data-case="DEMO-003"]');ok($("workPanel").textContent.includes("注文内容を確認する"),"order routing");click("#nextWork");ok($("workPanel").textContent.includes("メーカー発注書を作成する"),"manufacturer order action");width("purchase action");
 set("rep","長谷","change");click('#taskRows [data-case="DEMO-004"]');ok($("workPanel").textContent.includes("出荷情報を登録する"),"shipping action");
 const ship=d.querySelector('[data-work="shipQty"]');ship.value="999";ship.dispatchEvent(new w.Event("input",{bubbles:true}));click("#nextWork");ok($("workFeedback").textContent.includes("未出荷数量"),"excess rejected");ship.value="10";ship.dispatchEvent(new w.Event("input",{bubbles:true}));click("#nextWork");ok($("workPanel").textContent.includes("今回の出荷数量：10 点")&&$("workPanel").textContent.includes("納品書を作成する"),"split shipment draft");width("delivery action");
 for(const rep of ["会野","藤井","長谷","恩田","社長"]){set("rep",rep,"change");width(rep);ok($("greeting").textContent.includes(rep),"rep available");}
}
`;
 const run=(width,height)=>{
  const file=path.join(temp,"test-"+width+".html");
  fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><pre id="result">PENDING</pre><script>'+test+
   'const f=document.createElement("iframe");f.width='+width+';f.height='+height+';f.style.border="0";f.onload=()=>{try{checks(f.contentWindow,"'+width+'px");document.getElementById("result").textContent="PASS '+width+'";}catch(e){document.getElementById("result").textContent="FAIL "+String(e.stack||e);}};f.src='+JSON.stringify(app)+';document.body.append(f);<\/script>');
  const p=spawnSync(chrome,["--headless","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--allow-file-access-from-files","--no-first-run","--window-size=1400,1000","--user-data-dir="+path.join(temp,"profile-"+width),"--virtual-time-budget=5000","--dump-dom",pathToFileURL(file).href],{encoding:"utf8",timeout:40000,maxBuffer:4*1024*1024});
  assert.equal(p.status,0,p.error?.message||p.stderr?.slice(-2000));const match=p.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);
  assert(match&&match[1]==="PASS "+width,match?.[1]||p.stdout.slice(0,1000));console.log(match[1]+"px：担当範囲・入力保持・受付・対応履歴・横スクロール");
 };
 run(1280,900);run(390,844);
 console.log("実ブラウザ（Linux Chrome）の幅別検査。実機Windows/スマホ・本番認証・PDF印刷は未検証。");
}finally{fs.rmSync(temp,{recursive:true,force:true});}

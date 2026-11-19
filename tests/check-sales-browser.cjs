"use strict";
// 実ブラウザ・PC幅／スマホ幅の回帰検査。外部npmパッケージは不要。
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{spawnSync}=require("node:child_process"),{pathToFileURL}=require("node:url"),assert=require("node:assert/strict");
const chrome=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(x=>spawnSync(x,["--version"],{encoding:"utf8"}).status===0);
assert(chrome,"Chrome / Chromium が必要です");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"tanaka-sales-"));
try{
 const app=pathToFileURL(path.resolve("sales.html")).href,forms=pathToFileURL(path.resolve("index.html")).href;
 const test=String.raw`
function checks(w,label){
 const d=w.document,$=id=>d.getElementById(id);w.confirm=()=>true;
 const ok=(v,m)=>{if(!v)throw Error(label+": "+m);};
 const set=(id,v,ev="input")=>{$(id).value=v;$(id).dispatchEvent(new w.Event(ev,{bubbles:true}));};
 const click=sel=>{const b=d.querySelector(sel);ok(b,"missing "+sel);b.click();};
 const visible=id=>!$(id).hidden;
 function width(name){ok(d.documentElement.scrollWidth<=d.documentElement.clientWidth+1,name+" horizontal overflow "+d.documentElement.scrollWidth+"/"+d.documentElement.clientWidth);}
 ok($("rep").value===""&&$("rep").options.length===8&&$("rep").options[0].disabled,"initial rep unselected");
 ok(visible("repPrompt")&&$("repPrompt").textContent.includes("担当営業名を選択")&&!visible("salesWorkspace")&&!$("homeView").getBoundingClientRect().width&&$("greeting").textContent==="","selection required");width("initial rep selection");
 click('[data-workspace="document"]');ok(!visible("salesWorkspace"),"no work before selection");
 set("rep","office","change");ok(visible("officeView")&&!visible("salesWorkspace")&&visible("returnToTop"),"office entry only");ok(!$("officeView").querySelector('input[type="password"]')&&$("officeCount").textContent==="7"&&$("officeRows").querySelectorAll("[data-office-case]").length===7,"office shows shared demo cases only");width("office");set("officeRep","恩田","change");ok($("officeRows").querySelectorAll("[data-office-case]").length===1,"office rep filter");click('[data-office-tab="archives"]');ok($("officeResultCount").textContent==="0件","empty archives");click('[data-office-tab="accounting"]');ok($("officeRows").textContent.includes("連携予定"),"accounting placeholder");click('[data-office-tab="inventory"]');ok($("officeRows").textContent.includes("連携予定"),"inventory placeholder");click('[data-office-tab="masters"]');ok($("officeRows").textContent.includes("架空・あおぞら中学校"),"shared master");click('[data-office-tab="cases"]');click('[data-office-case="DEMO-005"]');ok(visible("salesWorkspace")&&visible("detailView")&&$("rep").value==="恩田","office case operation routes to correct owner");
 set("rep","恩田","change");ok(visible("salesWorkspace")&&$("greeting").textContent.includes("恩田")&&!visible("repPrompt")&&$("taskRows").textContent.includes("架空・あおぞら中学校"),"first selection is correct");
 set("rep","大田","change");ok($("greeting").textContent.includes("大田"),"selected rep");width("home");
 const shop=$("schoolShopLink");ok(shop&&shop.getBoundingClientRect().width>0&&shop.getBoundingClientRect().height>0,"school shop link visible");ok(shop.href==="https://yoshi3710.github.io/tanaka-school-shop/"&&shop.target==="_blank"&&shop.rel.includes("noopener"),"school shop opens safely in separate tab");
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
 ok(visible("homeView")&&$("openCount").textContent==="2","new draft accepted once");width("new draft long text");set("rep","office","change");set("officeRep","all","change");ok($("officeCount").textContent==="8"&&$("officeRows").textContent.includes("DEMO-008"),"new sales case immediately shared with office");set("rep","大田","change");
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
 set("rep","藤井","change");click('#taskRows [data-case="DEMO-003"]');ok($("workPanel").textContent.includes("注文内容を確認する"),"order routing");ok(d.querySelectorAll("[data-work=maker]").length===3,"multi-product editor");width("multi-product editor");click("#addProduct");width("added product");click('[data-remove-line="3"]');click("#nextWork");ok($("workPanel").textContent.includes("メーカー発注書を作成する")&&$("workPanel").textContent.includes("メーカー別の発注書：2社"),"manufacturer order action");width("purchase action");
 set("rep","長谷","change");click('#taskRows [data-case="DEMO-004"]');ok($("workPanel").textContent.includes("出荷情報を登録する"),"shipping action");
 const ship=d.querySelector('[data-work="shipQty"]');ship.value="999";ship.dispatchEvent(new w.Event("input",{bubbles:true}));click("#nextWork");ok($("workFeedback").textContent.includes("未出荷数量"),"excess rejected");ship.value="10";ship.dispatchEvent(new w.Event("input",{bubbles:true}));click("#nextWork");ok($("workPanel").textContent.includes("今回の出荷数量：10 点")&&$("workPanel").textContent.includes("納品書を作成する"),"split shipment draft");width("delivery action");
 for(const rep of ["會野","藤井","長谷","恩田","田中壮一"]){set("rep",rep,"change");width(rep);ok($("greeting").textContent.includes(rep),"rep available");}
}
function checkForms(w,label){
 const d=w.document,$=id=>d.getElementById(id);w.confirm=()=>true;
 const ok=(v,m)=>{if(!v)throw Error(label+" forms: "+m);};
 const type=k=>{$("type").value=k;$("type").dispatchEvent(new w.Event("change",{bubbles:true}));};
 const input=(el,val)=>{el.value=val;el.dispatchEvent(new w.Event("input",{bubbles:true}));};
 $("sample").click();
 for(const [k,title] of [["order","発注書"],["quote","見積書"],["delivery","納品書"],["invoice","請求書"]]){
  type(k);
  ok($("formatLabel").textContent===title+"／A4縦",k+" portrait");
  ok($("paper").textContent.replace(/\s/g,"").includes(title),k+" title");
  ok(!$("paper").textContent.includes("[object Object]"),k+" invalid label");
  ok(d.documentElement.scrollWidth<=d.documentElement.clientWidth+1,k+" horizontal overflow "+d.documentElement.scrollWidth+"/"+d.documentElement.clientWidth);
  const cells=[...d.querySelectorAll("#paper .doc-items tbody tr td:first-child")];
  ok(cells.length>=2&&cells.every((el,n)=>el.textContent.trim()===String(n+1)&&!el.querySelector("button")),k+" numbers only");
  if(k==="order"||k==="quote"){
   ok(d.querySelectorAll("#paper .order-row-no").length===5&&$("deleteRowChoice").options.length===6,k+" five rows selectable");
   input(d.querySelector('#paper [data-row="4"][data-col="name"]'),"TEST-BLANK-ROW");
   $("deleteRowChoice").value="4";d.querySelector("[data-remove-order]").click();
   ok(!Array.from(d.querySelectorAll("#paper textarea")).some(el=>el.value==="TEST-BLANK-ROW"),k+" direct entry in preallocated row can be deleted");
   d.querySelector("[data-add-order]").click();ok(d.querySelectorAll("#paper .order-row-no").length===6,k+" add");
   input(d.querySelector('#paper [data-row="5"][data-col="name"]'),"TEST-DELETE");
   $("deleteRowChoice").value="5";d.querySelector("[data-remove-order]").click();
   ok(d.querySelectorAll("#paper .order-row-no").length===5&&!Array.from(d.querySelectorAll("#paper textarea")).some(el=>el.value==="TEST-DELETE"),k+" remove outside number cell");
   ok(d.querySelector('#paper [data-row="0"][data-col="sku"]').value==="A-001",k+" existing row retained");
  }else{
   ok($("paper").textContent.includes("A-001"),k+" preserved SKU");
  }
  const p=$("paper").getBoundingClientRect(),wrap=$("sheetWrap").getBoundingClientRect();
  ok(p.left>=wrap.left-1&&p.right<=wrap.right+1,k+" paper fits viewport");
 }
}
`;
 const run=(width,height)=>{
  const file=path.join(temp,"test-"+width+".html");
  fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><pre id="result">PENDING</pre><script>'+test+
   'const f=document.createElement("iframe");f.width='+width+';f.height='+height+';f.style.border="0";f.onload=()=>{try{checks(f.contentWindow,"'+width+'px");const g=document.createElement("iframe");g.width='+width+';g.height='+height+';g.style.border="0";g.onload=()=>{try{checkForms(g.contentWindow,"'+width+'px");document.getElementById("result").textContent="PASS '+width+'";}catch(e){document.getElementById("result").textContent="FAIL "+String(e.stack||e);}};g.src='+JSON.stringify(forms)+';document.body.append(g);}catch(e){document.getElementById("result").textContent="FAIL "+String(e.stack||e);}};f.src='+JSON.stringify(app)+';document.body.append(f);<\/script>');
  const p=spawnSync(chrome,["--headless","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--allow-file-access-from-files","--no-first-run","--window-size=1400,1000","--user-data-dir="+path.join(temp,"profile-"+width),"--virtual-time-budget=5000","--dump-dom",pathToFileURL(file).href],{encoding:"utf8",timeout:40000,maxBuffer:4*1024*1024});
  assert.equal(p.status,0,p.error?.message||p.stderr?.slice(-2000));const match=p.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);
  assert(match&&match[1]==="PASS "+width,match?.[1]||p.stdout.slice(0,1000));console.log(match[1]+"px：営業画面・全4帳票・明細追加削除・横スクロール");
 };
 run(1280,900);run(390,844);
 console.log("実ブラウザ（Linux Chrome）の幅別検査。実機Windows/スマホ・本番認証・PDF印刷は未検証。");
}finally{fs.rmSync(temp,{recursive:true,force:true});}

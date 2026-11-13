"use strict";
/* タナカ販売サイト：外部ライブラリ不要の回帰テスト。
 * ユーザーが最終決定した仕様との不一致を、コードで判定できる範囲で検出。
 * 実ブラウザの表示・PDF印刷・用紙からのはみ出しは別途目視で確認する。 */
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
function read(file){return fs.readFileSync(file,"utf8");}
const index=read("index.html"),staff=read("staff.html"),spec=read("docs/CURRENT_SPEC.md");
const reps=["大田","会野","藤井","長谷","恩田","社長"];
function scriptFrom(html,name){
 const m=html.match(/<script>([\s\S]*?)<\/script>/);
 assert(m,name+" has inline script");return m[1];
}
function widgetModel(isStaff){
 const elements=new Map(),events=new Map();
 const viewIds=["listView","entryView","masterView"];
 const tabs=viewIds.map(id=>({dataset:{view:id},setAttribute(){},addEventListener(ev,fn){events.set("tab:"+id+":"+ev,fn);}}));
 function el(id){
  if(!elements.has(id))elements.set(id,{id,style:{},className:"",innerHTML:"",textContent:"",value:"",hidden:false,files:[],clientWidth:900,scrollHeight:90,dataset:{},
   classList:{toggle(k,v){this[k]=v;}},querySelectorAll(){return[]},addEventListener(ev,fn){events.set(id+":"+ev,fn);},click(){},reset(){},setAttribute(){}});
  return elements.get(id);
 }
 const generic=new Map(),d={getElementById:el,createElement:el,
  querySelectorAll(sel){
   if(isStaff&&sel===".tabs button")return tabs;
   if(isStaff&&sel===".view")return viewIds.map(el);
   if(!generic.has(sel))generic.set(sel,Array.from({length:2},()=>({classList:{toggle(k,v){this[k]=v;}}})));
   return generic.get(sel);
  }};
 return {el,events,d,generic};
}
const docTypes=["order","quote","delivery","invoice"];
assert(index.includes('var reps='+JSON.stringify(reps)), "帳票担当営業6名の一致");
assert(staff.includes('var reps='+JSON.stringify(reps)), "管理画面担当営業6名の一致");
for(const [k,v] of [["order","発注書"],["quote","見積書"],["delivery","納品書"],["invoice","請求書"]])
 assert(index.includes(k+':"'+v+'"'),"帳票一覧："+v);
assert(!index.includes("太田")&&!staff.includes("太田"),"旧担当名「太田」が残っていない");
assert(index.includes("function rowItem(item,i)"),"明細の配列引数は(item,i)の順序");
assert(!index.includes("[object Object]"),"ソース内に壊れたラベルがない");
assert(spec.includes("DOC-03")&&spec.includes("DOC-12"),"最新仕様台帳が存在");
assert(index.includes(".head,.notice,.editor,.sheet-top{display:none!important}"),"印刷で編集欄は非表示");
assert(!index.includes(".panel,.sheet-panel{display:block!important}"),"印刷の編集欄を再表示するCSSは禁止");
assert(!/fetch\s*\(|XMLHttpRequest|sendBeacon/.test(scriptFrom(index,"index.html")),"帳票に外部送信処理なし");
assert(!/localStorage|sessionStorage/.test(scriptFrom(staff,"staff.html")),"社員試作にブラウザ永続保存なし");
const doc=widgetModel(false);
const state={document:doc.d,window:{addEventListener(){},print(){}},Blob:function(){},FileReader:function(){},
 URL:{createObjectURL(){return"blob:example";},revokeObjectURL(){}},alert(){},confirm(){return true},setTimeout(){}};
vm.runInNewContext(scriptFrom(index,"index.html"),state,{timeout:3500,filename:"index.html"});
function documentType(kind){doc.el("type").value=kind;doc.events.get("type:change").call(doc.el("type"));return doc.el("paper").innerHTML;}
let html=doc.el("paper").innerHTML;
assert(html.includes("発 注 書"),"初期帳票は発注書");
assert.equal((html.match(/class="order-row-no"/g)||[]).length,5,"発注書初期5行");
html=documentType("quote");
for(const label of ["見 積 書","メーカー名（発売元）","見積番号：","見積日：","見積有効期限","お見積金額"])
 assert(html.includes(label),"見積書の必須項目："+label);
assert.equal((html.match(/class="order-row-no"/g)||[]).length,5,"見積書初期5行");
assert(!html.includes("[object Object]"),"見積書の明細ラベルは正常");
assert(doc.el("pageRule").textContent.includes("A4 portrait"),"見積書はA4縦");
const input=(k,value)=>doc.events.get("paper:input")({target:{dataset:{field:k},value,style:{},tagName:"INPUT",scrollHeight:90}});
const row=(i,k,value)=>doc.events.get("paper:input")({target:{dataset:{row:String(i),col:k},value,style:{},tagName:"TEXTAREA",scrollHeight:90}});
input("quoteNumber","Q-TEST-1");input("maker","架空教材メーカー");
row(0,"name","架空教材A");row(0,"qty","5");row(0,"price","350");
assert.equal(doc.el("quoteSubtotal").textContent,"¥ 1,750","小計計算");
assert.equal(doc.el("quoteTax").textContent,"¥ 175","10%消費税計算");
assert.equal(doc.el("quoteGrand").textContent,"¥ 1,925","税込合計計算");
row(0,"qty","abc");assert.equal(doc.el("quoteGrand").textContent,"要確認","不正な数量を拒否");
row(0,"qty","5");
doc.events.get("paper:click")({target:{closest(sel){return sel==="[data-add-order]"?{}:null;}}});
html=doc.el("paper").innerHTML;
assert.equal((html.match(/class="order-row-no"/g)||[]).length,6,"商品行を追加できる");
assert(html.includes('value="Q-TEST-1"'),"追加後も見積番号を維持");
html=documentType("delivery");assert(html.includes("納品書"),"納品書切替");
html=documentType("invoice");assert(html.includes("請求書"),"請求書切替");
html=documentType("order");assert(html.includes("発 注 書"),"発注書復帰");
assert(html.includes('class="order-address-heading order-maker-heading"'),"発注先欄を維持");
assert(html.includes("ご担当者")&&html.includes("住所"),"納品先欄を維持");
assert(!html.includes("所属市町村"),"地域限定の自動住所検索は廃止済み");
const staffUi=widgetModel(true);
for(const [id,value] of Object.entries({repFilter:"all",statusFilter:"all",masterType:"school",masterFilter:"school",caseRep:"大田",masterRep:"大田",caseQuantity:"1"}))
 staffUi.el(id).value=value;
vm.runInNewContext(scriptFrom(staff,"staff.html"),{document:staffUi.d,alert(){},confirm(){return true}},{timeout:3500,filename:"staff.html"});
assert.equal((staffUi.el("caseRows").innerHTML.match(/data-case=/g)||[]).length,3,"架空の案件3件");
assert(staffUi.el("supplierCandidates").innerHTML.includes("架空・教材メーカーA"),"発注先候補");
staffUi.el("repFilter").value="大田";staffUi.events.get("repFilter:input")();
assert.equal((staffUi.el("caseRows").innerHTML.match(/data-case=/g)||[]).length,1,"担当営業で絞り込み");
staffUi.el("caseSchool").value="架空・みどり中学校";staffUi.el("caseNote").value="架空の内容";staffUi.el("caseQuantity").value="10";
staffUi.el("repFilter").value="all";staffUi.events.get("repFilter:input")();
staffUi.events.get("entryForm:submit").call(staffUi.el("entryForm"),{preventDefault(){}});
assert(staffUi.el("caseRows").innerHTML.includes("DEMO-004"),"手動受付の仮登録");
console.log("OK: 仕様・構文・4帳票・5行・見積計算・異常値・追加・切替・社員受付の基本回帰検査");
console.log("未実施: 実ブラウザ／スマホ／PDF印刷／枠内表示／Xserver本番のセキュリティ検査");

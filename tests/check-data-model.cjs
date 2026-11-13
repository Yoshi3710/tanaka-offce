"use strict";
/* 架空データによるフェーズB設計整合性テスト。
 * 本番APIの認証・権限を検証するものではない。 */
const fs=require("node:fs");
const assert=require("node:assert/strict");
const d=JSON.parse(fs.readFileSync("tests/fixtures/workflow-demo.json","utf8"));
assert.equal(d.demo_only,true,"fixture must contain fictional records");
const by=(rows,id)=>rows.find(r=>r.id===id);
const sum=(rows,field="quantity")=>rows.reduce((n,r)=>n+r[field],0);
function canSeeCase(userId,caseId){
 const user=by(d.users,userId),item=by(d.cases,caseId);
 if(!user||!item)return false;
 if(user.role==="hq")return true;
 if(user.role!=="sales"||item.rep_id!==user.id)return false;
 return d.school_assignments.some(x=>x.school_id===item.school_id&&x.user_id===user.id&&x.active===true);
}
// これは権限ポリシー案の検証。実運用のアクセス制御は別途Xserver側に実装が必要。
assert(canSeeCase("u-ota","c-a"));
assert(!canSeeCase("u-ota","c-b"),"大田から恩田の担当案件が見えないモデル");
assert(canSeeCase("u-onda","c-b"));
assert(!canSeeCase("u-onda","c-a"),"恩田から大田の担当案件が見えないモデル");
assert(canSeeCase("u-hq","c-a")&&canSeeCase("u-hq","c-b"),"本部の全案件アクセスモデル");
assert(!canSeeCase("unknown","c-a")&&!canSeeCase("u-ota","unknown"),"未知の利用者・案件は拒否");
for(const task of d.case_tasks){
 assert(by(d.cases,task.case_id),"タスクの案件参照");
 assert(by(d.users,task.assignee_id),"タスクの担当者参照");
 assert(canSeeCase(task.assignee_id,task.case_id),"自分の案件のタスクだけを割当");
}
assert.notEqual(d.quote.number,d.order.number,"見積番号と注文番号は独立");
assert.equal(d.order.quote_id,d.quote.id,"見積から注文への関連付け");
assert.equal(d.quote.case_id,d.order.case_id,"見積と注文が同一案件");
const line=by(d.order_lines,"ol-a"),purchase=d.purchase_order_lines[0];
assert(line&&purchase);
assert.equal(sum(d.class_allocations),line.quantity,"学年組別の合計");
assert.equal(purchase.quantity,line.quantity,"学校の注文明細とメーカー発注数");
assert.equal(purchase.order_line_id,line.id,"メーカー発注明細の紐付け");
assert.equal(sum(d.shipment_lines),purchase.quantity,"二回分の出荷合計");
assert.equal(sum(d.delivery_lines),line.quantity,"分割納品合計");
for(const deliveryLine of d.delivery_lines){
 const links=d.delivery_sources.filter(x=>x.delivery_line_id===deliveryLine.id);
 assert.equal(sum(links),deliveryLine.quantity,"各納品書の出荷元数量と一致");
 for(const link of links)assert(by(d.shipment_lines,link.shipment_line_id),"出荷の参照先");
}
for(const ship of d.shipment_lines)assert.equal(
 sum(d.delivery_sources.filter(x=>x.shipment_line_id===ship.id)),
 ship.quantity,"同じ出荷を納品書に重複割当しない"
);
const invoiceLine=d.invoice_lines[0];
assert.equal(invoiceLine.quantity,line.quantity,"請求書の数量");
assert.equal(sum(d.invoice_sources),invoiceLine.quantity,"請求元の納品数量");
for(const deliveryLine of d.delivery_lines)assert.equal(
 sum(d.invoice_sources.filter(x=>x.delivery_line_id===deliveryLine.id)),
 deliveryLine.quantity,"同じ納品を二重請求しない"
);
const subtotal=invoiceLine.quantity*invoiceLine.sale_unit_yen;
const tax=Math.floor(subtotal*d.invoice.tax_rate_percent/100);
assert.equal(subtotal,14000,"学校向け販売金額");
assert.equal(tax,1400,"消費税");
assert.equal(subtotal+tax,15400,"税込請求額");
assert.equal(purchase.quantity*purchase.purchase_unit_yen,8000,"仕入価格と販売価格は分離");
console.log("OK: 架空データで担当者範囲・見積→注文・二分納・納品・請求・税計算の設計整合性を検証");
console.log("未検証: Xserverの認証・本物のDB・API権限制御・印刷・障害時の動作");

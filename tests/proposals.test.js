/**
 * Regression: mọi đề xuất AI phải hợp lệ khi bấm xử lý, có điều chuyển thật giữa các kho,
 * và phân bố trạng thái đầu kỳ không lệch (có LOW / OK / HIGH).
 * Chạy: node tests/proposals.test.js (cần build.py để có src/js/csv_data.js)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

global.window = { location: {} };
global.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
let lastToast = null;
global.showToast = (m, t) => { lastToast = { m, t }; };
global.renderAllViews = () => {};
global.openTransferCompareModal = () => {};
global.openOverstockModal = () => {};

['csv_data', 'config', 'rng', 'forecast', 'transfers', 'rfq', 'notifications', 'simulation', 'proposals', 'ui/table', 'views/quick']
  .forEach(m => vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../src/js', m + '.js'), 'utf8'), { filename: m }));

const S = vm.runInThisContext('Store');
const SK = vm.runInThisContext('SKUS');
const WH = vm.runInThisContext('WAREHOUSES');
S.history = initSeededHistory();
S.stock = buildInitialStock();
SK.forEach(s => { S.currentWeekDemand[s.code] = {}; WH.forEach(w => { S.currentWeekDemand[s.code][w.code] = 0; }); });
WH.forEach(w => { S.lostSales[w.code] = {}; SK.forEach(s => { S.lostSales[w.code][s.code] = 0; }); });

// 1. Phân bố đầu kỳ
const dist = { LOW: 0, OK: 0, HIGH: 0 };
SK.forEach(s => WH.forEach(w => {
  const st = S.stock[w.code][s.code];
  dist[getStatus(st.on_hand + st.in_transit - st.committed, calcSKUParams(s.code, w.code, S.startDate, S.history))]++;
}));
assert(dist.LOW >= 6 && dist.HIGH >= 6 && dist.OK >= 20, 'Phân bố đầu kỳ lệch: ' + JSON.stringify(dist));
console.log('Test 1: Phân bố đầu kỳ cân bằng', JSON.stringify(dist), '(PASSED)');

// 2. Mỗi đề xuất điều chuyển đều phê duyệt được, kho xuất sau chuyển vẫn > ROP, cước <= 50% biên LN
function checkAll() {
  let n = 0;
  Object.keys(S.proposals).forEach(k => {
    const p = S.proposals[k];
    if (p.type !== 'TRANSFER') return;
    n++;
    const sku = SK.find(s => s.code === p.sku);
    assert(getUnitFreightRate(p.srcWh, p.dstWh, p.sku) <= (sku.price - sku.cogs) * 0.5, `${p.id}: cước/đv vượt 50% biên LN`);
    const snap = JSON.stringify({ s: S.stock, p: S.proposals, t: S.transfers });
    lastToast = null;
    approveProposal(k);
    assert(!(lastToast && lastToast.t === 'error'), `${S.currentDate} ${p.id} ${p.sku} ${p.srcWh}->${p.dstWh} không hợp lệ: ${lastToast && lastToast.m}`);
    const dst = S.stock[p.dstWh][p.sku];
    const dstP = calcSKUParams(p.sku, p.dstWh, S.currentDate, S.history);
    const dstEff = dst.on_hand + dst.in_transit - dst.committed + getPendingInboundQty(p.dstWh, p.sku);
    assert(dstEff <= getSafeTarget(dstP) && (dstEff < dstP.qmax || getSafeTarget(dstP) >= dstP.qmax), `${p.id}: kho nhận bị bơm quá mức an toàn (${dstEff} > ${getSafeTarget(dstP)}, MAX ${dstP.qmax})`);
    const src = S.stock[p.srcWh][p.sku];
    const srcP = calcSKUParams(p.sku, p.srcWh, S.currentDate, S.history);
    assert(src.on_hand >= 0 && (src.on_hand + src.in_transit - src.committed) > srcP.rop, `${p.id}: kho xuất rơi dưới ROP`);
    const r = JSON.parse(snap); S.stock = r.s; S.proposals = r.p; S.transfers = r.t;
  });
  return n;
}
scanAndGenerateProposals(S.startDate);
const day0Transfers = checkAll();
const day0Rfq = Object.values(S.proposals).filter(p => p.type === 'RFQ').length;
assert(day0Transfers > day0Rfq, `Ngày 0 vẫn lệch về RFQ (${day0Transfers} điều chuyển vs ${day0Rfq} RFQ)`);
console.log(`Test 2: Ngày 0 có ${day0Transfers} điều chuyển hợp lệ, ${day0Rfq} RFQ (PASSED)`);

// in_transit của mỗi ô phải khớp đúng tổng các lô (chuyển kho + NCC) đang về / đã đến chờ nhận
function checkInTransitLedger() {
  SK.forEach(s => WH.forEach(w => {
    const open = S.transfers.filter(t => t.sku === s.code && t.dstWh === w.code && (t.status === 'Đang chuyển' || t.status === 'Đã đến kho'))
      .reduce((a, t) => a + t.qty, 0);
    assert.strictEqual(S.stock[w.code][s.code].in_transit, open, `${S.currentDate} ${s.code}@${w.code}: in_transit lệch chứng từ`);
  }));
}
checkInTransitLedger();
let total = day0Transfers;
// Mô phỏng kho bấm "Nhận hàng" cho mọi lô đã đến (không có tự nhập kho)
function receiveArrived() {
  S.transfers.filter(t => t.status === 'Đã đến kho').forEach(t => applyShipmentReceipt(t, 'manual'));
  scanAndGenerateProposals(S.currentDate);
}
for (let i = 0; i < 83; i++) {
  advanceOneDay();
  if (i === 40) {
    // Lô không ai bấm nhận phải giữ nguyên trạng thái chờ, không tự cộng tồn
    const waiting = S.transfers.filter(t => t.status === 'Đã đến kho');
    assert(waiting.length > 0, 'Không có lô nào đã đến để kiểm tra');
    const w0 = waiting[0], oh0 = S.stock[w0.dstWh][w0.sku].on_hand + 0;
    for (let k = 0; k < 3; k++) { advanceOneDay(); i++; }
    assert(w0.status === 'Đã đến kho', 'Lô đã đến bị tự nhập kho');
    assert(getReceiveTiming(w0, S.currentDate).code === 'LATE', 'Lô quá hạn phải hiện nhận trễ');
    console.log(`Test 3b: ${w0.id} chờ 3 ngày vẫn chưa nhập kho (tồn ${oh0} -> ${S.stock[w0.dstWh][w0.sku].on_hand} chỉ do bán hàng) (PASSED)`);
  }
  receiveArrived();
  total += checkAll(); checkInTransitLedger();
}
assert(total > 0);
console.log(`Test 3: 84 ngày, ${total} lượt đề xuất điều chuyển đều phê duyệt hợp lệ (PASSED)`);

// 4. Không còn kho thiếu nào có phương án điều chuyển tốt hơn mà AI lại đề xuất RFQ
Object.values(S.proposals).filter(p => p.type === 'RFQ').forEach(p => {
  const ev = evaluateReplenishmentOptions(p.sku, p.wh, S.currentDate);
  assert(ev.best.type === 'RFQ', `${p.id}: có kho dư hợp lệ nhưng vẫn đề xuất RFQ`);
});
console.log('Test 4: Đề xuất RFQ chỉ xuất hiện khi không có kho dư điều chuyển hợp lệ (PASSED)');

// 5. Hàng NCC đi chung sổ lệnh chuyển; bấm "Nhận hàng" thì nhập kho + quét lại đề xuất
const supRecs = S.transfers.filter(t => t.kind === 'SUPPLIER');
assert(supRecs.length > 0 && supRecs.every(t => t.id.startsWith('NK-')), 'Thiếu chứng từ hàng NCC đang về');
const open = S.transfers.find(t => t.status === 'Đang chuyển' || t.status === 'Đã đến kho');
assert(open, 'Không có lô nào đang về để thử Nhận hàng');
const before = S.stock[open.dstWh][open.sku].on_hand;
let rescanned = false;
const origScan = scanAndGenerateProposals;
scanAndGenerateProposals = d => { rescanned = true; return origScan(d); };
receiveShipment(open.id);
scanAndGenerateProposals = origScan;
assert(open.status === 'Đã nhận' && S.stock[open.dstWh][open.sku].on_hand === before + open.qty, 'Nhận hàng không cộng tồn');
assert(rescanned, 'Sau khi nhận hàng không quét lại đề xuất');
checkInTransitLedger();
console.log(`Test 5: ${supRecs.length} chứng từ hàng NCC, Nhận hàng ${open.id} cập nhật tồn + đề xuất (PASSED)`);

// 6. Giao sớm / đúng hạn / trễ
const ex = { arrivalDate: S.currentDate };
assert.strictEqual(getReceiveTiming(ex, addDays(S.currentDate, -2)).code, 'EARLY');
assert.strictEqual(getReceiveTiming(ex, S.currentDate).code, 'ONTIME');
assert.strictEqual(getReceiveTiming(ex, addDays(S.currentDate, 5)).label, 'Nhận trễ 5 ngày');
console.log('Test 6: Nhận sớm / đúng hạn / nhận trễ không giới hạn (PASSED)');

// 7. Thông báo dẫn về đúng giao diện + dòng đã thay đổi
const nTr = S.notifications.find(n => S.transfers.some(t => t.id === n.refId));
assert.strictEqual(resolveNotificationTarget(nTr).tab, 'transfers');
assert.strictEqual(resolveNotificationTarget({ type: 'ALERT_LOW', refId: 'DN_CITY-TLM-045' }).ref, 'TLM-045');
assert.strictEqual(resolveNotificationTarget({ type: 'ALERT_LOW', refId: 'DN_CITY-TLM-045' }).wh, 'DN_CITY');
console.log('Test 7: Thông báo điều hướng tới tab/kho/dòng liên quan (PASSED)');

// 8. Phiếu nhập/xuất nhanh ghi nơi nhập / nơi xuất và đồng bộ chứng từ
const fail = executeStockMovement({ wh: 'HCM', sku: 'TLM-045', type: 'OUT_SALE', party: 'Khách lẻ', qty: 1e9 });
assert(!fail.ok, 'Xuất quá tồn phải bị chặn');
const ohA = S.stock.HCM['PPR-025'].on_hand;
const inRes = executeStockMovement({ wh: 'HCM', sku: 'PPR-025', type: 'IN_SUPPLIER', party: 'SUP-LOTUS', qty: 20 });
assert(inRes.ok && S.stock.HCM['PPR-025'].on_hand === ohA + 20, 'Nhập NCC không cộng tồn');
assert(S.transfers.find(t => t.id === inRes.refId).status === 'Đã nhận', 'Nhập NCC phải có chứng từ NK đã nhận');
const saleRes = executeStockMovement({ wh: 'HCM', sku: 'PPR-025', type: 'OUT_SALE', party: 'Khách lẻ', qty: 5 });
assert(saleRes.ok && S.stock.HCM['PPR-025'].on_hand === ohA + 15, 'Xuất bán không trừ tồn');
assert.strictEqual(resolveNotificationTarget(S.notifications[0]).tab, 'movement');
checkInTransitLedger();
console.log(`Test 8: Phiếu ${inRes.id} (nhập NCC) và ${saleRes.id} (xuất bán) đồng bộ tồn + chứng từ (PASSED)`);
console.log('\nALL PROPOSAL TESTS PASSED (8/8)!');

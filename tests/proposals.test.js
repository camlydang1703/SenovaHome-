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

['csv_data', 'config', 'rng', 'forecast', 'transfers', 'rfq', 'notifications', 'simulation', 'proposals']
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
    assert(p.freightCost <= (sku.price - sku.cogs) * p.qty * 0.5, `${p.id}: cước vượt 50% biên LN`);
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
for (let i = 0; i < 83; i++) { advanceOneDay(); total += checkAll(); checkInTransitLedger(); }
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
console.log('\nALL PROPOSAL TESTS PASSED (5/5)!');

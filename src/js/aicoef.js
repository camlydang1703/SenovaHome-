// ============================================================================
// P6: AI "HỆ SỐ CẦU" — mô hình đọc bằng chứng và giải thích, engine giữ quyền tính số
// Module không dùng DOM (chạy được trong test tự động); chỉ 2 hàm fetch chạm network.
// ============================================================================

// AI chỉ được lệch tối đa ±0.10 so với hệ số bù sai số tất định, và luôn trong guardrail
const AI_COEF_NUDGE = 0.10;

function getAiCoefState() {
  if (!Store.aiCoefs) {
    Store.aiCoefs = { gen: 0, items: {}, provider: null, status: 'Chưa gọi AI', proposals: [], server: null };
  }
  return Store.aiCoefs;
}

function getAiCoefGeneration() {
  return getAiCoefState().gen || 0;
}

function getAiDemandCoef(skuCode) {
  const it = getAiCoefState().items[skuCode];
  return it ? it.coef : 1.0;
}

function clampAiCoef(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return 1.0;
  return Math.min(PARAMS.aiCoefMax, Math.max(PARAMS.aiCoefMin, Math.round(n * 100) / 100));
}

// Tham chiếu ROP/MAX khi chưa có hệ số AI (coef = 1.0) — dùng cho cột "trước"
function getBaselineParams(skuCode, whCode, curDate) {
  return calcSKUParams(skuCode, whCode, curDate || Store.currentDate, Store.history, 1.0);
}

// ----------------------------------------------------------------------------
// P6b: NHÌN TRƯỚC SÓNG CẦU — engine chỉ nhân eventMult của sự kiện ĐANG chạy,
// còn ROP chỉ cover tới ngày hàng về. Một sóng bắt đầu SAU ngày hàng về (trong
// tầm lead + HORIZON) là thông tin engine chưa thấy, AI lấy nó làm tín hiệu.
// Hệ số = phần cầu tăng thêm tính theo DIỆN TÍCH sóng phủ lên cửa sổ dự báo
// (lead + HORIZON ngày): sóng ngắn chỉ nâng nhẹ, sóng dài và mạnh mới nâng nhiều.
// ----------------------------------------------------------------------------
const AI_LOOKAHEAD_HORIZON = 14;

function dayDiff(fromDate, toDate) {
  return Math.round((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86400000);
}

function waveLabel(title) {
  const t = String(title || '').split(':')[0].trim();
  return t.length > 32 ? t.slice(0, 31) + '…' : t;
}

function dayShort(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
}

function getEventLookahead(skuCode, whCode, curDate, leadDays) {
  const sku = SKUS.find(s => s.code === skuCode) || {};
  const windowDays = leadDays + AI_LOOKAHEAD_HORIZON;
  const winEnd = addDays(curDate, windowDays);
  let extraUnits = 0;
  const waves = [];
  (typeof EVENTS !== 'undefined' ? EVENTS : []).forEach(ev => {
    if (!ev.demand_mult || ev.demand_mult <= 1.0) return;
    // Sóng đã bắt đầu: engine đang nhân eventMult, không tính trùng lần hai
    if (ev.start <= curDate || ev.start > winEnd) return;
    if (typeof isEventMatchingWarehouse === 'function' && !isEventMatchingWarehouse(ev.scope_wh, whCode)) return;
    if (typeof isEventMatchingTarget === 'function' && !isEventMatchingTarget(ev.scope_target, skuCode, sku.cat || sku.category, sku.sup)) return;
    const daysOut = dayDiff(curDate, ev.start);
    const overlapDays = Math.min(dayDiff(curDate, ev.end), windowDays) - daysOut + 1;
    if (overlapDays <= 0) return;
    extraUnits += (ev.demand_mult - 1) * overlapDays;
    waves.push({
      label: waveLabel(ev.title), title: ev.title, start: ev.start,
      mult: ev.demand_mult, daysOut: daysOut, overlapDays: overlapDays
    });
  });
  return { factor: Math.min(PARAMS.aiCoefMax, 1 + extraUnits / windowDays), waves: waves, winEnd: winEnd };
}

// Gộp nhìn trước cho toàn mạng lưới: hệ số chỉ tăng theo tỷ lệ kho bị ảnh hưởng
function getNetworkLookahead(skuCode, curDate, leadDaysByWh) {
  let maxFactor = 1.0, hitWh = 0;
  const agg = {};
  WAREHOUSES.forEach(wh => {
    const leadDays = leadDaysByWh[wh.code] || 14;
    const la = getEventLookahead(skuCode, wh.code, curDate, leadDays);
    if (la.factor > 1.01) {
      hitWh++;
      if (la.factor > maxFactor) maxFactor = la.factor;
    }
    la.waves.forEach(w => {
      const key = `${w.label}|${w.mult}|${w.start}`;
      if (!agg[key]) agg[key] = { label: w.label, mult: w.mult, start: w.start, nWh: 0, ov: 0, win: 0 };
      const a = agg[key];
      a.nWh++;
      if (w.overlapDays > a.ov) { a.ov = w.overlapDays; a.win = leadDays + AI_LOOKAHEAD_HORIZON; }
    });
  });
  const list = Object.keys(agg).map(k => agg[k]).sort((a, b) =>
    (b.mult - 1) * b.ov * b.nWh - (a.mult - 1) * a.ov * a.nWh);
  const fmt = w => `${w.label} (${dayShort(w.start)}, ×${w.mult.toFixed(2)})`;
  const top = list.length ? list[0] : null;
  return {
    factor: 1 + (maxFactor - 1) * (hitWh / WAREHOUSES.length),
    hitWh: hitWh,
    waves: list,
    waveCount: list.length,
    topWave: top ? fmt(top) : '',
    // Chỉ nêu 2 sự kiện mạnh nhất; phần còn lại gom thành số đếm cho gọn dòng
    upcoming: list.slice(0, 2).map(fmt),
    upcomingMore: Math.max(0, list.length - 2)
  };
}

// ----------------------------------------------------------------------------
// BẰNG CHỨNG (tất định): sai số dự báo cầu, sự kiện đang chạy, ô dưới MIN
// Lead time NCC KHÔNG nằm ở đây vì đã được cộng vào ROP qua leadDays.
// ----------------------------------------------------------------------------
function getDemandEvidence(skuCode, curDate) {
  const sku = SKUS.find(s => s.code === skuCode) || {};
  const hist = Store.history[skuCode] || {};
  let actual = 0, expected = 0, weeks = 0;
  Object.keys(hist).forEach(whCode => {
    const w = hist[whCode] || [];
    for (let i = Math.max(4, w.length - 4); i < w.length; i++) {
      const prev4 = (w[i - 4].deseason + w[i - 3].deseason + w[i - 2].deseason + w[i - 1].deseason) / 4;
      expected += prev4 * w[i].sm;
      actual += w[i].demand;
      weeks++;
    }
  });
  const bias = expected > 0 ? actual / expected : 1.0;

  let lowCells = 0;
  const leadDaysByWh = {};
  const eventMap = {};
  WAREHOUSES.forEach(wh => {
    const base = getBaselineParams(skuCode, wh.code, curDate);
    leadDaysByWh[wh.code] = base.leadDays;
    const st = Store.stock[wh.code][skuCode];
    const eff = st.on_hand + st.in_transit - st.committed
      + ((typeof getPendingProposalReserve === 'function') ? getPendingProposalReserve(skuCode, wh.code) : 0);
    if (getStatus(eff, base) === 'LOW') lowCells++;
    if (typeof getCellEventImpact === 'function') {
      const imp = getCellEventImpact(skuCode, wh.code, curDate);
      (imp.events || []).forEach(ev => {
        if (ev.demand_mult && ev.demand_mult !== 1.0) {
          const lb = waveLabel(ev.title);
          eventMap[lb] = Math.max(eventMap[lb] || 1.0, ev.demand_mult);
        }
      });
    }
  });

  const supCodes = (typeof getRfqTargetSuppliers === 'function') ? getRfqTargetSuppliers(skuCode) : (sku.sup ? [sku.sup] : []);
  const supNames = supCodes.map(c => (SUPPLIERS[c] && SUPPLIERS[c].name) || c);

  const look = getNetworkLookahead(skuCode, curDate, leadDaysByWh);

  return {
    sku: skuCode,
    name: sku.name || skuCode,
    cat: sku.cat || '',
    weeks: weeks,
    windowFrom: addDays(curDate, -28),
    windowTo: curDate,
    actual: Math.round(actual),
    expected: Math.round(expected),
    bias: Math.round(bias * 100) / 100,
    biasCoef: clampAiCoef(bias),
    lookAhead: Math.round(look.factor * 100) / 100,
    lookAheadWh: look.hitWh,
    upcoming: look.upcoming,
    upcomingMore: look.upcomingMore,
    waveCount: look.waveCount,
    topWave: look.topWave,
    floorCoef: clampAiCoef(clampAiCoef(bias) * look.factor),
    lowCells: lowCells,
    whCount: WAREHOUSES.length,
    events: Object.keys(eventMap).slice(0, 2).map(t => `${t} ×${Math.round(eventMap[t] * 100) / 100}`),
    eventCount: Object.keys(eventMap).length,
    suppliers: supNames
  };
}

function buildAiCoefBrief(curDate) {
  return {
    date: curDate || Store.currentDate,
    guard: { min: PARAMS.aiCoefMin, max: PARAMS.aiCoefMax, maxNudge: AI_COEF_NUDGE },
    note: 'lead_days đã nằm trong ROP; hable so sinh chi duoc dieu chinh cau',
    items: SKUS.map(s => getDemandEvidence(s.code, curDate))
  };
}

// Diễn giải 1 câu, nêu đúng sự kiện quyết định (số liệu đầy đủ đã ở cột "Tín hiệu")
function offlineReason(e) {
  const dir = e.bias >= 1.05 ? 'bán nhanh hơn dự báo'
    : (e.bias <= 0.95 ? 'bán chậm hơn dự báo' : 'bán đúng như dự báo');
  const coefTxt = (e.floorCoef > 1 ? 'nâng cầu lên ×' : 'giữ cầu ×') + e.floorCoef.toFixed(2);
  if (e.topWave) {
    const more = e.waveCount > 1 ? ` và ${e.waveCount - 1} sự kiện khác` : '';
    return `${e.topWave}${more} sẽ bùng phát sau khi hàng về → ${coefTxt}.`;
  }
  return `Sản phẩm ${dir}, chưa có sự kiện mới trước khi hàng về → ${coefTxt}.`;
}

// ----------------------------------------------------------------------------
// KIỂM TRA PHẢN HỒI CỦA MÔ HÌNH — số nào lệch sàn quá ±0.10 hoặc ngoài guardrail
// đều bị kéo về sàn; SKU lạ bị loại. Không có phản hồi hợp lệ = dùng offline.
// ----------------------------------------------------------------------------
function validateAiCoefResponse(raw, brief) {
  const out = [];
  const bySku = {};
  brief.items.forEach(e => { bySku[e.sku] = e; });
  const list = (raw && raw.items) || [];
  list.forEach(it => {
    const e = it && bySku[it.sku];
    if (!e) return;
    const lo = clampAiCoef(Math.max(PARAMS.aiCoefMin, e.floorCoef - AI_COEF_NUDGE));
    const hi = clampAiCoef(Math.min(PARAMS.aiCoefMax, e.floorCoef + AI_COEF_NUDGE));
    let coef = Number(it.coef);
    let source = 'AI';
    if (!isFinite(coef) || coef < lo - 1e-9 || coef > hi + 1e-9) {
      coef = e.floorCoef;
      source = 'OFFLINE';
    } else {
      coef = clampAiCoef(coef);
    }
    const text = String(it.reason || '').slice(0, 180).trim();
    out.push({
      sku: e.sku,
      coef: coef,
      floorCoef: e.floorCoef,
      reason: text || offlineReason(e),
      source: source
    });
  });
  const seen = {};
  out.forEach(o => { seen[o.sku] = 1; });
  brief.items.forEach(e => {
    if (!seen[e.sku]) out.push({ sku: e.sku, coef: e.floorCoef, floorCoef: e.floorCoef, reason: offlineReason(e), source: 'OFFLINE' });
  });
  return out;
}

function applyAiCoefProposals(items, provider) {
  const st = getAiCoefState();
  const known = {};
  SKUS.forEach(s => { known[s.code] = 1; });
  let applied = 0, skipped = 0;
  (items || []).forEach(it => {
    if (!it || !known[it.sku] || !isFinite(Number(it.coef)) || Number(it.coef) <= 0) { skipped++; return; }
    const coef = clampAiCoef(it.coef);
    st.items[it.sku] = {
      coef: coef,
      floorCoef: clampAiCoef(it.floorCoef !== undefined ? it.floorCoef : getDemandEvidence(it.sku, Store.currentDate).floorCoef),
      reason: String(it.reason || '').slice(0, 400),
      source: it.source || provider || 'OFFLINE'
    };
    applied++;
  });
  st.gen = (st.gen || 0) + 1;
  st.provider = provider || st.provider;
  st.status = applied > 0 ? `Đang áp dụng ${applied} hệ số` : 'Chưa áp dụng hệ số nào';
  if (typeof refreshAfterStockChange === 'function') refreshAfterStockChange();
  return { applied: applied, skipped: skipped, gen: st.gen };
}

function resetAiCoefs() {
  const st = getAiCoefState();
  st.items = {};
  st.gen = (st.gen || 0) + 1;
  st.status = 'Đã hoàn tác về hệ số gốc (×1.00)';
  if (typeof refreshAfterStockChange === 'function') refreshAfterStockChange();
  return st.gen;
}

// Tổng ảnh hưởng lên ngưỡng của một kho: ROP/MAX và vốn ứ đọng theo COGS.
// coefList = [{ sku, coef }] — cho phép chiếu thử kiến nghị CHƯA áp dụng.
function summarizeAiCoefEffect(whCode, coefList, curDate) {
  const date = curDate || Store.currentDate;
  const list = (coefList && coefList.length) ? coefList
    : Object.keys(getAiCoefState().items).map(k => ({ sku: k, coef: getAiCoefState().items[k].coef }));
  let ropBefore = 0, ropAfter = 0, capBefore = 0, capAfter = 0;
  list.forEach(entry => {
    const code = entry.sku;
    const sku = SKUS.find(s => s.code === code);
    if (!sku || !Store.stock[whCode] || !Store.stock[whCode][code]) return;
    const before = getBaselineParams(code, whCode, date);
    const after = calcSKUParams(code, whCode, date, Store.history, clampAiCoef(entry.coef));
    ropBefore += before.rop; ropAfter += after.rop;
    capBefore += before.qmax * sku.cogs; capAfter += after.qmax * sku.cogs;
  });
  return { ropBefore, ropAfter, capBefore, capAfter, capDelta: capAfter - capBefore };
}

// ----------------------------------------------------------------------------
// NETWORK: chỉ lấy diễn giải từ mô hình; không có key / lỗi -> fallback tất định
// ----------------------------------------------------------------------------
function refreshAiCoefServerStatus() {
  const st = getAiCoefState();
  if (typeof fetch !== 'function') return Promise.resolve(null);
  return fetch('/api/health')
    .then(r => r.json())
    .then(j => {
      st.server = (j && j.aiCoef) || null;
      if (typeof renderAiCoefPanel === 'function') renderAiCoefPanel();
      return st.server;
    })
    .catch(() => { st.server = null; return null; });
}

function requestAiCoefProposals(curDate) {
  const st = getAiCoefState();
  const brief = buildAiCoefBrief(curDate);
  const fallback = () => {
    st.proposals = validateAiCoefResponse(null, brief).map(o => ({ ...o, source: 'OFFLINE' }));
    st.status = 'Đã có kiến nghị — hệ thống tự diễn giải';
    st.provider = 'OFFLINE';
    if (typeof renderAiCoefPanel === 'function') renderAiCoefPanel();
    return st.proposals;
  };
  if (typeof fetch !== 'function') { fallback(); return Promise.resolve(st.proposals); }
  st.status = 'Đang lấy kiến nghị...';
  if (typeof renderAiCoefPanel === 'function') renderAiCoefPanel();
  return fetch('/api/ai_coef', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(brief)
  })
    .then(r => r.json())
    .then(j => {
      if (!j || !j.ok) throw new Error((j && j.error) || 'ai_coef failed');
      st.provider = j.provider || 'AI';
      const list = validateAiCoefResponse(j, brief);
      // Server trả bằng công thức tất định (không có key) thì không được gắn nhãn "AI kiến nghị"
      if (String(st.provider).indexOf('OFFLINE') === 0) list.forEach(p => { p.source = 'OFFLINE'; });
      st.proposals = list;
      const aiN = st.proposals.filter(p => p.source === 'AI').length;
      st.status = aiN > 0 ? `${aiN}/${st.proposals.length} hệ số có giải thích từ AI`
        : `${st.proposals.length} hệ số đã chốt`;
      if (typeof renderAiCoefPanel === 'function') renderAiCoefPanel();
      return st.proposals;
    })
    .catch(err => {
      st.lastError = String((err && err.message) || err);
      console.warn('ai_coef loi:', st.lastError);
      fallback();
      return st.proposals;
    });
}

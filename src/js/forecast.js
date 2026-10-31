// ============================================================================
// FORECASTING, PARAMETERS CALCULATION & INVENTORY STATUS EVALUATOR
// ============================================================================

    function addDays(dateStr, days) {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    }

    function diffDays(d1, d2) {
      const t1 = new Date(d1).getTime();
      const t2 = new Date(d2).getTime();
      return Math.round((t2 - t1) / (1000 * 3600 * 24));
    }

    function getMonthFromDate(dateStr) {
      return parseInt(dateStr.split('-')[1], 10);
    }

    
function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return Math.round(n).toLocaleString('vi-VN');
}

function fmtVND(n) {
  if (n === null || n === undefined || isNaN(n)) return '0 đ';
  return Math.round(n).toLocaleString('vi-VN') + ' đ';
}

function fmtDateVN(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function getDOW(dateStr) {
  return new Date(dateStr).getUTCDay();
}

function fmt(n) {
      if (n == null || isNaN(n)) return '0';
      return Math.round(n).toLocaleString('vi-VN');
    }

    function padSeq(prefix, num) {
      return prefix + '-' + String(num).padStart(4, '0');
    }

    // COMMON STATUS EVALUATOR (YÊU CẦU 0.5)
    function getStatus(eff, params) {
      if (eff <= params.rop) return 'LOW';    // Dưới MIN
      if (eff > params.qmax) return 'HIGH';   // Vượt MAX
      return 'OK';                             // Bình thường
    }

    // SEEDED HISTORY GENERATION (12 WEEKS BEFORE 01/08/2026)
    function initSeededHistory() {
      const rng = makeRNG(20260801);
      Store.history = {};

      SKUS.forEach(sku => {
        Store.history[sku.code] = {};
        WAREHOUSES.forEach(wh => {
          const whBase = sku.base * wh.w;
          const weeks = [];
          for (let w = 0; w < 12; w++) {
            const m = w < 4 ? 5 : (w < 8 ? 6 : 7);
            const sm = SI[m];
            const noise = 1.0 + (rng() * 0.24 - 0.12);
            const demand = Math.max(0.1, whBase * sm * noise);
            weeks.push({ // Yêu cầu 0.6: đổi weeks.append thành weeks.push
              demand: demand,
              sm: sm,
              deseason: demand / sm
            });
          }
          Store.history[sku.code][wh.code] = weeks;
        });
      });
    }

    // PARAMETER CALCULATION PER SKU x WAREHOUSE (YÊU CẦU 0.4, 0.7)
    function calcSKUParams(skuCode, whCode, dateStr) {
      const sku = SKUS.find(s => s.code === skuCode);
      const wh = WAREHOUSES.find(w => w.code === whCode);
      const weeks = Store.history[skuCode][whCode];

      // D_SMA4 = Average of last 4 weeks of DESEASONALIZED demand
      const last4 = weeks.slice(-4);
      const d_sma4 = last4.reduce((sum, w) => sum + w.deseason, 0) / 4.0;

      // Current Month and Seasonal Index Sm
      const curMonth = getMonthFromDate(dateStr);
      const sm = SI[curMonth] || 1.0;
      const f_next = d_sma4 * sm;

      // Lead time: CỘNG DỒN tất cả delay sự kiện, KHÔNG lấy max (Yêu cầu 0.4)
      let totalEventDelay = 0;
      EVENTS.forEach(ev => {
        if (dateStr >= ev.start && dateStr <= ev.end) {
          const res = ev.applyEvent(skuCode, whCode);
          if (res && res.delayAdd) totalEventDelay += res.delayAdd;
        }
      });

      const L = (sku.lead + (sku.delay || 0) + totalEventDelay) / 7.0;
      const d_lead = f_next * L;

      // Sigma error: Lấy 8 tuần CUỐI của history (Yêu cầu 0.7)
      const errors = [];
      const n = weeks.length;
      const startIdx = Math.max(4, n - 8);
      for (let i = startIdx; i < n; i++) {
        const prev4Deseason = (weeks[i-4].deseason + weeks[i-3].deseason + weeks[i-2].deseason + weeks[i-1].deseason) / 4.0;
        const forecast = prev4Deseason * weeks[i].sm;
        errors.push(weeks[i].demand - forecast);
      }
      const meanErr = errors.reduce((a, b) => a + b, 0) / errors.length;
      const variance = errors.reduce((sum, e) => sum + Math.pow(e - meanErr, 2), 0) / errors.length;
      const rawSigma = Math.sqrt(variance);
      const sigma_error = Math.max(rawSigma, 0.08 * f_next);

      // Safety stock SS = 1.65 * sigma_error * sqrt(L)
      const ss = PARAMS.z * sigma_error * Math.sqrt(L);

      // ROP = ceil(D_lead + SS) | Qmax = ceil(ROP + F_next)
      const rop = Math.ceil(d_lead + ss);
      const qmax = Math.ceil(rop + f_next);

      return {
        d_sma4: Math.round(d_sma4 * 10) / 10,
        sm: sm,
        f_next: Math.round(f_next * 10) / 10,
        L: Math.round(L * 100) / 100,
        d_lead: Math.round(d_lead * 10) / 10,
        sigma_error: Math.round(sigma_error * 10) / 10,
        ss: Math.round(ss * 10) / 10,
        rop: rop,
        qmax: qmax,
        totalEventDelay: totalEventDelay
      };
    }

    // INITIAL STOCK ON 2026-08-01 (YÊU CẦU 4.2)
    function buildInitialStock() {
      const stock = {};
      WAREHOUSES.forEach(wh => {
        stock[wh.code] = {};
        SKUS.forEach(sku => {
          stock[wh.code][sku.code] = {
            on_hand: 0,
            in_transit: 0,
            committed: 0
          };
        });
      });

      // Calculate initial params for Day 0
      const day0Params = {};
      SKUS.forEach(sku => {
        day0Params[sku.code] = {};
        WAREHOUSES.forEach(wh => {
          day0Params[sku.code][wh.code] = calcSKUParams(sku.code, wh.code, '2026-08-01');
        });
      });

      // Split 11 SKUs for each warehouse by hash into 3 groups (3 LOW, 5 OK, 3 HIGH)
      WAREHOUSES.forEach(wh => {
        const wcode = wh.code;
        const sortedSkus = [...SKUS].sort((a, b) => h01(`${wcode}|${a.code}|order`) - h01(`${wcode}|${b.code}|order`));

        sortedSkus.forEach((sku, idx) => {
          const scode = sku.code;
          const p = day0Params[scode][wcode];
          let frac = 0;
          if (idx < 3) {
            // 3 SKU dưới MIN: frac in [-0.55, -0.10]
            frac = -0.55 + h01(`${wcode}|${scode}|low`) * 0.45;
          } else if (idx < 8) {
            // 5 SKU bình thường: frac in [0.15, 0.85]
            frac = 0.15 + h01(`${wcode}|${scode}|ok`) * 0.70;
          } else {
            // 3 SKU vượt MAX: frac in [1.2, 2.0]
            frac = 1.20 + h01(`${wcode}|${scode}|high`) * 0.80;
          }

          const onHand = Math.max(0, Math.round(p.rop + frac * (p.qmax - p.rop)));
          stock[wcode][scode].on_hand = onHand;
        });
      });

      // GHI ĐÈ CÁC Ô DEMO CHUẨN (YÊU CẦU 4.2)
      // 1. TLM-045 tại HCM: on_hand = round(rop * 0.85) [dưới MIN]
      const p_hcm_tlm = day0Params['TLM-045']['HCM'];
      stock['HCM']['TLM-045'].on_hand = Math.round(p_hcm_tlm.rop * 0.85);

      // 2. TLM-045 tại BD: on_hand = qmax + 250 [dư lớn]
      const p_bd_tlm = day0Params['TLM-045']['BD'];
      stock['BD']['TLM-045'].on_hand = p_bd_tlm.qmax + 250;

      // 3. PPR-025 tại HN: on_hand = round(rop * 0.84) [dưới MIN]
      const p_hn_ppr = day0Params['PPR-025']['HN'];
      stock['HN']['PPR-025'].on_hand = Math.round(p_hn_ppr.rop * 0.84);

      // 4. GCH-DEC tại HCM: 220 | tại DN: 4
      stock['HCM']['GCH-DEC'].on_hand = 220;
      stock['DN']['GCH-DEC'].on_hand = 4;

      // 5. TBV-LAV tại HCM: 180 | tại DN_CITY: 0
      stock['HCM']['TBV-LAV'].on_hand = 180;
      stock['DN_CITY']['TBV-LAV'].on_hand = 0;

      return stock;
    }

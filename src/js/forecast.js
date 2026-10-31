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
      if (num === undefined || num === null) {
        if (typeof Store !== 'undefined') {
          Store.seq = Store.seq || {};
          const k = prefix.toLowerCase();
          Store.seq[k] = (Store.seq[k] || 0) + 1;
          num = Store.seq[k];
        } else {
          num = 1;
        }
      }
      return prefix + '-' + String(num).padStart(4, '0');
    }

    // COMMON STATUS EVALUATOR (YÊU CẦU 0.5)
    function getStatus(eff, params) {
      if (eff <= params.rop) return 'LOW';    // Dưới MIN
      if (eff > params.qmax) return 'HIGH';   // Vượt MAX
      return 'OK';                             // Bình thường
    }

    // SEEDED HISTORY GENERATION (12 WEEKS BEFORE 01/08/2026)
    // Mức an toàn mục tiêu khi bổ sung bằng điều chuyển: giữa dải ROP..MAX (không bơm lên MAX)
    function getSafeTarget(p) {
      return Math.max(p.rop + 1, Math.ceil(p.rop + 0.5 * Math.max(0, p.qmax - p.rop)));
    }

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
      return Store.history;
    }

    // PARAMETER CALCULATION PER SKU x WAREHOUSE (YÊU CẦU 0.4, 0.7)
    function calcSKUParams(skuCode, whCode, dateStr, historyOverride) {
      const sku = SKUS.find(s => s.code === skuCode);
      const wh = WAREHOUSES.find(w => w.code === whCode);
      const hist = historyOverride || Store.history;
      const weeks = (hist && hist[skuCode] && hist[skuCode][whCode]) ? hist[skuCode][whCode] : [];

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
        lead: Math.round(L * 100) / 100,
        d_lead: Math.round(d_lead * 10) / 10,
        sigma_error: Math.round(sigma_error * 10) / 10,
        sigma: Math.round(sigma_error * 10) / 10,
        ss: Math.round(ss * 10) / 10,
        rop: rop,
        qmax: qmax,
        totalEventDelay: totalEventDelay
      };
    }

    // ----------------------------------------------------------------------------
    // PHASE D: AI DUAL MIN/MAX & LOOKAHEAD EXPLANATION HELPERS
    // ----------------------------------------------------------------------------
    function getDriverExplanation(skuCode, whCode, curDate, p, baseP) {
      const curM = getMonthFromDate(curDate);
      const sm = SI[curM] || 1.0;
      const reasons = [];

      // 1. Mùa vụ
      reasons.push(`Mùa vụ T${curM} (Sm = ${sm})`);

      // 2. Sự kiện vận hành
      if (typeof getCellEventImpact === 'function') {
        const impact = getCellEventImpact(skuCode, whCode, curDate);
        impact.events.forEach(ev => {
          if (ev.delay_days > 0 && (ev.delay_scope === 'SUPPLY' || ev.delay_scope === 'BOTH')) {
            reasons.push(`${ev.title} (+${ev.delay_days} delay NCC)`);
          } else if (ev.demand_mult !== 1.0) {
            reasons.push(`${ev.title} (Hệ số cầu x${ev.demand_mult})`);
          } else if (ev.fill_rate < 1.0) {
            reasons.push(`${ev.title} (Giao ${Math.round(ev.fill_rate * 100)}%)`);
          }
        });
      }
      // 3. Biến động tiêu thụ gần đây
      if (baseP && p) {
        const diffD = p.f_next - baseP.f_next;
        if (Math.abs(diffD) > 1) {
          const pct = Math.round((diffD / (baseP.f_next || 1)) * 100);
          reasons.push(`Nhu cầu SMA4 ${pct >= 0 ? 'tăng' : 'giảm'} ${Math.abs(pct)}%`);
        }
      }

      const isInc = baseP ? (p.rop >= baseP.rop) : true;
      return (isInc ? 'Tăng do: ' : 'Giảm do: ') + reasons.join(' + ');
    }

    function renderDualParam(baseVal, aiVal, label = 'ROP', driverText = '') {
      if (baseVal === undefined || baseVal === null) {
        return `<span class="dual-ai">${fmtNum(aiVal)}</span>`;
      }
      const diff = aiVal - baseVal;
      const pct = baseVal > 0 ? Math.round((diff / baseVal) * 100) : 0;
      const tooltip = driverText ? `title="${driverText}"` : '';

      if (diff === 0) {
        return `<span class="dual-param" ${tooltip}><span class="dual-ai">${fmtNum(aiVal)}</span></span>`;
      }

      const isUp = diff > 0;
      const arrow = isUp ? '↑' : '↓';
      const sign = isUp ? '+' : '';
      const diffClass = isUp ? 'diff-up' : 'diff-down';

      return `
        <span class="dual-param" ${tooltip}>
          <span class="dual-base">${fmtNum(baseVal)}</span>
          <span class="dual-ai ${diffClass}">${fmtNum(aiVal)}</span>
          <span class="dual-diff ${diffClass}">(${arrow}${sign}${pct}%)</span>
        </span>
      `;
    }

    function calcLookaheadWarning(st, p, curDate, skuCode, whCode) {
      const dailyRate = Math.max(0.1, p.f_next / 7.0);

      // Check upcoming inbound transfers arriving within 7 days
      let arriving7 = 0;
      if (Store.transfers) {
        Store.transfers.forEach(tr => {
          if ((tr.status === 'Đang chuyển' || tr.status === 'Đã đến kho') && tr.dstWh === whCode && tr.sku === skuCode) {
            const daysLeft = diffDays(curDate, tr.arrivalDate);
            if (daysLeft >= 0 && daysLeft <= 7) {
              arriving7 += tr.qty;
            }
          }
        });
      }

      const eff = st.on_hand + st.in_transit - st.committed;
      const proj7OnHand = Math.round(st.on_hand + arriving7 - (dailyRate * 7));
      const daysOfSupply = Math.round((eff / dailyRate) * 10) / 10;
      const daysUntilRop = Math.round((st.on_hand - p.rop) / dailyRate);

      // 1. Nguy cơ đứt hàng hoàn toàn (Stockout) trong 7 ngày tới
      if (daysOfSupply <= 7 || proj7OnHand <= 0) {
        return {
          tag: 'STOCKOUT',
          label: 'Nguy cơ đứt hàng',
          tagClass: 'risk-tag risk-tag-stockout',
          subText: daysOfSupply <= 0 ? 'Đã hết hàng' : `Hết hàng sau ~${daysOfSupply} ngày`
        };
      }

      // 2. Nếu hiện tại đang trên MIN nhưng tiêu thụ trong 7 ngày tới sẽ làm rơi dưới ROP
      if (st.on_hand > p.rop && proj7OnHand <= p.rop) {
        return {
          tag: 'WARN_LOW',
          label: 'Sắp chạm MIN',
          tagClass: 'risk-tag risk-tag-low',
          subText: `Rơi dưới ROP sau ~${Math.max(1, daysUntilRop)} ngày`
        };
      }

      // 3. Nếu hiện tại ĐÃ DƯỚI MIN nhưng tồn khả dụng vẫn đủ phục vụ qua 7 ngày
      if (eff <= p.rop) {
        return {
          tag: 'WARN_LOW',
          label: 'Đang dưới MIN',
          tagClass: 'risk-tag risk-tag-low',
          subText: `Đủ bán ${daysOfSupply} ngày (Cần bổ sung)`
        };
      }

      // 4. Nguy cơ tồn ứ đọng vượt trần MAX
      if (proj7OnHand > p.qmax || eff > p.qmax) {
        const excess = Math.max(0, eff - p.qmax);
        return {
          tag: 'WARN_HIGH',
          label: 'Nguy cơ ứ đọng',
          tagClass: 'risk-tag risk-tag-high',
          subText: `Dư vượt MAX +${excess} sp`
        };
      }

      // 5. An toàn
      return {
        tag: 'SAFE',
        label: 'An toàn 7N',
        tagClass: 'risk-tag risk-tag-safe',
        subText: `Tồn dự phóng 7N: ~${proj7OnHand} sp`
      };
    }

    // INITIAL STOCK ON 2026-08-01 (NGUỒN SỰ THẬT TỪ data/inventory_opening.csv)
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

      // 1. Nguồn sự thật 100% từ CSV_DATABASE (data/inventory_opening.csv)
      if (typeof CSV_DATABASE !== 'undefined' && Array.isArray(CSV_DATABASE.inventory_opening)) {
        CSV_DATABASE.inventory_opening.forEach(row => {
          if (stock[row.wh] && stock[row.wh][row.sku]) {
            stock[row.wh][row.sku].on_hand = row.on_hand;
            stock[row.wh][row.sku].in_transit = 0;
            stock[row.wh][row.sku].committed = row.committed;
            // Hàng đầu kỳ đang về phải có chứng từ để theo dõi và bấm "Nhận hàng"
            if (row.in_transit > 0 && typeof createSupplierShipment === 'function' && typeof Store !== 'undefined') {
              createSupplierShipment(row.sku, row.wh, row.in_transit, Store.startDate, 1 + (Store.transfers.length % 3), 'Hàng NCC đầu kỳ đang về', stock);
            }
          }
        });
        return stock;
      }

      // 2. Fallback dự phòng nếu chạy test độc lập không qua build
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

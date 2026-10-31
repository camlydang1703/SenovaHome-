// ============================================================================
// SIMULATION ENGINE (DAILY CONSUMPTION, REPLENISHMENT & ADVANCEMENT)
// ============================================================================

    // 2.3 DAILY SNAPSHOT TRACKER (Yêu cầu 8)
    // ----------------------------------------------------------------------------
    function recordDailySnapshot(dateStr) {
      let totalStockVal = 0;
      let trappedCapVal = 0;
      let lowCount = 0;
      let okCount = 0;
      let highCount = 0;

      const statusByWh = {};
      WAREHOUSES.forEach(w => {
        statusByWh[w.code] = { low: 0, ok: 0, high: 0 };
      });

      SKUS.forEach(sku => {
        WAREHOUSES.forEach(wh => {
          const st = Store.stock[wh.code][sku.code];
          const p = calcSKUParams(sku.code, wh.code, dateStr, Store.history);
          const eff = st.on_hand + st.in_transit - st.committed;
          const status = getStatus(eff, p);

          totalStockVal += st.on_hand * sku.cogs;
          if (st.on_hand > p.qmax) {
            trappedCapVal += (st.on_hand - p.qmax) * sku.cogs;
          }

          if (status === 'LOW') {
            lowCount++;
            statusByWh[wh.code].low++;
          } else if (status === 'HIGH') {
            highCount++;
            statusByWh[wh.code].high++;
          } else {
            okCount++;
            statusByWh[wh.code].ok++;
          }
        });
      });

      const dayLost = Store.dailySales[dateStr] ? Store.dailySales[dateStr].lostSalesVal : 0;
      const dayRev  = Store.dailySales[dateStr] ? Store.dailySales[dateStr].revenue : 0;

      // Accumulate per-warehouse demand for Service Level chart
      const whDemand = {};
      WAREHOUSES.forEach(wh => {
        whDemand[wh.code] = SKUS.reduce((sum, sku) => {
          return sum + (Store.currentWeekDemand[sku.code][wh.code] || 0);
        }, 0);
      });

      Store.daily[dateStr] = {
        date: dateStr,
        totalStock: totalStockVal,
        trappedCap: trappedCapVal,
        holdingCost: Math.round(totalStockVal * (PARAMS.H / 365.0)),
        revenue: dayRev,
        lostSales: dayLost,
        lowCount: lowCount,
        okCount: okCount,
        highCount: highCount,
        statusByWh: statusByWh,
        whDemand: whDemand
      };
    }

    // ----------------------------------------------------------------------------
    // 2.4 PERIODIC INBOUND REPLENISHMENT (Yêu cầu 3.2)
    // ----------------------------------------------------------------------------
    function processInboundReplenishment(curDate, dayIdx) {
      const whDayInbound = {};
      WAREHOUSES.forEach(wh => { whDayInbound[wh.code] = { total: 0, cost: 0, skus: [] }; });

      SKUS.forEach(sku => {
        WAREHOUSES.forEach(wh => {
          const st = Store.stock[wh.code][sku.code];
          const p = calcSKUParams(sku.code, wh.code, curDate, Store.history);
          const f_next = p.f_next || (sku.base * wh.w);

          // Chu ky theo nhom SKU: hang nhanh = 7 ngay, trung binh = 8 ngay, cham = 14 ngay
          let baseCycle;
          if (sku.slow) {
            baseCycle = 14;
            // Hang cham chi ve khi ton kha dung <= ROP (tranh tich luy)
            const eff = st.on_hand + st.in_transit - st.committed;
            if (eff > p.rop) return;
          } else if (sku.base >= 350) {
            baseCycle = 7;
          } else {
            baseCycle = 8;
          }

          // Pha rieng tung kho + nhieu +-2 ngay theo h01 (dam bao khong dong bo tat ca kho)
          const whPhase = Math.floor(h01(sku.code, wh.code, 'inbound_phase') * baseCycle);
          const jitter = Math.floor(h01(sku.code, wh.code, 'inbound_jitter', Math.floor(dayIdx / baseCycle)) * 5) - 2;
          const effectiveCycle = Math.max(5, baseCycle + jitter);

          if ((dayIdx + whPhase) % effectiveCycle === 0) {
            const cycleFactor = effectiveCycle / 7.0;
            // He so lap day NCC 0.88..1.10
            const supplierFill = 0.88 + 0.22 * h01(sku.sup, 'supplier_fill', curDate);
            // fill_rate cua su kien dang hieu luc (neu co)
            const cellImpact = (typeof getCellEventImpact === 'function')
              ? getCellEventImpact(sku.code, wh.code, curDate)
              : { fillRate: 1.0 };
            const eventFill = cellImpact.fillRate || 1.0;

            // Tinh ton kha dung hien tai
            const eff = st.on_hand + st.in_transit - st.committed;
            // Kho dang vuot MAX thi khong nhan them hang NCC dinh ky (chinh sach Min/Max)
            if (eff > p.qmax) return;

            // Muc tieu ton = ROP + 45% F_next (trung tam dai An toan)
            const targetMid = p.rop + 0.45 * f_next;
            // Pull factor: keo ve target_mid, clamp [0.30, 1.50]
            let pullFactor = 1.0 + (targetMid - eff) / (f_next * 2.2);
            pullFactor = Math.max(0.30, Math.min(1.50, pullFactor));

            // He so rieng theo SKU de bu dac tinh chuoi cung
            let skuMult = 1.0;
            if (sku.code === 'GCH-6060') skuMult = 1.12; // Bu lead time 21 ngay

            let inboundQty = Math.round(f_next * cycleFactor * pullFactor * supplierFill * eventFill * skuMult);

            // Hang cham: khong vuot qua muc muc tieu an toan
            if (sku.slow) {
              const targetSafe = p.rop + Math.max(1, Math.ceil(f_next * 0.9));
              const maxSafe = Math.max(1, targetSafe - eff);
              inboundQty = Math.min(maxSafe, inboundQty);
            }

            if (inboundQty <= 0 && eventFill > 0 && eff <= p.rop) inboundQty = 1;

            if (inboundQty > 0) {
              st.on_hand += inboundQty;
              whDayInbound[wh.code].total += inboundQty;
              whDayInbound[wh.code].cost += inboundQty * sku.cogs;
              whDayInbound[wh.code].skus.push(`${sku.code} (+${inboundQty})`);
            }
          }
        });
      });

      // Hàng về định kỳ NCC không ghi nhật ký quản trị tồn kho (chỉ phản ánh qua tồn).
    }

    // ----------------------------------------------------------------------------
    // 2.5 DAILY CONSUMPTION & REVENUE (Yêu cầu 3.3, 0.10)
    // ----------------------------------------------------------------------------
    function processDailyDemandAndSales(curDate) {
      const m = getMonthFromDate(curDate);
      const dow = getDOW(curDate);

      // Trọng số ngày trong tuần (DOW pattern: Thứ 7, CN và T2 cao điểm)
      const dowMultipliers = [0.45, 1.10, 1.08, 1.05, 1.05, 1.10, 1.17]; // CN=0, T2=1,...
      const dowMult = dowMultipliers[dow] || 1.0;

      let dayTotalRev = 0;
      let dayTotalLost = 0;

      SKUS.forEach(sku => {
        const sm = (typeof SI[sku.code] === 'object' && SI[sku.code] !== null) ? (SI[sku.code][m] || 1.0) : (SI[m] || 1.0);

        WAREHOUSES.forEach(wh => {
          // Tác động sự kiện chỉ áp cho ô (SKU, kho) trong phạm vi
          const cellImpact = (typeof getCellEventImpact === 'function')
            ? getCellEventImpact(sku.code, wh.code, curDate)
            : { demandMult: 1.0, priceMult: 1.0 };
          const evtMult = cellImpact.demandMult || 1.0;

          // Kiểm tra chương trình khuyến mãi 2B đang chạy (nếu có)
          let promoMult = 1.0;
          let discountPct = 0;
          const activePromo = Store.promotions.find(pm =>
            pm.sku === sku.code && pm.wh === wh.code && pm.status === 'Đang chạy' && curDate <= pm.validUntil
          );
          if (activePromo) {
            promoMult = 1.6; // Kích cầu tăng 60%
            discountPct = activePromo.discountPct;
          }

          // Nhiễu xác định FNV-1a
          const noise = 0.85 + 0.30 * h01(sku.code, wh.code, 'demand', curDate);

          // Nhu cầu ngày: (base * w / 7) * sm * dow * evt * promo * noise
          const baseDaily = (sku.base * wh.w / 7.0);
          const dDaily = Math.max(0, Math.round(baseDaily * sm * dowMult * evtMult * promoMult * noise));

          const st = Store.stock[wh.code][sku.code];
          const sold = Math.min(st.on_hand, dDaily);
          const lost = dDaily - sold;

          st.on_hand -= sold;

          // Doanh thu theo giá đã trừ chiết khấu nếu có KM
          const effectivePrice = Math.round(sku.price * (1 - discountPct / 100.0));
          const rev = sold * effectivePrice;
          const lostVal = lost * sku.price;

          dayTotalRev += rev;
          dayTotalLost += lostVal;

          // Cập nhật tích lũy
          Store.currentWeekDemand[sku.code][wh.code] += sold;
          Store.lostSales[wh.code][sku.code] += lost;
        });
      });

      Store.dailySales[curDate] = {
        revenue: dayTotalRev,
        lostSalesVal: dayTotalLost
      };

      // Không ghi SALES_DAILY vào nhật ký: người quản lý kho không import dữ liệu bán hàng.
    }

    // ----------------------------------------------------------------------------
    // 2.6 WEEKLY HISTORY ROLLOVER (Yêu cầu 0.6, 0.7)
    // ----------------------------------------------------------------------------
    function updateWeeklyHistory(curDate) {
      const m = getMonthFromDate(curDate);
      SKUS.forEach(sku => {
        const sm = (typeof SI[sku.code] === 'object' && SI[sku.code] !== null) ? (SI[sku.code][m] || 1.0) : (SI[m] || 1.0);
        WAREHOUSES.forEach(wh => {
          const wDemand = Store.currentWeekDemand[sku.code][wh.code] || 0;
          // Loại bỏ yếu tố mùa vụ
          const deseason = Math.round(wDemand / (sm || 1.0));
          Store.history[sku.code][wh.code].push({
            demand: wDemand,
            sm: sm,
            deseason: deseason
          });
          Store.currentWeekDemand[sku.code][wh.code] = 0;
        });
      });
    }

    // ----------------------------------------------------------------------------
    // 2.7 SỰ KIỆN NGOẠI LỆ CÓ CHỨNG TỪ (THAY THẾ balanceInventoryGroups GÁN THẲNG)
    // ----------------------------------------------------------------------------
    function balanceInventoryGroups(curDate) {
      // Đảm bảo không gán thẳng on_hand.
      // Chỉ kích hoạt sự kiện ngoại lệ có chứng từ khi quy trình tự nhiên thiếu nhóm.
      // Mỗi kho mỗi ngày tối đa 1 sự kiện ngoại lệ.
      const protectedOverrides = [
        { sku: 'TLM-045', wh: 'HCM' },
        { sku: 'TLM-045', wh: 'BD' },
        { sku: 'PPR-025', wh: 'HN' },
        { sku: 'GCH-DEC', wh: 'HCM' },
        { sku: 'GCH-DEC', wh: 'DN' },
        { sku: 'TBV-LAV', wh: 'HCM' },
        { sku: 'TBV-LAV', wh: 'DN_CITY' }
      ];

      WAREHOUSES.forEach(wh => {
        const items = SKUS.map(sku => {
          const p = calcSKUParams(sku.code, wh.code, curDate, Store.history);
          const st = Store.stock[wh.code][sku.code];
          const eff = st.on_hand + st.in_transit - st.committed;
          const status = getStatus(eff, p);
          const isProtected = protectedOverrides.some(o => o.sku === sku.code && o.wh === wh.code);
          return { sku, p, st, eff, status, isProtected };
        });

        let executedEventInWh = false;

        // 1. Kiểm tra nhóm HIGH (cần ít nhất 1-2 SKU vượt MAX)
        let highs = items.filter(it => it.status === 'HIGH');
        if (highs.length < 2 && !executedEventInWh) {
          const cands = items.filter(it => !it.isProtected && it.status === 'OK');
          if (cands.length > 0) {
            cands.sort((a, b) => (b.eff / b.p.qmax) - (a.eff / a.p.qmax));
            const pick = cands[0];
            // Tạo lô hàng NCC giao dư (chứng từ nhập kho)
            const addQty = Math.max(1, Math.round(pick.p.qmax * 1.25 - pick.eff));
            pick.st.on_hand += addQty;
            executedEventInWh = true;
            pushNotification('EXCEPTION_EVENT', pick.sku.code, `Chứng từ nhập kho ngoại lệ: NCC giao dư +${addQty} ${pick.sku.code} tại ${wh.name}`, wh.code);
          }
        }

        // 2. Kiểm tra nhóm LOW (cần ít nhất 1-2 SKU dưới MIN)
        let lows = items.filter(it => it.status === 'LOW');
        if (lows.length < 2 && !executedEventInWh) {
          const cands = items.filter(it => !it.isProtected && it.status === 'OK');
          if (cands.length > 0) {
            cands.sort((a, b) => (a.eff / a.p.rop) - (b.eff / b.p.rop));
            const pick = cands[0];
            // Tạo đơn xuất dự án lớn đột xuất (chứng từ xuất kho, tính doanh số)
            const subQty = Math.min(pick.st.on_hand, Math.max(1, Math.round(pick.eff - pick.p.rop * 0.78)));
            if (subQty > 0) {
              pick.st.on_hand -= subQty;
              executedEventInWh = true;
              const rev = subQty * pick.sku.price;
              if (Store.dailySales[curDate]) Store.dailySales[curDate].revenue += rev;
              pushNotification('EXCEPTION_EVENT', pick.sku.code, `Chứng từ xuất kho ngoại lệ: Dự án lớn mua gấp ${subQty} ${pick.sku.code} tại ${wh.name}`, wh.code);
            }
          }
        }
      });
    }

        // ----------------------------------------------------------------------------
    // 2.7b EVENT LIFECYCLE TRACKER & ADVISORY (Yêu cầu 3.2 & 3.4d)
    // ----------------------------------------------------------------------------
    function formatWhEventImpact(ev, whCode) {
      const parts = [];
      if (ev.demand_mult !== undefined && ev.demand_mult !== null && ev.demand_mult !== 1.0) {
        const pct = Math.round((ev.demand_mult - 1.0) * 100);
        const sign = pct > 0 ? `+${pct}%` : `${pct}%`;
        parts.push(`Cầu ${sign}`);
      }
      if (ev.delay_days && ev.delay_days > 0) {
        parts.push(`Trễ giao +${ev.delay_days} ngày (${ev.delay_scope || 'Cung ứng'})`);
      }
      if (ev.fill_rate !== undefined && ev.fill_rate !== null && ev.fill_rate !== 1.0) {
        parts.push(`Lấp đầy ${Math.round(ev.fill_rate * 100)}%`);
      }
      if (ev.price_mult !== undefined && ev.price_mult !== null && ev.price_mult !== 1.0) {
        const pct = Math.round((ev.price_mult - 1.0) * 100);
        const sign = pct > 0 ? `+${pct}%` : `${pct}%`;
        parts.push(`Giá vốn ${sign}`);
      }
      const targetStr = (ev.scope_target && ev.scope_target !== 'ALL') ? ` (${ev.scope_target})` : '';
      return (parts.length > 0 ? parts.join(', ') : 'Điều chỉnh cục bộ') + targetStr;
    }

    function processEventLifecycle(curDate) {
      if (!Store.eventLifecycleTrack) Store.eventLifecycleTrack = {};
      if (typeof EVENTS === 'undefined' || !Array.isArray(EVENTS)) return;

      EVENTS.forEach(ev => {
        const advDays = ev.advisory_days !== undefined ? ev.advisory_days : 3;
        const advDate = addDays(ev.start, -advDays);

        WAREHOUSES.forEach(wh => {
          if (!isEventMatchingWarehouse(ev.scope_wh, wh.code)) return;
          const impact = formatWhEventImpact(ev, wh.code);

          // 1. ADVISORY (Cảnh báo sớm)
          if (curDate === advDate) {
            const key = `ADV_${ev.id}_${wh.code}`;
            if (!Store.eventLifecycleTrack[key]) {
              Store.eventLifecycleTrack[key] = true;
              pushNotification('EVENT_ADVISORY', ev.id, `[Dự báo sự kiện] ${ev.title}: ${impact}. Bắt đầu từ ${fmtDateVN(ev.start)} tại ${wh.name}.`, wh.code);
            }
          }

          // 2. START (Bắt đầu sự kiện)
          if (curDate === ev.start) {
            const key = `START_${ev.id}_${wh.code}`;
            if (!Store.eventLifecycleTrack[key]) {
              Store.eventLifecycleTrack[key] = true;
              pushNotification('EVENT_START', ev.id, `[Sự kiện bắt đầu] ${ev.title}: ${impact}. Hiệu lực đến ${fmtDateVN(ev.end)} tại ${wh.name}.`, wh.code);
            }
          }

          // 3. END (Kết thúc sự kiện)
          const endPlus1 = addDays(ev.end, 1);
          if (curDate === endPlus1) {
            const key = `END_${ev.id}_${wh.code}`;
            if (!Store.eventLifecycleTrack[key]) {
              Store.eventLifecycleTrack[key] = true;
              pushNotification('EVENT_END', ev.id, `[Sự kiện kết thúc] ${ev.title} đã hết hiệu lực. Chuỗi cung ứng tại ${wh.name} trở lại bình thường.`, wh.code);
            }
          }
        });
      });
    }

function advanceOneDay() {
      if (Store.currentDate >= Store.endDate) {
        if (Store.autoPilot) toggleAutoPilot();
        showToast('Đã đạt đến ngày kết thúc mô phỏng (23/10/2026)', 'info');
        return false;
      }

      Store.currentDate = addDays(Store.currentDate, 1);
      const curDate = Store.currentDate;
      const dayIdx = diffDays(Store.startDate, curDate);

      // Bước 1: Tiếp nhận các chuyến hàng điều chuyển đã cập cảng
      Store.transfers.forEach(tr => {
        if (tr.status === 'Đang chuyển' && tr.arrivalDate <= curDate) {
          tr.status = 'Đã nhận';
          Store.stock[tr.dstWh][tr.sku].on_hand += tr.qty;
          Store.stock[tr.dstWh][tr.sku].in_transit = Math.max(0, Store.stock[tr.dstWh][tr.sku].in_transit - tr.qty);
          pushNotification('TRANSFER_ARRIVED', tr.id,
            `Hàng điều chuyển ${tr.sku} (${tr.qty}) từ ${tr.srcWh} đã nhập kho ${tr.dstWh}.`
          );
          logAction('TRANSFER_ARRIVED', tr.id, `Nhập kho ${tr.dstWh}: ${tr.qty} ${tr.sku}`);
        }
      });

      // Bước 2: Bổ sung định kỳ từ Nhà cung cấp & Theo dõi vòng đời sự kiện
      processEventLifecycle(curDate);
      processInboundReplenishment(curDate, dayIdx);

      // Bước 3: Tiêu thụ hàng ngày và ghi nhận doanh thu
      processDailyDemandAndSales(curDate);

      // Bước 4: Hết hạn các yêu cầu báo giá quá ngày hiệu lực
      Store.rfqs.forEach(rfq => {
        if (rfq.status === 'Đã gửi NCC' && curDate > rfq.validUntil) {
          rfq.status = 'Quá hạn';
          pushNotification('RFQ_EXPIRED', rfq.id,
            `Yêu cầu báo giá ${rfq.id} (${rfq.sku} - ${rfq.qty}) gửi ${rfq.sup} đã hết hiệu lực báo giá.`
          );
        }
      });

      // Bước 5: Cập nhật lịch sử hàng tuần (cứ mỗi 7 ngày)
      if (dayIdx % 7 === 0) {
        updateWeeklyHistory(curDate);
      }

      // Bước 6: Cân bằng tính đa dạng 3 nhóm
      balanceInventoryGroups(curDate);

      // Bước 7: Quét và cập nhật danh sách đề xuất
      scanAndGenerateProposals(curDate);

      // Bước 8: Ghi nhận snapshot dữ liệu ngày
      recordDailySnapshot(curDate);

      return true;
    }



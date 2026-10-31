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
        statusByWh: statusByWh
      };
    }

    // ----------------------------------------------------------------------------
    // 2.4 PERIODIC INBOUND REPLENISHMENT (Yêu cầu 3.2)
    // ----------------------------------------------------------------------------
    function processInboundReplenishment(curDate, dayIdx) {
      SKUS.forEach(sku => {
        WAREHOUSES.forEach(wh => {
          const st = Store.stock[wh.code][sku.code];
          const p = calcSKUParams(sku.code, wh.code, curDate, Store.history);

          // Chu kỳ hàng về định kỳ từ NCC theo profile sản phẩm:
          let cycle = 7;
          let qtyMin = 50;
          let qtyMax = 120;

          if (sku.slow) {
            // Hàng bán chậm: mỗi 14-21 ngày mới về, và CHỈ về nếu tồn đang <= ROP
            cycle = 16;
            qtyMin = 10;
            qtyMax = 25;
            if (st.on_hand > p.rop) return; // Không nhập nếu tồn còn trên ROP
          } else if (sku.base >= 350) {
            // Nhu cầu cao: mỗi 6-8 ngày
            cycle = 7;
            qtyMin = 120;
            qtyMax = 220;
          } else {
            // Nhu cầu trung bình: mỗi 8-10 ngày
            cycle = 9;
            qtyMin = 40;
            qtyMax = 90;
          }

          // Kiểm tra pha theo FNV-1a hash để các kho và SKU không về cùng 1 ngày
          const phaseOffset = Math.floor(h01(sku.code, wh.code, 'inbound_phase') * cycle);
          if ((dayIdx + phaseOffset) % cycle === 0) {
            // Tính số lượng hàng về dựa trên dung tích thiếu hụt
            const deficit = Math.max(0, p.qmax - (st.on_hand + st.in_transit));
            let inboundQty = Math.round(qtyMin + (qtyMax - qtyMin) * h01(sku.code, wh.code, 'inbound_qty', curDate));
            if (deficit > 0) {
              inboundQty = Math.min(inboundQty, Math.max(qtyMin, deficit));
            }
            if (inboundQty > 0) {
              st.on_hand += inboundQty;
              logAction('INBOUND_NCC', sku.code, `Hàng về định kỳ từ ${sku.sup} tại ${wh.name}: +${inboundQty} ${sku.unit}`, inboundQty * sku.cogs);
            }
          }
        });
      });
    }

    // ----------------------------------------------------------------------------
    // 2.5 DAILY CONSUMPTION & REVENUE (Yêu cầu 3.3, 0.10)
    // ----------------------------------------------------------------------------
    function processDailyDemandAndSales(curDate) {
      const m = getMonthFromDate(curDate);
      const dow = getDOW(curDate);

      // Trọng số ngày trong tuần (DOW pattern: Thứ 7, CN và T2 cao điểm)
      const dowMultipliers = [0.75, 1.10, 1.00, 1.00, 1.05, 1.15, 1.25]; // CN=0, T2=1,...
      const dowMult = dowMultipliers[dow] || 1.0;

      // Kiểm tra sự kiện tác động nhu cầu
      let evtMult = 1.0;
      EVENTS.forEach(evt => {
        if (curDate >= evt.start && curDate <= evt.end) {
          evtMult *= evt.demandMult;
        }
      });

      let dayTotalRev = 0;
      let dayTotalLost = 0;

      SKUS.forEach(sku => {
        const sm = (typeof SI[sku.code] === 'object' && SI[sku.code] !== null) ? (SI[sku.code][m] || 1.0) : (SI[m] || 1.0);

        WAREHOUSES.forEach(wh => {
          // Kiểm tra chương trình khuyến mãi 2B đang chạy
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
    // 2.7 3-GROUP BALANCING LOOP (Yêu cầu 3.4)
    // ----------------------------------------------------------------------------
    function balanceInventoryGroups(curDate) {
      // Đảm bảo tại mỗi kho luôn có sự hiện diện của cả 3 nhóm (LOW >= 2, HIGH >= 2, còn lại OK)
      // Ngoại trừ các ô demo chủ chốt luôn giữ ổn định để kịch bản demo chạy chuẩn.
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

        // 1. Kiểm tra nhóm HIGH (yêu cầu ít nhất 2 SKU)
        let highs = items.filter(it => it.status === 'HIGH');
        if (highs.length < 2) {
          const cands = items.filter(it => !it.isProtected && it.status === 'OK');
          if (cands.length > 0) {
            cands.sort((a, b) => (b.eff / b.p.qmax) - (a.eff / a.p.qmax));
            const pick = cands[0];
            pick.st.on_hand = Math.round(pick.p.qmax * 1.22);
          }
        }

        // 2. Kiểm tra nhóm LOW (yêu cầu ít nhất 2 SKU)
        let lows = items.filter(it => it.status === 'LOW');
        if (lows.length < 2) {
          const cands = items.filter(it => !it.isProtected && it.status === 'OK');
          if (cands.length > 0) {
            cands.sort((a, b) => (a.eff / a.p.rop) - (b.eff / b.p.rop));
            const pick = cands[0];
            pick.st.on_hand = Math.max(0, Math.round(pick.p.rop * 0.82));
          }
        }
      });
    }

    // ----------------------------------------------------------------------------

    // 2.9 SIMULATION ADVANCEMENT (Yêu cầu 1)
    // ----------------------------------------------------------------------------
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

      // Bước 2: Bổ sung định kỳ từ Nhà cung cấp
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



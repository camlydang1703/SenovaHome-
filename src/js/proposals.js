// ============================================================================
// PROPOSALS SCANNER & APPROVAL PIPELINE
// ============================================================================

    // 2.8 PROPOSALS SCANNER & ALERTS (Yêu cầu 0.2, 0.3, 0.5, 5.2)
    // ----------------------------------------------------------------------------
        // ----------------------------------------------------------------------------
    // RECALCULATE COMMITTED STOCK FROM ACTIVE PROPOSALS & TRANSFERS
    //    Giữ nguyên committed đầu kỳ (từ CSV) — không reset về 0 như trước đây.
    //    Chỉ cộng thêm lượng giữ chỗ của các đề xuất TRANSFER chưa được duyệt.
    // ----------------------------------------------------------------------------
    function recalcCommittedStock() {
      if (!Store.stock) return;

      // Khôi phục committed từ snapshot đầu kỳ nếu có
      if (Store.openingCommitted) {
        WAREHOUSES.forEach(wh => {
          SKUS.forEach(sku => {
            if (Store.stock[wh.code] && Store.stock[wh.code][sku.code]) {
              Store.stock[wh.code][sku.code].committed = Store.openingCommitted[wh.code] && Store.openingCommitted[wh.code][sku.code] || 0;
            }
          });
        });
      }

      // Cộng thêm giữ chỗ của đề xuất TRANSFER đang chờ duyệt
      if (Store.proposals) {
        Object.values(Store.proposals).forEach(p => {
          if (p.type === 'TRANSFER' && p.status === 'Chờ duyệt' && p.srcWh && Store.stock[p.srcWh] && Store.stock[p.srcWh][p.sku]) {
            Store.stock[p.srcWh][p.sku].committed += p.qty;
          }
        });
      }

      // Cộng giữ chỗ của lệnh điều chuyển chưa rời kho: chờ kho nguồn gửi HOẶC chờ kho đích nhận hàng
      if (Store.transfers) {
        Store.transfers.forEach(tr => {
          if (isAwaitingCounterpart(tr) && Store.stock[tr.srcWh] && Store.stock[tr.srcWh][tr.sku]) {
            Store.stock[tr.srcWh][tr.sku].committed += tr.qty;
          }
        });
      }
    }

    // Phần giữ chỗ CHƯA GỬI HÀNG thật sự tại một ô (đề xuất 'Chờ duyệt' + lệnh XC
    // 'Chờ kho nguồn xác nhận') — dùng cho hiển thị để ô nguồn vẫn hiện đúng
    // bản chất Vượt MAX trước khi hàng thực sự rời kho.
    function getPendingProposalReserve(skuCode, whCode) {
      let sum = 0;
      if (Store.proposals) {
        Object.values(Store.proposals).forEach(p => {
          if (p.type === 'TRANSFER' && p.status === 'Chờ duyệt' && p.sku === skuCode && p.srcWh === whCode) sum += p.qty;
        });
      }
      if (Store.transfers) {
        Store.transfers.forEach(tr => {
          if (isAwaitingCounterpart(tr) && tr.sku === skuCode && tr.srcWh === whCode) sum += tr.qty;
        });
      }
      return sum;
    }

    // Phần hàng SẮP VỀ một ô đã bị kế hoạch khác chiếm (đề xuất chờ duyệt + lệnh XC chờ gửi).
    // Mọi phép tính "sức chứa còn lại của kho nhận" phải trừ con số này để không hứa hai lần.
    function getPlannedInboundQty(skuCode, whCode, excludeKey) {
      let sum = 0;
      if (Store.proposals) {
        Object.keys(Store.proposals).forEach(k => {
          if (excludeKey && k === excludeKey) return;
          const p = Store.proposals[k];
          if (p && (p.type === 'TRANSFER' || p.type === 'OVERSTOCK') && p.sku === skuCode && p.dstWh === whCode) sum += p.qty;
        });
      }
      if (Store.transfers) {
        Store.transfers.forEach(tr => {
          if (isAwaitingCounterpart(tr) && tr.sku === skuCode && tr.dstWh === whCode) sum += tr.qty;
        });
      }
      return sum;
    }

    // Nguồn sự thật duy nhất cho bài toán san tải: bộ quét đề xuất, modal chọn kho nhận và
    // trần kiểm tra lúc tạo lệnh đều đọc chung hàm này nên nhãn UI không thể mâu thuẫn nhau.
    function getOverstockTargets(skuCode, srcWh, curDate, excludeKey) {
      const sku = SKUS.find(s => s.code === skuCode) || { price: 0, cogs: 0, unit: 'sp' };
      const p = calcSKUParams(skuCode, srcWh, curDate, Store.history);
      const st = Store.stock[srcWh][skuCode];
      const eff = st.on_hand + st.in_transit - st.committed;
      const reserve = getPendingProposalReserve(skuCode, srcWh);
      const overMaxView = Math.max(0, eff + reserve - p.qmax);
      const excess = Math.max(0, Math.min(eff - p.qmax, getAiTransferableQty(skuCode, srcWh, curDate)));
      const marginCap = Math.max(0, sku.price - sku.cogs) * (PARAMS.freightMarginCap || 0.5);
      const targets = WAREHOUSES.filter(w => w.code !== srcWh).map(w => {
        const dp = calcSKUParams(skuCode, w.code, curDate, Store.history);
        const ds = Store.stock[w.code][skuCode];
        const effBase = ds.on_hand + ds.in_transit - ds.committed;
        const planned = getPlannedInboundQty(skuCode, w.code, excludeKey);
        const room = Math.max(0, Math.floor(getSafeTarget(dp) - effBase - planned));
        const tDays = getTransferDays(srcWh, w.code, curDate);
        const planQty = Math.max(1, Math.min(excess, room));
        const freight = calcFreightCost(srcWh, w.code, skuCode, planQty, curDate);
        const unitFreight = freight / planQty;
        const isLow = (effBase + planned) <= dp.rop;
        const gateOk = unitFreight <= marginCap;
        return {
          code: w.code, name: w.name, p: dp, eff: effBase, planned: planned, room: room,
          isLow: isLow, tDays: tDays, planQty: planQty, freight: freight, unitFreight: unitFreight,
          gateOk: gateOk, marginCap: marginCap,
          score: (isLow ? 0 : 1e9) + (gateOk ? 0 : 1e7) + (room >= 1 ? 0 : 1e11) + unitFreight * 10 + tDays * 1000 - planQty
        };
      }).sort((a, b) => a.score - b.score);
      return { excess: excess, overMaxView: overMaxView, reserve: reserve, eff: eff, params: p,
               targets: targets, best: targets.find(t => t.room >= 1) || null };
    }

// Sau mọi thao tác làm đổi số lượng: quét lại đề xuất + snapshot ngày hiện tại rồi vẽ lại mọi tab
function refreshAfterStockChange() {
  if (typeof invalidateParamCache === 'function') invalidateParamCache();
  if (!(Store.ui && Store.ui.viewDate)) {
    scanAndGenerateProposals(Store.currentDate);
    if (typeof recordDailySnapshot === 'function') recordDailySnapshot(Store.currentDate);
  }
  if (typeof renderAllViews === 'function') renderAllViews();
}

function scanAndGenerateProposals(curDate) {
      // 1. Quét trạng thái và kích hoạt Cảnh báo chuyển dịch trạng thái
      SKUS.forEach(sku => {
        WAREHOUSES.forEach(wh => {
          const key = `${wh.code}_${sku.code}`;
          const p = calcSKUParams(sku.code, wh.code, curDate, Store.history);
          const st = Store.stock[wh.code][sku.code];
          const eff = st.on_hand + st.in_transit - st.committed;
          const status = getStatus(eff, p);
          const prevStatus = Store.lastStatusMap[key];

          if (prevStatus && prevStatus !== status) {
            if (status === 'LOW') {
              pushNotification('ALERT_LOW', `${wh.code}-${sku.code}`,
                `Cảnh báo: ${sku.code} tại ${wh.name} đã chạm ngưỡng MIN/ROP (${eff}/${p.rop})!`
              );
            } else if (status === 'HIGH') {
              pushNotification('ALERT_HIGH', `${wh.code}-${sku.code}`,
                `Cảnh báo: ${sku.code} tại ${wh.name} đã vượt ngưỡng MAX (${eff}/${p.qmax})!`
              );
            }
          }
          Store.lastStatusMap[key] = status;
        });
      });

      // 2. Quét tạo danh sách đề xuất
      // 2a. Giải phóng giữ chỗ của các đề xuất điều chuyển cũ rồi sinh lại từ đầu,
      //     để mỗi đề xuất mới luôn được tính trên tồn khả dụng thực tế (không trừ 2 lần).
      Object.keys(Store.proposals).forEach(k => {
        const old = Store.proposals[k];
        if (old.type === 'TRANSFER' || old.type === 'OVERSTOCK') delete Store.proposals[k];
      });
      recalcCommittedStock();

      const getDxId = pairKey => {
        if (!Store.dxIds[pairKey]) Store.dxIds[pairKey] = padSeq('DX');
        return Store.dxIds[pairKey];
      };
      const effOf = (skuCode, whCode) => {
        const s = Store.stock[whCode][skuCode];
        return s.on_hand + s.in_transit - s.committed;
      };

      // 2b. Kho THIẾU (LOW): xử lý kho nguy cấp nhất trước (eff/ROP thấp nhất)
      const lowCells = [];
      SKUS.forEach(sku => {
        WAREHOUSES.forEach(wh => {
          const p = calcSKUParams(sku.code, wh.code, curDate, Store.history);
          const eff = effOf(sku.code, wh.code);
          const pairKey = `${sku.code}-${wh.code}`;
          getDxId(pairKey);
          if (getStatus(eff, p) === 'LOW') {
            lowCells.push({ sku, wh, p, ratio: eff / Math.max(1, p.rop) });
          } else if (getStatus(eff, p) === 'OK') {
            const cur = Store.proposals[pairKey];
            if (cur && !cur.hasActiveRfq) delete Store.proposals[pairKey];
          }
        });
      });
      lowCells.sort((a, b) => a.ratio - b.ratio);

      lowCells.forEach(({ sku, wh }) => {
        const pairKey = `${sku.code}-${wh.code}`;
        const dxId = getDxId(pairKey);
        const activeRfq = Store.rfqs.find(r => r.sku === sku.code && r.wh === wh.code && r.status === 'Đã gửi NCC');
        const ev = evaluateReplenishmentOptions(sku.code, wh.code, curDate,
          { blockedSrcWhs: (typeof getBlockedSrcWhs === 'function') ? getBlockedSrcWhs(sku.code, wh.code, curDate) : [] });
        const best = ev.best;

        if (best.type === 'TRANSFER') {
          // Bỏ qua nếu ô nhận đã có lệnh XC chờ kho nguồn xác nhận gửi hàng —
          // tránh đặt trùng đề xuất mới khi hàng chưa rời kho nguồn.
          const xcPending = (Store.transfers || []).some(t =>
            isAwaitingCounterpart(t) && t.sku === sku.code && t.dstWh === wh.code);
          if (xcPending) return;
          Store.proposals[pairKey] = {
            id: dxId,
            date: curDate,
            sku: sku.code,
            wh: wh.code,
            type: 'TRANSFER',
            action: 'Điều chuyển nội bộ',
            qty: best.qty,
            srcWh: best.srcWh,
            dstWh: wh.code,
            leadDays: best.days,
            arrivalDate: addDays(curDate, best.days),
            freightCost: best.freight,
            rfqCost: ev.rfq.total,
            savingVsRfq: ev.savingVsRfq,
            status: 'Chờ duyệt',
            hasActiveRfq: false
          };
          // Giữ chỗ tại kho nguồn để các kho thiếu sau không đặt trùng; sức chứa kho nhận
          // được tính động qua getPlannedInboundQty nên không cần theo dõi thêm.
          Store.stock[best.srcWh][sku.code].committed += best.qty;
        } else {
          Store.proposals[pairKey] = {
            id: dxId,
            date: curDate,
            sku: sku.code,
            wh: wh.code,
            type: 'RFQ',
            action: 'Yêu cầu Báo giá (RFQ)',
            qty: ev.rfq.qty,
            sup: sku.sup,
            sups: (typeof getRfqTargetSuppliers === 'function') ? getRfqTargetSuppliers(sku.code) : [sku.sup],
            leadDays: best.days,
            arrivalDate: addDays(curDate, best.days),
            freightCost: 0,
            rfqCost: ev.rfq.total,
            noTransferReason: ev.sources.every(s => s.transferable < 1)
              ? 'Không kho nào còn tồn dư an toàn'
              : (ev.bestTransfer ? 'Điều chuyển đắt hơn RFQ' : `Cước điều chuyển vượt ${Math.round((PARAMS.freightMarginCap || 0.5) * 100)}% biên LN`),
            status: activeRfq ? 'Đang chờ NCC báo giá' : 'Chờ gửi RFQ',
            hasActiveRfq: !!activeRfq,
            rfqId: activeRfq ? activeRfq.id : null
          };
        }
      });

      // 2c. Kho DƯ (HIGH): san tải phần vượt MAX (đã trừ phần vừa cấp cho kho thiếu)
      SKUS.forEach(sku => {
        WAREHOUSES.forEach(wh => {
          const pairKey = `${sku.code}-${wh.code}`;
          const p = calcSKUParams(sku.code, wh.code, curDate, Store.history);
          const eff = effOf(sku.code, wh.code);
          if (getStatus(eff, p) !== 'HIGH') {
            if (Store.proposals[pairKey] && Store.proposals[pairKey].type === 'OVERSTOCK') delete Store.proposals[pairKey];
            return;
          }
          const scan = getOverstockTargets(sku.code, wh.code, curDate, pairKey);
          const excessQty = scan.excess;
          if (excessQty < 1) return;
          const best = scan.best;

          if (best) {
            Store.proposals[pairKey] = {
              id: getDxId(pairKey),
              date: curDate,
              sku: sku.code,
              wh: wh.code,
              srcWh: wh.code,
              dstWh: best.code,
              type: 'OVERSTOCK',
              action: 'Điều chuyển san tải',
              qty: best.planQty,
              leadDays: best.tDays,
              arrivalDate: addDays(curDate, best.tDays),
              freightCost: best.freight,
              unitFreight: Math.round(best.unitFreight),
              freightVsMargin: best.gateOk ? 'Dưới ngưỡng biên LN' : `Vượt ${Math.round((PARAMS.freightMarginCap || 0.5) * 100)}% biên LN`,
              status: best.gateOk ? 'Cần giải phóng vốn' : 'Cần giải phóng vốn · cước vượt biên LN',
              hasActiveRfq: false
            };
          } else {
            Store.proposals[pairKey] = {
              id: getDxId(pairKey),
              date: curDate,
              sku: sku.code,
              wh: wh.code,
              srcWh: wh.code,
              dstWh: null,
              type: 'OVERSTOCK',
              action: 'Xả tồn / Flash Sale (các kho đều đủ hàng)',
              qty: excessQty,
              leadDays: 0,
              arrivalDate: curDate,
              freightCost: 0,
              status: 'Cần giải phóng vốn · mọi kho đều đủ',
              hasActiveRfq: false
            };
          }
        });
      });
    }

    // ----------------------------------------------------------------------------

    // 2.10 PROPOSAL APPROVAL & EXECUTION (Yêu cầu 0.2, 2.3)
    // ----------------------------------------------------------------------------
    function approveProposal(key) {
      const p = Store.proposals[key];
      if (!p) return;

      if (p.type === 'TRANSFER') {
        // BƯỚC 1/2: kho nhận xác nhận yêu cầu — tạo lệnh chờ, kho nguồn phải bấm "Xác nhận gửi hàng" mới xuất
        const result = createTransferRequest({
          sku: p.sku,
          srcWh: p.srcWh,
          dstWh: p.dstWh,
          qty: p.qty,
          savingVsRfq: p.savingVsRfq || 0,
          proposalKey: key
        });
        if (!result.ok) {
          showToast(result.msg, 'error');
          return;
        }
        showToast(result.msg, 'success');
        refreshAfterStockChange();

      } else if (p.type === 'RFQ') {
        // Mở màn hình so sánh tích hợp (điều chuyển vs RFQ) để xử lý đơn
        openTransferCompareModal(p.sku, p.wh);
      } else if (p.type === 'OVERSTOCK') {
        openOverstockModal(p.sku, p.wh);
      }
    }



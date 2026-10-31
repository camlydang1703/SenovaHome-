// ============================================================================
// INTERNAL TRANSFERS & FREIGHT RATES
// ============================================================================

    function getRouteMultiplier(fromWh, toWh) {
      if (fromWh === toWh) return 0;
      const sameSouth = (fromWh === 'HCM' && toWh === 'BD') || (fromWh === 'BD' && toWh === 'HCM');
      if (sameSouth) return 1.0;
      const centralNorth = (fromWh === 'DN' && toWh === 'HN') || (fromWh === 'HN' && toWh === 'DN');
      if (centralNorth) return 1.5;
      const haGiangNorth = (fromWh === 'HN' && toWh === 'DN_CITY') || (fromWh === 'DN_CITY' && toWh === 'HN');
      if (haGiangNorth) return 1.2;
      const southCentral = (fromWh === 'HCM' || fromWh === 'BD') && toWh === 'DN';
      const centralSouth = toWh === 'DN' && (fromWh === 'HCM' || fromWh === 'BD');
      if (southCentral || centralSouth) return 1.8;
      return 2.2;
    }

    function getRouteData(fromWh, toWh) {
      if (fromWh === toWh) return { lead: 0, base: 0, unit: 0 };
      if (typeof CSV_DATABASE !== 'undefined' && CSV_DATABASE.routes) {
        const r = CSV_DATABASE.routes.find(x => x.from === fromWh && x.to === toWh);
        if (r) {
          return {
            lead: r.lead || 3,
            base: r.rate || 1100000,
            unit: r.unit || 25000
          };
        }
      }
      return { lead: 3, base: 1100000, unit: 25000 };
    }

    // Đã có chuyến xe nội bộ cùng tuyến xuất trong ngày -> hàng ghép chuyến, không tính lại phí chuyến
    function hasTripOnRoute(fromWh, toWh, dateStr) {
      if (!dateStr || typeof Store === 'undefined' || !Store.transfers) return false;
      return Store.transfers.some(t => t.kind !== 'SUPPLIER' && t.srcWh === fromWh && t.dstWh === toWh &&
        (t.shipDate || t.date) === dateStr && t.status !== 'Bị từ chối');
    }

    // Cước = phí chuyến (freight_rate_base, 1 lần/tuyến/ngày) + đơn giá/đv (unit_rate_base x hệ số hàng) x SL
    function calcFreightCost(fromWh, toWh, skuCode, qty, dateStr) {
      if (fromWh === toWh || qty <= 0) return 0;
      const route = getRouteData(fromWh, toWh);
      const iMult = ITEM_FREIGHT_MULT[skuCode] || 1.0;
      const tripFee = hasTripOnRoute(fromWh, toWh, dateStr) ? 0 : route.base;
      return tripFee + Math.round(qty * route.unit * iMult);
    }

    function getUnitFreightRate(fromWh, toWh, skuCode) {
      const route = getRouteData(fromWh, toWh);
      const iMult = ITEM_FREIGHT_MULT[skuCode] || 1.0;
      return Math.round(route.unit * iMult);
    }

    function getTransferDays(fromWh, toWh, curDate) {
      if (fromWh === toWh) return 0;
      const route = getRouteData(fromWh, toWh);
      let baseLead = route.lead;
      if (curDate && typeof EVENTS !== 'undefined') {
        EVENTS.forEach(ev => {
          if (curDate >= ev.start && curDate <= ev.end) {
            if (ev.delay_days > 0 && (ev.delay_scope === 'TRANSFER' || ev.delay_scope === 'BOTH')) {
              const matchFrom = isEventMatchingWarehouse(ev.scope_wh, fromWh);
              const matchTo = isEventMatchingWarehouse(ev.scope_wh, toWh);
              if (matchFrom || matchTo) {
                baseLead += ev.delay_days;
              }
            }
          }
        });
      }
      return baseLead;
    }


    // ----------------------------------------------------------------------------
    // REPLENISHMENT ENGINE: ĐIỀU CHUYỂN NỘI BỘ vs RFQ (độc lập DOM)
    // ----------------------------------------------------------------------------
    // Lượng hàng các lệnh "Chờ kho nhận đồng ý" sắp chuyển tới kho (chưa vào in_transit)
    function getPendingInboundQty(whCode, skuCode) {
      if (!Store.transfers) return 0;
      return Store.transfers
        .filter(t => t.status === 'Chờ kho nhận đồng ý' && t.dstWh === whCode && t.sku === skuCode)
        .reduce((s, t) => s + t.qty, 0);
    }

    // Lượng xuất an toàn tối đa (kho xuất sau chuyển vẫn > ROP).
    // releasedQty: phần giữ chỗ của chính lệnh đang xét (tránh trừ 2 lần).
    function getTransferableQty(skuCode, srcWh, curDate, releasedQty) {
      const rel = releasedQty || 0;
      const st = Store.stock[srcWh][skuCode];
      const p = calcSKUParams(skuCode, srcWh, curDate, Store.history);
      const eff = st.on_hand + st.in_transit - st.committed + rel;
      const physicalFree = st.on_hand - Math.max(0, st.committed - rel);
      return Math.max(0, Math.min(physicalFree, Math.floor(eff - p.rop - 1)));
    }

    // Lượng AI được phép rút: kho xuất vẫn giữ ở mức an toàn mục tiêu (không rơi sát ROP rồi lại thiếu)
    function getAiTransferableQty(skuCode, srcWh, curDate, releasedQty) {
      const rel = releasedQty || 0;
      const hard = getTransferableQty(skuCode, srcWh, curDate, rel);
      const st = Store.stock[srcWh][skuCode];
      const p = calcSKUParams(skuCode, srcWh, curDate, Store.history);
      const eff = st.on_hand + st.in_transit - st.committed + rel;
      return Math.max(0, Math.min(hard, Math.floor(eff - getSafeTarget(p))));
    }

    // Chứng từ hàng NCC đang về (đi chung sổ với lệnh chuyển kho, kind = 'SUPPLIER')
    function createSupplierShipment(skuCode, whCode, qty, curDate, days, note, stockOverride) {
      const sku = SKUS.find(s => s.code === skuCode);
      const stock = stockOverride || Store.stock;
      stock[whCode][skuCode].in_transit += qty;
      const rec = {
        id: padSeq('NK'),
        kind: 'SUPPLIER',
        date: curDate,
        sku: skuCode,
        srcWh: sku.sup,
        dstWh: whCode,
        qty: qty,
        shipDate: curDate,
        arrivalDate: addDays(curDate, days),
        status: 'Đang chuyển',
        cost: 0,
        value: qty * sku.cogs,
        note: note || 'Hàng NCC giao theo chu kỳ'
      };
      Store.transfers.unshift(rec);
      return rec;
    }

    // Nhập kho một lô hàng (điều chuyển hoặc NCC): on_hand tăng, in_transit giảm đúng bằng số lượng
    function applyShipmentReceipt(tr, mode) {
      const st = Store.stock[tr.dstWh][tr.sku];
      st.on_hand += tr.qty;
      st.in_transit = Math.max(0, st.in_transit - tr.qty);
      tr.status = 'Đã nhận';
      tr.receivedDate = Store.currentDate;
      tr.receiveTiming = getReceiveTiming(tr, Store.currentDate).label;
      const isSup = tr.kind === 'SUPPLIER';
      const fromTxt = isSup ? `NCC ${tr.srcWh}` : `kho ${tr.srcWh}`;
      pushNotification(isSup ? 'SUPPLIER_RECEIVE' : 'TRANSFER_ARRIVED', tr.id,
        `${tr.receiveTiming}: nhập kho ${tr.dstWh} ${tr.qty} ${tr.sku} từ ${fromTxt}.`, tr.dstWh);
      logAction(isSup ? 'SUPPLIER_RECEIVE' : 'TRANSFER_ARRIVED', tr.id,
        `${tr.receiveTiming}: nhận ${tr.qty} ${tr.sku} từ ${fromTxt} vào kho ${tr.dstWh} (dự kiến ${tr.arrivalDate})`, 0, tr.dstWh);
    }

    // Giao sớm (trước ngày dự kiến) / Đúng hạn / Nhận trễ n ngày (không giới hạn thời gian nhận)
    function getReceiveTiming(tr, curDate) {
      const diff = Math.round((new Date(curDate) - new Date(tr.arrivalDate)) / 86400000);
      if (diff < 0) return { code: 'EARLY', diff, label: 'Nhận sớm', action: 'Nhận sớm' };
      if (diff === 0) return { code: 'ONTIME', diff, label: 'Nhận đúng hạn', action: 'Xác nhận nhận hàng' };
      return { code: 'LATE', diff, label: `Nhận trễ ${diff} ngày`, action: 'Xác nhận nhập trễ' };
    }

    // Lô hàng tới ngày dự kiến -> 'Đã đến kho'. KHÔNG tự nhập kho: chỉ cộng tồn khi người dùng bấm nhận hàng.
    function processShipmentArrivals(curDate) {
      const byWh = {};
      Store.transfers.forEach(tr => {
        if (tr.status === 'Đang chuyển' && tr.arrivalDate <= curDate) {
          tr.status = 'Đã đến kho';
          tr.arrivedDate = curDate;
          (byWh[tr.dstWh] = byWh[tr.dstWh] || []).push(tr);
        }
      });
      Object.keys(byWh).forEach(wh => {
        const list = byWh[wh];
        const first = list[0];
        const text = list.length === 1
          ? `Lô ${first.id}: ${first.qty} ${first.sku} đã đến kho ${wh}, chờ xác nhận nhận hàng.`
          : `${list.length} lô hàng đã đến kho ${wh} (${list.map(t => t.id).join(', ')}), chờ xác nhận nhận hàng.`;
        pushNotification('SHIPMENT_ARRIVED', first.id, text, wh);
      });
    }

    function receiveShipment(transferId) {
      const tr = Store.transfers.find(t => t.id === transferId);
      if (!tr || (tr.status !== 'Đang chuyển' && tr.status !== 'Đã đến kho')) return;
      if (Store.ui && Store.ui.viewDate) {
        showToast('Đang xem lại ngày cũ, hãy quay về hiện tại để nhận hàng.', 'error');
        return;
      }
      applyShipmentReceipt(tr, 'manual');
      showToast(`${tr.receiveTiming}: lô ${tr.id} đã cộng ${tr.qty} ${tr.sku} vào tồn kho ${tr.dstWh}.`, 'success');
      refreshAfterStockChange();
    }

    function checkTransferSafety(skuCode, srcWh, qty, curDate, releasedQty) {
      const rel = releasedQty || 0;
      const st = Store.stock[srcWh][skuCode];
      const p = calcSKUParams(skuCode, srcWh, curDate, Store.history);
      const effBefore = st.on_hand + st.in_transit - st.committed + rel;
      const physicalFree = st.on_hand - Math.max(0, st.committed - rel);
      const postEff = effBefore - qty;
      if (qty <= 0) return { ok: false, msg: 'Số lượng chuyển phải > 0!', postEff, rop: p.rop };
      if (qty > physicalFree) {
        return { ok: false, msg: `Kho xuất ${srcWh} không đủ hàng vật lý khả dụng (${physicalFree} < ${qty})!`, postEff, rop: p.rop };
      }
      if (postEff <= p.rop) {
        return { ok: false, msg: `Lỗi vi phạm an toàn: Kho xuất sẽ giảm dưới ROP (${postEff} <= ${p.rop})!`, postEff, rop: p.rop };
      }
      return { ok: true, msg: '', postEff, rop: p.rop };
    }

    function getReservedQtyOfProposal(proposalKey) {
      const p = proposalKey && Store.proposals ? Store.proposals[proposalKey] : null;
      if (p && p.type === 'TRANSFER' && p.status === 'Chờ duyệt' && p.srcWh) {
        return { srcWh: p.srcWh, qty: p.qty };
      }
      return null;
    }

    // So sánh toàn bộ phương án bổ sung cho (SKU, kho thiếu):
    //  - Điều chuyển từ từng kho khác: cước + rủi ro thiếu hàng trong thời gian chuyển − lợi ích giải phóng vốn kho dư
    //  - RFQ NCC: phí đặt hàng + rủi ro thiếu hàng trong lead time NCC + chi phí giữ hàng dư ứ đọng trong mạng lưới
    // Phương án điều chuyển chỉ hợp lệ khi kho xuất an toàn (> ROP) và cước <= 50% biên lợi nhuận gộp.
    function evaluateReplenishmentOptions(skuCode, toWh, curDate, opts) {
      const o = opts || {};
      const sku = SKUS.find(s => s.code === skuCode);
      const p = calcSKUParams(skuCode, toWh, curDate, Store.history);
      const st = Store.stock[toWh][skuCode];
      const eff = st.on_hand + st.in_transit - st.committed + getPendingInboundQty(toWh, skuCode);
      // Điều chuyển chỉ bù tới mức an toàn; RFQ (lead time dài) đặt bù tới MAX theo chính sách Min/Max
      const qNeed = Math.max(1, getSafeTarget(p) - eff);
      const reqQty = Math.max(1, o.qty || qNeed);
      const rfqQty = Math.max(1, o.qty || (p.qmax - eff));
      const reserved = getReservedQtyOfProposal(o.excludeKey || `${skuCode}-${toWh}`);

      const margin = Math.max(0, sku.price - sku.cogs);
      const dailyDemand = Math.max(0, (p.f_next || 0) / 7);
      const dailyHolding = (PARAMS.holdingRate || 0.2) / 365;
      const orderCost = PARAMS.orderCostFixed || 500000;
      const shortageUnits = days => Math.max(0, Math.ceil(dailyDemand * days) - Math.max(0, eff));

      const sources = WAREHOUSES.filter(w => w.code !== toWh).map(w => {
        const sSt = Store.stock[w.code][skuCode];
        const sP = calcSKUParams(skuCode, w.code, curDate, Store.history);
        const rel = (reserved && reserved.srcWh === w.code) ? reserved.qty : 0;
        const sEff = sSt.on_hand + sSt.in_transit - sSt.committed + rel;
        const transferable = getAiTransferableQty(skuCode, w.code, curDate, rel);
        const hardTransferable = getTransferableQty(skuCode, w.code, curDate, rel);
        const qty = Math.min(reqQty, transferable);
        const days = getTransferDays(w.code, toWh, curDate);
        const unitFreight = getUnitFreightRate(w.code, toWh, skuCode);
        const freight = calcFreightCost(w.code, toWh, skuCode, qty, curDate);
        const tripFee = Math.max(0, freight - qty * unitFreight);
        // Vốn hàng nằm trên đường (không bán được trong lúc vận chuyển)
        const transitCapital = Math.round(qty * sku.cogs * (PARAMS.dailyHoldingWaitRate || 0.0005) * days);
        // Giải phóng vốn ứ đọng: phần vượt MAX ở kho xuất lẽ ra phải nằm chờ tới khi kho đó tự bán hết
        const excessOverMax = Math.max(0, sEff - sP.qmax);
        const sDaily = Math.max(0.1, (sP.f_next || 0) / 7);
        const clearDays = Math.min(90, Math.max(7, excessOverMax / sDaily));
        const capitalBenefit = Math.round(Math.min(qty, excessOverMax) * sku.cogs * dailyHolding * clearDays);
        const shortCost = shortageUnits(days) * margin;
        const uncovered = Math.max(0, reqQty - qty);
        const total = freight + transitCapital + shortCost - capitalBenefit;
        let reason = '';
        if (transferable < 1) reason = 'Không còn tồn dư (kho xuất phải giữ mức an toàn)';
        else if (unitFreight > margin * 0.5) reason = 'Cước/đv vượt 50% biên lợi nhuận gộp';
        return {
          type: 'TRANSFER', srcWh: w.code, name: w.name,
          on_hand: sSt.on_hand, eff: sEff, rop: sP.rop, qmax: sP.qmax,
          status: getStatus(sEff, sP), transferable, hardTransferable, qty, days, unitFreight, freight,
          excessOverMax, capitalBenefit, tripFee, transitCapital, shortCost, uncovered, total, eligible: !reason, reason,
          releasedQty: rel
        };
      });

      // RFQ: phải chi tiền mua mới (giá vốn NCC) + phí đặt hàng + rủi ro thiếu hàng trong lead time NCC
      const supLead = Math.max(1, Math.round((p.L || ((sku.lead + (sku.delay || 0)) / 7)) * 7));
      const rfqShort = shortageUnits(supLead) * margin;
      // Vốn mua mới (tiền chi ra) + phí đặt hàng + vốn nằm chờ trong lead time NCC + rủi ro thiếu hàng
      const purchaseValue = rfqQty * sku.cogs;
      const waitCapital = Math.round(purchaseValue * (PARAMS.dailyHoldingWaitRate || 0.0005) * supLead);
      const rfqTotal = purchaseValue + orderCost + waitCapital + rfqShort;
      const rfq = {
        type: 'RFQ', sup: sku.sup, qty: rfqQty, days: supLead,
        purchaseValue, orderCost, waitCapital, shortCost: rfqShort,
        total: rfqTotal, unitCost: rfqTotal / rfqQty, eligible: true
      };

      // Chi phí bình quân để đáp ứng toàn bộ nhu cầu: phần thiếu còn lại tính theo đơn giá RFQ
      sources.forEach(x => {
        x.unitCost = x.qty > 0 ? x.total / x.qty : Infinity;
        x.coverCost = x.total + x.uncovered * rfq.unitCost;
      });
      const eligibleSources = sources.filter(x => x.eligible).sort((a, b) => {
        if (a.coverCost !== b.coverCost) return a.coverCost - b.coverCost;
        return a.days - b.days;
      });
      const bestTransfer = eligibleSources[0] || null;
      const best = (bestTransfer && bestTransfer.unitCost <= rfq.unitCost) ? bestTransfer : rfq;

      return {
        sku, toWh, params: p, eff, qNeed, reqQty, rfqQty, safeTarget: getSafeTarget(p), sources, rfq, bestTransfer, best,
        savingVsRfq: best.type === 'TRANSFER' ? Math.max(0, Math.round(rfq.unitCost * best.qty - best.total)) : 0
      };
    }

    // UNIFIED EVENTS LIST

    function approveAllPendingTransfers() {
      let count = 0;
      const keys = Object.keys(Store.proposals);
      keys.forEach(k => {
        const p = Store.proposals[k];
        if (p && p.type === 'TRANSFER' && p.status === 'Chờ duyệt') {
          const srcSt = Store.stock[p.srcWh][p.sku];
          const safety = checkTransferSafety(p.sku, p.srcWh, p.qty, Store.currentDate, p.qty);

          if (safety.ok) {
            srcSt.on_hand -= p.qty;
            srcSt.committed = Math.max(0, srcSt.committed - p.qty);
            Store.stock[p.dstWh][p.sku].in_transit += p.qty;
            const trId = padSeq('TR');
            Store.transfers.unshift({
              id: trId,
              date: Store.currentDate,
              sku: p.sku,
              srcWh: p.srcWh,
              dstWh: p.dstWh,
              qty: p.qty,
              shipDate: Store.currentDate,
              arrivalDate: p.arrivalDate,
              status: 'Đang chuyển',
              cost: calcFreightCost(p.srcWh, p.dstWh, p.sku, p.qty, Store.currentDate)
            });
            delete Store.proposals[k];
            logAction('APPROVE_TRANSFER', trId, `Lệnh chuyển ${p.qty} ${p.sku} (${p.srcWh} -> ${p.dstWh})`, p.freightCost);
            count++;
          }
        }
      });

      if (count > 0) {
        showToast(`Đã duyệt tự động ${count} lệnh điều chuyển hợp lệ!`, 'success');
        refreshAfterStockChange();
      } else {
        showToast('Không có đề xuất điều chuyển hợp lệ nào để duyệt.', 'info');
      }
    }

        function acceptTransferInbound(transferId) {
      const tr = Store.transfers.find(t => t.id === transferId);
      if (!tr || tr.status !== 'Chờ kho nhận đồng ý') return;

      const srcSt = Store.stock[tr.srcWh][tr.sku];
      // Lệnh "Chờ kho nhận đồng ý" đã được giữ chỗ trong committed của kho xuất
      const safety = checkTransferSafety(tr.sku, tr.srcWh, tr.qty, Store.currentDate, Math.min(tr.qty, srcSt.committed));

      if (!safety.ok) {
        showToast(`Kho xuất ${tr.srcWh} hiện không còn đủ tồn khả dụng an toàn!`, 'error');
        return;
      }

      // Trừ hàng tại kho xuất và đưa vào in_transit của kho nhận
      srcSt.on_hand -= tr.qty;
      srcSt.committed = Math.max(0, srcSt.committed - tr.qty);
      Store.stock[tr.dstWh][tr.sku].in_transit += tr.qty;
      tr.status = 'Đang chuyển';
      tr.shipDate = Store.currentDate;
      const tDays = getTransferDays(tr.srcWh, tr.dstWh);
      tr.arrivalDate = addDays(Store.currentDate, tDays);

      pushNotification('TRANSFER_APPROVED', tr.id, `Kho nhận ${tr.dstWh} đã đồng ý tiếp nhận ${tr.qty} ${tr.sku} từ ${tr.srcWh}. Hàng bắt đầu lăn bánh!`);
      logAction('TRANSFER_ACCEPTED', tr.id, `Kho ${tr.dstWh} đồng ý tiếp nhận đơn chuyển ${tr.qty} ${tr.sku} từ ${tr.srcWh}`, tr.cost);
      showToast(`Kho ${tr.dstWh} đã xác nhận tiếp nhận đơn chuyển ${tr.id}. Hàng đang vận chuyển!`, 'success');
      refreshAfterStockChange();
    }

    function rejectTransferInbound(transferId) {
      const tr = Store.transfers.find(t => t.id === transferId);
      if (!tr || tr.status !== 'Chờ kho nhận đồng ý') return;

      tr.status = 'Bị từ chối';
      const rejSrcSt = Store.stock[tr.srcWh] ? Store.stock[tr.srcWh][tr.sku] : null;
      if (rejSrcSt) rejSrcSt.committed = Math.max(0, rejSrcSt.committed - tr.qty);
      pushNotification('TRANSFER_REJECTED', tr.id, `Kho nhận ${tr.dstWh} đã từ chối đơn chuyển ${tr.qty} ${tr.sku} từ ${tr.srcWh}.`);
      logAction('TRANSFER_REJECTED', tr.id, `Kho ${tr.dstWh} từ chối đơn chuyển ${tr.qty} ${tr.sku} từ ${tr.srcWh}`);
      showToast(`Đã từ chối đơn điều chuyển ${tr.id}`, 'info');
      refreshAfterStockChange();
    }

    function receiveTransferEarly(transferId) {
      receiveShipment(transferId);
    }

    // ----------------------------------------------------------------------------
    // 2.11 MANUAL TRANSFER CONTROLS (Yêu cầu 2.4)
    // ----------------------------------------------------------------------------
    function openManualTransferModal(defaultSku, defaultSrc, defaultDst, defaultQty) {
      const skuSel = document.getElementById('trfSku');
      if (skuSel) {
        skuSel.innerHTML = SKUS.map(s =>
          `<option value="${s.code}" ${s.code === defaultSku ? 'selected' : ''}>${s.code} - ${s.name}</option>`
        ).join('');
      }
      if (defaultSrc) {
        const srcSel = document.getElementById('trfFromWh');
        if (srcSel) srcSel.value = defaultSrc;
      }
      if (defaultDst) {
        const dstSel = document.getElementById('trfToWh');
        if (dstSel) dstSel.value = defaultDst;
      }
      if (defaultQty) {
        const qtyInp = document.getElementById('trfQty');
        if (qtyInp) qtyInp.value = defaultQty;
      }
      const dateInp = document.getElementById('trfDate');
      if (dateInp) dateInp.value = fmtDateVN(Store.currentDate);

      validateManualTransfer();
      openModal('manualTransferModal');
    }

    function validateManualTransfer() {
      const skuCode = document.getElementById('trfSku') ? document.getElementById('trfSku').value : 'TLM-045';
      const srcWh   = document.getElementById('trfFromWh') ? document.getElementById('trfFromWh').value : 'BD';
      const dstWh   = document.getElementById('trfToWh') ? document.getElementById('trfToWh').value : 'HCM';
      const qty     = parseInt(document.getElementById('trfQty') ? document.getElementById('trfQty').value : 0, 10) || 0;
      const fb      = document.getElementById('manualTransferFeedback');
      const btn     = document.getElementById('btnConfirmManualTransfer');
      if (!fb || !btn) return;

      if (srcWh === dstWh) {
        fb.innerHTML = '<span style="color:var(--status-red);font-weight:600;">❌ Kho xuất và kho nhận không được trùng nhau!</span>';
        fb.style.background = '#FEE2E2';
        btn.disabled = true;
        return;
      }

      if (qty <= 0) {
        fb.innerHTML = '<span style="color:var(--status-red);font-weight:600;">❌ Số lượng chuyển phải > 0!</span>';
        fb.style.background = '#FEE2E2';
        btn.disabled = true;
        return;
      }

      const st = Store.stock[srcWh][skuCode];
      const p  = calcSKUParams(skuCode, srcWh, Store.currentDate, Store.history);
      const eff = st.on_hand + st.in_transit - st.committed;
      const physicalFree = st.on_hand - st.committed;

      if (qty > physicalFree) {
        fb.innerHTML = `<span style="color:var(--status-red);font-weight:600;">❌ Tồn kho vật lý không đủ: Kho ${srcWh} chỉ còn ${physicalFree} sản phẩm khả dụng (đã trừ hàng giữ chỗ)!</span>`;
        fb.style.background = '#FEE2E2';
        btn.disabled = true;
        return;
      }

      if ((eff - qty) <= p.rop) {
        fb.innerHTML = `
          <span style="color:var(--status-red);font-weight:600;">
            ❌ Vi phạm an toàn: Tồn sau chuyển (${eff - qty}) sẽ <= ROP (${p.rop}) tại kho ${srcWh}. Hệ thống từ chối lệnh!
          </span>
        `;
        fb.style.background = '#FEE2E2';
        btn.disabled = true;
        return;
      }

      const tDays = getTransferDays(srcWh, dstWh);
      const totalFreight = calcFreightCost(srcWh, dstWh, skuCode, qty, Store.currentDate);

      fb.innerHTML = `
        <span style="color:var(--status-green);font-weight:600;">
          ✅ Hợp lệ: Kho xuất an toàn (${eff - qty} > ROP ${p.rop}). Cước vận chuyển: ${fmtVND(totalFreight)} (${tDays} ngày).
        </span>
      `;
      fb.style.background = '#ECFDF5';
      btn.disabled = false;
    }

    function executeManualTransfer() {
      const skuCode = document.getElementById('trfSku').value;
      const srcWh   = document.getElementById('trfFromWh').value;
      const dstWh   = document.getElementById('trfToWh').value;
      const qty     = parseInt(document.getElementById('trfQty').value, 10) || 0;

      const st = Store.stock[srcWh][skuCode];
      const p  = calcSKUParams(skuCode, srcWh, Store.currentDate, Store.history);
      const eff = st.on_hand + st.in_transit - st.committed;

      const safety = checkTransferSafety(skuCode, srcWh, qty, Store.currentDate);
      if (srcWh === dstWh || !safety.ok) {
        showToast(safety.msg || 'Lỗi: Kho xuất và kho nhận trùng nhau!', 'error');
        return;
      }

      const tDays = getTransferDays(srcWh, dstWh);
      const totalFreight = calcFreightCost(srcWh, dstWh, skuCode, qty, Store.currentDate);
      const trId = padSeq('TR');

      st.on_hand -= qty;
      Store.stock[dstWh][skuCode].in_transit += qty;

      Store.transfers.unshift({
        id: trId,
        date: Store.currentDate,
        sku: skuCode,
        srcWh: srcWh,
        dstWh: dstWh,
        qty: qty,
        shipDate: Store.currentDate,
        arrivalDate: addDays(Store.currentDate, tDays),
        status: 'Đang chuyển',
        cost: totalFreight
      });

      closeModal('manualTransferModal');
      pushNotification('TRANSFER_APPROVED', trId, `Tạo lệnh chuyển thủ công ${qty} ${skuCode} (${srcWh} -> ${dstWh})`);
      logAction('MANUAL_TRANSFER', trId, `Lệnh chuyển ${qty} ${skuCode} (${srcWh} -> ${dstWh}), chi phí: ${fmtVND(totalFreight)}`, totalFreight);
      showToast(`Đã tạo thành công lệnh điều chuyển ${trId}`, 'success');
      refreshAfterStockChange();
    }

    // ----------------------------------------------------------------------------


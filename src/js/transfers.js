// ============================================================================
// INTERNAL TRANSFERS & FREIGHT RATES
// ============================================================================

    function getRouteMultiplier(fromWh, toWh) {
      if (fromWh === toWh) return 0;
      const sameSouth = (fromWh === 'HCM' && toWh === 'BD') || (fromWh === 'BD' && toWh === 'HCM');
      if (sameSouth) return 1.0;
      const centralNorth = (fromWh === 'DN' && toWh === 'HN') || (fromWh === 'HN' && toWh === 'DN');
      if (centralNorth) return 1.5;
      const haGiangNorth = (fromWh === 'HN' && toWh === 'HG') || (fromWh === 'HG' && toWh === 'HN');
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

    // ----------------------------------------------------------------------------
    // HÀM THỐNG NHẤT TẠO LỆNH CHUYỂN KHO (TRÁNH NHÂN BẢN LOGIC)
    // ----------------------------------------------------------------------------
    function createTransfer(options) {
      // options: { sku, srcWh, dstWh, qty, note, source, proposalKey, savingVsRfq, releasedQty }
      const { sku, srcWh, dstWh, qty, note = '', source = 'MANUAL', proposalKey = null, savingVsRfq = 0, releasedQty = null } = options;

      // Kiểm tra đầu vào
      if (!sku || !srcWh || !dstWh || qty <= 0) {
        return { ok: false, msg: 'Dữ liệu không hợp lệ: SKU, kho nguồn, kho đích và số lượng là bắt buộc.' };
      }
      if (srcWh === dstWh) {
        return { ok: false, msg: 'Kho xuất và kho nhận không được trùng nhau!' };
      }
      if (Store.ui && Store.ui.viewDate) {
        return { ok: false, msg: 'Đang xem lại ngày cũ — hãy quay về hiện tại để tạo lệnh chuyển.' };
      }

      // Lấy phần giữ chỗ để không trừ 2 lần: ưu tiên releasedQty truyền trực tiếp (lệnh XC),
      // nếu không thì tra theo đề xuất hiện tại (nếu có)
      let rel;
      if (releasedQty !== null && releasedQty !== undefined) {
        rel = releasedQty;
      } else {
        const reserved = proposalKey ? getReservedQtyOfProposal(proposalKey) : null;
        rel = (reserved && reserved.srcWh === srcWh) ? reserved.qty : 0;
      }

      // Kiểm tra an toàn kho xuất với releasedQty
      const safety = checkTransferSafety(sku, srcWh, qty, Store.currentDate, rel);
      if (!safety.ok) {
        return { ok: false, msg: safety.msg };
      }

      // Kiểm tra kho đích không vượt mức an toàn (giới hạn chặt hơn MAX, khớp engine đề xuất)
      const dstSt = Store.stock[dstWh][sku];
      const dstP = calcSKUParams(sku, dstWh, Store.currentDate, Store.history);
      const dstSafe = Math.floor(getSafeTarget(dstP));
      const dstEffAfter = dstSt.on_hand + dstSt.in_transit - dstSt.committed + qty;
      if (dstEffAfter > dstSafe) {
        return { ok: false, msg: `Kho ${dstWh} sẽ vượt mức an toàn (${dstEffAfter} > ${dstSafe}, MAX=${dstP.qmax}) nếu nhận ${qty} ${sku}. Giảm số lượng hoặc chọn kho khác.` };
      }

      // Tính cước vận chuyển
      const tDays = getTransferDays(srcWh, dstWh, Store.currentDate);
      const totalFreight = calcFreightCost(srcWh, dstWh, sku, qty, Store.currentDate);

      // Cập nhật tồn kho - chỉ giảm committed đúng phần đã giữ của đề xuất này
      const srcSt = Store.stock[srcWh][sku];
      srcSt.on_hand -= qty;
      srcSt.committed = Math.max(0, srcSt.committed - rel);
      dstSt.in_transit += qty;

      // Tạo record lệnh chuyển
      const trId = padSeq('TR');
      const transferRec = {
        id: trId,
        kind: 'TRANSFER',
        date: Store.currentDate,
        sku: sku,
        srcWh: srcWh,
        dstWh: dstWh,
        qty: qty,
        shipDate: Store.currentDate,
        arrivalDate: addDays(Store.currentDate, tDays),
        status: 'Đang chuyển',
        cost: totalFreight,
        savingVsRfq: savingVsRfq,
        note: note || getTransferNoteBySource(source)
      };
      Store.transfers.unshift(transferRec);

      // Xóa proposal nếu có
      if (proposalKey && Store.proposals[proposalKey]) {
        delete Store.proposals[proposalKey];
      }

      // Ánh xạ source → log type
      const logTypeMap = {
        'PROPOSAL': 'APPROVE_TRANSFER',
        'BATCH_APPROVE': 'BATCH_APPROVE_TRANSFER',
        'OVERSTOCK': 'SAN_TAI_2A',
        'MODAL_COMPARE': 'TRANSFER_FROM_COMPARE',
        'SRC_CONFIRM': 'CONFIRM_OUTBOUND_TRANSFER',
        'MANUAL': 'MANUAL_TRANSFER'
      };
      const logType = logTypeMap[source] || 'MANUAL_TRANSFER';

      // Log và notification
      const logMsg = `Lệnh chuyển ${qty} ${sku} (${srcWh} -> ${dstWh}), dự kiến ${tDays} ngày, cước: ${fmtVND(totalFreight)}`;
      const notifMsg = getTransferNotifMsg(source, qty, sku, srcWh, dstWh);

      logAction(logType, trId, logMsg, totalFreight, dstWh, {
        sku: sku,
        ledgerDeltas: {
          [srcWh]: { on_hand: -qty, in_transit: 0, on_order: 0 },
          [dstWh]: { on_hand: 0, in_transit: qty, on_order: 0 }
        }
      });
      pushNotification('TRANSFER_APPROVED', trId, notifMsg, dstWh);

      return { ok: true, msg: `Đã tạo thành công lệnh điều chuyển ${trId}`, transfer: transferRec };
    }

    // ----------------------------------------------------------------------------
    // BƯỚC 1 CỦA FLOW HAI BƯỚC: TẠO YÊU CẦU GỬI HÀNG (XC) DÙNG CHUNG
    //    Mọi hành động "tôi đồng ý nhận" từ kho nhận (duyệt đề xuất, duyệt hàng loạt,
    //    modal so sánh) đều đi qua đây — kho nguồn còn phải xác nhận gửi thật.
    // ----------------------------------------------------------------------------
    function createTransferRequest(options) {
      const { sku, srcWh, dstWh, qty, note = '', savingVsRfq = 0, proposalKey = null } = options;

      if (!sku || !srcWh || !dstWh || qty <= 0) {
        return { ok: false, msg: 'Dữ liệu không hợp lệ: SKU, kho nguồn, kho đích và số lượng là bắt buộc.' };
      }
      if (srcWh === dstWh) {
        return { ok: false, msg: 'Kho xuất và kho nhận không được trùng nhau!' };
      }
      if (Store.ui && Store.ui.viewDate) {
        return { ok: false, msg: 'Đang xem lại ngày cũ — hãy quay về hiện tại để nhận hàng.' };
      }

      const reserved = proposalKey ? getReservedQtyOfProposal(proposalKey) : null;
      const rel = (reserved && reserved.srcWh === srcWh) ? reserved.qty : 0;
      const safety = checkTransferSafety(sku, srcWh, qty, Store.currentDate, rel);
      if (!safety.ok) {
        return { ok: false, msg: safety.msg };
      }

      const dstSt = Store.stock[dstWh][sku];
      const dstP = calcSKUParams(sku, dstWh, Store.currentDate, Store.history);
      const dstSafe = Math.floor(getSafeTarget(dstP));
      const dstEffAfter = dstSt.on_hand + dstSt.in_transit - dstSt.committed + qty;
      if (dstEffAfter > dstSafe) {
        return { ok: false, msg: `Kho ${dstWh} sẽ vượt mức an toàn (${dstEffAfter} > ${dstSafe}) nếu nhận ${qty} ${sku}. Giảm số lượng hoặc chọn kho khác.` };
      }

      const skuObj = SKUS.find(s => s.code === sku) || { cogs: 0 };
      const tDays = getTransferDays(srcWh, dstWh, Store.currentDate);
      const rec = {
        id: padSeq('XC'),
        kind: 'TRANSFER',
        date: Store.currentDate,
        sku: sku,
        srcWh: srcWh,
        dstWh: dstWh,
        qty: qty,
        shipDate: null,
        arrivalDate: addDays(Store.currentDate, tDays),
        leadDays: tDays,
        status: 'Chờ kho nguồn xác nhận',
        cost: calcFreightCost(srcWh, dstWh, sku, qty, Store.currentDate),
        savingVsRfq: savingVsRfq,
        value: qty * skuObj.cogs,
        note: note || `Kho ${dstWh} đồng ý nhận — chờ kho ${srcWh} xác nhận gửi hàng`
      };
      Store.transfers.unshift(rec);
      if (proposalKey && Store.proposals[proposalKey]) {
        delete Store.proposals[proposalKey];
      }
      pushNotification('TRANSFER_REQUEST', rec.id,
        `Yêu cầu điều chuyển ${rec.id}: ${qty} ${sku} từ ${srcWh} về ${dstWh} — mở "Chi tiết" để xem tồn kho hiện tại trước khi xác nhận gửi.`, srcWh);
      logAction('REQUEST_TRANSFER', rec.id,
        `Kho ${dstWh} xác nhận nhận ${qty} ${sku}; tạo lệnh ${rec.id} chờ kho ${srcWh} gửi.`);
      return { ok: true, msg: `Đã gửi yêu cầu ${rec.id} sang kho ${srcWh}. Bên đó bấm "Xác nhận gửi hàng" để hoàn tất.`, transfer: rec };
    }

    // Helper: ghi chú theo nguồn
    function getTransferNoteBySource(source) {
      const noteMap = {
        'PROPOSAL': 'Duyệt đề xuất bù tồn',
        'BATCH_APPROVE': 'Duyệt hàng loạt',
        'OVERSTOCK': 'San tải tồn dư vượt MAX',
        'MODAL_COMPARE': 'Từ modal so sánh',
        'SRC_CONFIRM': 'Kho nguồn xác nhận gửi hàng',
        'MANUAL': 'Lệnh chuyển thủ công'
      };
      return noteMap[source] || 'Lệnh chuyển';
    }

    // Helper: thông báo theo nguồn
    function getTransferNotifMsg(source, qty, sku, srcWh, dstWh) {
      const msgMap = {
        'PROPOSAL': `Đã duyệt lệnh chuyển ${qty} ${sku} (${srcWh} -> ${dstWh})`,
        'BATCH_APPROVE': `Đã duyệt hàng loạt lệnh chuyển ${qty} ${sku} (${srcWh} -> ${dstWh})`,
        'OVERSTOCK': `Đã thực hiện san tải ${qty} ${sku} (${srcWh} -> ${dstWh})`,
        'MODAL_COMPARE': `Đã tạo lệnh chuyển ${qty} ${sku} (${srcWh} -> ${dstWh})`,
        'SRC_CONFIRM': `Kho ${srcWh} đã xác nhận gửi ${qty} ${sku} sang ${dstWh}`,
        'MANUAL': `Đã tạo lệnh chuyển thủ công ${qty} ${sku} (${srcWh} -> ${dstWh})`
      };
      return msgMap[source] || `Đã tạo lệnh chuyển ${qty} ${sku} (${srcWh} -> ${dstWh})`;
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
      if (mode === 'manual') {
        pushNotification(isSup ? 'SUPPLIER_RECEIVE' : 'TRANSFER_ARRIVED', tr.id,
          `${tr.receiveTiming}: nhập kho ${tr.dstWh} ${tr.qty} ${tr.sku} từ ${fromTxt}.`, tr.dstWh);
      }
      logAction(isSup ? 'SUPPLIER_RECEIVE' : 'TRANSFER_ARRIVED', tr.id,
        `${tr.receiveTiming}: nhận ${tr.qty} ${tr.sku} từ ${fromTxt} vào kho ${tr.dstWh} (dự kiến ${tr.arrivalDate})`, 0, tr.dstWh, {
          sku: tr.sku,
          ledgerDeltas: {
            [tr.dstWh]: { on_hand: tr.qty, in_transit: -tr.qty, on_order: 0 }
          }
        });
    }

    // Giao sớm (trước ngày dự kiến) / Đúng hạn / Nhận trễ n ngày (không giới hạn thời gian nhận)
    function getReceiveTiming(tr, curDate) {
      const diff = Math.round((new Date(curDate) - new Date(tr.arrivalDate)) / 86400000);
      if (diff < 0) return { code: 'EARLY', diff, label: 'Nhận sớm', action: 'Nhận sớm' };
      if (diff === 0) return { code: 'ONTIME', diff, label: 'Nhận đúng hạn', action: 'Xác nhận nhận hàng' };
      return { code: 'LATE', diff, label: `Nhận trễ ${diff} ngày`, action: 'Xác nhận nhập trễ' };
    }

    // Lô hàng tới ngày dự kiến -> TỰ NHẬP KHO NGAY (in_transit → on_hand).
    //    Comment cũ ghi "quá 1 ngày tự nhập kho" nhưng code không làm: hàng đã về thực tế,
    //    phải công nhận tồn ngay để không tính in_transit vào eff (tránh hiện OK/HIGH khi tồn thực = 0).
    function processShipmentArrivals(curDate) {
      const byWh = {};
      Store.transfers.forEach(tr => {
        if (tr.status === 'Đang chuyển' && tr.arrivalDate <= curDate) {
          // Tự động nhập kho: chuyển in_transit → on_hand, trạng thái → Đã nhận
          applyShipmentReceipt(tr, 'auto');
          (byWh[tr.dstWh] = byWh[tr.dstWh] || []).push(tr);
        }
      });
      Object.keys(byWh).forEach(wh => {
        const list = byWh[wh];
        const first = list[0];
        const text = list.length === 1
          ? `Lô ${first.id}: ${first.qty} ${first.sku} đã về kho ${wh} và đã được nhập kho tự động.`
          : `${list.length} lô hàng đã về kho ${wh} (${list.map(t => t.id).join(', ')}) và đã được nhập kho tự động.`;
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
    // Phương án điều chuyển chỉ hợp lệ khi kho xuất an toàn (> ROP) và cước thực tế/đv (gồm phí chuyến)
    // không vượt quá PARAMS.freightMarginCap × biên lợi nhuận gộp.
    function evaluateReplenishmentOptions(skuCode, toWh, curDate, opts) {
      const o = opts || {};
      const sku = SKUS.find(s => s.code === skuCode);
      const p = calcSKUParams(skuCode, toWh, curDate, Store.history);
      const st = Store.stock[toWh][skuCode];
      const eff = st.on_hand + st.in_transit - st.committed;
      // Điều chuyển chỉ bù tới mức an toàn; RFQ (lead time dài) đặt bù tới MAX theo chính sách Min/Max
      const qNeed = Math.max(1, getSafeTarget(p) - eff);
      const reqQty = Math.max(1, o.qty || qNeed);
      const rfqQty = Math.max(1, o.qty || (p.qmax - eff));
      const reserved = getReservedQtyOfProposal(o.excludeKey || `${skuCode}-${toWh}`);

      const margin = Math.max(0, sku.price - sku.cogs);
      // Chi phí mất bán = biên LN + thiệt hại giữ chân khách hàng (PARAMS.stockoutPenaltyMult)
      const shortMargin = margin * (PARAMS.stockoutPenaltyMult || 1.0);
      const dailyDemand = Math.max(0, (p.f_next || 0) / 7);
      const dailyHolding = (PARAMS.holdingRate || 0.2) / 365;
      const orderCost = PARAMS.orderCostFixed || 500000;
      const shortageUnits = days => Math.max(0, Math.ceil(dailyDemand * days) - Math.max(0, eff));

      // Sức chứa còn lại của kho nhận theo đúng trần kiểm tra trong createTransfer (mức an toàn, chặt hơn MAX)
      const dstRoom = Math.max(0, Math.floor(getSafeTarget(p) - (st.on_hand + st.in_transit - st.committed)));

      const blocked = (o && o.blockedSrcWhs) || [];
      const sources = WAREHOUSES.filter(w => w.code !== toWh && !blocked.includes(w.code)).map(w => {
        const sSt = Store.stock[w.code][skuCode];
        const sP = calcSKUParams(skuCode, w.code, curDate, Store.history);
        const rel = (reserved && reserved.srcWh === w.code) ? reserved.qty : 0;
        const sEff = sSt.on_hand + sSt.in_transit - sSt.committed + rel;
        const transferable = getAiTransferableQty(skuCode, w.code, curDate, rel);
        const hardTransferable = getTransferableQty(skuCode, w.code, curDate, rel);
        // Giới hạn theo sức chứa kho nhận để đề xuất luôn khả thi khi bấm "Xử lý"
        const qty = Math.min(reqQty, transferable, dstRoom);
        const days = getTransferDays(w.code, toWh, curDate);
        const unitFreight = getUnitFreightRate(w.code, toWh, skuCode);
        const freight = calcFreightCost(w.code, toWh, skuCode, qty, curDate);
        const tripFee = Math.max(0, freight - qty * unitFreight);
        // Cước thực tế trên mỗi đơn vị đã chia cả phí chuyến (nếu chưa có xe chung tuyến) — dùng cho ngưỡng 50%
        const landedUnitFreight = qty > 0 ? freight / qty : Infinity;
        // Vốn hàng nằm trên đường (không bán được trong lúc vận chuyển)
        const transitCapital = Math.round(qty * sku.cogs * (PARAMS.dailyHoldingWaitRate || 0.0005) * days);
        // Giải phóng vốn ứ đọng: phần vượt MAX ở kho xuất lẽ ra phải nằm chờ tới khi kho đó tự bán hết
        const excessOverMax = Math.max(0, sEff - sP.qmax);
        const sDaily = Math.max(0.1, (sP.f_next || 0) / 7);
        const clearDays = Math.min(90, Math.max(7, excessOverMax / sDaily));
        const capitalBenefit = Math.round(Math.min(qty, excessOverMax) * sku.cogs * dailyHolding * clearDays);
        const shortCost = shortageUnits(days) * shortMargin;
        const uncovered = Math.max(0, reqQty - qty);
        const total = freight + transitCapital + shortCost - capitalBenefit;
        let reason = '';
        if (transferable < 1) reason = 'Không còn tồn dư (kho xuất phải giữ mức an toàn)';
        else if (landedUnitFreight > margin * (PARAMS.freightMarginCap || 0.5)) reason = `Cước thực tế ${fmtVND(Math.round(landedUnitFreight))}/đv (gồm phí chuyến) vượt ${Math.round((PARAMS.freightMarginCap || 0.5) * 100)}% biên lợi nhuận gộp`;
        else if (dstRoom < 1) reason = 'Kho nhận đã trên mức an toàn';
        return {
          type: 'TRANSFER', srcWh: w.code, name: w.name,
          on_hand: sSt.on_hand, eff: sEff, rop: sP.rop, qmax: sP.qmax,
          status: getStatus(sEff, sP), transferable, hardTransferable, qty, days, unitFreight, landedUnitFreight, freight, dstRoom,
          excessOverMax, capitalBenefit, tripFee, transitCapital, shortCost, uncovered, total, eligible: !reason, reason,
          releasedQty: rel
        };
      });

      // RFQ: phải chi tiền mua mới (giá vốn NCC) + phí đặt hàng + rủi ro thiếu hàng trong lead time NCC
      const supLead = Math.max(1, p.leadDays || ((sku.lead || 0) + (sku.delay || 0)));
      const rfqShort = shortageUnits(supLead) * shortMargin;
      const purchaseValue = rfqQty * sku.cogs;                                   // tiền hàng (mua tài sản tồn kho) — hiển thị thôi, không so sánh
      const waitCapital = Math.round(purchaseValue * (PARAMS.dailyHoldingWaitRate || 0.0005) * supLead);
      // NGÂN SÁCH DỰ KIẾN RFQ = chi phí BIÊN để có thêm hàng (phí đặt hàng + vốn chờ về + thiếu hàng trong lead).
      // Không cộng purchaseValue: hai phương án cùng giao về kho đúng số đơn vị đó, tiền hàng không phải chi phí chênh lệch.
      const rfqBudget = orderCost + waitCapital + rfqShort;
      const rfq = {
        type: 'RFQ', sup: sku.sup, qty: rfqQty, days: supLead,
        purchaseValue, orderCost, waitCapital, shortCost: rfqShort,
        total: rfqBudget, unitCost: rfqBudget / rfqQty, eligible: true
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
        // Tiết kiệm của lệnh chuyển = ngân sách dự kiến RFQ cho cùng số đơn vị − tổng chi phí biên của lệnh chuyển
        savingVsRfq: best.type === 'TRANSFER' ? Math.max(0, Math.round(rfq.unitCost * best.qty - best.total)) : 0
      };
    }

    // UNIFIED EVENTS LIST

    // "Duyệt tất cả" = kho nhận đồng ý hàng loạt → tạo XC hàng loạt (đúng flow 2 bước),
    // kho nguồn dùng "Xác nhận tất cả gửi hàng" để hoàn tất.
    function approveAllPendingTransfers() {
      let count = 0;
      const keys = Object.keys(Store.proposals).filter(k => {
        const p = Store.proposals[k];
        return p && p.type === 'TRANSFER' && p.status === 'Chờ duyệt';
      });
      keys.forEach(k => {
        const p = Store.proposals[k];
        if (!p) return;
        const result = createTransferRequest({
          sku: p.sku,
          srcWh: p.srcWh,
          dstWh: p.dstWh,
          qty: p.qty,
          note: `Duyệt hàng loạt — chờ kho ${p.srcWh} xác nhận gửi`,
          savingVsRfq: p.savingVsRfq || 0,
          proposalKey: k
        });
        if (result.ok) count++;
      });

      if (count > 0) {
        showToast(`Đã gửi ${count} yêu cầu sang kho nguồn — chờ bên đó "Xác nhận gửi hàng".`, 'success');
        refreshAfterStockChange();
      } else {
        showToast('Không có đề xuất điều chuyển hợp lệ nào để duyệt.', 'info');
      }
    }

    // Kho nguồn xác nhận hàng loạt mọi lệnh XC đang chờ của kho mình
    function confirmAllTransferOutbound() {
      const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
      const ids = Store.transfers
        .filter(t => t.kind === 'TRANSFER' && t.status === 'Chờ kho nguồn xác nhận' && t.srcWh === activeWh)
        .map(t => t.id);
      if (ids.length === 0) {
        showToast('Kho này không có yêu cầu gửi hàng nào đang chờ.', 'info');
        return;
      }
      let ok = 0;
      ids.forEach(id => {
        const before = Store.transfers.filter(t => t.status === 'Đang chuyển').length;
        confirmTransferOutbound(id);
        const after = Store.transfers.filter(t => t.status === 'Đang chuyển').length;
        if (after > before) ok++;
      });
      if (ok < ids.length) {
        showToast(`Đã xác nhận gửi ${ok}/${ids.length} lệnh. ${ids.length - ok} lệnh cần xử lý riêng (xem thông báo lỗi).`, 'warning');
      }
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

      // Kiểm tra kho_dest không vượt mức an toàn (nhất quán với createTransfer)
      const dstSt = Store.stock[dstWh][skuCode];
      const dstP = calcSKUParams(skuCode, dstWh, Store.currentDate, Store.history);
      const dstSafe = Math.floor(getSafeTarget(dstP));
      const dstEffAfter = dstSt.on_hand + dstSt.in_transit - dstSt.committed + qty;
      if (dstEffAfter > dstSafe) {
        fb.innerHTML = `<span style="color:var(--status-red);font-weight:600;">❌ Kho ${dstWh} sẽ vượt mức an toàn (${dstEffAfter} > ${dstSafe}). Hãy giảm số lượng hoặc chọn kho khác!</span>`;
        fb.style.background = '#FEE2E2';
        btn.disabled = true;
        return;
      }

      const tDays = getTransferDays(srcWh, dstWh, Store.currentDate);
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

      const result = createTransfer({
        sku: skuCode,
        srcWh: srcWh,
        dstWh: dstWh,
        qty: qty,
        note: 'Lệnh chuyển thủ công',
        source: 'MANUAL'
      });

      if (!result.ok) {
        showToast(result.msg, 'error');
        return;
      }

      closeModal('manualTransferModal');
      showToast(result.msg, 'success');
      refreshAfterStockChange();
    }

    // ----------------------------------------------------------------------------
    // BƯỚC 2 CỦA QUY TRÌNH HAI BƯỚC: KHO NGUỒN XÁC NHẬN / TỪ CHƠI GỬI HÀNG
    //    (lệnh XC do kho đích đồng ý nhận tạo ra, trạng thái 'Chờ kho nguồn xác nhận')
    // ----------------------------------------------------------------------------
    function confirmTransferOutbound(recId) {
      const idx = Store.transfers.findIndex(t => t.id === recId && t.kind === 'TRANSFER' && t.status === 'Chờ kho nguồn xác nhận');
      if (idx < 0) {
        showToast('Không tìm thấy yêu cầu chờ xác nhận.', 'error');
        return;
      }
      if (Store.ui && Store.ui.viewDate) {
        showToast('Đang xem lại ngày cũ — hãy quay về hiện tại để xác nhận gửi hàng.', 'info');
        return;
      }
      const rec = Store.transfers[idx];

      // Gỡ lệnh XC khỏi danh sách rồi mới tạo lệnh chuyển chính thức,
      // phần giữ chỗ (committed) sẽ được release qua releasedQty = rec.qty
      Store.transfers.splice(idx, 1);
      const result = createTransfer({
        sku: rec.sku,
        srcWh: rec.srcWh,
        dstWh: rec.dstWh,
        qty: rec.qty,
        note: `Kho ${rec.srcWh} xác nhận gửi cho ${rec.dstWh} (theo yêu cầu ${rec.id})`,
        source: 'SRC_CONFIRM',
        releasedQty: rec.qty,
        savingVsRfq: rec.savingVsRfq || 0
      });

      if (!result.ok) {
        // Hoàn tác: đặt lại lệnh XC để giữ phần đang giữ chỗ
        Store.transfers.splice(idx, 0, rec);
        showToast(result.msg, 'error');
        return;
      }

      showToast(result.msg, 'success');
      refreshAfterStockChange();
    }

    // Cooldown tuyến vừa bị kho nguồn từ chối: không sinh lại đúng đề xuất đó trong 3 ngày
    var REJECT_COOLDOWN_DAYS = 3;
    function routeCooldownKey(sku, srcWh, dstWh) { return `${sku}|${srcWh}|${dstWh}`; }
    function markRouteRejected(sku, srcWh, dstWh, curDate) {
      Store.rejectedRoutes = Store.rejectedRoutes || {};
      Store.rejectedRoutes[routeCooldownKey(sku, srcWh, dstWh)] = addDays(curDate, REJECT_COOLDOWN_DAYS);
    }
    function getBlockedSrcWhs(skuCode, dstWh, curDate) {
      if (!Store.rejectedRoutes) return [];
      const blocked = [];
      Object.keys(Store.rejectedRoutes).forEach(k => {
        const [sku, src, dst] = k.split('|');
        if (sku !== skuCode || dst !== dstWh) return;
        if (curDate <= Store.rejectedRoutes[k]) blocked.push(src);
        else delete Store.rejectedRoutes[k];
      });
      return blocked;
    }

    function rejectTransferRequest(recId) {
      const idx = Store.transfers.findIndex(t => t.id === recId && t.kind === 'TRANSFER' && t.status === 'Chờ kho nguồn xác nhận');
      if (idx < 0) {
        showToast('Không tìm thấy yêu cầu chờ xác nhận.', 'error');
        return;
      }
      const rec = Store.transfers[idx];
      Store.transfers.splice(idx, 1);
      markRouteRejected(rec.sku, rec.srcWh, rec.dstWh, Store.currentDate);
      logAction('REJECT_OUTBOUND_REQUEST', rec.id,
        `Kho ${rec.srcWh} từ chối gửi ${rec.qty} ${rec.sku} sang ${rec.dstWh}. Tuyến này tạm ngưng đề xuất ${REJECT_COOLDOWN_DAYS} ngày.`, 0, rec.dstWh,
        { sku: rec.sku, ledgerDeltas: {} });
      pushNotification('TRANSFER_REJECTED', rec.id,
        `Kho ${rec.srcWh} từ chối gửi ${rec.qty} ${rec.sku}. Đề xuất sẽ chuyển hướng sau ${REJECT_COOLDOWN_DAYS} ngày.`, rec.dstWh);
      showToast(`Đã từ chối yêu cầu ${rec.id}. Hệ thống sẽ quét lại đề xuất.`, 'info');
      refreshAfterStockChange();
    }

    // ----------------------------------------------------------------------------


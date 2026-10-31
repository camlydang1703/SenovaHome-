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

    function calcFreightCost(fromWh, toWh, skuCode, qty) {
      if (fromWh === toWh || qty <= 0) return 0;
      const route = getRouteData(fromWh, toWh);
      const iMult = ITEM_FREIGHT_MULT[skuCode] || 1.0;
      return route.base + Math.round(qty * route.unit * iMult);
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

    // UNIFIED EVENTS LIST

    function approveAllPendingTransfers() {
      let count = 0;
      const keys = Object.keys(Store.proposals);
      keys.forEach(k => {
        const p = Store.proposals[k];
        if (p && p.type === 'TRANSFER' && p.status === 'Chờ duyệt') {
          const srcSt = Store.stock[p.srcWh][p.sku];
          const srcP  = calcSKUParams(p.sku, p.srcWh, Store.currentDate, Store.history);
          const srcEff = srcSt.on_hand + srcSt.in_transit - srcSt.committed;

          if (p.qty <= srcSt.on_hand && (srcEff - p.qty) > srcP.rop) {
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
              cost: p.freightCost
            });
            delete Store.proposals[k];
            logAction('APPROVE_TRANSFER', trId, `Lệnh chuyển ${p.qty} ${p.sku} (${p.srcWh} -> ${p.dstWh})`, p.freightCost);
            count++;
          }
        }
      });

      if (count > 0) {
        showToast(`Đã duyệt tự động ${count} lệnh điều chuyển hợp lệ!`, 'success');
        renderAllViews();
      } else {
        showToast('Không có đề xuất điều chuyển hợp lệ nào để duyệt.', 'info');
      }
    }

        function acceptTransferInbound(transferId) {
      const tr = Store.transfers.find(t => t.id === transferId);
      if (!tr || tr.status !== 'Chờ kho nhận đồng ý') return;

      const srcSt = Store.stock[tr.srcWh][tr.sku];
      const srcP  = calcSKUParams(tr.sku, tr.srcWh, Store.currentDate, Store.history);
      const srcEff = srcSt.on_hand + srcSt.in_transit - srcSt.committed;

      if (tr.qty > srcSt.on_hand || (srcEff - tr.qty) <= srcP.rop) {
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
      renderAllViews();
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
      renderAllViews();
    }

    function receiveTransferEarly(transferId) {

      const tr = Store.transfers.find(t => t.id === transferId);
      if (!tr || tr.status !== 'Đang chuyển') return;

      tr.status = 'Đã nhận';
      Store.stock[tr.dstWh][tr.sku].on_hand += tr.qty;
      Store.stock[tr.dstWh][tr.sku].in_transit = Math.max(0, Store.stock[tr.dstWh][tr.sku].in_transit - tr.qty);

      pushNotification('TRANSFER_ARRIVED', tr.id, `Tiếp nhận sớm: Lô hàng ${tr.sku} (${tr.qty}) đã nhập kho ${tr.dstWh}.`);
      logAction('TRANSFER_EARLY_RECEIVE', tr.id, `Tiếp nhận sớm lô hàng ${tr.qty} ${tr.sku} tại ${tr.dstWh}`);
      showToast(`Đã tiếp nhận thành công lô hàng ${tr.id} vào kho ${tr.dstWh}!`, 'success');
      renderAllViews();
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

      if (qty > st.on_hand) {
        fb.innerHTML = `<span style="color:var(--status-red);font-weight:600;">❌ Tồn kho vật lý không đủ: Kho ${srcWh} chỉ còn ${st.on_hand} sản phẩm!</span>`;
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
      const unitRate = getUnitFreightRate(srcWh, dstWh, skuCode);
      const totalFreight = qty * unitRate;

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

      if (qty <= 0 || qty > st.on_hand || (eff - qty) <= p.rop) {
        showToast('Lỗi: Dữ liệu không hợp lệ hoặc vi phạm an toàn kho!', 'error');
        return;
      }

      const tDays = getTransferDays(srcWh, dstWh);
      const unitRate = getUnitFreightRate(srcWh, dstWh, skuCode);
      const totalFreight = qty * unitRate;
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
      renderAllViews();
    }

    // ----------------------------------------------------------------------------


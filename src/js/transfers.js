// ============================================================================
// INTERNAL TRANSFERS & FREIGHT RATES
// ============================================================================

    function getRouteMultiplier(fromWh, toWh) {
      if (fromWh === toWh) return 0;
      const sameSouth = (fromWh === 'HCM' && toWh === 'BD') || (fromWh === 'BD' && toWh === 'HCM');
      const sameCentral = (fromWh === 'DN' && toWh === 'DN_CITY') || (fromWh === 'DN_CITY' && toWh === 'DN');
      if (sameSouth || sameCentral) return 1.0;

      const southCentral = (fromWh === 'HCM' || fromWh === 'BD') && (toWh === 'DN' || toWh === 'DN_CITY');
      const centralSouth = (fromWh === 'DN' || fromWh === 'DN_CITY') && (toWh === 'HCM' || toWh === 'BD');
      if (southCentral || centralSouth) return 1.8;

      const centralNorth = (fromWh === 'DN' || fromWh === 'DN_CITY') && toWh === 'HN';
      const northCentral = fromWh === 'HN' && (toWh === 'DN' || toWh === 'DN_CITY');
      if (centralNorth || northCentral) return 1.6;

      const southNorth = (fromWh === 'HCM' || fromWh === 'BD') && toWh === 'HN';
      const northSouth = fromWh === 'HN' && (toWh === 'HCM' || toWh === 'BD');
      if (southNorth || northSouth) return 2.2;

      return 1.8;
    }

    function getUnitFreightRate(fromWh, toWh, skuCode) {
      const rMult = getRouteMultiplier(fromWh, toWh);
      const iMult = ITEM_FREIGHT_MULT[skuCode] || 1.0;
      return Math.round(5000 * rMult * iMult);
    }

    function getTransferDays(fromWh, toWh) {
      if (fromWh === toWh) return 0;
      const rMult = getRouteMultiplier(fromWh, toWh);
      if (rMult === 1.0) return 1;
      if (rMult === 1.6 || rMult === 1.8) return 3;
      return 4;
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


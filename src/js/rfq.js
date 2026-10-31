// ============================================================================
// RFQ ORDERS MANAGEMENT (REQUEST FOR QUOTATION ONLY - NO PO)
// ============================================================================

    // 2.12 RFQ MANAGEMENT (Yêu cầu 2)
    // ----------------------------------------------------------------------------
    let activeRfqDraft = null;

    function openRfqModal(skuCode, whCode, suggestedQty, supCode) {
      const sku = SKUS.find(s => s.code === skuCode) || SKUS[0];
      const wh  = WAREHOUSES.find(w => w.code === whCode) || WAREHOUSES[0];
      const sup = supCode || sku.sup;
      const qty = suggestedQty || 100;

      activeRfqDraft = {
        sku: sku.code,
        wh: wh.code,
        sup: sup,
        qty: qty
      };

      const body = document.getElementById('rfqModalBody');
      if (body) {
        body.innerHTML = `
          <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:14px;">
            Yêu cầu Báo giá (RFQ) là chứng từ đề nghị nhà cung cấp chào giá và điều kiện thương mại,
            <strong>không làm tăng tồn kho khả dụng</strong> cho đến khi hợp đồng/đơn hàng chính thức được ký kết.
          </div>
          <div class="form-row">
            <label class="form-lbl">Sản phẩm (SKU):</label>
            <input type="text" class="form-ctrl" value="${sku.code} - ${sku.name}" readonly style="background:#F1F5F9;">
          </div>
          <div class="form-row">
            <label class="form-lbl">Kho tiếp nhận:</label>
            <input type="text" class="form-ctrl" value="${wh.name} (${wh.code})" readonly style="background:#F1F5F9;">
          </div>
          <div class="form-row">
            <label class="form-lbl">Nhà cung cấp gửi yêu cầu:</label>
            <select class="form-ctrl" id="rfqModalSup">
              ${Object.keys(SUPPLIERS).map(s =>
                `<option value="${s}" ${s === sup ? 'selected' : ''}>${s} - ${SUPPLIERS[s].name}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-row">
            <label class="form-lbl">Số lượng yêu cầu báo giá (${sku.unit}):</label>
            <input type="number" class="form-ctrl" id="rfqModalQty" min="1" value="${qty}">
          </div>
          <div class="form-row">
            <label class="form-lbl">Thời hạn hiệu lực báo giá:</label>
            <input type="text" class="form-ctrl" value="7 ngày (đến ngày ${fmtDateVN(addDays(Store.currentDate, 7))})" readonly style="background:#F1F5F9;">
          </div>
          <div class="form-row">
            <label class="form-lbl">Ghi chú & Yêu cầu kỹ thuật:</label>
            <input type="text" class="form-ctrl" id="rfqModalNotes" placeholder="Nhập quy cách đóng gói, dung sai, điều kiện thanh toán...">
          </div>
        `;
      }
      openModal('rfqModal');
    }

    function sendRfqOrder() {
      if (!activeRfqDraft) return;
      const sup = document.getElementById('rfqModalSup') ? document.getElementById('rfqModalSup').value : activeRfqDraft.sup;
      const qty = parseInt(document.getElementById('rfqModalQty') ? document.getElementById('rfqModalQty').value : 0, 10) || activeRfqDraft.qty;
      const notes = document.getElementById('rfqModalNotes') ? document.getElementById('rfqModalNotes').value : '';

      if (qty <= 0) {
        showToast('Số lượng yêu cầu phải > 0!', 'error');
        return;
      }

      const rfqId = padSeq('RFQ');
      const validUntil = addDays(Store.currentDate, 7);

      Store.rfqs.unshift({
        id: rfqId,
        date: Store.currentDate,
        sku: activeRfqDraft.sku,
        wh: activeRfqDraft.wh,
        sup: sup,
        qty: qty,
        validUntil: validUntil,
        status: 'Đã gửi NCC',
        notes: notes
      });

      // Cập nhật trạng thái đề xuất nếu có
      const pairKey = `${activeRfqDraft.sku}-${activeRfqDraft.wh}`;
      if (Store.proposals[pairKey]) {
        Store.proposals[pairKey].status = 'Đang chờ NCC báo giá';
        Store.proposals[pairKey].hasActiveRfq = true;
        Store.proposals[pairKey].rfqId = rfqId;
      }

      closeModal('rfqModal');
      pushNotification('RFQ_SENT', rfqId,
        `Đã gửi Yêu cầu Báo giá ${rfqId} (${activeRfqDraft.sku} - ${qty}) tới ${sup}.`
      );
      logAction('SEND_RFQ', rfqId,
        `Yêu cầu báo giá ${qty} ${activeRfqDraft.sku} tới NCC ${sup} cho kho ${activeRfqDraft.wh}. Hạn báo giá: ${fmtDateVN(validUntil)}`
      );
      showToast(`Đã gửi thành công Yêu cầu Báo giá ${rfqId}`, 'success');
      renderAllViews();
    }

    function cancelRfq(rfqId) {
      const rfq = Store.rfqs.find(r => r.id === rfqId);
      if (!rfq) return;

      rfq.status = 'Đã hủy';
      const pairKey = `${rfq.sku}-${rfq.wh}`;
      if (Store.proposals[pairKey] && Store.proposals[pairKey].rfqId === rfqId) {
        Store.proposals[pairKey].status = 'Chờ gửi RFQ';
        Store.proposals[pairKey].hasActiveRfq = false;
        Store.proposals[pairKey].rfqId = null;
      }

      pushNotification('RFQ_CANCELLED', rfqId, `Yêu cầu báo giá ${rfqId} đã bị hủy.`);
      logAction('CANCEL_RFQ', rfqId, `Hủy yêu cầu báo giá ${rfqId} (${rfq.sku} tại ${rfq.wh})`);
      showToast(`Đã hủy Yêu cầu Báo giá ${rfqId}`, 'info');
      renderAllViews();
    }

    // ----------------------------------------------------------------------------


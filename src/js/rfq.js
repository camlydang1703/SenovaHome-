// ============================================================================
// RFQ ORDERS MANAGEMENT (REQUEST FOR QUOTATION ONLY - NO PO)
// ============================================================================

    // 2.12 RFQ MANAGEMENT (Yêu cầu 2)
    // ----------------------------------------------------------------------------
    let activeRfqDraft = null;

    function openRfqModal(skuCode, whCode, suggestedQty, supCode) {
      const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
      const sku = SKUS.find(s => s.code === skuCode) || SKUS[0];
      const targetWh = whCode || activeWh;
      const wh  = WAREHOUSES.find(w => w.code === targetWh) || WAREHOUSES[0];
      const sup = supCode || sku.sup;
      const qty = suggestedQty || 100;

      activeRfqDraft = {
        sku: sku.code,
        wh: wh.code,
        sup: sup,
        qty: qty
      };

      const matchingSups = Object.keys(SUPPLIERS).filter(s => !sku.cat || SUPPLIERS[s].cat === sku.cat);
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
            <label class="form-lbl">Danh sách Nhà cung cấp nhận RFQ (Gửi chùm toàn bộ để so sánh giá):</label>
            <div style="background:#F8FAFC;border:1px solid var(--border-subtle);border-radius:6px;padding:8px 12px;font-size:12px;">
              ${matchingSups.map(s => `
                <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #E2E8F0;">
                  <strong>✓ ${s} - ${SUPPLIERS[s].name}</strong>
                  <span style="color:var(--text-muted);">Leadtime đặt hàng: ~${(sku.lead || 0) + (sku.delay || 0)} ngày (hồ sơ NCC: ${SUPPLIERS[s].leadDays}n, trễ ${SUPPLIERS[s].delay || 0}n)</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="form-row">
            <label class="form-lbl">Số lượng yêu cầu báo giá (${sku.unit}):</label>
            <input type="number" class="form-ctrl" id="rfqModalQty" min="1" value="${qty}" oninput="document.getElementById('rfqBudgetEst').value = fmtNum(this.value * ${sku.cogs}) + ' đ (Chờ NCC báo giá)'">
          </div>
          <div class="form-row">
            <label class="form-lbl">Dự toán ngân sách tạm tính (tham chiếu theo COGS ${fmtNum(sku.cogs)} đ/sp):</label>
            <input type="text" class="form-ctrl" id="rfqBudgetEst" value="${fmtNum(qty * sku.cogs)} đ (Chờ NCC báo giá)" readonly style="background:#F1F5F9;font-weight:600;color:var(--navy-main);">
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

    // Nhân lõi tạo chứng từ RFQ (không phụ thuộc DOM) - dùng chung cho UI và AI Agent
    // Mọi NCC cùng ngành hàng của SKU — RFQ luôn gửi đồng loạt cho toàn bộ danh sách này
    function getRfqTargetSuppliers(skuCode) {
      const skuObj = SKUS.find(s => s.code === skuCode) || {};
      const codes = Object.keys(SUPPLIERS).filter(s => !skuObj.cat || SUPPLIERS[s].cat === skuObj.cat);
      return codes.length > 0 ? codes : (skuObj.sup ? [skuObj.sup] : []);
    }

    function createRfqRecords(skuCode, whCode, qty, supCodes, notes) {
      const targetSups = (supCodes && supCodes.length > 0) ? supCodes : getRfqTargetSuppliers(skuCode);

      const n = parseInt(qty, 10) || 0;
      if (n <= 0) return { ok: false, msg: 'Số lượng yêu cầu phải > 0!', ids: [], sups: [] };
      if (targetSups.length === 0) return { ok: false, msg: `Không có NCC nào phù hợp cho SKU ${skuCode}!`, ids: [], sups: [] };

      const validUntil = addDays(Store.currentDate, 7);
      const createdIds = [];

      targetSups.forEach(sCode => {
        const rfqId = padSeq('RFQ');
        createdIds.push(rfqId);
        Store.rfqs.unshift({
          id: rfqId,
          date: Store.currentDate,
          sku: skuCode,
          wh: whCode,
          sup: sCode,
          qty: n,
          validUntil: validUntil,
          status: 'Đã gửi NCC',
          notes: notes || 'Yêu cầu chào giá cạnh tranh toàn mạng lưới'
        });
      });

      // Cập nhật trạng thái đề xuất nếu có
      const pairKey = `${skuCode}-${whCode}`;
      if (Store.proposals[pairKey]) {
        Store.proposals[pairKey].status = `Đang chờ ${targetSups.length} NCC báo giá`;
        Store.proposals[pairKey].hasActiveRfq = true;
        Store.proposals[pairKey].rfqId = createdIds[0];
      }

      pushNotification('RFQ_SENT', createdIds.join(', '),
        `Đã gửi Yêu cầu Báo giá cạnh tranh (${skuCode} - ${n} sp) tới ${targetSups.length} Nhà cung cấp.`
      );
      logAction('SEND_RFQ', createdIds.join(', '),
        `Yêu cầu báo giá ${n} ${skuCode} tới ${targetSups.length} NCC (${targetSups.join(', ')}) cho kho ${whCode}. Hạn báo giá: ${fmtDateVN(validUntil)}`
      );
      return { ok: true, msg: '', ids: createdIds, sups: targetSups, qty: n, validUntil: validUntil };
    }

    function sendRfqOrder() {
      if (!activeRfqDraft) return;
      const qty = parseInt(document.getElementById('rfqModalQty') ? document.getElementById('rfqModalQty').value : 0, 10) || activeRfqDraft.qty;
      const notes = document.getElementById('rfqModalNotes') ? document.getElementById('rfqModalNotes').value : '';

      const res = createRfqRecords(activeRfqDraft.sku, activeRfqDraft.wh, qty, null, notes);
      if (!res.ok) {
        showToast(res.msg, 'error');
        return;
      }

      closeModal('rfqModal');
      showToast(`Đã gửi thành công RFQ tới ${res.sups.length} Nhà cung cấp!`, 'success');

      if (typeof switchWarehouse === 'function' && Store.ui && Store.ui.activeWh !== activeRfqDraft.wh) {
        switchWarehouse(activeRfqDraft.wh);
      }
      if (typeof switchNavTab === 'function') {
        switchNavTab('rfq');
      }
      refreshAfterStockChange();
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
      refreshAfterStockChange();
    }

    // ----------------------------------------------------------------------------


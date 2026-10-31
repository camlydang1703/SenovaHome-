// ============================================================================
// VIEW 5: QUICK MOVEMENT
// ============================================================================

    // 2.14 QUICK MOVEMENT (Yêu cầu 2.5)
    // ----------------------------------------------------------------------------
    function updateMovementStockDisplay() {
      const whSel = document.getElementById('mvWh');
      const skuSel = document.getElementById('mvSku');
      const help = document.getElementById('mvStockHelp');
      if (!whSel || !skuSel || !help) return;

      const whCode = whSel.value;
      const skuCode = skuSel.value;
      const st = Store.stock[whCode][skuCode];
      const p  = calcSKUParams(skuCode, whCode, Store.currentDate, Store.history);

      help.innerHTML = `
        Tồn kho thực tế hiện tại: <strong>${st.on_hand}</strong> | Đang chuyển: <strong>${st.in_transit}</strong> |
        Ngưỡng MIN (ROP): <strong>${p.rop}</strong> | Trần MAX: <strong>${p.qmax}</strong>
      `;
    }

    function submitQuickMovement() {
      const wh   = document.getElementById('mvWh').value;
      const sku  = document.getElementById('mvSku').value;
      const type = document.getElementById('mvType').value;
      const qty  = parseInt(document.getElementById('mvQty').value, 10) || 0;
      const note = document.getElementById('mvNote').value.trim();

      if (qty <= 0) {
        showToast('Số lượng điều chỉnh phải > 0!', 'error');
        return;
      }

      const st = Store.stock[wh][sku];

      if (type === 'OUT') {
        if (qty > st.on_hand) {
          showToast(`Lỗi: Không thể xuất quá tồn kho vật lý hiện có (${st.on_hand})!`, 'error');
          return;
        }
        st.on_hand -= qty;
        logAction('QUICK_OUT', sku, `Xuất kho nhanh ${qty} ${sku} tại ${wh}. Lý do: ${note || 'Không có'}`);
        pushNotification('STOCK_OUT', sku, `Xuất kho nhanh ${qty} ${sku} tại kho ${wh}.`);
        showToast(`Đã xuất ${qty} ${sku} tại kho ${wh}`, 'success');
      } else {
        st.on_hand += qty;
        logAction('QUICK_IN', sku, `Nhập kho nhanh ${qty} ${sku} tại ${wh}. Lý do: ${note || 'Không có'}`);
        pushNotification('STOCK_IN', sku, `Nhập kho nhanh ${qty} ${sku} tại kho ${wh}.`);
        showToast(`Đã nhập ${qty} ${sku} tại kho ${wh}`, 'success');
      }

      document.getElementById('mvQty').value = '10';
      document.getElementById('mvNote').value = '';
      updateMovementStockDisplay();
      renderAllViews();
    }

    // ----------------------------------------------------------------------------

    // 3.8 VIEW 5: QUICK MOVEMENT
    // ----------------------------------------------------------------------------
    function renderMovementView() {
      const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
      const whSel = document.getElementById('mvWh');
      const skuSel = document.getElementById('mvSku');
      if (whSel && whSel.children.length === 0) {
        whSel.innerHTML = WAREHOUSES.map(w => `<option value="${w.code}">${w.name} (${w.code})</option>`).join('');
      }
      if (whSel && whSel.value !== activeWh) {
        whSel.value = activeWh;
      }
      if (skuSel && skuSel.children.length === 0) {
        skuSel.innerHTML = SKUS.map(s => `<option value="${s.code}">${s.code} - ${s.name}</option>`).join('');
      }
      updateMovementStockDisplay();
    }

    // ----------------------------------------------------------------------------


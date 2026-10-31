// ============================================================================
// VIEW 5: QUICK MOVEMENT - PHIẾU NHẬP / XUẤT KHO (bắt buộc ghi nơi nhập / nơi xuất)
// ============================================================================

    const MV_TYPES = {
      IN_SUPPLIER:  { dir: 'IN',  label: 'Nhập từ NCC',          party: 'Nơi nhập (NCC):' },
      IN_SHIPMENT:  { dir: 'IN',  label: 'Nhận lô hàng đang về', party: 'Lô hàng nhận:' },
      OUT_SALE:     { dir: 'OUT', label: 'Xuất bán hàng',        party: 'Nơi xuất (khách):' },
      OUT_TRANSFER: { dir: 'OUT', label: 'Xuất chuyển kho',      party: 'Nơi xuất (kho nhận):' },
      OUT_DAMAGE:   { dir: 'OUT', label: 'Xuất hủy / hàng lỗi',  party: 'Lý do xuất:' }
    };
    const MV_CUSTOMERS = ['Khách lẻ', 'Khách dự án / công trình', 'Đại lý'];
    const MV_DAMAGE = ['Hàng lỗi / hư hỏng', 'Hủy do mất phẩm chất', 'Trả lại NCC'];

    function getOpenShipments(whCode, skuCode) {
      return Store.transfers.filter(t => t.dstWh === whCode && t.sku === skuCode &&
        (t.status === 'Đang chuyển' || t.status === 'Đã đến kho'));
    }

    // Danh sách lựa chọn nơi nhập / nơi xuất (độc lập DOM)
    function getMovementPartyOptions(type, whCode, skuCode) {
      const sku = SKUS.find(s => s.code === skuCode);
      if (type === 'IN_SUPPLIER') {
        const codes = Object.keys(SUPPLIERS).filter(c => !sku.cat || SUPPLIERS[c].cat === sku.cat);
        if (codes.indexOf(sku.sup) < 0) codes.unshift(sku.sup);
        codes.sort((a, b) => (a === sku.sup ? -1 : 0) - (b === sku.sup ? -1 : 0));
        return codes.map(c => ({ value: c, label: `${c}${SUPPLIERS[c] ? ' - ' + SUPPLIERS[c].name : ''}` }));
      }
      if (type === 'IN_SHIPMENT') {
        return getOpenShipments(whCode, skuCode).map(t => ({
          value: t.id, qty: t.qty,
          label: `${t.id} · ${t.kind === 'SUPPLIER' ? 'NCC ' + t.srcWh : 'Kho ' + t.srcWh} · ${t.qty} ${sku.unit} · dự kiến ${fmtDateVN(t.arrivalDate)} · ${t.status}`
        }));
      }
      if (type === 'OUT_TRANSFER') {
        return WAREHOUSES.filter(w => w.code !== whCode).map(w => ({ value: w.code, label: `${w.name} (${w.code})` }));
      }
      return (type === 'OUT_SALE' ? MV_CUSTOMERS : MV_DAMAGE).map(x => ({ value: x, label: x }));
    }

    // Thực hiện phiếu nhập / xuất (độc lập DOM). Trả về { ok, msg, id, refId }
    function executeStockMovement(o) {
      const def = MV_TYPES[o.type];
      if (!def) return { ok: false, msg: 'Loại thao tác không hợp lệ!' };
      if (Store.ui && Store.ui.viewDate) return { ok: false, msg: 'Đang xem lại ngày cũ, hãy quay về hiện tại.' };
      const cur = Store.currentDate;
      const sku = SKUS.find(s => s.code === o.sku);
      const st = Store.stock[o.wh][o.sku];
      const physicalFree = st.on_hand - st.committed;
      let qty = parseInt(o.qty, 10) || 0;
      let refId = null;
      let partyLabel = o.party;

      if (o.type === 'IN_SHIPMENT') {
        const tr = Store.transfers.find(t => t.id === o.party);
        if (!tr || tr.dstWh !== o.wh || (tr.status !== 'Đang chuyển' && tr.status !== 'Đã đến kho')) {
          return { ok: false, msg: 'Hãy chọn một lô hàng đang về của kho này!' };
        }
        qty = tr.qty;
        applyShipmentReceipt(tr, 'manual');
        refId = tr.id;
        partyLabel = `${tr.kind === 'SUPPLIER' ? 'NCC ' : 'Kho '}${tr.srcWh} (lô ${tr.id})`;
      } else {
        if (qty <= 0) return { ok: false, msg: 'Số lượng phải > 0!' };
        if (!o.party) return { ok: false, msg: 'Phải chọn nơi nhập / nơi xuất!' };
        if (def.dir === 'OUT' && qty > physicalFree) {
          return { ok: false, msg: `Không thể xuất quá tồn khả dụng (${physicalFree} = tồn ${st.on_hand} − giữ chỗ ${st.committed})!` };
        }
        if (o.type === 'IN_SUPPLIER') {
          const rec = createSupplierShipment(o.sku, o.wh, qty, cur, 0, `Phiếu nhập nhanh từ NCC${o.note ? ': ' + o.note : ''}`);
          rec.srcWh = o.party;
          rec.value = qty * sku.cogs;
          applyShipmentReceipt(rec, 'manual');
          refId = rec.id;
        } else if (o.type === 'OUT_TRANSFER') {
          if (o.party === o.wh) return { ok: false, msg: 'Kho nhận phải khác kho xuất!' };
          const safety = checkTransferSafety(o.sku, o.wh, qty, cur);
          if (!safety.ok) return { ok: false, msg: safety.msg };
          const cost = calcFreightCost(o.wh, o.party, o.sku, qty, cur);
          const days = getTransferDays(o.wh, o.party, cur);
          refId = padSeq('TR');
          st.on_hand -= qty;
          Store.stock[o.party][o.sku].in_transit += qty;
          Store.transfers.unshift({
            id: refId, date: cur, sku: o.sku, srcWh: o.wh, dstWh: o.party, qty,
            shipDate: cur, arrivalDate: addDays(cur, days), status: 'Đang chuyển', cost, note: 'Xuất chuyển kho từ phiếu xuất nhanh'
          });
        } else {
          st.on_hand -= qty;
          if (o.type === 'OUT_SALE') {
            if (Store.dailySales && Store.dailySales[cur]) Store.dailySales[cur].revenue += qty * sku.price;
            if (Store.currentWeekDemand && Store.currentWeekDemand[o.sku]) {
              Store.currentWeekDemand[o.sku][o.wh] = (Store.currentWeekDemand[o.sku][o.wh] || 0) + qty;
            }
          }
        }
      }

      const id = padSeq('PNX');
      if (!Store.movements) Store.movements = [];
      Store.movements.unshift({
        id, date: cur, wh: o.wh, sku: o.sku, type: o.type, dir: def.dir, typeLabel: def.label,
        party: o.party, partyLabel, qty, note: o.note || '', refId, onHandAfter: st.on_hand
      });

      // Phiếu nhận lô hàng / nhập NCC đã có thông báo + nhật ký từ applyShipmentReceipt
      if (o.type !== 'IN_SHIPMENT' && o.type !== 'IN_SUPPLIER') {
        const route = o.type === 'OUT_TRANSFER' ? ` (${o.wh} -> ${o.party})` : '';
        logAction('QUICK_OUT', refId || id, `${def.label} ${qty} ${o.sku} tại ${o.wh}${route}. Nơi xuất: ${partyLabel}. Ghi chú: ${o.note || 'Không có'}`, 0, o.wh);
        pushNotification(o.type === 'OUT_TRANSFER' ? 'TRANSFER_APPROVED' : 'STOCK_OUT', refId || id,
          `${def.label} ${qty} ${o.sku} tại kho ${o.wh} → ${partyLabel}.`, o.wh);
      }
      return { ok: true, id, refId, qty, msg: `${def.label} ${qty} ${o.sku} tại kho ${o.wh} (phiếu ${id}).` };
    }

    function updateMovementStockDisplay() {
      const whSel = document.getElementById('mvWh');
      const skuSel = document.getElementById('mvSku');
      const help = document.getElementById('mvStockHelp');
      if (!whSel || !skuSel || !help) return;

      const st = Store.stock[whSel.value][skuSel.value];
      const p  = calcSKUParams(skuSel.value, whSel.value, Store.currentDate, Store.history);
      help.innerHTML = `
        Tồn thực tế: <strong>${st.on_hand}</strong> | Giữ chỗ: <strong>${st.committed}</strong> | Đang về: <strong>${st.in_transit}</strong> |
        MIN (ROP): <strong>${p.rop}</strong> | MAX: <strong>${p.qmax}</strong>
      `;
    }

    function updateMovementForm() {
      const whSel = document.getElementById('mvWh');
      const skuSel = document.getElementById('mvSku');
      const typeSel = document.getElementById('mvType');
      const partySel = document.getElementById('mvParty');
      const lbl = document.getElementById('mvPartyLbl');
      if (!whSel || !skuSel || !typeSel || !partySel) return;
      const def = MV_TYPES[typeSel.value] || MV_TYPES.IN_SUPPLIER;
      const opts = getMovementPartyOptions(typeSel.value, whSel.value, skuSel.value);
      if (lbl) lbl.textContent = def.party;
      partySel.innerHTML = opts.length
        ? opts.map(x => `<option value="${x.value}">${x.label}</option>`).join('')
        : '<option value="">(Không có lô hàng nào đang về cho SKU này)</option>';
      onMovementPartyChange();
      updateMovementStockDisplay();
    }

    function onMovementPartyChange() {
      const typeSel = document.getElementById('mvType');
      const qtyEl = document.getElementById('mvQty');
      if (!typeSel || !qtyEl) return;
      const isShipment = typeSel.value === 'IN_SHIPMENT';
      qtyEl.disabled = isShipment;
      if (isShipment) {
        const tr = Store.transfers.find(t => t.id === document.getElementById('mvParty').value);
        qtyEl.value = tr ? tr.qty : '';
      }
    }

    function submitQuickMovement() {
      const res = executeStockMovement({
        wh: document.getElementById('mvWh').value,
        sku: document.getElementById('mvSku').value,
        type: document.getElementById('mvType').value,
        party: document.getElementById('mvParty').value,
        qty: document.getElementById('mvQty').value,
        note: document.getElementById('mvNote').value.trim()
      });
      if (!res.ok) {
        showToast(res.msg, 'error');
        return;
      }
      showToast(res.msg, 'success');
      document.getElementById('mvQty').value = '10';
      document.getElementById('mvNote').value = '';
      if (Store.ui) Store.ui.highlight = { ref: res.id, ts: Date.now() };
      refreshAfterStockChange();
    }

    function renderMovementHistory(activeWh) {
      const whObj = WAREHOUSES.find(w => w.code === activeWh) || { name: activeWh };
      const title = document.getElementById('mvHistTitle');
      if (title) title.textContent = `Lịch sử phiếu nhập / xuất kho: ${whObj.name}`;
      const rows = (Store.movements || []).filter(m => m.wh === activeWh);
      renderTable({
        tableId: 'mvHistTable', theadId: 'mvHistThead', tbodyId: 'mvHistTbody',
        rows, rowAttrs: m => highlightRowAttrs(m.id),
        emptyMsg: `Chưa có phiếu nhập / xuất nào tại ${whObj.name}.`,
        columns: [
          { header: 'Mã phiếu', render: m => `<strong>${m.id}</strong>` },
          { header: 'Ngày', render: m => fmtDateVN(m.date) },
          { header: 'Loại', render: m => `<span class="status-pill ${m.dir === 'IN' ? 'status-pill-ok' : 'status-pill-low'}">${m.dir === 'IN' ? '⬇' : '⬆'} ${m.typeLabel}</span>` },
          { header: 'SKU', render: m => m.sku },
          { header: 'Nơi nhập / Nơi xuất', render: m => m.partyLabel },
          { header: 'Số lượng', align: 'right', render: m => `<strong style="color:${m.dir === 'IN' ? 'var(--status-green)' : 'var(--status-red)'};">${m.dir === 'IN' ? '+' : '−'}${fmtNum(m.qty)}</strong>` },
          { header: 'Tồn sau phiếu', align: 'right', render: m => fmtNum(m.onHandAfter) },
          { header: 'Chứng từ liên quan', render: m => m.refId || '—' },
          { header: 'Ghi chú', render: m => m.note || '—' }
        ]
      });
    }

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
      updateMovementForm();
      renderMovementHistory(activeWh);
    }

    // ----------------------------------------------------------------------------

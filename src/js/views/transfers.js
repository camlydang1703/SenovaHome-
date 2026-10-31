// ============================================================================
// VIEW 3: TRANSFERS - CONTEXTUALIZED FOR ACTIVE WAREHOUSE (C2)
// ============================================================================

function renderTransfersView() {
  const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
  const whObj = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];

  const cardTitle = document.querySelector('#view-transfers .card-title');
  if (cardTitle) {
    cardTitle.textContent = `Sổ Lệnh Chuyển kho: ${whObj.name} (Nhập về & Xuất đi)`;
  }

  // Filter transfers involving active warehouse (C2)
  const whTransfers = Store.transfers.filter(tr => tr.dstWh === activeWh || tr.srcWh === activeWh);

  const columns = [
    {
      key: 'id',
      header: 'Mã lệnh',
      width: '90px',
      render: tr => `<strong style="color:var(--navy-accent);">${tr.id}</strong>`
    },
    {
      key: 'direction',
      header: 'Chiều luân chuyển',
      render: tr => {
        if (tr.dstWh === activeWh) {
          return `<span class="status-pill status-pill-ok" style="font-weight:700;">⬇ Nhập về ${activeWh}</span>`;
        }
        return `<span class="status-pill status-pill-high" style="font-weight:700;">⬆ Xuất từ ${activeWh}</span>`;
      }
    },
    {
      key: 'date',
      header: 'Ngày tạo',
      render: tr => fmtDateVN(tr.date)
    },
    {
      key: 'sku',
      header: 'SKU',
      render: tr => {
        const sku = SKUS.find(s => s.code === tr.sku) || { name: tr.sku };
        return `<strong>${tr.sku}</strong> - <span style="font-size:11.5px;color:var(--text-muted);">${sku.name}</span>`;
      }
    },
    {
      key: 'route',
      header: 'Tuyến chuyển',
      render: tr => {
        const sWh = WAREHOUSES.find(w => w.code === tr.srcWh);
        const dWh = WAREHOUSES.find(w => w.code === tr.dstWh);
        return `<strong>${sWh ? sWh.name : tr.srcWh}</strong> ➔ <strong>${dWh ? dWh.name : tr.dstWh}</strong>`;
      }
    },
    {
      key: 'qty',
      header: 'Số lượng',
      align: 'right',
      render: tr => {
        const sku = SKUS.find(s => s.code === tr.sku) || { unit: 'cái' };
        return `<strong>${fmtNum(tr.qty)}</strong> ${sku.unit}`;
      }
    },
    {
      key: 'cost',
      header: 'Cước vận chuyển',
      align: 'right',
      render: tr => fmtVND(tr.cost)
    },
    {
      key: 'arrival',
      header: 'Ngày đến dự kiến',
      render: tr => fmtDateVN(tr.arrivalDate)
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: tr => {
        const isArrived = tr.status === 'Đã nhận';
        return `<span class="status-pill ${isArrived ? 'status-pill-ok' : 'status-pill-high'}">${tr.status}</span>`;
      }
    },
    {
      key: 'action',
      header: 'Thao tác',
      align: 'center',
      render: tr => {
        const isArrived = tr.status === 'Đã nhận';
        if (!isArrived && tr.dstWh === activeWh) {
          return `<button class="btn-table" onclick="receiveTransferEarly('${tr.id}')">Tiếp nhận sớm</button>`;
        }
        if (isArrived) {
          return '<span style="font-size:11.5px;color:var(--status-green);font-weight:600;">✓ Hoàn tất</span>';
        }
        return '<span style="font-size:11.5px;color:var(--text-muted);">Đang vận chuyển</span>';
      }
    }
  ];

  renderTable({
    tableId: 'transferTable',
    theadId: 'transferThead',
    tbodyId: 'transferTbody',
    columns: columns,
    rows: whTransfers,
    emptyMsg: `Chưa có lệnh điều chuyển nào liên quan đến ${whObj.name}.`
  });
}

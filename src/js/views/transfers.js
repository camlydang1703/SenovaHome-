// ============================================================================
// VIEW 3: TRANSFERS - REFACTORED WITH renderTable (B1)
// ============================================================================

function renderTransfersView() {
  const columns = [
    {
      key: 'id',
      header: 'Mã lệnh',
      width: '90px',
      render: tr => `<strong style="color:var(--navy-accent);">${tr.id}</strong>`
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
      key: 'srcWh',
      header: 'Từ kho',
      render: tr => `<span class="status-pill status-pill-high" style="background:#F1F5F9;color:#334155;border-color:#CBD5E1;">${tr.srcWh}</span>`
    },
    {
      key: 'dstWh',
      header: 'Đến kho',
      render: tr => `<span class="status-pill status-pill-ok" style="background:#ECFDF5;color:#047857;border-color:#A7F3D0;">${tr.dstWh}</span>`
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
        if (!isArrived) {
          return `<button class="btn-table" onclick="receiveTransferEarly('${tr.id}')">Tiếp nhận sớm</button>`;
        }
        return '<span style="font-size:11.5px;color:var(--status-green);font-weight:600;">✓ Hoàn tất</span>';
      }
    }
  ];

  renderTable({
    tableId: 'transferTable',
    theadId: 'transferThead',
    tbodyId: 'transferTbody',
    columns: columns,
    rows: Store.transfers,
    emptyMsg: 'Chưa có lệnh điều chuyển nội bộ nào được ghi nhận.'
  });
}

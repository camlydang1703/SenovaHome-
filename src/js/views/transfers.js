// ============================================================================
// VIEW 3: TRANSFERS - CONTEXTUALIZED FOR ACTIVE WAREHOUSE (C2)
// ============================================================================

function renderTransfersView() {
  const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
  const whObj = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];

  const cardTitle = document.querySelector('#view-transfers .card-title');
  if (cardTitle) {
    cardTitle.textContent = `Sổ Lệnh Chuyển kho & Hàng đang về: ${whObj.name} (Nhập về & Xuất đi)`;
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
        if (tr.kind === 'SUPPLIER') {
          return `<span class="status-pill status-pill-ok" style="font-weight:700;background:#EDE9FE;color:#6D28D9;border-color:#DDD6FE;">⬇ Hàng NCC về ${activeWh}</span>`;
        }
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
        if (tr.kind === 'SUPPLIER') {
          const sup = (typeof SUPPLIERS !== 'undefined' && SUPPLIERS[tr.srcWh]) || null;
          return `<strong>NCC ${sup && sup.name ? sup.name : tr.srcWh}</strong> ➔ <strong>${dWh ? dWh.name : tr.dstWh}</strong><div style="font-size:11px;color:var(--text-muted);">${tr.note || ''}</div>`;
        }
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
      header: 'Cước / Giá trị hàng',
      align: 'right',
      render: tr => tr.kind === 'SUPPLIER'
        ? `<span style="color:var(--text-muted);">Hàng NCC</span><div>${fmtVND(tr.value || 0)}</div>`
        : fmtVND(tr.cost)
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
        if (tr.status === 'Đã nhận') {
          return `<span class="status-pill status-pill-ok">✓ Đã nhận${tr.receivedDate ? ' ' + fmtDateVN(tr.receivedDate) : ''}</span>`;
        }
        if (tr.status === 'Đã đến kho') {
          return `<span class="status-pill" style="background:#FEF3C7;color:#92400E;border-color:#FDE68A;font-weight:700;">📦 Đã đến - chờ nhận hàng</span>`;
        }
        if (tr.status === 'Chờ kho nhận đồng ý') {
          return `<span class="status-pill status-pill-high" style="background:#FEF3C7;color:#92400E;border-color:#FDE68A;font-weight:700;">⏳ Chờ kho nhận duyệt</span>`;
        }
        if (tr.status === 'Bị từ chối') {
          return `<span class="status-pill status-pill-low" style="background:#FEE2E2;color:#991B1B;border-color:#FECACA;">✕ Bị từ chối</span>`;
        }
        return `<span class="status-pill" style="background:#EFF6FF;color:#1D4ED8;border-color:#BFDBFE;font-weight:600;">🚚 Đang chuyển</span>`;
      }
    },
    {
      key: 'action',
      header: 'Thao tác',
      align: 'center',
      render: tr => {
        // Nếu là kho nhận và lệnh đang ở trạng thái 'Chờ kho nhận đồng ý'
        if (tr.status === 'Chờ kho nhận đồng ý') {
          if (tr.dstWh === activeWh) {
            return `
              <div style="display:flex;gap:4px;justify-content:center;">
                <button class="btn-table" style="background:#15803D;border-color:#15803D;" onclick="acceptTransferInbound('${tr.id}')">✓ Đồng ý nhận</button>
                <button class="btn-table-sec" style="color:#DC2626;border-color:#FCA5A5;" onclick="rejectTransferInbound('${tr.id}')">✕ Từ chối</button>
              </div>
            `;
          }
          return `<span style="font-size:11.5px;color:var(--status-yellow);font-weight:600;">Chờ kho ${tr.dstWh} duyệt</span>`;
        }

        // Nếu đang chuyển
        if (tr.status === 'Đang chuyển' || tr.status === 'Đã đến kho') {
          if (tr.dstWh === activeWh) {
            const arrived = tr.status === 'Đã đến kho';
            return `<button class="btn-table" ${arrived ? 'style="background:#15803D;border-color:#15803D;"' : ''} onclick="receiveShipment('${tr.id}')">✓ Nhận hàng</button>`;
          }
          return '<span style="font-size:11.5px;color:var(--text-muted);">Đang trên đường</span>';
        }

        if (tr.status === 'Đã nhận') {
          return '<span style="font-size:11.5px;color:var(--status-green);font-weight:600;">✓ Hoàn tất</span>';
        }
        return '<span style="font-size:11.5px;color:var(--text-muted);">-</span>';
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

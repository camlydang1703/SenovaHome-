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
        const ep = getRouteEndpoints(tr.srcWh, tr.dstWh);
        const note = tr.kind === 'SUPPLIER' ? `<div style="font-size:11px;color:var(--text-muted);">${escapeHtml(tr.note || '')}</div>` : '';
        return `<strong>${ep.from}</strong> ➔ <strong>${ep.to}</strong>${note}`;
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
          return `<span class="status-pill status-pill-ok">✓ ${tr.receiveTiming || 'Đã nhận'}${tr.receivedDate ? ' ' + fmtDateVN(tr.receivedDate) : ''}</span>`;
        }
        if (tr.status === 'Đã đến kho') {
          const late = getReceiveTiming(tr, Store.currentDate).diff;
          return `<span class="status-pill" style="background:#FEF3C7;color:#92400E;border-color:#FDE68A;font-weight:700;">📦 ${late > 0 ? `Quá hạn ${late} ngày - chờ nhận` : 'Đã đến - chờ nhận hàng'}</span>`;
        }
        if (tr.status === 'Chờ kho nguồn xác nhận') {
          return `<span class="status-pill status-pill-high" style="background:#FEF3C7;color:#92400E;border-color:#FDE68A;font-weight:700;">⏳ Chờ kho nguồn xác nhận gửi</span>`;
        }
        if (tr.status === 'Chờ kho đích nhận hàng') {
          return `<span class="status-pill status-pill-high" style="background:#FEF3C7;color:#92400E;border-color:#FDE68A;font-weight:700;">⏳ Chờ kho đích chấp nhận nhập</span>`;
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
        // Lệnh XC chờ kho nguồn: hiện nút xác nhận/từ chối ngay tại tab Điều chuyển
        if (tr.status === 'Chờ kho nguồn xác nhận') {
          if (tr.srcWh === activeWh) {
            return `
              <div style="display:inline-flex;gap:4px;">
                <button class="btn-table btn-table-sec" onclick="openTransferRequestDetail('${tr.id}')">Chi tiết</button>
                <button class="btn-table" onclick="confirmTransferOutbound('${tr.id}')">Xác nhận gửi hàng</button>
                <button class="btn-table btn-table-danger" onclick="rejectTransferRequest('${tr.id}')">Từ chối</button>
              </div>
            `;
          }
          return '<span style="font-size:11.5px;color:var(--text-muted);">Đang chờ kho nguồn xác nhận</span>';
        }
        // Lệnh XC do kho nguồn đề nghị đẩy hàng: kho đích mới là bên quyết định nhập hay không
        if (tr.status === 'Chờ kho đích nhận hàng') {
          if (tr.dstWh === activeWh) {
            return `
              <div style="display:inline-flex;gap:4px;">
                <button class="btn-table btn-table-sec" onclick="openTransferRequestDetail('${tr.id}')">Chi tiết</button>
                <button class="btn-table" onclick="confirmTransferInbound('${tr.id}')">Chấp nhận nhập hàng</button>
                <button class="btn-table btn-table-danger" onclick="rejectTransferInbound('${tr.id}')">Từ chối</button>
              </div>
            `;
          }
          return '<span style="font-size:11.5px;color:var(--text-muted);">Đang chờ kho đích chấp nhận nhập</span>';
        }
        // Nếu đang chuyển
        if (tr.status === 'Đang chuyển' || tr.status === 'Đã đến kho') {
          if (tr.dstWh === activeWh) {
            const tm = getReceiveTiming(tr, Store.currentDate);
            const style = tm.code === 'EARLY' ? '' : (tm.code === 'ONTIME' ? 'style="background:#15803D;border-color:#15803D;"' : 'style="background:#B45309;border-color:#B45309;"');
            return `<button class="btn-table" ${style} onclick="receiveShipment('${tr.id}')">✓ ${tm.action}</button>`;
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
    rowAttrs: tr => highlightRowAttrs(tr.id),
    emptyMsg: `Chưa có lệnh điều chuyển nào liên quan đến ${whObj.name}.`
  });
}

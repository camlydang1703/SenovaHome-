// ============================================================================
// VIEW 4: RFQ MANAGEMENT - CONTEXTUALIZED FOR ACTIVE WAREHOUSE (C2)
// ============================================================================

function renderRfqView() {
  const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
  const whObj = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];

  const cardTitle = document.querySelector('#view-rfq .card-title');
  if (cardTitle) {
    cardTitle.textContent = `Danh sách Yêu cầu Báo giá (RFQ): ${whObj.name}`;
  }

  const whRfqs = Store.rfqs.filter(r => r.wh === activeWh);

  const columns = [
    {
      key: 'id',
      header: 'Mã chứng từ',
      width: '90px',
      render: rfq => `<strong style="color:var(--navy-accent);">${rfq.id}</strong>`
    },
    {
      key: 'date',
      header: 'Ngày tạo',
      render: rfq => fmtDateVN(rfq.date)
    },
    {
      key: 'sku',
      header: 'SKU',
      render: rfq => {
        const sku = SKUS.find(s => s.code === rfq.sku) || { name: rfq.sku };
        return `<strong>${rfq.sku}</strong> - <span style="font-size:11.5px;color:var(--text-muted);">${sku.name}</span>`;
      }
    },
    {
      key: 'wh',
      header: 'Kho nhận',
      render: rfq => `<strong>${rfq.wh}</strong>`
    },
    {
      key: 'sup',
      header: 'Nhà cung cấp / Đại lý',
      render: rfq => rfq.sup
    },
    {
      key: 'qty',
      header: 'Số lượng đặt',
      align: 'right',
      render: rfq => {
        const sku = SKUS.find(s => s.code === rfq.sku) || { unit: 'cái' };
        return `<strong>${fmtNum(rfq.qty)}</strong> ${sku.unit}`;
      }
    },
    {
      key: 'valid',
      header: 'Hiệu lực đến',
      render: rfq => fmtDateVN(rfq.validUntil)
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: rfq => {
        if (rfq.status === 'Quá hạn') {
          return `<span class="status-pill status-pill-low">Quá hạn</span>`;
        }
        if (rfq.status === 'Đã hủy') {
          return `<span class="status-pill" style="background:#F3F4F6;color:#6B7280;border-color:#E5E7EB;">Đã hủy</span>`;
        }
        return `<span class="status-pill status-pill-high" style="background:#EDE9FE;color:#6D28D9;border-color:#DDD6FE;">Đã gửi NCC</span>`;
      }
    },
    {
      key: 'action',
      header: 'Thao tác',
      align: 'center',
      render: rfq => {
        if (rfq.status === 'Đã gửi NCC') {
          return `<button class="btn-table btn-table-sec" onclick="cancelRfq('${rfq.id}')">Hủy RFQ</button>`;
        }
        return `<button class="btn-table" onclick="openRfqModal('${rfq.sku}', '${rfq.wh}', ${rfq.qty}, '${rfq.sup}')">Gửi lại</button>`;
      }
    }
  ];

  renderTable({
    tableId: 'rfqTable',
    theadId: 'rfqThead',
    tbodyId: 'rfqTbody',
    columns: columns,
    rows: whRfqs,
    emptyMsg: `Chưa có Yêu cầu Báo giá (RFQ) nào được ghi nhận tại ${whObj.name}.`
  });
}

// ============================================================================
// VIEW 2: INVENTORY DETAIL TABLE - REFACTORED (B1, B4)
// ============================================================================

function renderInventoryView() {
  const tbody = document.getElementById('inventoryTbody');
  if (!tbody) return;

  const whFilter  = document.getElementById('invWhFilter') ? document.getElementById('invWhFilter').value : 'ALL';
  const catFilter = document.getElementById('invCatFilter') ? document.getElementById('invCatFilter').value : 'ALL';
  const stFilter  = document.getElementById('invStatusFilter') ? document.getElementById('invStatusFilter').value : 'ALL';
  const search    = document.getElementById('invSearch') ? document.getElementById('invSearch').value.trim().toLowerCase() : '';

  let rows = [];

  SKUS.forEach(sku => {
    if (catFilter !== 'ALL' && sku.cat !== catFilter) return;

    WAREHOUSES.forEach(wh => {
      if (whFilter !== 'ALL' && wh.code !== whFilter) return;

      const st = (Store.stock && Store.stock[wh.code] && Store.stock[wh.code][sku.code])
        ? Store.stock[wh.code][sku.code]
        : { on_hand: 0, in_transit: 0, committed: 0 };
      const p  = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
      const eff = st.on_hand + st.in_transit - st.committed;
      const status = getStatus(eff, p);

      if (stFilter !== 'ALL' && status !== stFilter) return;

      if (search) {
        const matchCode = sku.code.toLowerCase().includes(search);
        const matchName = sku.name.toLowerCase().includes(search);
        if (!matchCode && !matchName) return;
      }

      const activeRfq = Store.rfqs.find(r => r.sku === sku.code && r.wh === wh.code && r.status === 'Đã gửi NCC');

      rows.push({
        sku,
        wh,
        st,
        p,
        eff,
        status,
        activeRfq
      });
    });
  });

  const columns = [
    {
      key: 'code',
      header: 'Mã SKU',
      width: '95px',
      render: r => `<strong>${r.sku.code}</strong>`
    },
    {
      key: 'name',
      header: 'Tên sản phẩm',
      render: r => `<strong>${r.sku.name}</strong><br><span style="font-size:11px;color:var(--text-muted);">${r.sku.cat}</span>`
    },
    {
      key: 'wh',
      header: 'Kho',
      render: r => `<strong>${r.wh.name}</strong>`
    },
    {
      key: 'on_hand',
      header: 'Tồn vật lý',
      align: 'right',
      render: r => `<strong>${fmtNum(r.st.on_hand)}</strong>`
    },
    {
      key: 'in_transit',
      header: 'Đang về',
      align: 'right',
      render: r => r.st.in_transit > 0 ? `<span style="color:var(--navy-accent);font-weight:600;">+${fmtNum(r.st.in_transit)}</span>` : '-'
    },
    {
      key: 'eff',
      header: 'Tồn khả dụng (I)',
      align: 'right',
      render: r => `<strong style="color:var(--navy-main);">${fmtNum(r.eff)}</strong>`
    },
    {
      key: 'rop',
      header: 'MIN (ROP)',
      align: 'right',
      headerStyle: 'color:var(--status-red);',
      render: r => `<span style="color:var(--status-red);font-weight:600;">${fmtNum(r.p.rop)}</span>`
    },
    {
      key: 'qmax',
      header: 'MAX (Qmax)',
      align: 'right',
      headerStyle: 'color:var(--status-yellow);',
      render: r => `<span style="color:var(--status-yellow);font-weight:600;">${fmtNum(r.p.qmax)}</span>`
    },
    {
      key: 'dos',
      header: 'Còn bán',
      align: 'right',
      render: r => {
        const dailyRate = Math.max(0.1, r.p.f_next / 7.0);
        const days = Math.round((r.eff / dailyRate) * 10) / 10;
        return `${days} ngày`;
      }
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: r => {
        if (r.status === 'LOW') {
          return '<span class="status-pill status-pill-low">Dưới MIN</span>';
        }
        if (r.status === 'HIGH') {
          return '<span class="status-pill status-pill-high">Vượt MAX</span>';
        }
        if (r.st.on_hand <= r.p.rop && r.st.in_transit > 0) {
          return '<span class="status-pill status-pill-ok" title="Tồn thực dưới ROP nhưng an toàn nhờ hàng đang về">OK (nhờ hàng về)</span>';
        }
        return '<span class="status-pill status-pill-ok">Bình thường</span>';
      }
    },
    {
      key: 'action',
      header: 'Thao tác',
      align: 'center',
      render: r => {
        if (r.status === 'HIGH') {
          return `<button class="btn-table" onclick="openOverstockModal('${r.sku.code}', '${r.wh.code}')">Xả tồn</button>`;
        }
        const btnLabel = r.status === 'LOW' ? 'Bổ sung' : 'Chi tiết';
        return `<button class="btn-table" onclick="openTransferCompareModal('${r.sku.code}', '${r.wh.code}')">${btnLabel}</button>`;
      }
    }
  ];

  renderTable({
    tableId: 'inventoryTable',
    theadId: 'inventoryThead',
    tbodyId: 'inventoryTbody',
    columns: columns,
    rows: rows,
    emptyMsg: 'Không tìm thấy sản phẩm nào khớp bộ lọc.'
  });
}

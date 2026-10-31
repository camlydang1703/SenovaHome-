// ============================================================================
// VIEW 2: INVENTORY DETAIL TABLE FOR ACTIVE WAREHOUSE (C2)
// ============================================================================

function renderInventoryView() {
  const tbody = document.getElementById('inventoryTbody');
  if (!tbody) return;

  const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
  const whObj = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];

  // Update card title to show active warehouse
  const cardTitle = document.querySelector('#view-inventory .card-title');
  if (cardTitle) {
    cardTitle.textContent = `Chi tiết Quản trị Tồn kho: ${whObj.name} (11 SKU)`;
  }

  // Sync dropdown with active warehouse — ALWAYS force to activeWh
  const whFilterEl = document.getElementById('invWhFilter');
  if (whFilterEl) {
    whFilterEl.value = activeWh;
  }
  const whFilter = activeWh;
  const catFilter = document.getElementById('invCatFilter') ? document.getElementById('invCatFilter').value : 'ALL';
  const stFilter  = document.getElementById('invStatusFilter') ? document.getElementById('invStatusFilter').value : 'ALL';
  const search    = document.getElementById('invSearch') ? document.getElementById('invSearch').value.trim().toLowerCase() : '';

  let rows = [];

  SKUS.forEach(sku => {
    if (catFilter !== 'ALL' && sku.cat !== catFilter) return;

    WAREHOUSES.forEach(wh => {
      // In Phase C: default view shows active warehouse
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
      const baseP = (Store.baseParams && Store.baseParams[sku.code] && Store.baseParams[sku.code][wh.code]) || p;
      const warn7 = calcLookaheadWarning(st, p, Store.currentDate, sku.code, wh.code);

      rows.push({
        sku,
        wh,
        st,
        p,
        baseP,
        warn7,
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
      render: r => {
        // Ma tran & bang ton kho: chi hien MIN hien tai cua he thong
        return `<strong style="color:var(--status-red);">${fmtNum(r.p.rop)}</strong>`;
      }
    },
    {
      key: 'qmax',
      header: 'MAX (Qmax)',
      align: 'right',
      headerStyle: 'color:var(--status-yellow);',
      render: r => {
        // Ma tran & bang ton kho: chi hien MAX hien tai cua he thong
        return `<strong style="color:var(--status-yellow);">${fmtNum(r.p.qmax)}</strong>`;
      }
    },
    {
      key: 'warn7',
      header: 'Cảnh báo 7N',
      align: 'center',
      render: r => `<span class="risk-tag ${r.warn7.tagClass}" title="${r.warn7.subText.replace(/"/g,'&quot;')}">${r.warn7.label}</span>`
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
          return '<span class="status-pill status-pill-ok" title="Tồn thực dưới ROP nhưng an toàn nhờ hàng đang về">An toàn (hàng đang về)</span>';
        }
        return '<span class="status-pill status-pill-ok">An toàn</span>';
      }
    },
    {
      key: 'action',
      header: 'Thao tác',
      align: 'center',
      render: r => {
        if (r.status === 'HIGH') {
          return `<button class="btn-table btn-action-xaton" onclick="openOverstockModal('${r.sku.code}','${r.wh.code}')">Xả tồn</button>`;
        }
        if (r.status === 'LOW') {
          return `<button class="btn-table btn-action-bosung" onclick="openReplenishModal('${r.sku.code}','${r.wh.code}')">Bổ sung</button>`;
        }
        return `<span style="color:var(--text-muted);font-size:13px;font-weight:600;">—</span>`;
      }
    }
  ];

  renderTable({
    tableId: 'inventoryTable',
    theadId: 'inventoryThead',
    tbodyId: 'inventoryTbody',
    columns: columns,
    rows: rows,
    emptyMsg: `Không tìm thấy sản phẩm nào khớp bộ lọc tại ${whObj.name}.`
  });
}

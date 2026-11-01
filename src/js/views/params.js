// ============================================================================
// VIEW 6: PARAMS & AI FORMULAS - REFACTORED (B1)
// ============================================================================

function renderParamsView() {
  const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
  const whObj = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];

  const cardTitle = document.querySelector('#view-params .card-title');
  if (cardTitle) {
    cardTitle.textContent = `Bảng Tham số & Ngưỡng Định mức Min/Max: ${whObj.name} (11 SKU)`;
  }

  // 1. Setup dropdown selectors for interactive step calculation
  const skuSel = document.getElementById('paramSkuSelect');
  const whSel  = document.getElementById('paramWhSelect');

  if (skuSel && skuSel.children.length === 0) {
    skuSel.innerHTML = SKUS.map(s => `<option value="${s.code}">${s.code} - ${s.name}</option>`).join('');
  }
  if (whSel && whSel.children.length === 0) {
    whSel.innerHTML = WAREHOUSES.map(w => `<option value="${w.code}">${w.name} (${w.code})</option>`).join('');
  }
  if (whSel && !whSel.value) {
    whSel.value = activeWh;
  }

  const curSku = skuSel && skuSel.value ? skuSel.value : 'TLM-045';
  const curWh  = whSel && whSel.value ? whSel.value : activeWh;

  // 2. Interactive Step Calculation Box (#paramStepCalc)
  renderStepCalculator(curSku, curWh);

  // 3. Dynamic 11-row Parameters Table for Active Warehouse (#paramsTbody) using renderTable
  const m = getMonthFromDate(Store.currentDate);
  const rows = [];

  SKUS.forEach(sku => {
    const sm = (typeof SI[sku.code] === 'object' && SI[sku.code] !== null) ? (SI[sku.code][m] || 1.0) : (SI[m] || 1.0);

    const wh = whObj;
    const p  = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
    const baseP = (Store.baseParams && Store.baseParams[sku.code] && Store.baseParams[sku.code][wh.code]) || p;
    const st = (Store.stock && Store.stock[wh.code] && Store.stock[wh.code][sku.code])
      ? Store.stock[wh.code][sku.code]
      : { on_hand: 0, in_transit: 0, committed: 0 };
    const eff = st.on_hand + st.in_transit - st.committed + (typeof getPendingProposalReserve === 'function' ? getPendingProposalReserve(sku.code, wh.code) : 0);
    const status = getStatus(eff, p);

    rows.push({
      sku,
      wh,
      p,
      baseP,
      st,
      eff,
      sm,
      status
    });
  });

  const columns = [
    {
      key: 'code',
      header: 'Mã SKU',
      width: '90px',
      render: r => `<strong>${r.sku.code}</strong>`
    },
    {
      key: 'name',
      header: 'Tên sản phẩm',
      render: r => r.sku.name
    },
    {
      key: 'wh',
      header: 'Kho',
      render: r => `<strong>${r.wh.name}</strong>`
    },
    {
      key: 'share',
      header: 'Tỷ trọng',
      align: 'right',
      render: r => `${(r.wh.w * 100).toFixed(0)}%`
    },
    {
      key: 'd_sma4',
      header: 'D_SMA4',
      align: 'right',
      render: r => r.p.d_sma4
    },
    {
      key: 'sm',
      header: 'Hệ số Sm',
      align: 'right',
      render: r => Number(r.sm).toFixed(3)
    },
    {
      key: 'f_next',
      header: 'F_next/tuần',
      align: 'right',
      render: r => `<strong>${r.p.f_next}</strong>`
    },
    {
      key: 'lead',
      header: 'L (tuần)',
      align: 'right',
      render: r => Number(r.p.L || r.p.lead || 0).toFixed(2)
    },
    {
      key: 'sigma',
      header: 'σ_error',
      align: 'right',
      render: r => Number(r.p.sigma_error || r.p.sigma || 0).toFixed(1)
    },
    {
      key: 'ss',
      header: 'SS (Tồn an toàn)',
      align: 'right',
      render: r => r.p.ss
    },
    {
      key: 'rop',
      header: 'MIN (ROP)',
      align: 'right',
      headerStyle: 'color:var(--status-red);',
      render: r => {
        const driver = getDriverExplanation(r.sku.code, r.wh.code, Store.currentDate, r.p, r.baseP);
        return renderDualParam(r.baseP ? r.baseP.rop : r.p.rop, r.p.rop, 'ROP', driver);
      }
    },
    {
      key: 'qmax',
      header: 'MAX (Qmax)',
      align: 'right',
      headerStyle: 'color:var(--status-yellow);',
      render: r => {
        const driver = getDriverExplanation(r.sku.code, r.wh.code, Store.currentDate, r.p, r.baseP);
        return renderDualParam(r.baseP ? r.baseP.qmax : r.p.qmax, r.p.qmax, 'Qmax', driver);
      }
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: r => {
        if (r.status === 'LOW') return '<span class="status-pill status-pill-low">Dưới MIN</span>';
        if (r.status === 'HIGH') return '<span class="status-pill status-pill-high">Vượt MAX</span>';
        return '<span class="status-pill status-pill-ok">An toàn</span>';
      }
    }
  ];

  renderTable({
    tableId: 'paramsTable',
    theadId: 'paramsThead',
    tbodyId: 'paramsTbody',
    columns: columns,
    rows: rows,
    emptyMsg: 'Không có thông số cấu hình.'
  });
}

function renderStepCalculator(skuCode, whCode) {
  const box = document.getElementById('paramStepCalc');
  if (!box) return;

  const sku = SKUS.find(s => s.code === skuCode) || SKUS[0];
  const wh  = WAREHOUSES.find(w => w.code === whCode) || WAREHOUSES[0];
  const m   = getMonthFromDate(Store.currentDate);
  const sm  = (typeof SI[sku.code] === 'object' && SI[sku.code] !== null) ? (SI[sku.code][m] || 1.0) : (SI[m] || 1.0);
  const p   = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
  const st  = (Store.stock && Store.stock[wh.code] && Store.stock[wh.code][sku.code])
    ? Store.stock[wh.code][sku.code]
    : { on_hand: 0, in_transit: 0, committed: 0 };
  const eff = st.on_hand + st.in_transit - st.committed;
  const status = getStatus(eff, p);

  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:14px;">
      <div style="background:#F8FAFC;padding:12px;border-radius:6px;border:1px solid #E2E8F0;">
        <div style="font-size:11px;color:var(--text-muted);font-weight:600;">BƯỚC 1: DỰ BÁO NHU CẦU F</div>
        <div style="font-size:16px;font-weight:800;color:var(--navy-main);margin:4px 0;">${p.f_next} sp/tuần</div>
        <div style="font-size:11px;color:var(--text-sub);">
          = D_SMA4 (${p.d_sma4}) × Sm tháng ${m} (${Number(sm).toFixed(2)})
        </div>
      </div>
      <div style="background:#F8FAFC;padding:12px;border-radius:6px;border:1px solid #E2E8F0;">
        <div style="font-size:11px;color:var(--text-muted);font-weight:600;">BƯỚC 2: THỜI GIAN ĐẶT HÀNG L</div>
        <div style="font-size:16px;font-weight:800;color:var(--navy-main);margin:4px 0;">${Number(p.L).toFixed(2)} tuần (${p.leadDays || 0} ngày)</div>
        <div style="font-size:11px;color:var(--text-sub);">
          = (${sku.lead || 0} lead hồ sơ NCC + ${sku.delay || 0} trễ thường lệ + ${p.totalEventDelay || 0} trễ sự kiện) / 7
        </div>
      </div>
      <div style="background:#F8FAFC;padding:12px;border-radius:6px;border:1px solid #E2E8F0;">
        <div style="font-size:11px;color:var(--text-muted);font-weight:600;">BƯỚC 3: DỰ BÁO KHI CHỜ D_lead</div>
        <div style="font-size:16px;font-weight:800;color:var(--navy-main);margin:4px 0;">${p.d_lead} sp</div>
        <div style="font-size:11px;color:var(--text-sub);">
          = (D_SMA4 ${p.d_sma4} / 7) × Sm cửa sổ chờ (${p.smLead || sm}) × sự kiện (${p.eventMult || 1}) × ${p.leadDays || 0} ngày
        </div>
      </div>
      <div style="background:#F8FAFC;padding:12px;border-radius:6px;border:1px solid #E2E8F0;">
        <div style="font-size:11px;color:var(--text-muted);font-weight:600;">BƯỚC 4: TỒN AN TOÀN SS</div>
        <div style="font-size:16px;font-weight:800;color:var(--navy-main);margin:4px 0;">${p.ss} sp</div>
        <div style="font-size:11px;color:var(--text-sub);">
          = 1.65 (95%) × σ (${p.sigma_error}) × √L (${Math.sqrt(p.L).toFixed(2)})
        </div>
      </div>
      <div style="background:#FEF2F2;padding:12px;border-radius:6px;border:1px solid #FECACA;">
        <div style="font-size:11px;color:var(--status-red);font-weight:700;">NGƯỠNG ĐẶT HÀNG MIN (ROP)</div>
        <div style="font-size:20px;font-weight:800;color:var(--status-red);margin:4px 0;">${p.rop} sp</div>
        <div style="font-size:11px;color:var(--text-sub);">
          = ceil(D_lead ${p.d_lead} + SS ${p.ss})
        </div>
      </div>
      <div style="background:#FEF9C3;padding:12px;border-radius:6px;border:1px solid #FDE047;">
        <div style="font-size:11px;color:#854D0E;font-weight:700;">TRẦN TỒN KHO TỐI ĐA MAX (Qmax)</div>
        <div style="font-size:20px;font-weight:800;color:#854D0E;margin:4px 0;">${p.qmax} sp</div>
        <div style="font-size:11px;color:var(--text-sub);">
          = ceil(ROP ${p.rop} + F ${p.f_next})
        </div>
      </div>
    </div>
  `;
}

function updateParamInteractiveCalc() {
  const skuSel = document.getElementById('paramSkuSelect');
  const whSel  = document.getElementById('paramWhSelect');
  const curSku = skuSel ? skuSel.value : 'TLM-045';
  const curWh  = whSel  ? whSel.value  : 'HCM';
  renderStepCalculator(curSku, curWh);
}

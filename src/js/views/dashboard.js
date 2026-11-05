// ============================================================================
// VIEW 1: DASHBOARD (PROPOSALS & OUTBOUND FOR ACTIVE WAREHOUSE - C2)
// ============================================================================

function renderDashboardView() {
  const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
  const whObj = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];

  // --------------------------------------------------------------------------
  // 0. KPI METRICS UPDATE
  // --------------------------------------------------------------------------
  let underMinCount = 0;
  let overMaxCount = 0;
  let trappedCap = 0;
  let costDiff = 0;

  SKUS.forEach(sku => {
    WAREHOUSES.forEach(wh => {
      const st = (Store.stock && Store.stock[wh.code] && Store.stock[wh.code][sku.code])
        ? Store.stock[wh.code][sku.code]
        : { on_hand: 0, in_transit: 0, committed: 0 };
      const p = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
      // Cộng lại phần giữ chỗ của đề xuất CHỜ DUYỆT (chỉ để hiển thị):
      // thấy đúng mức tồn thật → ô Vượt MAX không bị ẩn sau khi sinh đề xuất
      const eff = st.on_hand + st.in_transit - st.committed + getPendingProposalReserve(sku.code, wh.code);
      const status = getStatus(eff, p);

      if (status === 'LOW') underMinCount++;
      else if (status === 'HIGH') {
        overMaxCount++;
        // Vốn ứ đọng = tổng giá vốn (COGS) phần vượt MAX, CHỈ tính cho kho đang xem;
        // khi kho xác nhận gửi hàng, on_hand giảm → vốn ứ đọng giảm theo phần vốn chuyển đi
        if (wh.code === activeWh) {
          const excess = eff - p.qmax;
          if (excess > 0) trappedCap += excess * sku.cogs;
        }
      }
    });
  });

  // Tính tiết kiệm chi phí TỪ LỆNH ĐÃ THỰC HIỆN GỬI HÀNG, quy về kho nhận đang xem
  Store.transfers.forEach(tr => {
    if (tr.kind === 'TRANSFER' && tr.dstWh === activeWh &&
        !isAwaitingCounterpart(tr) && tr.savingVsRfq > 0) {
      costDiff += tr.savingVsRfq;
    }
  });

  const kpiUnderMin = document.getElementById('kpi-under-min');
  if (kpiUnderMin) kpiUnderMin.textContent = underMinCount;

  const kpiOverMax = document.getElementById('kpi-over-max');
  if (kpiOverMax) kpiOverMax.textContent = overMaxCount;

  const kpiTrappedCap = document.getElementById('kpi-trapped-cap');
  if (kpiTrappedCap) kpiTrappedCap.textContent = (trappedCap / 1000000).toFixed(2) + ' tr đ';

  const kpiCostDiff = document.getElementById('kpi-cost-diff');
  if (kpiCostDiff) kpiCostDiff.textContent = (costDiff / 1000000).toFixed(2) + ' tr đ';

  // --------------------------------------------------------------------------
  // 1. Inbound Proposal Queue (Kho nhận = activeWh) (C2)
  // --------------------------------------------------------------------------
  const titleEl = document.getElementById('proposalQueueTitle');
  if (titleEl) {
    titleEl.textContent = `Hàng đợi Đề xuất Bổ sung / Nhập về ${whObj.name}`;
  }

  const propKeys = Object.keys(Store.proposals);
  // Filter for active warehouse as recipient
  const inboundRows = propKeys
    .filter(k => Store.proposals[k].wh === activeWh)
    .map(k => ({ key: k, ...Store.proposals[k] }));

  // Lệnh XC do kho nguồn đề nghị đẩy hàng: kho đang xem chính là bên phải chấp nhận nhập
  const xcInboundRows = Store.transfers
    .filter(t => t.kind === 'TRANSFER' && t.status === 'Chờ kho đích nhận hàng' && t.dstWh === activeWh)
    .map(t => ({
      key: `XC:${t.id}`, id: t.id, isXcInbound: true, type: 'TRANSFER',
      sku: t.sku, qty: t.qty, srcWh: t.srcWh, wh: t.dstWh,
      leadDays: t.leadDays, arrivalDate: t.arrivalDate,
      freightCost: t.cost, savingVsRfq: t.savingVsRfq || 0,
      status: 'Chờ kho đích chấp nhận nhập'
    }));
  const inboundAll = [...inboundRows, ...xcInboundRows];

  const proposalColumns = [
    {
      key: 'id',
      header: 'Mã ĐX',
      width: '90px',
      render: r => `<strong style="color:var(--navy-accent);">${r.id}</strong>`
    },
    {
      key: 'sku',
      header: 'SKU',
      render: r => {
        const sku = SKUS.find(s => s.code === r.sku) || { name: r.sku };
        return `<strong>${r.sku}</strong><br><span style="font-size:11px;color:var(--text-muted);">${sku.name}</span>`;
      }
    },
    {
      key: 'wh',
      header: 'Kho nhận',
      render: r => {
        if (r.type === 'OVERSTOCK') {
          if (!r.dstWh) return '<span style="color:var(--text-muted);">—</span><div style="font-size:11px;color:var(--text-muted);">Các kho đều đã đủ hàng</div>';
          const dstObj = WAREHOUSES.find(w => w.code === r.dstWh);
          return `<strong>${dstObj ? dstObj.name : r.dstWh}</strong>`;
        }
        return `<strong>${whObj.name}</strong>`;
      }
    },
    {
      key: 'type',
      header: 'Phương thức',
      render: r => {
        if (r.type === 'TRANSFER') return '<span class="status-pill status-pill-ok">Điều chuyển nội bộ</span>';
        if (r.type === 'RFQ') return '<span class="status-pill status-pill-low" style="background:#EDE9FE;color:#6D28D9;border-color:#DDD6FE;">Yêu cầu Báo giá</span>';
        return '<span class="status-pill status-pill-high">Xả tồn / San tải</span>';
      }
    },
    {
      key: 'qty',
      header: 'Lượng cần',
      align: 'right',
      render: r => {
        const sku = SKUS.find(s => s.code === r.sku) || { unit: 'cái' };
        return `<strong>${fmtNum(r.qty)}</strong> ${sku.unit}`;
      }
    },
    {
      key: 'source',
      header: 'Kho nguồn / NCC',
      render: r => {
        if (r.type === 'TRANSFER') {
          const sWh = WAREHOUSES.find(w => w.code === r.srcWh);
          return `<strong>${sWh ? sWh.name : r.srcWh}</strong>`;
        }
        if (r.type === 'RFQ') {
          // RFQ luôn gửi đồng loạt cho mọi NCC cùng ngành hàng — hiển thị đủ danh sách
          const codes = (r.sups && r.sups.length) ? r.sups
            : (typeof getRfqTargetSuppliers === 'function' ? getRfqTargetSuppliers(r.sku) : [r.sup]);
          const names = codes.map(c => (SUPPLIERS[c] && SUPPLIERS[c].name) || c);
          const head = `<strong>${names[0]}</strong>`;
          const rest = names.length > 1
            ? `<div style="font-size:10.5px;color:var(--text-muted);">+ ${names.length - 1} NCC cùng ngành (${names.slice(1).join(', ')})</div>`
            : '';
          return `${head}${rest}`;
        }
        if (r.type === 'OVERSTOCK') {
          const sWh = WAREHOUSES.find(w => w.code === r.srcWh);
          return `<strong>${sWh ? sWh.name : r.srcWh}</strong>`;
        }
        return `<strong>${whObj.name}</strong>`;
      }
    },
    {
      key: 'arrival',
      header: 'Dự kiến về (số ngày)',
      render: r => `${fmtDateVN(r.arrivalDate)} (${r.leadDays} ngày)`
    },
    {
      key: 'cost',
      header: 'Chi phí vận chuyển',
      align: 'right',
      render: r => {
        if (r.type === 'TRANSFER') {
          const save = r.savingVsRfq > 0 ? `<div style="font-size:10.5px;color:var(--status-green);">Rẻ hơn RFQ ~${fmtVND(r.savingVsRfq)}</div>` : '';
          return `<strong style="color:var(--navy-accent);">${fmtVND(r.freightCost)}</strong>${save}`;
        }
        if (r.type === 'RFQ') {
          return `<span style="font-size:11px;color:var(--text-muted);">${r.noTransferReason || 'Mua mới từ NCC'}</span>`;
        }
        return r.freightCost > 0 ? `<strong style="color:var(--navy-accent);">${fmtVND(r.freightCost)}</strong>` : '—';
      }
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: r => {
        if (r.hasActiveRfq) {
          return `<span class="status-pill" style="background:#F3F4F6;color:#4B5563;border-color:#E5E7EB;">Đang chờ NCC (${r.rfqId})</span>`;
        }
        let pillClass = 'status-pill-ok';
        if (r.type === 'RFQ' || r.status.includes('Chờ')) pillClass = 'status-pill-low';
        if (r.type === 'OVERSTOCK') pillClass = 'status-pill-high';
        const label = r.status;
        return `<span class="status-pill ${pillClass}">${label}</span>`;
      }
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'center',
      render: r => {
        if (r.isXcInbound) {
          return `
            <div style="display:flex;gap:4px;justify-content:center;">
              <button class="btn-table btn-table-sec" onclick="openTransferRequestDetail('${r.id}')">Chi tiết</button>
              <button class="btn-table" onclick="confirmTransferInbound('${r.id}')">Chấp nhận nhập hàng</button>
              <button class="btn-table btn-table-danger" onclick="rejectTransferInbound('${r.id}')">Từ chối</button>
            </div>
          `;
        }
        const compareBtn = `<button class="btn-table" onclick="openTransferCompareModal('${r.sku}', '${r.wh}')">So sánh</button>`;
        if (r.type === 'TRANSFER') {
          return `
            <div style="display:flex;gap:4px;justify-content:center;">
              ${compareBtn}
              <button class="btn-table" onclick="approveProposal('${r.key}')">Xử lý đơn hàng</button>
            </div>
          `;
        } else if (r.type === 'RFQ') {
          return `
            <div style="display:flex;gap:4px;justify-content:center;">
              ${compareBtn}
              <button class="btn-table" ${r.hasActiveRfq ? 'disabled' : ''} onclick="approveProposal('${r.key}')">Xử lý đơn hàng</button>
            </div>
          `;
        } else {
          const btnLabel = r.dstWh ? 'Xử lý' : 'Chọn kho nhận';
          return `
            <div style="display:flex;gap:4px;justify-content:center;">
              <button class="btn-table" onclick="openOverstockModal('${r.sku}', '${r.wh}')">${btnLabel}</button>
            </div>
          `;
        }
      }
    }
  ];

  renderTable({
    tableId: 'proposalTable',
    theadId: 'proposalThead',
    tbodyId: 'proposalTbody',
    columns: proposalColumns,
    rows: inboundAll,
    emptyMsg: `Kho ${whObj.name} đang ở trạng thái an toàn. Không có đề xuất hành động cấp bách nào.`
  });

  // --------------------------------------------------------------------------
  // 2. Outbound Queue (Kho xuất = activeWh) — bước 2 của quy trình hai bước:
  //    lệnh XC (kho nhận đã đồng ý) hiện nút xác nhận/từ chối;
  //    đề xuất TRANSFER 'Chờ duyệt' hiển thị thông tin, chờ kho nhận bấm nhận.
  // --------------------------------------------------------------------------
  const outTitleEl = document.getElementById('outboundQueueTitle');
  if (outTitleEl) {
    outTitleEl.textContent = `Hàng đợi Điều chuyển Xuất đi từ ${whObj.name}`;
  }

  const xcRows = Store.transfers
    .filter(t => t.kind === 'TRANSFER' && t.status === 'Chờ kho nguồn xác nhận' && t.srcWh === activeWh)
    .map(t => ({ key: t.id, ...t, isXc: true }));

  const outPropRows = propKeys
    .filter(k => Store.proposals[k].type === 'TRANSFER' && Store.proposals[k].srcWh === activeWh)
    .map(k => ({ key: k, ...Store.proposals[k], isXc: false }));

  const outboundRows = [...xcRows, ...outPropRows];

  const outboundColumns = [
    {
      key: 'id',
      header: 'Mã ĐX',
      width: '90px',
      render: r => `<strong style="color:var(--navy-accent);">${r.id}</strong>`
    },
    {
      key: 'sku',
      header: 'SKU',
      render: r => {
        const sku = SKUS.find(s => s.code === r.sku) || { name: r.sku };
        return `<strong>${r.sku}</strong> - <span style="font-size:11px;color:var(--text-muted);">${sku.name}</span>`;
      }
    },
    {
      key: 'dstWh',
      header: 'Kho nhận viện trợ',
      render: r => {
        const code = r.dstWh || r.wh;
        const dest = WAREHOUSES.find(w => w.code === code) || { name: code };
        return `<strong>${dest.name}</strong>`;
      }
    },
    {
      key: 'qty',
      header: 'Lượng xuất chuyển',
      align: 'right',
      render: r => {
        const sku = SKUS.find(s => s.code === r.sku) || { unit: 'cái' };
        return `<strong>${fmtNum(r.qty)}</strong> ${sku.unit}`;
      }
    },
    {
      key: 'arrival',
      header: 'Thời gian đến',
      render: r => r.arrivalDate ? `${fmtDateVN(r.arrivalDate)} (${r.leadDays} ngày)` : '—'
    },
    {
      key: 'cost',
      header: 'Chi phí vận chuyển',
      align: 'right',
      render: r => {
        const freight = r.isXc ? r.cost : r.freightCost;
        return freight > 0 ? `<strong style="color:var(--navy-accent);">${fmtVND(freight)}</strong>` : '—';
      }
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: r => r.isXc
        ? `<span class="status-pill status-pill-high">${r.status}</span>`
        : '<span class="status-pill status-pill-low">Chờ kho nhận bấm nhận hàng</span>'
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'center',
      width: '190px',
      render: r => {
        if (r.isXc) {
          return `
            <div style="display:flex;gap:4px;justify-content:center;">
              <button class="btn-table btn-table-sec" onclick="openTransferRequestDetail('${r.id}')">Chi tiết</button>
              <button class="btn-table" onclick="confirmTransferOutbound('${r.id}')">Xác nhận gửi hàng</button>
              <button class="btn-table btn-table-danger" onclick="rejectTransferRequest('${r.id}')">Từ chối</button>
            </div>
          `;
        }
        return '<span style="font-size:11px;color:var(--text-muted);">Chuyển sang tab kho nhận để bấm nhận</span>';
      }
    }
  ];

  renderTable({
    tableId: 'outboundTable',
    theadId: 'outboundThead',
    tbodyId: 'outboundTbody',
    columns: outboundColumns,
    rows: outboundRows,
    emptyMsg: `Hiện tại không có yêu cầu điều chuyển nào lấy hàng từ ${whObj.name}.`
  });

  // --------------------------------------------------------------------------
  // 3. 5x11 Inventory Status Matrix (with active warehouse highlighted)
  // --------------------------------------------------------------------------
  WAREHOUSES.forEach(wh => {
    const thEl = document.getElementById(`th-wh-${wh.code}`);
    if (thEl) {
      if (wh.code === activeWh) {
        thEl.classList.add('active-wh-col');
      } else {
        thEl.classList.remove('active-wh-col');
      }
    }
  });

  const matrixTbody = document.getElementById('matrixTbody');
  if (matrixTbody) {
    let mHtml = '';
    const whTotals = {
      HCM:     { low: 0, ok: 0, high: 0 },
      BD:      { low: 0, ok: 0, high: 0 },
      DN:      { low: 0, ok: 0, high: 0 },
      HG: { low: 0, ok: 0, high: 0 },
      HN:      { low: 0, ok: 0, high: 0 }
    };

    SKUS.forEach(sku => {
      mHtml += '<tr>';
      mHtml += `<td><strong>${sku.code}</strong><br><span style="font-size:11px;color:var(--text-muted);">${sku.name}</span></td>`;

      WAREHOUSES.forEach(wh => {
        const st = (Store.stock && Store.stock[wh.code] && Store.stock[wh.code][sku.code])
          ? Store.stock[wh.code][sku.code]
          : { on_hand: 0, in_transit: 0, committed: 0 };
        const p  = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
        // Matrix: chi hien MIN/MAX hien tai cua he thong (khong dual AI/baseline)
        const ropRender = fmtNum(p.rop);
        const qmaxRender = fmtNum(p.qmax);
        // Cong lai giu cho chua gui hang de thay dung ban chat ton that cua o
        const reserveMx = (typeof getPendingProposalReserve === 'function') ? getPendingProposalReserve(sku.code, wh.code) : 0;
        const eff = st.on_hand + st.in_transit - st.committed + reserveMx;
        const status = getStatus(eff, p);

        whTotals[wh.code][status.toLowerCase()]++;

        let cellClass = 'matrix-cell cell-ok';
        let tagText = 'An toàn';
        if (status === 'LOW') {
          cellClass = 'matrix-cell cell-low';
          tagText = 'Dưới MIN';
        } else if (status === 'HIGH') {
          cellClass = 'matrix-cell cell-high';
          tagText = 'Vượt MAX';
        }

        if (status === 'OK' && st.on_hand <= p.rop && st.in_transit > 0) {
          tagText = 'An toàn (hàng đang về)';
        }

        const transitText = st.in_transit > 0 ? ` (+${st.in_transit} đang về)` : '';
        const modalFunc = status === 'HIGH' ? `openOverstockModal('${sku.code}', '${wh.code}')` : `openTransferCompareModal('${sku.code}', '${wh.code}')`;
        const isCurrentActive = (wh.code === activeWh);
        const activeClass = isCurrentActive ? ' active-wh-col' : '';

        mHtml += `
          <td class="${cellClass}${activeClass}" onclick="${modalFunc}" title="Tồn thực: ${st.on_hand}${transitText} | MIN(ROP): ${p.rop} | MAX(Qmax): ${p.qmax}">
            <div class="cell-qty">${st.on_hand}${transitText}</div>
            <div class="cell-sub">${tagText} (${ropRender} / ${qmaxRender})</div>
          </td>
        `;
      });

      mHtml += '</tr>';
    });

    // Summary row
    mHtml += `
      <tr style="background:#F1F5F9;font-weight:700;border-top:2px solid var(--border-color);">
        <td>Tổng số phân bổ (Thiếu / An toàn / Dư)</td>
        ${WAREHOUSES.map(wh => {
          const t = whTotals[wh.code];
          const isCurrentActive = (wh.code === activeWh);
          const activeClass = isCurrentActive ? ' class="active-wh-col"' : '';
          return `
            <td style="text-align:center;font-size:11.5px;padding:8px 4px;"${activeClass}>
              <span style="color:var(--status-red);font-weight:700;">${t.low}</span> /
              <span style="color:var(--status-green);font-weight:700;">${t.ok}</span> /
              <span style="color:var(--status-yellow);font-weight:700;">${t.high}</span>
            </td>
          `;
        }).join('')}
      </tr>
    `;

    matrixTbody.innerHTML = mHtml;
  }
}


// ============================================================================
// KHUNG "LỊCH SỰ KIỆN CỦA KHO" TRÊN DASHBOARD (Yêu cầu 3.3)
// ============================================================================
function renderWarehouseEventsSchedule(activeWh) {
  const container = document.getElementById('warehouseEventsScheduleCard');
  if (!container) return;

  const whObj = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];
  const curDate = Store.currentDate;

  // Chỉ giữ sự kiện có tác động thật đến tồn kho: hệ số cầu != 1, trễ NCC, hoặc fill rate < 100%
  const whEvents = EVENTS.filter(ev =>
    isEventMatchingWarehouse(ev.scope_wh, activeWh) &&
    ((ev.demand_mult !== undefined && ev.demand_mult !== null && ev.demand_mult !== 1.0) ||
     ((ev.delay_days || 0) > 0) ||
     (ev.fill_rate !== undefined && ev.fill_rate !== null && ev.fill_rate < 1.0)));

  const activeEvts = whEvents.filter(ev => curDate >= ev.start && curDate <= ev.end);
  const upcomingEvts = whEvents.filter(ev => ev.start > curDate && ev.start <= addDays(curDate, 14));

  function renderEvtRow(ev, badgeStatus) {
    let sevBadge = '<span class="status-pill status-pill-ok" style="background:#E0F2FE;color:#0369A1;border:1px solid #BAE6FD;font-weight:700;">Thấp</span>';
    if (ev.severity === 'Cao') {
      sevBadge = '<span class="status-pill status-pill-low" style="background:#FEE2E2;color:#B91C1C;border:1px solid #FCA5A5;font-weight:700;">Cao</span>';
    } else if (ev.severity === 'Trung bình') {
      sevBadge = '<span class="status-pill status-pill-high" style="background:#FEF3C7;color:#B45309;border:1px solid #FCD34D;font-weight:700;">Trung bình</span>';
    }

    const impact = (typeof formatWhEventImpact === 'function') ? formatWhEventImpact(ev, activeWh) : '';
    const target = (ev.scope_target === 'ALL' || !ev.scope_target) ? 'Toàn bộ SKU' : ev.scope_target;

    return `
      <div class="event-row" onclick="openEventDetailModal('${ev.id}', '${activeWh}')" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border-subtle);border-radius:4px;cursor:pointer;transition:background 0.15s ease;" title="Bấm để xem chi tiết tác động tại ${whObj.name}">
        <div style="display:flex;align-items:center;gap:10px;flex:1;">
          ${sevBadge}
          <div>
            <div style="font-size:12.5px;font-weight:700;color:var(--text-main);">
              ${ev.title}
              <span style="font-size:11px;font-weight:500;color:var(--text-muted);margin-left:6px;">(${fmtDateVN(ev.start)} - ${fmtDateVN(ev.end)})</span>
            </div>
            <div style="font-size:11px;color:var(--text-sub);margin-top:2px;">
              <span>Mục tiêu: <strong>${target}</strong></span>
              <span style="margin:0 6px;">•</span>
              <span style="color:#B45309;font-weight:600;">${impact}</span>
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;color:var(--navy-accent);font-weight:600;">Xem chi tiết ›</span>
        </div>
      </div>
    `;
  }

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-size:13px;font-weight:700;color:var(--navy-main);display:flex;align-items:center;gap:8px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        Lịch sự kiện & Tác động chuỗi cung ứng tại ${whObj.name}
      </div>
      <div style="font-size:11px;color:var(--text-muted);">
        ${activeEvts.length} đang diễn ra • ${upcomingEvts.length} sắp diễn ra (14 ngày tới)
      </div>
    </div>
  `;

  // 1. Đang diễn ra
  html += `
    <div style="margin-top:8px;">
      <div style="font-size:11px;font-weight:700;color:#15803D;background:#F0FDF4;padding:4px 8px;border-radius:4px;border-left:3px solid #16A34A;margin-bottom:6px;">
        ĐANG DIỄN RA (${activeEvts.length})
      </div>
      ${activeEvts.length > 0 ? activeEvts.map(e => renderEvtRow(e, 'ACTIVE')).join('') : '<div style="font-size:11.5px;color:var(--text-muted);padding:4px 8px;font-style:italic;">Không có sự kiện bất thường nào đang diễn ra tại kho này.</div>'}
    </div>
  `;

  // 2. Sắp diễn ra
  html += `
    <div style="margin-top:12px;">
      <div style="font-size:11px;font-weight:700;color:#B45309;background:#FFFBEB;padding:4px 8px;border-radius:4px;border-left:3px solid #D97706;margin-bottom:6px;">
        SẮP DIỄN RA TRONG 14 NGÀY TỚI (${upcomingEvts.length})
      </div>
      ${upcomingEvts.length > 0 ? upcomingEvts.map(e => renderEvtRow(e, 'UPCOMING')).join('') : '<div style="font-size:11.5px;color:var(--text-muted);padding:4px 8px;font-style:italic;">Chưa có sự kiện nào sắp tới trong 14 ngày tới.</div>'}
    </div>
  `;

  container.innerHTML = html;
}

// ============================================================================
// VIEW 1: DASHBOARD (PROPOSALS & OUTBOUND FOR ACTIVE WAREHOUSE - C2)
// ============================================================================

function renderDashboardView() {
  const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
  const whObj = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];

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
      render: r => `<strong>${whObj.name}</strong>`
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
          const supObj = SUPPLIERS[r.sup];
          return `<strong>${supObj ? supObj.name : (r.sup || 'Nhà cung cấp')}</strong>`;
        }
        return 'Nội bộ kho';
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
      render: r => r.freightCost > 0 ? fmtVND(r.freightCost) : '-'
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
        return `<span class="status-pill ${pillClass}">${r.status}</span>`;
      }
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'center',
      render: r => {
        if (r.type === 'TRANSFER') {
          return `
            <div style="display:flex;gap:4px;justify-content:center;">
              <button class="btn-table" onclick="approveProposal('${r.key}')">Phê duyệt</button>
              <button class="btn-table btn-table-sec" onclick="openTransferCompareModal('${r.sku}', '${r.wh}')">So sánh</button>
            </div>
          `;
        } else if (r.type === 'RFQ') {
          return `
            <div style="display:flex;gap:4px;justify-content:center;">
              <button class="btn-table" ${r.hasActiveRfq ? 'disabled' : ''} onclick="openRfqModal('${r.sku}', '${r.wh}', ${r.qty}, '${r.sup}')">Gửi RFQ</button>
              <button class="btn-table btn-table-sec" onclick="openTransferCompareModal('${r.sku}', '${r.wh}')">So sánh</button>
            </div>
          `;
        } else {
          return `
            <div style="display:flex;gap:4px;justify-content:center;">
              <button class="btn-table" onclick="openOverstockModal('${r.sku}', '${r.wh}')">Xử lý</button>
              <button class="btn-table btn-table-sec" onclick="openOverstockModal('${r.sku}', '${r.wh}')">So sánh</button>
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
    rows: inboundRows,
    emptyMsg: `Kho ${whObj.name} đang ở trạng thái an toàn. Không có đề xuất hành động cấp bách nào.`
  });

  // --------------------------------------------------------------------------
  // 2. Outbound Proposal Queue (Kho xuất = activeWh) (C2)
  // --------------------------------------------------------------------------
  const outTitleEl = document.getElementById('outboundQueueTitle');
  if (outTitleEl) {
    outTitleEl.textContent = `Hàng đợi Điều chuyển Xuất đi từ ${whObj.name}`;
  }

  const outboundRows = propKeys
    .filter(k => Store.proposals[k].type === 'TRANSFER' && Store.proposals[k].srcWh === activeWh)
    .map(k => ({ key: k, ...Store.proposals[k] }));

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
        const dest = WAREHOUSES.find(w => w.code === r.wh) || { name: r.wh };
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
      render: r => `${fmtDateVN(r.arrivalDate)} (${r.leadDays} ngày)`
    },
    {
      key: 'cost',
      header: 'Chi phí vận chuyển',
      align: 'right',
      render: r => r.freightCost > 0 ? fmtVND(r.freightCost) : '-'
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: r => `<span class="status-pill status-pill-high">${r.status}</span>`
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
  const matrixTbody = document.getElementById('matrixTbody');
  if (matrixTbody) {
    let mHtml = '';
    const whTotals = {
      HCM:     { low: 0, ok: 0, high: 0 },
      BD:      { low: 0, ok: 0, high: 0 },
      DN:      { low: 0, ok: 0, high: 0 },
      DN_CITY: { low: 0, ok: 0, high: 0 },
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
        const eff = st.on_hand + st.in_transit - st.committed;
        const status = getStatus(eff, p);

        whTotals[wh.code][status.toLowerCase()]++;

        let cellClass = 'matrix-cell cell-ok';
        let tagText = 'OK';
        if (status === 'LOW') {
          cellClass = 'matrix-cell cell-low';
          tagText = 'Dưới MIN';
        } else if (status === 'HIGH') {
          cellClass = 'matrix-cell cell-high';
          tagText = 'Vượt MAX';
        }

        if (status === 'OK' && st.on_hand <= p.rop && st.in_transit > 0) {
          tagText = 'OK (nhờ hàng về)';
        }

        const transitText = st.in_transit > 0 ? ` (+${st.in_transit} đang về)` : '';
        const modalFunc = status === 'HIGH' ? `openOverstockModal('${sku.code}', '${wh.code}')` : `openTransferCompareModal('${sku.code}', '${wh.code}')`;
        const isCurrentActive = (wh.code === activeWh);
        const activeStyle = isCurrentActive ? 'border: 2px solid var(--navy-main);' : '';

        mHtml += `
          <td class="${cellClass}" style="${activeStyle}" onclick="${modalFunc}" title="Tồn thực: ${st.on_hand}${transitText} | MIN(ROP): ${p.rop} | MAX(Qmax): ${p.qmax}">
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
          const activeStyle = isCurrentActive ? 'background:#E2E8F0;font-weight:800;' : '';
          return `
            <td style="text-align:center;font-size:11.5px;padding:8px 4px;${activeStyle}">
              <span style="color:var(--status-red);">${t.low}</span> /
              <span style="color:var(--status-green);">${t.ok}</span> /
              <span style="color:var(--status-yellow);">${t.high}</span>
            </td>
          `;
        }).join('')}
      </tr>
    `;

    matrixTbody.innerHTML = mHtml;
  }
}

// ============================================================================
// VIEW 1: DASHBOARD (PROPOSALS TABLE & INVENTORY MATRIX) - REFACTORED (B1, B4)
// ============================================================================

function renderDashboardView() {
  // --------------------------------------------------------------------------
  // 1. Proposal Table (#proposalTbody) using renderTable helper
  // Columns: Mã ĐX | SKU | Kho nhận | Phương thức | Lượng cần | Kho nguồn / NCC | Dự kiến về (số ngày) | Chi phí vận chuyển | Trạng thái | Thao tác
  // --------------------------------------------------------------------------
  const propKeys = Object.keys(Store.proposals);
  const propRows = propKeys.map(k => ({ key: k, ...Store.proposals[k] }));

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
        const wh = WAREHOUSES.find(w => w.code === r.wh) || { name: r.wh };
        return `<strong>${wh.name}</strong>`;
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
        if (r.type === 'TRANSFER') return `Kho ${r.srcWh}`;
        if (r.type === 'RFQ') return r.sup || 'Nhà cung cấp';
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
        // B4: Button handlers
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
          // OVERSTOCK: both buttons open Overstock Modal per B4
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
    rows: propRows,
    emptyMsg: 'Tất cả các kho đang ở trạng thái an toàn. Không có đề xuất hành động cấp bách nào.'
  });

  // --------------------------------------------------------------------------
  // 2. 5x11 Inventory Status Matrix (#matrixTbody)
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
        const st = Store.stock[wh.code][sku.code];
        const p  = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
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

        // B4: If on_hand <= ROP but eff > ROP, explain "OK nhờ hàng đang về"
        if (status === 'OK' && st.on_hand <= p.rop && st.in_transit > 0) {
          tagText = 'OK (nhờ hàng về)';
        }

        const transitText = st.in_transit > 0 ? ` (+${st.in_transit} đang về)` : '';
        const modalFunc = status === 'HIGH' ? `openOverstockModal('${sku.code}', '${wh.code}')` : `openTransferCompareModal('${sku.code}', '${wh.code}')`;

        mHtml += `
          <td class="${cellClass}" onclick="${modalFunc}" title="Tồn thực: ${st.on_hand}${transitText} | ROP: ${p.rop} | MAX: ${p.qmax}">
            <div class="cell-qty">${st.on_hand}${transitText}</div>
            <div class="cell-sub">${tagText} (ROP ${p.rop})</div>
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
          return `
            <td style="text-align:center;font-size:11.5px;padding:8px 4px;">
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

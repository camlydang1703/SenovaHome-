// ============================================================================
// VIEW 1: DASHBOARD (PROPOSALS TABLE & INVENTORY MATRIX)
// ============================================================================

    // 3.4 VIEW 1: DASHBOARD
    // ----------------------------------------------------------------------------
    function renderDashboardView() {
      // 1. Proposal Table (#proposalTbody)
      const tbody = document.getElementById('proposalTbody');
      if (tbody) {
        const propKeys = Object.keys(Store.proposals);
        if (propKeys.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted);font-size:12.5px;">
                Tất cả các kho đang ở trạng thái an toàn. Không có đề xuất hành động cấp bách nào.
              </td>
            </tr>
          `;
        } else {
          let html = '';
          propKeys.forEach(k => {
            const p = Store.proposals[k];
            const sku = SKUS.find(s => s.code === p.sku) || { name: p.sku, unit: 'cái' };
            const wh  = WAREHOUSES.find(w => w.code === p.wh) || { name: p.wh };

            let typePill = '<span class="status-pill status-pill-high">Điều chuyển</span>';
            if (p.type === 'RFQ') typePill = '<span class="status-pill status-pill-low" style="background:#EDE9FE;color:#6D28D9;border-color:#DDD6FE;">Yêu cầu Báo giá</span>';
            if (p.type === 'OVERSTOCK') typePill = '<span class="status-pill status-pill-high" style="background:#FEF3C7;color:#92400E;border-color:#FDE68A;">Xả tồn / San tải</span>';

            let statusBadge = `<span class="status-pill status-pill-low">${p.status}</span>`;
            if (p.hasActiveRfq) {
              statusBadge = `<span class="status-pill" style="background:#F3F4F6;color:#4B5563;border-color:#E5E7EB;">Đang chờ NCC báo giá (${p.rfqId})</span>`;
            }

            html += `
              <tr>
                <td><strong style="color:var(--navy-accent);">${p.id}</strong></td>
                <td><strong>${p.sku}</strong> - <span style="font-size:11.5px;color:var(--text-muted);">${sku.name}</span></td>
                <td><strong>${wh.name}</strong></td>
                <td>${typePill}</td>
                <td class="num-col" style="font-weight:700;">${fmtNum(p.qty)} ${sku.unit}</td>
                <td>${p.srcWh ? `Từ ${p.srcWh}` : (p.sup || 'Nội bộ')}</td>
                <td style="font-size:11.5px;">${fmtDateVN(p.arrivalDate)} (${p.leadDays} ngày)</td>
                <td class="num-col">${p.freightCost > 0 ? fmtVND(p.freightCost) : '-'}</td>
                <td>${statusBadge}</td>
                <td style="text-align:center;white-space:nowrap;">
                  <button class="btn-table" ${p.hasActiveRfq ? 'disabled style="opacity:0.5;"' : ''} onclick="approveProposal('${k}')">
                    ${p.type === 'TRANSFER' ? 'Phê duyệt' : (p.type === 'RFQ' ? 'Gửi RFQ' : 'Xử lý')}
                  </button>
                  <button class="btn-table btn-table-sec" onclick="openTransferCompareModal('${p.sku}', '${p.wh}')">
                    So sánh
                  </button>
                </td>
              </tr>
            `;
          });
          tbody.innerHTML = html;
        }
      }

      // 2. 5x11 Inventory Status Matrix (#matrixTbody)
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
          mHtml += `<tr>`;
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

            mHtml += `
              <td class="${cellClass}" onclick="openTransferCompareModal('${sku.code}', '${wh.code}')" title="Tồn: ${st.on_hand} | ROP: ${p.rop} | MAX: ${p.qmax}">
                <div class="cell-qty">${st.on_hand}</div>
                <div class="cell-sub">${tagText} (ROP ${p.rop})</div>
                ${st.in_transit > 0 ? `<div class="cell-tag">+${st.in_transit} trên đường</div>` : ''}
              </td>
            `;
          });

          mHtml += `</tr>`;
        });

        // Summary row at bottom
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

    // ----------------------------------------------------------------------------


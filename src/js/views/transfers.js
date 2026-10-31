// ============================================================================
// VIEW 3: TRANSFERS
// ============================================================================

    // 3.6 VIEW 3: TRANSFERS
    // ----------------------------------------------------------------------------
    function renderTransfersView() {
      const tbody = document.getElementById('transferTbody');
      if (!tbody) return;

      if (Store.transfers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted);">Chưa có lệnh điều chuyển nội bộ nào được ghi nhận.</td></tr>`;
        return;
      }

      let html = '';
      Store.transfers.forEach(tr => {
        const sku = SKUS.find(s => s.code === tr.sku) || { name: tr.sku, unit: 'cái' };
        const isArrived = tr.status === 'Đã nhận';

        html += `
          <tr>
            <td><strong style="color:var(--navy-accent);">${tr.id}</strong></td>
            <td>${fmtDateVN(tr.date)}</td>
            <td><strong>${tr.sku}</strong> - <span style="font-size:11.5px;color:var(--text-muted);">${sku.name}</span></td>
            <td><span class="status-pill status-pill-high" style="background:#F1F5F9;color:#334155;border-color:#CBD5E1;">${tr.srcWh}</span></td>
            <td><span class="status-pill status-pill-ok" style="background:#ECFDF5;color:#047857;border-color:#A7F3D0;">${tr.dstWh}</span></td>
            <td class="num-col" style="font-weight:700;">${fmtNum(tr.qty)} ${sku.unit}</td>
            <td class="num-col">${fmtVND(tr.cost)}</td>
            <td style="font-size:11.5px;">${fmtDateVN(tr.arrivalDate)}</td>
            <td>
              <span class="status-pill ${isArrived ? 'status-pill-ok' : 'status-pill-high'}">
                ${tr.status}
              </span>
            </td>
            <td style="text-align:center;">
              ${!isArrived ? `
                <button class="btn-table" onclick="receiveTransferEarly('${tr.id}')">
                  Tiếp nhận sớm
                </button>
              ` : '<span style="font-size:11.5px;color:var(--status-green);">Hoàn tất</span>'}
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    }

    // ----------------------------------------------------------------------------


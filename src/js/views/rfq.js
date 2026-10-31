// ============================================================================
// VIEW 4: RFQ MANAGEMENT
// ============================================================================

    // 3.7 VIEW 4: RFQ MANAGEMENT
    // ----------------------------------------------------------------------------
    function renderRfqView() {
      const tbody = document.getElementById('rfqTbody');
      if (!tbody) return;

      if (Store.rfqs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted);">Chưa có Yêu cầu Báo giá (RFQ) nào được gửi tới Nhà cung cấp.</td></tr>`;
        return;
      }

      let html = '';
      Store.rfqs.forEach(rfq => {
        const sku = SKUS.find(s => s.code === rfq.sku) || { name: rfq.sku, unit: 'cái' };
        let statusPill = `<span class="status-pill status-pill-high" style="background:#EDE9FE;color:#6D28D9;border-color:#DDD6FE;">Đã gửi NCC</span>`;
        if (rfq.status === 'Quá hạn') {
          statusPill = `<span class="status-pill status-pill-low" style="background:#FEE2E2;color:#991B1B;border-color:#FECACA;">Quá hạn</span>`;
        } else if (rfq.status === 'Đã hủy') {
          statusPill = `<span class="status-pill" style="background:#F3F4F6;color:#6B7280;border-color:#E5E7EB;">Đã hủy</span>`;
        }

        html += `
          <tr>
            <td><strong style="color:var(--navy-accent);">${rfq.id}</strong></td>
            <td>${fmtDateVN(rfq.date)}</td>
            <td><strong>${rfq.sku}</strong> - <span style="font-size:11.5px;color:var(--text-muted);">${sku.name}</span></td>
            <td><strong>${rfq.wh}</strong></td>
            <td>${rfq.sup}</td>
            <td class="num-col" style="font-weight:700;">${fmtNum(rfq.qty)} ${sku.unit}</td>
            <td style="font-size:11.5px;">${fmtDateVN(rfq.validUntil)}</td>
            <td>${statusPill}</td>
            <td style="text-align:center;">
              ${rfq.status === 'Đã gửi NCC' ? `
                <button class="btn-table btn-table-sec" onclick="cancelRfq('${rfq.id}')">
                  Hủy RFQ
                </button>
              ` : `
                <button class="btn-table" onclick="openRfqModal('${rfq.sku}', '${rfq.wh}', ${rfq.qty}, '${rfq.sup}')">
                  Gửi lại
                </button>
              `}
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    }

    // ----------------------------------------------------------------------------


// ============================================================================
// VIEW 2: INVENTORY DETAIL TABLE
// ============================================================================

    // 3.5 VIEW 2: INVENTORY DETAIL TABLE
    // ----------------------------------------------------------------------------
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

          const st = Store.stock[wh.code][sku.code];
          const p  = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
          const eff = st.on_hand + st.in_transit - st.committed;
          const status = getStatus(eff, p);

          if (stFilter !== 'ALL' && status !== stFilter) return;

          if (search) {
            const matchCode = sku.code.toLowerCase().includes(search);
            const matchName = sku.name.toLowerCase().includes(search);
            if (!matchCode && !matchName) return;
          }

          // Check if active RFQ exists
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

      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--text-muted);">Không tìm thấy sản phẩm nào khớp bộ lọc.</td></tr>`;
        return;
      }

      let html = '';
      rows.forEach(r => {
        let pill = '<span class="status-pill status-pill-ok">OK (An toàn)</span>';
        if (r.status === 'LOW')  pill = '<span class="status-pill status-pill-low">Dưới MIN (Cần nhập)</span>';
        if (r.status === 'HIGH') pill = '<span class="status-pill status-pill-high">Vượt MAX (Tồn dư)</span>';

        html += `
          <tr>
            <td><strong>${r.sku.code}</strong></td>
            <td>${r.sku.name}</td>
            <td><span style="font-size:11.5px;color:var(--text-muted);">${r.sku.cat}</span></td>
            <td><strong>${r.wh.name}</strong></td>
            <td class="num-col" style="font-weight:700;">${fmtNum(r.st.on_hand)}</td>
            <td class="num-col">${r.st.in_transit > 0 ? `<span style="color:var(--navy-accent);font-weight:600;">+${fmtNum(r.st.in_transit)}</span>` : '-'}</td>
            <td class="num-col">${r.activeRfq ? `<span style="color:#7C3AED;font-weight:600;">${fmtNum(r.activeRfq.qty)}</span>` : '-'}</td>
            <td class="num-col" style="font-weight:700;color:var(--navy-main);">${fmtNum(r.eff)}</td>
            <td class="num-col" style="color:var(--status-red);">${fmtNum(r.p.rop)}</td>
            <td class="num-col" style="color:var(--status-yellow);">${fmtNum(r.p.qmax)}</td>
            <td>${pill}</td>
            <td style="text-align:center;">
              <button class="btn-table" onclick="openTransferCompareModal('${r.sku.code}', '${r.wh.code}')">
                ${r.status === 'LOW' ? 'Bổ sung' : (r.status === 'HIGH' ? 'Xả tồn' : 'Chi tiết')}
              </button>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
    }

    // ----------------------------------------------------------------------------


// ============================================================================
// VIEW 6: PARAMS & AI FORMULAS
// ============================================================================

    // 3.9 VIEW 6: PARAMS & AI FORMULAS (Yêu cầu 6)
    // ----------------------------------------------------------------------------
    function renderParamsView() {
      // 1. Setup dropdown selectors for interactive step calculation
      const skuSel = document.getElementById('paramSkuSelect');
      const whSel  = document.getElementById('paramWhSelect');

      if (skuSel && skuSel.children.length === 0) {
        skuSel.innerHTML = SKUS.map(s => `<option value="${s.code}">${s.code} - ${s.name}</option>`).join('');
      }
      if (whSel && whSel.children.length === 0) {
        whSel.innerHTML = WAREHOUSES.map(w => `<option value="${w.code}">${w.name} (${w.code})</option>`).join('');
      }

      const curSku = skuSel ? skuSel.value : 'TLM-045';
      const curWh  = whSel  ? whSel.value  : 'HCM';

      // 2. Interactive Step Calculation Box (#paramStepCalc)
      renderStepCalculator(curSku, curWh);

      // 3. Dynamic 55-row Parameters Table (#paramsTbody)
      const tbody = document.getElementById('paramsTbody');
      if (tbody) {
        let html = '';
        const m = getMonthFromDate(Store.currentDate);

        SKUS.forEach(sku => {
          const sm = SI[sku.code] ? (SI[sku.code][m] || 1.0) : 1.0;

          WAREHOUSES.forEach(wh => {
            const p  = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
            const st = Store.stock[wh.code][sku.code];
            const eff = st.on_hand + st.in_transit - st.committed;
            const status = getStatus(eff, p);

            let pill = '<span class="status-pill status-pill-ok">OK</span>';
            if (status === 'LOW')  pill = '<span class="status-pill status-pill-low">LOW</span>';
            if (status === 'HIGH') pill = '<span class="status-pill status-pill-high">HIGH</span>';

            html += `
              <tr>
                <td><strong>${sku.code}</strong></td>
                <td>${sku.name}</td>
                <td><strong>${wh.name}</strong></td>
                <td class="num-col">${(wh.w * 100).toFixed(0)}%</td>
                <td class="num-col">${p.d_sma4}</td>
                <td class="num-col">${sm.toFixed(3)}</td>
                <td class="num-col" style="font-weight:700;">${p.f_next}</td>
                <td class="num-col">${p.lead.toFixed(1)}</td>
                <td class="num-col">${p.sigma.toFixed(1)}</td>
                <td class="num-col">${p.ss}</td>
                <td class="num-col" style="font-weight:700;color:var(--status-red);">${p.rop}</td>
                <td class="num-col" style="font-weight:700;color:var(--status-yellow);">${p.qmax}</td>
                <td>${pill}</td>
              </tr>
            `;
          });
        });
        tbody.innerHTML = html;
      }
    }

    function renderStepCalculator(skuCode, whCode) {
      const box = document.getElementById('paramStepCalc');
      if (!box) return;

      const sku = SKUS.find(s => s.code === skuCode) || SKUS[0];
      const wh  = WAREHOUSES.find(w => w.code === whCode) || WAREHOUSES[0];
      const m   = getMonthFromDate(Store.currentDate);
      const sm  = SI[sku.code] ? (SI[sku.code][m] || 1.0) : 1.0;
      const p   = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
      const st  = Store.stock[wh.code][sku.code];
      const eff = st.on_hand + st.in_transit - st.committed;
      const status = getStatus(eff, p);

      const hist = (Store.history[sku.code] && Store.history[sku.code][wh.code]) || [];
      const trailing4 = hist.slice(-4);
      const trailing8 = hist.slice(-8);

      const dVals = trailing4.map(h => h.demand).join(', ') || '120, 135, 128, 142';
      const deVals = trailing4.map(h => h.deseason).join(', ') || '122, 137, 130, 144';

      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #E2E8F0;padding-bottom:8px;">
          <div>
            <strong style="font-size:13px;color:var(--navy-main);">Dữ liệu Thực tế: ${sku.code} (${sku.name}) tại ${wh.name}</strong><br>
            <span style="font-size:11.5px;color:var(--text-muted);">Ngày mô phỏng: ${fmtDateVN(Store.currentDate)} | Tỷ trọng vùng: ${wh.w * 100}% | Tháng: ${m}</span>
          </div>
          <div>
            <span class="status-pill ${status === 'LOW' ? 'status-pill-low' : (status === 'HIGH' ? 'status-pill-high' : 'status-pill-ok')}">
              Tồn: ${eff} / ROP: ${p.rop} / MAX: ${p.qmax} -> ${status}
            </span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px;font-size:12px;color:var(--text-main);">
          <div style="background:#FFFFFF;padding:10px;border-radius:6px;border:1px solid #E2E8F0;">
            <strong style="color:var(--navy-accent);">Bước 1: Khử mùa 4 tuần gần nhất</strong>
            <div style="font-size:11px;color:var(--text-muted);margin:4px 0;">Tiêu thụ thực tế D = [${dVals}]</div>
            <div>Khử mùa dt = Dt / Sm = [${deVals}]</div>
            <div style="margin-top:4px;font-weight:600;">-> D_SMA4 = ${p.d_sma4} ${sku.unit}/tuần</div>
          </div>

          <div style="background:#FFFFFF;padding:10px;border-radius:6px;border:1px solid #E2E8F0;">
            <strong style="color:var(--navy-accent);">Bước 2: Dự báo tuần tới (F_next)</strong>
            <div style="font-size:11px;color:var(--text-muted);margin:4px 0;">F = D_SMA4 x Sm (Tháng ${m} = ${sm.toFixed(3)})</div>
            <div>F = ${p.d_sma4} x ${sm.toFixed(3)} = ${(p.d_sma4 * sm).toFixed(1)}</div>
            <div style="margin-top:4px;font-weight:600;">-> F_next = ${p.f_next} ${sku.unit}/tuần</div>
          </div>

          <div style="background:#FFFFFF;padding:10px;border-radius:6px;border:1px solid #E2E8F0;">
            <strong style="color:var(--navy-accent);">Bước 3: Tồn an toàn (Safety Stock - SS)</strong>
            <div style="font-size:11px;color:var(--text-muted);margin:4px 0;">SS = Z x Sigma x sqrt(L) với Z=1.65 (95%), L=${p.lead.toFixed(1)} tuần</div>
            <div>SS = 1.65 x ${p.sigma.toFixed(1)} x sqrt(${p.lead.toFixed(1)}) = ${(1.65 * p.sigma * Math.sqrt(p.lead)).toFixed(1)}</div>
            <div style="margin-top:4px;font-weight:600;">-> SS = ${p.ss} ${sku.unit}</div>
          </div>

          <div style="background:#FFFFFF;padding:10px;border-radius:6px;border:1px solid #E2E8F0;">
            <strong style="color:var(--navy-accent);">Bước 4: Điểm đặt lại MIN (ROP) & Trần MAX</strong>
            <div style="font-size:11px;color:var(--text-muted);margin:4px 0;">ROP = (F x L) + SS | Qmax = (F x (L+R)) + SS với R=1 tuần</div>
            <div>ROP = (${p.f_next} x ${p.lead.toFixed(1)}) + ${p.ss} = ${p.rop}</div>
            <div style="margin-top:4px;font-weight:600;color:var(--status-red);">-> MIN (ROP) = ${p.rop} | <span style="color:var(--status-yellow);">MAX = ${p.qmax}</span></div>
          </div>
        </div>
      `;
    }

    // ----------------------------------------------------------------------------


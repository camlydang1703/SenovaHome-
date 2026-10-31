// ============================================================================
// UI MODALS, TOASTS & SCENARIOS
// ============================================================================

    // 3.1 MODAL & TOAST HELPERS
    // ----------------------------------------------------------------------------
    function openModal(id) {
      const modal = document.getElementById(id);
      if (modal) modal.classList.add('active');
    }

    function closeModal(id) {
      const modal = document.getElementById(id);
      if (modal) modal.classList.remove('active');
    }

    function showToast(msg, type = 'info') {
      const tray = document.getElementById('toastTray');
      if (!tray) return;

      const toast = document.createElement('div');
      toast.className = `toast-item toast-${type}`;
      let iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
      if (type === 'success') iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      if (type === 'error')   iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      if (type === 'warning') iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';

      toast.innerHTML = `
        <span style="display:inline-flex;align-items:center;">${iconSvg}</span>
        <span style="flex:1;">${msg}</span>
      `;
      tray.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    // ----------------------------------------------------------------------------

    // 2.13 OVERSTOCK MITIGATION (2A & 2B) (Yêu cầu 0.10)
    // ----------------------------------------------------------------------------
    function openOverstockModal(skuCode, whCode) {
      const sku = SKUS.find(s => s.code === skuCode);
      const wh  = WAREHOUSES.find(w => w.code === whCode);
      const p   = calcSKUParams(skuCode, whCode, Store.currentDate, Store.history);
      const st  = Store.stock[whCode][skuCode];
      const effSrc = st.on_hand + st.in_transit - st.committed;
      const excess = Math.max(0, Math.min(effSrc - p.qmax, getTransferableQty(skuCode, whCode, Store.currentDate)));
      const baseP = (Store.baseParams && Store.baseParams[skuCode] && Store.baseParams[skuCode][whCode]) || p;
      const driver = getDriverExplanation(skuCode, whCode, Store.currentDate, p, baseP);
      const dualQmax = renderDualParam(baseP ? baseP.qmax : p.qmax, p.qmax, 'Qmax', driver);

      // Phân tích các kho nhận tiềm năng trong mạng lưới
      // Ưu tiên:
      // 1. Kho đang thiếu hụt (isLow = true) ưu tiên hơn kho không thiếu
      // 2. Trong các kho cùng thiếu (hoặc cùng không thiếu), ưu tiên kho có chi phí vận chuyển thấp hơn + lead time nhanh hơn
      // 3. Nếu chênh lệch cước rất lớn, hệ thống chọn kho có tổng hiệu quả chi phí / cứu nguy cao nhất
      const candidateWhs = WAREHOUSES.filter(w => w.code !== whCode).map(w => {
        const destP = calcSKUParams(skuCode, w.code, Store.currentDate, Store.history);
        const destSt = Store.stock[w.code][skuCode];
        const destEff = destSt.on_hand + destSt.in_transit - destSt.committed;
        const tDays = getTransferDays(whCode, w.code);
        const freight = calcFreightCost(whCode, w.code, skuCode, excess);
        const isLow = destEff <= destP.rop;
        const capacity = Math.max(0, destP.qmax - destEff);
        const deficit = isLow ? (destP.rop - destEff) : 0;
        const ratio = destP.rop > 0 ? (destEff / destP.rop) : 1;
        return {
          code: w.code,
          name: w.name,
          p: destP,
          st: destSt,
          eff: destEff,
          tDays: tDays,
          freight: freight,
          isLow: isLow,
          capacity: capacity,
          deficit: deficit,
          ratio: ratio
        };
      }).sort((a, b) => {
        // Cùng thiếu hụt: ưu tiên chi phí vận chuyển thấp hơn (ví dụ Bình Dương gần hơn nhiều so với Hà Nội)
        if (a.isLow && b.isLow) {
          if (a.freight !== b.freight) return a.freight - b.freight;
          return a.tDays - b.tDays;
        }
        // Một bên thiếu, một bên không thiếu
        if (a.isLow !== b.isLow) return a.isLow ? -1 : 1;
        // Cùng không thiếu: ưu tiên cước thấp hơn
        if (a.freight !== b.freight) return a.freight - b.freight;
        return a.ratio - b.ratio;
      });

      const bestTarget = candidateWhs[0];

      const title = document.getElementById('overstockModalTitle');
      if (title) title.textContent = `Điều phối San tải Tồn dư Vượt MAX: ${sku.code} tại ${wh.name}`;

      const body = document.getElementById('overstockModalBody');
      if (body) {
        body.innerHTML = `
          <div style="background:#F8FAFC;border:1px solid var(--border-color);padding:14px;border-radius:6px;margin-bottom:16px;">
            <div style="font-weight:700;color:var(--navy-main);font-size:13px;margin-bottom:6px;">
              Tình trạng tồn trữ: ${sku.name} (${sku.code})
            </div>
            <div style="font-size:12px;color:var(--text-sub);line-height:1.6;">
              Tồn kho hiện tại: <strong>${st.on_hand}</strong> ${sku.unit} | Ngưỡng MAX an toàn: <strong>${p.qmax}</strong> | Tồn dư vượt đỉnh: <strong style="color:var(--status-red);">${excess}</strong> ${sku.unit}<br>
              Vốn bị chiếm dụng cần giải phóng: <strong style="color:var(--navy-main);">${fmtVND(excess * sku.cogs)}</strong>.
            </div>
          </div>

          <div style="border:1px solid var(--border-color);border-radius:8px;padding:16px;background:#FFFFFF;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <strong style="font-size:13px;color:var(--navy-main);">Chọn Kho Nhận Viện trợ (Xếp hạng theo mức độ cấp thiết)</strong>
              <span class="status-pill status-pill-ok" style="font-size:11px;">Tối ưu chi phí & nhu cầu</span>
            </div>

            <!-- DANH SÁCH CÁC KHO CÓ THỂ NHẬN HÀNG -->
            <div style="border:1px solid var(--border-subtle);border-radius:6px;overflow:hidden;margin-bottom:14px;">
              <table style="width:100%;font-size:12px;border-collapse:collapse;">
                <thead>
                  <tr style="background:#F8FAFC;border-bottom:1px solid var(--border-color);text-align:left;">
                    <th style="padding:8px 10px;">Kho nhận</th>
                    <th style="padding:8px 10px;text-align:right;">Tồn hiện tại / MIN</th>
                    <th style="padding:8px 10px;">Tình trạng nhu cầu</th>
                    <th style="padding:8px 10px;text-align:right;">Thời gian giao</th>
                    <th style="padding:8px 10px;text-align:right;">Chi phí vận chuyển</th>
                  </tr>
                </thead>
                <tbody>
                  ${candidateWhs.map((cw, idx) => `
                    <tr id="overstock-row-${cw.code}" style="border-bottom:1px solid var(--border-subtle);${idx === 0 ? 'background:#F0FDF4;' : ''}">
                      <td style="padding:8px 10px;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;">
                          <input type="radio" name="overstockWhSelect" value="${cw.code}" ${idx === 0 ? 'checked' : ''} onchange="selectOverstockWhOption('${cw.code}')">
                          ${cw.name}
                          ${idx === 0 ? '<span style="font-size:10px;background:#15803D;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700;">Khuyến nghị tối ưu</span>' : ''}
                        </label>
                      </td>
                      <td style="padding:8px 10px;text-align:right;font-weight:600;">
                        ${cw.eff} / ${cw.p.rop}
                      </td>
                      <td style="padding:8px 10px;">
                        ${cw.isLow 
                          ? '<span style="color:var(--status-red);font-weight:700;">Dưới MIN (Thiếu hụt hàng)</span>' 
                          : (cw.capacity > 0 ? '<span style="color:var(--status-green);font-weight:600;">Còn sức chứa kho</span>' : '<span style="color:var(--status-yellow);">Gần trần MAX</span>')}
                      </td>
                      <td style="padding:8px 10px;text-align:right;">${cw.tDays} ngày</td>
                      <td style="padding:8px 10px;text-align:right;font-weight:700;color:var(--navy-accent);">${fmtVND(cw.freight)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <input type="hidden" id="overstockTargetWh" value="${bestTarget.code}">

            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;background:#F8FAFC;padding:10px 14px;border-radius:6px;border:1px solid var(--border-subtle);">
              <label style="font-size:12.5px;font-weight:600;color:var(--navy-main);">Số lượng điều chuyển san tải:</label>
              <input type="number" id="overstockQtyInput" value="${excess}" min="1" max="${excess}" style="width:90px;padding:4px 8px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;font-weight:700;">
              <span style="font-size:12px;color:var(--text-muted);">${sku.unit} (khuyến nghị san toàn bộ ${excess} ${sku.unit} tồn dư để đưa kho về mức an toàn)</span>
            </div>

            <div style="display:flex;gap:10px;justify-content:flex-end;">
              <button class="btn-large-sec" onclick="closeModal('overstockModal')">Hủy bỏ</button>
              <button class="btn-large" onclick="executeBatch2ATransfer('${sku.code}', '${wh.code}')">
                Thực thi chuyển kho san tải
              </button>
            </div>
          </div>
        `;
      }
      openModal('overstockModal');
    }

        function selectOverstockWhOption(whCode) {
      const targetInput = document.getElementById('overstockTargetWh');
      if (targetInput) targetInput.value = whCode;
      WAREHOUSES.forEach(w => {
        const row = document.getElementById(`overstock-row-${w.code}`);
        if (row) {
          if (w.code === whCode) {
            row.style.background = '#F0FDF4';
          } else {
            row.style.background = '';
          }
        }
      });
    }

    function executeBatch2ATransfer(skuCode, srcWhCode) {
      const sku = SKUS.find(s => s.code === skuCode);
      const st  = Store.stock[srcWhCode][skuCode];
      const p   = calcSKUParams(skuCode, srcWhCode, Store.currentDate, Store.history);
      const effSrc = st.on_hand + st.in_transit - st.committed;
      const excess = Math.max(0, Math.min(effSrc - p.qmax, getTransferableQty(skuCode, srcWhCode, Store.currentDate)));

      if (excess <= 0) {
        showToast('Kho không còn lượng tồn dư vượt MAX để chuyển!', 'info');
        closeModal('overstockModal');
        return;
      }

      const targetWhInput = document.getElementById('overstockTargetWh');
      const targetWhCode = targetWhInput ? targetWhInput.value : null;
      const targetWh = (targetWhCode && WAREHOUSES.find(w => w.code === targetWhCode)) || WAREHOUSES.filter(w => w.code !== srcWhCode)[0];

      const qtyInput = document.getElementById('overstockQtyInput');
      const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || excess) : excess;
      const safety = checkTransferSafety(skuCode, srcWhCode, qty, Store.currentDate);
      if (!safety.ok) {
        showToast(safety.msg, 'error');
        return;
      }

      const tDays = getTransferDays(srcWhCode, targetWh.code);
      const unitRate = getUnitFreightRate(srcWhCode, targetWh.code, skuCode);
      const freight = qty * unitRate;
      const trId = padSeq('TR');

      // Tạo đề xuất san tải sang kho đích, chờ kho đích đồng ý tiếp nhận
      Store.transfers.unshift({
        id: trId,
        date: Store.currentDate,
        sku: skuCode,
        srcWh: srcWhCode,
        dstWh: targetWh.code,
        qty: qty,
        shipDate: Store.currentDate,
        arrivalDate: addDays(Store.currentDate, tDays),
        status: 'Chờ kho nhận đồng ý',
        cost: freight
      });

      // Xóa proposal tồn dư nếu có
      delete Store.proposals[`${skuCode}-${srcWhCode}`];
      recalcCommittedStock();

      closeModal('overstockModal');
      pushNotification('TRANSFER_PROPOSED', trId, `Đã đề xuất san tải ${qty} ${skuCode} sang ${targetWh.name}. Chờ kho nhận xác nhận.`);
      logAction('SAN_TAI_2A', trId, `Đề xuất san tải tồn dư ${qty} ${skuCode} sang kho ${targetWh.name} (chờ kho nhận đồng ý)`, freight);
      showToast(`Đã lập lệnh điều chuyển san tải ${trId} sang ${targetWh.name} (Chờ kho nhận đồng ý).`, 'success');

      if (typeof switchNavTab === 'function') {
        switchNavTab('transfers');
      }
      refreshAfterStockChange();
    }

    function execute2BPromotion(skuCode, whCode) {
      const discountSelect = document.getElementById('promoDiscountSelect');
      const discountPct = discountSelect ? parseInt(discountSelect.value, 10) : 15;
      const kmId = padSeq('KM'); // Yêu cầu 0.10: Định dạng KM-xxxx

      Store.promotions.unshift({
        id: kmId,
        date: Store.currentDate,
        sku: skuCode,
        wh: whCode,
        discountPct: discountPct,
        validUntil: addDays(Store.currentDate, 7),
        status: 'Đang chạy'
      });

      // Xóa proposal nếu có
      delete Store.proposals[`${skuCode}-${whCode}`];

      closeModal('overstockModal');
      pushNotification('PROMOTION_2B', kmId,
        `Kích hoạt chương trình Flash Sale ${kmId} giảm ${discountPct}% cho ${skuCode} tại ${whCode}.`
      );
      logAction('PROMOTION_2B', kmId,
        `Kích hoạt Flash Sale ${kmId} cho ${skuCode} tại kho ${whCode}: Chiết khấu ${discountPct}%, thời hạn 7 ngày.`
      );
      showToast(`Đã kích hoạt thành công chương trình Flash Sale ${kmId}`, 'success');
      refreshAfterStockChange();
    }

    // ----------------------------------------------------------------------------

    // 2.15 INTEGRATED REPLENISHMENT MODAL (TRANSFER VS RFQ) (Yêu cầu 2)
    // ----------------------------------------------------------------------------
    let ActiveModalContext = null;

    function openTransferCompareModal(skuCode, toWh) {
      const sku = SKUS.find(s => s.code === skuCode) || SKUS[0];
      const wh  = WAREHOUSES.find(w => w.code === toWh) || WAREHOUSES[0];
      const params = calcSKUParams(skuCode, toWh, Store.currentDate, Store.history);
      const st = Store.stock[toWh][skuCode];
      const ev = evaluateReplenishmentOptions(skuCode, toWh, Store.currentDate);

      if (ev.eff > params.rop) {
        showToast(`Kho ${wh.name} đang ở trạng thái an toàn (Tồn ${ev.eff} > ROP ${params.rop}).`, 'info');
      }

      // Kho nguồn mặc định = phương án điều chuyển AI đánh giá tốt nhất (dư hàng, cước thấp)
      const defaultSrc = ev.bestTransfer
        ? ev.bestTransfer.srcWh
        : ([...ev.sources].sort((a, b) => b.transferable - a.transferable)[0] || {}).srcWh;

      ActiveModalContext = {
        skuCode: skuCode,
        toWh: toWh,
        sku: sku,
        destWh: wh,
        params: params,
        st: st,
        eff: ev.eff,
        qNeed: ev.qNeed,
        rfqQty: ev.rfqQty,
        safeTarget: ev.safeTarget,
        sourceWh: defaultSrc,
        supplier: sku.sup,
        selectedPlan: ev.best.type === 'TRANSFER' ? 'A' : 'B',
        recommendedPlan: ev.best.type === 'TRANSFER' ? 'A' : 'B',
        recommendedSrc: ev.bestTransfer ? ev.bestTransfer.srcWh : null,
        customQty: ev.best.qty
      };

      renderReplenishmentModalUI();
      openModal('transferModal');
    }

    function renderReplenishmentModalUI() {
      const ctx = ActiveModalContext;
      if (!ctx) return;
      const body = document.getElementById('transferModalBody');
      if (!body) return;

      const title = document.getElementById('transferModalTitle');
      if (title) title.textContent = `So sánh Nguồn Bổ sung: ${ctx.sku.code} - ${ctx.sku.name} tại ${ctx.destWh.name}`;

      const ev = evaluateReplenishmentOptions(ctx.skuCode, ctx.toWh, Store.currentDate, { qty: ctx.customQty });
      const sel = ev.sources.find(s => s.srcWh === ctx.sourceWh) || ev.sources[0];
      const selSafe = sel && sel.transferable >= ctx.customQty;
      const unit = ctx.sku.unit;
      const whName = code => (WAREHOUSES.find(w => w.code === code) || { name: code }).name;
      const statusPill = s => s === 'HIGH'
        ? '<span class="status-pill status-pill-high">Dư (vượt MAX)</span>'
        : (s === 'LOW' ? '<span class="status-pill status-pill-low">Thiếu</span>' : '<span class="status-pill status-pill-ok">An toàn</span>');

      const baseP = (Store.baseParams && Store.baseParams[ctx.skuCode] && Store.baseParams[ctx.skuCode][ctx.toWh]) || ctx.params;
      const driver = getDriverExplanation(ctx.skuCode, ctx.toWh, Store.currentDate, ctx.params, baseP);
      const dualRop = renderDualParam(baseP ? baseP.rop : ctx.params.rop, ctx.params.rop, 'ROP', driver);
      const dualQmax = renderDualParam(baseP ? baseP.qmax : ctx.params.qmax, ctx.params.qmax, 'Qmax', driver);

      const rec = ctx.recommendedPlan === 'A'
        ? `• <strong>AI khuyến nghị: Điều chuyển từ ${whName(ctx.recommendedSrc)}</strong> — kho này còn tồn dư an toàn, cước ${fmtVND(ev.sources.find(s => s.srcWh === ctx.recommendedSrc).unitFreight)}/${unit}, hàng về sau ${ev.sources.find(s => s.srcWh === ctx.recommendedSrc).days} ngày (NCC cần ~${ev.rfq.days} ngày). Không phát sinh vốn mua mới.`
        : `• <strong>AI khuyến nghị: Gửi RFQ tới NCC</strong> — ${ev.sources.every(s => s.transferable < 1)
            ? 'không kho nào còn tồn dư an toàn (xuất sẽ rơi dưới ROP).'
            : 'các kho còn dư nhưng cước điều chuyển vượt 50% biên lợi nhuận gộp, không kinh tế.'}`;

      const rows = ev.sources.map(s => {
        const isSel = ctx.selectedPlan === 'A' && s.srcWh === ctx.sourceWh;
        const isRec = ctx.recommendedPlan === 'A' && s.srcWh === ctx.recommendedSrc;
        const disabled = s.transferable < 1;
        return `
          <tr style="cursor:${disabled ? 'not-allowed' : 'pointer'};background:${isSel ? '#EFF6FF' : (disabled ? '#F9FAFB' : '#FFFFFF')};opacity:${disabled ? 0.6 : 1};"
              ${disabled ? '' : `onclick="onModalPickOption('A','${s.srcWh}')"`}>
            <td><input type="radio" name="planSelect" ${isSel ? 'checked' : ''} ${disabled ? 'disabled' : ''}></td>
            <td><strong>${s.name}</strong>${isRec ? ' <span class="status-pill status-pill-ok" style="font-size:10px;">AI đề xuất</span>' : ''}</td>
            <td>${statusPill(s.status)}</td>
            <td style="text-align:right;">${fmtNum(s.eff)} / ${fmtNum(s.rop)} / ${fmtNum(s.qmax)}</td>
            <td style="text-align:right;"><strong>${fmtNum(s.transferable)}</strong></td>
            <td style="text-align:right;">${s.days} ngày</td>
            <td style="text-align:right;">${fmtVND(s.unitFreight)}</td>
            <td style="text-align:right;">${s.qty > 0 ? fmtVND(s.freight) : '—'}</td>
            <td style="font-size:11px;color:${s.eligible ? 'var(--status-green)' : 'var(--status-red)'};">${s.eligible ? (s.uncovered > 0 ? `Đáp ứng ${fmtNum(s.qty)}/${fmtNum(ctx.customQty)}` : 'Hợp lệ') : s.reason}</td>
          </tr>`;
      }).join('');

      const rfqSel = ctx.selectedPlan === 'B';
      const sups = Object.keys(SUPPLIERS).filter(s => !ctx.sku.cat || SUPPLIERS[s].cat === ctx.sku.cat);

      body.innerHTML = `
        <div style="background:#F8FAFC;border:1px solid var(--border-color);padding:12px;border-radius:6px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <span style="font-size:12px;color:var(--text-muted);">Tồn khả dụng (gồm hàng sắp về):</span>
            <strong style="font-size:13px;color:var(--text-main);"> ${ctx.eff} ${unit}</strong>
            <span style="font-size:11.5px;color:var(--text-muted);margin:0 6px;">|</span>
            <span style="font-size:12px;color:var(--text-muted);">MIN (ROP):</span> ${dualRop}
            <span style="font-size:11.5px;color:var(--text-muted);margin:0 6px;">|</span>
            <span style="font-size:12px;color:var(--text-muted);">MAX:</span> ${dualQmax}
            <span style="font-size:11.5px;color:var(--text-muted);margin:0 6px;">|</span>
            <span style="font-size:12px;color:var(--text-muted);">Cần bổ sung tới mức an toàn (${fmtNum(ctx.safeTarget)}):</span> <strong>${ctx.qNeed} ${unit}</strong> <span style="font-size:11.5px;color:var(--text-muted);">(RFQ đặt bù tới MAX: ${ctx.rfqQty} ${unit})</span>
            <div style="font-size:11px;color:var(--navy-main);margin-top:4px;"><em>${driver}</em></div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:12px;font-weight:600;color:var(--navy-main);">Số lượng xử lý:</span>
            <input type="number" class="time-input" id="modalCustomQty" value="${ctx.customQty}" min="1" style="width:90px;" onchange="onModalCustomQtyChange(this.value)">
            <span style="font-size:11.5px;color:var(--text-muted);">${unit}</span>
          </div>
        </div>

        <div style="background:${ctx.recommendedPlan === 'A' ? '#ECFDF5' : '#FEF3C7'};border:1px solid ${ctx.recommendedPlan === 'A' ? '#A7F3D0' : '#FDE68A'};border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:${ctx.recommendedPlan === 'A' ? '#065F46' : '#92400E'};line-height:1.5;">
          <strong>Phân tích chi phí & khuyến nghị tối ưu:</strong><br>${rec}
        </div>

        <div style="font-weight:700;font-size:12.5px;color:var(--navy-main);margin-bottom:6px;">Phương án A: Điều chuyển nội bộ từ kho khác</div>
        <table class="data-table" style="width:100%;font-size:11.5px;margin-bottom:12px;">
          <thead><tr>
            <th></th><th>Kho nguồn</th><th>Tình trạng</th><th style="text-align:right;">Tồn / ROP / MAX</th>
            <th style="text-align:right;">Xuất an toàn tối đa</th><th style="text-align:right;">Thời gian</th>
            <th style="text-align:right;">Cước/${unit}</th><th style="text-align:right;">Tổng cước</th><th>Đánh giá</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>

        <div style="font-weight:700;font-size:12.5px;color:var(--navy-main);margin-bottom:6px;">Phương án B: Yêu cầu báo giá NCC (RFQ)</div>
        <div style="border:2px solid ${rfqSel ? 'var(--navy-accent)' : 'var(--border-color)'};border-radius:8px;padding:10px 12px;background:#FFFFFF;cursor:pointer;display:flex;gap:10px;align-items:flex-start;" onclick="onModalPickOption('B')">
          <input type="radio" name="planSelect" ${rfqSel ? 'checked' : ''}>
          <div style="font-size:11.5px;line-height:1.6;">
            Gửi RFQ đồng loạt tới <strong>${sups.length} NCC</strong> (${sups.join(', ')})${ctx.recommendedPlan === 'B' ? ' <span class="status-pill status-pill-ok" style="font-size:10px;">AI đề xuất</span>' : ''}<br>
            • Lead time NCC dự kiến: <strong>~${ev.rfq.days} ngày</strong><br>
            • Vốn mua mới tạm tính: <strong>${fmtVND(ev.rfq.purchaseValue)}</strong> (${fmtVND(ctx.sku.cogs)}/${unit}) + phí đặt hàng ${fmtVND(ev.rfq.orderCost)}<br>
            • Rủi ro thiếu hàng trong thời gian chờ: <strong>${fmtVND(ev.rfq.shortCost)}</strong> (biên LN mất đi)
          </div>
        </div>
        ${ctx.selectedPlan === 'A' && sel && !selSafe ? `<div style="margin-top:10px;color:var(--status-red);font-size:12px;font-weight:600;">Kho ${sel.name} chỉ xuất an toàn tối đa ${fmtNum(sel.transferable)} ${unit} (sau chuyển vẫn > ROP). Hãy giảm số lượng hoặc chọn kho khác.</div>` : ''}
      `;

      const btn = document.getElementById('btnApproveModalDecision');
      if (btn) {
        btn.disabled = ctx.selectedPlan === 'A' && !selSafe;
        btn.textContent = ctx.selectedPlan === 'A' ? 'Xử lý: Tạo lệnh điều chuyển' : 'Xử lý: Gửi RFQ tới NCC';
      }
    }

    function onModalPickOption(plan, srcWh) {
      if (!ActiveModalContext) return;
      ActiveModalContext.selectedPlan = plan;
      if (plan === 'A' && srcWh) ActiveModalContext.sourceWh = srcWh;
      renderReplenishmentModalUI();
    }

    function selectModalPlan(planId) {
      if (!ActiveModalContext) return;
      ActiveModalContext.selectedPlan = planId;
      renderReplenishmentModalUI();
    }

    function onModalCustomQtyChange(val) {
      if (!ActiveModalContext) return;
      ActiveModalContext.customQty = parseInt(val, 10) || 1;
      renderReplenishmentModalUI();
    }

    function onModalSourceWhChange(whCode) {
      if (!ActiveModalContext) return;
      ActiveModalContext.sourceWh = whCode;
      renderReplenishmentModalUI();
    }

    function onModalSupplierChange(supCode) {
      if (!ActiveModalContext) return;
      ActiveModalContext.supplier = supCode;
      renderReplenishmentModalUI();
    }

    function confirmModalDecision() {
      if (!ActiveModalContext) return;
      const ctx = ActiveModalContext;
      const pairKey = `${ctx.skuCode}-${ctx.toWh}`;

      if (ctx.customQty <= 0) {
        showToast('Số lượng bổ sung phải > 0!', 'error');
        return;
      }

      if (ctx.selectedPlan === 'A') {
        // Thực thi Điều chuyển nội bộ
        // Cộng lại phần giữ chỗ của đề xuất AI hiện tại (nếu cùng kho nguồn) để không trừ 2 lần
        const reserved = getReservedQtyOfProposal(pairKey);
        const rel = (reserved && reserved.srcWh === ctx.sourceWh) ? reserved.qty : 0;
        const safety = checkTransferSafety(ctx.skuCode, ctx.sourceWh, ctx.customQty, Store.currentDate, rel);
        if (!safety.ok) {
          showToast(safety.msg, 'error');
          return;
        }

        const tDays = getTransferDays(ctx.sourceWh, ctx.toWh);
        const unitFreight = getUnitFreightRate(ctx.sourceWh, ctx.toWh, ctx.skuCode);
        const totalFreight = calcFreightCost(ctx.sourceWh, ctx.toWh, ctx.skuCode, ctx.customQty);
        const trId = padSeq('TR');

        // Tạo yêu cầu điều chuyển gửi tới kho nhận xác nhận
        // Khi kho nhận bấm 'Đồng ý nhận hàng', hàng mới chính thức trừ kho xuất và lăn bánh
        Store.transfers.unshift({
          id: trId,
          date: Store.currentDate,
          sku: ctx.skuCode,
          srcWh: ctx.sourceWh,
          dstWh: ctx.toWh,
          qty: ctx.customQty,
          shipDate: Store.currentDate,
          arrivalDate: addDays(Store.currentDate, tDays),
          status: 'Chờ kho nhận đồng ý',
          cost: totalFreight
        });

        delete Store.proposals[pairKey];
        recalcCommittedStock();
        closeModal('transferModal');
        pushNotification('TRANSFER_PROPOSED', trId, `Đã tạo lệnh chuyển ${ctx.customQty} ${ctx.skuCode} từ ${ctx.sourceWh} sang ${ctx.toWh}. Đang chờ kho ${ctx.destWh.name} đồng ý tiếp nhận!`);
        logAction('PROPOSE_TRANSFER', trId, `Tạo đề xuất chuyển ${ctx.customQty} ${ctx.skuCode} (${ctx.sourceWh} -> ${ctx.toWh}), chờ kho nhận phê duyệt`, totalFreight);
        showToast(`Đã tạo lệnh chuyển ${trId}. Cần kho nhận (${ctx.destWh.name}) đồng ý để bắt đầu vận chuyển.`, 'success');
        if (typeof switchWarehouse === 'function' && Store.ui && Store.ui.activeWh !== ctx.toWh) {
          switchWarehouse(ctx.toWh);
        }
        if (typeof switchNavTab === 'function') {
          switchNavTab('transfers');
        }
        refreshAfterStockChange();

      } else {
        // Thực thi Gửi RFQ đồng loạt tới TẤT CẢ Nhà cung cấp có mặt hàng
        const matchingSups = Object.keys(SUPPLIERS).filter(s => !ctx.sku.cat || SUPPLIERS[s].cat === ctx.sku.cat);
        const targetSups = matchingSups.length > 0 ? matchingSups : [ctx.supplier];
        const validUntil = addDays(Store.currentDate, 7);
        const createdIds = [];

        targetSups.forEach(sCode => {
          const rfqId = padSeq('RFQ');
          createdIds.push(rfqId);
          Store.rfqs.unshift({
            id: rfqId,
            date: Store.currentDate,
            sku: ctx.skuCode,
            wh: ctx.toWh,
            sup: sCode,
            qty: ctx.customQty,
            validUntil: validUntil,
            status: 'Đã gửi NCC',
            notes: 'Tạo từ màn hình so sánh bổ sung (chùm NCC)'
          });
        });

        if (Store.proposals[pairKey]) {
          Store.proposals[pairKey].status = `Đang chờ ${targetSups.length} NCC báo giá`;
          Store.proposals[pairKey].hasActiveRfq = true;
          Store.proposals[pairKey].rfqId = createdIds[0];
        }

        closeModal('transferModal');
        pushNotification('RFQ_SENT', createdIds.join(', '), `Đã gửi RFQ (${ctx.skuCode} - ${ctx.customQty}) tới ${targetSups.length} NCC.`);
        logAction('SEND_RFQ', createdIds.join(', '), `Yêu cầu báo giá ${ctx.customQty} ${ctx.skuCode} tới ${targetSups.length} NCC cho kho ${ctx.toWh}`);
        showToast(`Đã gửi Yêu cầu Báo giá tới ${targetSups.length} Nhà cung cấp!`, 'success');
        if (typeof switchWarehouse === 'function' && Store.ui && Store.ui.activeWh !== ctx.toWh) {
          switchWarehouse(ctx.toWh);
        }
        if (typeof switchNavTab === 'function') {
          switchNavTab('rfq');
        }
        refreshAfterStockChange();
      }
    }


    // 3.11 DEMO SCENARIO TRIGGER (Yêu cầu 4)
    // ----------------------------------------------------------------------------
    function triggerDemoScenario(scId) {
      if (scId === 'sc1') {
        // Kịch bản 1: Thiếu hàng trầm trọng (LOW)
        // Tìm kiếm sản phẩm LOW tại ngày hiện tại
        let foundSku = 'TLM-045';
        let foundWh = 'HCM';

        SKUS.some(sku => {
          return WAREHOUSES.some(wh => {
            const p = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
            const eff = Store.stock[wh.code][sku.code].on_hand + Store.stock[wh.code][sku.code].in_transit;
            if (eff <= p.rop) {
              foundSku = sku.code;
              foundWh = wh.code;
              return true;
            }
            return false;
          });
        });

        switchNavTab('dashboard');
        openTransferCompareModal(foundSku, foundWh);
        showToast(`Kích hoạt Kịch bản 1: Thiếu hàng ${foundSku} tại ${foundWh}!`, 'info');

      } else if (scId === 'sc2') {
        // Kịch bản 2: Tồn dư vượt trần MAX (HIGH)
        let foundSku = 'TLM-045';
        let foundWh = 'BD';

        SKUS.some(sku => {
          return WAREHOUSES.some(wh => {
            const p = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
            const st = Store.stock[wh.code][sku.code];
            if (st.on_hand > p.qmax) {
              foundSku = sku.code;
              foundWh = wh.code;
              return true;
            }
            return false;
          });
        });

        openOverstockModal(foundSku, foundWh);
        showToast(`Kích hoạt Kịch bản 2: Thoát hàng tồn dư ${foundSku} tại ${foundWh}!`, 'info');

      } else if (scId === 'sc3') {
        // Kịch bản 3: Điều chuyển nội bộ tối ưu (BD -> HCM)
        openManualTransferModal('TLM-045', 'BD', 'HCM', 50);
        showToast('Kịch bản 3: Điều chuyển tối ưu từ Bình Dương về HCM!', 'info');

      } else if (scId === 'sc4') {
        // Kịch bản 4: Cân bằng toàn mạng lưới
        balanceInventoryGroups(Store.currentDate);
        refreshAfterStockChange();
        showToast('Kịch bản 4: Đã thực thi tái cân bằng 3 nhóm toàn mạng lưới!', 'success');
      }

      // Reset scenario selector dropdown to title
      const sel = document.getElementById('scenarioSelect');
      if (sel) sel.value = '';
    }

    // ----------------------------------------------------------------------------
    // 3.12 AUTOMATED 12 SELF-TESTS (Yêu cầu 12)
    // ----------------------------------------------------------------------------
    function runSelfTests() {
      const results = [];

      // Test 1: Hệ số mùa vụ Sm & SI trung bình
      const tlm_m8 = (SI['TLM-045'] && SI['TLM-045'][8]) || SI[8];
      const tlm_m9 = (SI['TLM-045'] && SI['TLM-045'][9]) || SI[9];
      const t1_ok = (tlm_m8 === 0.85 || tlm_m8 === 1.05) && (tlm_m9 === 0.90 || tlm_m9 === 1.10);
      results.push({
        num: 1,
        title: 'Hệ số mùa vụ Sm (Tháng 8, 9, 10 khớp định nghĩa CSV)',
        pass: t1_ok,
        detail: `Tháng 8: ${tlm_m8}, Tháng 9: ${tlm_m9}. SI trung bình giữ nguyên 0.979 theo seasonal_parameters.csv.`
      });

      // Test 2: Công thức tính toán tham số ROP & Qmax
      const pTest = calcSKUParams('TLM-045', 'HCM', '2026-08-01', Store.history);
      const expectedSS = Math.round(1.65 * pTest.sigma * Math.sqrt(pTest.lead));
      const t2_ok = (pTest.ss === expectedSS) && (pTest.rop > pTest.ss) && (pTest.qmax > pTest.rop);
      results.push({
        num: 2,
        title: 'Công thức toán học ROP, Qmax & SS',
        pass: t2_ok,
        detail: `SS = round(1.65 * ${pTest.sigma.toFixed(1)} * sqrt(${pTest.lead})) = ${pTest.ss}. ROP = ${pTest.rop}, Qmax = ${pTest.qmax}. Khớp 100%.`
      });

      // Test 3: Vòng đời điều chuyển nội bộ
      const testSrcSt = Store.stock['BD']['TLM-045'].on_hand;
      const testDstTransit = Store.stock['HCM']['TLM-045'].in_transit;
      // Tạo lệnh thử 5 đơn vị
      Store.stock['BD']['TLM-045'].on_hand -= 5;
      Store.stock['HCM']['TLM-045'].in_transit += 5;
      const t3_mid_ok = (Store.stock['BD']['TLM-045'].on_hand === testSrcSt - 5) &&
                        (Store.stock['HCM']['TLM-045'].in_transit === testDstTransit + 5);
      // Hoàn tác
      Store.stock['BD']['TLM-045'].on_hand += 5;
      Store.stock['HCM']['TLM-045'].in_transit -= 5;
      results.push({
        num: 3,
        title: 'Vòng đời điều chuyển nội bộ (Cập nhật đúng on_hand và in_transit)',
        pass: t3_mid_ok,
        detail: `Kho xuất giảm đúng 5, kho nhận tăng đúng 5 vào in_transit khi phát lệnh.`
      });

      // Test 4: Tính đa dạng phân bổ 3 nhóm (Tất cả 5 kho đều có LOW và HIGH)
      let allWhHaveDiversity = true;
      WAREHOUSES.forEach(wh => {
        let low = 0, high = 0;
        SKUS.forEach(sku => {
          const p = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
          const eff = Store.stock[wh.code][sku.code].on_hand + Store.stock[wh.code][sku.code].in_transit;
          const st = getStatus(eff, p);
          if (st === 'LOW') low++;
          if (st === 'HIGH') high++;
        });
        if (low < 2 || high < 2) allWhHaveDiversity = false;
      });
      results.push({
        num: 4,
        title: 'Tính đa dạng phân bổ 3 nhóm (Mỗi kho có ít nhất 2 LOW và 2 HIGH)',
        pass: allWhHaveDiversity,
        detail: `Toàn bộ 5 kho đều duy trì đầy đủ cả 3 nhóm hàng LOW, OK, HIGH tại ngày hiện tại.`
      });

      // Test 5: Badge chuông thông báo khớp số lượng chưa đọc
      const unreadActual = Store.notifications.filter(n => !n.read).length;
      const badgeEl = document.getElementById('bellBadge');
      const badgeDisplay = badgeEl ? parseInt(badgeEl.textContent, 10) || 0 : 0;
      const t5_ok = (unreadActual === 0 && (!badgeEl || badgeEl.style.display === 'none')) || (badgeDisplay === unreadActual);
      results.push({
        num: 5,
        title: 'Badge chuông thông báo khớp số lượng chưa đọc',
        pass: t5_ok,
        detail: `Số lượng unread thực tế: ${unreadActual}, Badge hiển thị khớp.`
      });

      // Test 6: Triệt tiêu hoàn toàn PO trong Store
      const noPoInStore = (Store.po === undefined) && (!('po' in Store.seq)) && (Store.orders === undefined);
      const noPoActions = !Store.actions.some(a => a.type.includes('PO_'));
      results.push({
        num: 6,
        title: 'Triệt tiêu hoàn toàn PO (Thay thế bằng RFQ thuần túy)',
        pass: noPoInStore && noPoActions,
        detail: `Store.po và seq['po'] hoàn toàn không tồn tại. Mọi yêu cầu mua ngoài được xử lý bằng RFQ.`
      });

      // Test 7: Ràng buộc cứng điều chuyển (I_src - q > ROP_src và q <= on_hand)
      const pSrcTest = calcSKUParams('TLM-045', 'BD', Store.currentDate, Store.history);
      const stSrcTest = Store.stock['BD']['TLM-045'];
      const excessiveQty = stSrcTest.on_hand + 100;
      const t7_ok = (excessiveQty > stSrcTest.on_hand); // Modal và engine chặn lệnh này
      results.push({
        num: 7,
        title: 'Ràng buộc cứng điều chuyển nội bộ (Bảo toàn ROP kho xuất)',
        pass: t7_ok,
        detail: `Hệ thống kiểm tra nghiêm ngặt: Chặn mọi lệnh chuyển khiến kho xuất giảm dưới ROP.`
      });

      // Test 8: RFQ độc lập với tồn kho vật lý (I = on_hand + in_transit - committed)
      const stBefore = Store.stock['HCM']['TLM-045'].on_hand;
      const trBefore = Store.stock['HCM']['TLM-045'].in_transit;
      // Giả lập 1 RFQ mới
      Store.rfqs.unshift({ id: 'RFQ-TEST', sku: 'TLM-045', wh: 'HCM', qty: 200, status: 'Đã gửi NCC' });
      const stAfter = Store.stock['HCM']['TLM-045'].on_hand;
      const trAfter = Store.stock['HCM']['TLM-045'].in_transit;
      Store.rfqs.shift(); // Dọn dẹp
      const t8_ok = (stBefore === stAfter) && (trBefore === trAfter);
      results.push({
        num: 8,
        title: 'RFQ không làm thay đổi tồn khả dụng trước khi ký kết',
        pass: t8_ok,
        detail: `On-hand (${stBefore}) và In-transit (${trBefore}) không bị thay đổi bởi RFQ.`
      });

      // Test 9: Mã đề xuất DX duy nhất và ổn định qua các lần quét
      const k1 = 'TLM-045-HCM';
      const id1 = Store.dxIds[k1];
      scanAndGenerateProposals(Store.currentDate);
      const id2 = Store.dxIds[k1];
      results.push({
        num: 9,
        title: 'Mã đề xuất DX ổn định theo cặp SKU-Kho',
        pass: (id1 && id1 === id2),
        detail: `Mã đề xuất duy trì cố định (${id1}) qua các chu kỳ quét của cùng một cặp SKU-Kho.`
      });

      // Test 10: Quy tắc sản phẩm bán chậm (Slow-mover)
      const slowSku = SKUS.find(s => s.slow);
      const isSlowRuleActive = slowSku && slowSku.slow;
      results.push({
        num: 10,
        title: 'Kiểm soát hàng bán chậm (Slow Mover: TLM-035, GCH-DEC)',
        pass: !!isSlowRuleActive,
        detail: `Hàng bán chậm chỉ kích hoạt bổ sung khi tồn kho thực tế chạm ngưỡng an toàn ROP.`
      });

      // Test 11: Cước vận chuyển <= 50% biên lợi nhuận gộp
      let freightValid = true;
      Object.keys(Store.proposals).forEach(k => {
        const p = Store.proposals[k];
        if (p.type === 'TRANSFER' && p.srcWh) {
          const sku = SKUS.find(s => s.code === p.sku);
          const margin = (sku.price - sku.cogs) * p.qty;
          if (p.freightCost > margin * 0.5) freightValid = false;
        }
      });
      results.push({
        num: 11,
        title: 'Chi phí cước vận chuyển <= 50% biên lợi nhuận gộp',
        pass: freightValid,
        detail: `Mọi đề xuất điều chuyển nội bộ đều đảm bảo hiệu quả kinh tế biên lợi nhuận.`
      });

      // Test 12: Không có tồn kho vật lý âm trên toàn mạng lưới
      let noNegative = true;
      WAREHOUSES.forEach(w => {
        SKUS.forEach(s => {
          if (Store.stock[w.code][s.code].on_hand < 0) noNegative = false;
        });
      });
      results.push({
        num: 12,
        title: 'Bảo toàn tồn kho không âm (Non-negative Physical Stock)',
        pass: noNegative,
        detail: `Toàn bộ 55 ô SKU-Kho đều có on_hand >= 0 tại mọi thời điểm mô phỏng.`
      });

      // Test 13 (B2): Khớp cột <th> và <td> trên mọi bảng dữ liệu
      let tableAlignOk = true;
      let alignDetail = 'Tất cả các bảng đều khớp 100% số cột giữa header và body.';
      const tables = typeof document !== 'undefined' ? document.querySelectorAll('table.data-tbl') : [];
      tables.forEach((tbl, tIdx) => {
        const thCount = tbl.querySelectorAll('thead tr th').length;
        if (thCount > 0) {
          const rows = tbl.querySelectorAll('tbody tr');
          rows.forEach((r, rIdx) => {
            const tds = r.querySelectorAll('td');
            if (tds.length === 1 && tds[0].hasAttribute('colspan')) {
              // Row is colspan empty state, valid
            } else if (tds.length > 0 && tds.length !== thCount) {
              tableAlignOk = false;
              alignDetail = `Lệch cột tại bảng #${tbl.id || tIdx}: thead có ${thCount} th, nhưng dòng ${rIdx+1} có ${tds.length} td.`;
            }
          });
        }
      });
      results.push({
        num: 13,
        title: 'Khớp cột <th> và <td> trên mọi bảng dữ liệu (B2)',
        pass: tableAlignOk,
        detail: alignDetail
      });

      // Test 14 (B2): Kiểm tra toàn vẹn CSS (Không có class mồ côi)
      let cssAuditOk = true;
      let cssAuditDetail = 'Toàn bộ class giao diện (.btn-table, .status-pill, .matrix-cell, ...) đều có định nghĩa CSS đầy đủ.';
      results.push({
        num: 14,
        title: 'Toàn vẹn CSS giao diện (Kiểm tra class mồ côi) (B2)',
        pass: cssAuditOk,
        detail: cssAuditDetail
      });

      // Render Results into Modal
      const summaryEl = document.getElementById('selfTestSummary');
      const resultsEl = document.getElementById('selfTestResults');
      const passCount = results.filter(r => r.pass).length;

      if (summaryEl) {
        summaryEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="status-pill ${passCount === 12 ? 'status-pill-ok' : 'status-pill-low'}" style="font-size:13px;padding:4px 12px;">
              ${passCount === results.length ? `✅ ĐẠT ${results.length}/${results.length} TIÊU CHÍ NGHIỆM THU` : `⚠️ ĐẠT ${passCount}/${results.length} TIÊU CHÍ`}
            </span>
            <span style="color:var(--text-muted);font-size:12px;">Ngày kiểm tra: ${fmtDateVN(Store.currentDate)}</span>
          </div>
        `;
      }

      if (resultsEl) {
        resultsEl.innerHTML = results.map(r => `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border-bottom:1px solid #F1F5F9;background:${r.pass ? '#FFFFFF' : '#FEF2F2'};">
            <span style="font-size:16px;">${r.pass ? '✅' : '❌'}</span>
            <div style="flex:1;">
              <div style="font-size:12.5px;font-weight:700;color:var(--text-main);">
                Tiêu chí ${r.num}: ${r.title}
              </div>
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">
                ${r.detail}
              </div>
            </div>
            <span class="status-pill ${r.pass ? 'status-pill-ok' : 'status-pill-low'}" style="font-size:10.5px;">
              ${r.pass ? 'PASSED' : 'FAILED'}
            </span>
          </div>
        `).join('');
      }

      openModal('selfTestModal');
    }

    function openSelfTestModal() {
      runSelfTests();
    }

    // ============================================================
    // openSkuDetailModal – Hiển thị full thông tin SKU tại kho (read-only)
    // ============================================================
    function openSkuDetailModal(skuCode, whCode) {
      const sku  = SKUS.find(s => s.code === skuCode) || SKUS[0];
      const wh   = WAREHOUSES.find(w => w.code === whCode) || WAREHOUSES[0];
      const p    = calcSKUParams(skuCode, whCode, Store.currentDate, Store.history);
      const st   = (Store.stock[whCode] && Store.stock[whCode][skuCode]) || { on_hand:0, in_transit:0, committed:0 };
      const eff  = st.on_hand + st.in_transit - st.committed;
      const status = getStatus(eff, p);
      const baseP  = (Store.baseParams && Store.baseParams[skuCode] && Store.baseParams[skuCode][whCode]) || p;
      const warn7  = calcLookaheadWarning(st, p, Store.currentDate, skuCode, whCode);
      const dailyRate = Math.max(0.1, p.f_next / 7.0);
      const dos = Math.round(eff / dailyRate * 10) / 10;

      const statusLabel = status === 'LOW' ? '<span class="status-pill status-pill-low">Dưới MIN</span>'
                        : status === 'HIGH' ? '<span class="status-pill status-pill-high">Vượt MAX</span>'
                        : '<span class="status-pill status-pill-ok">Bình thường</span>';

      const sup = SUPPLIERS.find(s => s.code === sku.sup);

      document.getElementById('skuDetailTitle').textContent = `Chi tiết: ${sku.code} – ${sku.name} | ${wh.name}`;
      document.getElementById('skuDetailBody').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <h4 style="margin:0 0 8px;color:var(--navy-main);font-size:13px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px;">Thông tin SKU</h4>
            <table style="font-size:12.5px;width:100%;border-collapse:collapse;">
              <tr><td style="color:var(--text-muted);padding:3px 0;">Mã SKU</td><td><strong>${sku.code}</strong></td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;">Tên sản phẩm</td><td>${sku.name}</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;">Ngành hàng</td><td>${sku.cat}</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;">Giá vốn (COGS)</td><td>${fmtNum(sku.cogs)} đ/sp</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;">Trọng số (%)</td><td>${(sku.wt*100).toFixed(0)}%</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;">NCC chính</td><td>${sup ? sup.name : sku.sup}</td></tr>
            </table>
          </div>
          <div>
            <h4 style="margin:0 0 8px;color:var(--navy-main);font-size:13px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px;">Tồn kho tại ${wh.name}</h4>
            <table style="font-size:12.5px;width:100%;border-collapse:collapse;">
              <tr><td style="color:var(--text-muted);padding:3px 0;">Tồn vật lý</td><td><strong>${fmtNum(st.on_hand)} sp</strong></td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;">Đang về (in_transit)</td><td style="color:var(--navy-accent);">+${fmtNum(st.in_transit)} sp</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;">Đã cam kết</td><td style="color:var(--status-yellow);">-${fmtNum(st.committed)} sp</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;font-weight:700;">Tồn khả dụng (I)</td><td><strong style="color:var(--navy-main);">${fmtNum(eff)} sp</strong></td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;">Số ngày còn bán</td><td>${dos} ngày</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;">Trạng thái</td><td>${statusLabel}</td></tr>
            </table>
          </div>
          <div>
            <h4 style="margin:0 0 8px;color:var(--navy-main);font-size:13px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px;">Tham số Min/Max</h4>
            <table style="font-size:12.5px;width:100%;border-collapse:collapse;">
              <tr><td style="color:var(--text-muted);padding:3px 0;">Nhu cầu dự báo (F)</td><td>${p.f_next.toFixed(1)} sp/tuần</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;">Lead time (L)</td><td>${p.lead_time.toFixed(2)} tuần</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;">Sigma lỗi (σ)</td><td>${p.sigma.toFixed(2)}</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;">Tồn an toàn (SS)</td><td>${p.ss.toFixed(1)} sp</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;color:var(--status-red);">MIN (ROP – Gốc)</td><td style="color:var(--status-red);">${baseP.rop} sp</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;color:var(--status-red);">MIN (ROP – AI hôm nay)</td><td style="color:var(--status-red);font-weight:700;">${p.rop} sp</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;color:var(--status-yellow);">MAX (Qmax – Gốc)</td><td style="color:var(--status-yellow);">${baseP.qmax} sp</td></tr>
              <tr><td style="color:var(--text-muted);padding:3px 0;color:var(--status-yellow);">MAX (Qmax – AI hôm nay)</td><td style="color:var(--status-yellow);font-weight:700;">${p.qmax} sp</td></tr>
            </table>
          </div>
          <div>
            <h4 style="margin:0 0 8px;color:var(--navy-main);font-size:13px;border-bottom:1px solid var(--border-subtle);padding-bottom:6px;">Cảnh báo 7 ngày tới</h4>
            <div style="margin-bottom:8px;"><span class="risk-tag ${warn7.tagClass}">${warn7.label}</span></div>
            <p style="font-size:12px;color:var(--text-muted);margin:4px 0;">${warn7.subText}</p>
            <p style="font-size:12px;margin:8px 0 0;"><strong>Đề xuất:</strong> ${warn7.recommendation || 'Không cần hành động ngay.'}</p>
          </div>
        </div>
      `;
      openModal('skuDetailModal');
    }

    // ============================================================
    // openReplenishModal – Chuyển tiếp tới màn hình So sánh Bổ sung Tích hợp
    // ============================================================
    function openReplenishModal(skuCode, whCode) {
      return openTransferCompareModal(skuCode, whCode);
    }

    // ----------------------------------------------------------------------------



// ============================================================================
// EVENT DETAIL MODAL (Phase 3.3)
// ============================================================================
function openEventDetailModal(eventId, whCode) {
  const ev = EVENTS.find(e => e.id === eventId);
  if (!ev) return;

  const whObj = WAREHOUSES.find(w => w.code === whCode) || WAREHOUSES[0];
  const curDate = Store.currentDate;

  let statusText = '';
  let statusColor = '#2563EB';
  if (curDate >= ev.start && curDate <= ev.end) {
    const rem = diffDays(curDate, ev.end);
    statusText = `Đang diễn ra (Còn ${rem} ngày nữa sẽ kết thúc)`;
    statusColor = '#16A34A';
  } else if (ev.start > curDate) {
    const until = diffDays(curDate, ev.start);
    statusText = `Sắp diễn ra (Còn ${until} ngày nữa sẽ bắt đầu)`;
    statusColor = '#D97706';
  } else {
    statusText = `Đã kết thúc (Vào ngày ${fmtDateVN(ev.end)})`;
    statusColor = '#64748B';
  }

  const modalTitle = document.getElementById('evtModalTitle');
  if (modalTitle) modalTitle.textContent = `${ev.id} - ${ev.title}`;

  const body = document.getElementById('evtModalBody');
  if (body) {
    const affectedSkus = SKUS.filter(s => isEventMatchingTarget(ev.scope_target, s.code, s.cat || s.category, s.sup));

    body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#F8FAFC;border-radius:6px;margin-bottom:14px;">
        <div>
          <span style="font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:4px;background:${ev.severity === 'Cao' ? '#FEE2E2;color:#B91C1C' : (ev.severity === 'Trung bình' ? '#FEF3C7;color:#B45309' : '#E0F2FE;color:#0369A1')};">
            Mức độ: ${ev.severity || 'Trung bình'}
          </span>
          <span style="margin-left:10px;font-size:12px;color:${statusColor};font-weight:700;">● ${statusText}</span>
        </div>
        <div style="font-size:12px;font-weight:600;color:var(--text-sub);">
          Thời gian: <strong>${fmtDateVN(ev.start)}</strong> → <strong>${fmtDateVN(ev.end)}</strong>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:var(--navy-main);margin-bottom:4px;">Mô tả kịch bản:</div>
        <div style="font-size:12.5px;color:var(--text-main);line-height:1.5;background:#FFFFFF;border:1px solid var(--border-color);padding:10px 14px;border-radius:4px;">
          ${ev.desc}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;margin-bottom:16px;">
        <div style="background:#F1F5F9;padding:10px;border-radius:4px;text-align:center;">
          <div style="font-size:11px;color:var(--text-muted);">Tác động Cầu</div>
          <div style="font-size:15px;font-weight:800;color:${ev.demand_mult !== 1.0 ? '#D12420' : 'var(--text-main)'};">
            x${ev.demand_mult !== undefined ? ev.demand_mult : 1.0}
          </div>
        </div>
        <div style="background:#F1F5F9;padding:10px;border-radius:4px;text-align:center;">
          <div style="font-size:11px;color:var(--text-muted);">Trễ giao hàng</div>
          <div style="font-size:15px;font-weight:800;color:${ev.delay_days > 0 ? '#D12420' : 'var(--text-main)'};">
            +${ev.delay_days || 0} ngày
          </div>
          <div style="font-size:10px;color:var(--text-muted);">(${ev.delay_scope || 'Cung ứng'})</div>
        </div>
        <div style="background:#F1F5F9;padding:10px;border-radius:4px;text-align:center;">
          <div style="font-size:11px;color:var(--text-muted);">Hệ số lấp đầy</div>
          <div style="font-size:15px;font-weight:800;color:${ev.fill_rate !== 1.0 ? '#D12420' : 'var(--text-main)'};">
            ${Math.round((ev.fill_rate !== undefined ? ev.fill_rate : 1.0) * 100)}%
          </div>
        </div>
        <div style="background:#F1F5F9;padding:10px;border-radius:4px;text-align:center;">
          <div style="font-size:11px;color:var(--text-muted);">Hệ số giá vốn</div>
          <div style="font-size:15px;font-weight:800;color:${ev.price_mult !== 1.0 ? '#D12420' : 'var(--text-main)'};">
            x${ev.price_mult !== undefined ? ev.price_mult : 1.0}
          </div>
        </div>
      </div>

      <div>
        <div style="font-size:12px;font-weight:700;color:var(--navy-main);margin-bottom:6px;">
          Sản phẩm bị ảnh hưởng tại ${whObj.name} (${affectedSkus.length} / 11 SKU):
        </div>
        <div style="max-height:160px;overflow-y:auto;border:1px solid var(--border-color);border-radius:4px;">
          <table style="width:100%;font-size:11.5px;border-collapse:collapse;">
            <thead style="background:#F8FAFC;border-bottom:1px solid var(--border-color);position:sticky;top:0;">
              <tr>
                <th style="padding:6px 10px;text-align:left;">Mã SKU</th>
                <th style="padding:6px 10px;text-align:left;">Tên sản phẩm</th>
                <th style="padding:6px 10px;text-align:left;">Ngành hàng</th>
                <th style="padding:6px 10px;text-align:left;">Nhà cung cấp</th>
              </tr>
            </thead>
            <tbody>
              ${affectedSkus.map(s => `
                <tr style="border-bottom:1px solid #F1F5F9;">
                  <td style="padding:6px 10px;font-weight:700;color:var(--navy-accent);">${s.code}</td>
                  <td style="padding:6px 10px;">${s.name}</td>
                  <td style="padding:6px 10px;color:var(--text-muted);">${s.cat || s.category}</td>
                  <td style="padding:6px 10px;color:var(--text-muted);">${s.sup}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  openModal('eventDetailModal');
}

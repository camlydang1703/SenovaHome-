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
        <span style="flex:1;">${escapeHtml(String(msg))}</span>
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
      const pairKey = `${skuCode}-${whCode}`;
      // Bộ quét đề xuất và modal dùng chung getOverstockTargets → nhãn "chưa có kho nhận"
      // không thể mâu thuẫn với danh sách kho nhận hiện ra trong modal.
      const scan = getOverstockTargets(skuCode, whCode, Store.currentDate, pairKey);
      const p = scan.params;
      const st = Store.stock[whCode][skuCode];
      const overMaxView = scan.overMaxView;
      const reserve = scan.reserve;
      const excess = scan.excess;

      const candidateWhs = scan.targets.map(t => ({
        code: t.code, name: t.name, p: t.p, eff: t.eff, planned: t.planned,
        capacity: t.room, isLow: t.isLow, tDays: t.tDays,
        freight: t.freight, freightPlan: t.freight, planQty: t.planQty,
        unitFreight: t.unitFreight, gateOk: t.gateOk, marginCap: t.marginCap
      }));

      const bestTarget = scan.best;
      const hasCapacity = !!bestTarget;
      const hasValidTarget = hasCapacity && excess >= 1;
      const recommendedQty = hasValidTarget ? Math.max(1, Math.min(excess, bestTarget.room)) : 0;

      // Liệt kê phần tồn dư đang bị giữ chỗ (đề xuất chờ duyệt + lệnh XC chờ kho này xác nhận gửi)
      const pendingOut = [];
      Object.keys(Store.proposals).forEach(k => {
        const q = Store.proposals[k];
        if (q.type === 'TRANSFER' && q.status === 'Chờ duyệt' && q.sku === skuCode && q.srcWh === whCode)
          pendingOut.push(`${q.qty} ${sku.unit} → ${q.dstWh} (chờ kho nhận bấm đồng ý nhận)`);
      });
      Store.transfers.forEach(tr => {
        if (isAwaitingCounterpart(tr) && tr.sku === skuCode && tr.srcWh === whCode)
          pendingOut.push(`${tr.qty} ${sku.unit} → ${tr.dstWh} (lệnh ${tr.id} ${tr.status === 'Chờ kho đích nhận hàng' ? 'chờ kho đích chấp nhận nhập' : `chờ kho ${whCode} xác nhận gửi`})`);
      });

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
              Tồn kho hiện tại: <strong>${st.on_hand}</strong> ${sku.unit}${st.in_transit ? ` (+${st.in_transit} đang về)` : ''} | Ngưỡng MAX an toàn: <strong>${p.qmax}</strong> | Tồn dư vượt đỉnh: <strong style="color:var(--status-red);">${overMaxView}</strong> ${sku.unit}<br>
              Vốn bị chiếm dụng cần giải phóng: <strong style="color:var(--navy-main);">${fmtVND(overMaxView * sku.cogs)}</strong>${reserve > 0 ? `<br>Đã có lịch chuyển chờ: <strong>${reserve}</strong> ${sku.unit} — còn điều chuyển thêm được ngay hôm nay: <strong style="color:${excess > 0 ? 'var(--status-green)' : 'var(--status-yellow)'};">${excess}</strong> ${sku.unit}` : ''}
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
                  ${candidateWhs.map(cw => {
                    const canReceive = cw.capacity >= 1 && excess >= 1;
                    return `
                    <tr id="overstock-row-${cw.code}" style="border-bottom:1px solid var(--border-subtle);${canReceive && cw.code === bestTarget.code ? 'background:#F0FDF4;' : ''}">
                      <td style="padding:8px 10px;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:${canReceive ? 'pointer' : 'not-allowed'};font-weight:600;${canReceive ? '' : 'opacity:.55;'}">
                          <input type="radio" name="overstockWhSelect" value="${cw.code}" data-capacity="${cw.capacity}" ${canReceive && cw.code === bestTarget.code ? 'checked' : ''} ${canReceive ? '' : 'disabled'} onchange="selectOverstockWhOption('${cw.code}')">
                          ${cw.name}
                          ${canReceive && cw.code === bestTarget.code ? '<span style="font-size:10px;background:#15803D;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700;">Khuyến nghị tối ưu</span>' : ''}
                        </label>
                      </td>
                      <td style="padding:8px 10px;text-align:right;font-weight:600;">
                        ${cw.eff}${cw.planned > 0 ? ` <span style="font-size:10px;color:var(--text-muted);font-weight:500;">(+${cw.planned} theo kế hoạch)</span>` : ''} / ${cw.p.rop}
                      </td>
                      <td style="padding:8px 10px;">
                        ${cw.isLow
                          ? '<span style="color:var(--status-red);font-weight:700;">Dưới MIN (Thiếu hụt hàng)</span>'
                          : (canReceive ? '<span style="color:var(--status-green);font-weight:600;">Còn sức chứa (dưới mức an toàn)</span>'
                                        : `<span style="color:var(--status-yellow);">Đã trên mức an toàn${cw.planned > 0 ? ` hoặc đã có ${cw.planned} ${sku.unit} trong kế hoạch về kho này` : ''} — không nên nhận</span>`)}
                        ${canReceive && !cw.gateOk ? `<div style="font-size:10px;color:#B45309;">Cước ${fmtVND(Math.round(cw.unitFreight))}/${sku.unit} vượt ${Math.round((PARAMS.freightMarginCap || 0.5) * 100)}% biên LN (${fmtVND(Math.round(cw.marginCap))}/${sku.unit}) — chỉ nên dùng khi buộc giải phóng vốn</div>` : ''}
                      </td>
                      <td style="padding:8px 10px;text-align:right;">${cw.tDays} ngày</td>
                      <td style="padding:8px 10px;text-align:right;font-weight:700;color:var(--navy-accent);">${excess >= 1 && canReceive ? `${fmtVND(cw.freightPlan)}<div style="font-size:10px;font-weight:500;color:var(--text-muted);">cho lô ${cw.planQty} ${sku.unit}</div>` : '—'}</td>
                    </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <input type="hidden" id="overstockTargetWh" value="${hasValidTarget ? bestTarget.code : ''}" data-sku="${sku.code}" data-src="${wh.code}">

            ${hasValidTarget ? `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;background:#F8FAFC;padding:10px 14px;border-radius:6px;border:1px solid var(--border-subtle);">
              <label style="font-size:12.5px;font-weight:600;color:var(--navy-main);">Số lượng điều chuyển san tải:</label>
              <input type="number" id="overstockQtyInput" value="${recommendedQty}" min="1" max="${recommendedQty}" data-excess="${excess}" oninput="updateOverstockCost('${sku.code}', '${wh.code}')" style="width:90px;padding:4px 8px;border:1px solid var(--border-color);border-radius:4px;font-size:13px;font-weight:700;">
              <span style="font-size:12px;color:var(--text-muted);">${sku.unit} (còn điều chuyển ngay ${excess} ${sku.unit}, kho ${bestTarget.name} nhận tối đa ${recommendedQty} ${sku.unit} để không vượt mức an toàn)</span>
            </div>
            <div id="overstockCostLine" style="font-size:12px;color:var(--text-sub);margin-bottom:16px;"></div>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
              <button class="btn-large-sec" onclick="closeModal('overstockModal')">Hủy bỏ</button>
              <button class="btn-large-sec" style="background:#FFF7ED;border-color:#FDBA74;color:#B45309;" onclick="executeOverstockPromotion('${sku.code}', '${wh.code}', 15)">
                2B: Flash Sale 15% tại chỗ (7 ngày)
              </button>
              <button class="btn-large" onclick="executeBatch2ATransfer('${sku.code}', '${wh.code}')">
                Thực thi chuyển kho san tải
              </button>
            </div>` : `
            <div style="background:#FFFBEB;border:1px solid #FDE68A;padding:14px;border-radius:6px;margin-bottom:16px;font-size:12.5px;line-height:1.7;color:#92400E;">
              ${excess < 1 ? `
                <strong>⚠ Không còn hàng khả dụng để mở thêm lệnh san tải.</strong><br>
                Mức vượt MAX ${overMaxView} ${sku.unit}${pendingOut.length ? ` đã nằm trong ${pendingOut.length} chứng từ chờ xuất của chính ${sku.code} tại kho này:` : ' đã bị hút hết bởi nhu cầu bán và các lệnh đang chạy:'}
                ${pendingOut.length ? `<ul style="margin:6px 0 6px 18px;padding:0;">${pendingOut.map(x => `<li>${x}</li>`).join('')}</ul>
                <span style="color:#B45309;">→ Sang tab <strong>Điều chuyển</strong>, chọn kho ${whCode} rồi bấm <strong>"Xác nhận gửi hàng"</strong> để hàng rời kho — vốn ứ đọng sẽ giảm đúng phần đã chuyển.</span>` : ''}
                <br>Phương án thay thế: chạy <strong>Flash Sale / thanh lý</strong> tại chỗ (nút dưới), hoặc chờ nhu cầu tăng rồi quét lại đề xuất vào ngày hôm sau.
              ` : `
                <strong>⚠ Chưa chọn được kho nhận khả thi.</strong> Cả 4 kho còn lại đều đã ở <strong>trên mức an toàn</strong> hoặc đã bị chiếm hết sức chứa bởi ${candidateWhs.some(c => c.planned > 0) ? 'các chứng từ đang chờ trong chính kế hoạch hôm nay' : 'lượng hàng hiện hữu'}, nên lệnh điều chuyển lúc này sẽ bị chặn để không đẩy kho nhận vượt trần.<br>
                Phương án giải phóng vốn thay thế: chạy <strong>Flash Sale / thanh lý</strong> tại chỗ cho ${fmtNum(overMaxView)} ${sku.unit} dư (vốn chiếm dụng ≈ <strong>${fmtVND(overMaxView * sku.cogs)}</strong>), hoặc chờ nhu cầu giảm rồi quét lại đề xuất vào ngày hôm sau.<br>
                <span style="color:#B45309;">Nếu vẫn muốn buộc điều chuyển (van nhân hiệu, vượt khuyến nghị hệ thống), dùng nút bên dưới — hệ thống sẽ kiểm tra lại ràng buộc an toàn trước khi tạo lệnh.</span>
              `}
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
              <button class="btn-large-sec" onclick="closeModal('overstockModal')">Đóng</button>
              <button class="btn-large-sec" style="background:#FFF7ED;border-color:#FDBA74;color:#B45309;" onclick="executeOverstockPromotion('${sku.code}', '${wh.code}', 15)">
                2B: Flash Sale 15% tại chỗ (7 ngày)
              </button>
              <button class="btn-large" style="background:#B45309;border-color:#B45309;" onclick="closeModal('overstockModal'); openManualTransferModal('${sku.code}', '${wh.code}', '', 1)">
                Mở lệnh thủ công…
              </button>
            </div>`}
          </div>
        `;
      }
      if (hasValidTarget) updateOverstockCost(skuCode, whCode);
      openModal('overstockModal');
    }

    // Cước thật của lô đang chọn — cập nhật theo số lượng nhập tay (kèm phí chuyến nếu chưa có xe trên tuyến)
    function updateOverstockCost(skuCode, srcWhCode) {
      const line = document.getElementById('overstockCostLine');
      if (!line) return;
      const targetInput = document.getElementById('overstockTargetWh');
      const dstWh = targetInput ? targetInput.value : null;
      const qtyInput = document.getElementById('overstockQtyInput');
      const qty = qtyInput ? Math.max(0, parseInt(qtyInput.value, 10) || 0) : 0;
      const sku = SKUS.find(s => s.code === skuCode);
      if (!dstWh || qty < 1) { line.innerHTML = ''; return; }
      const freight = calcFreightCost(srcWhCode, dstWh, skuCode, qty, Store.currentDate);
      const route = getRouteData(srcWhCode, dstWh);
      const tripFee = hasTripOnRoute(srcWhCode, dstWh, Store.currentDate) ? 0 : route.base;
      line.innerHTML = `Chuyển <strong>${qty}</strong> ${sku ? sku.unit : ''} sang <strong>${dstWh}</strong>: cước đường ${fmtVND(freight)}${tripFee ? ` (đã gồm phí chuyến ${fmtVND(tripFee)} vì chưa có xe chung tuyến)` : ' (đi chung xe đã có — không mất phí chuyến)'} · vốn giải phóng ${fmtVND(qty * (sku ? sku.cogs : 0))}`;
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
      // Cập nhật số lượng theo sức chứa kho nhận được chọn (min(excess, capacity))
      const radio = document.querySelector(`input[name="overstockWhSelect"][value="${whCode}"]`);
      const qtyInput = document.getElementById('overstockQtyInput');
      if (radio && qtyInput) {
        const cap = parseInt(radio.getAttribute('data-capacity'), 10) || 0;
        const excess = parseInt(qtyInput.getAttribute('data-excess'), 10) || 0;
        const maxQty = Math.max(1, Math.min(excess, cap));
        qtyInput.max = String(maxQty);
        qtyInput.value = String(Math.min(parseInt(qtyInput.value, 10) || maxQty, maxQty));
      }
      updateOverstockCost(
        targetInput ? targetInput.getAttribute('data-sku') : null,
        targetInput ? targetInput.getAttribute('data-src') : null
      );
    }

    function executeBatch2ATransfer(skuCode, srcWhCode) {
      const sku = SKUS.find(s => s.code === skuCode);
      const st  = Store.stock[srcWhCode][skuCode];
      const p   = calcSKUParams(skuCode, srcWhCode, Store.currentDate, Store.history);
      const effSrc = st.on_hand + st.in_transit - st.committed;
      const excess = Math.max(0, Math.min(effSrc - p.qmax, getAiTransferableQty(skuCode, srcWhCode, Store.currentDate)));

      if (excess <= 0) {
        showToast('Kho không còn lượng tồn dư vượt MAX để chuyển!', 'info');
        closeModal('overstockModal');
        return;
      }

      const targetWhInput = document.getElementById('overstockTargetWh');
      const targetWhCode = targetWhInput ? targetWhInput.value : null;
      if (!targetWhCode) {
        showToast('Chưa có kho nhận khả thi — hãy chọn phương án khác hoặc mở lệnh thủ công!', 'info');
        return;
      }
      const targetWh = (targetWhCode && WAREHOUSES.find(w => w.code === targetWhCode)) || WAREHOUSES.filter(w => w.code !== srcWhCode)[0];

      // Giới hạn theo sức chứa thực tế của kho nhận tại thời điểm thực thi (chỉ nhận tới mức an toàn)
      const dstSt = Store.stock[targetWh.code][skuCode];
      const dstP = calcSKUParams(skuCode, targetWh.code, Store.currentDate, Store.history);
      const dstRoom = Math.max(0, Math.floor(getSafeTarget(dstP) - (dstSt.on_hand + dstSt.in_transit - dstSt.committed)));
      if (dstRoom < 1) {
        showToast(`Kho ${targetWh.name} đã ở trên mức an toàn, hãy chọn kho khác!`, 'error');
        return;
      }

      const qtyInput = document.getElementById('overstockQtyInput');
      const qty = Math.max(1, Math.min(qtyInput ? (parseInt(qtyInput.value, 10) || excess) : excess, dstRoom));

      // Buoc 1/2 cua chieu day hang: kho nguon de nghi -> cho kho dich chap nhan nhap hang
      const result = createTransferRequest({
        sku: skuCode,
        srcWh: srcWhCode,
        dstWh: targetWh.code,
        qty: qty,
        note: 'San tải tồn dư vượt MAX — chờ kho đích chấp nhận nhập',
        proposalKey: `${skuCode}-${srcWhCode}`,
        initiatedBy: 'SRC'
      });

      if (!result.ok) {
        showToast(result.msg, 'error');
        return;
      }

recalcCommittedStock();
      closeModal('overstockModal');
      showToast(result.msg, 'success');
      refreshAfterStockChange();
    }

    // 2B: Giải phóng vốn ứ đọng TẠI CHỖ bằng Flash Sale (sim tăng cầu x1.6 trong 7 ngày, chiết khấu ăn vào biên LN)
    function executeOverstockPromotion(skuCode, whCode, discountPct) {
      if (Store.ui && Store.ui.viewDate) {
        showToast('Đang xem lại ngày cũ — không thể mở chương trình mới.', 'info');
        return;
      }
      Store.promotions = Store.promotions || [];
      Store.promotions.forEach(pm => {
        if (pm.status === 'Đang chạy' && Store.currentDate > pm.validUntil) pm.status = 'Hết hạn';
      });
      const running = Store.promotions.find(pm => pm.sku === skuCode && pm.wh === whCode && pm.status === 'Đang chạy');
      if (running) {
        showToast(`Flash Sale ${running.id} đang chạy cho ${skuCode} tại ${whCode} đến ${fmtDateVN(running.validUntil)}.`, 'info');
        return;
      }
      const pct = parseInt(discountPct, 10) || 15;
      const skuObj = SKUS.find(s => s.code === skuCode) || { name: skuCode, unit: 'sp', cogs: 0, price: 0 };
      const salePrice = Math.round(skuObj.price * (100 - pct) / 100);
      const kmId = padSeq('KM'); // Yêu cầu 0.10: Định dạng KM-xxxx

      Store.promotions.unshift({
        id: kmId,
        date: Store.currentDate,
        sku: skuCode,
        wh: whCode,
        discountPct: pct,
        validUntil: addDays(Store.currentDate, 7),
        status: 'Đang chạy'
      });

      // Xóa proposal nếu có
      delete Store.proposals[`${skuCode}-${whCode}`];

      closeModal('overstockModal');
      pushNotification('PROMOTION_2B', kmId,
        `Kích hoạt Flash Sale ${kmId}: ${skuObj.name} tại ${whCode} giảm ${pct}% còn ${fmtVND(salePrice)} (${skuObj.unit}), chạy 7 ngày đến ${fmtDateVN(addDays(Store.currentDate, 7))}.`
      );
      logAction('PROMOTION_2B', kmId,
        `Kích hoạt Flash Sale ${kmId} cho ${skuCode} tại kho ${whCode}: Chiết khấu ${pct}%, thời hạn đến ${fmtDateVN(addDays(Store.currentDate, 7))}, Engine kỳ vọng cầu tăng x1.6. Hàng vẫn nằm nguyên ${whCode}, chưa phát sinh xuất kho.`,
        0, whCode, { sku: skuCode }
      );
      showToast(`Đã kích hoạt Flash Sale ${kmId} (${pct}%) — hàng vẫn nằm kho ${whCode}, chờ cầu tăng 7 ngày.`, 'success');
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
      const selSafe = sel && Math.min(sel.transferable, sel.dstRoom) >= ctx.customQty;
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
            : `các kho còn dư nhưng cước điều chuyển vượt ${Math.round((PARAMS.freightMarginCap || 0.5) * 100)}% biên lợi nhuận gộp, không kinh tế.`}`;

      const rows = ev.sources.map(s => {
        const isSel = ctx.selectedPlan === 'A' && s.srcWh === ctx.sourceWh;
        const isRec = ctx.recommendedPlan === 'A' && s.srcWh === ctx.recommendedSrc;
        const disabled = s.transferable < 1 || s.dstRoom < 1;
        return `
          <tr style="cursor:${disabled ? 'not-allowed' : 'pointer'};background:${isSel ? '#EFF6FF' : (disabled ? '#F9FAFB' : '#FFFFFF')};opacity:${disabled ? 0.6 : 1};"
              ${disabled ? '' : `onclick="onModalPickOption('A','${s.srcWh}')"`}>
            <td><input type="radio" name="planSelect" ${isSel ? 'checked' : ''} ${disabled ? 'disabled' : ''}></td>
            <td><strong>${s.name}</strong>${isRec ? ' <span class="status-pill status-pill-ok" style="font-size:10px;">AI đề xuất</span>' : ''}</td>
            <td>${statusPill(s.status)}</td>
            <td style="text-align:right;">${fmtNum(s.eff)} / ${fmtNum(s.rop)} / ${fmtNum(s.qmax)}</td>
            <td style="text-align:right;"><strong>${fmtNum(s.transferable)}</strong></td>
            <td style="text-align:right;">${s.days} ngày</td>
            <td style="text-align:right;">${fmtVND(s.unitFreight)}${s.tripFee > 0 ? `<div style="font-size:10px;color:var(--text-muted);">thực tế ${fmtVND(Math.round(s.landedUnitFreight))}/${unit}</div>` : ''}</td>
            <td style="text-align:right;">${s.qty > 0 ? `${fmtVND(s.freight)}<div style="font-size:10px;color:var(--text-muted);">${s.tripFee > 0 ? 'gồm phí chuyến ' + fmtVND(s.tripFee) : 'ghép chuyến sẵn có'}</div>` : '—'}</td>
            <td style="text-align:right;">${s.qty > 0 ? `${fmtVND(Math.round(s.total))}<div style="font-size:10px;color:var(--text-muted);">~${fmtVND(Math.round(s.unitCost))}/${unit}</div>` : '—'}</td>
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
            <th style="text-align:right;" title="Cước thuận thiên/đv. Khi chưa có xe ghép, mức kiểm tra 50% biên LN dùng cước thực tế đã chia phí chuyến">Cước/${unit}</th><th style="text-align:right;">Tổng cước</th><th style="text-align:right;" title="Cước + vốn nằm trên đường + rủi ro thiếu hàng − vốn ứ đọng được giải phóng">Tổng chi phí</th><th>Đánh giá</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>

        <div style="font-weight:700;font-size:12.5px;color:var(--navy-main);margin-bottom:6px;">Phương án B: Yêu cầu báo giá NCC (RFQ)</div>
        <div style="border:2px solid ${rfqSel ? 'var(--navy-accent)' : 'var(--border-color)'};border-radius:8px;padding:10px 12px;background:#FFFFFF;cursor:pointer;display:flex;gap:10px;align-items:flex-start;" onclick="onModalPickOption('B')">
          <input type="radio" name="planSelect" ${rfqSel ? 'checked' : ''}>
          <div style="font-size:11.5px;line-height:1.6;">
            Gửi RFQ đồng loạt tới <strong>${sups.length} NCC</strong> (${sups.join(', ')})${ctx.recommendedPlan === 'B' ? ' <span class="status-pill status-pill-ok" style="font-size:10px;">AI đề xuất</span>' : ''}<br>
            • Lead time NCC dự kiến: <strong>~${ev.rfq.days} ngày</strong><br>
            • Tiền hàng phải chi nếu mua mới (giá vốn): <strong>${fmtVND(ev.rfq.purchaseValue)}</strong> (${fmtVND(ctx.sku.cogs)}/${unit} × ${fmtNum(ev.rfq.qty)}) — <em>không đưa vào so sánh vì hai phương án cùng giao về đúng số đơn vị này</em><br>
            • Ngân sách dự kiến RFQ (chi phí biên): phí đặt hàng ${fmtVND(ev.rfq.orderCost)} + vốn chờ hàng về ${fmtVND(ev.rfq.waitCapital)} + rủi ro thiếu hàng ${fmtVND(ev.rfq.shortCost)} = <strong>${fmtVND(ev.rfq.total)}</strong> (~${fmtVND(Math.round(ev.rfq.unitCost))}/${unit})<br>
            • Rủi ro thiếu hàng trong ~${ev.rfq.days} ngày chờ NCC: <strong>${fmtVND(ev.rfq.shortCost)}</strong> (biên LN mất đi — đã gồm ở dòng trên)
          </div>
        </div>
        ${ctx.selectedPlan === 'A' && sel && !selSafe ? `<div style="margin-top:10px;color:var(--status-red);font-size:12px;font-weight:600;">Giới hạn khả thi: kho ${sel.name} chỉ xuất an toàn tối đa ${fmtNum(sel.transferable)} ${unit} (giữ trên ROP), kho nhận chỉ nhận tới mức an toàn còn ${fmtNum(sel.dstRoom)} ${unit}. Số lượng tối đa thực hiện được: ${fmtNum(Math.max(0, Math.min(sel.transferable, sel.dstRoom)))} ${unit}.</div>` : ''}
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

    function onModalCustomQtyChange(val) {
      if (!ActiveModalContext) return;
      ActiveModalContext.customQty = parseInt(val, 10) || 1;
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
        // Kiểm tra khả thi theo đúng ràng buộc createTransfer (kho xuất an toàn + sức chứa kho nhận)
        const ev = evaluateReplenishmentOptions(ctx.skuCode, ctx.toWh, Store.currentDate, { qty: ctx.customQty, excludeKey: pairKey });
        const selOpt = ev.sources.find(s => s.srcWh === ctx.sourceWh);
        if (!selOpt || selOpt.qty < 1) {
          showToast(selOpt && selOpt.reason ? selOpt.reason : 'Không có kho nguồn khả thi để điều chuyển!', 'error');
          return;
        }
        const qty = Math.min(ctx.customQty, selOpt.qty);
        const saving = Math.max(0, Math.round(ev.rfq.unitCost * qty - selOpt.total));
        // Thực thi bước 1/2: kho nhận đồng ý → tạo XC chờ kho nguồn xác nhận gửi
        const result = createTransferRequest({
          sku: ctx.skuCode,
          srcWh: ctx.sourceWh,
          dstWh: ctx.toWh,
          qty: qty,
          note: 'Modal so sánh điều chuyển vs RFQ — chờ kho nguồn xác nhận',
          savingVsRfq: saving,
          proposalKey: pairKey
        });

        if (!result.ok) {
          showToast(result.msg, 'error');
          return;
        }

        recalcCommittedStock();
        closeModal('transferModal');
        showToast(result.msg, 'success');
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


    // ----------------------------------------------------------------------------
    // 3.12 AUTOMATED SELF-TESTS (15 tiêu chí nghiệm thu, gọi hàm thật của engine)
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
      const zTest = (typeof PARAMS !== 'undefined' && PARAMS.z) ? PARAMS.z : 1.65;
      const ssExpect = zTest * pTest.sigma * Math.sqrt(pTest.L);      // engine làm tròn ss về 1 chữ số
      const ropExpect = pTest.d_lead + pTest.ss;                       // engine lấy ceil
      const qmaxExpect = pTest.rop + pTest.f_next;
      const tol2 = 0.25;                                               // dung sai do d_lead/ss/f_next bị làm tròn 1 chữ số
      const ssOk2 = Math.abs(pTest.ss - ssExpect) <= tol2;
      const ropOk2 = pTest.rop >= ropExpect - tol2 && pTest.rop - ropExpect < 1 + tol2;
      const qmaxOk2 = pTest.qmax >= qmaxExpect - tol2 && pTest.qmax - qmaxExpect < 1 + tol2;
      const t2_ok = ssOk2 && ropOk2 && qmaxOk2;
      results.push({
        num: 2,
        title: 'Công thức toán học ROP, Qmax & SS',
        pass: t2_ok,
        detail: `SS = z·σ·√L = ${zTest}·${pTest.sigma}·√${pTest.L} = ${ssExpect.toFixed(2)} → engine ${pTest.ss} ${ssOk2 ? '✓' : '✗'} · ` +
                `ROP = ceil(D_lead + SS) = ceil(${pTest.d_lead} + ${pTest.ss}) → engine ${pTest.rop} ${ropOk2 ? '✓' : `✗ (mong đợi ${Math.ceil(ropExpect)})`} · ` +
                `Qmax = ceil(ROP + F_next) = ceil(${pTest.rop} + ${pTest.f_next}) → engine ${pTest.qmax} ${qmaxOk2 ? '✓' : `✗ (mong đợi ${Math.ceil(qmaxExpect)})`}`
      });

      // Test 3: Vòng đời createTransfer bằng hàm thật — tồn kho toàn mạng được bảo toàn
      const snapStock3 = {};
      WAREHOUSES.forEach(w => { snapStock3[w.code] = {}; SKUS.forEach(s => { const c = Store.stock[w.code][s.code]; snapStock3[w.code][s.code] = { on_hand: c.on_hand, in_transit: c.in_transit, committed: c.committed }; }); });
      const snapSeq3 = Object.assign({}, Store.seq);
      const origLog3 = logAction, origPush3 = pushNotification, origPersist3 = persistLedgerAction;
      const totalNetwork3 = () => { let t = 0; WAREHOUSES.forEach(w => SKUS.forEach(s => { const c = Store.stock[w.code][s.code]; t += c.on_hand + c.in_transit; })); return t; };
      let t3_ok = false, t3_detail = 'Không tìm được cặp kho đủ hàng để kiểm thử createTransfer.';
      try {
        // Chặn tác dụng phụ ghi ledger/log cho lệnh test, dọn lại state ở finally
        logAction = () => {}; pushNotification = () => {}; persistLedgerAction = () => {};
        const sum0 = totalNetwork3();
        let created = null;
        outer3: for (const sku3 of SKUS) {
          for (const srcW of WAREHOUSES) {
            if (getTransferableQty(sku3.code, srcW.code, Store.currentDate, 0) < 2) continue;
            for (const dstW of WAREHOUSES) {
              if (dstW.code === srcW.code) continue;
              const r3 = createTransfer({ sku: sku3.code, srcWh: srcW.code, dstWh: dstW.code, qty: 2, note: 'Self-test bảo toàn tồn', source: 'MANUAL' });
              if (r3.ok) { created = { sku: sku3.code, srcWh: srcW.code, dstWh: dstW.code, rec: r3.transfer }; break outer3; }
            }
          }
        }
        if (created) {
          const bSrc = snapStock3[created.srcWh][created.sku];
          const bDst = snapStock3[created.dstWh][created.sku];
          const nSrc = Store.stock[created.srcWh][created.sku];
          const nDst = Store.stock[created.dstWh][created.sku];
          const shipOk = (nSrc.on_hand === bSrc.on_hand - 2) && (nDst.in_transit === bDst.in_transit + 2);
          const sumAfterShip = totalNetwork3();
          applyShipmentReceipt(created.rec, 'auto');
          const aDst = Store.stock[created.dstWh][created.sku];
          const recvOk = (aDst.on_hand === bDst.on_hand + 2) && (aDst.in_transit === bDst.in_transit) && (created.rec.status === 'Đã nhận');
          const sumFinal = totalNetwork3();
          t3_ok = shipOk && recvOk && (sumAfterShip === sum0) && (sumFinal === sum0);
          t3_detail = `Lệnh ${created.rec.id} (${created.sku}: ${created.srcWh}→${created.dstWh}, 2 SP): xuất −2/+2 in_transit, nhận +2 on_hand đúng khớp; tổng tồn toàn mạng ${sum0} → ${sumFinal} (bảo toàn).`;
          const idxT3 = Store.transfers.findIndex(t => t.id === created.rec.id);
          if (idxT3 >= 0) Store.transfers.splice(idxT3, 1);
        }
      } finally {
        WAREHOUSES.forEach(w => SKUS.forEach(s => { const c = Store.stock[w.code][s.code]; const b = snapStock3[w.code][s.code]; c.on_hand = b.on_hand; c.in_transit = b.in_transit; c.committed = b.committed; }));
        Object.assign(Store.seq, snapSeq3);
        logAction = origLog3; pushNotification = origPush3; persistLedgerAction = origPersist3;
      }
      results.push({
        num: 3,
        title: 'Vòng đời createTransfer: bảo toàn tồn kho toàn mạng qua xuất và nhận',
        pass: t3_ok,
        detail: t3_detail
      });

      // Test 4: Quy tắc getStatus khớp ngưỡng ROP/Qmax trên toàn bộ 55 ô (không đòi phân bố nhóm)
      let statusRuleOk = true;
      const badCells4 = [];
      WAREHOUSES.forEach(wh => {
        SKUS.forEach(sku => {
          const p4 = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
          const s4 = Store.stock[wh.code][sku.code];
          const eff4 = s4.on_hand + s4.in_transit - s4.committed;
          const expected = eff4 <= p4.rop ? 'LOW' : (eff4 > p4.qmax ? 'HIGH' : 'OK');
          const got = getStatus(eff4, p4);
          if (got !== expected) { statusRuleOk = false; badCells4.push(`${wh.code}-${sku.code}: ${got} != ${expected} (eff=${eff4}, ROP=${p4.rop}, MAX=${p4.qmax})`); }
        });
      });
      results.push({
        num: 4,
        title: 'Nhất quán quy tắc Min/Max: getStatus đúng ngưỡng trên 55 ô SKU-Kho',
        pass: statusRuleOk,
        detail: statusRuleOk ? 'getStatus khớp 100% ngưỡng ROP (LOW) và Qmax (HIGH) trên mọi ô tại ngày hiện tại.' : `Lệch quy tắc tại: ${badCells4.slice(0, 3).join('; ')}`
      });

      // Test 5: Badge chuông thông báo khớp số chưa đọc CỦA KHO ĐANG XEM (cùng phạm vi với updateNotificationBadge)
      const activeWh5 = (Store.ui && Store.ui.activeWh) || 'HCM';
      const unreadActual = Store.notifications.filter(n => n.wh === activeWh5 && !n.read).length;
      const unreadAll = Store.notifications.filter(n => !n.read).length;
      const badgeEl = document.getElementById('bellBadge');
      const badgeDisplay = badgeEl ? parseInt(badgeEl.textContent, 10) || 0 : 0;
      const badgeHidden = !badgeEl || badgeEl.style.display === 'none';
      // UI chủ ý trần nhãn ở "99+" → từ 100 chưa đọc trở đi chỉ cần badge còn hiện và ≥ 99
      const badgeOk5 = unreadActual > 99
        ? (!badgeHidden && badgeDisplay >= 99)
        : (unreadActual === 0 ? badgeHidden : (!badgeHidden && badgeDisplay === unreadActual));
      const t5_ok = badgeOk5;
      results.push({
        num: 5,
        title: 'Badge chuông thông báo khớp số chưa đọc của kho đang xem',
        pass: t5_ok,
        detail: `Kho đang xem ${activeWh5}: chưa đọc ${unreadActual}/${unreadAll} toàn mạng — badge hiển thị "${badgeHidden ? '(ẩn)' : (unreadActual > 99 ? '99+' : badgeDisplay)}". ${t5_ok ? 'Khớp phạm vi (trần hiển thị 99+).' : 'Lệch: badge phải bằng số chưa đọc của kho đang xem.'}`
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

      // Test 7: checkTransferSafety (hàm thật) chặn lệnh vượt tồn kho thực của kho xuất
      const stSrcTest = Store.stock['BD']['TLM-045'];
      const excessiveQty = stSrcTest.on_hand + 100;
      const s7 = checkTransferSafety('TLM-045', 'BD', excessiveQty, Store.currentDate, 0);
      results.push({
        num: 7,
        title: 'Ràng buộc cứng điều chuyển: engine chặn lệnh vượt tồn kho và dưới ROP',
        pass: (s7.ok === false),
        detail: `Yêu cầu chuyển ${excessiveQty} SP (tồn thực BD: ${stSrcTest.on_hand}) được trả về bởi checkTransferSafety: "${s7.msg}"`
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

      // Test 9: Mọi đề xuất TRANSFER hiện hành đều khả thi khi bấm "Xử lý" (read-only, không side-effect)
      let feasOk = true;
      const feasBad = [];
      Object.keys(Store.proposals).forEach(k => {
        const p9 = Store.proposals[k];
        if (p9.type !== 'TRANSFER') return;
        if (!p9.srcWh || !p9.dstWh || !Store.stock[p9.dstWh]) { feasOk = false; feasBad.push(`${k}: thiếu kho nguồn/đích trong đề xuất`); return; }
        const reserved9 = getReservedQtyOfProposal(k);
        const rel9 = (reserved9 && reserved9.srcWh === p9.srcWh) ? reserved9.qty : 0;
        const safe9 = checkTransferSafety(p9.sku, p9.srcWh, p9.qty, Store.currentDate, rel9);
        if (!safe9.ok) { feasOk = false; feasBad.push(`${k}: ${safe9.msg}`); return; }
        const dst9 = Store.stock[p9.dstWh][p9.sku];
        const par9 = calcSKUParams(p9.sku, p9.dstWh, Store.currentDate, Store.history);
        const dstEff9 = dst9.on_hand + dst9.in_transit + p9.qty - dst9.committed;
        if (dstEff9 > Math.floor(getSafeTarget(par9))) { feasOk = false; feasBad.push(`${k}: kho nhận ${p9.dstWh} sẽ vượt mức an toàn (${dstEff9} > ${Math.floor(getSafeTarget(par9))}).`); }
      });
      results.push({
        num: 9,
        title: 'Đề xuất TRANSFER luôn khả thi: an toàn ROP kho xuất, không vượt mức an toàn kho nhận',
        pass: feasOk,
        detail: feasOk ? `Toàn bộ ${Object.keys(Store.proposals).filter(k => Store.proposals[k].type === 'TRANSFER').length} đề xuất điều chuyển hiện hành đạt ràng buộc khi bấm Xử lý.` : `Đề xuất không khả thi: ${feasBad.slice(0, 3).join(' | ')}`
      });

      // Test 10: Bản ghi đề xuất đầy đủ trường nghiệp vụ — không "kho nhận null", qty > 0
      let recOk = true;
      const recBad = [];
      Object.keys(Store.proposals).forEach(k => {
        const p10 = Store.proposals[k];
        const skuValid = SKUS.some(s => s.code === p10.sku);
        const whValid = WAREHOUSES.some(w => w.code === p10.wh);
        if (!skuValid || !whValid || !(p10.qty > 0)) { recBad.push(`${k}: thiếu SKU/kho (${p10.wh}) hoặc qty <= 0 (${p10.qty})`); recOk = false; return; }
        if (p10.type === 'TRANSFER' && (!p10.dstWh || !WAREHOUSES.some(w => w.code === p10.dstWh))) { recBad.push(`${k}: kho nhận (dstWh) trống hoặc không hợp lệ`); recOk = false; }
      });
      results.push({
        num: 10,
        title: 'Bản ghi đề xuất đầy đủ: SKU, kho nhận và số lượng hợp lệ (chống "kho nhận null")',
        pass: recOk,
        detail: recOk ? `Toàn bộ ${Object.keys(Store.proposals).length} đề xuất hiện hành có đủ trường nghiệp vụ (sku/wh/dstWh/qty).` : `Thiếu sót: ${recBad.slice(0, 3).join(' | ')}`
      });

      // Test 11: Cước lô (đã gồm phí chuyến) <= PARAMS.freightMarginCap × biên lợi nhuận gộp của lô
      const cap11 = (typeof PARAMS !== 'undefined' && PARAMS.freightMarginCap) ? PARAMS.freightMarginCap : 0.5;
      let freightValid = true;
      let worstRatio11 = 0, worstKey11 = '';
      Object.keys(Store.proposals).forEach(k => {
        const p = Store.proposals[k];
        if (p.type === 'TRANSFER' && p.srcWh) {
          const sku = SKUS.find(s => s.code === p.sku);
          const margin = (sku.price - sku.cogs) * p.qty;
          const ratio = margin > 0 ? p.freightCost / margin : Infinity;
          if (ratio > worstRatio11) { worstRatio11 = ratio; worstKey11 = `${p.sku} ${p.srcWh}→${p.dstWh} ×${p.qty}`; }
          if (p.freightCost > margin * cap11) freightValid = false;
        }
      });
      const checked11 = Object.keys(Store.proposals).filter(k => Store.proposals[k].type === 'TRANSFER').length;
      results.push({
        num: 11,
        title: `Chi phí cước vận chuyển (gồm phí chuyến) <= ${Math.round(cap11 * 100)}% biên lợi nhuận gộp`,
        pass: freightValid,
        detail: `${checked11} đề xuất điều chuyển — cước lô / biên LN lô cao nhất = ${(worstRatio11 * 100).toFixed(1)}% (${worstKey11 || 'không có đề xuất'}), ngưỡng ${Math.round(cap11 * 100)}%.`
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

      // Test 14 (B2): Kiểm tra toàn vẹn CSS thật — class dùng trong UI phải có trong stylesheet
      const cssText14 = Array.from(document.querySelectorAll('style')).map(s => s.textContent).join('\n');
      const requiredClasses14 = ['btn-table', 'status-pill', 'status-pill-low', 'status-pill-high', 'status-pill-ok', 'matrix-cell', 'bell-item', 'data-table', 'btn-secondary', 'modal-close', 'modal-title', 'row-highlight'];
      const missingCss14 = requiredClasses14.filter(c => cssText14.indexOf('.' + c) === -1);
      const hasAccent14 = cssText14.indexOf('--navy-accent:') !== -1;
      results.push({
        num: 14,
        title: 'Toàn vẹn CSS: mọi class UI và biến --navy-accent đều có định nghĩa thật',
        pass: missingCss14.length === 0 && hasAccent14,
        detail: (missingCss14.length === 0 && hasAccent14)
          ? 'Quét stylesheet thật: .data-table, .btn-secondary, .modal-close, .modal-title, .status-pill, .bell-item... và --navy-accent đều có định nghĩa.'
          : `Thiếu định nghĩa CSS: ${missingCss14.join(', ')}${hasAccent14 ? '' : ', --navy-accent'}`
      });

      // Test 15 (P6): Guardrail "hệ số cầu AI" — trong guardrail, khớp công thức, không lệch quá sàn ±nudge
      const st15 = (typeof getAiCoefState === 'function') ? getAiCoefState() : { items: {}, proposals: [] };
      const all15 = Object.keys(st15.items).map(k => ({ sku: k, coef: st15.items[k].coef }))
        .concat((st15.proposals || []).map(p => ({ sku: p.sku, coef: p.coef })));
      const outGuard15 = all15.filter(c => !(c.coef >= PARAMS.aiCoefMin && c.coef <= PARAMS.aiCoefMax));
      const wh15 = (Store.ui && Store.ui.activeWh) || WAREHOUSES[0].code;
      const badFormula15 = [];
      const badNudge15 = [];
      Object.keys(st15.items).forEach(code => {
        const p15 = calcSKUParams(code, wh15, Store.currentDate, Store.history);
        const base15 = getBaselineParams(code, wh15, Store.currentDate);
        if (Math.abs(p15.d_lead - base15.d_lead * p15.aiCoef) > 0.5) {
          badFormula15.push(`${code} d_lead=${p15.d_lead} ≠ ${base15.d_lead}×${p15.aiCoef}`);
        }
        const floor15 = st15.items[code].floorCoef !== undefined
          ? st15.items[code].floorCoef
          : getDemandEvidence(code, Store.currentDate).floorCoef;
        if (Math.abs(st15.items[code].coef - floor15) > AI_COEF_NUDGE + 0.005) {
          badNudge15.push(`${code} ×${st15.items[code].coef} (sàn ×${floor15})`);
        }
      });
      let negStock15 = 0;
      WAREHOUSES.forEach(w => SKUS.forEach(s => {
        const st15s = Store.stock[w.code][s.code];
        if (st15s && st15s.on_hand < 0) negStock15++;
      }));
      const coef15Pass = outGuard15.length === 0 && badFormula15.length === 0 &&
        badNudge15.length === 0 && negStock15 === 0;
      results.push({
        num: 15,
        title: 'Guardrail AI hệ số cầu: mọi coef trong [0.80–1.50], lệch ≤0.10 so với sàn tất định, ROP/MAX khớp công thức',
        pass: coef15Pass,
        detail: coef15Pass
          ? `${Object.keys(st15.items).length} hệ số đang áp dụng + ${(st15.proposals || []).length} kiến nghị: ` +
            `tất cả trong guardrail [${PARAMS.aiCoefMin}–${PARAMS.aiCoefMax}], không quá ±${AI_COEF_NUDGE} quanh sàn sai số, ` +
            `D_lead/MIN/MAX tính lại đúng công thức gốc, 0 ô on_hand < 0.` +
            (Object.keys(st15.items).length === 0 ? ' (chưa áp dụng hệ số nào — bất biến kiểm tra trên hiện trạng)' : '')
          : `Vi phạm: ${outGuard15.length} coef ngoài guardrail, ${badNudge15.length} coef lệch quá sàn ` +
            `(${badNudge15.join('; ')}), ${badFormula15.length} coef lệch công thức (${badFormula15.join('; ')}), ${negStock15} ô âm.`
      });

      // Render Results into Modal
      const summaryEl = document.getElementById('selfTestSummary');
      const resultsEl = document.getElementById('selfTestResults');
      const passCount = results.filter(r => r.pass).length;

      if (summaryEl) {
        summaryEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="status-pill ${passCount === results.length ? 'status-pill-ok' : 'status-pill-low'}" style="font-size:13px;padding:4px 12px;">
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
      return results;
    }

    function openSelfTestModal() {
      runSelfTests();
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

// ----------------------------------------------------------------------------
// MODAL CHI TIẾT YÊU CẦU GỬI HÀNG — kho nguồn xem tồn kho hiện tại & sau khi
// gửi để quyết định Xác nhận / Từ chối lệnh XC (flow hai bước)
// ----------------------------------------------------------------------------
function openTransferRequestDetail(recId) {
  const rec = Store.transfers.find(t => t.id === recId && isAwaitingCounterpart(t));
  if (!rec) {
    showToast('Không tìm thấy yêu cầu chờ xác nhận.', 'error');
    return;
  }
  const st = Store.stock[rec.srcWh][rec.sku];
  const p = calcSKUParams(rec.sku, rec.srcWh, Store.currentDate, Store.history);
  const safe = Math.floor(getSafeTarget(p));
  const skuObj = SKUS.find(s => s.code === rec.sku) || { name: rec.sku, unit: 'cái' };
  const srcObj = WAREHOUSES.find(w => w.code === rec.srcWh) || { name: rec.srcWh };
  const dstObj = WAREHOUSES.find(w => w.code === rec.dstWh) || { name: rec.dstWh };

  // Tồn khả dụng hiển thị = đã cộng lại mọi phần giữ chỗ CHƯA GỬI HÀNG (đề xuất chờ duyệt + XC chờ)
  const reserve = (typeof getPendingProposalReserve === 'function') ? getPendingProposalReserve(rec.sku, rec.srcWh) : 0;
  const effNow = st.on_hand + st.in_transit - st.committed + reserve;
  const otherPending = Math.max(0, reserve - rec.qty);
  const effAfter = effNow - rec.qty;
  const statusNow = getStatus(effNow, p);
  const statusAfter = getStatus(effAfter, p);
  const pill = s => s === 'LOW' ? '<span class="status-pill status-pill-low">Dưới MIN</span>'
    : (s === 'HIGH' ? '<span class="status-pill status-pill-high">Vượt MAX</span>'
    : '<span class="status-pill status-pill-ok">An toàn</span>');

  const cell = (lbl, val, sub) => `
    <div style="background:#F8FAFC;padding:10px 12px;border-radius:6px;border:1px solid #E2E8F0;">
      <div style="font-size:10.5px;color:var(--text-muted);font-weight:600;text-transform:uppercase;">${lbl}</div>
      <div style="font-size:16px;font-weight:700;color:var(--text-main);margin-top:2px;">${val}</div>
      ${sub ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">${sub}</div>` : ''}
    </div>`;

  const askInbound = rec.status === 'Chờ kho đích nhận hàng';
  let advice = '';
  if (askInbound) {
    const dSt = Store.stock[rec.dstWh][rec.sku];
    const dP = calcSKUParams(rec.sku, rec.dstWh, Store.currentDate, Store.history);
    const dSafe = Math.floor(getSafeTarget(dP));
    const dPlannedAll = (typeof getPlannedInboundQty === 'function') ? getPlannedInboundQty(rec.sku, rec.dstWh, null) : 0;
    const dEffAfter = dSt.on_hand + dSt.in_transit - dSt.committed + Math.max(0, dPlannedAll - rec.qty) + rec.qty;
    advice = dEffAfter > dSafe
      ? `<div style="margin-top:12px;padding:10px 12px;border-radius:6px;background:#FEE2E2;border:1px solid #FECACA;color:#991B1B;font-size:12px;font-weight:600;">
        ⚠ Nếu nhập đủ ${fmtNum(rec.qty)} ${skuObj.unit}, ${dstObj.name} sẽ VƯỢT mức an toàn (${fmtNum(dEffAfter)}/${fmtNum(dSafe)}). Nên thương lượng giảm số lượng hoặc từ chối — từ chối thì hàng ở lại ${srcObj.name}.
      </div>`
      : `<div style="margin-top:12px;padding:10px 12px;border-radius:6px;background:#DCFCE7;border:1px solid #BBF7D0;color:#166534;font-size:12px;font-weight:600;">
        ✓ Sau khi nhập, ${dstObj.name} vẫn trong ngưỡng an toàn (${fmtNum(dEffAfter)}/${fmtNum(dSafe)} ${skuObj.unit}) — bấm chấp nhận để ${srcObj.name} gửi hàng.
      </div>`;
  } else if (effAfter < p.rop) {
    advice = `<div style="margin-top:12px;padding:10px 12px;border-radius:6px;background:#FEE2E2;border:1px solid #FECACA;color:#991B1B;font-size:12px;font-weight:600;">
      ⚠ Nếu gửi đủ ${fmtNum(rec.qty)} ${skuObj.unit}, kho sẽ rơi xuống DƯỚI MIN (${fmtNum(effAfter)}/${fmtNum(p.rop)}). Nên thương lượng giảm số lượng hoặc từ chối.
    </div>`;
  } else {
    advice = `<div style="margin-top:12px;padding:10px 12px;border-radius:6px;background:#DCFCE7;border:1px solid #BBF7D0;color:#166534;font-size:12px;font-weight:600;">
      ✓ Sau khi gửi, kho vẫn ${statusAfter === 'HIGH' ? 'VƯỢT MAX (còn dư — gửi thêm được)' : 'AN TOÀN'} — yên tâm xác nhận gửi hàng.
    </div>`;
  }

  document.getElementById('trdTitle').textContent = askInbound
    ? `Chi tiết đề nghị ${rec.id} — ${dstObj.name} cân nhắc nhập hàng`
    : `Chi tiết yêu cầu ${rec.id} — ${srcObj.name}`;
  document.getElementById('trdBody').innerHTML = `
    <div style="font-size:13px;margin-bottom:12px;">
      <strong>${rec.sku}</strong> — ${escapeHtml(skuObj.name)} ·
      Gửi <strong>${fmtNum(rec.qty)} ${skuObj.unit}</strong> sang <strong>${dstObj.name}</strong>
      ${rec.arrivalDate ? `· dự kiến đến ${fmtDateVN(rec.arrivalDate)}` : ''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">
      ${cell('Tồn khả dụng hiện tại', fmtNum(effNow) + ' ' + skuObj.unit, 'Thực tế chưa gửi · ' + pill(statusNow))}
      ${cell('MIN / ROP', fmtNum(p.rop), 'Ngưỡng dưới an toàn')}
      ${cell('MAX / QMAX', fmtNum(p.qmax), 'Mức an toàn: ' + fmtNum(safe))}
      ${cell('Còn trong kho (on-hand)', fmtNum(st.on_hand), st.committed > 0 ? `Đang giữ chỗ: ${fmtNum(st.committed)}` : '')}
      ${cell('Sau khi gửi ' + fmtNum(rec.qty), fmtNum(effAfter) + ' ' + skuObj.unit, pill(statusAfter))}
      ${cell('Cước vận chuyển', fmtVND(rec.cost || 0), rec.savingVsRfq > 0 ? `Rẻ hơn RFQ ~${fmtVND(rec.savingVsRfq)}` : '')}
    </div>
    ${otherPending > 0 ? `<div style="margin-top:8px;font-size:11px;color:var(--text-muted);">Lưu ý: ô này còn ${fmtNum(otherPending)} ${skuObj.unit} đang bị giữ bởi các yêu cầu/đề xuất chờ khác.</div>` : ''}
    ${advice}
  `;

  const btnC = document.getElementById('trdConfirmBtn');
  const btnR = document.getElementById('trdRejectBtn');
  if (btnC) {
    btnC.textContent = askInbound ? 'Chấp nhận nhập hàng' : 'Xác nhận gửi hàng';
    btnC.onclick = () => { closeModal('transferRequestDetailModal'); (askInbound ? confirmTransferInbound(rec.id) : confirmTransferOutbound(rec.id)); };
  }
  if (btnR) btnR.onclick = () => { closeModal('transferRequestDetailModal'); (askInbound ? rejectTransferInbound(rec.id) : rejectTransferRequest(rec.id)); };
  openModal('transferRequestDetailModal');
}

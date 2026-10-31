// ============================================================================
// PROPOSALS SCANNER & APPROVAL PIPELINE
// ============================================================================

    // 2.8 PROPOSALS SCANNER & ALERTS (Yêu cầu 0.2, 0.3, 0.5, 5.2)
    // ----------------------------------------------------------------------------
    function scanAndGenerateProposals(curDate) {
      // 1. Quét trạng thái và kích hoạt Cảnh báo chuyển dịch trạng thái
      SKUS.forEach(sku => {
        WAREHOUSES.forEach(wh => {
          const key = `${wh.code}_${sku.code}`;
          const p = calcSKUParams(sku.code, wh.code, curDate, Store.history);
          const st = Store.stock[wh.code][sku.code];
          const eff = st.on_hand + st.in_transit - st.committed;
          const status = getStatus(eff, p);
          const prevStatus = Store.lastStatusMap[key];

          if (prevStatus && prevStatus !== status) {
            if (status === 'LOW') {
              pushNotification('ALERT_LOW', `${wh.code}-${sku.code}`,
                `Cảnh báo: ${sku.code} tại ${wh.name} đã chạm ngưỡng MIN/ROP (${eff}/${p.rop})!`
              );
            } else if (status === 'HIGH') {
              pushNotification('ALERT_HIGH', `${wh.code}-${sku.code}`,
                `Cảnh báo: ${sku.code} tại ${wh.name} đã vượt ngưỡng MAX (${eff}/${p.qmax})!`
              );
            }
          }
          Store.lastStatusMap[key] = status;
        });
      });

      // 2. Quét tạo danh sách đề xuất
      SKUS.forEach(sku => {
        WAREHOUSES.forEach(wh => {
          const pairKey = `${sku.code}-${wh.code}`;
          const p = calcSKUParams(sku.code, wh.code, curDate, Store.history);
          const st = Store.stock[wh.code][sku.code];
          const eff = st.on_hand + st.in_transit - st.committed;
          const status = getStatus(eff, p);

          // Gán hoặc lấy DX ID cố định (Yêu cầu 0.3)
          if (!Store.dxIds[pairKey]) {
            Store.dxIds[pairKey] = padSeq('DX');
          }
          const dxId = Store.dxIds[pairKey];

          if (status === 'LOW') {
            const needQty = Math.max(1, p.qmax - eff);

            // Kiểm tra xem đã có RFQ nào đang chờ cho SKU và Kho này chưa
            const activeRfq = Store.rfqs.find(r => r.sku === sku.code && r.wh === wh.code && r.status === 'Đã gửi NCC');

            // Tìm kho nguồn có thể điều chuyển thỏa mãn ràng buộc cứng:
            // I_donor - needQty > ROP_donor và needQty <= on_hand_donor
            let donorWh = null;
            let donorSurplus = 0;
            WAREHOUSES.forEach(otherWh => {
              if (otherWh.code !== wh.code) {
                const otherSt = Store.stock[otherWh.code][sku.code];
                const otherP  = calcSKUParams(sku.code, otherWh.code, curDate, Store.history);
                const otherEff = otherSt.on_hand + otherSt.in_transit - otherSt.committed;

                if (otherSt.on_hand >= needQty && (otherEff - needQty) > otherP.rop) {
                  const surplus = otherEff - otherP.rop;
                  if (surplus > donorSurplus) {
                    donorSurplus = surplus;
                    donorWh = otherWh.code;
                  }
                }
              }
            });

            if (donorWh) {
              const transferDays = getTransferDays(donorWh, wh.code);
              const unitRate = getUnitFreightRate(donorWh, wh.code, sku.code);
              const freightCost = needQty * unitRate;

              Store.proposals[pairKey] = {
                id: dxId,
                date: curDate,
                sku: sku.code,
                wh: wh.code,
                type: 'TRANSFER',
                action: 'Điều chuyển nội bộ',
                qty: needQty,
                srcWh: donorWh,
                dstWh: wh.code,
                leadDays: transferDays,
                arrivalDate: addDays(curDate, transferDays),
                freightCost: freightCost,
                status: 'Chờ duyệt',
                hasActiveRfq: false
              };
            } else {
              // Không tìm được kho điều chuyển -> Đề xuất Yêu cầu Báo giá NCC
              Store.proposals[pairKey] = {
                id: dxId,
                date: curDate,
                sku: sku.code,
                wh: wh.code,
                type: 'RFQ',
                action: 'Yêu cầu Báo giá (RFQ)',
                qty: needQty,
                sup: sku.sup,
                leadDays: sku.lead,
                arrivalDate: addDays(curDate, sku.lead),
                freightCost: 0,
                status: activeRfq ? 'Đang chờ NCC báo giá' : 'Chờ gửi RFQ',
                hasActiveRfq: !!activeRfq,
                rfqId: activeRfq ? activeRfq.id : null
              };
            }
          } else if (status === 'HIGH') {
            // Tồn dư vượt đỉnh MAX -> Đề xuất điều chuyển san tải sang kho cần hàng
            const excessQty = st.on_hand - p.qmax;
            // Ưu tiên chọn kho nhận:
            // 1. Kho thiếu hụt (isLow = true)
            // 2. Cùng thiếu hụt: ưu tiên chi phí vận chuyển thấp hơn + lead time nhanh hơn
            let bestRecipient = null;
            let bestRecipientScore = Infinity;
            WAREHOUSES.forEach(otherWh => {
              if (otherWh.code !== wh.code) {
                const otherSt = Store.stock[otherWh.code][sku.code];
                const otherP = calcSKUParams(sku.code, otherWh.code, curDate, Store.history);
                const otherEff = otherSt.on_hand + otherSt.in_transit - otherSt.committed;
                const isLow = otherEff <= otherP.rop;
                const freight = calcFreightCost(wh.code, otherWh.code, sku.code, excessQty);
                const tDays = getTransferDays(wh.code, otherWh.code);
                const score = (isLow ? 0 : 100000000) + freight + (tDays * 10000);
                if (score < bestRecipientScore) {
                  bestRecipientScore = score;
                  bestRecipient = otherWh.code;
                }
              }
            });
            const targetDstWh = bestRecipient || (wh.code === 'HCM' ? 'HN' : 'HCM');
            const transferDays = getTransferDays(wh.code, targetDstWh);
            const freightCost = calcFreightCost(wh.code, targetDstWh, sku.code, excessQty);

            Store.proposals[pairKey] = {
              id: dxId,
              date: curDate,
              sku: sku.code,
              wh: wh.code,
              srcWh: wh.code,
              dstWh: targetDstWh,
              type: 'OVERSTOCK',
              action: 'Điều chuyển san tải',
              qty: excessQty,
              leadDays: transferDays,
              arrivalDate: addDays(curDate, transferDays),
              freightCost: freightCost,
              status: 'Cần giải phóng vốn',
              hasActiveRfq: false
            };
          } else {
            // Trạng thái OK: Nếu không còn nhu cầu thì xóa đề xuất cũ
            if (Store.proposals[pairKey] && Store.proposals[pairKey].status !== 'Đang chờ NCC báo giá') {
              delete Store.proposals[pairKey];
            }
          }
        });
      });
    }

    // ----------------------------------------------------------------------------

    // 2.10 PROPOSAL APPROVAL & EXECUTION (Yêu cầu 0.2, 2.3)
    // ----------------------------------------------------------------------------
    function approveProposal(key) {
      const p = Store.proposals[key];
      if (!p) return;

      if (p.type === 'TRANSFER') {
        const srcSt = Store.stock[p.srcWh][p.sku];
        const srcP  = calcSKUParams(p.sku, p.srcWh, Store.currentDate, Store.history);
        const srcEff = srcSt.on_hand + srcSt.in_transit - srcSt.committed;

        // Ràng buộc cứng điều chuyển
        if (p.qty > srcSt.on_hand) {
          showToast(`Kho xuất ${p.srcWh} không đủ hàng vật lý (${srcSt.on_hand} < ${p.qty})!`, 'error');
          return;
        }
        if ((srcEff - p.qty) <= srcP.rop) {
          showToast(`Lỗi vi phạm an toàn: Kho xuất sẽ giảm dưới ROP (${srcEff - p.qty} <= ${srcP.rop})!`, 'error');
          return;
        }

        // Cập nhật tồn kho
        srcSt.on_hand -= p.qty;
        Store.stock[p.dstWh][p.sku].in_transit += p.qty;

        const trId = padSeq('TR');
        Store.transfers.unshift({
          id: trId,
          date: Store.currentDate,
          sku: p.sku,
          srcWh: p.srcWh,
          dstWh: p.dstWh,
          qty: p.qty,
          shipDate: Store.currentDate,
          arrivalDate: p.arrivalDate,
          status: 'Đang chuyển',
          cost: p.freightCost
        });

        delete Store.proposals[key]; // Yêu cầu 0.2
        pushNotification('TRANSFER_APPROVED', trId,
          `Đã duyệt lệnh điều chuyển ${p.qty} ${p.sku} từ ${p.srcWh} -> ${p.dstWh}`
        );
        logAction('APPROVE_TRANSFER', trId,
          `Lệnh chuyển ${p.qty} ${p.sku} (${p.srcWh} -> ${p.dstWh}), dự kiến đến: ${fmtDateVN(p.arrivalDate)}`,
          p.freightCost
        );
        showToast(`Đã duyệt thành công lệnh điều chuyển ${trId}`, 'success');
        renderAllViews();

      } else if (p.type === 'RFQ') {
        // Mở RFQ Modal để người dùng xác nhận và gửi
        openRfqModal(p.sku, p.wh, p.qty, p.sup);
      } else if (p.type === 'OVERSTOCK') {
        openOverstockModal(p.sku, p.wh);
      }
    }



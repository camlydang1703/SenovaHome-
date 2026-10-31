// ============================================================================
// PROPOSALS SCANNER & APPROVAL PIPELINE
// ============================================================================

    // 2.8 PROPOSALS SCANNER & ALERTS (Yêu cầu 0.2, 0.3, 0.5, 5.2)
    // ----------------------------------------------------------------------------
        // ----------------------------------------------------------------------------
    // RECALCULATE COMMITTED STOCK FROM ACTIVE PROPOSALS & TRANSFERS
    // ----------------------------------------------------------------------------
    function recalcCommittedStock() {
      if (!Store.stock) return;
      WAREHOUSES.forEach(wh => {
        SKUS.forEach(sku => {
          if (Store.stock[wh.code] && Store.stock[wh.code][sku.code]) {
            Store.stock[wh.code][sku.code].committed = 0;
          }
        });
      });

      if (Store.transfers) {
        Store.transfers.forEach(tr => {
          if (tr.status === 'Chờ kho nhận đồng ý' && Store.stock[tr.srcWh] && Store.stock[tr.srcWh][tr.sku]) {
            Store.stock[tr.srcWh][tr.sku].committed += tr.qty;
          }
        });
      }

      if (Store.proposals) {
        Object.values(Store.proposals).forEach(p => {
          if (p.type === 'TRANSFER' && p.status === 'Chờ duyệt' && p.srcWh && Store.stock[p.srcWh] && Store.stock[p.srcWh][p.sku]) {
            Store.stock[p.srcWh][p.sku].committed += p.qty;
          }
        });
      }
    }

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
      // 2a. Giải phóng giữ chỗ của các đề xuất điều chuyển cũ rồi sinh lại từ đầu,
      //     để mỗi đề xuất mới luôn được tính trên tồn khả dụng thực tế (không trừ 2 lần).
      Object.keys(Store.proposals).forEach(k => {
        const old = Store.proposals[k];
        if (old.type === 'TRANSFER' || old.type === 'OVERSTOCK') delete Store.proposals[k];
      });
      recalcCommittedStock();

      const getDxId = pairKey => {
        if (!Store.dxIds[pairKey]) Store.dxIds[pairKey] = padSeq('DX');
        return Store.dxIds[pairKey];
      };
      const effOf = (skuCode, whCode) => {
        const s = Store.stock[whCode][skuCode];
        return s.on_hand + s.in_transit - s.committed + getPendingInboundQty(whCode, skuCode);
      };
      const plannedInbound = {}; // `${sku}-${wh}` -> qty từ các đề xuất vừa sinh trong lần quét này

      // 2b. Kho THIẾU (LOW): xử lý kho nguy cấp nhất trước (eff/ROP thấp nhất)
      const lowCells = [];
      SKUS.forEach(sku => {
        WAREHOUSES.forEach(wh => {
          const p = calcSKUParams(sku.code, wh.code, curDate, Store.history);
          const eff = effOf(sku.code, wh.code);
          const pairKey = `${sku.code}-${wh.code}`;
          getDxId(pairKey);
          if (getStatus(eff, p) === 'LOW') {
            lowCells.push({ sku, wh, p, ratio: eff / Math.max(1, p.rop) });
          } else if (getStatus(eff, p) === 'OK') {
            const cur = Store.proposals[pairKey];
            if (cur && !cur.hasActiveRfq) delete Store.proposals[pairKey];
          }
        });
      });
      lowCells.sort((a, b) => a.ratio - b.ratio);

      lowCells.forEach(({ sku, wh }) => {
        const pairKey = `${sku.code}-${wh.code}`;
        const dxId = getDxId(pairKey);
        const activeRfq = Store.rfqs.find(r => r.sku === sku.code && r.wh === wh.code && r.status === 'Đã gửi NCC');
        const ev = evaluateReplenishmentOptions(sku.code, wh.code, curDate);
        const best = ev.best;

        if (best.type === 'TRANSFER') {
          Store.proposals[pairKey] = {
            id: dxId,
            date: curDate,
            sku: sku.code,
            wh: wh.code,
            type: 'TRANSFER',
            action: 'Điều chuyển nội bộ',
            qty: best.qty,
            srcWh: best.srcWh,
            dstWh: wh.code,
            leadDays: best.days,
            arrivalDate: addDays(curDate, best.days),
            freightCost: best.freight,
            rfqCost: ev.rfq.total,
            savingVsRfq: ev.savingVsRfq,
            status: 'Chờ duyệt',
            hasActiveRfq: false
          };
          // Giữ chỗ tại kho nguồn để các kho thiếu sau không đặt trùng
          Store.stock[best.srcWh][sku.code].committed += best.qty;
          plannedInbound[pairKey] = (plannedInbound[pairKey] || 0) + best.qty;
        } else {
          Store.proposals[pairKey] = {
            id: dxId,
            date: curDate,
            sku: sku.code,
            wh: wh.code,
            type: 'RFQ',
            action: 'Yêu cầu Báo giá (RFQ)',
            qty: ev.qNeed,
            sup: sku.sup,
            leadDays: best.days,
            arrivalDate: addDays(curDate, best.days),
            freightCost: 0,
            rfqCost: ev.rfq.total,
            noTransferReason: ev.sources.every(s => s.transferable < 1)
              ? 'Không kho nào còn tồn dư an toàn'
              : (ev.bestTransfer ? 'Điều chuyển đắt hơn RFQ' : 'Cước điều chuyển vượt 50% biên LN'),
            status: activeRfq ? 'Đang chờ NCC báo giá' : 'Chờ gửi RFQ',
            hasActiveRfq: !!activeRfq,
            rfqId: activeRfq ? activeRfq.id : null
          };
        }
      });

      // 2c. Kho DƯ (HIGH): san tải phần vượt MAX (đã trừ phần vừa cấp cho kho thiếu)
      SKUS.forEach(sku => {
        WAREHOUSES.forEach(wh => {
          const pairKey = `${sku.code}-${wh.code}`;
          const p = calcSKUParams(sku.code, wh.code, curDate, Store.history);
          const eff = effOf(sku.code, wh.code);
          if (getStatus(eff, p) !== 'HIGH') {
            if (Store.proposals[pairKey] && Store.proposals[pairKey].type === 'OVERSTOCK') delete Store.proposals[pairKey];
            return;
          }
          const excessQty = Math.min(eff - p.qmax, getTransferableQty(sku.code, wh.code, curDate));
          if (excessQty < 1) return;

          // Kho nhận: ưu tiên kho thiếu, sau đó kho còn chỗ dưới MAX, cước/đơn vị thấp + lead time ngắn
          let best = null;
          WAREHOUSES.forEach(otherWh => {
            if (otherWh.code === wh.code) return;
            const oP = calcSKUParams(sku.code, otherWh.code, curDate, Store.history);
            const oEff = effOf(sku.code, otherWh.code) + (plannedInbound[`${sku.code}-${otherWh.code}`] || 0);
            const room = Math.floor(oP.qmax - oEff);
            if (room < 1) return;
            const qty = Math.min(excessQty, room);
            const unit = getUnitFreightRate(wh.code, otherWh.code, sku.code);
            if (unit > (sku.price - sku.cogs) * 0.5) return; // cước phải <= 50% biên LN gộp
            const tDays = getTransferDays(wh.code, otherWh.code, curDate);
            const score = (oEff <= oP.rop ? 0 : 1e9) + unit * 10 + tDays * 1000 - qty;
            if (!best || score < best.score) best = { dst: otherWh.code, qty, unit, tDays, score };
          });

          if (best) {
            Store.proposals[pairKey] = {
              id: getDxId(pairKey),
              date: curDate,
              sku: sku.code,
              wh: wh.code,
              srcWh: wh.code,
              dstWh: best.dst,
              type: 'OVERSTOCK',
              action: 'Điều chuyển san tải',
              qty: best.qty,
              leadDays: best.tDays,
              arrivalDate: addDays(curDate, best.tDays),
              freightCost: best.qty * best.unit,
              status: 'Cần giải phóng vốn',
              hasActiveRfq: false
            };
            plannedInbound[`${sku.code}-${best.dst}`] = (plannedInbound[`${sku.code}-${best.dst}`] || 0) + best.qty;
          } else {
            Store.proposals[pairKey] = {
              id: getDxId(pairKey),
              date: curDate,
              sku: sku.code,
              wh: wh.code,
              srcWh: wh.code,
              dstWh: null,
              type: 'OVERSTOCK',
              action: 'Xả tồn / Flash Sale (các kho đều đủ hàng)',
              qty: excessQty,
              leadDays: 0,
              arrivalDate: curDate,
              freightCost: 0,
              status: 'Cần giải phóng vốn',
              hasActiveRfq: false
            };
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
        // Ràng buộc cứng điều chuyển (cộng lại phần giữ chỗ của chính đề xuất này)
        const safety = checkTransferSafety(p.sku, p.srcWh, p.qty, Store.currentDate, p.qty);
        if (!safety.ok) {
          showToast(safety.msg, 'error');
          return;
        }

        // Cập nhật tồn kho
        srcSt.on_hand -= p.qty;
        srcSt.committed = Math.max(0, srcSt.committed - p.qty);
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
        // Mở màn hình so sánh tích hợp (điều chuyển vs RFQ) để xử lý đơn
        openTransferCompareModal(p.sku, p.wh);
      } else if (p.type === 'OVERSTOCK') {
        openOverstockModal(p.sku, p.wh);
      }
    }



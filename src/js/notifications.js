// ============================================================================
// NOTIFICATIONS SYSTEM & AUDIT LOGGING (PHASE 3)
// ============================================================================

    // 2.1 NOTIFICATIONS SYSTEM (Yêu cầu 3.1 & 3.4a)
    // ----------------------------------------------------------------------------
    function pushNotification(type, refId, text, whCode = null) {
      const notifId = 'NT-' + String(Store.seq.notif++).padStart(4, '0');
      let targetWh = whCode;

      if (!targetWh && refId && typeof Store !== 'undefined' && Store.transfers) {
        const tr = Store.transfers.find(t => t.id === refId);
        if (tr) targetWh = tr.dstWh || tr.srcWh;
      }
      if (!targetWh && refId && typeof Store !== 'undefined' && Store.rfqs) {
        const r = Store.rfqs.find(x => x.id === refId);
        if (r) targetWh = r.wh;
      }
      if (!targetWh && refId) {
        for (const w of WAREHOUSES) {
          if (refId.startsWith(w.code + '-') || refId.endsWith('-' + w.code) || refId === w.code) {
            targetWh = w.code;
            break;
          }
        }
      }
      if (!targetWh && text) {
        for (const w of WAREHOUSES) {
          if (text.includes(w.name) || text.includes(`kho ${w.code}`) || text.includes(`Kho ${w.code}`) || text.includes(`về ${w.code}`) || text.includes(`tại ${w.code}`) || text.includes(`sang ${w.code}`)) {
            targetWh = w.code;
            break;
          }
        }
      }
      if (!targetWh) {
        targetWh = (Store.ui && Store.ui.activeWh) || 'HCM';
      }

      const item = {
        id: notifId,
        date: Store.currentDate,
        type: type,
        refId: refId,
        text: text,
        wh: targetWh,
        read: false,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };

      Store.notifications.unshift(item);
      updateNotificationBadge();
      return item;
    }

    function updateNotificationBadge() {
      const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
      const whObj = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];
      const whNotifs = Store.notifications.filter(n => n.wh === activeWh);
      const unreadCount = whNotifs.filter(n => !n.read).length;
      const totalCount = whNotifs.length;

      const badge = document.getElementById('bellBadge');
      if (badge) {
        if (unreadCount > 0) {
          badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      }
      const headText = document.getElementById('bellHeadText');
      if (headText) {
        headText.textContent = `Thông báo (${unreadCount} chưa đọc / ${totalCount} tổng của ${whObj.name})`;
      }
    }

    function markAllNotificationsRead() {
      const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
      Store.notifications.filter(n => n.wh === activeWh).forEach(n => { n.read = true; });
      updateNotificationBadge();
      renderBellPopover();
    }

    function toggleBellPopover() {
      const popover = document.getElementById('bellPopover');
      if (!popover) return;
      if (popover.classList.contains('active')) {
        popover.classList.remove('active');
      } else {
        renderBellPopover();
        popover.classList.add('active');
      }
    }

    function renderBellPopover() {
      const list = document.getElementById('bellList');
      if (!list) return;
      const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
      const whObj = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];
      updateNotificationBadge();

      const whNotifs = Store.notifications.filter(n => n.wh === activeWh);

      if (whNotifs.length === 0) {
        list.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--text-muted);font-size:12px;">Kho ${whObj.name} hiện chưa có thông báo nào.</div>`;
        return;
      }

      let html = '';
      whNotifs.slice(0, 50).forEach(n => {
        let color = '#2563EB';
        if (n.type.includes('LOW'))  { color = '#EF4444'; }
        if (n.type.includes('HIGH')) { color = '#F59E0B'; }
        if (n.type.includes('TRANSFER')) { color = '#059669'; }
        if (n.type.includes('RFQ'))      { color = '#8B5CF6'; }
        if (n.type.includes('EVENT'))    { color = '#D97706'; }

        html += `
          <div class="bell-item ${n.read ? '' : 'unread'}" onclick="onNotificationClick('${n.id}')">
            <div style="margin-top:5px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span></div>
            <div style="flex:1;">
              <div style="font-size:12px;color:var(--text-main);font-weight:${n.read ? '500' : '700'};line-height:1.4;">
                ${n.text}
              </div>
              <div style="font-size:10.5px;color:var(--text-muted);margin-top:3px;display:flex;gap:8px;">
                <span>${fmtDateVN(n.date)}</span>
                <span>•</span>
                <span style="color:${color};font-weight:600;">${n.type}</span>
                <span>•</span>
                <span>${n.refId}</span>
              </div>
            </div>
            ${n.read ? '' : '<span style="width:7px;height:7px;border-radius:50%;background:var(--navy-accent);display:inline-block;margin-top:6px;"></span>'}
          </div>
        `;
      });
      list.innerHTML = html;
    }

    function onNotificationClick(notifId) {
      const item = Store.notifications.find(n => n.id === notifId);
      if (item) item.read = true;
      updateNotificationBadge();
      const popover = document.getElementById('bellPopover');
      if (popover) popover.classList.remove('active');

      if (item) {
        if (item.wh && typeof switchWarehouse === 'function') {
          switchWarehouse(item.wh);
        }
        if (item.type.includes('TRANSFER')) {
          switchNavTab('transfers');
        } else if (item.type.includes('RFQ')) {
          switchNavTab('rfq');
        } else {
          switchNavTab('dashboard');
        }
      }
    }

    // ----------------------------------------------------------------------------
    // 2.2 ACTION LOGGING & SYSTEM AUDIT LOG (Yêu cầu 3.1 & 3.4b, c)
    // Nhật ký chỉ ghi thao tác quản trị tồn kho (điều chuyển, RFQ, nhập/xuất nhanh)
    // và đồng bộ data/ledger.csv qua server.py.
    // ----------------------------------------------------------------------------
    const MANAGER_LOG_TYPES = {
      PROPOSE_TRANSFER: 1,
      APPROVE_TRANSFER: 1,
      MANUAL_TRANSFER: 1,
      TRANSFER_ACCEPTED: 1,
      TRANSFER_REJECTED: 1,
      TRANSFER_EARLY_RECEIVE: 1,
      TRANSFER_ARRIVED: 1,
      SAN_TAI_2A: 1,
      SEND_RFQ: 1,
      CANCEL_RFQ: 1,
      QUICK_IN: 1,
      QUICK_OUT: 1
    };

    function apiUrl(path) {
      try {
        if (typeof location !== 'undefined' && String(location.port) === '8000') return path;
      } catch (e) {}
      return 'http://localhost:8000' + path;
    }

    function extractSkuFromText(text) {
      if (!text) return '';
      const m = String(text).match(/\b([A-Z]{2,4}-[A-Z0-9]{3,})\b/);
      return m ? m[1] : '';
    }

    function logAction(type, target, details, cost = 0, whCode = null, extra = {}) {
      // SYSTEM_INIT chỉ ghi console theo đúng quy tắc Phase 3
      if (type === 'SYSTEM_INIT') {
        console.log(`[SYSTEM_INIT] ${details}`);
        return;
      }

      if (!MANAGER_LOG_TYPES[type]) return;

      let targetWh = whCode || extra.wh || null;
      let srcWh = extra.srcWh || null;
      let dstWh = extra.dstWh || null;

      // Trích xuất srcWh và dstWh từ details nếu là lệnh chuyển
      const routeMatch = details.match(/\(([A-Z_]+)\s*->\s*([A-Z_]+)\)/);
      if (routeMatch) {
        srcWh = routeMatch[1];
        dstWh = routeMatch[2];
        if (!targetWh) targetWh = srcWh;
      }

      // Trích xuất từ Transfer ID
      if ((!srcWh || !dstWh) && target && target.startsWith('TR-') && Store.transfers) {
        const tr = Store.transfers.find(t => t.id === target);
        if (tr) {
          srcWh = tr.srcWh;
          dstWh = tr.dstWh;
          if (!targetWh) targetWh = dstWh;
        }
      }

      // Trích xuất từ RFQ ID
      if (!targetWh && target && target.startsWith('RFQ-') && Store.rfqs) {
        const r = Store.rfqs.find(x => x.id === target);
        if (r) targetWh = r.wh;
      }

      // Trích xuất từ warehouse code
      if (!targetWh) {
        for (const w of WAREHOUSES) {
          if (target === w.code || details.includes(`tại ${w.code}`) || details.includes(`kho ${w.code}`) || details.includes(`Kho ${w.code}`) || details.includes(w.name)) {
            targetWh = w.code;
            break;
          }
        }
      }

      if (!targetWh) {
        targetWh = (Store.ui && Store.ui.activeWh) || 'HCM';
      }

      const sku = extra.sku || extractSkuFromText(details) || extractSkuFromText(target);
      const act = {
        id: padSeq('ACT'),
        date: Store.currentDate,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: type,
        target: target,
        details: details,
        cost: cost,
        wh: targetWh,
        srcWh: srcWh,
        dstWh: dstWh,
        sku: sku
      };

      Store.actions.unshift(act);

      // Cập nhật DOM nếu đang ở dashboard
      renderSystemLog((Store.ui && Store.ui.activeWh) || 'HCM');

      persistLedgerAction(act);
    }

    function persistLedgerAction(act) {
      if (typeof fetch !== 'function') return;
      const lines = [];
      const note = `[${act.time}] ${act.details}`;
      if (act.srcWh && act.dstWh) {
        lines.push({
          warehouse_code: act.srcWh,
          sku: act.sku || '',
          delta_on_hand: 0,
          delta_in_transit: 0,
          delta_on_order: 0,
          note: note
        });
        lines.push({
          warehouse_code: act.dstWh,
          sku: act.sku || '',
          delta_on_hand: 0,
          delta_in_transit: 0,
          delta_on_order: 0,
          note: note
        });
      } else {
        lines.push({
          warehouse_code: act.wh,
          sku: act.sku || '',
          delta_on_hand: 0,
          delta_in_transit: 0,
          delta_on_order: act.type === 'SEND_RFQ' ? 1 : 0,
          note: note
        });
      }
      fetch(apiUrl('/api/action'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_id: act.id,
          date: act.date,
          doc_type: act.type,
          doc_id: act.target,
          lines: lines
        })
      }).then(res => {
        Store.serverStatus = res.ok ? 'online' : 'offline';
        updateServerStatusIndicator();
      }).catch(() => {
        Store.serverStatus = 'offline';
        updateServerStatusIndicator();
      });
    }

    function parseCsvText(text) {
      const rows = [];
      let row = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
          if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
          else if (c === '"') inQ = false;
          else cur += c;
        } else if (c === '"') {
          inQ = true;
        } else if (c === ',') {
          row.push(cur); cur = '';
        } else if (c === '\n' || c === '\r') {
          if (c === '\r' && text[i + 1] === '\n') i++;
          row.push(cur); cur = '';
          if (row.some(v => v !== '')) rows.push(row);
          row = [];
        } else {
          cur += c;
        }
      }
      if (cur !== '' || row.length) {
        row.push(cur);
        if (row.some(v => v !== '')) rows.push(row);
      }
      return rows;
    }

    function ledgerRowsToActions(csvText) {
      const table = parseCsvText(csvText);
      if (!table.length) return [];
      const header = table[0];
      const idx = {};
      header.forEach((h, i) => { idx[h] = i; });
      const groups = {};
      table.slice(1).forEach(cols => {
        const rec = {
          entry_id: cols[idx.entry_id] || '',
          date: cols[idx.date] || '',
          doc_type: cols[idx.doc_type] || '',
          doc_id: cols[idx.doc_id] || '',
          warehouse_code: cols[idx.warehouse_code] || '',
          sku: cols[idx.sku] || '',
          note: cols[idx.note] || ''
        };
        if (!MANAGER_LOG_TYPES[rec.doc_type]) return;
        const key = rec.date + '|' + rec.doc_type + '|' + rec.doc_id;
        if (!groups[key]) groups[key] = [];
        groups[key].push(rec);
      });
      const actions = Object.keys(groups).map(key => {
        const list = groups[key];
        const first = list[0];
        let srcWh = null;
        let dstWh = null;
        if (list.length >= 2) {
          srcWh = list[0].warehouse_code;
          dstWh = list[1].warehouse_code;
        }
        const timeMatch = (first.note || '').match(/^\[(\d{2}:\d{2}:\d{2})\]\s*/);
        const time = timeMatch ? timeMatch[1] : '';
        const details = timeMatch ? first.note.slice(timeMatch[0].length) : (first.note || '');
        const routeMatch = details.match(/\(([A-Z_]+)\s*->\s*([A-Z_]+)\)/);
        if (routeMatch) {
          srcWh = routeMatch[1];
          dstWh = routeMatch[2];
        }
        return {
          id: first.entry_id || first.doc_id,
          date: first.date,
          time: time,
          type: first.doc_type,
          target: first.doc_id,
          details: details,
          cost: 0,
          wh: first.warehouse_code,
          srcWh: srcWh,
          dstWh: dstWh,
          sku: first.sku
        };
      });
      actions.sort((a, b) => (a.date + a.time) < (b.date + b.time) ? 1 : -1);
      return actions;
    }

    function pingLedgerServer() {
      if (typeof fetch !== 'function') return;
      fetch(apiUrl('/api/get_csv?file=ledger.csv'))
        .then(res => {
          Store.serverStatus = res.ok ? 'online' : 'offline';
          updateServerStatusIndicator();
          if (!res.ok) throw new Error('offline');
          return res.text();
        })
        .then(text => {
          const loaded = ledgerRowsToActions(text);
          if (loaded.length) {
            const existing = {};
            Store.actions.forEach(a => { existing[a.id] = 1; });
            loaded.reverse().forEach(a => {
              if (!existing[a.id]) Store.actions.push(a);
            });
            Store.actions.sort((a, b) => (a.date + a.time) < (b.date + b.time) ? 1 : -1);
          }
          renderSystemLog((Store.ui && Store.ui.activeWh) || 'HCM');
        })
        .catch(() => {
          Store.serverStatus = 'offline';
          updateServerStatusIndicator();
        });
    }

    function updateServerStatusIndicator() {
      const el = document.getElementById('serverStatusBadge');
      if (!el) return;
      if (Store.serverStatus === 'online') {
        el.innerHTML = '<span style="color:#16A34A;font-size:11px;font-weight:600;">● Đã kết nối ledger.csv</span>';
      } else {
        el.innerHTML = '<span style="color:#D97706;font-size:11px;font-weight:600;" title="Server backend chưa khởi động - Chưa ghi ledger.csv">⚠️ Chưa kết nối ledger.csv</span>';
      }
    }

    function renderSystemLog(activeWh) {
      const list = document.getElementById('systemLogList');
      if (!list) return;

      const whObj = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];
      const whNameEl = document.getElementById('logWhName');
      if (whNameEl) whNameEl.textContent = whObj.name;

      // Chỉ thao tác quản trị tồn kho, lọc theo kho đang chọn
      const whActions = Store.actions.filter(a =>
        MANAGER_LOG_TYPES[a.type] &&
        (a.wh === activeWh || a.srcWh === activeWh || a.dstWh === activeWh)
      );

      const filterType = (Store.ui && Store.ui.logFilter) ? Store.ui.logFilter : 'ALL';
      let filtered = whActions;
      if (filterType !== 'ALL') {
        filtered = whActions.filter(a => {
          if (filterType === 'TRANSFER') return a.type.includes('TRANSFER') || a.type === 'SAN_TAI_2A';
          if (filterType === 'RFQ') return a.type.includes('RFQ');
          if (filterType === 'QUICK') return a.type.includes('QUICK') || a.type.includes('STOCK_');
          return a.type === filterType;
        });
      }

      const countBadge = document.getElementById('logCountBadge');
      if (countBadge) countBadge.textContent = `${filtered.length} bản ghi`;

      if (filtered.length === 0) {
        list.innerHTML = `<div style="padding:16px;text-align:center;color:#94A3B8;font-size:12px;">Chưa có bản ghi nhật ký nào cho ${whObj.name}.</div>`;
        return;
      }

      let html = '';
      filtered.slice(0, 50).forEach(act => {
        // Nhãn vai trò cho lệnh điều chuyển
        let roleBadge = '';
        if (act.srcWh && act.dstWh) {
          if (act.srcWh === activeWh) {
            roleBadge = `<span class="log-role role-src">Xuất đi tới ${act.dstWh}</span>`;
          } else if (act.dstWh === activeWh) {
            roleBadge = `<span class="log-role role-dst">Nhận về từ ${act.srcWh}</span>`;
          }
        }

        html += `
          <div class="log-item" style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px solid #334155;font-size:11.5px;">
            <div class="log-time" style="color:#94A3B8;white-space:nowrap;min-width:130px;">${fmtDateVN(act.date)} ${act.time}</div>
            <div class="log-tag" style="background:#334155;color:#F8FAFC;padding:1px 6px;border-radius:3px;font-size:10.5px;font-weight:600;white-space:nowrap;">${act.type}</div>
            <div class="log-desc" style="flex:1;color:#CBD5E1;">
              <strong>${act.target}</strong>: ${act.details}
              ${roleBadge}
            </div>
            <div class="log-cost" style="color:#FBBF24;font-weight:600;white-space:nowrap;">${act.cost > 0 ? fmtVND(act.cost) : '-'}</div>
          </div>
        `;
      });

      list.innerHTML = html;
    }

    function toggleLogAccordion() {
      const body = document.getElementById('systemLogList');
      const text = document.getElementById('logToggleText');
      if (!body) return;

      const isOpen = body.classList.contains('open') || body.classList.contains('active');
      if (isOpen) {
        body.classList.remove('open');
        body.classList.remove('active');
        if (text) text.textContent = 'Mở nhật ký ▾';
      } else {
        body.classList.add('open');
        body.classList.add('active');
        if (text) text.textContent = 'Thu gọn nhật ký ▴';
      }
    }

    function onLogFilterChange(val) {
      if (!Store.ui) Store.ui = {};
      Store.ui.logFilter = val;
      renderSystemLog(Store.ui.activeWh || 'HCM');
    }

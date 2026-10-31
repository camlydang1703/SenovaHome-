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
    // ----------------------------------------------------------------------------
    function logAction(type, target, details, cost = 0, whCode = null, extra = {}) {
      // SYSTEM_INIT chỉ ghi console theo đúng quy tắc Phase 3
      if (type === 'SYSTEM_INIT') {
        console.log(`[SYSTEM_INIT] ${details}`);
        return;
      }

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
        dstWh: dstWh
      };

      Store.actions.unshift(act);

      // Cập nhật DOM nếu đang ở dashboard
      renderSystemLog((Store.ui && Store.ui.activeWh) || 'HCM');

      // Đồng bộ backend server (ghi ledger.csv & decisions.csv)
      fetch('http://localhost:8000/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(act)
      }).then(() => {
        Store.serverStatus = 'online';
        updateServerStatusIndicator();
      }).catch(err => {
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

      // Lọc các bản ghi liên quan đến activeWh:
      // wh === activeWh HOẶC srcWh === activeWh HOẶC dstWh === activeWh
      const whActions = Store.actions.filter(a =>
        a.wh === activeWh || a.srcWh === activeWh || a.dstWh === activeWh
      );

      // Bộ lọc loại nếu có
      const filterType = (Store.ui && Store.ui.logFilter) ? Store.ui.logFilter : 'ALL';
      let filtered = whActions;
      if (filterType !== 'ALL') {
        filtered = whActions.filter(a => {
          if (filterType === 'TRANSFER') return a.type.includes('TRANSFER') || a.type === 'SAN_TAI_2A';
          if (filterType === 'RFQ') return a.type.includes('RFQ');
          if (filterType === 'INBOUND_NCC') return a.type === 'INBOUND_NCC';
          if (filterType === 'EVENT') return a.type === 'EVENT';
          if (filterType === 'EXCEPTION') return a.type.includes('EXCEPTION');
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

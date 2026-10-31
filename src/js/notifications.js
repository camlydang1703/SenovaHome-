// ============================================================================
// NOTIFICATIONS SYSTEM & AUDIT LOGGING
// ============================================================================

    // 2.1 NOTIFICATIONS SYSTEM (Yêu cầu 5)
    // ----------------------------------------------------------------------------
    function pushNotification(type, refId, text, whCode = null) {
      const notifId = 'NT-' + String(Store.seq.notif++).padStart(4, '0');
      let targetWh = whCode;
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
          if (text.includes(w.name) || text.includes(`kho ${w.code}`) || text.includes(`Kho ${w.code}`) || text.includes(`về ${w.code}`) || text.includes(`tại ${w.code}`)) {
            targetWh = w.code;
            break;
          }
        }
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
      const unreadCount = Store.notifications.filter(n => !n.read).length;
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
        headText.textContent = `Thông báo & Cảnh báo (${unreadCount} chưa đọc)`;
      }
    }

    function markAllNotificationsRead() {
      Store.notifications.forEach(n => { n.read = true; });
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
      updateNotificationBadge();

      if (Store.notifications.length === 0) {
        list.innerHTML = '<div style="padding:24px 16px;text-align:center;color:var(--text-muted);font-size:12px;">Chưa có thông báo nào.</div>';
        return;
      }

      let html = '';
      Store.notifications.slice(0, 30).forEach(n => {
        let icon = '🔔';
        let color = '#2563EB';
        if (n.type === 'ALERT_LOW')  { icon = '⚠️'; color = '#EF4444'; }
        if (n.type === 'ALERT_HIGH') { icon = '📦'; color = '#F59E0B'; }
        if (n.type.includes('TRANSFER')) { icon = '🚚'; color = '#059669'; }
        if (n.type.includes('RFQ'))      { icon = '📝'; color = '#8B5CF6'; }

        html += `
          <div class="bell-item ${n.read ? '' : 'unread'}" onclick="onNotificationClick('${n.id}')">
            <div style="font-size:16px;margin-top:2px;">${icon}</div>
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
        // C3: Auto-switch active warehouse to the notification's warehouse before switching tab
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
    // 2.2 ACTION LOGGING & SERVER LEDGER SYNC (Yêu cầu 11)
    // ----------------------------------------------------------------------------
    function logAction(type, target, details, cost = 0) {
      const act = {
        id: padSeq('ACT'),
        date: Store.currentDate,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: type,
        target: target,
        details: details,
        cost: cost
      };
      Store.actions.unshift(act);

      // Render to DOM if list exists
      const list = document.getElementById('systemLogList');
      if (list) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'log-item';
        itemDiv.innerHTML = `
          <div class="log-time">${fmtDateVN(act.date)} ${act.time}</div>
          <div class="log-tag">${act.type}</div>
          <div class="log-desc"><strong>${act.target}</strong>: ${act.details}</div>
          <div class="log-cost">${act.cost > 0 ? fmtVND(act.cost) : '-'}</div>
        `;
        list.insertBefore(itemDiv, list.firstChild);
      }

      // Non-blocking sync with backend server
      fetch('http://localhost:8000/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(act)
      }).catch(err => {
        if (!Store._ledgerWarned) {
          Store._ledgerWarned = true;
          showToast('⚠️ Chưa ghi được ledger.csv - server chưa khởi động', 'warning');
        }
      });
    }

    function toggleLogAccordion() {
      const body = document.getElementById('systemLogList');
      const text = document.getElementById('logToggleText');
      if (!body) return;
      if (body.classList.contains('active')) {
        body.classList.remove('active');
        if (text) text.textContent = 'Mở nhật ký ▾';
      } else {
        body.classList.add('active');
        if (text) text.textContent = 'Thu gọn nhật ký ▴';
      }
    }

    // ----------------------------------------------------------------------------


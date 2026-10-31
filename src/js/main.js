// ============================================================================
// NAVIGATION, MASTER RENDER, TIME CONTROLS & DOM INITIALIZATION (PHASE C)
// ============================================================================

// 3.2 NAVIGATION & TAB SWITCHING
function switchNavTab(tabName) {
  Store.activeTab = tabName;

  // Update Tab Buttons
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    if (btn.id === `tab-${tabName}`) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update View Panels
  const panels = document.querySelectorAll('.view-panel');
  panels.forEach(p => {
    if (p.id === `view-${tabName}`) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  // Render specific view
  if (tabName === 'dashboard') {
    renderDashboardView();
  } else if (tabName === 'inventory') {
    renderInventoryView();
  } else if (tabName === 'transfers') {
    renderTransfersView();
  } else if (tabName === 'rfq') {
    renderRfqView();
  } else if (tabName === 'movement') {
    renderMovementView();
  } else if (tabName === 'params') {
    renderParamsView();
  } else if (tabName === 'analytics') {
    renderAnalyticsView();
  }
}

// C1: SWITCH ACTIVE WAREHOUSE (SEGMENTED CONTROL & HASH SYNC)
function switchWarehouse(whCode) {
  if (!WAREHOUSES.some(w => w.code === whCode)) return;
  if (!Store.ui) Store.ui = { activeWh: 'HCM' };
  Store.ui.activeWh = whCode;
  try {
    window.location.hash = `#wh=${whCode}`;
  } catch (e) {}
  renderAllViews();
}

// C1: RENDER WAREHOUSE SEGMENTED CONTROL BAR
function renderWarehouseBar() {
  const container = document.getElementById('whSegmentedControl');
  if (!container) return;

  const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
  let html = '';

  WAREHOUSES.forEach(wh => {
    let low = 0;
    let high = 0;
    SKUS.forEach(sku => {
      const st = (Store.stock && Store.stock[wh.code] && Store.stock[wh.code][sku.code])
        ? Store.stock[wh.code][sku.code]
        : { on_hand: 0, in_transit: 0, committed: 0 };
      const p = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
      const eff = st.on_hand + st.in_transit - st.committed;
      const status = getStatus(eff, p);
      if (status === 'LOW') low++;
      else if (status === 'HIGH') high++;
    });

    const isActive = (wh.code === activeWh);
    html += `
      <button class="wh-seg-btn ${isActive ? 'active' : ''}" onclick="switchWarehouse('${wh.code}')" data-wh="${wh.code}">
        <span>${wh.name}</span>
        <div class="wh-badge-group">
          <span class="wh-badge-low" title="Số ô dưới MIN kho này">${low}</span>
          <span class="wh-badge-high" title="Số ô vượt MAX kho này">${high}</span>
        </div>
      </button>
    `;
  });

  container.innerHTML = html;
}

// ----------------------------------------------------------------------------
// 3.3 MASTER RENDER ALL VIEWS
// ----------------------------------------------------------------------------
function renderAllViews() {
  // 1. Header Date Picker & Badges
  const picker = document.getElementById('simDatePicker');
  if (picker) {
    picker.value = Store.currentDate;
    picker.min = Store.currentDate; // Forward-only enforcement
  }

  updateNotificationBadge();

  // C1: Render Warehouse Bar with dynamic badges
  renderWarehouseBar();

  const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
  const whObj = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];

  // 2. Count Active Proposals & Badges for active warehouse (C2)
  const propKeys = Object.keys(Store.proposals);
  const whProposals = propKeys.filter(k => Store.proposals[k].wh === activeWh);
  const badgeRecs = document.getElementById('badge-recs-count');
  if (badgeRecs) {
    badgeRecs.textContent = whProposals.length;
    badgeRecs.style.display = whProposals.length > 0 ? 'inline-block' : 'none';
  }

  const activeTrf = Store.transfers.filter(t => t.status === 'Đang chuyển' && (t.dstWh === activeWh || t.srcWh === activeWh)).length;
  const badgeTrf = document.getElementById('badge-trf-count');
  if (badgeTrf) {
    badgeTrf.textContent = activeTrf;
    badgeTrf.style.display = activeTrf > 0 ? 'inline-block' : 'none';
  }

  const activeRfq = Store.rfqs.filter(r => r.status === 'Đã gửi NCC' && r.wh === activeWh).length;
  const badgeRfq = document.getElementById('badge-rfq-count');
  if (badgeRfq) {
    badgeRfq.textContent = activeRfq;
    badgeRfq.style.display = activeRfq > 0 ? 'inline-block' : 'none';
  }

  // 3. Dashboard Event Banner (Contextual for active warehouse)
  const activeEvt = EVENTS.find(e => Store.currentDate >= e.start && Store.currentDate <= e.end);
  const evtBadge = document.getElementById('eventBadgeWrap');
  const evtTitle = document.getElementById('eventTitle');
  const evtDesc  = document.getElementById('eventDesc');
  const evtImpact = document.getElementById('eventImpact');

  const curM = getMonthFromDate(Store.currentDate);
  const curSm = SI[curM] || 1.0;

  if (activeEvt) {
    if (evtBadge) {
      evtBadge.style.display = 'block';
      evtBadge.innerHTML = `<span class="dot-pill low">${activeEvt.badge || 'Sự kiện đặc biệt'}</span>`;
    }
    const delay = (activeEvt.delayAdd || (activeEvt.applyEvent ? (activeEvt.applyEvent('TLM-045', activeWh).delayAdd) : 0) || 0);
    if (evtTitle) evtTitle.textContent = `${activeEvt.icon || '⚠️'} ${activeEvt.title}`;
    if (evtDesc)  evtDesc.textContent = `${activeEvt.desc} (Thời gian: ${fmtDateVN(activeEvt.start)} - ${fmtDateVN(activeEvt.end)})`;
    if (evtImpact) evtImpact.textContent = `Tác động tại ${whObj.name}: Hệ số cầu x${activeEvt.demandMult} | Độ trễ NCC: +${delay} ngày`;
  } else {
    if (evtBadge) {
      evtBadge.style.display = 'block';
      evtBadge.innerHTML = `<span class="dot-pill neutral">Điều kiện chuẩn</span>`;
    }
    if (evtTitle) evtTitle.textContent = `Tháng ${curM}: Chỉ số mùa vụ Sm = ${curSm} (${whObj.name})`;
    if (evtDesc)  evtDesc.textContent = `Chuỗi cung ứng vận hành bình thường theo mùa vụ tháng ${curM} tại ${whObj.name}.`;
    if (evtImpact) evtImpact.textContent = `Hệ số cầu: 1.00 | Không trễ chuyến`;
  }

  // 4. KPIs OF ACTIVE WAREHOUSE (C2, C4)
  let lowCount = 0;
  let highCount = 0;
  let trappedCap = 0;

  SKUS.forEach(sku => {
    const st = (Store.stock && Store.stock[activeWh] && Store.stock[activeWh][sku.code])
      ? Store.stock[activeWh][sku.code]
      : { on_hand: 0, in_transit: 0, committed: 0 };
    const p = calcSKUParams(sku.code, activeWh, Store.currentDate, Store.history);
    const eff = st.on_hand + st.in_transit - st.committed;
    const status = getStatus(eff, p);

    if (status === 'LOW') lowCount++;
    if (status === 'HIGH') {
      highCount++;
      if (st.on_hand > p.qmax) {
        trappedCap += (st.on_hand - p.qmax) * sku.cogs;
      }
    }
  });

  const kpiLow = document.getElementById('kpi-under-min');
  const kpiHigh = document.getElementById('kpi-over-max');
  const kpiCap = document.getElementById('kpi-trapped-cap');
  const kpiCost = document.getElementById('kpi-cost-diff');

  if (kpiLow)  kpiLow.textContent = lowCount;
  if (kpiHigh) kpiHigh.textContent = highCount;
  if (kpiCap)  kpiCap.textContent = fmtVND(trappedCap);
  if (kpiCost) kpiCost.textContent = fmtVND(Math.round(trappedCap * 0.05));

  // 5. Render active view
  renderDashboardView();
  renderInventoryView();
  switchNavTab(Store.activeTab);
}

// SIMULATION TIME CONTROL
function advanceToDate(targetDate) {
  if (targetDate > Store.endDate) targetDate = Store.endDate;

  // Backward navigation: read-only view of past snapshots
  if (targetDate < Store.currentDate) {
    Store.ui.viewDate = targetDate;
    const picker = document.getElementById('simDatePicker');
    if (picker) picker.value = targetDate;
    showViewModeBanner(targetDate);
    renderAllViews();
    return;
  }

  // Clear view mode if going forward
  if (Store.ui.viewDate) {
    delete Store.ui.viewDate;
    hideViewModeBanner();
  }

  while (Store.currentDate < targetDate) {
    const ok = advanceOneDay();
    if (!ok) break;
  }

  const picker = document.getElementById('simDatePicker');
  if (picker) picker.value = Store.currentDate;

  renderAllViews();
}

function showViewModeBanner(date) {
  let banner = document.getElementById('viewModeBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'viewModeBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#0F172A;color:#F8FAFC;text-align:center;padding:7px 16px;font-size:12px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:14px;border-bottom:1px solid #334155;box-shadow:0 2px 6px rgba(0,0,0,0.15);';
    document.body.appendChild(banner);
  }
  banner.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:6px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
      <strong>Chế độ tra cứu quá khứ:</strong> ${fmtDateVN(date)} (Chỉ đọc — Dữ liệu lịch sử không được phép chỉnh sửa)
    </span>
    <button onclick="returnToPresent()" style="background:#2563EB;color:#FFFFFF;border:none;border-radius:4px;padding:3px 12px;font-size:11.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
      Quay về ngày hiện tại
    </button>
  `;
  document.body.style.paddingTop = '34px';
}

function hideViewModeBanner() {
  const banner = document.getElementById('viewModeBanner');
  if (banner) banner.remove();
  document.body.style.paddingTop = '';
}

function returnToPresent() {
  delete Store.ui.viewDate;
  hideViewModeBanner();
  const picker = document.getElementById('simDatePicker');
  if (picker) picker.value = Store.currentDate;
  renderAllViews();
}

function stepDays(days) {
  const target = addDays(Store.currentDate, days);
  advanceToDate(target);
}

function onManualDateChange(newVal) {
  if (!newVal) return;
  advanceToDate(newVal);
}

let autoPilotTimer = null;
function toggleAutoPilot() {
  Store.autoPilot = !Store.autoPilot;
  const btn = document.getElementById('autoPilotToggle');
  if (Store.autoPilot) {
    if (btn) btn.classList.add('active');
    if (Store.currentDate >= Store.endDate) {
      Store.autoPilot = false;
      if (btn) btn.classList.remove('active');
      showToast('Đã ở ngày kết thúc mô phỏng', 'info');
      return;
    }
    autoPilotTimer = setInterval(() => {
      if (Store.currentDate >= Store.endDate || !Store.autoPilot) {
        clearInterval(autoPilotTimer);
        Store.autoPilot = false;
        if (btn) btn.classList.remove('active');
        renderAllViews();
        return;
      }
      advanceOneDay();
      const picker = document.getElementById('simDatePicker');
      if (picker) {
        picker.value = Store.currentDate;
        picker.min = Store.currentDate;
      }
      renderAllViews();
    }, 700);
  } else {
    if (btn) btn.classList.remove('active');
    if (autoPilotTimer) {
      clearInterval(autoPilotTimer);
      autoPilotTimer = null;
    }
  }
}

// DOM INITIALIZATION (C1: HASH SYNC)
window.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Seeded 12-week history
  Store.history = initSeededHistory();

  // 2. Initialize Day 0 Params for all 55 pairs
  const day0Params = {};
  SKUS.forEach(sku => {
    day0Params[sku.code] = {};
    WAREHOUSES.forEach(wh => {
      day0Params[sku.code][wh.code] = calcSKUParams(sku.code, wh.code, Store.startDate, Store.history);
    });
  });
  Store.baseParams = day0Params;

  // 3. Build Initial Stock with FNV-1a diversity and required overrides
  Store.stock = buildInitialStock();

  // 4. Initialize Weekly Accumulators & Lost Sales
  SKUS.forEach(sku => {
    Store.currentWeekDemand[sku.code] = {};
    WAREHOUSES.forEach(wh => {
      Store.currentWeekDemand[sku.code][wh.code] = 0;
    });
  });

  WAREHOUSES.forEach(wh => {
    Store.lostSales[wh.code] = {};
    SKUS.forEach(sku => {
      Store.lostSales[wh.code][sku.code] = 0;
    });
  });

  // C1: Read location.hash to retain selected warehouse on F5
  if (!Store.ui) Store.ui = { activeWh: 'HCM' };
  if (window.location.hash && window.location.hash.startsWith('#wh=')) {
    const hashWh = window.location.hash.replace('#wh=', '').trim();
    if (WAREHOUSES.some(w => w.code === hashWh)) {
      Store.ui.activeWh = hashWh;
    }
  }
  window.addEventListener('hashchange', () => {
    if (window.location.hash && window.location.hash.startsWith('#wh=')) {
      const hashWh = window.location.hash.replace('#wh=', '').trim();
      if (WAREHOUSES.some(w => w.code === hashWh) && Store.ui.activeWh !== hashWh) {
        switchWarehouse(hashWh);
      }
    }
  });

  // 5. Initial Proposal Scan
  scanAndGenerateProposals(Store.startDate);

  // 6. Record Initial Day 0 Snapshot
  recordDailySnapshot(Store.startDate);

  // 7. Initial Log Entry
  logAction('SYSTEM_INIT', 'ALL', 'Khởi tạo hệ thống SenNova Home IMS v3 thành công với 5 kho x 11 SKU.');

  // 8. Bind Global Modal Click Outside to Close
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });

  // 9. Initial Render
  renderAllViews();

  showToast('Hệ thống SenNova Home IMS sẵn sàng!', 'success');
});

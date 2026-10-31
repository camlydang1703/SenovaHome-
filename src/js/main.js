// ============================================================================
// NAVIGATION, MASTER RENDER, TIME CONTROLS & DOM INITIALIZATION
// ============================================================================

    // 3.2 NAVIGATION & TAB SWITCHING
    // ----------------------------------------------------------------------------
    function switchNavTab(tabName) {
      Store.activeTab = tabName;

      // Update Tab Buttons
      const tabBtns = document.querySelectorAll('.nav-tab');
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

      // 2. Count Active Proposals & Badges
      const propKeys = Object.keys(Store.proposals);
      const badgeRecs = document.getElementById('badge-recs-count');
      if (badgeRecs) {
        badgeRecs.textContent = propKeys.length;
        badgeRecs.style.display = propKeys.length > 0 ? 'inline-block' : 'none';
      }

      const activeTrf = Store.transfers.filter(t => t.status === 'Đang chuyển').length;
      const badgeTrf = document.getElementById('badge-trf-count');
      if (badgeTrf) {
        badgeTrf.textContent = activeTrf;
        badgeTrf.style.display = activeTrf > 0 ? 'inline-block' : 'none';
      }

      const activeRfq = Store.rfqs.filter(r => r.status === 'Đã gửi NCC').length;
      const badgeRfq = document.getElementById('badge-rfq-count');
      if (badgeRfq) {
        badgeRfq.textContent = activeRfq;
        badgeRfq.style.display = activeRfq > 0 ? 'inline-block' : 'none';
      }

      // 3. Dashboard Event Banner
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
        const delay = (activeEvt.delayAdd || (activeEvt.applyEvent ? (activeEvt.applyEvent('TLM-045','HCM').delayAdd || activeEvt.applyEvent('TLM-045','DN').delayAdd) : 0) || 0);
        if (evtTitle) evtTitle.textContent = `${activeEvt.icon || '⚠️'} ${activeEvt.title}`;
        if (evtDesc)  evtDesc.textContent = `${activeEvt.desc} (Thời gian: ${fmtDateVN(activeEvt.start)} - ${fmtDateVN(activeEvt.end)})`;
        if (evtImpact) evtImpact.textContent = `Tác động: Hệ số cầu x${activeEvt.demandMult} | Độ trễ NCC: +${delay} ngày`;
      } else {
        if (evtBadge) {
          evtBadge.style.display = 'block';
          evtBadge.innerHTML = `<span class="dot-pill neutral">Điều kiện chuẩn</span>`;
        }
        if (evtTitle) evtTitle.textContent = `Tháng ${curM}: Chỉ số mùa vụ Sm = ${curSm}`;
        if (evtDesc)  evtDesc.textContent = `Chuỗi cung ứng vận hành bình thường theo mùa vụ tháng ${curM}.`;
        if (evtImpact) evtImpact.textContent = `Hệ số cầu: 1.00 | Không trễ chuyến`;
      }

      // 4. KPIs
      let lowCount = 0;
      let highCount = 0;
      let trappedCap = 0;
      let holdingSaving = 0;

      SKUS.forEach(sku => {
        WAREHOUSES.forEach(wh => {
          const st = Store.stock[wh.code][sku.code];
          const p = calcSKUParams(sku.code, wh.code, Store.currentDate, Store.history);
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
      });

      const kpiLow = document.getElementById('kpi-under-min');
      const kpiHigh = document.getElementById('kpi-over-max');
      const kpiCap = document.getElementById('kpi-trapped-cap');
      const kpiCost = document.getElementById('kpi-cost-diff');

      if (kpiLow)  kpiLow.textContent = lowCount;
      if (kpiHigh) kpiHigh.textContent = highCount;
      if (kpiCap)  kpiCap.textContent = fmtVND(trappedCap);
      if (kpiCost) kpiCost.textContent = fmtVND(Math.round(trappedCap * 0.05));

      // 5. Render currently visible tab
      switchNavTab(Store.activeTab);
    }

    // ----------------------------------------------------------------------------

    function advanceToDate(targetDate) {
      if (targetDate < Store.currentDate) {
        showToast('Không thể quay ngược thời gian! Hệ thống chỉ mô phỏng tiến tới.', 'error');
        const picker = document.getElementById('simDatePicker');
        if (picker) picker.value = Store.currentDate;
        return;
      }
      if (targetDate > Store.endDate) targetDate = Store.endDate;

      while (Store.currentDate < targetDate) {
        const ok = advanceOneDay();
        if (!ok) break;
      }

      const picker = document.getElementById('simDatePicker');
      if (picker) {
        picker.value = Store.currentDate;
        picker.min = Store.currentDate; // Ép chỉ chọn ngày tương lai
      }

      renderAllViews();
    }

    function stepDays(days) {
      const target = addDays(Store.currentDate, days);
      advanceToDate(target);
    }

    function onManualDateChange(newVal) {
      if (!newVal) return;
      if (newVal < Store.currentDate) {
        showToast('Không thể chọn ngày trong quá khứ!', 'error');
        const picker = document.getElementById('simDatePicker');
        if (picker) picker.value = Store.currentDate;
        return;
      }
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

    // ----------------------------------------------------------------------------

    // 3.13 DOM INITIALIZATION & EVENT LISTENERS
    // ----------------------------------------------------------------------------
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

      // 3. Build Initial Stock with FNV-1a diversity and required overrides
      Store.stock = buildInitialStock(day0Params);

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


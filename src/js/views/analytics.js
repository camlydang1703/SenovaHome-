// ============================================================================
// VIEW 7: ANALYTICS & CANVAS CHARTS
// ============================================================================

    // 3.10 VIEW 7: ANALYTICS & CANVAS CHARTS (Yêu cầu 8)
    // ----------------------------------------------------------------------------
    function setupCanvasHiDPI(canvas) {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width) || canvas.parentElement?.clientWidth || 500;
      const h = Math.round(rect.height) || canvas.parentElement?.clientHeight || 220;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx.resetTransform) ctx.resetTransform();
      else ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      return { ctx, w, h };
    }

    function renderAnalyticsView() {
      // 1. Populate SKU Filter dropdown
      const sel = document.getElementById('chartSkuFilter');
      if (sel && sel.children.length === 0) {
        sel.innerHTML = '<option value="ALL">Toàn bộ 11 SKU (Toàn mạng lưới)</option>' +
          SKUS.map(s => `<option value="${s.code}">${s.code} - ${s.name}</option>`).join('');
      }

      drawChartA();
      drawChartB();
      drawChartC();
    }

    // Chart A: Dự báo Nhu cầu vs Tiêu thụ Thực tế
    function drawChartA() {
      const canvas = document.getElementById('chartDemandForecast');
      if (!canvas) return;
      const { ctx, w, h } = setupCanvasHiDPI(canvas);
      ctx.clearRect(0, 0, w, h);

      const activeWh = (Store.ui && Store.ui.activeWh) || 'HCM';
      const whObj = WAREHOUSES.find(w => w.code === activeWh) || WAREHOUSES[0];

      const sel = document.getElementById('chartSkuFilter');
      const selectedSku = sel ? sel.value : 'ALL';

      const pad = { l: 48, r: 18, t: 20, b: 28 };
      const cw = w - pad.l - pad.r;
      const ch = h - pad.t - pad.b;
      if (cw <= 10 || ch <= 10) return;

      // Aggregated 12-week data for active warehouse
      const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12'];
      const actuals = [];
      const forecasts = [];

      for (let wi = 0; wi < 12; wi++) {
        let actSum = 0;
        let fcSum = 0;

        SKUS.forEach(sku => {
          if (selectedSku !== 'ALL' && sku.code !== selectedSku) return;
          const wh = whObj;
          const h = Store.history[sku.code] && Store.history[sku.code][wh.code];
          if (h && h[wi]) {
            actSum += h[wi].demand;
            fcSum  += Math.round(h[wi].deseason * h[wi].sm);
          } else {
            actSum += Math.round(sku.base * wh.w);
            fcSum  += Math.round(sku.base * wh.w * 0.98);
          }
        });

        actuals.push(actSum);
        forecasts.push(fcSum);
      }

      const maxVal = Math.max(...actuals, ...forecasts) * 1.15 || 3000;
      const minVal = 0;

      // Draw Y-Grid
      ctx.strokeStyle = '#F1F5F9';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#64748B';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';

      for (let i = 0; i <= 4; i++) {
        const yVal = minVal + ((maxVal - minVal) / 4) * i;
        const y = pad.t + ch - (ch / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + cw, y);
        ctx.stroke();
        ctx.fillText(fmtNum(Math.round(yVal)), pad.l - 6, y + 3);
      }

      // Draw X labels
      ctx.textAlign = 'center';
      const xStep = cw / (weeks.length - 1);
      weeks.forEach((wk, i) => {
        const x = pad.l + i * xStep;
        ctx.fillText(wk, x, h - 8);
      });

      // Draw Forecast Line (Orange Dashed)
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      forecasts.forEach((f, i) => {
        const x = pad.l + i * xStep;
        const y = pad.t + ch - ((f - minVal) / (maxVal - minVal)) * ch;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw Actual Demand Line (Blue Solid)
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      actuals.forEach((a, i) => {
        const x = pad.l + i * xStep;
        const y = pad.t + ch - ((a - minVal) / (maxVal - minVal)) * ch;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Draw dots
      actuals.forEach((a, i) => {
        const x = pad.l + i * xStep;
        const y = pad.t + ch - ((a - minVal) / (maxVal - minVal)) * ch;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Legend
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#2563EB';
      ctx.fillRect(pad.l + 10, pad.t - 12, 14, 4);
      ctx.fillStyle = '#334155';
      ctx.fillText('Tiêu thụ thực tế', pad.l + 30, pad.t - 8);

      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(pad.l + 130, pad.t - 12, 14, 4);
      ctx.fillStyle = '#334155';
      ctx.fillText('Dự báo AI (F_next)', pad.l + 150, pad.t - 8);
    }

    // Chart B: Tỷ lệ Đáp ứng Dịch vụ theo Kho
    function drawChartB() {
      const canvas = document.getElementById('chartServiceLevel');
      if (!canvas) return;
      const { ctx, w, h } = setupCanvasHiDPI(canvas);
      ctx.clearRect(0, 0, w, h);

      const pad = { l: 40, r: 16, t: 20, b: 28 };
      const cw = w - pad.l - pad.r;
      const ch = h - pad.t - pad.b;
      if (cw <= 10 || ch <= 10) return;

      // Build cumulative demand per warehouse from Store.daily history
      const dailyDates = Object.keys(Store.daily || {}).sort();
      const whCumDemand = {};
      WAREHOUSES.forEach(wh => { whCumDemand[wh.code] = 0; });
      dailyDates.forEach(d => {
        const snap = Store.daily[d];
        if (snap && snap.whDemand) {
          WAREHOUSES.forEach(wh => {
            whCumDemand[wh.code] += snap.whDemand[wh.code] || 0;
          });
        }
      });

      const whRates = WAREHOUSES.map(wh => {
        let totalLost = 0;
        SKUS.forEach(s => {
          totalLost += Store.lostSales[wh.code][s.code] || 0;
        });
        // Use accumulated daily demand if available, else estimate
        const totalSales = whCumDemand[wh.code] > 0
          ? whCumDemand[wh.code]
          : SKUS.reduce((acc, s) => acc + (Store.currentWeekDemand[s.code][wh.code] || (s.base * wh.w)), 0);
        // Compute realistic SL from actual lost vs total demand; clamp 80-100
        const rawSl = totalLost + totalSales > 0
          ? 100 - (totalLost / (totalSales + totalLost)) * 100
          : 99.0;
        const sl = Math.max(80, Math.min(100, rawSl));
        return { wh: wh.code, rate: parseFloat(sl.toFixed(1)) };
      });

      // Grid Y from 80% to 100%
      ctx.strokeStyle = '#F1F5F9';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#64748B';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';

      for (let i = 0; i <= 4; i++) {
        const val = 80 + i * 5;
        const y = pad.t + ch - (ch / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + cw, y);
        ctx.stroke();
        ctx.fillText(val + '%', pad.l - 6, y + 3);
      }

      // Draw Bars FIRST (so benchmark line goes on top)
      const barCount = whRates.length;
      const barW = Math.min(42, (cw / barCount) * 0.55);
      const gap = cw / barCount;

      whRates.forEach((item, i) => {
        const x = pad.l + i * gap + (gap - barW) / 2;
        const barH = Math.max(0, ((item.rate - 80) / 20) * ch);
        const y = pad.t + ch - barH;

        ctx.fillStyle = item.rate >= 95 ? '#059669' : '#F59E0B';
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
        ctx.fill();

        // Label Rate on top
        ctx.fillStyle = '#1E293B';
        ctx.font = 'bold 10.5px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.rate + '%', x + barW / 2, y - 5);

        // Label X Wh code
        ctx.fillStyle = '#64748B';
        ctx.font = '10.5px Inter, sans-serif';
        ctx.fillText(item.wh, x + barW / 2, h - 8);
      });

      // Benchmark Target Line (95%) — drawn AFTER bars so it shows on top
      const targetY = pad.t + ch - ((95 - 80) / 20) * ch;
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, targetY);
      ctx.lineTo(pad.l + cw, targetY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#EF4444';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Mục tiêu SLA: 95%', pad.l + 6, targetY - 5);
    }

    // Chart C: Diễn biến Giá trị Tồn kho & Vốn Ứ đọng
    function drawChartC() {
      const canvas = document.getElementById('chartStockTrajectory');
      if (!canvas) return;
      const { ctx, w, h } = setupCanvasHiDPI(canvas);
      ctx.clearRect(0, 0, w, h);

      const pad = { l: 56, r: 24, t: 24, b: 28 };
      const cw = w - pad.l - pad.r;
      const ch = h - pad.t - pad.b;
      if (cw <= 10 || ch <= 10) return;

      const dates = Object.keys(Store.daily).sort();
      if (dates.length < 2) {
        // Draw single day state or placeholder
        ctx.fillStyle = '#64748B';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Tiến hành mô phỏng các ngày tiếp theo để hiển thị đường xu hướng tích lũy.', w / 2, h / 2);
        return;
      }

      const totalVals = dates.map(d => Store.daily[d].totalStock / 1000000.0); // Triệu VNĐ
      const trapVals  = dates.map(d => Store.daily[d].trappedCap / 1000000.0);

      const maxVal = Math.max(...totalVals) * 1.15 || 5000;
      const minVal = 0;

      // Draw Grid Y
      ctx.strokeStyle = '#F1F5F9';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#64748B';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';

      for (let i = 0; i <= 4; i++) {
        const val = minVal + ((maxVal - minVal) / 4) * i;
        const y = pad.t + ch - (ch / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + cw, y);
        ctx.stroke();
        ctx.fillText(fmtNum(Math.round(val)) + ' tr', pad.l - 6, y + 3);
      }

      const xStep = cw / (dates.length - 1);

      // Draw Total Inventory Curve (Navy)
      ctx.strokeStyle = '#1E3A8A';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      dates.forEach((d, i) => {
        const x = pad.l + i * xStep;
        const y = pad.t + ch - (totalVals[i] / maxVal) * ch;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Draw Trapped Capital Curve (Red)
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      dates.forEach((d, i) => {
        const x = pad.l + i * xStep;
        const y = pad.t + ch - (trapVals[i] / maxVal) * ch;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // X Labels
      ctx.fillStyle = '#64748B';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      const labelInterval = Math.max(1, Math.floor(dates.length / 6));
      dates.forEach((d, i) => {
        if (i % labelInterval === 0 || i === dates.length - 1) {
          const x = pad.l + i * xStep;
          ctx.fillText(fmtDateVN(d).slice(0, 5), x, h - 8);
        }
      });

      // Legend
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1E3A8A';
      ctx.fillRect(pad.l + 10, pad.t - 14, 14, 4);
      ctx.fillStyle = '#334155';
      ctx.fillText('Tổng giá trị tồn kho (Triệu VNĐ)', pad.l + 30, pad.t - 10);

      ctx.fillStyle = '#EF4444';
      ctx.fillRect(pad.l + 210, pad.t - 14, 14, 4);
      ctx.fillStyle = '#334155';
      ctx.fillText('Vốn ứ đọng vượt MAX (Triệu VNĐ)', pad.l + 230, pad.t - 10);
    }

    // ----------------------------------------------------------------------------


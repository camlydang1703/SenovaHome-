// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

    // 1.1 DOC TU CSV_DATABASE (NGUỒN SỰ THẬT TỪ CSV)
    const WAREHOUSES = (typeof CSV_DATABASE !== 'undefined' && CSV_DATABASE.warehouses && CSV_DATABASE.warehouses.length > 0)
      ? CSV_DATABASE.warehouses
      : [
          { code: 'HCM',     name: 'Kho TP. Hồ Chí Minh', region: 'South',   w: 0.35 },
          { code: 'BD',      name: 'Kho Bình Dương',       region: 'South',   w: 0.15 },
          { code: 'DN',      name: 'Kho Đà Nẵng',          region: 'Central', w: 0.12 },
          { code: 'DN_CITY', name: 'Kho Hà Giang',         region: 'North',   w: 0.08 },
          { code: 'HN',      name: 'Kho Hà Nội',           region: 'North',   w: 0.30 }
        ];

    const SKUS = (typeof CSV_DATABASE !== 'undefined' && CSV_DATABASE.products && CSV_DATABASE.products.length > 0)
      ? CSV_DATABASE.products.map(p => ({
          ...p,
          lead: (typeof CSV_DATABASE !== 'undefined' && CSV_DATABASE.suppliers && CSV_DATABASE.suppliers[p.sup])
            ? CSV_DATABASE.suppliers[p.sup].lead
            : (p.code.startsWith('TLM') || p.code === 'TMK-035' ? 7 : (p.code.startsWith('OTK') ? 10 : (p.code === 'PPR-025' ? 14 : (p.code.startsWith('GCH') ? 21 : 5)))),
          delay: (typeof CSV_DATABASE !== 'undefined' && CSV_DATABASE.suppliers && CSV_DATABASE.suppliers[p.sup])
            ? CSV_DATABASE.suppliers[p.sup].delay
            : (p.code.startsWith('TLM') || p.code === 'TMK-035' ? 2 : (p.code.startsWith('OTK') ? 3 : (p.code === 'PPR-025' ? 3 : (p.code.startsWith('GCH') ? 4 : 1)))),
          cat: p.category
        }))
      : [
          { code: 'TLM-045',  name: 'Tôn lạnh màu xanh 0.45mm',    base: 565, cogs: 150000,  price: 185000,  sup: 'SUP-SENVIET',   lead: 7,  delay: 2, cat: 'Tôn thép',   unit: 'tấm',   slow: false },
          { code: 'TLM-040',  name: 'Tôn lạnh màu xanh 0.40mm',    base: 450, cogs: 134000,  price: 165000,  sup: 'SUP-SENVIET',   lead: 7,  delay: 2, cat: 'Tôn thép',   unit: 'tấm',   slow: false },
          { code: 'TMK-035',  name: 'Tôn mạ kẽm 0.35mm',      base: 280, cogs: 106000,  price: 130000,  sup: 'SUP-SENVIET',   lead: 7,  delay: 2, cat: 'Tôn thép',   unit: 'tấm',   slow: false },
          { code: 'OTK-049',  name: 'Ống thép mạ kẽm phi 49',    base: 245, cogs: 270000,  price: 320000,  sup: 'SUP-VIETSTEEL', lead: 10, delay: 3, cat: 'Ống thép',   unit: 'cây',   slow: false },
          { code: 'OTK-060',  name: 'Ống thép mạ kẽm phi 60',    base: 170, cogs: 345000,  price: 410000,  sup: 'SUP-VIETSTEEL', lead: 10, delay: 3, cat: 'Ống thép',   unit: 'cây',   slow: false },
          { code: 'PPR-025',  name: 'Ống PPR phi 25 dài 4m',    base: 395, cogs: 36000,   price: 48000,   sup: 'SUP-LOTUS',     lead: 14, delay: 3, cat: 'Ống nhựa',   unit: 'cây',   slow: false },
          { code: 'GCH-6060', name: 'Gạch men 60x60',         base: 350, cogs: 205000,  price: 260000,  sup: 'SUP-DAIPHAT',   lead: 21, delay: 4, cat: 'Gạch ngói',  unit: 'thùng', slow: false },
          { code: 'SON-18L',  name: 'Sơn nước ngoại thất 18L',     base: 115, cogs: 1150000, price: 1450000, sup: 'SUP-MINHAN',    lead: 5,  delay: 1, cat: 'Sơn & TBVS', unit: 'thùng', slow: false },
          { code: 'GCH-DEC',  name: 'Gạch trang trí 30x60',   base: 15,  cogs: 170000,  price: 220000,  sup: 'SUP-DAIPHAT',   lead: 21, delay: 4, cat: 'Gạch ngói',  unit: 'thùng', slow: true  },
          { code: 'TBV-LAV',  name: 'Chậu lavabo',         base: 12,  cogs: 650000,  price: 850000,  sup: 'SUP-MINHAN',    lead: 5,  delay: 1, cat: 'Sơn & TBVS', unit: 'bộ',    slow: true  },
          { code: 'TBV-VOI',  name: 'Vòi sen cao cấp',        base: 10,  cogs: 480000,  price: 650000,  sup: 'SUP-MINHAN',    lead: 5,  delay: 1, cat: 'Sơn & TBVS', unit: 'bộ',    slow: true  }
        ];

    // SEASONAL INDEX Sm (LẤY TRỰC TIẾP TỪ data/seasonal_parameters.csv)
    const SI = (typeof CSV_DATABASE !== 'undefined' && CSV_DATABASE.seasonal_parameters)
      ? { ...CSV_DATABASE.seasonal_parameters }
      : { 1:1.15, 2:0.60, 3:1.10, 4:1.15, 5:0.90, 6:0.80, 7:0.80, 8:0.85, 9:0.90, 10:1.05, 11:1.20, 12:1.25 };
    SKUS.forEach(s => {
      SI[s.code] = SI;
    });

    // DANH MỤC NHÀ CUNG CẤP & ĐẠI LÝ THEO NGÀNH HÀNG
    const SUPPLIERS = (typeof CSV_DATABASE !== 'undefined' && CSV_DATABASE.suppliers && Object.keys(CSV_DATABASE.suppliers).length > 0)
      ? {
          'SUP-SENVIET':   { code: 'SUP-SENVIET',   name: 'NM Tôn Sen Việt',              cat: 'Tôn thép',   leadDays: 7,  delay: 2, priceMult: 1.0,   freightMult: 1.0 },
          'SUP-HOASEN':    { code: 'SUP-HOASEN',    name: 'Đại lý Tôn Hoa Sen Phía Nam',  cat: 'Tôn thép',   leadDays: 5,  delay: 1, priceMult: 1.025, freightMult: 1.0 },
          'SUP-NAMKIM':    { code: 'SUP-NAMKIM',    name: 'Tôn Nam Kim Miền Trung',       cat: 'Tôn thép',   leadDays: 9,  delay: 3, priceMult: 0.985, freightMult: 1.2 },
          
          'SUP-VIETSTEEL': { code: 'SUP-VIETSTEEL', name: 'NM Ống thép Việt Steel',       cat: 'Ống thép',   leadDays: 10, delay: 3, priceMult: 1.0,   freightMult: 1.0 },
          'SUP-HOAPHAT':   { code: 'SUP-HOAPHAT',   name: 'Đại lý Thép Hòa Phát',         cat: 'Ống thép',   leadDays: 8,  delay: 2, priceMult: 1.02,  freightMult: 1.1 },
          'SUP-VINAPIPE':  { code: 'SUP-VINAPIPE',  name: 'Ống thép Vinapipe',            cat: 'Ống thép',   leadDays: 12, delay: 4, priceMult: 0.99,  freightMult: 1.3 },

          'SUP-LOTUS':     { code: 'SUP-LOTUS',     name: 'Công ty Nhựa Lotus',           cat: 'Ống nhựa',   leadDays: 14, delay: 3, priceMult: 1.0,   freightMult: 1.0 },
          'SUP-TIENPHONG': { code: 'SUP-TIENPHONG', name: 'Đại lý Nhựa Tiền Phong',       cat: 'Ống nhựa',   leadDays: 12, delay: 2, priceMult: 1.03,  freightMult: 1.0 },
          'SUP-BINHMINH':  { code: 'SUP-BINHMINH',  name: 'Nhà PP Nhựa Bình Minh',        cat: 'Ống nhựa',   leadDays: 16, delay: 4, priceMult: 0.98,  freightMult: 1.2 },

          'SUP-DAIPHAT':   { code: 'SUP-DAIPHAT',   name: 'Nhà máy Gạch men Đại Phát',    cat: 'Gạch ngói',  leadDays: 21, delay: 4, priceMult: 1.0,   freightMult: 1.0 },
          'SUP-DONGTAM':   { code: 'SUP-DONGTAM',   name: 'Tổng kho Gạch Đồng Tâm',       cat: 'Gạch ngói',  leadDays: 18, delay: 3, priceMult: 1.04,  freightMult: 1.1 },
          'SUP-VIGLACERA': { code: 'SUP-VIGLACERA', name: 'Gạch men Viglacera Đà Nẵng',   cat: 'Gạch ngói',  leadDays: 24, delay: 5, priceMult: 0.97,  freightMult: 1.3 },

          'SUP-MINHAN':    { code: 'SUP-MINHAN',    name: 'Tổng Cty Sơn & TB Minh An',    cat: 'Sơn & TBVS', leadDays: 5,  delay: 1, priceMult: 1.0,   freightMult: 1.0 },
          'SUP-DULUX':     { code: 'SUP-DULUX',     name: 'Đại lý Dulux Phía Nam',        cat: 'Sơn & TBVS', leadDays: 4,  delay: 1, priceMult: 1.03,  freightMult: 1.0 },
          'SUP-INAX':      { code: 'SUP-INAX',      name: 'Nhà phân phối TBVS Inax VN',   cat: 'Sơn & TBVS', leadDays: 7,  delay: 2, priceMult: 1.05,  freightMult: 1.2 },
          ...CSV_DATABASE.suppliers
        }
      : {
          'SUP-SENVIET':   { code: 'SUP-SENVIET',   name: 'NM Tôn Sen Việt',              cat: 'Tôn thép',   leadDays: 7,  delay: 2, priceMult: 1.0,   freightMult: 1.0 },
          'SUP-HOASEN':    { code: 'SUP-HOASEN',    name: 'Đại lý Tôn Hoa Sen Phía Nam',  cat: 'Tôn thép',   leadDays: 5,  delay: 1, priceMult: 1.025, freightMult: 1.0 },
          'SUP-NAMKIM':    { code: 'SUP-NAMKIM',    name: 'Tôn Nam Kim Miền Trung',       cat: 'Tôn thép',   leadDays: 9,  delay: 3, priceMult: 0.985, freightMult: 1.2 },
          'SUP-VIETSTEEL': { code: 'SUP-VIETSTEEL', name: 'NM Ống thép Việt Steel',       cat: 'Ống thép',   leadDays: 10, delay: 3, priceMult: 1.0,   freightMult: 1.0 },
          'SUP-HOAPHAT':   { code: 'SUP-HOAPHAT',   name: 'Đại lý Thép Hòa Phát',         cat: 'Ống thép',   leadDays: 8,  delay: 2, priceMult: 1.02,  freightMult: 1.1 },
          'SUP-VINAPIPE':  { code: 'SUP-VINAPIPE',  name: 'Ống thép Vinapipe',            cat: 'Ống thép',   leadDays: 12, delay: 4, priceMult: 0.99,  freightMult: 1.3 },
          'SUP-LOTUS':     { code: 'SUP-LOTUS',     name: 'Công ty Nhựa Lotus',           cat: 'Ống nhựa',   leadDays: 14, delay: 3, priceMult: 1.0,   freightMult: 1.0 },
          'SUP-TIENPHONG': { code: 'SUP-TIENPHONG', name: 'Đại lý Nhựa Tiền Phong',       cat: 'Ống nhựa',   leadDays: 12, delay: 2, priceMult: 1.03,  freightMult: 1.0 },
          'SUP-BINHMINH':  { code: 'SUP-BINHMINH',  name: 'Nhà PP Nhựa Bình Minh',        cat: 'Ống nhựa',   leadDays: 16, delay: 4, priceMult: 0.98,  freightMult: 1.2 },
          'SUP-DAIPHAT':   { code: 'SUP-DAIPHAT',   name: 'Nhà máy Gạch men Đại Phát',    cat: 'Gạch ngói',  leadDays: 21, delay: 4, priceMult: 1.0,   freightMult: 1.0 },
          'SUP-DONGTAM':   { code: 'SUP-DONGTAM',   name: 'Tổng kho Gạch Đồng Tâm',       cat: 'Gạch ngói',  leadDays: 18, delay: 3, priceMult: 1.04,  freightMult: 1.1 },
          'SUP-VIGLACERA': { code: 'SUP-VIGLACERA', name: 'Gạch men Viglacera Đà Nẵng',   cat: 'Gạch ngói',  leadDays: 24, delay: 5, priceMult: 0.97,  freightMult: 1.3 },
          'SUP-MINHAN':    { code: 'SUP-MINHAN',    name: 'Tổng Cty Sơn & TB Minh An',    cat: 'Sơn & TBVS', leadDays: 5,  delay: 1, priceMult: 1.0,   freightMult: 1.0 },
          'SUP-DULUX':     { code: 'SUP-DULUX',     name: 'Đại lý Dulux Phía Nam',        cat: 'Sơn & TBVS', leadDays: 4,  delay: 1, priceMult: 1.03,  freightMult: 1.0 },
          'SUP-INAX':      { code: 'SUP-INAX',      name: 'Nhà phân phối TBVS Inax VN',   cat: 'Sơn & TBVS', leadDays: 7,  delay: 2, priceMult: 1.05,  freightMult: 1.2 }
        };

    // ITEM FREIGHT MULTIPLIERS (Phụ phí theo tính chất cồng kềnh/nặng)
    const ITEM_FREIGHT_MULT = {
      'TLM-045': 1.0, 'TLM-040': 1.0, 'TMK-035': 1.0,
      'OTK-049': 1.2, 'OTK-060': 1.2,
      'PPR-025': 0.4,
      'GCH-6060': 1.2, 'GCH-DEC': 1.2,
      'SON-18L': 0.8,
      'TBV-LAV': 0.6, 'TBV-VOI': 0.6
    };

    // 1.2 & 1.3 LƯỢC ĐỒ VÀ BẢNG SỰ KIỆN TỪ CSV_DATABASE.events
    function isEventMatchingTarget(evtTarget, skuCode, skuCat, skuSup) {
      if (!evtTarget || evtTarget === 'ALL') return true;
      const targets = evtTarget.split(',').map(s => s.trim());
      for (const t of targets) {
        if (t === skuCode) return true;
        if (t.startsWith('cat:') && skuCat && t.substring(4) === skuCat) return true;
        if (t.startsWith('sup:') && skuSup && t.substring(4) === skuSup) return true;
      }
      return false;
    }

    function isEventMatchingWarehouse(evtWh, whCode) {
      if (!evtWh || evtWh === 'ALL') return true;
      const whs = evtWh.split(',').map(s => s.trim());
      return whs.includes(whCode);
    }

    // Engine hỗ trợ 4 loại tác động: demand_mult, delay_days, fill_rate, price_mult
    function getCellEventImpact(skuCode, whCode, curDate) {
      const sku = SKUS.find(s => s.code === skuCode) || { category: '', sup: '' };
      let demandMult = 1.0;
      let supplyDelay = 0;
      let transferDelay = 0;
      let fillRate = 1.0;
      let priceMult = 1.0;
      const matchedEvents = [];

      EVENTS.forEach(ev => {
        if (curDate >= ev.start && curDate <= ev.end) {
          const matchWh = isEventMatchingWarehouse(ev.scope_wh, whCode);
          const matchTarget = isEventMatchingTarget(ev.scope_target, skuCode, sku.cat || sku.category, sku.sup);
          if (matchWh && matchTarget) {
            matchedEvents.push(ev);
            if (ev.demand_mult !== undefined && ev.demand_mult !== null) {
              demandMult *= ev.demand_mult;
            }
            if (ev.delay_days && ev.delay_days > 0) {
              if (ev.delay_scope === 'SUPPLY' || ev.delay_scope === 'BOTH') {
                supplyDelay += ev.delay_days;
              }
              if (ev.delay_scope === 'TRANSFER' || ev.delay_scope === 'BOTH') {
                transferDelay += ev.delay_days;
              }
            }
            if (ev.fill_rate !== undefined && ev.fill_rate !== null) {
              fillRate *= ev.fill_rate;
            }
            if (ev.price_mult !== undefined && ev.price_mult !== null) {
              priceMult *= ev.price_mult;
            }
          }
        }
      });

      return {
        demandMult: demandMult,
        supplyDelay: supplyDelay,
        transferDelay: transferDelay,
        fillRate: fillRate,
        priceMult: priceMult,
        events: matchedEvents
      };
    }

    const EVENTS = (typeof CSV_DATABASE !== 'undefined' && CSV_DATABASE.events && CSV_DATABASE.events.length > 0)
      ? CSV_DATABASE.events.map(ev => ({
          ...ev,
          badge: ev.demand_mult !== 1.0
            ? `Cầu x${ev.demand_mult}`
            : (ev.delay_days > 0
                ? `Trễ +${ev.delay_days}`
                : (ev.fill_rate < 1.0
                    ? `Giao ${Math.round(ev.fill_rate * 100)}%`
                    : `Giá x${ev.price_mult}`)),
          applyEvent: (sku, wh) => {
            const skuObj = SKUS.find(s => s.code === sku) || {};
            const matchWh = isEventMatchingWarehouse(ev.scope_wh, wh);
            const matchTarget = isEventMatchingTarget(ev.scope_target, sku, skuObj.cat || skuObj.category, skuObj.sup);
            if (matchWh && matchTarget) {
              return {
                demandMult: ev.demand_mult || 1.0,
                delayAdd: (ev.delay_scope === 'SUPPLY' || ev.delay_scope === 'BOTH') ? (ev.delay_days || 0) : 0,
                transferDelayAdd: (ev.delay_scope === 'TRANSFER' || ev.delay_scope === 'BOTH') ? (ev.delay_days || 0) : 0,
                fillRate: ev.fill_rate || 1.0,
                priceMult: ev.price_mult || 1.0
              };
            }
            return { demandMult: 1.0, delayAdd: 0, transferDelayAdd: 0, fillRate: 1.0, priceMult: 1.0 };
          }
        }))
      : [];


    // CENTRAL PARAMS (YÊU CẦU 4.7)
    const PARAMS = {
      z: 1.65,
      holdingRate: 0.20,
      H: 0.20,
      orderCostFixed: 500000,
      dailyHoldingWaitRate: 0.0005,
      slowMovingWeeks: 30,
      DOW: [0.45, 1.10, 1.08, 1.05, 1.05, 1.10, 1.17] // CN=0, T2=1, ..., T7=6
    };


    const Store = {
      startDate: '2026-08-01',
      endDate: '2026-10-23',
      currentDate: '2026-08-01',
      autoPilot: false,
      activeTab: 'dashboard',
      ui: {
        activeWh: 'HCM'
      },

      // Seeded history 12 weeks: history[sku][wh] = [{ demand, sm, deseason }]
      history: {},
      baseParams: {},

      // Stock structure: stock[wh][sku] = { on_hand, in_transit, committed }
      stock: {},

      // Weekly accumulator
      currentWeekDemand: {},

      // Simulation trackers
      lostSales: {}, // [wh][sku]
      dailySales: {}, // date -> { total, bySku }
      daily: {},      // date -> { revenue, lostSales, totalStock, trappedCap, statusByWh }

      // Proposals currently pending: { [key]: proposalObj }
      proposals: {},
      dxIds: {}, // Yêu cầu 0.3: Map `${sku}-${wh}` -> dxId cố định

      // Notifications: [{ id, date, type, refId, text, read }] (Yêu cầu 5.1)
      notifications: [],
      lastStatusMap: {}, // [wh_sku] -> 'LOW' | 'OK' | 'HIGH'

      // Real transaction records
      actions: [],     // Audit logs
      transfers: [],   // Internal transfer orders
      rfqs: [],        // Quotation requests sent to suppliers
      promotions: [],  // Overstock promotional discounts

      // Sequential IDs (TR-0001, RFQ-0001, KM-0001, DX-0001)
      seq: { dx: 1, tr: 1, rfq: 1, km: 1, act: 1, notif: 1 },

      _ledgerWarned: false
    };



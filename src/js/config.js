// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

    const WAREHOUSES = [
      { code: 'HCM',     name: 'Kho TP. Hồ Chí Minh', region: 'South',   w: 0.30 },
      { code: 'BD',      name: 'Kho Bình Dương',       region: 'South',   w: 0.20 },
      { code: 'DN',      name: 'Kho Tổng Đà Nẵng',    region: 'Central', w: 0.12 },
      { code: 'DN_CITY', name: 'Kho Nội Thành Đà Nẵng', region: 'Central', w: 0.08 },
      { code: 'HN',      name: 'Kho Hà Nội',           region: 'North',   w: 0.30 }
    ];

    const SKUS = [
      { code: 'TLM-045',  name: 'Tôn lạnh màu 0.45mm',    base: 565, cogs: 150000,  price: 185000,  sup: 'SUP-SENVIET',   lead: 7,  delay: 2, cat: 'Tôn thép',   unit: 'tấm',   slow: false },
      { code: 'TLM-040',  name: 'Tôn lạnh màu 0.40mm',    base: 450, cogs: 134000,  price: 165000,  sup: 'SUP-SENVIET',   lead: 7,  delay: 2, cat: 'Tôn thép',   unit: 'tấm',   slow: false },
      { code: 'TMK-035',  name: 'Tôn mạ kẽm 0.35mm',      base: 280, cogs: 106000,  price: 130000,  sup: 'SUP-SENVIET',   lead: 7,  delay: 2, cat: 'Tôn thép',   unit: 'tấm',   slow: false },
      { code: 'OTK-049',  name: 'Ống thép mạ kẽm Ø49',    base: 245, cogs: 270000,  price: 320000,  sup: 'SUP-VIETSTEEL', lead: 10, delay: 3, cat: 'Ống thép',   unit: 'cây',   slow: false },
      { code: 'OTK-060',  name: 'Ống thép mạ kẽm Ø60',    base: 170, cogs: 345000,  price: 410000,  sup: 'SUP-VIETSTEEL', lead: 10, delay: 3, cat: 'Ống thép',   unit: 'cây',   slow: false },
      { code: 'PPR-025',  name: 'Ống nhựa PPR Ø25 4m',    base: 395, cogs: 36000,   price: 48000,   sup: 'SUP-LOTUS',     lead: 14, delay: 3, cat: 'Ống nhựa',   unit: 'cây',   slow: false },
      { code: 'GCH-6060', name: 'Gạch men 60x60',         base: 350, cogs: 205000,  price: 260000,  sup: 'SUP-DAIPHAT',   lead: 21, delay: 4, cat: 'Gạch ngói',  unit: 'thùng', slow: false },
      { code: 'SON-18L',  name: 'Sơn ngoại thất 18L',     base: 115, cogs: 1150000, price: 1450000, sup: 'SUP-MINHAN',    lead: 5,  delay: 1, cat: 'Sơn & TBVS', unit: 'thùng', slow: false },
      { code: 'GCH-DEC',  name: 'Gạch trang trí 30x60',   base: 15,  cogs: 170000,  price: 220000,  sup: 'SUP-DAIPHAT',   lead: 21, delay: 4, cat: 'Gạch ngói',  unit: 'thùng', slow: true  },
      { code: 'TBV-LAV',  name: 'Chậu lavabo sứ',         base: 12,  cogs: 650000,  price: 850000,  sup: 'SUP-MINHAN',    lead: 5,  delay: 1, cat: 'Sơn & TBVS', unit: 'bộ',    slow: true  },
      { code: 'TBV-VOI',  name: 'Vòi sen cao cấp',        base: 10,  cogs: 480000,  price: 650000,  sup: 'SUP-MINHAN',    lead: 5,  delay: 1, cat: 'Sơn & TBVS', unit: 'bộ',    slow: true  }
    ];

    // SEASONAL INDEX Sm (BÁO CÁO GỐC - SI TRUNG BÌNH = 0.979)
    const SI = { 1:1.15, 2:0.60, 3:1.10, 4:1.15, 5:0.90, 6:0.80, 7:0.80, 8:0.85, 9:0.90, 10:1.05, 11:1.20, 12:1.25 };
    // Allow SKU-level access fallback so SI['TLM-045'][8] or SI[8] both work reliably
    SKUS.forEach(s => {
      SI[s.code] = SI;
    });

    // DANH MỤC NHÀ CUNG CẤP & ĐẠI LÝ THEO NGÀNH HÀNG
    const SUPPLIERS = {
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
      'SUP-INAX':      { code: 'SUP-INAX',      name: 'Nhà phân phối TBVS Inax VN',   cat: 'Sơn & TBVS', leadDays: 7,  delay: 2, priceMult: 0.99,  freightMult: 1.2 }
    };

    // ITEM MULTIPLIERS FOR FREIGHT
    const ITEM_FREIGHT_MULT = {
      'TLM-045': 1.0, 'TLM-040': 1.0, 'TMK-035': 1.0,
      'OTK-049': 1.2, 'OTK-060': 1.2,
      'PPR-025': 0.4,
      'GCH-6060': 1.2, 'GCH-DEC': 1.2,
      'SON-18L': 0.8,
      'TBV-LAV': 0.6, 'TBV-VOI': 0.6
    };


    const EVENTS = [
      {
        id: 'EVT-PEAK-AUG',
        start: '2026-08-14',
        end: '2026-08-19',
        badge: 'Cầu VLXD +35%',
        badgeClass: 'danger',
        title: 'Đợt kích cầu xây dựng hè thu: Nhu cầu toàn mạng lưới tăng +35%',
        desc: 'Nhu cầu thị trường tăng đột biến trong đợt khởi động dự án xây dựng quý 3.',
        demandMult: 1.35,
        applyEvent: (sku, wh) => ({ demandMult: 1.35, delayAdd: 0 })
      },
      {
        id: 'EVT-SENVIET-DELAY',
        start: '2026-08-18',
        end: '2026-08-20',
        badge: 'Sen Việt trễ +2 ngày',
        badgeClass: 'warning',
        title: 'NM Tôn Sen Việt bảo trì dây chuyền cán: Giao trễ +2 ngày',
        desc: 'SUP-SENVIET thông báo chậm giao hàng do đại tu máy móc.',
        demandMult: 1.0,
        applyEvent: (sku, wh) => {
          const isSenViet = (sku === 'TLM-045' || sku === 'TLM-040' || sku === 'TMK-035');
          return { demandMult: 1.0, delayAdd: isSenViet ? 2 : 0 };
        }
      },
      {
        id: 'EVT-CENTRAL-STORM',
        start: '2026-09-01',
        end: '2026-09-08',
        badge: 'Bão Miền Trung +5 ngày trễ',
        badgeClass: 'danger',
        title: 'Bão lũ ven biển Miền Trung: Vận chuyển vào DN / DN_CITY trễ +5 ngày',
        desc: 'Mưa lũ ngập Quốc lộ 1A và đèo Hải Vân. Các tuyến vận chuyển vào Đà Nẵng bị gián đoạn.',
        demandMult: 1.0,
        applyEvent: (sku, wh) => {
          const isCentral = (wh === 'DN' || wh === 'DN_CITY');
          return { demandMult: 1.0, delayAdd: isCentral ? 5 : 0 };
        }
      }
    ];

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

      // Seeded history 12 weeks: history[sku][wh] = [{ demand, sm, deseason }]
      history: {},

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



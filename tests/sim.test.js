/**
 * SenNova Home IMS - 84-Day Headless Simulation Test
 * Runs in Node.js with simulated Store environment (zero DOM dependencies)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock browser globals needed by modules
global.window = {};
global.document = {
  getElementById: () => null,
  querySelectorAll: () => []
};

// Load engine modules in order
const modules = [
  '../src/js/csv_data.js',
  '../src/js/config.js',
  '../src/js/rng.js',
  '../src/js/forecast.js',
  '../src/js/transfers.js',
  '../src/js/rfq.js',
  '../src/js/notifications.js',
  '../src/js/simulation.js',
  '../src/js/proposals.js'
];

modules.forEach(m => {
  const code = fs.readFileSync(path.join(__dirname, m), 'utf8');
  vm.runInThisContext(code, { filename: m });
});

console.log('--- SENNOVA IMS 84-DAY SIMULATION TEST ---');

// 1. Initialize
Store.history = initSeededHistory();
Store.stock = buildInitialStock();
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
scanAndGenerateProposals(Store.startDate);
recordDailySnapshot(Store.startDate);

console.log(`Initial date: ${Store.startDate}`);

let daysCount = 0;
let negativeStockErrors = 0;
let missingGroupCombos = 0;
let identicalToPrevCount = 0;
let identicalBetweenWhCount = 0;

let prevDayStock = null;

while (Store.currentDate < Store.endDate) {
  const ok = advanceOneDay();
  if (!ok) break;
  daysCount++;

  const curDate = Store.currentDate;

  // Check 1: Non-negative stock
  WAREHOUSES.forEach(wh => {
    SKUS.forEach(sku => {
      if (Store.stock[wh.code][sku.code].on_hand < 0) {
        negativeStockErrors++;
      }
    });
  });

  // Check 2: 3-group presence in all warehouses
  WAREHOUSES.forEach(wh => {
    let low = 0, ok = 0, high = 0;
    SKUS.forEach(sku => {
      const p = calcSKUParams(sku.code, wh.code, curDate, Store.history);
      const st = Store.stock[wh.code][sku.code];
      const eff = st.on_hand + st.in_transit - st.committed;
      const status = getStatus(eff, p);
      if (status === 'LOW') low++;
      else if (status === 'HIGH') high++;
      else ok++;
    });
    if (low === 0 || ok === 0 || high === 0) {
      missingGroupCombos++;
    }
  });

  // Check 3: Not identical to previous day
  if (prevDayStock) {
    WAREHOUSES.forEach(wh => {
      let identical = true;
      SKUS.forEach(sku => {
        if (Store.stock[wh.code][sku.code].on_hand !== prevDayStock[wh.code][sku.code]) {
          identical = false;
        }
      });
      if (identical) identicalToPrevCount++;
    });
  }

  // Check 4: Between warehouses diversity on same day
  for (let i = 0; i < WAREHOUSES.length; i++) {
    for (let j = i + 1; j < WAREHOUSES.length; j++) {
      let identical = true;
      SKUS.forEach(sku => {
        if (Store.stock[WAREHOUSES[i].code][sku.code].on_hand !== Store.stock[WAREHOUSES[j].code][sku.code].on_hand) {
          identical = false;
        }
      });
      if (identical) identicalBetweenWhCount++;
    }
  }

  // Save copy for next day comparison
  prevDayStock = {};
  WAREHOUSES.forEach(wh => {
    prevDayStock[wh.code] = {};
    SKUS.forEach(sku => {
      prevDayStock[wh.code][sku.code] = Store.stock[wh.code][sku.code].on_hand;
    });
  });
}

console.log(`\nSimulation ended on: ${Store.currentDate} (${daysCount} days advanced)`);
console.log(`Negative stock errors: ${negativeStockErrors}`);
console.log(`Missing group combos: ${missingGroupCombos} / 415`);
console.log(`Identical to prev day warehouse instances: ${identicalToPrevCount}`);
console.log(`Identical warehouse pairs: ${identicalBetweenWhCount}`);

const passed = (negativeStockErrors === 0 && daysCount === 83);
console.log(`\nResult: ${passed ? 'PASSED ALL CHECKS' : 'FAILED'}`);
process.exit(passed ? 0 : 1);

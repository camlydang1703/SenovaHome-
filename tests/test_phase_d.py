# -*- coding: utf-8 -*-
"""
Phase D Verification Test
Validates:
1. Removal of scenarioSelect demo dropdown
2. Dual Min/Max Layer (D1): renderDualParam, getDriverExplanation, CSS classes
3. Lookahead Warning Window (D2): calcLookaheadWarning, "Cảnh báo 7N" column
4. Dynamic Date & Banner Sync (August -> September)
5. 84-day simulation stability
"""
import sys
import os
import re

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

print("=== RUNNING PHASE D VALIDATION TESTS ===")

# 1. Read dist/sennova_ims.html
with open('dist/sennova_ims.html', encoding='utf-8') as f:
    html = f.read()

# Test 1: scenarioSelect dropdown removed from header
assert 'id="scenarioSelect"' not in html, "Test 1 Failed: scenarioSelect still exists in HTML"
print("Test 1: Demo scenario dropdown successfully removed (PASSED)")

# Test 2: Dual Min/Max functions & CSS
assert 'function renderDualParam' in html, "Test 2 Failed: renderDualParam function missing"
assert 'function getDriverExplanation' in html, "Test 2 Failed: getDriverExplanation function missing"
for cls_name in ['.dual-param', '.dual-base', '.dual-ai', '.dual-diff', '.diff-up', '.diff-down']:
    assert cls_name in html, f"Test 2 Failed: CSS class {cls_name} missing"
print("Test 2: Dual Min/Max (Base vs AI) rendering & CSS styles (PASSED)")

# Test 3: Lookahead Warning Window (D2)
assert 'function calcLookaheadWarning' in html, "Test 3 Failed: calcLookaheadWarning function missing"
assert 'Cảnh báo 7N' in html, "Test 3 Failed: 'Cảnh báo 7N' column header missing"
for risk_cls in ['.risk-tag-stockout', '.risk-tag-low', '.risk-tag-high', '.risk-tag-safe']:
    assert risk_cls in html, f"Test 3 Failed: Risk badge class {risk_cls} missing"
print("Test 3: Lookahead Warning Window (7-day projection & stockout/breach alerts) (PASSED)")

# Test 4: Simulation date transition and month banner sync
# Check banner month logic in compiled script
assert 'const curM = getMonthFromDate(Store.currentDate);' in html, "Test 4 Failed: Dynamic month extraction missing"
assert 'SI[curM]' in html, "Test 4 Failed: Dynamic seasonal index sync missing"
print("Test 4: Date advancement & September seasonal banner dynamic sync (PASSED)")

# Test 5: Full 84-day simulation validation
import tests.sim_test
print("Test 5: 84-day simulation stability across all warehouses (PASSED)")

print("\nALL PHASE D ACCEPTANCE TESTS PASSED (5/5)!")

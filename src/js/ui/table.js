// ============================================================================
// UI TABLE HELPERS
// ============================================================================

function renderGenericTable(tbodyId, rowsHtml, emptyMsg = 'Không có dữ liệu.') {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!rowsHtml || rowsHtml.trim() === '') {
    tbody.innerHTML = `<tr><td colspan="20" style="text-align:center;padding:24px;color:var(--text-muted);">${emptyMsg}</td></tr>`;
  } else {
    tbody.innerHTML = rowsHtml;
  }
}

// ============================================================================
// UI TABLE RENDERER - GUARANTEES PERFECT COLUMN ALIGNMENT (B1)
// ============================================================================

/**
 * Renders both table header (thead) and rows (tbody) from a unified column specification.
 * Eliminates column misalignment by deriving both <th> and <td> from the exact same schema.
 * 
 * @param {Object} options
 * @param {string} [options.tableId] - Optional container <table> ID
 * @param {string} [options.theadId] - ID of <thead> element
 * @param {string} options.tbodyId - ID of <tbody> element
 * @param {Array<Object>} options.columns - Array of column definitions: { key, header, align, width, render(row, idx) }
 * @param {Array<Object>} options.rows - Array of data rows
 * @param {string} [options.emptyMsg] - Message to display when rows is empty
 */
// Dòng được mở từ thông báo: tô sáng ~10 giây
function highlightRowAttrs(key) {
  const h = (typeof Store !== 'undefined' && Store.ui) ? Store.ui.highlight : null;
  return (h && key && h.ref === key && Date.now() - h.ts < 10000) ? 'id="hl-row" class="row-highlight"' : '';
}

function renderTable({ tableId, theadId, tbodyId, columns, rows, rowAttrs, emptyMsg = 'Không tìm thấy dữ liệu phù hợp.' }) {
  let theadEl = theadId ? document.getElementById(theadId) : null;
  let tbodyEl = tbodyId ? document.getElementById(tbodyId) : null;

  if (tableId) {
    const tbl = document.getElementById(tableId);
    if (tbl) {
      if (!theadEl) theadEl = tbl.querySelector('thead');
      if (!tbodyEl) tbodyEl = tbl.querySelector('tbody');
    }
  }

  // 1. Render thead
  if (theadEl && columns && columns.length > 0) {
    let theadHtml = '<tr>';
    columns.forEach(col => {
      const classes = [];
      const styles = [];
      if (col.align === 'right' || col.align === 'num') {
        classes.push('num-col');
      } else if (col.align === 'center') {
        styles.push('text-align:center;');
      }
      if (col.headerStyle) styles.push(col.headerStyle);
      if (col.width) styles.push(`width:${col.width};`);
      const attrStr = (classes.length ? ' class="' + classes.join(' ') + '"' : '') +
                      (styles.length ? ' style="' + styles.join('') + '"' : '');
      theadHtml += `<th${attrStr}>${col.header}</th>`;
    });
    theadHtml += '</tr>';
    theadEl.innerHTML = theadHtml;
  }

  // 2. Render tbody
  if (!tbodyEl) return;

  if (!rows || rows.length === 0) {
    const colCount = columns ? columns.length : 10;
    tbodyEl.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;padding:24px;color:var(--text-muted);font-size:12.5px;">${emptyMsg}</td></tr>`;
    return;
  }

  let tbodyHtml = '';
  rows.forEach((row, rowIdx) => {
    const ra = rowAttrs ? rowAttrs(row) : '';
    tbodyHtml += ra ? `<tr ${ra}>` : '<tr>';
    columns.forEach(col => {
      const classes = [];
      const styles = [];
      if (col.align === 'right' || col.align === 'num') {
        classes.push('num-col');
      } else if (col.align === 'center') {
        styles.push('text-align:center;');
      }
      if (col.tdStyle) styles.push(col.tdStyle);
      const attrStr = (classes.length ? ' class="' + classes.join(' ') + '"' : '') +
                      (styles.length ? ' style="' + styles.join('') + '"' : '');
      const cellContent = col.render ? col.render(row, rowIdx) : (row[col.key] !== undefined ? row[col.key] : '');
      tbodyHtml += `<td${attrStr}>${cellContent}</td>`;
    });
    tbodyHtml += '</tr>';
  });
  tbodyEl.innerHTML = tbodyHtml;
}

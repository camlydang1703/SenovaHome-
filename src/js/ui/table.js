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
function renderTable({ tableId, theadId, tbodyId, columns, rows, emptyMsg = 'Không tìm thấy dữ liệu phù hợp.' }) {
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
      let attrs = [];
      if (col.align === 'right' || col.align === 'num') {
        attrs.push('class="num-col"');
      } else if (col.align === 'center') {
        attrs.push('style="text-align:center;"');
      }
      if (col.headerStyle) {
        attrs.push(`style="${col.headerStyle}"`);
      } else if (col.width) {
        attrs.push(`style="width:${col.width};"`);
      }
      const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
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
    tbodyHtml += '<tr>';
    columns.forEach(col => {
      let tdAttrs = [];
      if (col.align === 'right' || col.align === 'num') {
        tdAttrs.push('class="num-col"');
      } else if (col.align === 'center') {
        tdAttrs.push('style="text-align:center;"');
      }
      if (col.tdStyle) {
        tdAttrs.push(`style="${col.tdStyle}"`);
      }
      const attrStr = tdAttrs.length > 0 ? ' ' + tdAttrs.join(' ') : '';
      const cellContent = col.render ? col.render(row, rowIdx) : (row[col.key] !== undefined ? row[col.key] : '');
      tbodyHtml += `<td${attrStr}>${cellContent}</td>`;
    });
    tbodyHtml += '</tr>';
  });
  tbodyEl.innerHTML = tbodyHtml;
}

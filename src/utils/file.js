/* File import/export — CSV parsing (from the original LeafPulse importer),
   XLSX/XLS via SheetJS, and CSV/Excel export. */
(function(){
  function detectDelimiter(headerLine){
    let best = ',', bestCount = -1;
    [',', ';', '\t'].forEach(d => { const c = headerLine.split(d).length; if (c > bestCount){ bestCount = c; best = d; } });
    return best;
  }
  function parseCSV(text){
    text = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const nl = text.indexOf('\n');
    const delim = detectDelimiter(text.slice(0, nl > -1 ? nl : text.length));
    const rows = []; let row = []; let field = ''; let q = false;
    for (let i = 0; i < text.length; i++){
      const c = text[i];
      if (q){ if (c === '"'){ if (text[i+1] === '"'){ field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === delim){ row.push(field); field = ''; }
      else if (c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field.length || row.length){ row.push(field); rows.push(row); }
    return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
  }
  async function readRows(file){
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls'){
      if (!window.XLSX) throw new Error('Excel support could not be loaded. Check your internet connection, or save the file as CSV.');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
        .map(r => r.map(c => String(c == null ? '' : c).trim())).filter(r => r.some(c => c !== ''));
    }
    if (ext !== 'csv' && ext !== 'txt') throw new Error('Unsupported file type. Use CSV, XLSX or XLS.');
    return parseCSV(await file.text());
  }

  function download(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  /* columns: [{label, value:(row)=>any}] */
  function toMatrix(rows, columns){ return [columns.map(c => c.label)].concat(rows.map(r => columns.map(c => { const v = c.value(r); return v == null ? '' : v; }))); }
  function exportCSV(rows, columns, name){
    const esc = (v) => { let s = String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // CSV-injection safe
    const lines = toMatrix(rows, columns).map(r => r.map(esc).join(','));
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }), `${name}_${NL.fmt.ymd(new Date())}.csv`);
  }
  function exportExcel(rows, columns, name){
    if (!window.XLSX){ NL.ui.toast('Excel library unavailable offline — exported CSV instead', 'warn'); return exportCSV(rows, columns, name); }
    const matrix = toMatrix(rows, columns);
    // Mobile / WhatsApp / ID-like values stay text, so Excel never shows 9.88E+09 or drops leading zeros.
    const ws = XLSX.utils.aoa_to_sheet(matrix.map((r, i) => i === 0 ? r : r.map(v => typeof v === 'number' ? v : String(v))));
    // Column widths fitted to content (sampled), header row gets filter arrows.
    ws['!cols'] = columns.map((c, j) => { let w = String(c.label).length; for (let i = 1; i < Math.min(matrix.length, 1000); i++) w = Math.max(w, String(matrix[i][j]).length); return { wch: Math.max(8, Math.min(50, w + 2)) }; });
    if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, String(name).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Export');
    XLSX.writeFile(wb, `${name}_${NL.fmt.ymd(new Date())}.xlsx`);
  }
  function exportData(format, rows, columns, name){
    if (!rows.length){ NL.ui.toast('Nothing to export for the current filters', 'warn'); return; }
    (format === 'xlsx' ? exportExcel : exportCSV)(rows, columns, name);
    NL.ui.toast(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`);
  }

  NL.file = { parseCSV, readRows, exportCSV, exportExcel, exportData, download };
})();

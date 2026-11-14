/* Formatting + date-range helpers */
(function(){
  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function toDate(v){ if (!v) return null; const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? null : d; }
  function ymd(d){ d = toDate(d); return d ? `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` : ''; }
  function dateLocalInput(d){ d = toDate(d); return d ? `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; }
  function date(v){ const d = toDate(v); return d ? `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '—'; }
  function time(v){ const d = toDate(v); if (!d) return ''; let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${pad(d.getMinutes())} ${ap}`; }
  function dateTime(v){ const d = toDate(v); return d ? `${date(d)}, ${time(d)}` : '—'; }
  function relative(v){
    const d = toDate(v); if (!d) return '—';
    const diff = Date.now() - d.getTime(); const abs = Math.abs(diff); const fut = diff < 0;
    const m = Math.round(abs / 60000);
    let s;
    if (m < 1) return 'just now';
    if (m < 60) s = m + 'm'; else if (m < 1440) s = Math.round(m / 60) + 'h'; else if (m < 43200) s = Math.round(m / 1440) + 'd'; else return date(d);
    return fut ? 'in ' + s : s + ' ago';
  }
  function duration(sec){ sec = Math.round(sec || 0); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}h ${m}m` : m ? `${m}m ${pad(s)}s` : `${s}s`; }

  const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  function money(n, currency){ const c = currency || (NL.store && NL.store.currency()) || 'INR'; const sym = c === 'INR' ? '₹' : c === 'USD' ? '$' : c + ' '; return sym + inrFmt.format(Math.round(Number(n) || 0)); }
  function compactMoney(n){ n = Number(n) || 0; if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'; if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L'; return money(n); }
  function num(n){ return inrFmt.format(Math.round(Number(n) || 0)); }
  function pct(n, digits){ if (!isFinite(n)) return '0%'; return (Number(n) || 0).toFixed(digits == null ? 1 : digits) + '%'; }
  function ratio(a, b, digits){ return b ? pct(a / b * 100, digits) : '0%'; }
  function bytes(b){ if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
  function initials(name){ return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''); }

  /* Date ranges — returns {from, to} as ISO strings (inclusive from, exclusive to) */
  const RANGE_PRESETS = [
    ['today','Today'],['yesterday','Yesterday'],['last7','Last 7 Days'],['thisWeek','This Week'],['thisMonth','This Month'],
    ['lastMonth','Last Month'],['thisQuarter','This Quarter'],['thisYear','This Year'],['all','All Time'],['custom','Custom Range']
  ];
  function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function range(preset, customFrom, customTo){
    const now = new Date(); const t0 = startOfDay(now); const DAY = 86400000;
    let from, to = new Date(t0.getTime() + DAY);
    switch (preset){
      case 'today': from = t0; break;
      case 'yesterday': from = new Date(t0.getTime() - DAY); to = t0; break;
      case 'last7': from = new Date(t0.getTime() - 6 * DAY); break;
      case 'thisWeek': { const dow = (t0.getDay() + 6) % 7; from = new Date(t0.getTime() - dow * DAY); break; }
      case 'thisMonth': from = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'lastMonth': from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'thisQuarter': from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); break;
      case 'thisYear': from = new Date(now.getFullYear(), 0, 1); break;
      case 'custom': from = customFrom ? startOfDay(customFrom) : new Date(2000, 0, 1); to = customTo ? new Date(startOfDay(customTo).getTime() + DAY) : to; break;
      default: from = new Date(2000, 0, 1);
    }
    return { from: from.toISOString(), to: to.toISOString(), preset };
  }
  function rangeLabel(preset){ const p = RANGE_PRESETS.find(x => x[0] === preset); return p ? p[1] : 'All Time'; }

  NL.fmt = { pad, toDate, ymd, dateLocalInput, date, time, dateTime, relative, duration, money, compactMoney, num, pct, ratio, bytes, initials, range, rangeLabel, RANGE_PRESETS, startOfDay };
})();

/* Lightweight SVG/HTML charts — no external library.
   Palette: validated categorical order (blue, orange, aqua, yellow, magenta,
   green, violet, red), fixed per entity, never cycled by rank. Every mark
   has a hover tooltip; values/labels use text ink, not series colour. */
(function(){
  const { html, raw, toHtml, escape } = NL.util;
  const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  const color = (i) => PALETTE[i % PALETTE.length];

  /* shared tooltip */
  let tip = null;
  function ensureTip(){ if (!tip){ tip = document.createElement('div'); tip.className = 'chart-tip'; tip.hidden = true; document.body.appendChild(tip); } return tip; }
  document.addEventListener('mousemove', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    const el = ensureTip();
    if (!t){ el.hidden = true; return; }
    el.innerHTML = t.getAttribute('data-tip'); el.hidden = false;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.min(window.innerWidth - w - 8, e.clientX + 14) + 'px';
    el.style.top = Math.max(8, e.clientY - h - 12) + 'px';
  });
  const tipAttr = (s) => raw(`data-tip="${escape(String(s))}"`);

  function niceMax(v){ if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function legend(series){ return series.length > 1 ? html`<div class="chart-legend">${series.map((s, i) => html`<span><i style="background:${s.color || color(i)}"></i>${s.name}</span>`)}</div>` : ''; }

  /* Vertical (grouped) bar chart */
  function bars(o){
    const labels = o.labels, series = o.series, H = o.height || 200, W = Math.max(320, labels.length * (series.length * 14 + 14) + 50);
    const pad = { l: 44, r: 8, t: 10, b: 28 }; const ih = H - pad.t - pad.b, iw = W - pad.l - pad.r;
    const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
    const gw = iw / Math.max(1, labels.length); const bw = Math.max(3, Math.min(22, (gw - 6) / series.length - 2));
    const fmt = o.format || NL.fmt.num; const step = Math.ceil(labels.length / 12);
    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => html`<line x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih * (1 - f)}" y2="${pad.t + ih * (1 - f)}" class="grid"/><text x="${pad.l - 6}" y="${pad.t + ih * (1 - f) + 4}" class="axis" text-anchor="end">${o.axisFormat ? o.axisFormat(max * f) : NL.fmt.num(max * f)}</text>`);
    const marks = labels.map((lab, i) => {
      const gx = pad.l + i * gw + (gw - series.length * (bw + 2)) / 2;
      return html`${series.map((s, j) => { const v = s.values[i] || 0; const h = Math.max(v ? 2 : 0, ih * v / max); const x = gx + j * (bw + 2), y = pad.t + ih - h;
        return html`<path d="M${x},${pad.t + ih} V${y + Math.min(4, h)} Q${x},${y} ${x + Math.min(4, bw / 2)},${y} H${x + bw - Math.min(4, bw / 2)} Q${x + bw},${y} ${x + bw},${y + Math.min(4, h)} V${pad.t + ih} Z" fill="${s.color || color(j)}" class="mark"/>
          <rect x="${gx + j * (bw + 2) - 1}" y="${pad.t}" width="${bw + 4}" height="${ih}" fill="transparent" ${tipAttr(`<b>${escape(lab)}</b><br>${escape(s.name)}: ${escape(fmt(v))}`)}/>`; })}
        ${i % step === 0 ? html`<text x="${pad.l + i * gw + gw / 2}" y="${H - 8}" class="axis" text-anchor="middle">${lab}</text>` : ''}`;
    });
    return html`<div class="chart">${legend(series)}<div class="chart-scroll"><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="${o.title || 'Bar chart'}">${grid}<line x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}" class="baseline"/>${marks}</svg></div></div>`;
  }

  /* Line / area chart with per-point hover columns */
  function line(o){
    const labels = o.labels, series = o.series, H = o.height || 200, W = 640;
    const pad = { l: 48, r: 12, t: 12, b: 28 }; const ih = H - pad.t - pad.b, iw = W - pad.l - pad.r;
    const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
    const n = Math.max(1, labels.length - 1); const X = (i) => pad.l + iw * i / n; const Y = (v) => pad.t + ih * (1 - v / max);
    const fmt = o.format || NL.fmt.num; const step = Math.ceil(labels.length / 10);
    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => html`<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(max * f)}" y2="${Y(max * f)}" class="grid"/><text x="${pad.l - 6}" y="${Y(max * f) + 4}" class="axis" text-anchor="end">${o.axisFormat ? o.axisFormat(max * f) : NL.fmt.num(max * f)}</text>`);
    const paths = series.map((s, j) => {
      const pts = s.values.map((v, i) => `${X(i)},${Y(v || 0)}`);
      const c = s.color || color(j);
      return html`${o.area && j === 0 ? html`<path d="M${X(0)},${Y(0)} L${pts.join(' L')} L${X(s.values.length - 1)},${Y(0)} Z" fill="${c}" opacity="0.12"/>` : ''}<polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${labels.length <= 31 ? s.values.map((v, i) => html`<circle cx="${X(i)}" cy="${Y(v || 0)}" r="3" fill="${c}" stroke="var(--surface)" stroke-width="1.5"/>`) : ''}`;
    });
    const cols = labels.map((lab, i) => html`<rect x="${X(i) - iw / n / 2}" y="${pad.t}" width="${Math.max(4, iw / n)}" height="${ih}" fill="transparent" class="hovercol" ${tipAttr(`<b>${escape(lab)}</b>` + series.map((s, j) => `<br><i style="background:${s.color || color(j)}"></i>${escape(s.name)}: ${escape(fmt(s.values[i] || 0))}`).join(''))}/>
      ${i % step === 0 || i === labels.length - 1 ? html`<text x="${X(i)}" y="${H - 8}" class="axis" text-anchor="middle">${lab}</text>` : ''}`);
    return html`<div class="chart">${legend(series)}<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="${o.title || 'Trend chart'}">${grid}<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(0)}" y2="${Y(0)}" class="baseline"/>${paths}${cols}</svg></div>`;
  }

  /* Horizontal bar list (the LeafPulse report bars, upgraded) */
  function hbars(pairs, o){
    o = o || {};
    if (!pairs.length) return html`<div class="muted small pad">No data for this period</div>`;
    const top = Math.max(1, ...pairs.map(p => p[1])); const fmt = o.format || NL.fmt.num;
    return html`<div class="hbars">${pairs.map(([label, val, extra], i) => html`<div class="bar-row" ${tipAttr(`<b>${escape(label)}</b><br>${escape(fmt(val))}${extra ? '<br>' + escape(extra) : ''}`)}>
      <div class="lbl" title="${label}">${label}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(val ? 2 : 0, Math.round(val / top * 100))}%;background:${o.color || (o.multi ? color(i) : 'var(--series-1)')}"></div></div><div class="val">${fmt(val)}</div></div>`)}</div>`;
  }

  /* Donut (conic-gradient, retained from the LeafPulse wallboard) */
  function donut(segs, o){
    o = o || {}; const total = segs.reduce((s, x) => s + x.value, 0); let acc = 0; const stops = [];
    segs.forEach((s, i) => { if (!s.value) return; const a = acc / total * 100, b = (acc + s.value) / total * 100; stops.push(`${s.color || color(i)} ${a}% ${b - 0.4}%`, `var(--surface) ${b - 0.4}% ${b}%`); acc += s.value; });
    const fmt = o.format || NL.fmt.num;
    return html`<div class="donut-row"><div class="donut-wrap" style="width:${o.size || 150}px;height:${o.size || 150}px"><div class="donut" style="background:${total ? raw(`conic-gradient(${stops.join(',')})`) : 'var(--surface-2)'}"></div>
      <div class="donut-hole"><div class="n">${o.center != null ? o.center : fmt(total)}</div><div class="l">${o.centerLabel || 'TOTAL'}</div></div></div>
      <div class="donut-legend">${segs.map((s, i) => html`<div class="donut-legend-item" ${tipAttr(`${escape(s.label)}: ${escape(fmt(s.value))} (${total ? (s.value / total * 100).toFixed(1) : 0}%)`)}><span class="donut-legend-dot" style="background:${s.color || color(i)}"></span><span>${s.label}</span><span class="cnt">${fmt(s.value)}</span></div>`)}</div></div>`;
  }

  /* Admission funnel: count, conversion %, drop-off %, avg time in stage */
  function funnel(f, o){
    o = o || {};
    if (!f || !f.total) return NL.ui.empty({ icon: '🔻', title: 'No leads in this period', text: 'Pick a wider date range to see the admission funnel.' });
    const ramp = ['#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b', '#0d366b', '#0d366b'];
    const hrs = (h) => h == null ? '—' : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`;
    return html`<div class="funnel">
      <div class="funnel-head"><span>Stage</span><span></span><span class="r">Count</span><span class="r">Conv.</span><span class="r">Drop-off</span><span class="r">Avg time</span></div>
      <div class="funnel-line top"><span class="fl-stage"><b>Lead</b></span><span class="fl-bar"><span style="width:100%;background:#86b6ef"></span></span><span class="r num"><b>${NL.fmt.num(f.total)}</b></span><span class="r num">100%</span><span class="r num muted">—</span><span class="r muted">—</span></div>
      ${f.rows.map((r, i) => html`<div class="funnel-line ${o.clickable ? 'clickable' : ''}" data-stage="${r.stage}" ${tipAttr(`<b>${escape(r.stage)}</b><br>${NL.fmt.num(r.count)} leads · ${r.conversion.toFixed(1)}% of total<br>Drop-off from previous: ${r.dropOff.toFixed(1)}%`)}>
        <span class="fl-stage">${r.stage}</span><span class="fl-bar"><span style="width:${Math.max(r.count ? 1.5 : 0, r.conversion)}%;background:${ramp[i]}"></span></span>
        <span class="r num"><b>${NL.fmt.num(r.count)}</b></span><span class="r num">${NL.fmt.pct(r.conversion)}</span><span class="r num ${r.dropOff > 40 ? 'neg' : 'muted'}">${i === 0 ? '—' : NL.fmt.pct(r.dropOff)}</span><span class="r num muted">${hrs(r.avgHours)}</span></div>`)}
      ${f.negative && f.negative.some(n => n.count) ? html`<div class="funnel-neg"><span class="muted small">Exited:</span>${f.negative.filter(n => n.count).map(n => html`<span class="badge b-red">${n.stage} · ${n.count}</span>`)}</div>` : ''}
    </div>`;
  }

  /* Progress meter for target vs achievement */
  function meter(value, target, label){
    const pct = target ? Math.min(100, value / target * 100) : 0; const cls = pct >= 100 ? 'good' : pct >= 60 ? 'mid' : 'low';
    return html`<div class="meter" ${tipAttr(`${escape(label || '')} ${value} / ${target} (${target ? (value / target * 100).toFixed(0) : 0}%)`)}><div class="meter-top"><span>${label || ''}</span><span class="num"><b>${NL.fmt.num(value)}</b> / ${NL.fmt.num(target)}</span></div><div class="meter-track"><span class="${cls}" style="width:${pct}%"></span></div></div>`;
  }

  NL.charts = { PALETTE, color, bars, line, hbars, donut, funnel, meter };
})();

/* Presentation widgets shared by pages. */
(function(){
  const { html, raw } = NL.util;

  function pageHead(o){
    return html`<div class="page-head">
      <div><h1>${o.title}</h1>${o.sub ? html`<div class="sub">${o.sub}</div>` : ''}</div>
      <div class="page-actions">${(o.actions || []).filter(Boolean).map(a => html`<button class="${a.primary ? 'btn-primary' : 'btn-ghost'}" data-action="${a.action}" ${a.title ? raw(`title="${NL.util.escape(a.title)}"`) : ''}>${a.icon ? html`<span>${a.icon}</span> ` : ''}${a.label}</button>`)}</div>
    </div>`;
  }
  /* KPI card — hero style (gradients from the LeafPulse dashboard) or flat */
  function kpi(o){
    const delta = o.delta == null || !isFinite(o.delta) ? '' : html`<span class="kpi-delta ${o.delta >= 0 ? 'up' : 'down'}" title="vs previous period">${o.delta >= 0 ? '▲' : '▼'} ${Math.abs(o.delta).toFixed(0)}%</span>`;
    return html`<div class="kpi ${o.tone || ''} ${o.link ? 'clickable' : ''}" ${o.link ? raw(`data-link="${NL.util.escape(o.link)}"`) : ''} ${o.title ? raw(`title="${NL.util.escape(o.title)}"`) : ''}>
      <div class="kpi-top"><span class="kpi-ico" aria-hidden="true">${o.icon || ''}</span>${delta}</div>
      <div class="kpi-n">${o.value}</div><div class="kpi-l">${o.label}</div>${o.sub ? html`<div class="kpi-sub">${o.sub}</div>` : ''}</div>`;
  }
  const deltaPct = (a, b) => b ? (a - b) / b * 100 : (a ? 100 : null);

  function tabs(list, active){ return html`<div class="tabs-bar" role="tablist">${list.filter(Boolean).map(t => html`<button class="tab-btn ${t.key === active ? 'active' : ''}" data-tab="${t.key}" role="tab" aria-selected="${t.key === active}">${t.label}${t.count != null ? html`<span class="tab-count">${t.count}</span>` : ''}</button>`)}</div>`; }

  const TL_ICON = { lead: '🆕', assign: '👤', stage: '➡️', negative: '⛔', call: '📞', followup: '📅', note: '🗒️', application: '📝', document: '📄', payment: '💰', convert: '🎓', merge: '🔗' };
  function timeline(events){
    if (!events || !events.length) return NL.ui.empty({ icon: '🕘', title: 'No activity yet', text: 'Calls, notes, stage changes and applications will appear here.' });
    return html`<ol class="timeline">${events.map(e => html`<li class="tl-item tl-${e.type}"><span class="tl-ico">${TL_ICON[e.type] || '•'}</span>
      <div class="tl-body"><div class="tl-title">${e.title}</div>${e.text ? html`<div class="tl-text">${e.text}</div>` : ''}
      <div class="tl-meta">${NL.fmt.dateTime(e.at)}${e.byName ? html` · ${e.byName}` : ''}</div></div></li>`)}</ol>`;
  }
  function milestones(list){
    return html`<div class="milestones">${list.map((m, i) => html`<div class="ms ${m.done ? 'done' : ''}"><div class="ms-dot">${m.done ? '✓' : i + 1}</div>
      <div class="ms-label">${m.label}</div><div class="ms-meta">${m.done ? html`${NL.fmt.date(m.at)}<br>${NL.fmt.time(m.at)}${m.byName ? html`<br>${m.byName}` : ''}` : html`<span class="muted">Pending</span>`}</div></div>`)}</div>`;
  }
  function stepper(stages, current, negative){
    const idx = stages.indexOf(current);
    return html`<div class="stepper ${negative ? 'neg' : ''}">${stages.map((s, i) => html`<div class="step ${i < idx ? 'done' : i === idx ? 'current' : ''}" title="${s}"><span></span><em>${s}</em></div>`)}</div>`;
  }
  function detailGrid(pairs){
    return html`<dl class="detail-grid">${pairs.filter(Boolean).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v == null || v === '' ? html`<span class="muted">—</span>` : v}</dd></div>`)}</dl>`;
  }
  function card(title, body, o){
    o = o || {};
    return html`<section class="card ${o.cls || ''}">${title ? html`<div class="card-head"><h3>${title}</h3>${o.right || ''}</div>` : ''}<div class="card-body">${body}</div></section>`;
  }
  function presenceDot(p){ const c = p === 'Available' ? 'green' : p === 'On Call' ? 'blue' : p === 'On Break' || p === 'Busy' ? 'amber' : 'gray'; return html`<span class="dot dot-${c}" title="${p || 'Offline'}"></span>`; }

  NL.w = { pageHead, kpi, deltaPct, tabs, timeline, milestones, stepper, detailGrid, card, presenceDot };
})();

/* State name as a coloured pill — colour follows the zone so regions read at a glance. */
(function(){
  const { html } = NL.util;
  const ZONE_CLASS = { 'North': 'st-north', 'South': 'st-south', 'East': 'st-east', 'West': 'st-west', 'Central': 'st-central', 'North-East': 'st-ne' };
  function stateBadge(state, opts){
    if (!state) return html`<span class="muted">Not specified</span>`;
    const zone = NL.geo.zoneOf(state); const cls = ZONE_CLASS[zone] || 'st-other';
    return html`<span class="state-pill ${cls}" title="${zone && zone !== 'Other' ? zone + ' zone' : 'Outside the Indian states list'}">${state}</span>`;
  }
  NL.w.stateBadge = stateBadge; NL.w.zoneClass = (z) => ZONE_CLASS[z] || 'st-other';
})();

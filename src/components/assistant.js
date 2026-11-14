/* "Ask AI" chat panel — talks to POST /api/assistant/chat on the CRM server.
   The Claude API key lives only on the server; this file never sees it.
   Replies are rendered from a small, fully-escaped markdown subset. */
(function(){
  const { html, raw, toHtml, escape, $ } = NL.util;
  const SUGGESTIONS = ['How many leads came from each state this month?', 'Show my overdue follow-ups', 'Which counsellors have the most admissions this month?',
    'Give me a summary of today', 'List hot leads from Punjab', 'Which campaign has the best ROI this quarter?'];
  const TOOL_LABEL = { count_leads: 'lead counts', search_leads: 'lead list', get_lead: 'lead details', crm_summary: 'dashboard', report: 'reports', list_followups: 'follow-ups', list_records: 'records' };
  let conversationId = null, busy = false, history = [];

  /* ---------- safe mini-markdown (input is escaped first) ---------- */
  function inline(s){
    return escape(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(^|[\s(])_([^_]+)_(?=[\s).,]|$)/g, '$1<i>$2</i>')
      .replace(/\b(LD-\d{3,9})\b/g, '<a href="#/leads/$1">$1</a>').replace(/\b(ST-\d{3,9})\b/g, '<a href="#/students/$1">$1</a>').replace(/\b(APP-\d{3,9})\b/g, '<a href="#/applications/$1">$1</a>');
  }
  function md(text){
    const lines = String(text || '').replace(/\r/g, '').split('\n'); const out = []; let i = 0;
    while (i < lines.length){
      const l = lines[i];
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])){
        const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const head = cells(l); i += 2; const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push(`<div class="ai-table"><table><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (/^\s*[-*•]\s+/.test(l)){ const items = []; while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, '')); out.push(`<ul>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`); continue; }
      if (/^\s*\d+[.)]\s+/.test(l)){ const items = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, '')); out.push(`<ol>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ol>`); continue; }
      const h = l.match(/^\s*#{1,4}\s+(.*)$/); if (h){ out.push(`<div class="ai-h">${inline(h[1])}</div>`); i++; continue; }
      if (l.trim()) out.push(`<p>${inline(l)}</p>`);
      i++;
    }
    return out.join('');
  }

  const available = () => NL.config.APP_MODE === 'production' && NL.config.ASSISTANT_ENABLED;
  function setupNotice(){
    if (NL.config.APP_MODE !== 'production') return html`<div class="ai-notice"><b>The AI assistant runs on the CRM server</b>, so your Claude API key stays secret and is never put in the browser. You're using the in-browser demo right now.
      <ol><li>Copy <code>.env.example</code> to <code>.env</code> and set <code>ANTHROPIC_API_KEY=</code> your key from console.anthropic.com</li><li>Double-click <code>start-crm.cmd</code> in the CRM folder</li><li>It opens <b>http://localhost:3300</b> — sign in and ask away</li></ol></div>`;
    return html`<div class="ai-notice"><b>The AI assistant isn't set up on this server yet.</b> An administrator needs to add <code>ANTHROPIC_API_KEY</code> to the server's <code>.env</code> file and restart it.</div>`;
  }

  function render(panel){
    const body = $('.ai-body', panel);
    if (!available()){ body.innerHTML = toHtml(setupNotice()); return; }
    body.innerHTML = toHtml(history.length ? history.map(m => m.role === 'user' ? html`<div class="ai-msg me">${m.text}</div>`
      : html`<div class="ai-msg bot ${m.error ? 'err' : ''}">${raw(md(m.text))}${m.tools && m.tools.length ? html`<div class="ai-meta">Checked: ${m.tools.map(t => TOOL_LABEL[t] || t).join(', ')}</div>` : ''}</div>`)
      : html`<div class="ai-hello"><div class="ai-hello-ico">✨</div><b>Ask anything about your CRM data</b><div class="muted small">Answers use only the data your role can see. The assistant can read data but never changes it.</div>
        <div class="ai-sugg">${SUGGESTIONS.map(s => html`<button class="chip" data-ai-sugg="${s}">${s}</button>`)}</div></div>`);
    if (busy) body.insertAdjacentHTML('beforeend', '<div class="ai-msg bot typing"><span></span><span></span><span></span> <em>Looking up CRM data…</em></div>');
    body.scrollTop = body.scrollHeight;
  }

  async function send(panel, text){
    text = String(text || '').trim(); if (!text || busy || !available()) return;
    history.push({ role: 'user', text }); busy = true; render(panel);
    const ta = $('textarea', panel); ta.value = ''; ta.style.height = '';
    try {
      const r = await NL.api.post('/assistant/chat', { conversationId, message: text });
      conversationId = r.conversationId; history.push({ role: 'bot', text: r.reply, tools: r.tools });
    } catch (e){
      history.push({ role: 'bot', error: true, text: (e && e.message) || 'Something went wrong. Please try again.' });
      if (e && e.code === 'CONVERSATION_FULL') conversationId = null;
    } finally { busy = false; render(panel); ta.focus(); }
  }

  function mount(){
    if (!NL.store.user() || document.getElementById('aiFab')) return;
    const fab = NL.util.el('button', { id: 'aiFab', class: 'ai-fab', 'aria-label': 'Ask AI assistant', title: 'Ask AI' }, html`<span>✨</span><b>Ask AI</b>`);
    const panel = NL.util.el('section', { id: 'aiPanel', class: 'ai-panel', role: 'dialog', 'aria-label': 'AI assistant', hidden: true }, html`
      <header class="ai-head"><div><b>✨ Ask AI</b><div class="tiny muted">CRM assistant · read-only</div></div><span class="spacer"></span>
        <button class="link-btn small" data-ai="new" title="Start a new chat">New chat</button><button class="icon-btn" data-ai="close" aria-label="Close">✕</button></header>
      <div class="ai-body" aria-live="polite"></div>
      <form class="ai-input"><textarea rows="1" placeholder="Ask about leads, follow-ups, reports…" maxlength="2000" aria-label="Your question"></textarea><button class="btn-primary btn-sm" type="submit">Send</button></form>`);
    document.body.appendChild(fab); document.body.appendChild(panel);
    const ta = $('textarea', panel);
    fab.onclick = () => { panel.hidden = !panel.hidden; fab.classList.toggle('open', !panel.hidden); if (!panel.hidden){ render(panel); if (available()) ta.focus(); } };
    panel.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-ai]'); const s = e.target.closest('[data-ai-sugg]');
      if (s) return send(panel, s.dataset.aiSugg);
      if (!a) return;
      if (a.dataset.ai === 'close'){ panel.hidden = true; fab.classList.remove('open'); }
      if (a.dataset.ai === 'new'){ if (conversationId && available()) NL.api.post('/assistant/reset', { conversationId }).catch(() => {}); conversationId = null; history = []; render(panel); }
      if (e.target.closest('.ai-body a')) { if (window.innerWidth < 820){ panel.hidden = true; fab.classList.remove('open'); } }
    });
    $('form', panel).addEventListener('submit', (e) => { e.preventDefault(); send(panel, ta.value); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(panel, ta.value); } if (e.key === 'Escape'){ panel.hidden = true; fab.classList.remove('open'); } });
    ta.addEventListener('input', () => { ta.style.height = ''; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; });
  }
  NL.store.on('session', (s) => { if (!s){ conversationId = null; history = []; } });

  NL.assistant = { mount, md };
})();

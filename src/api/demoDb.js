/* Demo persistence: one localStorage key per table so a write only re-serialises
   the tables that changed. Replaced entirely by the real database in production. */
(function(){
  const P = () => NL.config.STORAGE_PREFIX + 'db:';
  const TABLES = ['users','roles','teams','universities','campuses','courses','campaigns','leads','students','applications','documents',
    'payments','calls','followups','notes','activities','audit','notifications','savedFilters','sessions','authTokens','securityEvents','loginAttempts','mailbox'];
  const ID_PREFIX = { users:'USR', teams:'TM', universities:'UNI', campuses:'CMP', courses:'CRS', campaigns:'CPN', leads:'LD', students:'ST',
    applications:'APP', documents:'DOC', payments:'PAY', calls:'CL', followups:'FU', notes:'NT', activities:'AC', audit:'AU', notifications:'NF', savedFilters:'SF', sessions:'SS', authTokens:'TK', securityEvents:'SE', loginAttempts:'LA', mailbox:'MB' };
  const ID_START = { leads:10001, students:20001, applications:30001, payments:40001, documents:50001, calls:60001, followups:70001, users:1001 };

  const data = {}; const idx = {}; const dirty = new Set();
  let meta = { counters: {}, version: 0, seedVersion: 0 };
  let settings = null;

  function read(key){ try { const v = localStorage.getItem(P() + key); return v ? JSON.parse(v) : null; } catch (e){ return null; } }
  function write(key, value){ localStorage.setItem(P() + key, JSON.stringify(value)); }

  function load(){
    meta = read('_meta') || meta;
    settings = read('_settings');
    TABLES.forEach(t => { data[t] = read(t) || []; idx[t] = null; });
  }
  function index(t){ if (!idx[t]){ idx[t] = new Map(); data[t].forEach(r => idx[t].set(r.id, r)); } return idx[t]; }

  function nextId(t){
    const n = meta.counters[t] = (meta.counters[t] || ID_START[t] || 1) ;
    meta.counters[t] = n + 1;
    const pre = ID_PREFIX[t] || t.slice(0, 3).toUpperCase();
    return `${pre}-${String(n).padStart(ID_START[t] ? 0 : 3, '0')}`;
  }
  const all = (t) => data[t];
  const get = (t, id) => index(t).get(id) || null;
  function insert(t, rec){
    if (!rec.id) rec.id = nextId(t);
    data[t].unshift(rec); index(t).set(rec.id, rec); touch(t); return rec;
  }
  function update(t, id, patch){ const r = get(t, id); if (!r) return null; Object.assign(r, patch); touch(t); return r; }
  function remove(t, id){ const i = data[t].findIndex(r => r.id === id); if (i < 0) return false; data[t].splice(i, 1); index(t).delete(id); touch(t); return true; }
  function replaceAll(t, rows){ data[t] = rows; idx[t] = null; touch(t); }
  function touch(t){ dirty.add(t); meta.version++; }
  function getSettings(){ return settings; }
  function setSettings(s){ settings = s; dirty.add('_settings'); meta.version++; }

  function flush(){
    try {
      dirty.forEach(t => { if (t === '_settings') write('_settings', settings); else write(t, data[t]); });
      write('_meta', meta); dirty.clear();
    } catch (e){
      dirty.clear();
      const err = new Error('Browser storage is full. Archive old records or switch to production API mode.'); err.status = 507; throw err;
    }
  }
  function reset(){
    Object.keys(localStorage).filter(k => k.startsWith(P())).forEach(k => localStorage.removeItem(k));
    meta = { counters: {}, version: 0, seedVersion: 0 }; settings = null;
    TABLES.forEach(t => { data[t] = []; idx[t] = null; });
  }

  NL.demoDb = { TABLES, load, all, get, insert, update, remove, replaceAll, nextId, flush, reset, getSettings, setSettings,
    meta: () => meta, version: () => meta.version, setSeedVersion(v){ meta.seedVersion = v; dirty.add('_meta'); } };
})();

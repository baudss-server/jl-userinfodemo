// ===== Helpers =====
const $ = (id) => document.getElementById(id);

// Detect if the current page actually has the member form / preview UI
const PAGE_HAS_MEMBER_UI =
  !!$('id-type') || !!$('member-name') || !!$('qr-front') || !!$('idFlipCard');

// localStorage keys
const LS_KEY = 'mc_member_profile_v1';
const TABLE_LIST_KEY = 'mc_members_table_v1';        // list used by table
const TABLE_REFRESH_FLAG = 'mc_table_refresh_flag';  // ping to refresh table

// Generate lightweight row id
function mcMakeId(seed){
  return String(seed||'x').replace(/\s+/g,'-').slice(0,24).toLowerCase() + '-' + Math.floor(Math.random()*9999);
}
function mcNormalizeIdType(s){
  const v = (s||'').toString().trim().toUpperCase();
  return v === 'CIN' ? 'CIN' : 'MIN';
}
function mcNormalizeDate(s){
  const v = (s||'').trim();
  if(!v) return '';
  const m1 = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1) return v;
  const m2 = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2){
    const [_, mm, dd, yyyy] = m2;
    const pad = (n)=> String(n).padStart(2,'0');
    return `${yyyy}-${pad(mm)}-${pad(dd)}`;
  }
  return v;
}

function mcProfileToRow(p){
  const idType = mcNormalizeIdType(p.idType || 'MIN');
  const idValue = idType==='CIN' ? (p.cin||p.idValue||'') : (p.min||p.idValue||'');
  return {
    id: mcMakeId(`${idType}-${idValue || p.name || ''}`),
    name: (p.name||'').trim(),
    surname: (p.surname||'').trim(),
    nationality: (p.nationality||'').trim(),
    idType,
    idValue: (idValue||'').trim(),
    age: (p.age||'').trim(),
    represents: (p.represents||'').trim(),
    division: (p.division||'').trim(),
    status: (p.status||'').trim(),
    expires: mcNormalizeDate(p.expires||'')
  };
}

// ---- De-dup helpers ----
function personKey(r){
  return `${(r.name||'').trim().toLowerCase()}|${(r.surname||'').trim().toLowerCase()}|${(r.idType||'').trim().toUpperCase()}`;
}
function strongKey(r){
  return `${(r.idType||'').trim().toUpperCase()}|${(r.idValue||'').trim().toLowerCase()}`;
}
/** keep newest first */
function dedupeList(list){
  const seenStrong = new Set();
  const seenWeak   = new Set();
  const out = [];
  for (const r of (Array.isArray(list)?list:[])){
    const hasStrong = !!(r.idValue && String(r.idValue).trim());
    const sKey = strongKey(r);
    const wKey = personKey(r);

    if (hasStrong){
      if (seenStrong.has(sKey)) continue;
      seenStrong.add(sKey);
      seenWeak.add(wKey);
      out.push(r);
    }else{
      if (seenWeak.has(wKey)) continue;
      seenWeak.add(wKey);
      out.push(r);
    }
  }
  return out;
}

// Merge/Insert to table list with cleanups (atomic-ish)
function mcSyncMemberToTable(profile, opts={}){
  try{
    const row = mcProfileToRow(profile);
    if(!(row.idValue || (row.name && row.surname))) return; // guard

    const raw  = localStorage.getItem(TABLE_LIST_KEY);
    let list = raw ? (JSON.parse(raw) || []) : [];

    // 0) Global cleanup first (idempotent)
    list = dedupeList(list);

    // 🆕 Update-only path for Save Profile (from Edit)
    if (opts.mergeOnly) {
      let idx = -1;

      // 1) Prefer match by explicit row id (when provided by table.js)
      if (opts.byId) idx = list.findIndex(it => it.id === opts.byId);

      // 2) Fallback: match by strong key if we have idValue
      if (idx < 0 && row.idValue) {
        const sKey = strongKey(row);
        idx = list.findIndex(it => strongKey(it) === sKey);
      }

      // 3) Fallback: match by name+surname (for legacy weak rows)
      if (idx < 0 && !row.idValue) {
        const nameOnly = `${(row.name||'').trim().toLowerCase()}|${(row.surname||'').trim().toLowerCase()}`;
        idx = list.findIndex(it =>
          `${(it.name||'').trim().toLowerCase()}|${(it.surname||'').trim().toLowerCase()}` === nameOnly
        );
      }

      if (idx >= 0) {
        const keepId = list[idx].id;
        list[idx] = { ...list[idx], ...row, id: keepId };
        list = dedupeList(list);
        localStorage.setItem(TABLE_LIST_KEY, JSON.stringify(list));
        localStorage.setItem(TABLE_REFRESH_FLAG, String(Date.now())); // ping other tab
      }
      return; // 🚫 never insert in mergeOnly mode
    }

    // 1) Purge same strong key + weak dups (pre-insert cleanup)
    const hasStrong = !!row.idValue;
    if (hasStrong){
      const keyNew = strongKey(row);

      // drop exact same strong
      // plus drop ANY weak row with same name+surname (ignore idType) to remove old drafts
      const nameOnlyNew = `${(row.name||'').trim().toLowerCase()}|${(row.surname||'').trim().toLowerCase()}`;
      list = list.filter(it => {
        if (strongKey(it) === keyNew) return false;
        const weak = !it.idValue || String(it.idValue).trim()==='';
        if (weak) {
          const nameOnlyOld = `${(it.name||'').trim().toLowerCase()}|${(it.surname||'').trim().toLowerCase()}`;
          if (nameOnlyOld === nameOnlyNew) return false;
        }
        return true;
      });
    } else {
      const wNew = personKey(row);
      let keptWeak = false;
      list = list.filter(it=>{
        if (personKey(it)!==wNew) return true;
        if (it.idValue) return true;
        if (!keptWeak){ keptWeak = true; return true; }
        return false;
      });
    }

    // 2) Insert newest on top OR merge (for non-mergeOnly flows)
    if (opts.forceNew){
      list.unshift(row);
    } else {
      if (hasStrong){
        const idx = list.findIndex(it => strongKey(it) === strongKey(row));
        if (idx>=0) list[idx] = { ...list[idx], ...row };
        else list.unshift(row);
      } else {
        const idx = list.findIndex(it => personKey(it) === personKey(row) && !it.idValue);
        if (idx>=0) list[idx] = { ...list[idx], ...row };
        else list.unshift(row);
      }
    }

    // 3) Final pass para sure na walang dup
    list = dedupeList(list);

    localStorage.setItem(TABLE_LIST_KEY, JSON.stringify(list));
    localStorage.setItem(TABLE_REFRESH_FLAG, String(Date.now())); // ping other tab
  }catch(e){
    console.warn('Sync to table failed:', e);
  }
}

// Auto-fit (screen preview only; print removes any clamping)
function autoFitRow(el, minPx = 11, maxPx = 15) {
  if (!el) return;
  el.style.whiteSpace = 'normal';
  el.style.fontSize = maxPx + 'px';
  while ((el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) &&
         parseFloat(el.style.fontSize) > minPx) {
    el.style.fontSize = (parseFloat(el.style.fontSize) - 0.5) + 'px';
  }
}

/* ---------- Form <-> Data ---------- */
function readForm() {
  const v = (id) => ($(id)?.value || '').trim();
  return {
    name:        v('member-name'),
    surname:     v('surname'),
    nationality: v('nationality'),
    min:         v('member-id'),
    cin:         v('cin'),
    idType:      v('id-type') || 'MIN',
    idTypedVal:  v('id-type-value'),
    age:         v('age-group'),
    represents:  v('represents'),
    division:    v('license-division'),
    status:      v('license-status'),
    expires:     v('expires-on'),
  };
}

function writeForm(data = {}) {
  const set = (id, val) => { const el = $(id); if (el) el.value = val ?? ''; };

  set('member-name', data.name);
  set('surname',     data.surname);
  set('nationality', data.nationality);

  set('member-id',   data.min);
  set('cin',         data.cin);
  set('id-type',     data.idType || 'MIN');

  const type = (data.idType || 'MIN').toUpperCase() === 'CIN' ? 'CIN' : 'MIN';
  set('id-type-value', type === 'CIN' ? data.cin : data.min);
  const lbl = $('id-type-value-label');
  if (lbl) lbl.textContent = 'Enter MIN/CIN';
  const box = $('id-type-value');
  if (box) box.placeholder = 'Type MIN or CIN here';

  set('age-group',        data.age);
  set('represents',       data.represents);
  set('license-division', data.division);
  set('license-status',   data.status);
  set('expires-on',       mcNormalizeDate(data.expires));
}

/* ---------- Mirror to ID Preview ---------- */
function updateIDCard(){
  if (!PAGE_HAS_MEMBER_UI) return; // hard guard if this file is loaded on other pages

  const data = readForm();

  // Reflect the single visible input into the hidden MIN/CIN fields (guarded)
  const cinEl = $('cin');
  const minEl = $('member-id');
  if (data.idType === 'CIN') { if (cinEl) cinEl.value = data.idTypedVal; }
  else { if (minEl) minEl.value = data.idTypedVal; }

  const primaryIdType = (data.idType === 'CIN') ? 'CIN' : 'MIN';
  const minVal = (minEl?.value || '').trim();
  const cinVal = (cinEl?.value || '').trim();
  const primaryIdVal  = (primaryIdType === 'CIN') ? cinVal : minVal;

  const setText = (id, v) => {
    const el = $(id);
    if (!el) return;
    const val = (v==null || String(v).trim()==='') ? '—' : v;
    el.textContent = val;
    el.title = val;
  };

  // FRONT
  setText('fs-name',        data.name);
  setText('fs-surname',     data.surname);
  setText('fs-nationality', data.nationality);
  setText('fs-min',         primaryIdVal);
  setText('fs-age',         data.age);
  setText('fs-represents',  data.represents);

  const lblRow = $('fs-min-label');
  if (lblRow) lblRow.textContent = `Member Id number (${primaryIdType})`;

  // Status pill
  setText('id-class-pill', (data.status||'').toUpperCase());

  // BACK rows
  setText('b-idtype',   primaryIdType);
  setText('b-division', data.division);
  setText('b-status',   data.status);
  setText('b-expires',  mcNormalizeDate(data.expires));

  // footer ID value
  setText('b-idval',    primaryIdVal || '—');

  // Failsafe auto-fit (screen only)
  ['fs-name','fs-surname','fs-nationality','fs-min','fs-age','fs-represents']
    .forEach(id => autoFitRow($(id)));

  // QR payload (placeholder)
  const qrPayload = primaryIdVal || `${data.name} ${data.surname}` || 'MODERN CIPHER';
  drawPlaceholderQR($('qr-front'), qrPayload);
  drawPlaceholderQR($('qr-back'),  qrPayload);
}

/* ---------- Persistence (Save = draft or update-only) ---------- */
function saveToStorage() {
  if (!PAGE_HAS_MEMBER_UI) return;

  const gv = (id) => ($(id)?.value || '');
  const payload = {
    name: gv('member-name'),
    surname: gv('surname'),
    nationality: gv('nationality'),
    min: gv('member-id'),
    cin: gv('cin'),
    idType: gv('id-type'),
    age: gv('age-group'),
    represents: gv('represents'),
    division: gv('license-division'),
    status: gv('license-status'),
    expires: mcNormalizeDate(gv('expires-on')),
  };
  localStorage.setItem(LS_KEY, JSON.stringify(payload));

  // 🆕 If we are in edit mode (from table), update existing row only
  const editId = localStorage.getItem('mc_member_edit_row_id');
  if (editId) {
    mcSyncMemberToTable(payload, { mergeOnly: true, byId: editId });
    localStorage.removeItem('mc_member_edit_row_id'); // cleanup edit mode after save
  } else {
    // Not in edit mode → Save acts as draft only (no table write)
  }
}

function loadFromStorage() {
  if (!PAGE_HAS_MEMBER_UI) return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    writeForm(JSON.parse(raw));
  } catch { /* ignore */ }
}

/* ---------- ADD MEMBER (with click lock/debounce) ---------- */
let __ADD_LOCK = false;
function mcAddMemberFromForm(){
  if (!PAGE_HAS_MEMBER_UI) return;
  if (__ADD_LOCK) return;
  __ADD_LOCK = true;

  const addBtn = $('btnAddMember');
  if (addBtn) addBtn.disabled = true;

  // reflect visible input to hidden MIN/CIN
  const typeSel  = $('id-type')?.value || 'MIN';
  const typedVal = ($('id-type-value')?.value || '').trim();
  if ($('cin') && $('member-id')) {
    if (typeSel === 'CIN') $('cin').value = typedVal; else $('member-id').value = typedVal;
  }

  const payload = {
    name: $('member-name')?.value || '',
    surname: $('surname')?.value || '',
    nationality: $('nationality')?.value || '',
    min: $('member-id')?.value || '',
    cin: $('cin')?.value || '',
    idType: $('id-type')?.value || 'MIN',
    age: $('age-group')?.value || '',
    represents: $('represents')?.value || '',
    division: $('license-division')?.value || '',
    status: $('license-status')?.value || '',
    expires: mcNormalizeDate($('expires-on')?.value || ''),
  };

  // keep last draft
  localStorage.setItem(LS_KEY, JSON.stringify(payload));

  // insert newest; mcSyncMemberToTable will purge same strong and weak drafts before insert
  mcSyncMemberToTable(payload, { forceNew: true });

  // feedback + unlock
  if (addBtn) {
    const original = addBtn.innerHTML;
    addBtn.innerHTML = '<i class="fa-solid fa-check"></i> Added!';
    addBtn.classList.add('btn-success');
    setTimeout(()=>{
      addBtn.innerHTML = original;
      addBtn.classList.remove('btn-success');
      addBtn.disabled = false;
      __ADD_LOCK = false;
    }, 700);
  } else {
    setTimeout(()=>{ __ADD_LOCK = false; }, 700);
  }
}

/* ---------- QR Placeholder (non-scannable) ---------- */
function drawPlaceholderQR(canvas, seedText){
  if(!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = false;

  const size  = Math.min(canvas.width, canvas.height);
  const grid  = 29;
  const quiet = Math.max(8, Math.floor(size * 0.10));

  const available = size - quiet*2;
  const cell = Math.max(2, Math.floor(available / grid));
  const used = cell * grid;
  const start = Math.round((size - used) / 2);

  ctx.clearRect(0,0,size,size);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,size,size);

  const mod = (x,y)=> ctx.fillRect(start + x*cell, start + y*cell, cell, cell);

  function finder(x0,y0){
    ctx.fillStyle = '#000';
    for(let y=0;y<7;y++){
      for(let x=0;x<7;x++){
        const edge = (x===0||y===0||x===6||y===6);
        const core = (x>=2&&x<=4&&y>=2&&y<=4);
        if(edge || core){ mod(x0+x,y0+y); }
      }
    }
  }
  finder(0,0);
  finder(grid-7,0);
  finder(0,grid-7);

  ctx.fillStyle = '#000';
  for(let i=8;i<grid-8;i++){
    if(i%2===0){ mod(i,6); mod(6,i); }
  }

  let hash = 2166136261;
  const seed = String(seedText || '');
  for(let i=0;i<seed.length;i++){
    hash ^= seed.charCodeAt(i);
    hash = (hash*16777619)>>>0;
  }

  for(let y=0;y<grid;y++){
    for(let x=0;x<grid;x++){
      const inFinderTL = (x<7 && y<7);
      const inFinderTR = (x>=grid-7 && y<7);
      const inFinderBL = (x<7 && y>=grid-7);
      const onTiming   = (y===6 || x===6);
      if(inFinderTL || inFinderTR || inFinderBL || onTiming) continue;

      hash = (hash*1103515245 + 12345)>>>0;
      if(hash & 0x20000000){ mod(x,y); }
    }
  }

  ctx.strokeStyle = '#6A4A28';
  ctx.lineWidth = 1;
  ctx.strokeRect(start-2, start-2, used+4, used+4);
}

/* ---------- Wiring ---------- */
function wireSaveButton(){
  const btn = $('save-profile');
  if(!btn) return;
  btn.setAttribute('type','button');
  btn.addEventListener('click', (e)=>{
    e.preventDefault();
    saveToStorage();
    updateIDCard();
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> SAVED!';
    btn.classList.add('btn-success');
    setTimeout(()=>{ btn.innerHTML = original; btn.classList.remove('btn-success'); }, 1000);
  });
}
function wireAddButton(){
  const addBtn = $('btnAddMember');
  if(!addBtn) return;
  if (addBtn.dataset.bound === '1') return; // ensure single listener
  addBtn.dataset.bound = '1';
  addBtn.addEventListener('click', mcAddMemberFromForm, { passive:true });
}

function wireSearchFocus(){
  const pairs = [
    { inputId:'search-name-input', btnId:'search-name-btn'},
    { inputId:'search-id-input',   btnId:'search-id-btn'  }
  ];
  pairs.forEach(({inputId,btnId})=>{
    const i = $(inputId);
    const b = $(btnId);
    if(!i || !b) return;
    i.addEventListener('focus', ()=> b.classList.add('dropdown-btn-active'));
    i.addEventListener('blur',  ()=> b.classList.remove('dropdown-btn-active'));
  });
}

function wireFlip(){
  const card = $('idFlipCard');
  if(!card) return;
  const toggle = ()=>{
    card.classList.toggle('flipped');
    card.setAttribute('aria-pressed', card.classList.contains('flipped') ? 'true' : 'false');
  };
  card.addEventListener('click', toggle);
  card.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggle(); }
  });
}

function wireUpload(){
  const btn = $('btnUpload');
  const img = $('id-photo-front');
  if(!btn || !img) return;
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  btn.addEventListener('click', ()=> fileInput.click());
  fileInput.addEventListener('change', ()=>{
    const file = fileInput.files?.[0];
    if(!file) return;
    const url = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(url);
    img.src = url;
  });
}

function wirePrint(){
  const btn = $('btnPrint');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    updateIDCard();
    setTimeout(()=>window.print(), 25);
  });
  window.addEventListener('beforeprint', ()=> document.body.classList.add('printing'));
  window.addEventListener('afterprint',  ()=> document.body.classList.remove('printing'));
}

function wireIdControls(){
  const typeSel = $('id-type');
  const input   = $('id-type-value');
  if(!typeSel || !input) return;

  const reflect = ()=>{
    input.placeholder = 'Type MIN or CIN here';
    input.value = (typeSel.value === 'CIN') ? ($('cin')?.value || '') : ($('member-id')?.value || '');
    updateIDCard();
    saveToStorage(); // draft or update-only
  };
  typeSel.addEventListener('change', reflect);
  input.addEventListener('input', ()=>{
    if (typeSel.value === 'CIN' && $('cin')) $('cin').value = input.value;
    else if ($('member-id')) $('member-id').value = input.value;
    updateIDCard();
  });
  input.addEventListener('change', ()=> saveToStorage());
  reflect();
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  if (!PAGE_HAS_MEMBER_UI) return; // <- IMPORTANT: do nothing on pages without the form/preview

  loadFromStorage();
  wireIdControls();
  updateIDCard();

  ['member-name','surname','nationality','age-group','represents','license-division','license-status','expires-on']
    .forEach(id=>{
      const el = $(id);
      if(el){
        el.addEventListener('input', updateIDCard);
        el.addEventListener('change', ()=>{ updateIDCard(); saveToStorage(); });
      }
    });

  wireSaveButton();
  wireAddButton();
  wireSearchFocus();
  wireFlip();
  wireUpload();
  wirePrint();
});

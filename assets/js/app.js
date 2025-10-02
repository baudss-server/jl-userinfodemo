// ===== Helpers =====
const $ = (id) => document.getElementById(id);

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
function mcProfileToRow(p){
  const idType = mcNormalizeIdType(p.idType || 'MIN');
  const idValue = idType==='CIN' ? (p.cin||p.idValue||'') : (p.min||p.idValue||'');
  return {
    id: mcMakeId(`${idType}-${idValue || p.name || ''}`),
    name: p.name||'',
    surname: p.surname||'',
    nationality: p.nationality||'',
    idType,
    idValue,
    age: p.age||'',
    represents: p.represents||'',
    division: p.division||'',
    status: p.status||'',
    expires: p.expires||''
  };
}
// Merge to table list (de-dup by default). If opts.forceNew=true, always add as new row.
function mcSyncMemberToTable(profile, opts={}){
  try{
    const row = mcProfileToRow(profile);
    if(!(row.idValue || row.name || row.surname)) return; // guard

    const raw = localStorage.getItem(TABLE_LIST_KEY);
    const list = raw ? (JSON.parse(raw) || []) : [];

    if (opts.forceNew) {
      list.unshift(row);
    } else {
      const idx = list.findIndex(r =>
        (row.idValue && r.idValue===row.idValue && r.idType===row.idType) ||
        (!row.idValue && r.name===row.name && r.surname===row.surname)
      );
      if(idx>=0){ list[idx] = {...list[idx], ...row}; }
      else{ list.unshift(row); }
    }

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

  // reflect into the single input
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
  set('expires-on',       data.expires);
}

/* ---------- Mirror to ID Preview ---------- */
function updateIDCard(){
  const data = readForm();

  // push the visible single input into the correct hidden field
  if (data.idType === 'CIN') $('cin').value = data.idTypedVal;
  else $('member-id').value = data.idTypedVal;

  const primaryIdType = (data.idType === 'CIN') ? 'CIN' : 'MIN';
  const minVal = $('member-id').value.trim();
  const cinVal = $('cin').value.trim();
  const primaryIdVal  = (primaryIdType === 'CIN') ? cinVal : minVal;

  const setText = (id, v) => {
    const el = $(id);
    if (!el) return;
    const val = v || '—';
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
  setText('id-class-pill', data.status ? data.status.toUpperCase() : '—');

  // BACK rows
  setText('b-idtype',   primaryIdType);
  setText('b-division', data.division);
  setText('b-status',   data.status);
  setText('b-expires',  data.expires);

  // footer ID value
  setText('b-idval',    primaryIdVal || '—');

  // Failsafe auto-fit for front rows (screen only)
  ['fs-name','fs-surname','fs-nationality','fs-min','fs-age','fs-represents']
    .forEach(id => autoFitRow($(id)));

  // QR payload (placeholder)
  const qrPayload = primaryIdVal || `${data.name} ${data.surname}` || 'MODERN CIPHER';
  drawPlaceholderQR($('qr-front'), qrPayload);
  drawPlaceholderQR($('qr-back'),  qrPayload);
}

/* ---------- Persistence (also syncs table) ---------- */
function saveToStorage() {
  const payload = {
    name: $('member-name').value,
    surname: $('surname').value,
    nationality: $('nationality').value,
    min: $('member-id').value,
    cin: $('cin').value,
    idType: $('id-type').value,
    age: $('age-group').value,
    represents: $('represents').value,
    division: $('license-division').value,
    status: $('license-status').value,
    expires: $('expires-on').value,
  };
  localStorage.setItem(LS_KEY, JSON.stringify(payload));
  mcSyncMemberToTable(payload); // de-dup merge by default
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    writeForm(JSON.parse(raw));
  } catch { /* ignore */ }
}

/* ---------- ADD MEMBER (always new row) ---------- */
function mcAddMemberFromForm(){
  // make sure hidden MIN/CIN reflect the visible input before capturing
  const typeSel = $('id-type')?.value || 'MIN';
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
    expires: $('expires-on')?.value || '',
  };

  // keep last draft
  localStorage.setItem(LS_KEY, JSON.stringify(payload));

  // force new row in table
  mcSyncMemberToTable(payload, { forceNew: true });

  // feedback
  const btn = $('btnAddMember');
  if (btn) {
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Added!';
    btn.classList.add('btn-success');
    setTimeout(()=>{ btn.innerHTML = original; btn.classList.remove('btn-success'); }, 1500);
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
  for(let i=0;i<seedText.length;i++){
    hash ^= seedText.charCodeAt(i);
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
    btn.innerHTML = '<i class="fas fa-check"></i> SAVED!';
    btn.classList.add('btn-success');
    setTimeout(()=>{ btn.innerHTML = original; btn.classList.remove('btn-success'); }, 1800);
  });
}
function wireAddButton(){
  const addBtn = $('btnAddMember');
  if(!addBtn) return;
  addBtn.addEventListener('click', mcAddMemberFromForm);
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
  // IMPORTANT: guard para di mag-error sa pages na walang form (e.g., members-table)
  if(!typeSel || !input) return;

  const reflect = ()=>{
    input.placeholder = 'Type MIN or CIN here';
    input.value = (typeSel.value === 'CIN') ? ($('cin')?.value || '') : ($('member-id')?.value || '');
    updateIDCard();
    saveToStorage(); // also syncs the table
  };
  typeSel.addEventListener('change', reflect);
  input.addEventListener('input', ()=>{
    if (typeSel.value === 'CIN' && $('cin')) $('cin').value = input.value;
    else if ($('member-id')) $('member-id').value = input.value;
    updateIDCard();
  });
  input.addEventListener('change', ()=> saveToStorage()); // sync on commit
  reflect();
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  loadFromStorage();
  wireIdControls();
  updateIDCard();

  ['member-name','surname','nationality','age-group','represents','license-division','license-status','expires-on']
    .forEach(id=>{
      const el = $(id);
      if(el){
        el.addEventListener('input', updateIDCard);
        el.addEventListener('change', ()=>{ updateIDCard(); saveToStorage(); }); // sync on change
      }
    });

  wireSaveButton();
  wireAddButton();
  wireSearchFocus();
  wireFlip();
  wireUpload();
  wirePrint();
});

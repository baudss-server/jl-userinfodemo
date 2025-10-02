// Members Table logic (icon-only actions + status dots)
// Actions left: Edit, Delete. Auto-refresh when form saves.

const LIST_KEY  = 'mc_members_table_v1';
const RPP_KEY   = 'mc.table.rowsPerPage';
const REFRESH_FLAG = 'mc_table_refresh_flag';

const els = {
  table: document.getElementById('membersTable'),
  thead: document.querySelector('#membersTable thead'),
  tbody: document.querySelector('#membersTable tbody'),

  search: document.getElementById('tblSearch'),
  rowsInfo: document.getElementById('rowsInfo'),
  pageLabel: document.getElementById('pageLabel'),
  pager: document.getElementById('pager'),
  rowsPerPage: document.getElementById('rowsPerPage'),
};

let state = {
  rows: [],
  filtered: [],
  sortKey: 'name',
  sortAsc: true,
  page: 1,
  pageSize: getSavedRpp(),
};

function getSavedRpp() {
  const v = parseInt(localStorage.getItem(RPP_KEY) || '25', 10);
  return [10,25,50,100].includes(v) ? v : 25;
}

function readList(){
  try{
    const raw = localStorage.getItem(LIST_KEY);
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}
function writeList(arr){
  localStorage.setItem(LIST_KEY, JSON.stringify(arr));
}

/* ---------- Helpers ---------- */
function escapeHtml(s){ return (s??'').toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function toEpochFromMDY(s){
  if(!s) return 0;
  const m = String(s).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m){
    const mm = parseInt(m[1],10)-1, dd = parseInt(m[2],10), yy = parseInt(m[3],10);
    const d = new Date(yy, mm, dd, 0,0,0);
    return Math.floor(d.getTime()/1000);
  }
  const t = Date.parse(s);
  return isNaN(t) ? 0 : Math.floor(t/1000);
}
function pad2(n){ n = parseInt(n,10); return (n<10?'0':'')+n; }
function mdyFromDate(d){ return `${pad2(d.getMonth()+1)}/${pad2(d.getDate())}/${d.getFullYear()}`; }
function toMDY(dateLike){
  if(dateLike == null || dateLike === '') return '';
  if (typeof dateLike === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + dateLike * 86400000);
    if (isNaN(d)) return '';
    return mdyFromDate(d);
  }
  if (dateLike instanceof Date) { if (isNaN(dateLike)) return ''; return mdyFromDate(dateLike); }
  const t = Date.parse(dateLike);
  if(!isNaN(t)) return mdyFromDate(new Date(t));
  const m = String(dateLike).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m) return `${pad2(m[1])}/${pad2(m[2])}/${m[3]}`;
  return '';
}
function normalizeStatusDot(status){
  const v = (status||'').toString().trim().toLowerCase();
  if (v === 'inactive' || v === 'disabled' || v === 'blocked') return { cls:'dot-red', label:'Inactive' };
  if (v === 'pending' || v === 'hold' || v === 'on hold') return { cls:'dot-amber', label:'Pending' };
  return { cls:'dot-green', label:'Active' };
}

/* ---------- Rendering ---------- */
function render(){
  applyFilter();
  applySort();

  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
  if(state.page>totalPages) state.page = totalPages;

  const start = (state.page-1)*state.pageSize;
  const view = state.filtered.slice(start, start+state.pageSize);

  els.tbody.innerHTML = view.map(row => tr(row)).join('') + (view.length ? '' : `
    <tr class="mc-empty-row">
      <td class="mc-empty" colspan="11">No members found. Try adjusting your search.</td>
    </tr>
  `);

  els.tbody.querySelectorAll('[data-act]').forEach(btn=>{
    btn.addEventListener('click', onRowAction);
  });

  els.rowsInfo.textContent = `${state.filtered.length} record${state.filtered.length===1?'':'s'}`;
  els.pageLabel.textContent = `${state.page} / ${totalPages}`;
  updatePagerDisabled(totalPages);
  updateAriaSort();
}

function tr(r){
  const epoch = toEpochFromMDY(r.expires);
  const dot = normalizeStatusDot(r.status);
  // mobile data-labels (used by CSS on ≤ 720px)
  const L = {
    name:'Name', surname:'Surname', nationality:'Nationality',
    idType:'ID Type', idValue:'ID Value', age:'Age Group', represents:'Represents',
    division:'Division', status:'Status', expires:'Expires', actions:'Actions'
  };
  return `
    <tr data-id="${escapeHtml(r.id)}">
      <td data-label="${L.name}">${escapeHtml(r.name)}</td>
      <td data-label="${L.surname}">${escapeHtml(r.surname)}</td>
      <td data-label="${L.nationality}">${escapeHtml(r.nationality)}</td>
      <td data-label="${L.idType}">${escapeHtml(r.idType)}</td>
      <td data-label="${L.idValue}" class="mono">${escapeHtml(r.idValue)}</td>
      <td data-label="${L.age}">${escapeHtml(r.age)}</td>
      <td data-label="${L.represents}">${escapeHtml(r.represents)}</td>
      <td data-label="${L.division}">${escapeHtml(r.division)}</td>
      <td data-label="${L.status}">
        <span class="status-badge" title="${dot.label}">
          <span class="status-dot ${dot.cls}" aria-hidden="true"></span>
          <span class="status-text">${dot.label}</span>
          <span class="sr-only">${dot.label}</span>
        </span>
      </td>
      <td data-label="${L.expires}" data-epoch="${epoch || ''}">${escapeHtml(r.expires)}</td>
      <td class="actions-col" data-label="${L.actions}">
        <div class="table-actions">
          <!-- EDIT ONLY -->
          <button class="icon-btn" data-act="edit" title="Edit in Form" aria-label="Edit">
            <i class="fas fa-pen" aria-hidden="true"></i>
          </button>
          <!-- DELETE ONLY -->
          <button class="icon-btn danger" data-act="delete" title="Delete" aria-label="Delete">
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </td>
    </tr>
  `;
}

/* ---------- Filter / Sort ---------- */
function applyFilter(){
  const q = (els.search.value||'').toLowerCase().trim();
  if(!q){ state.filtered = [...state.rows]; return; }
  state.filtered = state.rows.filter(r=>{
    return [r.name,r.surname,r.nationality,r.idType,r.idValue,r.age,r.represents,r.division,r.status,r.expires]
      .some(v => (v||'').toLowerCase().includes(q));
  });
}
function getSortValue(obj, key){
  if(key === 'expires') return toEpochFromMDY(obj.expires);
  return (obj[key]||'').toString().toLowerCase();
}
function applySort(){
  const k = state.sortKey;
  const dir = state.sortAsc ? 1 : -1;
  state.filtered.sort((a,b)=>{
    const A = getSortValue(a,k);
    const B = getSortValue(b,k);
    if(A<B) return -1*dir;
    if(A>B) return  1*dir;
    return 0;
  });
}
function updateAriaSort(){
  const ths = els.thead.querySelectorAll('th[scope="col"][data-key]');
  ths.forEach(th=>{
    const key = th.dataset.key;
    th.setAttribute('aria-sort', key === state.sortKey ? (state.sortAsc ? 'ascending' : 'descending') : 'none');
  });
}

/* ---------- Actions ---------- */
function onRowAction(e){
  const btn = e.currentTarget;
  const tr = btn.closest('tr');
  const id = tr?.dataset.id;
  if(!id) return;
  const idx = state.rows.findIndex(r=>r.id===id);
  if(idx<0) return;

  const row = state.rows[idx];
  const act = btn.dataset.act;

  if(act==='delete'){
    if(confirm('Delete this record?')){
      state.rows.splice(idx,1);
      writeList(state.rows);
      render();
    }
    return;
  }

  if(act==='edit'){
    // Put selected row into form storage then go to member.html
    const payload = {
      name:row.name, surname:row.surname, nationality:row.nationality,
      min: row.idType==='MIN'? row.idValue : '',
      cin: row.idType==='CIN'? row.idValue : '',
      idType:row.idType, age:row.age, represents:row.represents,
      division:row.division, status:row.status, expires:row.expires
    };
    localStorage.setItem('mc_member_profile_v1', JSON.stringify(payload));
    window.location.href = 'member.html';
    return;
  }
}

/* ---------- Pager & Wiring ---------- */
function updatePagerDisabled(totalPages){
  const prevBtn = els.pager.querySelector('button[data-page="prev"]');
  const nextBtn = els.pager.querySelector('button[data-page="next"]');
  if(prevBtn) prevBtn.disabled = state.page <= 1;
  if(nextBtn) nextBtn.disabled = state.page >= totalPages;
}

function wireBasics(){
  // search debounce
  let t=null;
  els.search.addEventListener('input', ()=>{
    clearTimeout(t);
    t = setTimeout(()=>{ state.page=1; render(); }, 150);
  });

  // sort by clicking headers
  document.querySelectorAll('#membersTable thead th[data-key]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.key;
      if(state.sortKey===key){ state.sortAsc = !state.sortAsc; }
      else{ state.sortKey = key; state.sortAsc = true; }
      state.page = 1;
      render();
    });
  });

  // pager
  els.pager.addEventListener('click', (e)=>{
    const b = e.target.closest('button[data-page]');
    if(!b) return;
    const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    if(b.dataset.page==='prev') state.page = Math.max(1, state.page-1);
    else state.page = Math.min(totalPages, state.page+1);
    render();
  });

  // rows per page (with LS persistence)
  if(els.rowsPerPage){
    els.rowsPerPage.value = String(state.pageSize);
    els.rowsPerPage.addEventListener('change', ()=>{
      const v = parseInt(els.rowsPerPage.value, 10);
      state.pageSize = [10,25,50,100].includes(v) ? v : 25;
      localStorage.setItem(RPP_KEY, String(state.pageSize));
      state.page = 1;
      render();
    });
  }

  // Auto-refresh when form saves in another tab/window
  window.addEventListener('storage', (e)=>{
    if(e.key === REFRESH_FLAG || e.key === LIST_KEY){
      state.rows = readList();
      render();
    }
  });

  // Refresh when returning focus to this tab (useful for same-window nav)
  window.addEventListener('focus', ()=>{
    const fresh = readList();
    if(JSON.stringify(fresh) !== JSON.stringify(state.rows)){
      state.rows = fresh;
      render();
    }
  });
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  state.rows = readList();
  wireBasics();
  render();
});

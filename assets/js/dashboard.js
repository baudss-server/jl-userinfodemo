/* Dashboard: live search + exact-ID verify + preview
   IMPORTANT: Only show fields that exist in the Member Form & Table row.
   Uses the same table storage key: 'mc_members_table_v1'.
*/

(function(){
  // ---------- Config (match Member Form + Table row) ----------
  // Table rows are built from form as: name, surname, nationality, idType, idValue, age, represents, division, status, expires
  // See: app.js -> mcProfileToRow(...) and readForm(...)
  const LIST_KEY = 'mc_members_table_v1';

  // ---------- Utilities ----------
  const $ = (sel, ctx=document)=>ctx.querySelector(sel);
  const escapeHtml = (s) => String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const norm = (s)=> String(s ?? '').trim().toLowerCase();

  // ---------- Data ----------
  function readList(){
    try{
      const raw = localStorage.getItem(LIST_KEY);
      if(!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }catch{ return []; }
  }

  // ---------- DOM refs ----------
  const searchInput  = $('#mcSearch');
  const clearBtn     = $('#mcClear');
  const verifyBtn    = $('#mcVerifyBtn');
  const liveInfo     = $('#mcLiveInfo');

  const profileEmpty = $('#mcProfileEmpty');
  const profileBox   = $('#mcProfile');

  const el = {
    fullname: $('#mcFullname'),
    idType:   $('#mcIdType'),
    idValue:  $('#mcIdValue'),
    name:     $('#mcName'),
    surname:  $('#mcSurname'),
    nationality: $('#mcNationality'),
    age:      $('#mcAge'),
    represents: $('#mcRepresents'),
    division: $('#mcDivision'),
    status:   $('#mcStatus'),
    expires:  $('#mcExpires'),
  };

  // ---------- State ----------
  let ALL = readList();

  // Refresh when returning to tab
  window.addEventListener('focus', ()=>{
    const fresh = readList();
    if(JSON.stringify(fresh) !== JSON.stringify(ALL)){
      ALL = fresh;
      renderLiveInfo(searchInput.value);
    }
  });

  // ---------- Render: live matches ----------
  function renderLiveInfo(q){
    const query = norm(q);
    liveInfo.innerHTML = '';
    if(!query){
      liveInfo.innerHTML = `<div class="muted">Start typing to search…</div>`;
      return;
    }
    const hits = ALL.filter(r=>{
      const idv = norm(r.idValue||'');
      const nm  = norm([r.name||'', r.surname||''].join(' ').trim());
      return idv.includes(query) || nm.includes(query);
    }).slice(0, 20);

    if(!hits.length){
      liveInfo.innerHTML = `<div class="muted">No matches found.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for(const r of hits){
      const row = document.createElement('div');
      row.className = 'result-row';
      const stClass = (r.status||'').toLowerCase().includes('active') ? 'active'
                    : (r.status||'').toLowerCase().includes('pend') ? 'pending' : 'inactive';
      row.innerHTML = `
        <div class="result-name">${escapeHtml((r.name||'') + ' ' + (r.surname||''))}</div>
        <div class="result-id">${escapeHtml(r.idValue||'—')}</div>
        <div class="result-status"><span class="dot ${stClass}"></span>${escapeHtml(r.status||'—')}</div>
      `;
      row.addEventListener('click', ()=>{
        searchInput.value = r.idValue||'';
        renderLiveInfo(searchInput.value);
        showProfile(r);
      });
      frag.appendChild(row);
    }
    liveInfo.appendChild(frag);
  }

  // ---------- Render: profile (Form fields only) ----------
  function showProfile(r){
    if(!r){
      profileBox.hidden = true;
      profileEmpty.hidden = false;
      return;
    }
    profileEmpty.hidden = true;
    profileBox.hidden = false;

    // Fullname (Name + Surname)
    el.fullname.textContent = [r.name||'', r.surname||''].filter(Boolean).join(' ') || '—';

    // Exact Member Form/Table fields only:
    el.idType.textContent   = r.idType || '—';
    el.idValue.textContent  = r.idValue || '—';
    el.name.textContent     = r.name || '—';
    el.surname.textContent  = r.surname || '—';
    el.nationality.textContent = r.nationality || '—';
    el.age.textContent      = r.age || '—';
    el.represents.textContent = r.represents || '—';
    el.division.textContent = r.division || '—';
    el.status.textContent   = r.status || '—';
    el.expires.textContent  = r.expires || '—';
  }

  // ---------- Actions ----------
  function onVerify(){
    const q = String(searchInput.value||'').trim();
    if(!q){
      liveInfo.innerHTML = `<div class="muted">Enter an ID to verify.</div>`;
      showProfile(null);
      return;
    }
    const matches = ALL.filter(r => String(r.idValue||'').trim() === q);
    if(matches.length===1){
      showProfile(matches[0]);
      renderLiveInfo(q);
    }else if(matches.length>1){
      liveInfo.innerHTML = `<div class="muted">Multiple members use this ID. Please refine.</div>`;
      showProfile(null);
    }else{
      liveInfo.innerHTML = `<div class="muted">No exact ID match. Try clicking a result below or check the ID.</div>`;
      renderLiveInfo(q);
      showProfile(null);
    }
  }

  // ---------- Wiring ----------
  searchInput.addEventListener('input', (e)=> renderLiveInfo(e.target.value));
  clearBtn.addEventListener('click', ()=>{
    searchInput.value = '';
    renderLiveInfo('');
    showProfile(null);
    searchInput.focus();
  });
  verifyBtn.addEventListener('click', onVerify);

  // Init
  renderLiveInfo('');
  showProfile(null);
})();

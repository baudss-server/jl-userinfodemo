/* Dashboard: 2x2 grid (profile+search left, flip ID right)
   Storage key: 'mc_members_table_v1'
*/
(function(){
  const LIST_KEY = 'mc_members_table_v1';

  // -------- DEV SEED (unchanged) --------
  (function seedIfEmpty(){
    try{
      const raw = localStorage.getItem(LIST_KEY);
      if (!raw) {
        const demo = [
          {
            idType:'CIN', idValue:'MC-0001',
            name:'Ana', surname:'Dela Cruz',
            nationality:'PH', age:'Senior',
            represents:'Modern Cipher', division:'North',
            status:'Active', expires:'2030-12-31'
          },
          {
            idType:'CIN', idValue:'MC-0002',
            name:'Juan', surname:'Santos',
            nationality:'PH', age:'Adult',
            represents:'Modern Cipher', division:'South',
            status:'Pending', expires:'2027-05-15'
          }
        ];
        localStorage.setItem(LIST_KEY, JSON.stringify(demo));
        console.info('[Dashboard] Seeded demo members:', demo);
      }
    }catch(e){ console.warn('[Dashboard] Seed failed:', e); }
  })();

  // -------- QR helpers (placeholder render) --------
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
    finder(0,0); finder(grid-7,0); finder(0,grid-7);

    ctx.fillStyle = '#000';
    for(let i=8;i<grid-8;i++){
      if(i%2===0){ mod(i,6); mod(6,i); }
    }

    let hash = 2166136261;
    const s = String(seedText||'MODERN CIPHER');
    for(let i=0;i<s.length;i++){
      hash ^= s.charCodeAt(i);
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

  // -------- Utilities --------
  const $ = (sel, ctx=document)=>ctx.querySelector(sel);
  const escapeHtml = (s)=>String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const norm = (s)=> String(s ?? '').trim().toLowerCase();

  // -------- Data --------
  function readList(){
    try{
      const raw = localStorage.getItem(LIST_KEY);
      if(!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }catch(e){
      console.error('[Dashboard] readList error:', e);
      return [];
    }
  }

  // -------- DOM refs --------
  const searchInput  = $('#mcSearch');
  const clearBtn     = $('#mcClear');
  const verifyBtn    = $('#mcVerifyBtn');
  const liveInfo     = $('#mcLiveInfo');

  const profileBox   = $('#mcProfile');
  const profileEmpty = $('#mcProfileEmpty');

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

  // Flip card fields
  const flip = {
    front: {
      name: $('#fs-name'),
      surname: $('#fs-surname'),
      nationality: $('#fs-nationality'),
      idLabel: $('#fs-min-label'),
      idValue: $('#fs-min'),
      age: $('#fs-age'),
      represents: $('#fs-represents'),
      pill: $('#id-class-pill'),
      footId: $('#b-idval-front'),
      qrSmall: $('#qr-front'),
      photo: $('#id-photo-front'),
    },
    back: {
      idType: $('#b-idtype'),
      division: $('#b-division'),
      status: $('#b-status'),
      expires: $('#b-expires'),
      footId: $('#b-idval'),
      qrBig: $('#qr-back'),
    },
    card: $('#idFlipCard'),
  };

  // -------- Clear helpers --------
  function clearFlip(){
    const set = (n,v)=>{ if(n) n.textContent = v; };
    set(flip.front.name,'—'); set(flip.front.surname,'—'); set(flip.front.nationality,'—');
    set(flip.front.idValue,'—'); set(flip.front.age,'—'); set(flip.front.represents,'—');
    set(flip.front.footId,'—'); if(flip.front.pill) flip.front.pill.textContent = '—';

    set(flip.back.idType,'—'); set(flip.back.division,'—'); set(flip.back.status,'—');
    set(flip.back.expires,'—'); set(flip.back.footId,'—');

    drawPlaceholderQR(flip.front.qrSmall, '');
    drawPlaceholderQR(flip.back.qrBig, '');
  }

  function clearProfile(){
    if (profileBox)   profileBox.hidden = true;
    if (profileEmpty) profileEmpty.hidden = false;
    Object.values(el).forEach(n => { if(n) n.textContent = '—'; });
    clearFlip();
    if (liveInfo) liveInfo.innerHTML = '';
  }

  // -------- Fill FLIP CARD --------
  function applyStatusBadgeToPill(txt){
    if (!flip.front.pill) return;
    const t = String(txt||'').trim();
    flip.front.pill.textContent = t ? t.toUpperCase() : '—';
  }

  function fillFlipCard(r){
    const v = (s)=> (s==null || String(s).trim()==='') ? '—' : s;
    const idType = (r?.idType||'MIN').toUpperCase()==='CIN' ? 'CIN':'MIN';
    const idVal  = v(r?.idValue||'');

    if (flip.front.name)        flip.front.name.textContent = v(r?.name);
    if (flip.front.surname)     flip.front.surname.textContent = v(r?.surname);
    if (flip.front.nationality) flip.front.nationality.textContent = v(r?.nationality);
    if (flip.front.idLabel)     flip.front.idLabel.textContent = `Member Id number (${idType})`;
    if (flip.front.idValue)     flip.front.idValue.textContent = idVal;
    if (flip.front.age)         flip.front.age.textContent = v(r?.age);
    if (flip.front.represents)  flip.front.represents.textContent = v(r?.represents);
    if (flip.front.footId)      flip.front.footId.textContent = idVal;
    applyStatusBadgeToPill(r?.status||'');

    if (flip.back.idType)   flip.back.idType.textContent   = idType;
    if (flip.back.division) flip.back.division.textContent = v(r?.division);
    if (flip.back.status)   flip.back.status.textContent   = v((r?.status||'').toUpperCase());
    if (flip.back.expires)  flip.back.expires.textContent  = v(r?.expires);
    if (flip.back.footId)   flip.back.footId.textContent   = idVal;

    const seed = idVal!=='—' ? idVal : [r?.name||'', r?.surname||''].join(' ').trim() || 'MODERN CIPHER';
    drawPlaceholderQR(flip.front.qrSmall, seed);
    drawPlaceholderQR(flip.back.qrBig, seed);
  }

  function wireFlip(){
    const card = flip.card;
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

  // -------- Show profile + update flip card --------
  function showProfile(r){
    if(!r || Object.keys(r).length===0){
      clearProfile();
      return;
    }
    if (profileEmpty) profileEmpty.hidden = true;
    if (profileBox)   profileBox.hidden = false;

    el.fullname     && (el.fullname.textContent = [r.name||'', r.surname||''].filter(Boolean).join(' ') || '—');
    el.idType       && (el.idType.textContent   = r.idType || '—');
    el.idValue      && (el.idValue.textContent  = r.idValue || '—');
    el.name         && (el.name.textContent     = r.name || '—');
    el.surname      && (el.surname.textContent  = r.surname || '—');
    el.nationality  && (el.nationality.textContent = r.nationality || '—');
    el.age          && (el.age.textContent      = r.age || '—');
    el.represents   && (el.represents.textContent = r.represents || '—');
    el.division     && (el.division.textContent = r.division || '—');
    el.status       && (el.status.textContent   = r.status || '—');
    el.expires      && (el.expires.textContent  = r.expires || '—');

    fillFlipCard(r);
  }

  // -------- Live results --------
  let ALL = readList();

  function renderLiveInfo(q){
    if(!liveInfo) return;
    const query = norm(q);
    liveInfo.innerHTML = '';
    if(!query){
      clearProfile();
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
        <div class="result-status"><span class="dot ${stClass}"></span>${escapeHtml(r.status||'—')}</div>
        <div class="result-id">${escapeHtml(r.idValue||'—')}</div>
      `;
      row.addEventListener('click', ()=>{
        if (searchInput) searchInput.value = r.idValue||'';
        renderLiveInfo(searchInput ? searchInput.value : '');
        showProfile(r);
      });
      frag.appendChild(row);
    }
    liveInfo.appendChild(frag);
  }

  // -------- Verify --------
  function onVerify(){
    const q = String(searchInput?.value||'').trim();
    if(!q){ clearProfile(); return; }
    const Q = q.toLowerCase();
    const matches = ALL.filter(r => String(r.idValue||'').trim().toLowerCase() === Q);
    if(matches.length===1){
      showProfile(matches[0]);
      renderLiveInfo(q);
    }else{
      clearProfile();
      renderLiveInfo(q);
    }
  }

  // -------- Wire up --------
  if (searchInput){
    searchInput.addEventListener('input', (e)=>{
      const val = e.target.value;
      renderLiveInfo(val);
      if(!String(val).trim()){
        clearProfile();
      }
    });
    searchInput.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter'){ e.preventDefault(); onVerify(); }
      if (e.key === 'Escape'){
        searchInput.value = '';
        clearProfile();
        renderLiveInfo('');
        searchInput.blur();
      }
    });
  }

  if (clearBtn){
    clearBtn.addEventListener('click', ()=>{
      if (!searchInput) return;
      searchInput.value = '';
      clearProfile();
      renderLiveInfo('');
      searchInput.focus();
    });
  }

  if (verifyBtn) verifyBtn.addEventListener('click', onVerify);

  window.addEventListener('focus', ()=>{
    const fresh = readList();
    if(JSON.stringify(fresh) !== JSON.stringify(ALL)){
      ALL = fresh;
      renderLiveInfo(searchInput?.value || '');
      if(!String(searchInput?.value||'').trim()) clearProfile();
    }
  });

  // -------- Init --------
  wireFlip();
  clearProfile();
  renderLiveInfo('');
})();

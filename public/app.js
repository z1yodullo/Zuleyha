/* ================= HANABI app ================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let categories = [];
let media = [];
let filterCat = 'all';
let filterType = 'all';
let query = '';
let currentList = [];
let currentIndex = -1;
let selectedFiles = [];
let selectedCats = new Set();
let isAdmin = false;   // удалять посты и категории может только админ (проверяется и на сервере)

/* ---------- auth helpers ---------- */
function getCookie(n){
  const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

async function j(url, opts = {}) {
  opts.headers = { ...(opts.headers || {}) };
  const method = (opts.method || 'GET').toUpperCase();
  if (opts.body && typeof opts.body === 'string' && !opts.headers['Content-Type']) {
    opts.headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET' && method !== 'HEAD') {
    const token = getCookie('csrftoken');
    if (token) opts.headers['X-CSRFToken'] = token;
  }
  const r = await fetch(url, opts);
  if (r.status === 401) {
    location.replace('/login/');
    throw new Error('Требуется вход');
  }
  return r;
}

async function jjson(url, opts = {}) {
  const r = await j(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Ошибка (' + r.status + ')');
  return data;
}

/* ---------- API ---------- */
const api = {
  async cats() { return jjson('/api/categories'); },
  async createCat(data) { return jjson('/api/categories', { method: 'POST', body: JSON.stringify(data) }); },
  async delCat(id) { return jjson('/api/categories/' + id + '/delete', { method: 'DELETE' }); },
  async list(params = '') { return jjson('/api/media' + params); },
  async patchMedia(id, data) { return jjson('/api/media/' + id, { method: 'PATCH', body: JSON.stringify(data) }); },
  async delMedia(id) { return jjson('/api/media/' + id + '/delete', { method: 'DELETE' }); }
};

/* ---------- hanabi canvas ---------- */
(function hanabi() {
  const c = $('#hanabi'), ctx = c.getContext('2d');
  let W, H, parts = [];
  function resize() {
    W = c.width = innerWidth; H = c.height = innerHeight;
    const n = Math.min(90, Math.floor(W / 16));
    parts = Array.from({ length: n }, () => spawn(true));
  }
  function spawn(rand) {
    return {
      x: Math.random() * W,
      y: rand ? Math.random() * H : H + 20,
      r: Math.random() * 2.6 + .7,
      vy: -(Math.random() * .55 + .18),
      vx: (Math.random() - .5) * .35,
      a: Math.random() * .55 + .18,
      hue: 18 + Math.random() * 26,
      w: Math.random() * Math.PI * 2
    };
  }
  function tick() {
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.w += .02; p.y += p.vy; p.x += p.vx + Math.sin(p.w) * .3;
      if (p.y < -20 || p.x < -30 || p.x > W + 30) Object.assign(p, spawn(false));
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
      g.addColorStop(0, `hsla(${p.hue},100%,68%,${p.a})`);
      g.addColorStop(.4, `hsla(${p.hue},100%,55%,${p.a * .5})`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, 7); ctx.fill();
      ctx.fillStyle = `hsla(${p.hue},100%,85%,${p.a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * .55, 0, 7); ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  addEventListener('resize', resize); resize(); tick();
})();

/* ---------- toast ---------- */
let toastT;
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', !!err);
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------- load ---------- */
async function loadAll() {
  [categories, media] = await Promise.all([api.cats(), api.list()]);
  renderChips(); renderGallery(); renderStats(); renderUploadCats(); renderCatList();
}

function renderStats() {
  $('#statMedia').textContent = media.length;
  $('#statPhotos').textContent = media.filter(m => m.kind === 'photo').length;
  $('#statVideos').textContent = media.filter(m => m.kind === 'video').length;
  $('#statCats').textContent = categories.length;
}

function catById(id) { return categories.find(c => c.id === id); }

/* ---------- chips / filters ---------- */
function renderChips() {
  const counts = {};
  media.forEach(m => (m.categories || []).forEach(id => counts[id] = (counts[id] || 0) + 1));
  const types = [['all', 'Категории', '🗂️'], ['photo', 'Фото', '🖼️'], ['video', 'Видео', '🎬']];
  let html = types.map(([v, l, e]) =>
    `<button class="chip ${filterType === v && filterCat === 'all' ? 'on' : ''}" data-type="${v}" data-cat="all">
      ${e} ${l}<span class="n">${v === 'all' ? categories.length : media.filter(m => m.kind === v).length}</span>
    </button>`).join('');

  html += `<button class="chip ${filterCat !== 'all' ? '' : ''}" data-cat="__all__" style="opacity:.55;pointer-events:none">—</button>`;

  html += categories.map(c =>
    `<button class="chip ${filterCat === c.id ? 'on' : ''}" data-cat="${c.id}" data-type="all" style="--c:${c.color}">
      <span class="dot"></span>${escapeHtml(c.emoji)} ${escapeHtml(c.name)}<span class="n">${counts[c.id] || 0}</span>
    </button>`).join('');

  $('#chips').innerHTML = html;
  $$('#chips .chip').forEach(ch => ch.onclick = () => {
    if (ch.dataset.cat === '__all__') return;
    const isType = ch.dataset.type && ch.dataset.type !== 'all';
    if (ch.dataset.cat !== 'all' && ch.dataset.cat !== undefined && ch.dataset.cat !== '__all__') {
      filterCat = ch.dataset.cat; filterType = 'all';
    } else if (isType) {
      filterType = ch.dataset.type; filterCat = 'all';
    } else {
      filterCat = 'all'; filterType = 'all';
    }
    renderChips(); renderGallery();
  });
}

/* ---------- gallery ---------- */
function applyFilters() {
  let list = media.slice();
  if (filterCat === '__none__') list = list.filter(m => !(m.categories || []).some(id => catById(id)));
  else if (filterCat !== 'all') list = list.filter(m => (m.categories || []).includes(filterCat));
  if (filterType !== 'all') list = list.filter(m => m.kind === filterType);
  if (query) {
    const s = query.toLowerCase();
    list = list.filter(m =>
      (m.title || '').toLowerCase().includes(s) ||
      (m.description || '').toLowerCase().includes(s));
  }
  return list;
}

function isRoot() { return filterCat === 'all' && filterType === 'all'; }

/* папки-категории: превью последних файлов внутри, как в Проводнике */
function folderList() {
  const s = query.toLowerCase();
  const hit = m => (m.title || '').toLowerCase().includes(s) || (m.description || '').toLowerCase().includes(s);
  const list = categories.map(c => ({ c, items: media.filter(m => (m.categories || []).includes(c.id)) }));
  const none = media.filter(m => !(m.categories || []).some(id => catById(id)));
  if (none.length) list.push({ c: { id: '__none__', name: 'Без категории', emoji: '📁', color: '#9a7b66' }, items: none });
  return s ? list.filter(f => f.c.name.toLowerCase().includes(s) || f.items.some(hit)) : list;
}

function folderHTML(f, i) {
  const photos = f.items.filter(m => m.kind === 'photo');
  const videos = f.items.filter(m => m.kind === 'video');
  const pics = [...photos, ...videos].slice(0, 3);
  const pv = pics.map((m, k) => m.kind === 'video'
    ? `<div class="fd-pic p${k + 1}"><video src="${m.url}#t=0.1" muted playsinline preload="metadata"></video></div>`
    : `<div class="fd-pic p${k + 1}"><img src="${m.url}" alt="" loading="lazy"></div>`).join('');
  return `
  <article class="folder" data-id="${f.c.id}" style="--c:${f.c.color};animation-delay:${Math.min(i * 60, 600)}ms">
    <div class="fd">
      <div class="fd-back"></div>
      <div class="fd-pics">${pv}</div>
      <div class="fd-front"><span class="fd-emoji">${escapeHtml(f.c.emoji)}</span></div>
    </div>
    <div class="fd-name">${escapeHtml(f.c.name)}</div>
    <div class="fd-count">${f.items.length} медиа</div>
  </article>`;
}

function renderCrumbs() {
  const el = $('#crumbs');
  if (isRoot()) { el.hidden = true; el.innerHTML = ''; return; }
  let label;
  if (filterCat === '__none__') label = '📁 Без категории';
  else if (filterCat !== 'all') { const c = catById(filterCat); label = c ? `${c.emoji} ${c.name}` : ''; }
  else label = filterType === 'photo' ? '🖼️ Все фото' : '🎬 Все видео';
  el.hidden = false;
  el.innerHTML = `<button class="btn btn-ghost" id="crumbBack">← Категории</button>
    <span class="crumb-cur">${escapeHtml(label)}</span><span class="crumb-n">${currentList.length}</span>`;
  $('#crumbBack').onclick = () => { filterCat = 'all'; filterType = 'all'; renderChips(); renderGallery(); };
}

function renderGallery() {
  currentList = applyFilters();
  const g = $('#gallery');
  const root = isRoot();
  g.classList.toggle('folders', root);
  $('#filters').classList.toggle('is-root', root);
  document.body.classList.toggle('in-cat', !root);
  $('#dockHome').classList.toggle('on', root);
  renderCrumbs();

  if (root) {
    const folders = folderList();
    $('#empty').hidden = folders.length > 0;
    g.innerHTML = folders.map(folderHTML).join('');
    $$('#gallery .folder').forEach(el => el.onclick = () => {
      filterCat = el.dataset.id; filterType = 'all';
      renderChips(); renderGallery();
      $('#filters').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return;
  }

  $('#empty').hidden = currentList.length > 0;
  g.innerHTML = currentList.map((m, i) => {
    const cats = (m.categories || []).map(id => catById(id)).filter(Boolean);
    const thumb = m.kind === 'video'
      ? `<video src="${m.url}" muted playsinline preload="metadata"></video>
         <div class="play">▶</div>`
      : `<img src="${m.url}" alt="${escapeHtml(m.title)}" loading="lazy">`;
    return `
    <article class="card" data-i="${i}" style="animation-delay:${Math.min(i * 45, 500)}ms">
      <div class="card-media">
        <span class="kind-badge ${m.kind}">${m.kind === 'video' ? '🎬 видео' : '🖼️ фото'}</span>
        ${thumb}
      </div>
      <div class="card-info">
        <div class="card-title">${escapeHtml(m.title || 'Без названия')}</div>
        <div class="card-cats">
          ${cats.slice(0, 3).map(c => `<span class="mini-chip" style="--c:${c.color}"><i></i>${escapeHtml(c.emoji)} ${escapeHtml(c.name)}</span>`).join('')}
          ${cats.length > 3 ? `<span class="mini-chip">+${cats.length - 3}</span>` : ''}
        </div>
      </div>
    </article>`;
  }).join('');

  $$('#gallery .card').forEach(el => el.onclick = () => openViewer(+el.dataset.i));
}

/* ---------- view toggle ---------- */
$$('.vt').forEach(b => b.onclick = () => {
  $$('.vt').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  $('#gallery').classList.toggle('masonry', b.dataset.v === 'masonry');
});

/* ---------- search ---------- */
let sT;
$('#search').addEventListener('input', e => {
  clearTimeout(sT);
  sT = setTimeout(() => { query = e.target.value.trim(); renderGallery(); }, 180);
});

/* ================= UPLOAD ================= */
function openUpload() { $('#uploadModal').classList.add('show'); renderUploadCats(); }
function closeUpload() {
  $('#uploadModal').classList.remove('show');
  resetUpload();
}
window.openUpload = openUpload; window.closeUpload = closeUpload;
window.closeCats = () => $('#catModal').classList.remove('show');

$('#btnUpload').onclick = openUpload;
$('#fabCats').onclick = () => { $('#catModal').classList.add('show'); renderCatList(); };

const drop = $('#drop'), fileInput = $('#fileInput');
drop.onclick = e => { if (e.target.closest('.drop-preview .pv')) return; fileInput.click(); };
drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = e => {
  e.preventDefault(); drop.classList.remove('over');
  addFiles(e.dataTransfer.files);
};
fileInput.onchange = e => addFiles(e.target.files);

function addFiles(fl) {
  [...fl].forEach(f => {
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) {
      toast('Не поддерживаемый файл: ' + f.name, true); return;
    }
    selectedFiles.push(f);
  });
  renderPreview();
}
function renderPreview() {
  $('#dropPreview').innerHTML = selectedFiles.map((f, i) => {
    if (f.type.startsWith('image/')) {
      return `<img class="pv" src="${URL.createObjectURL(f)}" alt="">`;
    }
    return `<div class="pvv" title="${escapeHtml(f.name)}">🎬</div>`;
  }).join('');
}

function renderUploadCats() {
  $('#uploadCats').innerHTML = categories.map(c =>
    `<button type="button" class="pick ${selectedCats.has(c.id) ? 'on' : ''}" data-id="${c.id}">
      ${escapeHtml(c.emoji)} ${escapeHtml(c.name)}
    </button>`).join('') || '<span class="hint">Категорий пока нет — создай ниже</span>';
  $$('#uploadCats .pick').forEach(p => p.onclick = () => {
    const id = p.dataset.id;
    selectedCats.has(id) ? selectedCats.delete(id) : selectedCats.add(id);
    p.classList.toggle('on');
  });
}

$('#addCatBtn').onclick = async () => {
  const name = $('#newCatName').value.trim();
  if (!name) return toast('Введи имя категории', true);
  try {
    const c = await api.createCat({
      name,
      emoji: $('#newCatEmoji').value.trim() || '🏷️',
      color: $('#newCatColor').value
    });
    categories.push(c);
    selectedCats.add(c.id);
    $('#newCatName').value = ''; $('#newCatEmoji').value = '';
    renderUploadCats(); renderChips(); renderStats(); renderCatList();
    toast('Категория «' + c.name + '» создана');
  } catch (e) { toast(e.message, true); }
};

$('#doUpload').onclick = () => {
  if (!selectedFiles.length) return toast('Сначала выбери файлы', true);
  const fd = new FormData();
  selectedFiles.forEach(f => fd.append('files', f));
  fd.append('title', $('#fTitle').value);
  fd.append('description', $('#fDesc').value);
  fd.append('categories', JSON.stringify([...selectedCats]));

  const prog = $('#progress'), bar = $('#bar');
  prog.classList.add('show'); bar.style.width = '0%';
  $('#doUpload').disabled = true; $('#doUpload').textContent = 'Загрузка...';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/media');
  const csrf = getCookie('csrftoken');
  if (csrf) xhr.setRequestHeader('X-CSRFToken', csrf);
  xhr.upload.onprogress = e => { if (e.lengthComputable) bar.style.width = (e.loaded / e.total * 100) + '%'; };
  xhr.onload = async () => {
    $('#doUpload').disabled = false; $('#doUpload').textContent = '🔥 Загрузить';
    prog.classList.remove('show');
    if (xhr.status === 401) { location.replace('/login/'); return; }
    if (xhr.status >= 200 && xhr.status < 300) {
      const created = JSON.parse(xhr.responseText);
      media = [...created, ...media];
      closeUpload();
      renderChips(); renderGallery(); renderStats();
      toast(`Загружено: ${created.length} файл(ов) 🔥`);
      if (created.length === 1) openViewer(0);
    } else {
      let msg = 'Ошибка загрузки';
      try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) {}
      toast(msg, true);
    }
  };
  xhr.onerror = () => { toast('Сетевая ошибка', true); $('#doUpload').disabled = false; prog.classList.remove('show'); };
  xhr.send(fd);
};

function resetUpload() {
  selectedFiles = []; selectedCats.clear();
  fileInput.value = ''; $('#fTitle').value = ''; $('#fDesc').value = '';
  $('#dropPreview').innerHTML = '';
  $('#progress').classList.remove('show'); $('#bar').style.width = '0%';
  $('#doUpload').disabled = false; $('#doUpload').textContent = '🔥 Загрузить';
  renderUploadCats();
}

/* ================= VIEWER ================= */
function openViewer(i) {
  currentIndex = i;
  const m = currentList[i];
  if (!m) return;
  $('#viewer').classList.add('show');
  document.body.style.overflow = 'hidden';
  renderViewer();
}
function closeViewer() {
  $('#viewer').classList.remove('show');
  document.body.style.overflow = '';
  $('#vStage').innerHTML = '';
}
window.closeViewer = closeViewer;

function renderViewer() {
  const m = currentList[currentIndex];
  if (!m) return closeViewer();

  $('#vStage').innerHTML = m.kind === 'video'
    ? `<video src="${m.url}" controls autoplay playsinline></video>`
    : `<img src="${m.url}" alt="${escapeHtml(m.title)}">`;

  $('#vKind').textContent = m.kind === 'video' ? '🎬 Видео' : '🖼️ Фото';
  $('#vTitle').textContent = m.title || '';
  $('#vDesc').value = m.description || '';
  $('#vOpen').href = m.url;
  $('#vDelete').style.display = isAdmin ? '' : 'none';
  $('#vMeta').innerHTML = `
    <div><b>Тип:</b> ${m.kind === 'video' ? 'видео' : 'фото'} · ${m.mime || ''}</div>
    <div><b>Размер:</b> ${fmtSize(m.size)}</div>
    <div><b>Загружено:</b> ${new Date(m.createdAt).toLocaleString('ru-RU')}</div>
    <div><b>Файл:</b> ${escapeHtml(m.name || '')}</div>`;

  // all category buttons (toggle add/remove)
  $('#vCats').innerHTML = categories.map(c => {
    const on = (m.categories || []).includes(c.id);
    return `<button class="vcat ${on ? 'on' : ''}" data-id="${c.id}">
      ${escapeHtml(c.emoji)} ${escapeHtml(c.name)} <span class="cnt">${on ? '✓' : '＋'}</span>
    </button>`;
  }).join('') || '<span class="mine-empty">Нет категорий — создай в менеджере 🏷️</span>';

  $$('#vCats .vcat').forEach(b => b.onclick = () => toggleCat(b.dataset.id));

  // chips on media
  const mine = (m.categories || []).map(id => catById(id)).filter(Boolean);
  $('#vMine').innerHTML = mine.length
    ? mine.map(c => `<span class="mine-chip" style="--c:${c.color}" data-id="${c.id}" title="Клик — убрать">
        ${escapeHtml(c.emoji)} ${escapeHtml(c.name)} <span class="rm">✕</span></span>`).join('')
    : '<span class="mine-empty">Пока ничего не выбрано — добавь кнопками выше</span>';
  $$('#vMine .mine-chip').forEach(ch => ch.onclick = () => toggleCat(ch.dataset.id));
}

async function toggleCat(catId) {
  const m = currentList[currentIndex];
  if (!m) return;
  const c = catById(catId);
  if (!c) return;
  const set = new Set(m.categories || []);
  const adding = !set.has(catId);
  adding ? set.add(catId) : set.delete(catId);
  try {
    await api.patchMedia(m.id, { categories: [...set] });
  } catch (e) {
    return toast('Ошибка сохранения', true);
  }
  const full = media.find(x => x.id === m.id);
  if (full) full.categories = [...set];
  m.categories = [...set];
  renderChips(); renderStats(); renderGallery();     // пересобирает currentList
  // если пост «ушёл» из текущего фильтра — оставляем его открытым, чтобы можно было нажать ещё раз
  let idx = currentList.findIndex(x => x.id === m.id);
  if (idx < 0 && full) {
    idx = Math.min(currentIndex, currentList.length);
    currentList.splice(idx, 0, full);
  }
  currentIndex = Math.max(idx, 0);
  renderViewer();
  toast(adding ? `Добавлено: ${c.emoji} ${c.name}` : `Убрано: ${c.emoji} ${c.name}`);
}

$('#saveDesc').onclick = async () => {
  const m = currentList[currentIndex];
  if (!m) return;
  m.description = $('#vDesc').value;
  m.title = $('#vTitle').textContent.trim();
  await api.patchMedia(m.id, { description: m.description, title: m.title });
  const full = media.find(x => x.id === m.id);
  if (full) { full.description = m.description; full.title = m.title; }
  renderGallery();
  toast('Сохранено ✨');
};

$('#vTitle').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('#vTitle').blur(); $('#saveDesc').click(); }
});

$('#vDelete').onclick = async () => {
  const m = currentList[currentIndex];
  if (!m) return;
  if (!isAdmin) return toast('Удалять может только админ', true);
  if (!confirm('Удалить «' + (m.title || '') + '» безвозвратно?')) return;
  try { await api.delMedia(m.id); }
  catch (e) { return toast(e.message, true); }
  media = media.filter(x => x.id !== m.id);
  toast('Удалено');
  const wasLen = currentList.length;
  renderChips(); renderStats();
  if (currentIndex >= currentList.length - 1 && currentList.length) {
    // list not yet re-rendered; rebuild
  }
  currentList = applyFilters();
  if (!currentList.length) closeViewer();
  else { currentIndex = Math.min(currentIndex, currentList.length - 1); renderViewer(); }
  renderGallery();
};

/* nav */
$('#vPrev').onclick = () => step(-1);
$('#vNext').onclick = () => step(1);
function step(d) {
  if (!currentList.length) return;
  currentIndex = (currentIndex + d + currentList.length) % currentList.length;
  renderViewer();
}
document.addEventListener('keydown', e => {
  if (!$('#viewer').classList.contains('show')) return;
  if (e.key === 'Escape') closeViewer();
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

/* ================= CATEGORY MANAGER ================= */
function renderCatList() {
  const counts = {};
  media.forEach(m => (m.categories || []).forEach(id => counts[id] = (counts[id] || 0) + 1));
  $('#catList').innerHTML = categories.map((c, i) => `
    <div class="cat-row" style="animation-delay:${i * 40}ms">
      <div class="sw" style="--c:${c.color};background:${c.color}">${escapeHtml(c.emoji)}</div>
      <div class="nm">${escapeHtml(c.name)}</div>
      <div class="cnt2">${counts[c.id] || 0} медиа</div>
      ${isAdmin ? `<button class="del" data-id="${c.id}" title="Удалить">🗑</button>` : ''}
    </div>`).join('') || '<div class="mine-empty">Категорий нет</div>';
  if (!isAdmin && categories.length) $('#catList').insertAdjacentHTML('beforeend', '<div class="mine-empty admin-note">🔒 Удалять категории может только админ</div>');

  $$('#catList .del').forEach(b => b.onclick = async () => {
    const c = catById(b.dataset.id);
    if (!confirm(`Удалить категорию «${c.name}»? Она пропадёт со всех медиа.`)) return;
    try { await api.delCat(c.id); }
    catch (e) { return toast(e.message, true); }
    categories = categories.filter(x => x.id !== c.id);
    media.forEach(m => m.categories = (m.categories || []).filter(id => id !== c.id));
    if (filterCat === c.id) filterCat = 'all';
    selectedCats.delete(c.id);
    renderCatList(); renderChips(); renderGallery(); renderStats(); renderUploadCats();
    if ($('#viewer').classList.contains('show')) renderViewer();
    toast('Категория удалена');
  });
}

$('#mAddCat').onclick = async () => {
  const name = $('#mCatName').value.trim();
  if (!name) return toast('Введи имя', true);
  try {
    const c = await api.createCat({
      name, emoji: $('#mCatEmoji').value.trim() || '✨', color: $('#mCatColor').value
    });
    categories.push(c);
    $('#mCatName').value = ''; $('#mCatEmoji').value = '';
    renderCatList(); renderChips(); renderStats(); renderUploadCats();
    if ($('#viewer').classList.contains('show')) renderViewer();
    toast('Категория создана');
  } catch (e) { toast(e.message, true); }
};

/* ================= MOBILE: dock + свайпы ================= */
$('#dockHome').onclick = () => {
  filterCat = 'all'; filterType = 'all'; query = ''; $('#search').value = '';
  renderChips(); renderGallery();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
$('#dockAdd').onclick = openUpload;
$('#dockCats').onclick = () => { $('#catModal').classList.add('show'); renderCatList(); };

(function swipe() {
  const v = $('#viewer');
  let x0 = null, y0 = null;
  v.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || !e.target.closest('.viewer-stage') || e.target.tagName === 'VIDEO') { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  v.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });
})();

/* ---------- utils ---------- */
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtSize(b) {
  if (!b) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(n < 10 && i > 0 ? 1 : 0) + ' ' + u[i];
}

/* ---------- boot: сначала вход ---------- */
(async function boot() {
  try {
    const r = await fetch('/api/auth/me');
    if (!r.ok) { location.replace('/login/'); return; }
    const me = await r.json();
    const who = $('#whoami');
    isAdmin = !!me.is_admin;
    if (who) who.textContent = (isAdmin ? '👑 ' : '👤 ') + me.username;
  } catch (e) {
    location.replace('/login/');
    return;
  }

  const out = $('#btnLogout');
  if (out) out.onclick = async () => {
    try { await j('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    location.replace('/login/');
  };

  loadAll().catch(e => toast('Ошибка загрузки: ' + e.message, true));
})();

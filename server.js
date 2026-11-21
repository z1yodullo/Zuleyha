const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

for (const d of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return { media: [], categories: [] };
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const db = JSON.parse(raw);
    db.media = db.media || [];
    db.categories = db.categories || [];
    return db;
  } catch (e) {
    return { media: [], categories: [] };
  }
}

function writeDB(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const DEFAULT_CATEGORIES = [
  { id: 'cat-people', name: 'Люди', emoji: '🧑', color: '#ff6a00' },
  { id: 'cat-nature', name: 'Природа', emoji: '🌿', color: '#ff9a3c' },
  { id: 'cat-travel', name: 'Путешествия', emoji: '✈️', color: '#ffb347' },
  { id: 'cat-food', name: 'Еда', emoji: '🍜', color: '#e85d04' },
  { id: 'cat-night', name: 'Ночь', emoji: '🌙', color: '#c2410c' },
  { id: 'cat-sport', name: 'Спорт', emoji: '🔥', color: '#f97316' }
];

function seedIfNeeded() {
  if (fs.existsSync(DB_FILE)) return;
  const db = { media: [], categories: DEFAULT_CATEGORIES.map(c => ({ ...c })) };
  try {
    const { seedDemo } = require('./demo');
    seedDemo(UPLOAD_DIR, db);
  } catch (e) {
    console.error('demo seed failed:', e.message);
  }
  writeDB(db);
  console.log('  ✨ demo gallery seeded (' + db.media.length + ' items)');
}

const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv'
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED[file.mimetype] || path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, crypto.randomBytes(12).toString('hex') + ext);
  }
});

const upload = multer({
  storage,
  defParamCharset: 'utf8',
  limits: { fileSize: 500 * 1024 * 1024, files: 30 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED[file.mimetype]) return cb(null, true);
    cb(new Error('Unsupported file type: ' + file.mimetype));
  }
});

app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true }));
app.use(express.static(path.join(ROOT, 'public')));

// ---------- CATEGORIES ----------
app.get('/api/categories', (req, res) => {
  const db = readDB();
  const counts = {};
  db.media.forEach(m => (m.categories || []).forEach(id => counts[id] = (counts[id] || 0) + 1));
  res.json(db.categories.map(c => ({ ...c, count: counts[c.id] || 0 })));
});

app.post('/api/categories', (req, res) => {
  const { name, emoji, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Имя категории обязательно' });
  const db = readDB();
  const cat = {
    id: 'cat-' + crypto.randomBytes(6).toString('hex'),
    name: name.trim().slice(0, 40),
    emoji: (emoji || '🏷️').slice(0, 8),
    color: /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#f97316'
  };
  db.categories.push(cat);
  writeDB(db);
  res.status(201).json(cat);
});

app.patch('/api/categories/:id', (req, res) => {
  const db = readDB();
  const cat = db.categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Not found' });
  const { name, emoji, color } = req.body || {};
  if (name) cat.name = name.trim().slice(0, 40);
  if (emoji) cat.emoji = emoji.slice(0, 8);
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) cat.color = color;
  writeDB(db);
  res.json(cat);
});

app.delete('/api/categories/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  db.categories = db.categories.filter(c => c.id !== id);
  db.media.forEach(m => { m.categories = (m.categories || []).filter(c => c !== id); });
  writeDB(db);
  res.json({ ok: true });
});

// ---------- MEDIA ----------
app.get('/api/media', (req, res) => {
  const db = readDB();
  const { q, category, type } = req.query;
  let list = db.media.slice();
  if (category) list = list.filter(m => (m.categories || []).includes(category));
  if (type === 'photo') list = list.filter(m => m.kind === 'photo');
  if (type === 'video') list = list.filter(m => m.kind === 'video');
  if (q) {
    const s = String(q).toLowerCase();
    list = list.filter(m =>
      (m.title || '').toLowerCase().includes(s) ||
      (m.description || '').toLowerCase().includes(s)
    );
  }
  res.json(list);
});

app.post('/api/media', upload.array('files', 30), (req, res) => {
  const db = readDB();
  const { title = '', description = '', categories = '[]' } = req.body;
  let catIds = [];
  try { catIds = JSON.parse(categories); } catch (e) { catIds = []; }
  if (!Array.isArray(catIds)) catIds = [];
  const validCats = new Set(db.categories.map(c => c.id));
  catIds = catIds.filter(id => validCats.has(id));

  if (!req.files || !req.files.length) {
    return res.status(400).json({ error: 'Файлы не загружены' });
  }

  const created = req.files.map((f, i) => {
    const kind = f.mimetype.startsWith('video') ? 'video' : 'photo';
    const item = {
      id: 'm-' + crypto.randomBytes(8).toString('hex'),
      kind,
      url: '/uploads/' + f.filename,
      name: f.originalname,
      size: f.size,
      mime: f.mimetype,
      title: (title || '').trim().slice(0, 120) || (i === 0 ? path.parse(f.originalname).name : path.parse(f.originalname).name),
      description: (description || '').trim().slice(0, 4000),
      categories: catIds.slice(),
      createdAt: Date.now()
    };
    db.media.unshift(item);
    return item;
  });

  writeDB(db);
  res.status(201).json(created);
});

app.patch('/api/media/:id', (req, res) => {
  const db = readDB();
  const m = db.media.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  const { title, description, categories } = req.body || {};
  if (typeof title === 'string') m.title = title.trim().slice(0, 120);
  if (typeof description === 'string') m.description = description.trim().slice(0, 4000);
  if (Array.isArray(categories)) {
    const valid = new Set(db.categories.map(c => c.id));
    m.categories = categories.filter(id => valid.has(id));
  }
  writeDB(db);
  res.json(m);
});

app.delete('/api/media/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const m = db.media.find(x => x.id === id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  try {
    const file = path.join(UPLOAD_DIR, path.basename(m.url));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (e) {}
  db.media = db.media.filter(x => x.id !== id);
  writeDB(db);
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message || 'Server error' });
});

seedIfNeeded();

app.listen(PORT, () => {
  console.log(`\n  🔥 HANABI GALLERY`);
  console.log(`  → http://localhost:${PORT}\n`);
});

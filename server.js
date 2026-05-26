// One-time migration: parse site/index.html and seed the products table.
// Idempotent — re-running clears existing products and re-imports.
const fs   = require('fs');
const path = require('path');
const db   = require('./db');

const HTML = fs.readFileSync(
    path.join(__dirname, 'index.html'),
  'utf8'
);

// addCart pattern: addCart(this,'Brand','Name','Emoji','class',price,oldPrice,'Category')
// pcard structure can span multiple lines, so use a regex over the whole document
const PCARD_RE = /<div class="pcard"[^>]*onclick="addCart\(\s*this\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']*)'\s*\)[^"]*"[\s\S]*?<\/div>\s*<\/div>/g;

// Track brand boundaries via id markers
const BRAND_MARKERS = [
  { id: 'doublewood',     start: HTML.indexOf('id="doublewood"') },
  { id: 'glasshouse',     start: HTML.indexOf('id="glasshouse"') },
  { id: 'perfectsports',  start: HTML.indexOf('id="perfectsports"') },
  { id: 'swisse',         start: HTML.indexOf('id="swisse"') },
  { id: 'nutrex',         start: HTML.indexOf('id="nutrex"') },
  { id: 'musashi',        start: HTML.indexOf('id="musashi"') },
].sort((a,b) => a.start - b.start);

function brandFor(offset) {h
  let cur = null;
  for (const m of BRAND_MARKERS) {
    if (m.start >= 0 && m.start <= offset) cur = m.id;
    else break;
  }
  return cur;
}

// Section markers: each `<div class="sec-hdr"...><h3>...` precedes products
const SEC_RE = /<div class="sec-hdr"[^>]*>\s*<h3>([\s\S]*?)<\/h3>/g;
const sections = [];
let s;
while ((s = SEC_RE.exec(HTML)) !== null) {
  const cleanTitle = s[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  sections.push({ offset: s.index, title: cleanTitle });
}
function brandStartOffset(brandId) {
  const m = BRAND_MARKERS.find(x => x.id === brandId);
  return m ? m.start : 0;
}
function sectionFor(offset, brandId) {
  const brandStart = brandStartOffset(brandId);
  let cur = null;
  for (const sec of sections) {
    if (sec.offset > offset) break;
    if (sec.offset < brandStart) continue; // sec belongs to previous brand
    cur = sec.title;
  }
  return cur;
}

// Image path inside pcard: <img src="...">
const IMG_RE = /<img src="([^"]+)"/;

const insert = db.prepare(`
  INSERT INTO products
    (brand, section, name, emoji, class, price, old_price, category, image_path, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const tx = db.transaction(() => {
  db.exec('DELETE FROM products');
  db.exec("DELETE FROM sqlite_sequence WHERE name='products'");

  let count = 0;
  let m;
  PCARD_RE.lastIndex = 0;
  while ((m = PCARD_RE.exec(HTML)) !== null) {
    const offset = m.index;
    const [_, brand, name, emoji, cls, priceStr, oldStr, category] = m;
    const block = m[0];
    const imgMatch = block.match(IMG_RE);
    const imagePath = imgMatch ? imgMatch[1] : null;
    const brandId   = brandFor(offset);
    const section   = sectionFor(offset, brandId);

    insert.run(
      brandId,
      section,
      name,
      emoji,
      cls,
      parseInt(priceStr, 10),
      parseInt(oldStr, 10),
      category,
      imagePath,
      count
    );
    count++;
  }
  return count;
});

const n = tx();
console.log(`Seeded ${n} products into the products table.`);

// Per-brand summary
const summary = db.prepare(
  'SELECT brand, COUNT(*) c FROM products GROUP BY brand ORDER BY brand'
).all();
for (const row of summary) {
  console.log(`  ${row.brand.padEnd(15)} ${row.c} products`);
}

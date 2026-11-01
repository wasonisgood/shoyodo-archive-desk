const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('C:/Users/user/code/old-thing-search/crawler_investigation/output/yahoo/yahoo_page1.html', 'utf8');
const $ = cheerio.load(html);

console.log('li.Product count:', $('li.Product').length);
console.log('Product link count:', $('a[href*="/jp/auction/"]').length);

const items = [];
const seenIds = new Set();

$('a[href*="/jp/auction/"]').each((i, el) => {
  const $a = $(el);
  const href = $a.attr('href');
  const m = href.match(/\/auction\/([a-zA-Z0-9]+)/);
  if (!m) return;
  const aid = m[1];
  if (seenIds.has(aid)) return;

  const text = $a.text().trim();
  if (text.length < 5) return; // 略過無文字連結

  seenIds.add(aid);

  // 標題通常是第一行
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const title = lines[0] || text;

  // 找價格
  let price = 0;
  const pMatch = text.match(/([\d,]+)円/);
  if (pMatch) {
    price = parseInt(pMatch[1].replace(/,/g, ''), 10);
  }

  // 圖片
  const $img = $a.find('img').length ? $a.find('img') : $a.closest('li').find('img');
  const cover = $img.attr('data-src') || $img.attr('src') || '';

  items.push({ aid, title, price, cover, href });
});

console.log(`Yahoo!拍賣提取出 ${items.length} 筆：`);
items.slice(0, 5).forEach((it, idx) => {
  console.log(`[${idx + 1}] 『${it.title.slice(0, 35)}』 (¥${it.price})`);
  console.log(`    網址: ${it.href}`);
});

const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('C:/Users/user/code/old-thing-search/crawler_investigation/output/mercari/mercari_page1.html', 'utf8');
const $ = cheerio.load(html);

console.log('a[href*="/item/m"] count:', $('a[href*="/item/m"]').length);

const items = [];
const seenIds = new Set();

$('a[href*="/item/m"]').each((i, el) => {
  const $a = $(el);
  const href = $a.attr('href');
  const m = href.match(/\/item\/(m\d+)/);
  if (!m) return;
  const mid = m[1];
  if (seenIds.has(mid)) return;
  seenIds.add(mid);

  const fullUrl = href.startsWith('http') ? href : 'https://jp.mercari.com' + href;
  const rawText = $a.text().trim();
  const ariaLabel = $a.attr('aria-label') || '';
  const $img = $a.find('img');
  const imgAlt = $img.attr('alt') || '';
  const cover = $img.attr('src') || '';

  const title = (ariaLabel || imgAlt || rawText).replace(/のサムネイル$/, '').trim();

  // 找價格（通常在 aria-label 或文字中包含「1,200円」或「¥1,200」）
  let price = 0;
  const pMatch = (ariaLabel + ' ' + rawText).match(/[¥￥]([\d,]+)/) || (ariaLabel + ' ' + rawText).match(/([\d,]+)円/);
  if (pMatch) {
    price = parseInt(pMatch[1].replace(/,/g, ''), 10);
  }

  items.push({ mid, title, price, cover, fullUrl });
});

console.log(`Mercari 提取出 ${items.length} 筆商品：`);
items.slice(0, 5).forEach((it, idx) => {
  console.log(`[${idx + 1}] 『${it.title.slice(0, 35)}』 (¥${it.price})`);
  console.log(`    網址: ${it.fullUrl}`);
});

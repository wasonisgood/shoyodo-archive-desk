const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('C:/Users/user/code/old-thing-search/crawler_investigation/output/kosho/kosho_page1.html', 'utf8');
const $ = cheerio.load(html);

console.log('.product_item count:', $('.product_item').length);
console.log('detail links count:', $('a[href*="detail.php?product_id="]').length);

const items = [];
const seenIds = new Set();

$('a[href*="detail.php?product_id="]').each((i, el) => {
  const $a = $(el);
  const href = $a.attr('href');
  const m = href.match(/product_id=(\d+)/);
  if (!m) return;
  const pid = m[1];
  if (seenIds.has(pid)) return;

  const title = $a.text().trim();
  if (!title) return; // 可能是包裹圖片的無文字 a 標籤
  seenIds.add(pid);

  // 往上找父容器
  let $box = $a.closest('.product_item');
  if (!$box.length) $box = $a.closest('.product_block');
  if (!$box.length) $box = $a.parents().filter((_, p) => $(p).find('.price').length > 0).first();

  let price = 0;
  let cover = '';
  let seller = '日本の古本屋 出品書店';
  let meta = '';

  if ($box.length) {
    const priceText = $box.find('.price strong.red, strong.red, .price').text();
    price = parseInt(priceText.replace(/[^\d]/g, ''), 10) || 0;
    const $img = $box.find('img');
    cover = $img.attr('data-src') || $img.attr('src') || '';
    seller = $box.find('.baseinfo a').text().trim() || $box.find('.baseinfo').text().replace(/\s+/g, ' ').trim() || seller;
    meta = $box.find('.dot_border').eq(0).text().trim();
  }

  items.push({ pid, title, price, seller, meta, cover, href });
});

console.log(`成功提取到 ${items.length} 筆真實書籍：`);
items.slice(0, 5).forEach((it, idx) => {
  console.log(`[${idx + 1}] 『${it.title}』 (¥${it.price}) 出品:${it.seller}`);
  console.log(`    年代/著作者: ${it.meta}`);
  console.log(`    網址: ${it.href}`);
});

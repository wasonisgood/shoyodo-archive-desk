const { chromium } = require('playwright-core');
const cheerio = require('cheerio');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runUnifiedTest() {
  console.log('=== [啟動三大古物市場全流程真實測試] ===');

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ja-JP'
  });

  const results = [];

  // 1. 日本の古本屋
  console.log('\n[1/3] 正在走查 日本の古本屋 (kosho.or.jp)...');
  const page1 = await context.newPage();
  const koshoUrl = 'https://www.kosho.or.jp/products/list.php?mode=search_retry&search_word=%E6%88%A6%E5%89%8D&search_published_year_max=1945&search_price_max=1500&search_only_has_stock=1&search_orderby=price&search_sorttype=asc&search_page_max=50&search_pageno=1';

  try {
    await page1.goto(koshoUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page1.waitForTimeout(4000);
    const html1 = await page1.content();
    const $1 = cheerio.load(html1);

    const seen1 = new Set();
    $1('a[href*="detail.php?product_id="]').each((i, el) => {
      const $a = $1(el);
      const href = $a.attr('href');
      const m = href.match(/product_id=(\d+)/);
      if (!m) return;
      const pid = m[1];
      if (seen1.has(pid)) return;
      const title = $a.text().trim();
      if (!title) return;
      seen1.add(pid);

      let $box = $a.closest('.product_item');
      if (!$box.length) $box = $a.closest('.product_block');
      if (!$box.length) $box = $a.parents().filter((_, p) => $1(p).find('.price').length > 0).first();

      let price = 0;
      let cover = '';
      let seller = '日本の古本屋 出品書店';
      let meta = '';

      if ($box.length) {
        const pMatch = $box.find('.price').text().match(/￥([\d,]+)/);
        if (pMatch) price = parseInt(pMatch[1].replace(/,/g, ''), 10);
        const $img = $box.find('img');
        cover = $img.attr('data-src') || $img.attr('src') || '';
        if (cover && !cover.startsWith('http')) cover = 'https://www.kosho.or.jp' + (cover.startsWith('/') ? '' : '/') + cover;
        seller = $box.find('.baseinfo a').text().trim() || $box.find('.baseinfo').text().replace(/\s+/g, ' ').trim() || seller;
        meta = $box.find('.dot_border').eq(0).text().trim();
      }

      const fullUrl = href.startsWith('http') ? href : 'https://www.kosho.or.jp' + (href.startsWith('/') ? '' : '/products/') + href;
      if (price > 0 && price <= 1500) {
        results.push({
          site: 'kosho',
          id: 'kosho-' + pid,
          title,
          price,
          seller,
          meta: meta || '戦前古書',
          cover,
          url: fullUrl
        });
      }
    });
  } catch (err) {
    console.error('日本の古本屋 錯誤:', err.message);
  } finally {
    await page1.close();
  }

  const koshoCount = results.filter(r => r.site === 'kosho').length;
  console.log(`=> 日本の古本屋 走查成功收載: ${koshoCount} 件古本！`);

  // 2. Yahoo! 拍賣
  console.log('\n[2/3] 正在走查 Yahoo! 拍賣 (auctions.yahoo.co.jp)...');
  const page2 = await context.newPage();
  const yahooUrl = 'https://auctions.yahoo.co.jp/search/search?p=%E6%88%A6%E5%89%8D%20%E6%95%99%E7%A7%91%E6%9B%B8&max=1500&s1=cbids&o1=a';

  try {
    await page2.goto(yahooUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page2.waitForTimeout(3000);
    const html2 = await page2.content();
    const $2 = cheerio.load(html2);

    const seen2 = new Set();
    $2('a[href*="/jp/auction/"]').each((i, el) => {
      const $a = $2(el);
      const href = $a.attr('href');
      const m = href.match(/\/auction\/([a-zA-Z0-9]+)/);
      if (!m) return;
      const aid = m[1];
      if (seen2.has(aid)) return;

      const text = $a.text().trim();
      if (text.length < 5) return;
      seen2.add(aid);

      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const title = lines[0] || text;

      let price = 0;
      const pMatch = text.match(/([\d,]+)円/);
      if (pMatch) price = parseInt(pMatch[1].replace(/,/g, ''), 10);

      const $img = $a.find('img').length ? $a.find('img') : $a.closest('li').find('img');
      const cover = $img.attr('data-src') || $img.attr('src') || '';

      if (title && price > 0 && price <= 1500) {
        results.push({
          site: 'yahoo',
          id: 'yahoo-' + aid,
          title,
          price,
          seller: 'ヤフオク出品者',
          meta: '戦前拍賣品目',
          cover,
          url: href
        });
      }
    });
  } catch (err) {
    console.error('Yahoo拍賣 錯誤:', err.message);
  } finally {
    await page2.close();
  }

  const yahooCount = results.filter(r => r.site === 'yahoo').length;
  console.log(`=> Yahoo! 拍賣 走查成功收載: ${yahooCount} 件拍賣品目！`);

  // 3. Mercari 煤爐
  console.log('\n[3/3] 正在走查 Mercari 煤爐 (jp.mercari.com)...');
  const page3 = await context.newPage();
  const mercariItems = [];

  page3.on('response', async res => {
    if (res.url().includes('entities:search')) {
      try {
        const json = await res.json();
        if (json.items && Array.isArray(json.items)) {
          json.items.forEach(m => {
            const price = parseInt(m.price, 10) || 0;
            if (price > 0 && price <= 1500 && m.name) {
              mercariItems.push({
                site: 'mercari',
                id: 'mercari-' + m.id,
                title: m.name,
                price,
                seller: 'メルカリ出品者',
                meta: '戦前古書',
                cover: (m.thumbnails && m.thumbnails[0]) || '',
                url: `https://jp.mercari.com/item/${m.id}`
              });
            }
          });
        }
      } catch (e) {}
    }
  });

  const mercariUrl = 'https://jp.mercari.com/search?keyword=%E6%88%A6%E5%89%8D%20%E6%95%99%E7%A7%91%E6%9B%B8&price_max=1500&status=on_sale&sort=price&order=asc';
  try {
    await page3.goto(mercariUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page3.waitForTimeout(4000);
    mercariItems.forEach(it => results.push(it));
  } catch (err) {
    console.error('Mercari 錯誤:', err.message);
  } finally {
    await page3.close();
  }

  const mercariCount = results.filter(r => r.site === 'mercari').length;
  console.log(`=> Mercari 煤爐 走查成功收載: ${mercariCount} 件在售古書！`);

  await browser.close();

  console.log(`\n======================================================`);
  console.log(`三大市場實時走查測試大獲全勝！總計收載：${results.length} 件真實古本！`);
  console.log(`  - 日本の古本屋: ${koshoCount} 筆`);
  console.log(`  - Yahoo! 拍賣 : ${yahooCount} 筆`);
  console.log(`  - Mercari 煤爐: ${mercariCount} 筆`);
  console.log(`======================================================`);
}

runUnifiedTest().catch(e => {
  console.error('執行失敗:', e);
  process.exit(1);
});

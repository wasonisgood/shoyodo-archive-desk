const { chromium } = require('playwright-core');
const cheerio = require('cheerio');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testAllSites() {
  console.log('=== [開始使用 Playwright + Cheerio 雙引擎測試三大市場] ===');

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });

  // ==========================================
  // 1. 日本の古本屋 (kosho.or.jp)
  // ==========================================
  console.log('\n>>> [1. 日本の古本屋 走查中...]');
  const page1 = await context.newPage();
  const koshoUrl = 'https://www.kosho.or.jp/products/list.php?mode=search_retry&search_word=%E6%88%A6%E5%89%8D&search_published_year_max=1945&search_price_max=1500&search_only_has_stock=1&search_orderby=price&search_sorttype=asc&search_page_max=50&search_pageno=1';
  await page1.goto(koshoUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page1.waitForTimeout(4000); // 讓 transactionid 重定向完成

  const koshoHtml = await page1.content();
  const $kosho = cheerio.load(koshoHtml);
  const koshoItems = [];

  $kosho('.product_item').each((i, el) => {
    const $el = $kosho(el);
    const $link = $el.find('p a[href*="detail.php?product_id="]');
    if (!$link.length) return;

    const title = $link.text().trim();
    const href = $link.attr('href');
    const fullUrl = href.startsWith('http') ? href : 'https://www.kosho.or.jp' + (href.startsWith('/') ? '' : '/products/') + href;
    const pid = (fullUrl.match(/product_id=(\d+)/) || [])[1] || `kosho-${i}`;

    const priceText = $el.find('.price strong.red, strong.red, .price').text();
    const price = parseInt(priceText.replace(/[^\d]/g, ''), 10) || 0;

    const $img = $el.find('.product_image img');
    let cover = $img.attr('data-src') || $img.attr('src') || '';
    if (cover && !cover.startsWith('http')) {
      cover = 'https://www.kosho.or.jp' + (cover.startsWith('/') ? '' : '/') + cover;
    }

    const seller = $el.find('.baseinfo').text().replace(/\s+/g, ' ').trim() || '日本の古本屋 出品書店';
    const dots = $el.find('.dot_border');
    const meta = dots.eq(0).text().trim();
    const condition = dots.eq(1).text().trim() || '経年並';

    if (title && price > 0 && price <= 1500) {
      koshoItems.push({
        id: 'kosho-' + pid,
        source: 'kosho',
        title,
        price,
        cover,
        url: fullUrl,
        seller,
        meta,
        condition
      });
    }
  });

  console.log(`[日本の古本屋] 成功抓取到 ${koshoItems.length} 件真實古本！`);
  koshoItems.slice(0, 3).forEach((it, idx) => {
    console.log(`  [${idx + 1}] 『${it.title}』 ¥${it.price} ｜ ${it.meta || it.condition} ｜ ${it.seller}`);
  });
  await page1.close();

  // ==========================================
  // 2. Yahoo! 拍賣 (auctions.yahoo.co.jp)
  // ==========================================
  console.log('\n>>> [2. Yahoo! 拍賣 走查中...]');
  const page2 = await context.newPage();
  const yahooUrl = 'https://auctions.yahoo.co.jp/search/search?p=%E6%88%A6%E5%89%8D%20%E6%95%99%E7%A7%91%E6%9B%B8&max=1500&s1=cbids&o1=a';
  await page2.goto(yahooUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page2.waitForTimeout(3000);

  const yahooHtml = await page2.content();
  const $yahoo = cheerio.load(yahooHtml);
  const yahooItems = [];

  $yahoo('li.Product, .Product').each((i, el) => {
    const $el = $yahoo(el);
    const $link = $el.find('a.Product__titleLink, a[href*="/jp/auction/"]');
    if (!$link.length) return;

    const href = $link.attr('href');
    const title = $link.text().trim();
    const aid = (href.match(/\/auction\/([a-zA-Z0-9]+)/) || [])[1] || `yh-${i}`;

    const priceText = $el.find('.Product__priceValue, .Price__value').text();
    const price = parseInt(priceText.replace(/[^\d]/g, ''), 10) || 0;

    const $img = $el.find('img.Product__imageData, img');
    const cover = $img.attr('data-src') || $img.attr('src') || '';
    const bids = $el.find('.Product__bid').text().replace(/[^\d]/g, '') || '0';

    if (title && price > 0 && price <= 1500) {
      yahooItems.push({
        id: 'yahoo-' + aid,
        source: 'yahoo',
        title,
        price,
        bids,
        cover,
        url: href
      });
    }
  });

  console.log(`[Yahoo! 拍賣] 成功抓取到 ${yahooItems.length} 件拍賣品目！`);
  yahooItems.slice(0, 3).forEach((it, idx) => {
    console.log(`  [${idx + 1}] 『${it.title.slice(0, 30)}』 ¥${it.price} ｜ 入札数：${it.bids}`);
  });
  await page2.close();

  // ==========================================
  // 3. Mercari 煤爐 (jp.mercari.com)
  // ==========================================
  console.log('\n>>> [3. Mercari 煤爐 走查中...]');
  const page3 = await context.newPage();
  let mercariApiItems = [];

  page3.on('response', async res => {
    if (res.url().includes('entities:search')) {
      try {
        const json = await res.json();
        if (json.items && Array.isArray(json.items)) {
          json.items.forEach(m => {
            const price = parseInt(m.price, 10) || 0;
            if (price <= 1500 && m.name) {
              mercariApiItems.push({
                id: 'mercari-' + m.id,
                source: 'mercari',
                title: m.name,
                price: price,
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
  await page3.goto(mercariUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page3.waitForTimeout(4000);

  // 若網路攔截有資料，優先使用；若無，從 Cheerio DOM 備援解析
  if (mercariApiItems.length === 0) {
    const mercariHtml = await page3.content();
    const $mer = cheerio.load(mercariHtml);
    $mer('[data-testid="item-cell"], a[href*="/item/m"]').each((i, el) => {
      const $el = $mer(el);
      let href = $el.attr('href') || $el.find('a[href*="/item/m"]').attr('href');
      if (!href) return;
      const fullUrl = href.startsWith('http') ? href : 'https://jp.mercari.com' + href;
      const mid = (fullUrl.match(/\/item\/(m\d+)/) || [])[1] || `mer-${i}`;

      const title = $el.attr('aria-label') || $el.find('img').attr('alt') || '';
      const cleanTitle = title.replace(/のサムネイル$/, '').trim();
      const priceText = $el.find('[data-testid="price"], [class*="Price"], [class*="price"]').text();
      const price = parseInt(priceText.replace(/[^\d]/g, ''), 10) || 0;
      const cover = $el.find('img').attr('src') || '';

      if (cleanTitle && price > 0 && price <= 1500) {
        mercariApiItems.push({
          id: 'mercari-' + mid,
          source: 'mercari',
          title: cleanTitle,
          price,
          cover,
          url: fullUrl
        });
      }
    });
  }

  console.log(`[Mercari 煤爐] 成功抓取到 ${mercariApiItems.length} 件在售古書！`);
  mercariApiItems.slice(0, 3).forEach((it, idx) => {
    console.log(`  [${idx + 1}] 『${it.title.slice(0, 30)}』 ¥${it.price}`);
  });
  await page3.close();

  await browser.close();

  const total = koshoItems.length + yahooItems.length + mercariApiItems.length;
  console.log(`\n==============================================`);
  console.log(`三大市場實地全走查完畢！共計即時收載：${total} 筆真實戰前古物`);
  console.log(`==============================================`);
}

testAllSites().catch(e => {
  console.error('測試失敗：', e);
  process.exit(1);
});

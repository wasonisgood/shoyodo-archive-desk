const { chromium } = require('playwright-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testAll() {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1300, height: 850 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });

  // 1. 測試 日本の古本屋
  console.log('\n--- [1. 測試 日本の古本屋] ---');
  const page1 = await context.newPage();
  const koshoUrl = 'https://www.kosho.or.jp/products/list.php?mode=search_retry&search_word=%E6%95%99%E7%A7%91%E6%9B%B8&search_published_year_max=1945&search_price_max=1500&search_only_has_stock=1&search_orderby=price&search_sorttype=asc&search_page_max=50&search_pageno=1';
  await page1.goto(koshoUrl, { waitUntil: 'load', timeout: 35000 });
  await page1.waitForTimeout(3000);

  const koshoItems = await page1.evaluate(() => {
    const list = [];
    // 日本の古本屋每個商品是 .product_item
    const items = document.querySelectorAll('.product_item, .product_block');
    items.forEach((item, idx) => {
      const link = item.querySelector('a[href*="detail.php?product_id="]');
      const priceEl = item.querySelector('strong.red, .price');
      const baseInfo = item.querySelector('.baseinfo');
      const img = item.querySelector('.product_image img');
      const dots = item.querySelectorAll('.dot_border');

      if (link && priceEl) {
        const title = link.innerText.trim();
        const price = parseInt(priceEl.innerText.replace(/[^\d]/g, ''), 10) || 0;
        const seller = baseInfo ? baseInfo.innerText.replace(/\s+/g, ' ').trim() : '日本の古本屋 出品店';
        const cover = img ? (img.getAttribute('data-src') || img.src) : '';
        const meta = dots[0] ? dots[0].innerText.trim() : '';

        if (title && price > 0) {
          list.push({ title, price, seller, cover, meta, url: link.href });
        }
      }
    });
    return list;
  });
  console.log(`日本の古本屋解析出 ${koshoItems.length} 件：`);
  koshoItems.slice(0, 3).forEach(it => console.log('  ->', it.title, '¥' + it.price, it.seller));
  await page1.close();

  // 2. 測試 Yahoo! 拍賣
  console.log('\n--- [2. 測試 Yahoo! 拍賣] ---');
  const page2 = await context.newPage();
  const yahooUrl = 'https://auctions.yahoo.co.jp/search/search?p=%E6%88%A6%E5%89%8D%20%E6%95%99%E7%A7%91%E6%9B%B8&max=1500&s1=cbids&o1=a';
  await page2.goto(yahooUrl, { waitUntil: 'load', timeout: 35000 });
  await page2.waitForTimeout(3000);

  const yahooItems = await page2.evaluate(() => {
    const list = [];
    const elements = document.querySelectorAll('li.Product, .Product, .Product__detail');
    elements.forEach(el => {
      const a = el.querySelector('a[href*="/auction/"]');
      const priceNode = el.querySelector('.Product__priceValue, .Price__value, [class*="priceValue"]');
      const img = el.querySelector('img');
      const bidNode = el.querySelector('.Product__bid');

      if (a) {
        const text = a.innerText.trim();
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const title = lines[0] || text;
        let price = 0;
        if (priceNode) {
          price = parseInt(priceNode.innerText.replace(/[^\d]/g, ''), 10) || 0;
        } else {
          // 從 a 的內部文字抓價格
          const pMatch = text.match(/([\d,]+)円/);
          if (pMatch) price = parseInt(pMatch[1].replace(/,/g, ''), 10);
        }

        const bids = bidNode ? bidNode.innerText.replace(/[^\d]/g, '') : '0';
        const cover = img ? (img.getAttribute('data-src') || img.src) : '';

        if (title && price > 0 && price <= 1500) {
          list.push({ title, price, bids, cover, url: a.href });
        }
      }
    });
    return list;
  });
  console.log(`Yahoo! 拍賣解析出 ${yahooItems.length} 件：`);
  yahooItems.slice(0, 3).forEach(it => console.log('  ->', it.title.slice(0, 30), '¥' + it.price, '出價:' + it.bids));
  await page2.close();

  // 3. 測試 Mercari
  console.log('\n--- [3. 測試 Mercari] ---');
  const page3 = await context.newPage();
  let mercariApiItems = [];

  page3.on('response', async res => {
    if (res.url().includes('entities:search')) {
      try {
        const json = await res.json();
        if (json.items) {
          mercariApiItems = json.items.map(m => ({
            title: m.name,
            price: parseInt(m.price, 10),
            cover: (m.thumbnails && m.thumbnails[0]) || '',
            url: `https://jp.mercari.com/item/${m.id}`
          }));
        }
      } catch (e) {}
    }
  });

  const mercariUrl = 'https://jp.mercari.com/search?keyword=%E6%88%A6%E5%89%8D%20%E6%95%99%E7%A7%91%E6%9B%B8&price_max=1500&status=on_sale&sort=price&order=asc';
  await page3.goto(mercariUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page3.waitForTimeout(4000);

  console.log(`Mercari 截獲 API / DOM 解析出 ${mercariApiItems.length} 件：`);
  mercariApiItems.slice(0, 3).forEach(it => console.log('  ->', it.title.slice(0, 30), '¥' + it.price));
  await page3.close();

  await browser.close();
}

testAll().catch(e => console.error(e));

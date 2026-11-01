const { chromium } = require('playwright-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testKosho() {
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const url = 'https://www.kosho.or.jp/products/list.php?mode=search_retry&search_word=%E6%88%A6%E5%89%8D&search_published_year_max=1945&search_price_max=1500&search_only_has_stock=1&search_orderby=price&search_sorttype=asc&search_page_max=50&search_pageno=1';
  console.log('正在訪問日本の古本屋...', url);
  await page.goto(url, { waitUntil: 'load', timeout: 35000 });
  await page.waitForTimeout(3000);

  // 檢查當前 URL（看是否有 redirect）
  console.log('當前 URL:', page.url());

  const items = await page.evaluate(() => {
    const list = [];
    const elements = document.querySelectorAll('.product_item, .product_block, .list_box, [class*="product"]');
    console.log('Elements matching [class*=product]:', elements.length);

    // 直接以 a[href*="detail.php?product_id="] 為錨點
    const seenIds = new Set();
    const links = document.querySelectorAll('a[href*="detail.php?product_id="]');

    links.forEach(a => {
      const href = a.href;
      const m = href.match(/product_id=(\d+)/);
      if (!m) return;
      const pid = m[1];
      if (seenIds.has(pid)) return;

      const title = a.innerText.trim();
      if (!title) return; // 可能是圖片上的 a

      seenIds.add(pid);

      // 找它的父商品區塊
      let box = a.closest('.product_item') || a.closest('.product_block') || a.parentElement;
      while (box && !box.querySelector('.price') && box.parentElement) {
        box = box.parentElement;
      }

      let price = 0;
      let cover = '';
      let seller = '日本の古本屋 出品書店';
      let meta = '';
      let condition = '経年並';

      if (box) {
        const priceEl = box.querySelector('.price strong.red, strong.red, .price');
        if (priceEl) {
          const num = priceEl.innerText.replace(/[^\d]/g, '');
          if (num) price = parseInt(num, 10);
        }

        const img = box.querySelector('img');
        if (img) {
          cover = img.getAttribute('data-src') || img.src || '';
          if (cover && !cover.startsWith('http')) {
            cover = 'https://www.kosho.or.jp' + (cover.startsWith('/') ? '' : '/') + cover;
          }
        }

        const base = box.querySelector('.baseinfo');
        if (base) {
          seller = base.innerText.replace(/\s+/g, ' ').trim();
        }

        const dots = box.querySelectorAll('.dot_border');
        if (dots[0]) meta = dots[0].innerText.trim();
        if (dots[1]) condition = dots[1].innerText.trim();
      }

      list.push({
        id: 'kosho-' + pid,
        title,
        price,
        cover,
        url: href,
        seller,
        meta,
        condition
      });
    });

    return list;
  });

  console.log(`成功提取到 ${items.length} 筆日本の古本屋資料：`);
  items.slice(0, 5).forEach((it, idx) => {
    console.log(`[${idx + 1}] 『${it.title}』 ¥${it.price} 出品:${it.seller}`);
    console.log(`    年代資訊: ${it.meta}`);
    console.log(`    網址: ${it.url}`);
  });

  await browser.close();
}

testKosho().catch(e => console.error(e));

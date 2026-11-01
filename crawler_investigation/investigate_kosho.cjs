const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.join(__dirname, 'output', 'kosho');
fs.mkdirSync(outDir, { recursive: true });

async function run() {
  console.log('=== [日本の古本屋 (kosho.or.jp) 深入走查開始] ===');
  
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: false, // 有頭模式
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  const networkLogs = [];
  page.on('request', req => {
    if (['xhr', 'fetch'].includes(req.resourceType())) {
      networkLogs.push({
        type: 'request',
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
        postData: req.postData()
      });
    }
  });

  page.on('response', async res => {
    const req = res.request();
    if (['xhr', 'fetch'].includes(req.resourceType())) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch (e) {
        bodyText = '[Cannot read body]';
      }
      networkLogs.push({
        type: 'response',
        url: res.url(),
        status: res.status(),
        contentType: res.headers()['content-type'] || '',
        preview: bodyText.slice(0, 500)
      });
    }
  });

  // 目標檢索網址：設定戰前 1945 年之前，關鍵字「教科書」，價格 1500 日圓以下，有庫存
  const targetUrl = 'https://www.kosho.or.jp/products/list.php?mode=search_retry' +
    '&search_word=' + encodeURIComponent('教科書') +
    '&search_published_year_max=1945' +
    '&search_price_max=1500' +
    '&search_only_has_stock=1' +
    '&search_orderby=price' +
    '&search_sorttype=asc' +
    '&search_page_max=50' +
    '&search_pageno=1';

  console.log('正在導航至日本の古本屋檢索列表：', targetUrl);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 1. 截圖第 1 頁
  const ss1Path = path.join(outDir, 'kosho_search_page1.png');
  await page.screenshot({ path: ss1Path, fullPage: false });
  console.log('第 1 頁截圖已保存：', ss1Path);

  // 保存 HTML
  const htmlPage1 = await page.content();
  fs.writeFileSync(path.join(outDir, 'kosho_page1.html'), htmlPage1, 'utf8');

  // 解析列表中的書籍資料結構
  const items = await page.evaluate(() => {
    const results = [];
    // 日本の古本屋商品列表選擇器分析
    const elements = document.querySelectorAll('.list_box, .product_item, .box_product, li.item, .list_item, tr.item, .item_box');
    
    // 如果找不到特定 class，找包含價格與連結的區塊
    const cards = document.querySelectorAll('.list_box') || [];
    elements.forEach((el, index) => {
      const titleEl = el.querySelector('.item_title, .title, .product_name, h3, a.name');
      const priceEl = el.querySelector('.item_price, .price, .tax');
      const authorEl = el.querySelector('.author, .item_author');
      const publisherEl = el.querySelector('.publisher, .item_publisher');
      const yearEl = el.querySelector('.published_year, .year');
      const imgEl = el.querySelector('img');
      const linkEl = el.querySelector('a[href*="detail"]');

      if (titleEl || priceEl) {
        results.push({
          index,
          title: titleEl ? titleEl.innerText.trim() : '',
          price: priceEl ? priceEl.innerText.trim() : '',
          author: authorEl ? authorEl.innerText.trim() : '',
          publisher: publisherEl ? publisherEl.innerText.trim() : '',
          year: yearEl ? yearEl.innerText.trim() : '',
          img: imgEl ? imgEl.src : '',
          link: linkEl ? linkEl.href : ''
        });
      }
    });

    // 備援：通用表格或列表分析
    if (results.length === 0) {
      document.querySelectorAll('a[href*="/products/detail.php"]').forEach((a, i) => {
        const parent = a.closest('tr') || a.closest('div') || a.parentElement;
        results.push({
          index: i,
          title: a.innerText.trim(),
          link: a.href,
          contextText: parent ? parent.innerText.slice(0, 150).replace(/\s+/g, ' ') : ''
        });
      });
    }

    return results.slice(0, 15);
  });

  console.log('解析提取商品樣本（前 5 筆）：', items.slice(0, 5));
  fs.writeFileSync(path.join(outDir, 'kosho_extracted_items.json'), JSON.stringify(items, null, 2), 'utf8');

  // 2. 測試分頁點按操作
  console.log('正在測試分頁導航操作...');
  const paginationSelectors = [
    'a[href*="search_pageno=2"]',
    '.pagination a:has-text("2")',
    '.page_navi a:has-text("2")',
    '.pager a:has-text("2")',
    'a.next',
    'a:has-text("次へ")'
  ];

  let clickedPage2 = false;
  for (const sel of paginationSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 })) {
        console.log('找到分頁按鈕選擇器：', sel, '正在點擊...');
        await el.click();
        await page.waitForTimeout(3000);
        clickedPage2 = true;
        break;
      }
    } catch (e) {}
  }

  if (clickedPage2) {
    const ss2Path = path.join(outDir, 'kosho_search_page2.png');
    await page.screenshot({ path: ss2Path });
    console.log('第 2 頁點按跳轉成功，截圖已保存：', ss2Path);
  } else {
    console.log('透過目前選擇器未自動點擊第 2 頁，嘗試直接跳轉到 pageno=2');
    await page.goto(targetUrl.replace('search_pageno=1', 'search_pageno=2'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(outDir, 'kosho_search_page2_direct.png') });
  }

  // 3. 測試點入商品詳細頁面
  if (items.length > 0 && items[0].link) {
    console.log('正在點入第 1 個商品詳細頁：', items[0].link);
    await page.goto(items[0].link, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const ssDetailPath = path.join(outDir, 'kosho_item_detail.png');
    await page.screenshot({ path: ssDetailPath });
    console.log('商品詳細頁截圖已保存：', ssDetailPath);
    fs.writeFileSync(path.join(outDir, 'kosho_detail.html'), await page.content(), 'utf8');
  }

  // 保存網絡請求紀錄
  fs.writeFileSync(path.join(outDir, 'kosho_network_logs.json'), JSON.stringify(networkLogs, null, 2), 'utf8');

  await browser.close();
  console.log('=== [日本の古本屋 走查完畢] ===\n');
}

run().catch(err => {
  console.error('日本の古本屋走查異常：', err);
  process.exit(1);
});

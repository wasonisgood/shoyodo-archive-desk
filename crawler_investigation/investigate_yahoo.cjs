const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.join(__dirname, 'output', 'yahoo');
fs.mkdirSync(outDir, { recursive: true });

async function run() {
  console.log('=== [Yahoo!拍賣 (auctions.yahoo.co.jp) 深入走查開始] ===');
  
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: false,
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
        headers: req.headers()
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

  // Yahoo拍賣關鍵字：戰前 教科書，最高價格 1500 日圓，即決與競標
  // Yahoo! Auctions 典型檢索 URL: https://auctions.yahoo.co.jp/search/search?p=%E6%88%A6%E5%89%8D+%E6%95%99%E7%A7%91%E6%9B%B8&max=1500&s1=cbids&o1=a
  const keyword = encodeURIComponent('戦前 教科書');
  const targetUrl = `https://auctions.yahoo.co.jp/search/search?p=${keyword}&max=1500&s1=cbids&o1=a`;

  console.log('正在導航至 Yahoo!拍賣檢索頁：', targetUrl);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(4000);

  // 1. 截圖第 1 頁
  const ss1Path = path.join(outDir, 'yahoo_search_page1.png');
  await page.screenshot({ path: ss1Path, fullPage: false });
  console.log('Yahoo!拍賣第 1 頁截圖已保存：', ss1Path);

  // 保存 HTML
  const htmlPage1 = await page.content();
  fs.writeFileSync(path.join(outDir, 'yahoo_page1.html'), htmlPage1, 'utf8');

  // 分析 Yahoo 拍賣商品卡片與選擇器
  const items = await page.evaluate(() => {
    const list = [];
    // Yahoo Auctions 現代頁面卡片通常在 Product / Item 相關元素
    const productNodes = document.querySelectorAll('.Product, li.Product, .Product__detail, [data-auction-id]');
    
    productNodes.forEach((node, index) => {
      const titleEl = node.querySelector('.Product__titleLink, a.Product__title, h2, h3, a[href*="auction"]');
      const priceEl = node.querySelector('.Product__priceValue, .Product__price, .Price, .Price__value');
      const bidEl = node.querySelector('.Product__bid, .Product__other');
      const imgEl = node.querySelector('img.Product__imageData, img');
      const linkEl = node.querySelector('a.Product__imageLink, a.Product__titleLink, a[href*="page.auctions.yahoo.co.jp/jp/auction/"]');

      if (titleEl || priceEl) {
        list.push({
          index,
          title: titleEl ? titleEl.innerText.trim() : '',
          price: priceEl ? priceEl.innerText.trim() : '',
          bids: bidEl ? bidEl.innerText.trim() : '',
          img: imgEl ? (imgEl.src || imgEl.getAttribute('data-src')) : '',
          link: linkEl ? linkEl.href : (titleEl ? titleEl.href : '')
        });
      }
    });

    // 備援抓取
    if (list.length === 0) {
      document.querySelectorAll('a[href*="/auction/"]').forEach((a, i) => {
        if (a.innerText.trim().length > 3) {
          list.push({
            index: i,
            title: a.innerText.trim(),
            link: a.href
          });
        }
      });
    }

    return list.slice(0, 15);
  });

  console.log('Yahoo!拍賣提取樣本（前 5 筆）：', items.slice(0, 5));
  fs.writeFileSync(path.join(outDir, 'yahoo_extracted_items.json'), JSON.stringify(items, null, 2), 'utf8');

  // 2. 測試分頁點按操作
  console.log('正在測試 Yahoo!拍賣分頁點擊...');
  const paginationSelectors = [
    'a[href*="b=21"]',
    'a[href*="b=51"]',
    '.Pager__link:has-text("2")',
    'a.Pager__link--next',
    'a:has-text("次へ")'
  ];

  let clickedPage2 = false;
  for (const sel of paginationSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 })) {
        console.log('點擊 Yahoo 分頁：', sel);
        await el.click();
        await page.waitForTimeout(3000);
        clickedPage2 = true;
        break;
      }
    } catch (e) {}
  }

  if (clickedPage2) {
    const ss2Path = path.join(outDir, 'yahoo_search_page2.png');
    await page.screenshot({ path: ss2Path });
    console.log('Yahoo 第 2 頁截圖保存：', ss2Path);
  } else {
    console.log('手動切換至 b=51 (第 2 頁)...');
    await page.goto(`${targetUrl}&b=51`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(outDir, 'yahoo_search_page2_direct.png') });
  }

  // 3. 測試點入商品詳細頁面
  const firstDetailLink = items.find(it => it.link && it.link.includes('/auction/'));
  if (firstDetailLink) {
    console.log('點入 Yahoo 商品詳細頁：', firstDetailLink.link);
    await page.goto(firstDetailLink.link, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(3000);
    const ssDetailPath = path.join(outDir, 'yahoo_item_detail.png');
    await page.screenshot({ path: ssDetailPath });
    console.log('Yahoo 詳細頁截圖保存：', ssDetailPath);
    fs.writeFileSync(path.join(outDir, 'yahoo_detail.html'), await page.content(), 'utf8');
  }

  fs.writeFileSync(path.join(outDir, 'yahoo_network_logs.json'), JSON.stringify(networkLogs, null, 2), 'utf8');
  await browser.close();
  console.log('=== [Yahoo!拍賣 走查完畢] ===\n');
}

run().catch(err => {
  console.error('Yahoo拍賣走查異常：', err);
  process.exit(1);
});

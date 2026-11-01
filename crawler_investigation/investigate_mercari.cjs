const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.join(__dirname, 'output', 'mercari');
fs.mkdirSync(outDir, { recursive: true });

async function run() {
  console.log('=== [Mercari (jp.mercari.com) 深入走查開始] ===');
  
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
  const apiPayloads = [];

  page.on('request', req => {
    const url = req.url();
    if (['xhr', 'fetch'].includes(req.resourceType())) {
      networkLogs.push({
        type: 'request',
        url: url,
        method: req.method(),
        postData: req.postData()
      });
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (['xhr', 'fetch'].includes(res.request().resourceType())) {
      let bodyText = '';
      try {
        if (url.includes('search') || url.includes('items') || url.includes('api.mercari.jp')) {
          bodyText = await res.text();
          apiPayloads.push({
            url: url,
            status: res.status(),
            body: bodyText.slice(0, 2000)
          });
        }
      } catch (e) {}
    }
  });

  // 檢索關鍵字：戦前 教科書，價格上限 1500，在售商品
  const keyword = encodeURIComponent('戦前 教科書');
  const targetUrl = `https://jp.mercari.com/search?keyword=${keyword}&price_max=1500&status=on_sale&sort=price&order=asc`;

  console.log('正在導航至 Mercari 檢索頁：', targetUrl);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(5000);

  // 1. 截圖第 1 頁
  const ss1Path = path.join(outDir, 'mercari_search_page1.png');
  await page.screenshot({ path: ss1Path, fullPage: false });
  console.log('Mercari 第 1 頁截圖已保存：', ss1Path);

  // 保存 HTML
  const htmlPage1 = await page.content();
  fs.writeFileSync(path.join(outDir, 'mercari_page1.html'), htmlPage1, 'utf8');

  // 解析 Mercari 現代 SPA 商品卡片
  const items = await page.evaluate(() => {
    const list = [];
    const itemGrid = document.querySelectorAll('[data-testid="item-cell"], [data-testid="search-item-grid"] a, a[href*="/item/m"]');
    
    itemGrid.forEach((node, index) => {
      const link = node.getAttribute('href') || (node.querySelector('a') ? node.querySelector('a').getAttribute('href') : '');
      const imgEl = node.querySelector('img');
      const priceEl = node.querySelector('[data-testid="price"], [class*="price"], [class*="Price"]');
      const titleEl = node.querySelector('[aria-label], [class*="itemName"], img[alt]');

      const title = node.getAttribute('aria-label') || 
                    (titleEl ? (titleEl.getAttribute('aria-label') || titleEl.getAttribute('alt') || titleEl.innerText) : '') ||
                    (imgEl ? imgEl.getAttribute('alt') : '');
      
      const price = priceEl ? priceEl.innerText.trim() : '';

      if (link && link.includes('/item/m')) {
        list.push({
          index,
          title: (title || '').trim(),
          price: price,
          img: imgEl ? imgEl.src : '',
          link: link.startsWith('http') ? link : 'https://jp.mercari.com' + link
        });
      }
    });

    return list.slice(0, 15);
  });

  console.log('Mercari 商品提取樣本（前 5 筆）：', items.slice(0, 5));
  fs.writeFileSync(path.join(outDir, 'mercari_extracted_items.json'), JSON.stringify(items, null, 2), 'utf8');

  // 2. 測試分頁或無限滾動 / 下一頁按鈕
  console.log('測試 Mercari 分頁或滾動載入...');
  await page.evaluate(() => window.scrollBy(0, 1200));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, 'mercari_scrolled.png') });

  // 3. 測試點入第一個商品頁面
  if (items.length > 0 && items[0].link) {
    console.log('點入 Mercari 商品詳細頁：', items[0].link);
    await page.goto(items[0].link, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(3000);
    const ssDetailPath = path.join(outDir, 'mercari_item_detail.png');
    await page.screenshot({ path: ssDetailPath });
    console.log('Mercari 詳細頁截圖保存：', ssDetailPath);
    fs.writeFileSync(path.join(outDir, 'mercari_detail.html'), await page.content(), 'utf8');
  }

  // 保存 API 與網路紀錄
  fs.writeFileSync(path.join(outDir, 'mercari_api_payloads.json'), JSON.stringify(apiPayloads, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'mercari_network_logs.json'), JSON.stringify(networkLogs, null, 2), 'utf8');

  await browser.close();
  console.log('=== [Mercari 走查完畢] ===\n');
}

run().catch(err => {
  console.error('Mercari 走查異常：', err);
  process.exit(1);
});

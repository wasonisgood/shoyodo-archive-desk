const { chromium } = require('playwright-core');
const cheerio = require('cheerio');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testMercari() {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });

  const apiItems = [];
  page.on('response', async res => {
    const u = res.url();
    if (u.includes('api.mercari.jp') && (u.includes('search') || u.includes('entities') || u.includes('items'))) {
      console.log('Intercepted Mercari API:', u);
      try {
        const text = await res.text();
        const json = JSON.parse(text);
        if (json.items && Array.isArray(json.items)) {
          console.log(`API returned ${json.items.length} items!`);
          json.items.forEach(m => {
            const p = parseInt(m.price, 10) || 0;
            if (p <= 1500 && m.name) {
              apiItems.push({ id: m.id, title: m.name, price: p });
            }
          });
        }
      } catch (e) {
        console.log('JSON parse err:', e.message);
      }
    }
  });

  const url = 'https://jp.mercari.com/search?keyword=%E6%88%A6%E5%89%8D%20%E6%95%99%E7%A7%91%E6%9B%B8&price_max=1500&status=on_sale&sort=price&order=asc';
  console.log('Loading Mercari URL...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(5000);

  console.log('Total apiItems collected:', apiItems.length);
  apiItems.slice(0, 5).forEach((it, i) => console.log(i + 1, it.title, '¥' + it.price));

  await browser.close();
}

testMercari().catch(e => console.error(e));

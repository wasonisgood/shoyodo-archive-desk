const { chromium } = require('playwright-core');
const cheerio = require('cheerio');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testKosho() {
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });

  const url = 'https://www.kosho.or.jp/products/list.php?mode=search_retry&search_word=%E6%88%A6%E5%89%8D&search_published_year_max=1945&search_price_max=1500&search_only_has_stock=1&search_orderby=price&search_sorttype=asc&search_page_max=50&search_pageno=1';

  console.log('正在導航至日本の古本屋...');
  await page.goto(url);
  
  console.log('等待頁面完成所有重定向與 DOM 渲染...');
  await page.waitForSelector('a[href*="detail.php?product_id="]', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1000);

  console.log('獲取 HTML 並解析...');
  const html = await page.content();
  const $ = cheerio.load(html);

  const items = [];
  $('.product_item').each((i, el) => {
    const $el = $(el);
    const $link = $el.find('p a[href*="detail.php?product_id="]');
    if (!$link.length) return;

    const title = $link.text().trim();
    const href = $link.attr('href');
    const priceText = $el.find('.price strong.red, strong.red, .price').text();
    const price = parseInt(priceText.replace(/[^\d]/g, ''), 10) || 0;
    const seller = $el.find('.baseinfo a').text().trim() || $el.find('.baseinfo').text().replace(/\s+/g, ' ').trim();

    if (title && price > 0) {
      items.push({ title, price, seller, href });
    }
  });

  console.log(`成功解析出 ${items.length} 筆古書：`);
  items.slice(0, 5).forEach((it, idx) => {
    console.log(`[${idx + 1}] 『${it.title}』 ¥${it.price} ｜ ${it.seller}`);
  });

  await browser.close();
}

testKosho().catch(e => console.error(e));

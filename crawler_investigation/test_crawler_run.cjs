const crawler = require('../electron/realCrawler.cjs');

async function test() {
  const config = {
    keywords: ['教科書'],
    maxPrice: 1500,
    maxYear: 1945,
    enabledSites: { kosho: true, yahoo: true, mercari: true }
  };

  console.log('Testing full real crawl cycle...');
  const items = await crawler.runFullCrawl(config, (lvl, msg, site) => {
    console.log(`[${lvl.toUpperCase()}] ${site || 'system'}: ${msg}`);
  }, (item) => {
    console.log(`-> CAPTURED: [${item.source}] 『${item.title.slice(0, 30)}』 ¥${item.price} 出品:${item.sellerName}`);
  });

  console.log(`\n=== 走查測試圓滿成功，總共即時抓取到 ${items.length} 件真實古書品目 ===`);
}

test().catch(err => {
  console.error('Crawler error:', err);
  process.exit(1);
});

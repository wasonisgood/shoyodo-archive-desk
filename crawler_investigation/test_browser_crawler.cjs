const { BrowserCrawlerEngine } = require('../electron/browserCrawlerEngine.cjs');

async function main() {
  console.log('啟動瀏覽器真實核心爬蟲測試...');
  const engine = new BrowserCrawlerEngine({ headless: false }); // 有頭模式測試

  const config = {
    keywords: ['教科書'],
    maxPrice: 1500,
    maxYear: 1945,
    enabledSites: { kosho: true, yahoo: true, mercari: true }
  };

  try {
    const results = await engine.runFullCycle(config, (level, message, site) => {
      console.log(`[${level.toUpperCase()}] ${site ? '[' + site + ']' : ''} ${message}`);
    }, (item) => {
      console.log(`  -> 捕獲新書: [${item.source}] 『${item.title.slice(0, 35)}』 (¥${item.price}) 出品:${item.sellerName}`);
    });

    console.log(`\n測試走查成功！三大市場共計收載：${results.length} 筆真實古書品目。`);
  } finally {
    await engine.close();
  }
}

main().catch(err => {
  console.error('執行失敗：', err);
  process.exit(1);
});

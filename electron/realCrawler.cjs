const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * 蕉葉堂 巡回台帳 — 實時古書爬蟲核心 (Real Crawler Engine)
 * 涵蓋三大古物市場：
 * 1. 日本の古本屋 (kosho.or.jp) - 年代 ≦ 1945, 價格 ≦ 1500
 * 2. Yahoo! 拍賣 (auctions.yahoo.co.jp) - 戰前古書, 價格 ≦ 1500
 * 3. 煤爐 (jp.mercari.com) - 在售古書, 價格 ≦ 1500
 */

// 通用 HTTP GET 函式，帶有完整 Browser Headers
function fetchUrl(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const client = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,zh-TW;q=0.9,zh;q=0.8,en;q=0.7',
        'Connection': 'keep-alive',
        ...headers
      },
      timeout: 20000
    };

    const req = client.request(options, (res) => {
      // 處理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, targetUrl).toString();
        }
        return fetchUrl(redirectUrl, headers).then(resolve).catch(reject);
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data, headers: res.headers }));
    });

    req.on('error', err => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('連線逾時'));
    });
    req.end();
  });
}

// 通用 HTTP POST 函式
function postJson(targetUrl, postData, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const client = urlObj.protocol === 'https:' ? https : http;
    const bodyStr = typeof postData === 'string' ? postData : JSON.stringify(postData);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://jp.mercari.com',
        'Referer': 'https://jp.mercari.com/',
        ...headers
      },
      timeout: 20000
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('POST 請求逾時'));
    });
    req.write(bodyStr);
    req.end();
  });
}

// 1. 日本の古本屋 (kosho.or.jp) 走查解析
async function crawlKosho(keyword, maxPrice = 1500, maxYear = 1945, onLog) {
  const targetUrl = 'https://www.kosho.or.jp/products/list.php?mode=search_retry' +
    '&search_word=' + encodeURIComponent(keyword) +
    '&search_published_year_max=' + maxYear +
    '&search_price_max=' + maxPrice +
    '&search_only_has_stock=1' +
    '&search_orderby=price' +
    '&search_sorttype=asc' +
    '&search_page_max=50&search_pageno=1';

  if (onLog) onLog('crawler', `［日本の古本屋］連線檢索：${targetUrl}`, 'kosho');

  const resp = await fetchUrl(targetUrl);
  if (resp.statusCode !== 200) {
    throw new Error(`日本の古本屋 HTTP ${resp.statusCode}`);
  }

  const html = resp.data;
  const items = [];

  // 解析書籍區塊
  const blockRegex = /<div class="product_block">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  const itemMatches = html.split('class="product_item"');

  for (let i = 1; i < itemMatches.length; i++) {
    const chunk = itemMatches[i];

    // 書名與連結
    const linkMatch = chunk.match(/href="([^"]*detail\.php\?product_id=(\d+))"[^>]*>([^<]+)<\/a>/);
    if (!linkMatch) continue;

    const relLink = linkMatch[1];
    const fullLink = relLink.startsWith('http') ? relLink : 'https://www.kosho.or.jp' + (relLink.startsWith('/') ? '' : '/products/') + relLink;
    const title = linkMatch[3].trim();

    // 價格
    let price = 0;
    const priceMatch = chunk.match(/￥<span class="price">([\d,]+)<\/span>/) || chunk.match(/￥([\d,]+)/);
    if (priceMatch) {
      price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
    }

    // 圖片 (data-src)
    let coverImage = '';
    const imgMatch = chunk.match(/data-src="([^"]+)"/) || chunk.match(/src="([^"]+\.(?:jpg|png|gif|jpeg))"/);
    if (imgMatch) {
      const src = imgMatch[1];
      coverImage = src.startsWith('http') ? src : 'https://www.kosho.or.jp' + src;
    }

    // 店家與所在地
    let sellerName = '日本の古本屋 參畫書店';
    const sellerMatch = chunk.match(/<div class="baseinfo[^"]*">([\s\S]*?)<\/div>/);
    if (sellerMatch) {
      const sText = sellerMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (sText) sellerName = sText;
    }

    // 書誌資料（著者、出版社、年代）
    let author = '';
    let publisher = '';
    let eraString = '戦前';
    let condition = '経年並';
    let publishYear = undefined;

    const dotBorders = chunk.match(/<div class="dot_border">([\s\S]*?)<\/div>/g) || [];
    if (dotBorders[0]) {
      const metaText = dotBorders[0].replace(/<[^>]+>/g, '').trim();
      const parts = metaText.split(/[、,]/).map(p => p.trim());
      if (parts[0]) author = parts[0];
      if (parts[1]) publisher = parts[1];
      if (parts[2]) {
        eraString = parts[2];
        const yrMatch = eraString.match(/昭和(\d+)/);
        if (yrMatch) publishYear = 1925 + parseInt(yrMatch[1], 10);
        const tMatch = eraString.match(/大正(\d+)/);
        if (tMatch) publishYear = 1911 + parseInt(tMatch[1], 10);
        const mMatch = eraString.match(/明治(\d+)/);
        if (mMatch) publishYear = 1867 + parseInt(mMatch[1], 10);
      }
    }
    if (dotBorders[1]) {
      condition = dotBorders[1].replace(/<[^>]+>/g, '').trim();
    }

    if (price <= maxPrice) {
      items.push({
        id: 'kosho-' + (linkMatch[2] || Math.random().toString(36).substring(2, 8)),
        source: 'kosho',
        title,
        price,
        coverImage,
        externalUrl: fullLink,
        sellerName,
        author,
        publisher,
        eraString,
        publishYear: publishYear || 1935,
        condition,
        description: condition || '日本の古本屋出品戰前資料',
        crawledAt: Date.now(),
        matchedKeywords: [keyword]
      });
    }
  }

  return items;
}

// 2. Yahoo! 拍賣 (auctions.yahoo.co.jp) 走查解析
async function crawlYahoo(keyword, maxPrice = 1500, onLog) {
  const encKw = encodeURIComponent(keyword.includes('戦前') ? keyword : `戦前 ${keyword}`);
  const targetUrl = `https://auctions.yahoo.co.jp/search/search?p=${encKw}&max=${maxPrice}&s1=cbids&o1=a`;

  if (onLog) onLog('crawler', `［ヤフオク］連線走查：${targetUrl}`, 'yahoo');

  const resp = await fetchUrl(targetUrl);
  if (resp.statusCode !== 200) {
    throw new Error(`Yahoo! 拍賣 HTTP ${resp.statusCode}`);
  }

  const html = resp.data;
  const items = [];

  const chunks = html.split(/class="Product__detail"|class="Product\s/);

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];

    // 拍賣網址與標題
    const linkMatch = chunk.match(/href="([^"]*\/jp\/auction\/([a-zA-Z0-9]+))"/);
    const titleMatch = chunk.match(/class="Product__titleLink"[^>]*>([^<]+)<\/a>/) || chunk.match(/title="([^"]+)"/);
    if (!linkMatch || !titleMatch) continue;

    const fullLink = linkMatch[1];
    const auctionId = linkMatch[2];
    const title = titleMatch[1].trim();

    // 價格
    let price = 0;
    const priceMatch = chunk.match(/class="Product__priceValue"[^>]*>([\d,]+)円<\/span>/) || chunk.match(/([\d,]+)円/);
    if (priceMatch) {
      price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
    }

    // 圖片
    let coverImage = '';
    const imgMatch = chunk.match(/src="([^"]+auctions\.c\.yimg\.jp[^"]+)"/) || chunk.match(/data-src="([^"]+auctions\.c\.yimg\.jp[^"]+)"/);
    if (imgMatch) {
      coverImage = imgMatch[1];
    }

    // 出價與剩餘時間
    let bids = '0';
    const bidMatch = chunk.match(/class="Product__bid"[^>]*>(\d+)<\/span>/);
    if (bidMatch) bids = bidMatch[1];

    if (price <= maxPrice && title) {
      items.push({
        id: 'yahoo-' + auctionId,
        source: 'yahoo',
        title,
        price,
        coverImage,
        externalUrl: fullLink,
        sellerName: 'Yahoo!拍賣 個人出品 / 商店',
        eraString: '戦前推定',
        publishYear: 1940,
        condition: `出價：${bids} 次`,
        description: `Yahoo!拍賣 競標/即決品目。當前出價：${price}円`,
        crawledAt: Date.now(),
        matchedKeywords: [keyword]
      });
    }
  }

  return items;
}

// 3. Mercari (jp.mercari.com) 走查解析（直接走查 JSON 實體端點）
async function crawlMercari(keyword, maxPrice = 1500, onLog) {
  const encKw = keyword.includes('戦前') ? keyword : `戦前 ${keyword}`;
  const apiUrl = 'https://api.mercari.jp/v2/entities:search';

  if (onLog) onLog('crawler', `［メルカリ］走查檢索實體端點：語彙「${encKw}」`, 'mercari');

  const reqPayload = {
    pageSize: 50,
    searchCondition: {
      keyword: encKw,
      sort: 'SORT_PRICE',
      order: 'ORDER_ASC',
      status: ['STATUS_ON_SALE'],
      priceMin: 0,
      priceMax: maxPrice
    }
  };

  const resJson = await postJson(apiUrl, reqPayload, {
    'DNT': '1',
    'x-platform': 'web'
  });

  const items = [];
  if (resJson && resJson.items && Array.isArray(resJson.items)) {
    for (const raw of resJson.items) {
      const id = raw.id;
      const title = raw.name || raw.title || '';
      const price = parseInt(raw.price, 10) || 0;
      const thumb = (raw.thumbnails && raw.thumbnails[0]) ? raw.thumbnails[0] : '';
      const url = `https://jp.mercari.com/item/${id}`;

      if (price <= maxPrice && title) {
        items.push({
          id: 'mercari-' + id,
          source: 'mercari',
          title,
          price,
          coverImage: thumb,
          externalUrl: url,
          sellerName: 'メルカリ出品者',
          eraString: '戦前',
          publishYear: 1942,
          condition: '在售商品',
          description: `メルカリ在售古書。含運即購價格：${price}円`,
          crawledAt: Date.now(),
          matchedKeywords: [keyword]
        });
      }
    }
  }

  return items;
}

// 走查引擎主入口
async function runFullCrawl(config, onLog, onNewItem) {
  const keywords = config.keywords && config.keywords.length > 0 ? config.keywords : ['教科書', '戦前', '資料'];
  const maxPrice = config.maxPrice || 1500;
  const maxYear = config.maxYear || 1945;

  onLog('info', `〔走查發動〕開始全市場走查，價格上限：¥${maxPrice}，年代上限：${maxYear}年`);

  const results = [];

  // 走查 日本の古本屋
  if (config.enabledSites && config.enabledSites.kosho) {
    try {
      const kw = keywords[0] || '教科書';
      onLog('info', `［日本の古本屋］執行走查檢索...`, 'kosho');
      const koshoItems = await crawlKosho(kw, maxPrice, maxYear, onLog);
      onLog('success', `［日本の古本屋］走查收載完成，捕獲 ${koshoItems.length} 件古書`, 'kosho');
      for (const item of koshoItems) {
        results.push(item);
        if (onNewItem) onNewItem(item);
      }
    } catch (err) {
      onLog('warn', `［日本の古本屋］走查連線回報：${err.message}`, 'kosho');
    }
  }

  // 走查 Yahoo! 拍賣
  if (config.enabledSites && config.enabledSites.yahoo) {
    try {
      const kw = keywords[0] || '教科書';
      onLog('info', `［ヤフオク］執行拍賣走查檢索...`, 'yahoo');
      const yahooItems = await crawlYahoo(kw, maxPrice, onLog);
      onLog('success', `［ヤフオク］拍賣走查收載完成，捕獲 ${yahooItems.length} 件品目`, 'yahoo');
      for (const item of yahooItems) {
        results.push(item);
        if (onNewItem) onNewItem(item);
      }
    } catch (err) {
      onLog('warn', `［ヤフオク］拍賣走查回報：${err.message}`, 'yahoo');
    }
  }

  // 走查 Mercari
  if (config.enabledSites && config.enabledSites.mercari) {
    try {
      const kw = keywords[0] || '教科書';
      onLog('info', `［メルカリ］執行在售品目走查...`, 'mercari');
      const mercariItems = await crawlMercari(kw, maxPrice, onLog);
      onLog('success', `［メルカリ］走查收載完成，捕獲 ${mercariItems.length} 件古書`, 'mercari');
      for (const item of mercariItems) {
        results.push(item);
        if (onNewItem) onNewItem(item);
      }
    } catch (err) {
      onLog('warn', `［メルカリ］走查回報：${err.message}`, 'mercari');
    }
  }

  onLog('success', `〔巡行完了〕全市場本次走查總計收載 ${results.length} 筆古本資料。`);
  return results;
}

module.exports = {
  fetchUrl,
  postJson,
  crawlKosho,
  crawlYahoo,
  crawlMercari,
  runFullCrawl
};

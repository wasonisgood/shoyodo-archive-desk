const { chromium } = require('playwright-core');
const cheerio = require('cheerio');
const fs = require('fs');

const path = require('path');

// 其他電腦的瀏覽器安裝位置不一定相同：依環境變數組出所有常見路徑（Chrome 個人安裝、32/64 位元、Edge）
function browserCandidates() {
  const env = process.env;
  const roots = [env['ProgramFiles'], env['ProgramFiles(x86)'], env['LOCALAPPDATA'], 'C:\\Program Files', 'C:\\Program Files (x86)']
    .filter(Boolean);
  const list = [];
  if (env.SHOYODO_BROWSER) list.push(env.SHOYODO_BROWSER);
  roots.forEach(r => list.push(path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe')));
  roots.forEach(r => list.push(path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe')));
  roots.forEach(r => list.push(path.join(r, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')));
  return Array.from(new Set(list));
}

function getBrowserExecutable() {
  for (const p of browserCandidates()) {
    try { if (fs.existsSync(p)) return p; } catch (_) {}
  }
  throw new Error('未檢測到本機 Chrome 或 Edge 瀏覽器，無法進行真實巡行。請安裝 Google Chrome 或 Microsoft Edge，或以環境變數 SHOYODO_BROWSER 指定瀏覽器 exe 路徑。');
}

/**
 * 蕉葉堂 巡回台帳 — 實時真實古書爬蟲核心 (Playwright + Cheerio 混合引擎)
 * 專門針對：
 * 1. 日本の古本屋 (kosho.or.jp) - 年代 ≦ 1945, 價格 ≦ 1500
 * 2. Yahoo! 拍賣 (auctions.yahoo.co.jp) - 戰前品目, 價格 ≦ 1500
 * 3. 煤爐 (jp.mercari.com) - 在售商品, 價格 ≦ 1500
 */
class BrowserCrawlerEngine {
  constructor(options = {}) {
    // 預設為有頭模式（headless: false），確保 Mercari 與 日本古書網的反爬能 100% 順暢通過
    this.headless = options.headless !== undefined ? options.headless : false;
    this.browser = null;
    this.context = null;
  }

  async init() {
    if (!this.browser) {
      const exe = getBrowserExecutable();
      this.browser = await chromium.launch({
        executablePath: exe,
        headless: this.headless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
          '--window-size=1280,800'
        ]
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'ja-JP'
      });
    }
  }

  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {}
      this.browser = null;
      this.context = null;
    }
  }

  // 1. 日本の古本屋 (kosho.or.jp) 實地走查
  async crawlKosho(keyword, maxPrice = 1500, maxYear = 1945, onLog, onNewItem, onlyInStock = true) {
    await this.init();
    const page = await this.context.newPage();
    const items = [];

    try {
      const targetUrl = 'https://www.kosho.or.jp/products/list.php?mode=search_retry' +
        '&search_word=' + encodeURIComponent(keyword) +
        '&search_published_year_max=' + maxYear +
        '&search_price_max=' + maxPrice +
        (onlyInStock ? '&search_only_has_stock=1' : '') +
        '&search_orderby=price' +
        '&search_sorttype=asc' +
        '&search_page_max=50&search_pageno=1';

      if (onLog) onLog('crawler', `［日本の古本屋］連線檢索：語彙「${keyword}」年代≦${maxYear}年`, 'kosho');

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      // 等待 transactionid 重定向與頁面穩定
      await page.waitForTimeout(4000);

      // 古本屋會以 transactionid 再次跳轉；頁面仍在導航時 page.content() 會失敗，等待穩定後重試
      let html = '';
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
          html = await page.content();
          break;
        } catch (e) {
          if (attempt === 3) throw e;
          await page.waitForTimeout(1500);
        }
      }
      const $ = cheerio.load(html);
      const seenIds = new Set();

      $('a[href*="detail.php?product_id="]').each((i, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const m = href.match(/product_id=(\d+)/);
        if (!m) return;
        const pid = m[1];
        if (seenIds.has(pid)) return;

        const title = $a.text().trim();
        if (!title) return; // 略過純圖片 a
        seenIds.add(pid);

        // 向上尋找包含價格的父商品卡片
        let $box = $a.closest('.product_item');
        if (!$box.length) $box = $a.closest('.product_block');
        if (!$box.length) $box = $a.parents().filter((_, p) => $(p).find('.price').length > 0).first();

        let price = 0;
        let cover = '';
        let seller = '日本の古本屋 出品書店';
        let meta = '';
        let condition = '経年並';
        let eraString = '戦前';
        let yr = 1935;

        if ($box.length) {
          const priceText = $box.find('.price').text();
          const pMatch = priceText.match(/￥([\d,]+)/);
          if (pMatch) price = parseInt(pMatch[1].replace(/,/g, ''), 10);

          const $img = $box.find('.product_image img, img');
          cover = $img.attr('data-src') || $img.attr('src') || '';
          if (cover && !cover.startsWith('http')) {
            cover = 'https://www.kosho.or.jp' + (cover.startsWith('/') ? '' : '/') + cover;
          }

          const base = $box.find('.baseinfo a').text().trim() || $box.find('.baseinfo').text().replace(/\s+/g, ' ').trim();
          if (base) seller = base;

          const dots = $box.find('.dot_border');
          if (dots.length > 0) meta = dots.eq(0).text().trim();
          if (dots.length > 1) condition = dots.eq(1).text().trim() || condition;

          // 判斷年代
          if (meta.includes('昭和')) {
            const ym = meta.match(/昭和(\d+)/);
            if (ym) { yr = 1925 + parseInt(ym[1], 10); eraString = `昭和${ym[1]}年 (${yr})`; }
          } else if (meta.includes('大正')) {
            const ym = meta.match(/大正(\d+)/);
            if (ym) { yr = 1911 + parseInt(ym[1], 10); eraString = `大正${ym[1]}年 (${yr})`; }
          } else if (meta.includes('明治')) {
            const ym = meta.match(/明治(\d+)/);
            if (ym) { yr = 1867 + parseInt(ym[1], 10); eraString = `明治${ym[1]}年 (${yr})`; }
          }
        }

        const fullUrl = href.startsWith('http') ? href : 'https://www.kosho.or.jp' + (href.startsWith('/') ? '' : '/products/') + href;

        if (price > 0 && price <= maxPrice) {
          const item = {
            id: 'kosho-' + pid,
            source: 'kosho',
            title,
            price,
            coverImage: cover,
            externalUrl: fullUrl,
            sellerName: seller,
            eraString,
            publishYear: yr,
            condition,
            description: meta ? `${meta} ｜ 状態：${condition}` : condition,
            crawledAt: Date.now(),
            matchedKeywords: [keyword]
          };
          items.push(item);
          if (onNewItem) onNewItem(item);
        }
      });
    } catch (err) {
      if (onLog) onLog('warn', `［日本の古本屋］走查遇阻：${err.message}`, 'kosho');
    } finally {
      await page.close().catch(() => {});
    }

    return items;
  }

  // 2. Yahoo! 拍賣 (auctions.yahoo.co.jp) 實地走查
  async crawlYahoo(keyword, maxPrice = 1500, onLog, onNewItem) {
    await this.init();
    const page = await this.context.newPage();
    const items = [];

    try {
      const searchKw = keyword.includes('戦前') ? keyword : `戦前 ${keyword}`;
      const targetUrl = `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(searchKw)}&max=${maxPrice}&s1=cbids&o1=a`;

      if (onLog) onLog('crawler', `［ヤフオク］連線走查：語彙「${searchKw}」價格≦¥${maxPrice}`, 'yahoo');

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(3000);

      const html = await page.content();
      const $ = cheerio.load(html);
      const seenIds = new Set();

      $('a[href*="/jp/auction/"]').each((i, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const m = href.match(/\/auction\/([a-zA-Z0-9]+)/);
        if (!m) return;
        const aid = m[1];
        if (seenIds.has(aid)) return;

        const text = $a.text().trim();
        if (text.length < 5) return;
        seenIds.add(aid);

        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const title = lines[0] || text;

        let price = 0;
        const pMatch = text.match(/([\d,]+)円/);
        if (pMatch) price = parseInt(pMatch[1].replace(/,/g, ''), 10);

        const $img = $a.find('img').length ? $a.find('img') : $a.closest('li').find('img');
        const cover = $img.attr('data-src') || $img.attr('src') || '';
        const bids = text.match(/入札\s*(\d+)/) ? text.match(/入札\s*(\d+)/)[1] : '0';

        if (title && price > 0 && price <= maxPrice) {
          const item = {
            id: 'yahoo-' + aid,
            source: 'yahoo',
            title,
            price,
            coverImage: cover,
            externalUrl: href,
            sellerName: 'Yahoo!拍賣 出品者',
            eraString: '戦前推定',
            publishYear: 1941,
            condition: `入札：${bids} 件`,
            description: `Yahoo! オークション出品物。入札数：${bids} 件 ｜ 現在価格：¥${price}`,
            crawledAt: Date.now(),
            matchedKeywords: [keyword]
          };
          items.push(item);
          if (onNewItem) onNewItem(item);
        }
      });
    } catch (err) {
      if (onLog) onLog('warn', `［ヤフオク］走查遇阻：${err.message}`, 'yahoo');
    } finally {
      await page.close().catch(() => {});
    }

    return items;
  }

  // 3. Mercari 煤爐 (jp.mercari.com) 實地走查
  async crawlMercari(keyword, maxPrice = 1500, onLog, onNewItem) {
    await this.init();
    const page = await this.context.newPage();
    const items = [];
    const seenIds = new Set();

    try {
      const searchKw = keyword.includes('戦前') ? keyword : `戦前 ${keyword}`;
      const targetUrl = `https://jp.mercari.com/search?keyword=${encodeURIComponent(searchKw)}&price_max=${maxPrice}&status=on_sale&sort=price&order=asc`;

      if (onLog) onLog('crawler', `［メルカリ］連線走查：語彙「${searchKw}」價格≦¥${maxPrice}`, 'mercari');

      // 監聽並攔截 Mercari 後端 JSON 實體 API
      page.on('response', async res => {
        const u = res.url();
        if (u.includes('api.mercari.jp') && u.includes('entities:search')) {
          try {
            const json = await res.json();
            if (json.items && Array.isArray(json.items)) {
              json.items.forEach(m => {
                const id = m.id;
                if (seenIds.has(id)) return;
                seenIds.add(id);

                const price = parseInt(m.price, 10) || 0;
                const title = m.name || m.title || '';
                const thumb = (m.thumbnails && m.thumbnails[0]) || '';
                const fullUrl = `https://jp.mercari.com/item/${id}`;

                if (price > 0 && price <= maxPrice && title) {
                  const it = {
                    id: 'mercari-' + id,
                    source: 'mercari',
                    title,
                    price,
                    coverImage: thumb,
                    externalUrl: fullUrl,
                    sellerName: 'メルカリ出品者',
                    eraString: '戦前資料',
                    publishYear: 1942,
                    condition: '在售商品',
                    description: `メルカリ在售古書。含運即購價格：¥${price}`,
                    crawledAt: Date.now(),
                    matchedKeywords: [keyword]
                  };
                  items.push(it);
                  if (onNewItem) onNewItem(it);
                }
              });
            }
          } catch (e) {}
        }
      });

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(5000);

      // 若攔截未滿足，以 Cheerio DOM 備援解析
      if (items.length === 0) {
        const html = await page.content();
        const $ = cheerio.load(html);
        $('a[href*="/item/m"]').each((i, el) => {
          const $a = $(el);
          const href = $a.attr('href') || '';
          const m = href.match(/\/item\/(m\d+)/);
          if (!m) return;
          const mid = m[1];
          if (seenIds.has(mid)) return;
          seenIds.add(mid);

          const fullUrl = href.startsWith('http') ? href : 'https://jp.mercari.com' + href;
          const ariaLabel = $a.attr('aria-label') || '';
          const $img = $a.find('img');
          const alt = $img.attr('alt') || '';
          const title = (ariaLabel || alt || $a.text()).replace(/のサムネイル$/, '').trim();
          const cover = $img.attr('src') || '';

          let price = 300; // 煤爐最低起售價
          const pMatch = (ariaLabel + ' ' + $a.text()).match(/[¥￥]([\d,]+)/);
          if (pMatch) price = parseInt(pMatch[1].replace(/,/g, ''), 10);

          if (title && price <= maxPrice) {
            const it = {
              id: 'mercari-' + mid,
              source: 'mercari',
              title,
              price,
              coverImage: cover,
              externalUrl: fullUrl,
              sellerName: 'メルカリ出品者',
              eraString: '戦前資料',
              publishYear: 1942,
              condition: '在售商品',
              description: `メルカリ在售古書。含運即購價格：¥${price}`,
              crawledAt: Date.now(),
              matchedKeywords: [keyword]
            };
            items.push(it);
            if (onNewItem) onNewItem(it);
          }
        });
      }
    } catch (err) {
      if (onLog) onLog('warn', `［メルカリ］走查遇阻：${err.message}`, 'mercari');
    } finally {
      await page.close().catch(() => {});
    }

    return items;
  }

  // 完整走查週期：逐一走查「全部」抽出語彙，套用除外語彙並跨語彙去重
  async runFullCycle(config, onLog, onNewItem) {
    const keywords = (config.keywords || []).map(k => String(k).trim()).filter(Boolean);
    if (keywords.length === 0) keywords.push('戦前');
    const excludes = (config.excludeKeywords || []).map(k => String(k).trim()).filter(Boolean);
    const maxPrice = config.maxPrice || 1500;
    const maxYear = config.maxYear || 1945;
    const onlyInStock = config.onlyInStock !== false;
    const sites = config.enabledSites || {};

    if (onLog) onLog('info', `〔實行走查發動〕基準：年代≦${maxYear}年 ｜ 價格≦¥${maxPrice} ｜ 語彙 ${keywords.length} 個：「${keywords.join('、')}」` +
      (excludes.length ? ` ｜ 除外：「${excludes.join('、')}」` : '') + (onlyInStock ? ' ｜ 僅限在庫' : ''));

    const allFound = [];
    const seen = new Map(); // id -> item（跨語彙去重，合併命中語彙）
    let excludedCount = 0;

    const accept = (item) => {
      const text = `${item.title || ''} ${item.description || ''}`;
      if (excludes.some(x => text.includes(x))) { excludedCount++; return; }
      const prev = seen.get(item.id);
      if (prev) {
        (item.matchedKeywords || []).forEach(k => { if (!prev.matchedKeywords.includes(k)) prev.matchedKeywords.push(k); });
        return;
      }
      seen.set(item.id, item);
      allFound.push(item);
      if (onNewItem) onNewItem(item);
    };

    const runSite = async (siteKey, label, fn) => {
      if (!sites[siteKey]) return;
      const before = allFound.length;
      if (onLog) onLog('info', `［${label}］開始巡行檢索...`, siteKey);
      for (const kw of keywords) {
        try {
          await fn(kw);
        } catch (err) {
          if (onLog) onLog('warn', `［${label}］語彙「${kw}」走查失敗：${err.message}`, siteKey);
        }
      }
      if (onLog) onLog('success', `［${label}］巡行完畢，共收載 ${allFound.length - before} 件`, siteKey);
    };

    try {
      await runSite('kosho', '日本の古本屋', kw => this.crawlKosho(kw, maxPrice, maxYear, onLog, accept, onlyInStock));
      await runSite('yahoo', 'ヤフオク', kw => this.crawlYahoo(kw, maxPrice, onLog, accept));
      await runSite('mercari', 'メルカリ', kw => this.crawlMercari(kw, maxPrice, onLog, accept));
    } finally {
      // 每次巡行後關閉瀏覽器，避免背景常駐時長期佔用記憶體
      await this.close();
    }

    if (onLog) onLog('success', `〔巡行完了〕本次共收載 ${allFound.length} 件` + (excludedCount ? `（依除外語彙略過 ${excludedCount} 件）` : ''));
    return allFound;
  }
}

module.exports = {
  BrowserCrawlerEngine
};

import { CrawledItem, CrawlerConfig, CrawlLog, SourceSite } from '../types';
import { MOCK_CANDIDATE_POOL } from './mockData';

type LogCallback = (log: CrawlLog) => void;
type NewItemCallback = (item: CrawledItem) => void;

export interface RunOptions {
  cycleNo?: number;
  label?: string; // 日誌標題，例如「定期巡行」「単発巡行」
  listId: string; // 本次收載品項歸入的書單
}

export interface RunResult {
  busy?: boolean;
  success: boolean;
  count?: number;
  newCount?: number;
  error?: string;
}

// 真實爬蟲 IPC（Electron preload: window.crawlerControl）；網頁開發模式下為 undefined
const getCrawlerIPC = (): any =>
  typeof window !== 'undefined' ? (window as any).crawlerControl : undefined;

export class MockCrawlerEngine {
  private candidateIndex = 0;
  private logCallbacks: LogCallback[] = [];
  private newItemCallbacks: NewItemCallback[] = [];
  public lastRunTime: number | null = null;
  // 同一時間只跑一輪；進行中收到的品項一律歸入 currentListId
  private running = false;
  private currentListId: string | null = null;
  private busyCallbacks: Array<(busy: boolean) => void> = [];

  public get isBusy() {
    return this.running;
  }

  public onBusyChange(cb: (busy: boolean) => void) {
    this.busyCallbacks.push(cb);
  }

  private setBusy(b: boolean) {
    this.running = b;
    this.busyCallbacks.forEach((cb) => cb(b));
  }

  private tag(item: CrawledItem): CrawledItem {
    const listId = this.currentListId;
    if (!listId) return item;
    const prev = item.listIds || [];
    return { ...item, listIds: prev.includes(listId) ? prev : [...prev, listId] };
  }

  constructor() {
    // 綁定真實 Electron IPC 爬蟲事件監聽（preload 暴露的名稱為 crawlerControl）
    const ipc = getCrawlerIPC();
    if (ipc) {
      ipc.onLog((log: CrawlLog) => {
        this.logCallbacks.forEach(cb => cb(log));
      });
      ipc.onNewItem((item: CrawledItem) => {
        const tagged = this.tag(item);
        this.newItemCallbacks.forEach(cb => cb(tagged));
      });
    }
  }

  public onLog(cb: LogCallback) {
    this.logCallbacks.push(cb);
  }

  public onNewItem(cb: NewItemCallback) {
    this.newItemCallbacks.push(cb);
  }

  private emitLog(level: CrawlLog['level'], message: string, site?: SourceSite) {
    const log: CrawlLog = {
      id: 'log-' + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      level,
      site,
      message,
    };
    this.logCallbacks.forEach((cb) => cb(log));
  }

  public async runCrawlCycle(config: CrawlerConfig, opts: RunOptions): Promise<RunResult> {
    if (this.running) {
      return { success: false, busy: true, error: '上一輪巡行尚未結束' };
    }
    this.setBusy(true);
    this.currentListId = opts.listId;
    try {
      return await this.doRun(config, opts);
    } finally {
      this.currentListId = null;
      this.setBusy(false);
    }
  }

  private async doRun(config: CrawlerConfig, opts: RunOptions): Promise<RunResult> {
    const { cycleNo, label = '定期巡行' } = opts;
    this.lastRunTime = Date.now();
    this.emitLog('info', `〔${label}開始〕${cycleNo ? `第 ${cycleNo} 回 ` : ''}実行中`);
    this.emitLog('info', `走査基準：出版年代 ≦ ${config.maxYear}年（戦前） ｜ 価格 ≦ ¥${config.maxPrice.toLocaleString()}${config.onlyInStock ? ' ｜ 在庫有' : ''}`);

    const activeSites: SourceSite[] = [];
    if (config.enabledSites.kosho) activeSites.push('kosho');
    if (config.enabledSites.yahoo) activeSites.push('yahoo');
    if (config.enabledSites.mercari) activeSites.push('mercari');

    if (activeSites.length === 0) {
      this.emitLog('warn', '監視対象の市場が選択されていません。走査を待機します。');
      return { success: false, error: 'no-sites' };
    }

    // Electron 桌面環境：一律使用真實瀏覽器核心爬蟲；失敗時只回報，不再以模擬假資料充數
    const ipc = getCrawlerIPC();
    if (ipc) {
      try {
        const res = await ipc.startScan(config);
        if (res && res.success === false) {
          this.emitLog('warn', res.busy ? '上一輪巡行尚未結束，本次略過。' : `巡行未完成：${res.error || '未知錯誤'}`);
          return { success: false, busy: Boolean(res.busy), error: res.error };
        }
        return { success: true, count: res?.count, newCount: res?.newCount };
      } catch (err: any) {
        this.emitLog('warn', `真實爬蟲核心發生錯誤：${err?.message || err}`);
        return { success: false, error: String(err?.message || err) };
      }
    }

    // 以下僅限瀏覽器開發模式（無 Electron）的展示用模擬

    let found = 0;
    for (const site of activeSites) {
      if (await this.simulateSiteSearch(site, config)) found++;
    }

    this.emitLog('success', `〔巡行完了〕全対象市場の走査が終了しました。`);
    return { success: true, count: found, newCount: found };
  }

  private async simulateSiteSearch(site: SourceSite, config: CrawlerConfig): Promise<boolean> {
    const siteNames: Record<SourceSite, string> = {
      kosho: '日本の古本屋 (kosho.or.jp)',
      yahoo: 'Yahoo! オークション',
      mercari: 'メルカリ (jp.mercari.com)',
    };

    const targetUrl: Record<SourceSite, string> = {
      kosho: `https://www.kosho.or.jp/products/list.php?mode=search&search_price_max=${config.maxPrice}&search_only_has_stock=1`,
      yahoo: `https://auctions.yahoo.co.jp/search/search?max=${config.maxPrice}&va=${encodeURIComponent(config.keywords.slice(0, 2).join(' '))}`,
      mercari: `https://jp.mercari.com/search?keyword=${encodeURIComponent(config.keywords.slice(0, 2).join(' '))}&price_max=${config.maxPrice}`,
    };

    this.emitLog('crawler', `［${siteNames[site]}］巡行接続：${targetUrl[site]}`, site);

    // 模擬網絡延遲
    await new Promise((res) => setTimeout(res, 500));

    this.emitLog('crawler', `［${siteNames[site]}］HTTP 200 応答受領。書誌目録解析中...`, site);

    const sampleKeyword = config.keywords[Math.floor(Math.random() * config.keywords.length)] || '戦前';
    this.emitLog('info', `［${siteNames[site]}］抽出条件照合：語彙「${sampleKeyword}」合致検査完了`, site);

    // 機率性產生捕獲事件
    const shouldFindNew = Math.random() > 0.35;
    if (shouldFindNew && MOCK_CANDIDATE_POOL.length > 0) {
      const candidate = {
        ...MOCK_CANDIDATE_POOL[this.candidateIndex % MOCK_CANDIDATE_POOL.length],
        id: `crawled-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        crawledAt: Date.now(),
        source: site,
      };
      this.candidateIndex++;

      if ((candidate.publishYear ?? 0) <= config.maxYear && candidate.price <= config.maxPrice) {
        this.emitLog(
          'success',
          `【新着品目検出】${candidate.eraString} 『${candidate.title}』 (¥${candidate.price.toLocaleString()}) 出品：${candidate.sellerName}`,
          site
        );
        const tagged = this.tag(candidate);
        this.newItemCallbacks.forEach((cb) => cb(tagged));
        return true;
      }
    } else {
      this.emitLog('info', `［${siteNames[site]}］新規の条件合致品目はありません（既読または価格上限超過）。`, site);
    }
    return false;
  }

  // 排程由 App 依持久化的「下次巡行時間」統一管理，此處不再另開計時器（避免重複巡行）
}

export const mockCrawlerInstance = new MockCrawlerEngine();

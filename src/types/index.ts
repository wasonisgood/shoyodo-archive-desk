export type SourceSite = 'kosho' | 'yahoo' | 'mercari';

export type ListScope = 'regular' | 'private' | 'admin' | 'public';

export interface AdminSession {
  uid: string;
  name: string;
  email: string;
  token: string;
  role: string;
  authorizedAt: number;
  issuedBy?: string;
}

export interface RegularPatrolSchedule {
  intervalDays: number;
  lastRunAt: number;
  lastRunBy?: string;
  nextRunAt: number;
  status: 'idle' | 'running';
  runningInstanceId?: string;
  runningSince?: number;
}

export interface CrawledItem {
  id: string;
  source: SourceSite;
  title: string;
  originalTitle?: string;
  author?: string;
  publisher?: string;
  publishYear?: number | null;
  eraString?: string; // e.g. "昭和14年 (1939)"
  price: number; // JPY
  shippingNote?: string;
  condition?: string;
  description: string;
  coverImage?: string;
  externalUrl: string;
  sellerName: string;
  crawledAt: number;
  matchedKeywords: string[];
  listIds?: string[]; // 所屬書單（定期巡行＝'regular'，單次巡行＝各自訂書單 id）
  listScope?: ListScope;
  isPublic?: boolean;
  isNew?: boolean;
  bookmarked?: boolean;
  // 蕉葉文庫 典藏庫連通欄位
  inCollection?: boolean; // 館藏已有藏本（防撞警報）
  collectionShelfMark?: string; // 館藏索書號
  isWishMatch?: boolean; // 命中買家許願池
  matchedWishTitle?: string; // 許願書目名
  isProspect?: boolean; // 已登記為文庫採購候補
  ndlChecked?: boolean; // 已照會國會圖書館
  ndlUrl?: string;
  ndlPid?: string;
  ndlVerifiedTitle?: string;
}

export interface SharedBridgeData {
  books: Array<{
    id: string;
    shelfMark: string;
    title: string;
    author: string;
    publisher: string;
    year: number | null;
    category?: string;
    condition?: string;
    note?: string;
  }>;
  wishes: Array<{
    id: string;
    title: string;
    keywords?: string[];
    budget: { amount: number | null; currency: string };
    status: string;
    description: string;
  }>;
  prospects: Array<{
    id: string;
    title: string;
    author?: string;
    publisher?: string;
    year?: number | null;
    eraString?: string;
    price: number;
    source: SourceSite;
    externalUrl: string;
    coverImage?: string;
    addedAt: number;
    status?: 'candidate' | 'acquired' | 'dismissed';
    isPublic?: boolean;
    listScope?: ListScope;
  }>;
  lastSyncedAt: number;
}

export interface CrawlerConfig {
  enabledSites: {
    kosho: boolean;
    yahoo: boolean;
    mercari: boolean;
  };
  keywords: string[];
  excludeKeywords: string[];
  maxYear: number; // e.g. 1945
  maxPrice: number; // e.g. 1500
  intervalMinutes: number; // e.g. 30
  autoRun: boolean;
  onlyInStock: boolean;
  notifyOnNewFinds: boolean;
}

export interface CrawlLog {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'success' | 'crawler';
  site?: SourceSite;
  message: string;
}

// 書單：定期巡行固定收進「regular」；單次巡行若未指定，每次自動開一個新書單
export const REGULAR_LIST_ID = 'regular';

export interface CustomCrawlCriteria {
  keywords: string[];
  excludeKeywords: string[];
  enabledSites: { kosho: boolean; yahoo: boolean; mercari: boolean };
  maxYear: number;
  maxPrice: number;
  onlyInStock: boolean;
}

export interface Booklist {
  id: string;
  name: string;
  kind: 'regular' | 'custom';
  scope?: ListScope;
  ownerUid?: string;
  ownerName?: string;
  isPublic?: boolean;
  createdAt: number;
  lastRunAt?: number;
  runCount?: number;
  criteria?: CustomCrawlCriteria; // 最近一次單次巡行的條件（供「再巡行」沿用）
}

export interface CustomCrawlRequest {
  criteria: CustomCrawlCriteria;
  // 'new'：建立新書單（預設）；否則為既有書單 id
  target: 'new' | string;
  newListName?: string;
  scope?: ListScope;
}

// 巡行紀錄：每次定期／單次巡行一筆，供監視端末查閱
export interface RunRecord {
  id: string;
  kind: 'regular' | 'custom';
  cycleNo?: number;
  listId: string;
  listName: string;
  startedAt: number;
  endedAt?: number; // 未結束＝進行中
  status: 'running' | 'success' | 'failed' | 'skipped';
  count?: number; // 本次收載件數
  newCount?: number; // 其中首次出現
  error?: string;
  keywords: string[];
  sites: string[];
  maxPrice: number;
  maxYear: number;
}

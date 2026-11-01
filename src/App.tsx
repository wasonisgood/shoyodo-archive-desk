import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AdminSession,
  Booklist,
  CrawledItem,
  CrawlerConfig,
  CrawlLog,
  CustomCrawlRequest,
  ListScope,
  REGULAR_LIST_ID,
  RunRecord,
  SharedBridgeData,
} from './types';
import type { RunResult } from './mock/mockCrawlerService';
import { mockCrawlerInstance } from './mock/mockCrawlerService';

import { CustomWindowTitleBar } from './components/CustomWindowTitleBar';
import { HeaderNavigation, NavTab } from './components/HeaderNavigation';
import { ColophonFooter } from './components/ColophonFooter';
import { BookModal } from './components/BookModal';
import { OpeningSplashScreen } from './components/OpeningSplashScreen';
import { AdminAuthGate } from './components/AdminAuthGate';
import { verifyRemoteAdminStatus } from './lib/firebase';
import {
  tryAcquireRegularPatrolLock,
  finishRegularPatrolLock,
  syncCrawledItemsToFirestore,
  subscribeToCloudProspects,
  subscribeToPatrolSchedule,
  saveBooklistToFirestore,
  loadAccessibleBooklistsFromFirestore,
  updateListScopeInFirestore,
  toggleProspectPublicInFirestore,
} from './lib/patrolSyncService';
import { ResultsView } from './pages/ResultsView';
import { SettingsView } from './pages/SettingsView';
import { MonitorView } from './pages/MonitorView';
import { CustomCrawlView } from './pages/CustomCrawlView';

const STORAGE_KEY_ITEMS = 'shoyodo_archive_items_v1';
const STORAGE_KEY_CONFIG = 'shoyodo_archive_config_v1';
const STORAGE_KEY_CYCLES = 'shoyodo_archive_cycles_v1';
const STORAGE_KEY_BRIDGE_FALLBACK = 'shoyodo_shared_bridge_v1';
const STORAGE_KEY_NEXT_RUN = 'shoyodo_archive_next_run_at_v1';
const STORAGE_KEY_LAST_RUN = 'shoyodo_archive_last_run_at_v1';
const STORAGE_KEY_LISTS = 'shoyodo_archive_booklists_v1';
const STORAGE_KEY_SELECTED_LIST = 'shoyodo_archive_selected_list_v1';
const STORAGE_KEY_RUNS = 'shoyodo_archive_runs_v1';
const STORAGE_KEY_ADMIN_AUTH = 'shoyodo_archive_admin_auth_v1';
const RUNS_MAX = 500;

const REGULAR_LIST: Booklist = { id: REGULAR_LIST_ID, name: '定期巡行', kind: 'regular', createdAt: 0 };

const genId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const pad2 = (n: number) => String(n).padStart(2, '0');
const defaultListName = (keywords: string[], at: number) => {
  const d = new Date(at);
  const kw = keywords.slice(0, 3).join('・') || '単発巡行';
  return `${kw}（${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}）`;
};

const mkLog = (level: CrawlLog['level'], message: string): CrawlLog => ({
  id: 'log-' + Math.random().toString(36).substring(2, 9),
  timestamp: Date.now(),
  level,
  message,
});

// 舊版內建的示範品項（item-*）與模擬引擎產生的假品項（crawled-*）不是真實市場資料，載入時剔除
const isFakeItem = (it: CrawledItem) =>
  typeof it?.id === 'string' && (it.id.startsWith('item-') || it.id.startsWith('crawled-'));

const readNumber = (key: string): number | null => {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
};
const writeNumber = (key: string, value: number | null) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {}
};

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('catalogue');
  const [splashComplete, setSplashComplete] = useState<boolean>(false);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ADMIN_AUTH);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // 本地永久持久化載入（關閉重開不遺失歷史爬取結果）
  const [rawItems, setRawItems] = useState<CrawledItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ITEMS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed))
          // 舊資料沒有書單欄位：一律視為定期巡行收載
          return parsed
            .filter((it) => !isFakeItem(it))
            .map((it: CrawledItem) =>
              Array.isArray(it.listIds) && it.listIds.length > 0 ? it : { ...it, listIds: [REGULAR_LIST_ID] }
            );
      }
    } catch (e) {
      console.warn('載入台帳快取失敗，以空台帳啟動', e);
    }
    return [];
  });

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const adminSessionRef = useRef<AdminSession | null>(adminSession);
  adminSessionRef.current = adminSession;
  const rawItemsRef = useRef<CrawledItem[]>(rawItems);
  rawItemsRef.current = rawItems;

  const handleLogout = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY_ADMIN_AUTH);
    } catch {}
    const authControl = (window as any).authControl;
    if (authControl?.clearSession) {
      authControl.clearSession();
    }
    setAdminSession(null);
  }, []);

  const handleAdminAuthenticated = useCallback((session: AdminSession) => {
    try {
      localStorage.setItem(STORAGE_KEY_ADMIN_AUTH, JSON.stringify(session));
    } catch {}
    const authControl = (window as any).authControl;
    if (authControl?.saveSession) {
      authControl.saveSession(session);
    }
    setAdminSession(session);
  }, []);

  // 啟動時檢查本機 Electron userData 儲存之鑑札，並遠端向 Firestore 驗證邊界條件
  useEffect(() => {
    const initSession = async () => {
      let candidate = adminSession;
      const authControl = (window as any).authControl;
      if (!candidate && authControl?.getSession) {
        try {
          const loaded = await authControl.getSession();
          if (loaded && loaded.uid) {
            candidate = loaded;
            setAdminSession(loaded);
          }
        } catch {}
      }

      if (candidate && candidate.uid) {
        // 邊界條件：若管理者在雲端名錄已被除名，解除鑑札
        const valid = await verifyRemoteAdminStatus(candidate.uid);
        if (!valid) {
          console.warn('管理員鑑札已失效（未在雲端管理名冊內），執行退室');
          handleLogout();
        }
      }
    };
    initSession();
  }, [handleLogout]);

  // 管理者登入後，載入該管理員權限範圍內的所有雲端書單
  useEffect(() => {
    if (!adminSession) return;
    loadAccessibleBooklistsFromFirestore(adminSession.uid).then((sharedLists) => {
      if (sharedLists && sharedLists.length > 0) {
        setBooklists((prev) => {
          const existingIds = new Set(prev.map((l) => l.id));
          const toAdd = sharedLists.filter((l) => !existingIds.has(l.id));
          return [...prev, ...toAdd];
        });
      }
    });
  }, [adminSession]);

  // 即時監聽雲端共同巡行品項與排程排他狀態
  useEffect(() => {
    const unsubItems = subscribeToCloudProspects((cloudItems) => {
      if (!cloudItems || cloudItems.length === 0) return;
      setRawItems((prev) => {
        const itemMap = new Map<string, CrawledItem>();
        prev.forEach((it) => itemMap.set(it.id, it));
        cloudItems.forEach((it) => {
          if (!itemMap.has(it.id)) {
            itemMap.set(it.id, it);
          } else {
            const cur = itemMap.get(it.id)!;
            itemMap.set(it.id, {
              ...cur,
              price: it.price || cur.price,
              isPublic: it.isPublic ?? cur.isPublic,
              bookmarked: cur.bookmarked || it.bookmarked,
            });
          }
        });
        return Array.from(itemMap.values()).sort((a, b) => (b.crawledAt || 0) - (a.crawledAt || 0));
      });
    });

    const unsubSched = subscribeToPatrolSchedule((sched) => {
      if (sched.nextRunAt) setNextRunAt(sched.nextRunAt);
      if (sched.lastRunAt) setLastRunTime(sched.lastRunAt);
    });

    return () => {
      unsubItems();
      unsubSched();
    };
  }, []);

  // 書單（定期巡行固定一份 + 單次巡行自訂書單）
  const [booklists, setBooklists] = useState<Booklist[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LISTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const customs = parsed.filter((l: Booklist) => l && l.id && l.id !== REGULAR_LIST_ID);
          return [REGULAR_LIST, ...customs];
        }
      }
    } catch {}
    return [REGULAR_LIST];
  });
  const [selectedListId, setSelectedListId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_SELECTED_LIST) || 'all';
    } catch {
      return 'all';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_LISTS, JSON.stringify(booklists));
    } catch {}
  }, [booklists]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SELECTED_LIST, selectedListId);
    } catch {}
  }, [selectedListId]);
  // 選中的書單被刪除時回到「全部」
  useEffect(() => {
    if (selectedListId !== 'all' && !booklists.some((l) => l.id === selectedListId)) setSelectedListId('all');
  }, [booklists, selectedListId]);

  // 巡行紀錄（持久化，最多保留 RUNS_MAX 筆）
  const [runs, setRuns] = useState<RunRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RUNS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed))
          // 上次關閉時仍在進行的紀錄視為中斷
          return parsed.map((r: RunRecord) =>
            r.status === 'running' ? { ...r, status: 'failed' as const, error: r.error || '程式關閉，巡行中斷' } : r
          );
      }
    } catch {}
    return [];
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_RUNS, JSON.stringify(runs.slice(-RUNS_MAX)));
    } catch {}
  }, [runs]);

  const startRunRecord = (rec: Omit<RunRecord, 'id' | 'status'>): string => {
    const id = genId('run');
    setRuns((prev) => [...prev, { ...rec, id, status: 'running' as const }].slice(-RUNS_MAX));
    return id;
  };
  const finishRunRecord = (id: string, res: RunResult | null, err?: unknown) => {
    setRuns((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const status: RunRecord['status'] = err
          ? 'failed'
          : res?.busy
          ? 'skipped'
          : res?.success
          ? 'success'
          : 'failed';
        return {
          ...r,
          endedAt: Date.now(),
          status,
          count: res?.count,
          newCount: res?.newCount,
          error: err ? String((err as any)?.message || err) : res?.success ? undefined : res?.error,
        };
      })
    );
  };
  const sitesOf = (s: CrawlerConfig['enabledSites']) =>
    (Object.keys(s) as Array<keyof typeof s>).filter((k) => s[k]);

  // 巡行進行中狀態（同一時間只跑一輪；runningListId＝正在收進哪份書單）
  const [crawlBusy, setCrawlBusy] = useState(false);
  const [runningListId, setRunningListId] = useState<string | null>(null);
  useEffect(() => {
    mockCrawlerInstance.onBusyChange(setCrawlBusy);
  }, []);

  // 跨應用共享資料（蕉葉文庫 典藏藏本 + 買家許願池 + 市場見出候補）
  const [bridgeData, setBridgeData] = useState<SharedBridgeData | null>(null);

  // 本地永久持久化載入檢索配置
  const [config, setConfig] = useState<CrawlerConfig>(() => {
    const defaultCfg: CrawlerConfig = {
      enabledSites: {
        kosho: true,
        yahoo: true,
        mercari: true,
      },
      keywords: ['戦前', '教科書', '資料', '古書', '読本', '台湾', '朝鮮'],
      excludeKeywords: ['復刻版', 'オンデマンド', '文庫本'],
      maxYear: 1945,
      maxPrice: 1500,
      intervalMinutes: 4320, // 3 天（中核標準巡行週期）
      autoRun: true,
      onlyInStock: true,
      notifyOnNewFinds: true,
    };
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (saved) {
        return { ...defaultCfg, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('載入配置快取失敗，回退預設配置', e);
    }
    return defaultCfg;
  });

  const [logs, setLogs] = useState<CrawlLog[]>(() => [
    {
      id: 'init-1',
      timestamp: Date.now(),
      level: 'info',
      message: '巡回台帳 実行環境を初期化しました。',
    },
  ]);

  // 定期巡行開關＝config.autoRun（隨配置一起持久化，重開後維持上次的開/關狀態）
  const isRunning = config.autoRun !== false;
  const [totalCycles, setTotalCycles] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CYCLES);
      if (saved) return parseInt(saved, 10) || 0;
    } catch (e) {}
    return 0;
  });
  const [lastRunTime, setLastRunTime] = useState<number | null>(() => readNumber(STORAGE_KEY_LAST_RUN));
  // 下次巡行的絕對時間（持久化）：關閉程式或重開機後依然照原排程，逾期則啟動後立即補跑
  const [nextRunAt, setNextRunAt] = useState<number>(() => {
    const saved = readNumber(STORAGE_KEY_NEXT_RUN);
    if (saved) return saved;
    const last = readNumber(STORAGE_KEY_LAST_RUN);
    return (last ?? Date.now()) + config.intervalMinutes * 60 * 1000;
  });
  const [now, setNow] = useState(() => Date.now());
  const nextRunSeconds = Math.max(0, Math.round((nextRunAt - now) / 1000));

  // 連接跨應用資料橋樑 (Electron IPC 或 本地 HTTP 服務 fallback)
  useEffect(() => {
    const bridge = (window as any).bridgeControl;
    if (bridge && bridge.getSharedData) {
      bridge.getSharedData().then((data: SharedBridgeData) => {
        if (data) setBridgeData(data);
      });
      const unsub = bridge.onDataUpdated((data: SharedBridgeData) => {
        if (data) setBridgeData(data);
      });
      return unsub;
    } else {
      // 網頁開發模式或備援：從 HTTP 伺服器獲取
      fetch('http://127.0.0.1:48123/api/shared')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setBridgeData(data);
        })
        .catch(() => {
          try {
            const saved = localStorage.getItem(STORAGE_KEY_BRIDGE_FALLBACK);
            if (saved) setBridgeData(JSON.parse(saved));
          } catch (e) {}
        });
    }
  }, []);

  // 台帳品項永久持久化儲存
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(rawItems));
    } catch (e) {
      console.error('儲存台帳至本地儲存區失敗:', e);
    }
  }, [rawItems]);

  // 巡行配置永久持久化儲存
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
    } catch (e) {
      console.error('儲存配置至本地儲存區失敗:', e);
    }
  }, [config]);

  useEffect(() => writeNumber(STORAGE_KEY_NEXT_RUN, nextRunAt), [nextRunAt]);
  useEffect(() => writeNumber(STORAGE_KEY_LAST_RUN, lastRunTime), [lastRunTime]);

  // 巡行次數持久化儲存
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CYCLES, totalCycles.toString());
    } catch (e) {}
  }, [totalCycles]);

  // 根據 bridgeData (實體藏書、許願池、候補台帳) 實時動態標註品項 (Feature 1, 2, 3)
  const items = useMemo(() => {
    if (!bridgeData) return rawItems;

    return rawItems.map((item) => {
      // 1. 比對館藏防撞 (Feature 3: 館藏已有藏本 vs 文庫缺佚)
      const normTitle = (item.title || '').replace(/[\s《》〈〉［］\[\]（）()]/g, '').toLowerCase();
      const matchedBook = bridgeData.books?.find((b) => {
        const bTitle = (b.title || '').replace(/[\s《》〈〉［］\[\]（）()]/g, '').toLowerCase();
        return bTitle.length >= 3 && (normTitle.includes(bTitle) || bTitle.includes(normTitle));
      });

      // 2. 比對買家許願池 (Feature 2: 自動比對許願)
      let isWishMatch = false;
      let matchedWishTitle: string | undefined;
      if (bridgeData.wishes && bridgeData.wishes.length > 0) {
        for (const wish of bridgeData.wishes) {
          if (wish.status !== 'searching') continue;
          const kws = wish.keywords || [];
          const wishTitleNorm = (wish.title || '').replace(/[\s《》〈〉［］\[\]（）()]/g, '').toLowerCase();
          const titleMatches = wishTitleNorm.length >= 2 && normTitle.includes(wishTitleNorm);
          const kwMatches =
            kws.length > 0 &&
            kws.some((kw) => (kw ? item.title.includes(kw) || item.description?.includes(kw) : false));

          if (titleMatches || kwMatches) {
            isWishMatch = true;
            matchedWishTitle = wish.title;
            break;
          }
        }
      }

      // 3. 比對採購候補台帳 (Feature 1: 市場見出候補)
      const isProspect = bridgeData.prospects?.some(
        (p) =>
          p.id === item.id ||
          (p.externalUrl && item.externalUrl && p.externalUrl === item.externalUrl) ||
          p.title === item.title
      );

      return {
        ...item,
        inCollection: Boolean(matchedBook),
        collectionShelfMark: matchedBook?.shelfMark,
        isWishMatch,
        matchedWishTitle,
        isProspect: Boolean(isProspect),
      };
    });
  }, [rawItems, bridgeData]);

  const selectedItem = useMemo(() => {
    return items.find((i) => i.id === selectedItemId) || null;
  }, [items, selectedItemId]);

  useEffect(() => {
    mockCrawlerInstance.onLog((log) => {
      setLogs((prev) => [...prev, log]);
    });

    // 實體商品接收與跨週期「防重複／去重」機制
    mockCrawlerInstance.onNewItem((incomingItem) => {
      setRawItems((prev) => {
        const existingIndex = prev.findIndex((existing) => {
          if (existing.id && incomingItem.id && existing.id === incomingItem.id) {
            return true;
          }
          if (existing.externalUrl && incomingItem.externalUrl && existing.externalUrl === incomingItem.externalUrl) {
            return true;
          }
          if (existing.source === incomingItem.source && existing.title.trim() === incomingItem.title.trim()) {
            return true;
          }
          return false;
        });

        if (existingIndex !== -1) {
          const updated = [...prev];
          const curr = updated[existingIndex];
          const mergedLists = Array.from(new Set([...(curr.listIds || []), ...(incomingItem.listIds || [])]));
          updated[existingIndex] = {
            ...curr,
            listIds: mergedLists,
            price: incomingItem.price || curr.price,
            crawledAt: incomingItem.crawledAt || Date.now(),
            bookmarked: curr.bookmarked ?? false,
          };
          return updated;
        }

        // 全新品項：標記為新收錄並置頂収載，同時即時同步至雲端 Firestore 共享庫
        const regularList = booklistsRef.current.find((l) => l.id === REGULAR_LIST_ID) || REGULAR_LIST;
        syncCrawledItemsToFirestore([incomingItem], regularList, adminSessionRef.current).catch(() => {});
        return [{ ...incomingItem, isNew: true }, ...prev];
      });
    });
  }, []);

  const configRef = useRef(config);
  configRef.current = config;
  const cyclesRef = useRef(totalCycles);
  cyclesRef.current = totalCycles;

  const nextRunAtRef = useRef(nextRunAt);
  nextRunAtRef.current = nextRunAt;
  const booklistsRef = useRef(booklists);
  booklistsRef.current = booklists;

  const runCycleNow = useCallback(() => {
    if (mockCrawlerInstance.isBusy) {
      setLogs((prev) => [...prev, mkLog('warn', '巡行進行中のため、定期巡行の即時実行は見送りました。終了後に再度お試しください。')]);
      return;
    }
    const cfg = configRef.current;
    const started = Date.now();
    const cycleNo = cyclesRef.current + 1;
    setLastRunTime(started);
    setTotalCycles(cycleNo);
    setNextRunAt(started + cfg.intervalMinutes * 60 * 1000);
    setRunningListId(REGULAR_LIST_ID);
    const recId = startRunRecord({
      kind: 'regular',
      cycleNo,
      listId: REGULAR_LIST_ID,
      listName: '定期巡行',
      startedAt: started,
      keywords: cfg.keywords,
      sites: sitesOf(cfg.enabledSites),
      maxPrice: cfg.maxPrice,
      maxYear: cfg.maxYear,
    });
    mockCrawlerInstance
      .runCrawlCycle(cfg, { cycleNo, label: '定期巡行', listId: REGULAR_LIST_ID })
      .then(
        (res) => {
          finishRunRecord(recId, res);
          if (adminSessionRef.current) {
            finishRegularPatrolLock(adminSessionRef.current, res?.count || 0).catch(() => {});
          }
        },
        (err) => finishRunRecord(recId, null, err || 'error')
      )
      .finally(() => setRunningListId(null));
  }, []);

  // 單次巡行：依自訂目標走查一次，不影響定期排程；未指定書單時每次建立新書單
  const runCustomCrawl = useCallback((req: CustomCrawlRequest): string | null => {
    if (mockCrawlerInstance.isBusy) {
      setLogs((prev) => [...prev, mkLog('warn', '別の巡行が進行中です。終了後に単発巡行を実行してください。')]);
      return null;
    }
    const started = Date.now();
    const crit = req.criteria;
    let listId: string;
    let listName: string;
    if (req.target === 'new' || !booklistsRef.current.some((l) => l.id === req.target)) {
      listId = genId('list');
      listName = req.newListName?.trim() || defaultListName(crit.keywords, started);
      const created: Booklist = {
        id: listId,
        name: listName,
        kind: 'custom',
        createdAt: started,
        lastRunAt: started,
        runCount: 1,
        criteria: crit,
      };
      setBooklists((prev) => [...prev, created]);
    } else {
      listId = req.target;
      listName = booklistsRef.current.find((l) => l.id === listId)?.name || listId;
      setBooklists((prev) =>
        prev.map((l) =>
          l.id === listId ? { ...l, lastRunAt: started, runCount: (l.runCount || 0) + 1, criteria: crit } : l
        )
      );
    }

    // 以定期巡行配置為底（保留通知設定等），覆寫本次的自訂目標
    const cfg: CrawlerConfig = {
      ...configRef.current,
      keywords: crit.keywords,
      excludeKeywords: crit.excludeKeywords,
      enabledSites: crit.enabledSites,
      maxYear: crit.maxYear,
      maxPrice: crit.maxPrice,
      onlyInStock: crit.onlyInStock,
    };
    setLogs((prev) => [...prev, mkLog('info', `〔単発巡行〕収載先の書単：「${listName}」`)]);
    setRunningListId(listId);
    const recId = startRunRecord({
      kind: 'custom',
      listId,
      listName,
      startedAt: started,
      keywords: crit.keywords,
      sites: sitesOf(crit.enabledSites),
      maxPrice: crit.maxPrice,
      maxYear: crit.maxYear,
    });
    mockCrawlerInstance
      .runCrawlCycle(cfg, { label: '単発巡行', listId })
      .then(
        (res) => {
          finishRunRecord(recId, res);
        },
        (err) => finishRunRecord(recId, null, err || 'error')
      )
      .finally(() => setRunningListId(null));
    return listId;
  }, []);

  // 手動新增空白書單（之後可從書籍詳細歸類、或作為單次巡行的收載目標）
  const handleCreateList = (name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const id = genId('list');
    setBooklists((prev) => [...prev, { id, name: trimmed, kind: 'custom', createdAt: Date.now() }]);
    return id;
  };

  // 書籍詳細：把品項加入／移出某書單
  const handleToggleItemList = (itemId: string, listId: string) => {
    setRawItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const lists = it.listIds || [];
        return {
          ...it,
          listIds: lists.includes(listId) ? lists.filter((x) => x !== listId) : [...lists, listId],
        };
      })
    );
  };

  // 書單公開範圍切換（私人 / 管理員共有 / 一般公開）
  const handleUpdateListScope = useCallback((listId: string, newScope: 'private' | 'admin' | 'public') => {
    if (listId === REGULAR_LIST_ID) return;
    const targetList = booklists.find((l) => l.id === listId);
    setBooklists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, scope: newScope } : l))
    );
    updateListScopeInFirestore(listId, newScope, adminSessionRef.current, targetList?.name).catch(() => {});

    // 若設定為一般公開，將該書單內所有品項在雲端標記為 isPublic: true
    if (newScope === 'public') {
      const itemsInList = rawItemsRef.current.filter((it) => (it.listIds || []).includes(listId));
      itemsInList.forEach((it) => {
        toggleProspectPublicInFirestore(it.id, true, it.listIds).catch(() => {});
      });
      setRawItems((prev) =>
        prev.map((it) =>
          (it.listIds || []).includes(listId) ? { ...it, isPublic: true, bookmarked: true } : it
        )
      );
    }
  }, [booklists]);

  // 單一品項一鍵公開至前台「巡回書栞」
  const handleToggleItemPublic = useCallback((item: CrawledItem) => {
    const nextPublic = !item.isPublic;
    setRawItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, isPublic: nextPublic, bookmarked: nextPublic ? true : it.bookmarked } : it
      )
    );
    toggleProspectPublicInFirestore(item.id, nextPublic, item.listIds).catch(() => {});
  }, []);

  const handleRenameList = (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || id === REGULAR_LIST_ID) return;
    setBooklists((prev) => prev.map((l) => (l.id === id ? { ...l, name: trimmed } : l)));
  };

  // 刪除書單：只屬於該書單且未留書的品項一併移除，其餘品項僅解除歸屬
  const handleDeleteList = (id: string) => {
    if (id === REGULAR_LIST_ID) return;
    setBooklists((prev) => prev.filter((l) => l.id !== id));
    setRawItems((prev) =>
      prev.flatMap((it) => {
        const lists = it.listIds || [];
        if (!lists.includes(id)) return [it];
        const rest = lists.filter((x) => x !== id);
        if (rest.length === 0 && !it.bookmarked) return [];
        return [{ ...it, listIds: rest }];
      })
    );
  };

  // 每秒比對「下次巡行時間」；視窗收至系統匣時仍持續運作（單次巡行進行中則順延到結束後）
  useEffect(() => {
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (configRef.current.autoRun !== false && t >= nextRunAtRef.current && !mockCrawlerInstance.isBusy) {
        runCycleNow();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [runCycleNow]);

  // 變更巡行週期時，以上次巡行時間重新推算下次巡行
  const prevIntervalRef = useRef(config.intervalMinutes);
  useEffect(() => {
    if (prevIntervalRef.current === config.intervalMinutes) return;
    prevIntervalRef.current = config.intervalMinutes;
    setNextRunAt((lastRunTime ?? Date.now()) + config.intervalMinutes * 60 * 1000);
  }, [config.intervalMinutes, lastRunTime]);

  const handleTriggerManualCrawl = useCallback(() => {
    runCycleNow();
  }, [runCycleNow]);

  // 監聽 Windows 系統匣右鍵選單點擊「［ 巡行即時実行 ］」事件
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).desktopControl?.onTriggerCrawlFromTray) {
      const unsub = (window as any).desktopControl.onTriggerCrawlFromTray(() => {
        handleTriggerManualCrawl();
      });
      return unsub;
    }
  }, [handleTriggerManualCrawl]);

  const handleToggleScheduler = () => {
    const next = !isRunning;
    setConfig((prev) => ({ ...prev, autoRun: next }));
    setLogs((prev) => [
      ...prev,
      {
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        level: next ? 'info' : 'warn',
        message: next
          ? `巡行機関を再開しました。間隔：${Math.round(config.intervalMinutes / 1440)} 日毎に自動走査します。`
          : '巡行機関を一時休止しました。',
      },
    ]);
  };

  const handleToggleBookmark = (id: string) => {
    setRawItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, bookmarked: !it.bookmarked } : it))
    );
  };

  // Feature 1: 採購候補登記 / 解除操作
  const handleToggleProspect = async (item: CrawledItem) => {
    const bridge = (window as any).bridgeControl;
    if (item.isProspect) {
      // 移除候補
      if (bridge && bridge.removeProspect) {
        const updated = await bridge.removeProspect(item.id);
        if (updated) setBridgeData(updated);
      } else {
        // Fallback HTTP
        await fetch(`http://127.0.0.1:48123/api/prospects/${item.id}`, { method: 'DELETE' }).catch(() => {});
        setBridgeData((prev) =>
          prev ? { ...prev, prospects: prev.prospects.filter((p) => p.id !== item.id) } : null
        );
      }
    } else {
      // 新增候補
      const candidate = {
        id: item.id,
        title: item.title,
        author: item.author,
        publisher: item.publisher,
        year: item.publishYear,
        eraString: item.eraString,
        price: item.price,
        source: item.source,
        externalUrl: item.externalUrl,
        coverImage: item.coverImage,
        addedAt: Date.now(),
        status: 'candidate' as const,
      };

      if (bridge && bridge.addProspect) {
        const updated = await bridge.addProspect(candidate);
        if (updated) setBridgeData(updated);
      } else {
        await fetch('http://127.0.0.1:48123/api/prospects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(candidate),
        }).catch(() => {});
        setBridgeData((prev) =>
          prev ? { ...prev, prospects: [candidate, ...prev.prospects] } : null
        );
      }
    }
  };

  // Feature 1: 正式入庫至館藏 (實際到館確認後轉為 books)
  const handlePromoteToBook = async (item: CrawledItem, category = 'EDU', shelfMark?: string) => {
    const bookEntry = {
      id: `b-${Date.now()}`,
      shelfMark: shelfMark || `${item.publishYear || 1935}-${category}-${Math.floor(Math.random() * 899 + 100)}`,
      title: item.title,
      author: item.author || '未記載',
      publisher: item.publisher || '未記載',
      year: item.publishYear || 1935,
      category,
      condition: item.condition || 'good',
      acquiredAt: item.sellerName || '市場巡行採購',
      note: `巡行由 ${item.source} 購得（原價 ¥${item.price}）。${item.description || ''}`,
      forSale: false,
    };

    const bridge = (window as any).bridgeControl;
    if (bridge && bridge.promoteToBook) {
      const updated = await bridge.promoteToBook(bookEntry);
      if (updated) setBridgeData(updated);
    } else {
      await fetch('http://127.0.0.1:48123/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookEntry),
      }).catch(() => {});
      setBridgeData((prev) =>
        prev
          ? {
              ...prev,
              books: [bookEntry, ...prev.books],
              prospects: prev.prospects.filter((p) => p.id !== item.id && p.title !== item.title),
            }
          : null
      );
    }

    // 發送入庫成功通知
    const dt = (window as any).desktopControl;
    if (dt && dt.showNotification) {
      dt.showNotification({
        title: '【文庫典藏正式入庫】',
        body: `《${bookEntry.title}》已收編入藏，配賦索書號：${bookEntry.shelfMark}`,
      });
    }
  };

  const newItemCount = items.filter((i) => i.isNew).length;

  return (
    <div className="app-root-frame">
      {/* 開場開卷動畫遮罩 */}
      <OpeningSplashScreen onAnimationComplete={() => setSplashComplete(true)} />

      {/* 自繪頂部視窗控制邊緣與選單條 */}
      <CustomWindowTitleBar
        isRunning={isRunning}
        onTriggerManualCrawl={handleTriggerManualCrawl}
        onToggleScheduler={handleToggleScheduler}
        onSelectTab={setCurrentTab}
        adminSession={adminSession}
        onLogout={handleLogout}
      />

      {/* 鑑札認證閘門：未持有有效管理員鑑札時，阻斷進入主台帳畫面 */}
      {!adminSession ? (
        <AdminAuthGate onAuthenticated={handleAdminAuthenticated} />
      ) : (
        /* 標題列以下才是可捲動區（捲軸不再貫穿深墨選單列） */
        <div className="app-scroll-region">
          {/* 頂部天之細帶與報頭題字 */}
          <HeaderNavigation
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            itemCount={items.length}
            newItemCount={newItemCount}
            isRunning={isRunning}
            nextRunSeconds={nextRunSeconds}
            onTriggerManualCrawl={handleTriggerManualCrawl}
            onToggleScheduler={handleToggleScheduler}
            adminSession={adminSession}
            onLogout={handleLogout}
          />

      {/* 頁面主體 */}
      <main className="shell main-view-container">
        {currentTab === 'catalogue' && (
          <div className="page-view-transition">
            <ResultsView
              items={items}
              booklists={booklists}
              selectedListId={selectedListId}
              onSelectList={setSelectedListId}
              onRenameList={handleRenameList}
              onDeleteList={handleDeleteList}
              onCreateList={handleCreateList}
              onUpdateListScope={handleUpdateListScope}
              runningListId={runningListId}
              onSelectItem={(item) => setSelectedItemId(item.id)}
              onToggleBookmark={handleToggleBookmark}
            />
          </div>
        )}

        {currentTab === 'settings' && (
          <div className="page-view-transition">
            <SettingsView
              config={config}
              onSaveConfig={(newCfg) => setConfig((prev) => ({ ...newCfg, autoRun: prev.autoRun }))}
            />
          </div>
        )}

        {currentTab === 'expedition' && (
          <div className="page-view-transition">
            <CustomCrawlView
              config={config}
              booklists={booklists}
              items={items}
              crawlBusy={crawlBusy}
              runningListId={runningListId}
              onRun={runCustomCrawl}
              onOpenList={(id) => {
                setSelectedListId(id);
                setCurrentTab('catalogue');
              }}
              onDeleteList={handleDeleteList}
              onCreateList={handleCreateList}
            />
          </div>
        )}

        {currentTab === 'monitor' && (
          <div className="page-view-transition">
            <MonitorView
              logs={logs}
              runs={runs}
              onClearRuns={() => setRuns((prev) => prev.filter((r) => r.status === 'running'))}
              onOpenList={(id) => {
                if (!booklists.some((l) => l.id === id)) return;
                setSelectedListId(id);
                setCurrentTab('catalogue');
              }}
              booklists={booklists}
              isRunning={isRunning}
              onTriggerManualCrawl={handleTriggerManualCrawl}
              onClearLogs={() => setLogs([])}
            />
          </div>
        )}
      </main>

          {/* 底部奧付 */}
          <ColophonFooter
            totalCount={items.length}
            totalCycles={totalCycles}
            lastRunTime={lastRunTime}
          />
        </div>
      )}

      {/* 詳細品目彈窗 */}
      {selectedItem && (
        <BookModal
          item={selectedItem}
          onClose={() => setSelectedItemId(null)}
          onToggleBookmark={handleToggleBookmark}
          booklists={booklists}
          onToggleItemList={handleToggleItemList}
          onCreateList={handleCreateList}
          onToggleProspect={handleToggleProspect}
          onPromoteToBook={handlePromoteToBook}
          onTogglePublic={handleToggleItemPublic}
        />
      )}
    </div>
  );
};

export default App;

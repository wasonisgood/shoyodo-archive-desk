/**
 * 蕉葉堂 巡回台帳 — 雲端分散式巡行同步與排他協調中心
 * 
 * 核心規範：
 * 1. 嚴格與網站同一個 Firebase (kosho-gura) 架構對接。
 * 2. 定期巡行每 3 日一次，跨管理員與跨桌面端共同守護：
 *    - 接近時間由單一實例搶佔分散式鎖執行。
 *    - 其他實例偵測已在執行或甫完成時自動略過（「其他人都不要跑」）。
 * 3. 巡行結果自動去重存入 Firestore 雲端「prospects」，所有管理員共通共享。
 * 4. 自訂書單支援：私人 (private)、管理員共通 (admin)、一般使用者公開 (public)。
 */

import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  limit,
  orderBy,
} from 'firebase/firestore';
import {
  AdminSession,
  Booklist,
  CrawledItem,
  ListScope,
  REGULAR_LIST_ID,
  RegularPatrolSchedule,
} from '../types';

const SCHEDULE_DOC_ID = 'regular_schedule';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const LOCK_TIMEOUT_MS = 60 * 60 * 1000; // 鎖超時時間（1小時）

/** 產生確定性的品項 ID，避免多機器多輪次重複寫入 */
export const makeDeterministicItemId = (source: string, externalUrl: string, rawId?: string): string => {
  if (rawId && !rawId.startsWith('crawled-') && !rawId.startsWith('item-')) {
    return rawId;
  }
  // 取 URL 的安全 Base64 代碼
  try {
    const encoded = btoa(unescape(encodeURIComponent(externalUrl)))
      .replace(/[\/+=]/g, '_')
      .slice(0, 48);
    return `${source}-${encoded}`;
  } catch {
    return `${source}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
};

/**
 * 取得本機唯一的機器/實例代碼
 */
export const getClientInstanceId = (): string => {
  let id = localStorage.getItem('shoyodo_machine_instance_id');
  if (!id) {
    id = `desk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem('shoyodo_machine_instance_id', id);
  }
  return id;
};

/**
 * 嘗試取得每 3 日一次定期巡行執行鎖
 * 若已有其他應用程式／管理員正在執行或甫執行完畢，則回傳 false
 */
export async function tryAcquireRegularPatrolLock(admin: AdminSession): Promise<{
  acquired: boolean;
  reason?: string;
  schedule?: RegularPatrolSchedule;
}> {
  if (!db) {
    return { acquired: true, reason: '離線示範模式直接執行' };
  }

  const scheduleRef = doc(db, 'patrol_meta', SCHEDULE_DOC_ID);
  const instanceId = getClientInstanceId();
  const now = Date.now();

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(scheduleRef);
      if (!snap.exists()) {
        const initialSchedule: RegularPatrolSchedule = {
          intervalDays: 3,
          lastRunAt: 0,
          nextRunAt: now,
          status: 'running',
          runningInstanceId: instanceId,
          runningSince: now,
          lastRunBy: admin.name,
        };
        tx.set(scheduleRef, initialSchedule);
        return { acquired: true, schedule: initialSchedule };
      }

      const schedule = snap.data() as RegularPatrolSchedule;

      // 檢查是否已在執行中
      if (schedule.status === 'running') {
        const runningDuration = now - (schedule.runningSince || 0);
        if (runningDuration < LOCK_TIMEOUT_MS && schedule.runningInstanceId !== instanceId) {
          return {
            acquired: false,
            reason: `其他台帳正在巡行中（由 ${schedule.lastRunBy || '其他司書'} 執行中，已持續 ${Math.round(runningDuration / 60000)} 分鐘），本次略過。`,
            schedule,
          };
        }
      }

      // 檢查是否尚未到達 3 日週期
      if (schedule.nextRunAt && now < schedule.nextRunAt - 10 * 60 * 1000) {
        const remainingHours = Math.ceil((schedule.nextRunAt - now) / (60 * 60 * 1000));
        return {
          acquired: false,
          reason: `共同巡行週期尚未到達（距下次巡行尚有約 ${remainingHours} 小時，前次由 ${schedule.lastRunBy || '系統'} 完成），無須重複跑。`,
          schedule,
        };
      }

      // 成功獲得執行許可，更新為 running 狀態
      const updated: Partial<RegularPatrolSchedule> = {
        status: 'running',
        runningInstanceId: instanceId,
        runningSince: now,
        lastRunBy: admin.name,
      };
      tx.update(scheduleRef, updated);

      return {
        acquired: true,
        schedule: { ...schedule, ...updated } as RegularPatrolSchedule,
      };
    });
  } catch (err: any) {
    console.warn('嘗試取得定期巡行鎖失敗:', err);
    return { acquired: false, reason: err?.message || '雲端鎖衝突' };
  }
}

/**
 * 定期巡行完成後釋放鎖並更新下次執行時間（+3日）
 */
export async function finishRegularPatrolLock(
  admin: AdminSession,
  itemCount: number
): Promise<void> {
  if (!db) return;
  const scheduleRef = doc(db, 'patrol_meta', SCHEDULE_DOC_ID);
  const now = Date.now();
  const nextRunAt = now + THREE_DAYS_MS;

  try {
    await updateDoc(scheduleRef, {
      status: 'idle',
      lastRunAt: now,
      nextRunAt,
      lastRunBy: admin.name,
      lastRunItemsCount: itemCount,
      runningInstanceId: null,
      runningSince: null,
    });
  } catch (e) {
    console.warn('更新巡行排程中繼失敗:', e);
  }
}

/**
 * 將巡行獲得之品項寫入雲端 Firestore（共通去重）
 */
export async function syncCrawledItemsToFirestore(
  items: CrawledItem[],
  list: Booklist,
  admin?: AdminSession | null
): Promise<{ added: number; updated: number }> {
  if (!db || items.length === 0) return { added: 0, updated: 0 };

  const isPublic = list.scope === 'public';
  let added = 0;
  let updated = 0;

  for (const it of items) {
    const docId = makeDeterministicItemId(it.source, it.externalUrl, it.id);
    const itemRef = doc(db, 'prospects', docId);

    try {
      const existing = await getDoc(itemRef);
      const isAlreadyPublic = existing.exists() && existing.data()?.isPublic === true;

      const docPayload: Record<string, any> = {
        id: docId,
        title: it.title,
        price: it.price,
        source: it.source,
        externalUrl: it.externalUrl,
        addedAt: it.crawledAt || Date.now(),
        listId: list.id,
        listScope: list.scope || (list.id === REGULAR_LIST_ID ? 'regular' : 'private'),
        isPublic: isPublic || isAlreadyPublic || Boolean(it.bookmarked),
      };

      if (it.eraString) docPayload.eraString = it.eraString;
      if (it.publishYear) docPayload.year = it.publishYear;
      if (it.author) docPayload.author = it.author;
      if (it.publisher) docPayload.publisher = it.publisher;
      if (it.sellerName) docPayload.sellerName = it.sellerName;
      if (it.description) docPayload.description = it.description;
      if (it.coverImage) docPayload.coverImage = it.coverImage;
      if (it.matchedKeywords) docPayload.matchedKeywords = it.matchedKeywords;
      if (admin) {
        docPayload.crawledByUid = admin.uid;
        docPayload.crawledByName = admin.name;
      }

      if (!existing.exists()) {
        docPayload.status = 'candidate';
        await setDoc(itemRef, docPayload);
        added++;
      } else {
        // 保留使用者原本的審定狀態（例如已正式入庫 acquired 或已除外 dismissed）
        await setDoc(itemRef, docPayload, { merge: true });
        updated++;
      }
    } catch (e) {
      console.warn(`寫入雲端品項 ${docId} 失敗:`, e);
    }
  }

  return { added, updated };
}

/**
 * 雲端 Firestore 與本機雙向同步「巡行品項」
 */
export function subscribeToCloudProspects(
  onUpdate: (items: CrawledItem[]) => void
): () => void {
  if (!db) return () => {};

  const q = query(collection(db, 'prospects'), orderBy('addedAt', 'desc'), limit(500));
  return onSnapshot(
    q,
    (snapshot) => {
      const cloudItems: CrawledItem[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.status === 'dismissed') return; // 已除外略過
        cloudItems.push({
          id: docSnap.id,
          source: d.source || 'kosho',
          title: d.title || '無標題',
          price: d.price || 0,
          publishYear: d.year || null,
          eraString: d.eraString,
          author: d.author,
          publisher: d.publisher,
          sellerName: d.sellerName || '',
          description: d.description || '',
          coverImage: d.coverImage,
          externalUrl: d.externalUrl || '',
          crawledAt: d.addedAt || Date.now(),
          matchedKeywords: d.matchedKeywords || [],
          listIds: [d.listId || REGULAR_LIST_ID],
          listScope: d.listScope || 'regular',
          isPublic: d.isPublic === true,
          isProspect: true,
          bookmarked: Boolean(d.isPublic || d.bookmarked),
        });
      });
      onUpdate(cloudItems);
    },
    (err) => {
      console.warn('雲端巡行品項即時監聽異常:', err);
    }
  );
}

/**
 * 監聽共同巡行排程中繼狀態（下次時間、執行狀態）
 */
export function subscribeToPatrolSchedule(
  onUpdate: (sched: RegularPatrolSchedule) => void
): () => void {
  if (!db) return () => {};

  const ref = doc(db, 'patrol_meta', SCHEDULE_DOC_ID);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as RegularPatrolSchedule);
      }
    },
    (err) => {
      console.warn('監聽共同巡行排程異常:', err);
    }
  );
}

/**
 * 同步與儲存自訂書單至雲端
 */
export async function saveBooklistToFirestore(list: Booklist, admin?: AdminSession | null): Promise<void> {
  if (!db) return;
  try {
    const listRef = doc(db, 'patrol_lists', list.id);
    await setDoc(
      listRef,
      {
        id: list.id,
        name: list.name,
        kind: list.kind,
        scope: list.scope || 'private',
        createdAt: list.createdAt,
        lastRunAt: list.lastRunAt || null,
        runCount: list.runCount || 0,
        criteria: list.criteria || null,
        ownerUid: admin?.uid || list.ownerUid || null,
        ownerName: admin?.name || list.ownerName || null,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn('寫入雲端書單失敗:', e);
  }
}

/**
 * 載入雲端書單（依當前管理員權限篩選私人、管理員共通、公開書單）
 */
export async function loadAccessibleBooklistsFromFirestore(currentUid?: string): Promise<Booklist[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, 'patrol_lists'));
    const results: Booklist[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const scope: ListScope = data.scope || 'private';
      // 私人書單只顯示自己的；管理員共通與公開書單對所有管理員可見
      if (scope === 'private' && data.ownerUid && data.ownerUid !== currentUid) {
        return;
      }
      results.push({
        id: data.id,
        name: data.name,
        kind: data.kind || 'custom',
        scope,
        ownerUid: data.ownerUid,
        ownerName: data.ownerName,
        createdAt: data.createdAt || Date.now(),
        lastRunAt: data.lastRunAt,
        runCount: data.runCount,
        criteria: data.criteria,
      });
    });
    return results;
  } catch (e) {
    console.warn('讀取雲端書單失敗:', e);
    return [];
  }
}

/**
 * 更新書單的公開權限（私人 / 管理員共有 / 一般公開）
 */
export async function updateListScopeInFirestore(
  listId: string,
  newScope: ListScope,
  admin?: AdminSession | null,
  listName?: string
): Promise<void> {
  if (!db || !listId) return;
  try {
    const listRef = doc(db, 'patrol_lists', listId);
    await setDoc(
      listRef,
      {
        id: listId,
        ...(listName ? { name: listName } : {}),
        scope: newScope,
        updatedAt: Date.now(),
        updatedBy: admin?.name || null,
      },
      { merge: true }
    );
  } catch (e) {
    console.warn('更新書單公開權限失敗:', e);
  }
}

/**
 * 更新單一品項是否公開至前台「巡回書栞」
 */
export async function toggleProspectPublicInFirestore(
  itemId: string,
  isPublic: boolean,
  listIds?: string[]
): Promise<void> {
  if (!db || !itemId) return;
  try {
    const itemRef = doc(db, 'prospects', itemId);
    const updateData: Record<string, any> = {
      isPublic,
      bookmarked: isPublic ? true : false,
      updatedAt: Date.now(),
    };
    if (listIds && listIds.length > 0) {
      updateData.listIds = listIds;
      updateData.listId = listIds[0];
    }
    await setDoc(itemRef, updateData, { merge: true });
  } catch (e) {
    console.warn('更新品項公開狀態失敗:', e);
  }
}

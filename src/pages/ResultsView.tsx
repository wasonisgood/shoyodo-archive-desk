import React, { useState, useMemo, useEffect } from 'react';
import { Booklist, CrawledItem, REGULAR_LIST_ID, SourceSite } from '../types';
import { useI18n } from '../i18n';


// 目錄篩選條件與顯示模式記憶（重開程式後維持）
function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const storageKey = 'shoyodo_catalogue_filter_' + key;
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved != null) return JSON.parse(saved) as T;
    } catch {}
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {}
  }, [storageKey, value]);
  return [value, setValue];
}

interface Props {
  items: CrawledItem[];
  booklists: Booklist[];
  selectedListId: string; // 'all' 或書單 id
  onSelectList: (id: string) => void;
  onRenameList: (id: string, name: string) => void;
  onDeleteList: (id: string) => void;
  onCreateList: (name: string) => string | null;
  onUpdateListScope?: (id: string, scope: 'private' | 'admin' | 'public') => void;
  runningListId: string | null;
  onSelectItem: (item: CrawledItem) => void;
  onToggleBookmark: (id: string) => void;
}

export const ResultsView: React.FC<Props> = ({
  items: allItems,
  booklists,
  selectedListId,
  onSelectList,
  onRenameList,
  onDeleteList,
  onCreateList,
  onUpdateListScope,
  runningListId,
  onSelectItem,
  onToggleBookmark,
}) => {
  const { t } = useI18n();

  // 先依書單收窄，其餘篩選與計數都以此為母體
  const items = useMemo(
    () => (selectedListId === 'all' ? allItems : allItems.filter((it) => (it.listIds || []).includes(selectedListId))),
    [allItems, selectedListId]
  );
  const listCount = (id: string) => allItems.filter((it) => (it.listIds || []).includes(id)).length;
  const selectedList = booklists.find((l) => l.id === selectedListId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createInput, setCreateInput] = useState('');
  const submitCreate = () => {
    const id = onCreateList(createInput);
    if (id) onSelectList(id);
    setCreating(false);
    setCreateInput('');
  };
  useEffect(() => {
    setRenaming(null);
    setConfirmDelete(false);
  }, [selectedListId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSite, setSelectedSite] = usePersistentState<SourceSite | 'all'>('site', 'all');
  const [selectedEra, setSelectedEra] = usePersistentState<string>('era', 'all');
  const [maxPriceFilter, setMaxPriceFilter] = usePersistentState<number | null>('maxPrice', null);
  const [viewMode, setViewMode] = usePersistentState<'shelf' | 'ledger'>('viewMode', 'shelf');
  const [onlyBookmarks, setOnlyBookmarks] = usePersistentState<boolean>('onlyBookmarks', false);
  const [onlyWishMatches, setOnlyWishMatches] = usePersistentState<boolean>('onlyWish', false);
  const [onlyMissing, setOnlyMissing] = usePersistentState<boolean>('onlyMissing', false);
  const [onlyProspects, setOnlyProspects] = usePersistentState<boolean>('onlyProspects', false);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedSite !== 'all' && item.source !== selectedSite) return false;
      if (onlyBookmarks && !item.bookmarked) return false;
      if (onlyWishMatches && !item.isWishMatch) return false;
      if (onlyMissing && item.inCollection) return false;
      if (onlyProspects && !item.isProspect) return false;
      if (maxPriceFilter !== null && item.price > maxPriceFilter) return false;
      if (selectedEra !== 'all') {
        if (!item.matchedKeywords.includes(selectedEra) && !item.eraString?.includes(selectedEra)) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const text = [
          item.title,
          item.author,
          item.publisher,
          item.description,
          item.sellerName,
          item.collectionShelfMark,
          item.matchedWishTitle,
          ...item.matchedKeywords,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [items, selectedSite, selectedEra, maxPriceFilter, searchQuery, onlyBookmarks, onlyWishMatches, onlyMissing, onlyProspects]);

  const sourceCount = (s: SourceSite) => items.filter((i) => i.source === s).length;
  const wishMatchCount = items.filter((i) => i.isWishMatch).length;
  const missingCount = items.filter((i) => !i.inCollection).length;
  const prospectCount = items.filter((i) => i.isProspect).length;

  return (
    <div className="page">
      {/* 標題欄 */}
      <div className="section-head">
        <div>
          <p className="kicker">{t('cat.kicker')}</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '0.15em', margin: 0 }}>
            {t('cat.heading')}
          </h1>
        </div>
        <span className="aside" style={{ fontStyle: 'italic', fontFamily: 'var(--serif-en)', fontSize: '0.88rem' }}>
          Kosho Archive Desk
        </span>
      </div>

      <p className="muted" style={{ marginTop: -14, marginBottom: 28, fontSize: '0.84rem' }}>
        {t('cat.sub')}
      </p>

      {/* 兩欄目錄佈局 */}
      <div className="catalog">
        {/* 左側篩選器 (aside.filters) */}
        <aside className="filters">
          <div>
            <h3>{t('list.title')}</h3>
            <ul className="filter-list">
              <li>
                <button className={selectedListId === 'all' ? 'on' : ''} onClick={() => onSelectList('all')}>
                  <span>{t('list.all')}</span>
                  <span className="n">{allItems.length}</span>
                </button>
              </li>
              {booklists.map((l) => (
                <li key={l.id}>
                  <button className={selectedListId === l.id ? 'on' : ''} onClick={() => onSelectList(l.id)} title={l.criteria?.keywords.join('、')}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 6 }}>
                      {l.id === REGULAR_LIST_ID ? t('list.regular') : l.name}
                      {l.scope === 'public' && (
                        <span style={{ color: 'var(--shu)', fontSize: '0.68rem', marginLeft: 4 }} title="一般公開至前台巡回書栞">
                          〔公〕
                        </span>
                      )}
                      {l.scope === 'admin' && (
                        <span style={{ color: 'var(--ai)', fontSize: '0.68rem', marginLeft: 4 }} title="管理員共有">
                          〔共〕
                        </span>
                      )}
                      {runningListId === l.id && <span style={{ color: 'var(--shu)', fontSize: '0.72rem' }}> 〔{t('exp.running')}〕</span>}
                    </span>
                    <span className="n">{listCount(l.id)}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div style={{ marginTop: 6, fontSize: '0.8rem' }}>
              {creating ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type="text"
                    value={createInput}
                    autoFocus
                    placeholder={t('list.newPlaceholder')}
                    style={{ flex: 1, minWidth: 0, fontSize: '0.8rem' }}
                    onChange={(e) => setCreateInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitCreate();
                      else if (e.key === 'Escape') setCreating(false);
                    }}
                  />
                  <button className="btn btn-sm" disabled={!createInput.trim()} onClick={submitCreate}>
                    ✓
                  </button>
                </div>
              ) : (
                <button className="linklike" style={{ textDecoration: 'underline', color: 'var(--ai)' }} onClick={() => setCreating(true)}>
                  ＋{t('list.new')}
                </button>
              )}
            </div>

            {selectedList && selectedList.kind === 'custom' && (
              <div style={{ marginTop: 8, fontSize: '0.78rem' }}>
                {renaming === selectedList.id ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      type="text"
                      value={renameInput}
                      autoFocus
                      style={{ flex: 1, minWidth: 0, fontSize: '0.8rem' }}
                      onChange={(e) => setRenameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onRenameList(selectedList.id, renameInput);
                          setRenaming(null);
                        } else if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        onRenameList(selectedList.id, renameInput);
                        setRenaming(null);
                      }}
                    >
                      ✓
                    </button>
                  </div>
                ) : confirmDelete ? (
                  <div>
                    <p className="faint" style={{ margin: '0 0 6px' }}>{t('list.deleteHint')}</p>
                    <button
                      className="linklike"
                      style={{ color: 'var(--shu)', fontWeight: 600, textDecoration: 'underline', marginRight: 10 }}
                      disabled={runningListId === selectedList.id}
                      onClick={() => onDeleteList(selectedList.id)}
                    >
                      {t('list.confirmDelete')}
                    </button>
                    <button className="linklike" style={{ textDecoration: 'underline' }} onClick={() => setConfirmDelete(false)}>
                      {t('list.cancel')}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="linklike"
                      style={{ textDecoration: 'underline', color: 'var(--ai)' }}
                      onClick={() => {
                        setRenameInput(selectedList.name);
                        setRenaming(selectedList.id);
                      }}
                    >
                      {t('list.rename')}
                    </button>
                    <button
                      className="linklike"
                      style={{ textDecoration: 'underline', color: 'var(--shu)' }}
                      onClick={() => setConfirmDelete(true)}
                    >
                      {t('list.delete')}
                    </button>
                  </div>
                )}

                {/* 書單公開範圍切換 */}
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--hair)' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--ink-faint)', marginBottom: 4 }}>
                    公開範圍：
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 6px',
                        background: (!selectedList.scope || selectedList.scope === 'private') ? '#ded7c8' : undefined,
                        fontWeight: (!selectedList.scope || selectedList.scope === 'private') ? 700 : 400,
                      }}
                      onClick={() => onUpdateListScope && onUpdateListScope(selectedList.id, 'private')}
                      title="僅自己可見與操作"
                    >
                      私人
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 6px',
                        color: 'var(--ai)',
                        background: selectedList.scope === 'admin' ? '#d8e2ef' : undefined,
                        fontWeight: selectedList.scope === 'admin' ? 700 : 400,
                      }}
                      onClick={() => onUpdateListScope && onUpdateListScope(selectedList.id, 'admin')}
                      title="全體管理者共有共享"
                    >
                      管理員
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 6px',
                        color: 'var(--shu)',
                        background: selectedList.scope === 'public' ? '#f5d9d5' : undefined,
                        fontWeight: selectedList.scope === 'public' ? 700 : 400,
                        borderColor: selectedList.scope === 'public' ? 'var(--shu)' : undefined,
                      }}
                      onClick={() => onUpdateListScope && onUpdateListScope(selectedList.id, 'public')}
                      title="公開展示至前台「巡回書栞」供讀者瀏覽"
                    >
                      一般公開
                    </button>
                  </div>
                  {selectedList.scope === 'public' && (
                    <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--shu)' }}>
                      ※ 本清單品項已公開展示於前台「巡回書栞」。
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <h3>{t('set.marketTitle')}</h3>
            <ul className="filter-list">
              <li>
                <button
                  className={selectedSite === 'all' ? 'on' : ''}
                  onClick={() => setSelectedSite('all')}
                >
                  <span>{t('cat.allSources')}</span>
                  <span className="n">{items.length}</span>
                </button>
              </li>
              <li>
                <button
                  className={selectedSite === 'kosho' ? 'on' : ''}
                  onClick={() => setSelectedSite('kosho')}
                >
                  <span>{t('cat.sourceKosho')}</span>
                  <span className="n">{sourceCount('kosho')}</span>
                </button>
              </li>
              <li>
                <button
                  className={selectedSite === 'yahoo' ? 'on' : ''}
                  onClick={() => setSelectedSite('yahoo')}
                >
                  <span>{t('cat.sourceYahoo')}</span>
                  <span className="n">{sourceCount('yahoo')}</span>
                </button>
              </li>
              <li>
                <button
                  className={selectedSite === 'mercari' ? 'on' : ''}
                  onClick={() => setSelectedSite('mercari')}
                >
                  <span>{t('cat.sourceMercari')}</span>
                  <span className="n">{sourceCount('mercari')}</span>
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h3>{t('cat.itemYear')}</h3>
            <ul className="filter-list">
              {['all', '戦前', '明治', '大正', '昭和'].map((era) => (
                <li key={era}>
                  <button
                    className={selectedEra === era ? 'on' : ''}
                    onClick={() => setSelectedEra(era)}
                  >
                    <span>
                      {era === 'all'
                        ? t('cat.allEras')
                        : era === '戦前'
                        ? t('cat.eraSenzen')
                        : era === '明治'
                        ? t('cat.eraMeiji')
                        : era === '大正'
                        ? t('cat.eraTaisho')
                        : t('cat.eraShowa')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3>価格上限</h3>
            <ul className="filter-list">
              <li>
                <button
                  className={maxPriceFilter === null ? 'on' : ''}
                  onClick={() => setMaxPriceFilter(null)}
                >
                  <span>{t('cat.priceAll')}</span>
                </button>
              </li>
              <li>
                <button
                  className={maxPriceFilter === 1000 ? 'on' : ''}
                  onClick={() => setMaxPriceFilter(1000)}
                >
                  <span>{t('cat.price1000')}</span>
                </button>
              </li>
              <li>
                <button
                  className={maxPriceFilter === 1500 ? 'on' : ''}
                  onClick={() => setMaxPriceFilter(1500)}
                >
                  <span style={{ color: 'var(--shu)', fontWeight: 600 }}>{t('cat.price1500')}</span>
                </button>
              </li>
            </ul>
          </div>

          {/* 蕉葉文庫 典藏連通篩選 */}
          <div>
            <h3>文庫・許願連通篩選</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem' }}>
              <label className="check" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={onlyWishMatches}
                  onChange={(e) => setOnlyWishMatches(e.target.checked)}
                />
                <span style={{ color: '#85590c', fontWeight: 600 }}>
                  ★ {t('cat.onlyWishMatches')} ({wishMatchCount})
                </span>
              </label>

              <label className="check" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={onlyMissing}
                  onChange={(e) => setOnlyMissing(e.target.checked)}
                />
                <span style={{ color: 'var(--shu)', fontWeight: 600 }}>
                  {t('cat.onlyMissing')} ({missingCount})
                </span>
              </label>

              <label className="check" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={onlyProspects}
                  onChange={(e) => setOnlyProspects(e.target.checked)}
                />
                <span style={{ color: 'var(--wood)' }}>
                  {t('cat.onlyProspects')} ({prospectCount})
                </span>
              </label>

              <label className="check" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={onlyBookmarks}
                  onChange={(e) => setOnlyBookmarks(e.target.checked)}
                />
                <span>{t('cat.onlyBookmarks')}</span>
              </label>
            </div>
          </div>
        </aside>

        {/* 右側內容區 (section) */}
        <section>
          {/* 工具列 (toolbar) */}
          <div className="toolbar">
            <label className="field grow">
              <span>検 索</span>
              <input
                type="search"
                placeholder={t('cat.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>

            <div className="chips" role="group">
              <button
                className={'chip' + (viewMode === 'shelf' ? ' on' : '')}
                onClick={() => setViewMode('shelf')}
              >
                {t('cat.viewShelf')}
              </button>
              <button
                className={'chip' + (viewMode === 'ledger' ? ' on' : '')}
                onClick={() => setViewMode('ledger')}
              >
                {t('cat.viewLedger')}
              </button>
            </div>

            <span className="small muted gothic">
              {filteredItems.length} 冊 収載
            </span>
          </div>

          {/* 列表成果展示 */}
          {filteredItems.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <p className="empty" style={{ margin: '0 0 8px' }}>{t('cat.empty')}</p>
              <p className="small muted">{t('cat.emptySub')}</p>
            </div>
          ) : viewMode === 'shelf' ? (
            /* 書棚畫報卡片網格 */
            <div className="shop-grid">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="ware-card-link"
                  onClick={() => onSelectItem(item)}
                >
                  <div className="ware-cover-box">
                    <img src={item.coverImage} alt={item.title} loading="lazy" />
                    <span className={`source-stamp ${item.source}`}>
                      {item.source === 'kosho'
                        ? '〔日本の古本屋〕'
                        : item.source === 'yahoo'
                        ? '〔ヤフオク〕'
                        : '〔メルカリ〕'}
                    </span>
                    {item.isNew && <span className="new-seal">{t('cat.newBadge')}</span>}
                  </div>

                  <div className="ware-info">
                    {/* 連通狀態印記 */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                      {item.isWishMatch && (
                        <span
                          style={{
                            background: '#85590c',
                            color: '#fff9e6',
                            fontSize: '0.68rem',
                            padding: '1px 5px',
                            fontWeight: 600,
                            borderRadius: 1,
                          }}
                        >
                          ★ 許願相符
                        </span>
                      )}

                      {item.inCollection ? (
                        <span
                          style={{
                            background: '#4a433a',
                            color: '#fff',
                            fontSize: '0.68rem',
                            padding: '1px 5px',
                            borderRadius: 1,
                          }}
                          title={`館藏已有：${item.collectionShelfMark}`}
                        >
                          文庫藏本
                        </span>
                      ) : (
                        <span
                          style={{
                            background: 'var(--shu)',
                            color: '#fff',
                            fontSize: '0.68rem',
                            padding: '1px 5px',
                            borderRadius: 1,
                          }}
                        >
                          缺佚候補
                        </span>
                      )}

                      {item.isProspect && (
                        <span
                          style={{
                            border: '1px solid var(--wood)',
                            background: 'var(--paper-deep)',
                            color: 'var(--wood)',
                            fontSize: '0.68rem',
                            padding: '0 4px',
                          }}
                        >
                          已列候補
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--wood)', fontWeight: 600 }}>
                        {item.eraString}
                      </span>
                    </div>

                    <h3>{item.title}</h3>

                    <div className="ware-meta">
                      <div>{item.author || '編纂未記載'}</div>
                      <div style={{ color: 'var(--ink-faint)', fontSize: '0.74rem' }}>{item.sellerName}</div>
                    </div>

                    <div className="ware-price-row">
                      <span className={`ware-price ${item.price <= 1500 ? 'highlight' : ''}`}>
                        ¥{item.price.toLocaleString()}
                      </span>
                      <button
                        className="linklike small"
                        style={{ color: item.bookmarked ? 'var(--shu)' : 'var(--ink-faint)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleBookmark(item.id);
                        }}
                      >
                        {item.bookmarked ? `［${t('cat.btnBookmarked')}］` : `［${t('cat.btnBookmark')}］`}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* 台帳清單表格 */
            <div className="table-scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>印</th>
                    <th>市場</th>
                    <th>狀態</th>
                    <th>{t('cat.itemYear')}</th>
                    <th>書名・品目</th>
                    <th>{t('cat.itemAuthor')}</th>
                    <th>{t('cat.itemSeller')}</th>
                    <th style={{ textAlign: 'right' }}>価格</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onSelectItem(item)}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{ color: item.bookmarked ? 'var(--shu)' : 'var(--ink-faint)' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleBookmark(item.id);
                          }}
                        >
                          {item.bookmarked ? '●' : '○'}
                        </span>
                      </td>
                      <td className="small">
                        {item.source === 'kosho' ? '日本の古本屋' : item.source === 'yahoo' ? 'ヤフオク' : 'メルカリ'}
                      </td>
                      <td className="small" style={{ whiteSpace: 'nowrap' }}>
                        {item.isWishMatch && (
                          <span style={{ color: '#85590c', fontWeight: 600, marginRight: 4 }}>★許願</span>
                        )}
                        {item.inCollection ? (
                          <span style={{ color: 'var(--ink-soft)' }}>已有</span>
                        ) : (
                          <span style={{ color: 'var(--shu)', fontWeight: 600 }}>缺佚</span>
                        )}
                        {item.isProspect && (
                          <span style={{ color: 'var(--wood)', marginLeft: 4 }}>候補</span>
                        )}
                      </td>
                      <td className="num" style={{ fontWeight: 600, color: 'var(--wood)', whiteSpace: 'nowrap' }}>
                        {item.eraString}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {item.title}
                        {item.isNew && (
                          <span style={{ color: 'var(--shu)', fontSize: '0.72rem', marginLeft: 6 }}>
                            〔{t('cat.newBadge')}〕
                          </span>
                        )}
                      </td>
                      <td className="small">{item.author || item.publisher || '—'}</td>
                      <td className="small">{item.sellerName}</td>
                      <td
                        className="num"
                        style={{
                          textAlign: 'right',
                          color: item.price <= 1500 ? 'var(--shu)' : 'inherit',
                          fontWeight: 700,
                        }}
                      >
                        ¥{item.price.toLocaleString()}
                      </td>
                      <td>
                        <a
                          href={item.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          頁開く →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Booklist, CrawledItem, REGULAR_LIST_ID } from '../types';
import { useI18n } from '../i18n';
import { searchNdl, NdlRecord } from '../lib/ndlService';

interface Props {
  item: CrawledItem | null;
  onClose: () => void;
  onToggleBookmark: (id: string) => void;
  booklists?: Booklist[];
  onToggleItemList?: (itemId: string, listId: string) => void;
  onCreateList?: (name: string) => string | null;
  onToggleProspect?: (item: CrawledItem) => void;
  onPromoteToBook?: (item: CrawledItem, category?: string, shelfMark?: string) => void;
  onTogglePublic?: (item: CrawledItem) => void;
}

export const BookModal: React.FC<Props> = ({
  item,
  onClose,
  onToggleBookmark,
  booklists = [],
  onToggleItemList,
  onCreateList,
  onToggleProspect,
  onPromoteToBook,
  onTogglePublic,
}) => {
  const { t } = useI18n();
  const [ndlRecord, setNdlRecord] = useState<NdlRecord | null>(null);
  const [ndlLoading, setNdlLoading] = useState(false);
  const [ndlSearched, setNdlSearched] = useState(false);
  const [promotePromptOpen, setPromotePromptOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('EDU');
  const [customShelfMark, setCustomShelfMark] = useState('');
  const [newListInput, setNewListInput] = useState('');

  useEffect(() => {
    if (!item) {
      setNdlRecord(null);
      setNdlSearched(false);
      setPromotePromptOpen(false);
      return;
    }
    // 自動預填索書號
    const yr = item.publishYear || 1935;
    const cat = 'EDU';
    const rnd = Math.floor(Math.random() * 899 + 100);
    setCustomShelfMark(`${yr}-${cat}-${rnd}`);
  }, [item]);

  if (!item) return null;

  const siteNames = {
    kosho: '日本の古本屋',
    yahoo: 'Yahoo! オークション',
    mercari: 'メルカリ',
  };

  const handleQueryNdl = async () => {
    setNdlLoading(true);
    setNdlSearched(true);
    try {
      const records = await searchNdl(item.title, 1950);
      if (records && records.length > 0) {
        setNdlRecord(records[0]);
      } else {
        setNdlRecord(null);
      }
    } catch (e) {
      console.warn('NDL 照會失敗:', e);
      setNdlRecord(null);
    } finally {
      setNdlLoading(false);
    }
  };

  const handleConfirmPromote = () => {
    if (onPromoteToBook) {
      onPromoteToBook(item, selectedCategory, customShelfMark.trim());
      setPromotePromptOpen(false);
    }
  };

  return (
    <div className="colophon-dialog-overlay" onClick={onClose}>
      <div
        className="colophon-dialog-box"
        style={{ maxWidth: 860, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="colophon-close-btn" onClick={onClose} title="閉じる">
          ✕
        </button>

        {/* 頂部重要狀態印記欄 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {item.inCollection ? (
            <span
              style={{
                background: '#4a433a',
                color: '#fff',
                fontSize: '0.78rem',
                padding: '3px 10px',
                fontWeight: 600,
                letterSpacing: '0.05em',
                borderRadius: 2,
              }}
            >
              【文庫已有藏本：{item.collectionShelfMark || '館藏有'}】
            </span>
          ) : (
            <span
              style={{
                background: 'var(--shu)',
                color: '#fff',
                fontSize: '0.78rem',
                padding: '3px 10px',
                fontWeight: 600,
                letterSpacing: '0.05em',
                borderRadius: 2,
              }}
            >
              【文庫缺佚・優先候補】
            </span>
          )}

          {item.isWishMatch && (
            <span
              style={{
                background: '#85590c',
                color: '#fffae8',
                fontSize: '0.78rem',
                padding: '3px 10px',
                fontWeight: 600,
                letterSpacing: '0.05em',
                borderRadius: 2,
              }}
            >
              ★【買家許願相符：{item.matchedWishTitle}】
            </span>
          )}

          {item.isProspect && (
            <span
              style={{
                border: '1px solid var(--wood)',
                background: 'var(--paper-deep)',
                color: 'var(--wood)',
                fontSize: '0.78rem',
                padding: '2px 8px',
                fontWeight: 600,
              }}
            >
              【文庫採購候補・已記帳】
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          {/* 左側封面與操作按鈕群 */}
          <div style={{ width: 260, flexShrink: 0 }}>
            <div
              style={{
                width: '100%',
                height: 350,
                background: 'var(--paper-deep)',
                border: '1px solid var(--hair)',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <img
                src={item.coverImage}
                alt={item.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <span className={`source-stamp ${item.source}`}>
                〔{siteNames[item.source]}〕
              </span>
            </div>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <a
                href={item.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-shu"
                style={{ textAlign: 'center', justifyContent: 'center' }}
              >
                {t('cat.btnOpenOriginal')} →
              </a>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn"
                  style={{ flex: 1 }}
                  onClick={() => onToggleBookmark(item.id)}
                >
                  {item.bookmarked ? t('cat.btnBookmarked') : t('cat.btnBookmark')}
                </button>

                {onToggleProspect && (
                  <button
                    className="btn"
                    style={{
                      flex: 1.4,
                      background: item.isProspect ? '#eedfcc' : undefined,
                      borderColor: item.isProspect ? 'var(--wood)' : undefined,
                    }}
                    onClick={() => onToggleProspect(item)}
                  >
                    {item.isProspect ? t('modal.removeFromProspect') : t('modal.addToProspect')}
                  </button>
                )}
              </div>

              {/* 一鍵公開至前台巡回書栞 */}
              {onTogglePublic && (
                <button
                  type="button"
                  className="btn"
                  style={{
                    width: '100%',
                    marginTop: 6,
                    fontSize: '0.82rem',
                    color: item.isPublic ? 'var(--shu)' : 'var(--ink)',
                    borderColor: item.isPublic ? 'var(--shu)' : undefined,
                    background: item.isPublic ? '#fbf0ee' : undefined,
                    fontWeight: item.isPublic ? 600 : 400,
                  }}
                  onClick={() => onTogglePublic(item)}
                >
                  {item.isPublic ? '［ 已公開至巡回書栞（點擊撤回） ］' : '［ 公開展示至前台「巡回書栞」 ］'}
                </button>
              )}

              {/* 歸入書單 */}
              {onToggleItemList && (
                <div
                  style={{
                    marginTop: 4,
                    padding: '8px 10px',
                    border: '1px solid var(--hair)',
                    background: 'var(--paper-card)',
                    fontSize: '0.8rem',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--ink-soft)' }}>{t('list.assignTitle')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                    {booklists.map((l) => (
                      <label key={l.id} className="check" style={{ cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={(item.listIds || []).includes(l.id)}
                          onChange={() => onToggleItemList(item.id, l.id)}
                        />
                        <span>{l.id === REGULAR_LIST_ID ? t('list.regular') : l.name}</span>
                      </label>
                    ))}
                  </div>
                  {onCreateList && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      <input
                        type="text"
                        value={newListInput}
                        placeholder={t('list.newAndAdd')}
                        style={{ flex: 1, minWidth: 0, fontSize: '0.78rem' }}
                        onChange={(e) => setNewListInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          const id = onCreateList(newListInput);
                          if (id) {
                            onToggleItemList(item.id, id);
                            setNewListInput('');
                          }
                        }}
                      />
                      <button
                        className="btn btn-sm"
                        disabled={!newListInput.trim()}
                        onClick={() => {
                          const id = onCreateList(newListInput);
                          if (id) {
                            onToggleItemList(item.id, id);
                            setNewListInput('');
                          }
                        }}
                      >
                        ＋
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 正式入庫操作 (嚴格分流：僅限實際購得後確認才正式加入 books) */}
              {onPromoteToBook && (
                <div style={{ marginTop: 4 }}>
                  {!promotePromptOpen ? (
                    <button
                      className="btn"
                      style={{
                        width: '100%',
                        background: '#332b24',
                        color: '#f9f6f0',
                        fontSize: '0.8rem',
                        padding: '7px 8px',
                      }}
                      onClick={() => setPromotePromptOpen(true)}
                    >
                      {t('modal.promoteToBook')}
                    </button>
                  ) : (
                    <div
                      style={{
                        border: '1px solid var(--wood)',
                        background: 'var(--paper-deep)',
                        padding: '10px 12px',
                        fontSize: '0.78rem',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--wood)' }}>
                        典藏入庫確認（實體已到館）
                      </div>
                      <div style={{ marginBottom: 6 }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--ink-faint)' }}>
                          索書號 (ShelfMark)：
                        </label>
                        <input
                          type="text"
                          value={customShelfMark}
                          onChange={(e) => setCustomShelfMark(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '3px 6px',
                            border: '1px solid var(--hair)',
                            fontFamily: 'monospace',
                            fontSize: '0.78rem',
                            marginTop: 2,
                          }}
                        />
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--ink-faint)' }}>
                          文庫類別 (Category)：
                        </label>
                        <select
                          value={selectedCategory}
                          onChange={(e) => setSelectedCategory(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '3px 4px',
                            border: '1px solid var(--hair)',
                            background: '#fff',
                            fontSize: '0.78rem',
                            marginTop: 2,
                          }}
                        >
                          <option value="EDU">EDU - 教育・算術・教科書</option>
                          <option value="POL">POL - 政治・法規・官廳發行</option>
                          <option value="SCI">SCI - 博物・植物・科學技術</option>
                          <option value="LIT">LIT - 文學・手稿・詩歌小說</option>
                          <option value="GEO">GEO - 地理・滿洲臺灣・繪葉書</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-shu"
                          style={{ flex: 1, padding: '4px', fontSize: '0.75rem' }}
                          onClick={handleConfirmPromote}
                        >
                          確認收編入館
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          onClick={() => setPromotePromptOpen(false)}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 右側書誌諸元與國會圖書館權威照會 */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <p className="kicker" style={{ margin: '0 0 6px' }}>
              {siteNames[item.source]} ・ 巡行取得書誌
            </p>
            <h2 style={{ fontFamily: 'var(--mincho)', fontSize: '1.4rem', margin: '0 0 8px', lineHeight: 1.4 }}>
              {item.title}
            </h2>

            {item.originalTitle && (
              <p style={{ color: 'var(--ink-faint)', fontSize: '0.82rem', margin: '0 0 12px' }}>
                {t('cat.itemOriginal')}：{item.originalTitle}
              </p>
            )}

            <div
              style={{
                background: 'var(--paper-deep)',
                padding: '10px 16px',
                border: '1px solid var(--hair)',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>取得価格</span>
                <span
                  style={{
                    fontFamily: 'var(--serif-en)',
                    fontSize: '1.7rem',
                    fontWeight: 700,
                    color: item.price <= 1500 ? 'var(--shu)' : 'var(--ink)',
                  }}
                >
                  ¥{item.price.toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', marginTop: 2 }}>
                {item.shippingNote}
              </div>
            </div>

            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', marginBottom: 16 }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--hair)' }}>
                  <td style={{ padding: '6px 0', color: 'var(--ink-faint)', width: 90 }}>{t('cat.itemYear')}</td>
                  <td style={{ padding: '6px 0', fontWeight: 600, color: 'var(--wood)' }}>{item.eraString}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--hair)' }}>
                  <td style={{ padding: '6px 0', color: 'var(--ink-faint)' }}>{t('cat.itemAuthor')}</td>
                  <td style={{ padding: '6px 0' }}>{item.author || '—'}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--hair)' }}>
                  <td style={{ padding: '6px 0', color: 'var(--ink-faint)' }}>{t('cat.itemPublisher')}</td>
                  <td style={{ padding: '6px 0' }}>{item.publisher || '—'}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--hair)' }}>
                  <td style={{ padding: '6px 0', color: 'var(--ink-faint)' }}>{t('cat.itemSeller')}</td>
                  <td style={{ padding: '6px 0', fontWeight: 600 }}>{item.sellerName}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--hair)' }}>
                  <td style={{ padding: '6px 0', color: 'var(--ink-faint)' }}>{t('cat.itemCondition')}</td>
                  <td style={{ padding: '6px 0' }}>{item.condition}</td>
                </tr>
              </tbody>
            </table>

            {/* 國立國會圖書館 NDL 權威書誌區塊 (Feature 4) */}
            <div
              style={{
                border: '1px solid var(--hair)',
                background: '#fcfaf6',
                padding: '12px 14px',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink)' }}>
                  〔國立國會圖書館 NDL 權威書誌照會〕
                </span>
                <button
                  className="btn btn-sm"
                  style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                  onClick={handleQueryNdl}
                  disabled={ndlLoading}
                >
                  {ndlLoading ? t('modal.ndlSearching') : t('modal.ndlBtnSearch')}
                </button>
              </div>

              {ndlSearched && !ndlLoading && (
                <div>
                  {ndlRecord ? (
                    <div style={{ fontSize: '0.78rem', lineHeight: 1.6 }}>
                      <div style={{ color: 'var(--shu)', fontWeight: 600, marginBottom: 4 }}>
                        ✓ {t('modal.ndlFound')}
                      </div>
                      <div>
                        <strong>正式題名：</strong> {ndlRecord.title}
                      </div>
                      <div>
                        <strong>著者/責任者：</strong> {ndlRecord.creators.join(', ') || '—'}
                      </div>
                      <div>
                        <strong>出版者/年代：</strong> {ndlRecord.publisher || '—'}（{ndlRecord.year ? `${ndlRecord.year} 年` : '年代不詳'}）
                      </div>
                      {ndlRecord.extent && <div><strong>形態規模：</strong> {ndlRecord.extent}</div>}

                      {ndlRecord.pid && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{ fontFamily: 'monospace', color: 'var(--ink-soft)', background: '#eee8dc', padding: '1px 6px' }}>
                            PID: {ndlRecord.pid}
                          </span>
                          <a
                            href={`https://dl.ndl.go.jp/pid/${ndlRecord.pid}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--shu)', textDecoration: 'underline', fontWeight: 600 }}
                          >
                            {t('modal.ndlDigitalView')}
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: 'var(--ink-faint)' }}>
                      {t('modal.ndlNotFound')}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <p style={{ fontSize: '0.76rem', color: 'var(--ink-faint)', margin: '0 0 4px', letterSpacing: '0.08em' }}>
                {t('cat.itemDescription')}
              </p>
              <p style={{ fontSize: '0.84rem', lineHeight: 1.8, color: 'var(--ink-soft)', margin: 0 }}>
                {item.description}
              </p>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {item.matchedKeywords.map((kw) => (
                <span
                  key={kw}
                  style={{
                    fontSize: '0.7rem',
                    border: '1px solid var(--hair)',
                    padding: '1px 6px',
                    color: 'var(--ink-soft)',
                    background: 'var(--paper)',
                  }}
                >
                  #{kw}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

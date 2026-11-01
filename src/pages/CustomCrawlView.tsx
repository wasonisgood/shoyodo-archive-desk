import React, { useMemo, useState } from 'react';
import { Booklist, CrawledItem, CrawlerConfig, CustomCrawlCriteria, CustomCrawlRequest } from '../types';
import { useI18n } from '../i18n';

interface Props {
  config: CrawlerConfig;
  booklists: Booklist[];
  items: CrawledItem[];
  crawlBusy: boolean;
  runningListId: string | null;
  onRun: (req: CustomCrawlRequest) => string | null;
  onOpenList: (id: string) => void;
  onDeleteList: (id: string) => void;
  onCreateList: (name: string) => string | null;
}

const criteriaFromConfig = (c: CrawlerConfig): CustomCrawlCriteria => ({
  keywords: [],
  excludeKeywords: [...c.excludeKeywords],
  enabledSites: { ...c.enabledSites },
  maxYear: c.maxYear,
  maxPrice: c.maxPrice,
  onlyInStock: c.onlyInStock,
});

const SITES: Array<{ key: keyof CustomCrawlCriteria['enabledSites']; name: string }> = [
  { key: 'kosho', name: '日本の古本屋 (kosho.or.jp)' },
  { key: 'yahoo', name: 'Yahoo! オークション' },
  { key: 'mercari', name: 'メルカリ (Mercari)' },
];

const fmtDate = (ts?: number) => {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const CustomCrawlView: React.FC<Props> = ({
  config,
  booklists,
  items,
  crawlBusy,
  runningListId,
  onRun,
  onOpenList,
  onDeleteList,
  onCreateList,
}) => {
  const { t } = useI18n();
  const [crit, setCrit] = useState<CustomCrawlCriteria>(() => criteriaFromConfig(config));
  const [kwInput, setKwInput] = useState('');
  const [exInput, setExInput] = useState('');
  const [targetMode, setTargetMode] = useState<'new' | 'existing'>('new');
  const [newListName, setNewListName] = useState('');
  const [existingId, setExistingId] = useState<string>('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [createInput, setCreateInput] = useState('');

  const customLists = useMemo(
    () => booklists.filter((l) => l.kind === 'custom').sort((a, b) => (b.lastRunAt || b.createdAt) - (a.lastRunAt || a.createdAt)),
    [booklists]
  );
  const countByList = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((it) => (it.listIds || []).forEach((id) => m.set(id, (m.get(id) || 0) + 1)));
    return m;
  }, [items]);

  const addTo = (field: 'keywords' | 'excludeKeywords', raw: string) => {
    const words = raw
      .split(/[,、，\s]+/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (words.length === 0) return;
    setCrit((prev) => ({ ...prev, [field]: Array.from(new Set([...prev[field], ...words])) }));
  };
  const removeFrom = (field: 'keywords' | 'excludeKeywords', w: string) =>
    setCrit((prev) => ({ ...prev, [field]: prev[field].filter((x) => x !== w) }));

  const submit = (req: CustomCrawlRequest) => {
    if (req.criteria.keywords.length === 0) return setNotice({ kind: 'warn', text: t('exp.needKeyword') });
    if (!Object.values(req.criteria.enabledSites).some(Boolean))
      return setNotice({ kind: 'warn', text: t('exp.needSite') });
    const id = onRun(req);
    if (!id) return setNotice({ kind: 'warn', text: t('exp.busy') });
    setNotice({ kind: 'ok', text: t('exp.started') });
    // 新建的書單之後可直接「加入既有書單」再追加
    setNewListName('');
  };

  const handleRun = () => {
    // 輸入框中尚未按 Enter 的語彙一併納入
    let c = crit;
    const pendingKw = kwInput.split(/[,、，\s]+/).map((w) => w.trim()).filter(Boolean);
    const pendingEx = exInput.split(/[,、，\s]+/).map((w) => w.trim()).filter(Boolean);
    if (pendingKw.length || pendingEx.length) {
      c = {
        ...c,
        keywords: Array.from(new Set([...c.keywords, ...pendingKw])),
        excludeKeywords: Array.from(new Set([...c.excludeKeywords, ...pendingEx])),
      };
      setCrit(c);
      setKwInput('');
      setExInput('');
    }
    const target = targetMode === 'existing' && existingId ? existingId : 'new';
    submit({ criteria: c, target, newListName: target === 'new' ? newListName : undefined });
  };

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <p className="kicker">{t('exp.kicker')}</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '0.15em', margin: 0 }}>{t('exp.heading')}</h1>
        </div>
        <span className="aside" style={{ fontStyle: 'italic', fontFamily: 'var(--serif-en)', fontSize: '0.88rem' }}>
          One-off Expedition
        </span>
      </div>

      <p className="muted" style={{ marginTop: -14, marginBottom: 24, fontSize: '0.84rem' }}>
        {t('exp.sub')}
      </p>

      {notice && (
        <div
          className="notice"
          style={{ marginBottom: 24, ...(notice.kind === 'warn' ? { borderColor: 'var(--shu)', color: 'var(--shu)' } : {}) }}
        >
          {notice.text}
        </div>
      )}

      {/* 區塊一：巡行目標 */}
      <div className="settings-box">
        <h2 className="settings-box-title">
          <span>{t('exp.targetTitle')}</span>
          <button
            type="button"
            className="linklike small"
            style={{ color: 'var(--ai)', textDecoration: 'underline', cursor: 'pointer' }}
            onClick={() => setCrit((prev) => ({ ...prev, keywords: Array.from(new Set([...prev.keywords, ...config.keywords])) }))}
          >
            {t('exp.copyRegular')}
          </button>
        </h2>

        <div className="form-grid">
          <div className="span-6 field">
            <span>{t('exp.kwLabel')}</span>
            <div className="kw-tag-box">
              {crit.keywords.map((kw) => (
                <span key={kw} className="kw-tag">
                  {kw}
                  <span className="del-btn" onClick={() => removeFrom('keywords', kw)}>
                    ×
                  </span>
                </span>
              ))}
              <input
                type="text"
                className="kw-input-inline"
                placeholder={t('exp.kwPlaceholder')}
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTo('keywords', kwInput);
                    setKwInput('');
                  }
                }}
              />
            </div>
          </div>

          <div className="span-6 field" style={{ marginTop: 12 }}>
            <span>{t('set.excludeTitle')}</span>
            <div className="kw-tag-box">
              {crit.excludeKeywords.map((kw) => (
                <span key={kw} className="kw-tag exclude">
                  −{kw}
                  <span className="del-btn" onClick={() => removeFrom('excludeKeywords', kw)}>
                    ×
                  </span>
                </span>
              ))}
              <input
                type="text"
                className="kw-input-inline"
                placeholder={t('set.excludePlaceholder')}
                value={exInput}
                onChange={(e) => setExInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTo('excludeKeywords', exInput);
                    setExInput('');
                  }
                }}
              />
            </div>
          </div>

          <div className="span-6" style={{ marginTop: 16 }}>
            {SITES.map((s) => (
              <div className="market-row" key={s.key}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={crit.enabledSites[s.key]}
                    onChange={(e) =>
                      setCrit((prev) => ({ ...prev, enabledSites: { ...prev.enabledSites, [s.key]: e.target.checked } }))
                    }
                  />
                  <span className="site-name">{s.name}</span>
                </label>
              </div>
            ))}
          </div>

          <label className="field span-3">
            <span>{t('set.yearLimit')}</span>
            <input
              type="number"
              value={crit.maxYear}
              onChange={(e) => setCrit((prev) => ({ ...prev, maxYear: Number(e.target.value) || 1945 }))}
            />
          </label>

          <label className="field span-3">
            <span>{t('set.priceLimit')}</span>
            <input
              type="number"
              value={crit.maxPrice}
              onChange={(e) => setCrit((prev) => ({ ...prev, maxPrice: Number(e.target.value) || 1500 }))}
            />
          </label>

          <div className="span-6" style={{ marginTop: 8 }}>
            <label className="check">
              <input
                type="checkbox"
                checked={crit.onlyInStock}
                onChange={(e) => setCrit((prev) => ({ ...prev, onlyInStock: e.target.checked }))}
              />
              <span>{t('set.koshoInStock')}</span>
            </label>
          </div>
        </div>
      </div>

      {/* 區塊二：收載書單 */}
      <div className="settings-box">
        <h2 className="settings-box-title">
          <span>{t('exp.listTitle')}</span>
        </h2>

        <div className="form-grid">
          <div className="span-6" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="check">
              <input type="radio" name="exp-target" checked={targetMode === 'new'} onChange={() => setTargetMode('new')} />
              <span>{t('exp.targetNew')}</span>
            </label>
            {targetMode === 'new' && (
              <label className="field" style={{ marginLeft: 26 }}>
                <span>{t('exp.newListName')}</span>
                <input type="text" value={newListName} onChange={(e) => setNewListName(e.target.value)} />
                <span className="faint small">{t('exp.targetNewHint')}</span>
              </label>
            )}

            <label className="check">
              <input
                type="radio"
                name="exp-target"
                checked={targetMode === 'existing'}
                disabled={customLists.length === 0}
                onChange={() => {
                  setTargetMode('existing');
                  if (!existingId && customLists[0]) setExistingId(customLists[0].id);
                }}
              />
              <span>
                {t('exp.targetExisting')}
                {customLists.length === 0 && <span className="faint small">（{t('exp.noCustomLists')}）</span>}
              </span>
            </label>
            {targetMode === 'existing' && customLists.length > 0 && (
              <label className="field" style={{ marginLeft: 26 }}>
                <select value={existingId} onChange={(e) => setExistingId(e.target.value)}>
                  {customLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}（{countByList.get(l.id) || 0}）
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="span-6" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              type="button"
              className="btn btn-shu"
              style={{ padding: '10px 32px' }}
              disabled={crawlBusy}
              onClick={handleRun}
            >
              {crawlBusy ? t('exp.btnRunning') : t('exp.btnRun')}
            </button>
            {crawlBusy && <span className="small muted">{t('exp.busy')}</span>}
          </div>
        </div>
      </div>

      {/* 區塊三：自訂書單一覽 */}
      <div className="settings-box">
        <h2 className="settings-box-title">
          <span>{t('exp.historyTitle')}</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', fontWeight: 400 }}>{customLists.length}</span>
        </h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, maxWidth: 420 }}>
          <input
            type="text"
            value={createInput}
            placeholder={t('list.newPlaceholder')}
            style={{ flex: 1, minWidth: 0 }}
            onChange={(e) => setCreateInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && onCreateList(createInput)) setCreateInput('');
            }}
          />
          <button
            className="btn btn-sm"
            disabled={!createInput.trim()}
            onClick={() => onCreateList(createInput) && setCreateInput('')}
          >
            ＋{t('list.new')}
          </button>
        </div>

        {customLists.length === 0 ? (
          <p className="small muted">{t('exp.noCustomLists')}</p>
        ) : (
          <div className="table-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>{t('exp.colName')}</th>
                  <th>{t('exp.colKeywords')}</th>
                  <th style={{ textAlign: 'right' }}>{t('exp.colCount')}</th>
                  <th>{t('exp.colLast')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customLists.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>
                      {l.name}
                      {runningListId === l.id && (
                        <span style={{ color: 'var(--shu)', fontSize: '0.72rem', marginLeft: 6 }}>〔{t('exp.running')}〕</span>
                      )}
                    </td>
                    <td className="small">{l.criteria?.keywords.join('、') || <span className="faint">{t('list.manual')}</span>}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {countByList.get(l.id) || 0}
                    </td>
                    <td className="small num" style={{ whiteSpace: 'nowrap' }}>
                      {fmtDate(l.lastRunAt || l.createdAt)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => onOpenList(l.id)}>
                        {t('exp.btnOpen')}
                      </button>
                      <button
                        className="btn btn-sm"
                        disabled={crawlBusy || !l.criteria}
                        onClick={() => l.criteria && submit({ criteria: l.criteria, target: l.id })}
                      >
                        {t('exp.btnRerun')}
                      </button>
                      <button
                        className="btn btn-sm"
                        disabled={!l.criteria}
                        onClick={() => {
                          if (!l.criteria) return;
                          setCrit(l.criteria);
                          setTargetMode('existing');
                          setExistingId(l.id);
                          window.scrollTo?.({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        {t('exp.btnLoad')}
                      </button>
                      {confirmDeleteId === l.id ? (
                        <button
                          className="btn btn-sm"
                          style={{ color: 'var(--shu)', borderColor: 'var(--shu)' }}
                          disabled={runningListId === l.id}
                          onClick={() => {
                            onDeleteList(l.id);
                            setConfirmDeleteId(null);
                            if (existingId === l.id) setExistingId('');
                          }}
                          onBlur={() => setConfirmDeleteId(null)}
                        >
                          {t('exp.btnConfirmDelete')}
                        </button>
                      ) : (
                        <button className="btn btn-sm" onClick={() => setConfirmDeleteId(l.id)}>
                          {t('exp.btnDelete')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="faint small" style={{ marginTop: 8 }}>
              {t('list.deleteHint')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

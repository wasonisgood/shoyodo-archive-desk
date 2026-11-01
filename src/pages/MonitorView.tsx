import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Booklist, CrawlLog, RunRecord } from '../types';
import { useI18n } from '../i18n';

interface Props {
  logs: CrawlLog[];
  runs: RunRecord[];
  booklists: Booklist[];
  onClearRuns: () => void;
  onOpenList: (id: string) => void;
  isRunning: boolean;
  onTriggerManualCrawl: () => void;
  onClearLogs: () => void;
}

const SITE_LABEL: Record<string, string> = { kosho: '古本屋', yahoo: 'ヤフオク', mercari: 'メルカリ' };

const fmtDateTime = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}時間${m}分`;
  if (m) return `${m}分${sec}秒`;
  return `${sec}秒`;
};

export const MonitorView: React.FC<Props> = ({
  logs,
  runs,
  booklists,
  onClearRuns,
  onOpenList,
  isRunning,
  onTriggerManualCrawl,
  onClearLogs,
}) => {
  const { t } = useI18n();
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [runFilter, setRunFilter] = useState<'all' | 'regular' | 'custom'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  // 有進行中的巡行時每秒更新耗時
  const hasRunning = runs.some((r) => r.status === 'running');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasRunning]);

  const shownRuns = useMemo(
    () => runs.filter((r) => runFilter === 'all' || r.kind === runFilter).slice().reverse(),
    [runs, runFilter]
  );
  const stats = useMemo(() => {
    const done = runs.filter((r) => r.status === 'success');
    const durations = done.filter((r) => r.endedAt).map((r) => (r.endedAt as number) - r.startedAt);
    return {
      total: runs.length,
      success: done.length,
      failed: runs.filter((r) => r.status === 'failed').length,
      items: done.reduce((a, r) => a + (r.count || 0), 0),
      fresh: done.reduce((a, r) => a + (r.newCount || 0), 0),
      avg: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      last: runs.length ? runs[runs.length - 1].startedAt : null,
    };
  }, [runs]);
  const listExists = (id: string) => booklists.some((l) => l.id === id);
  const listNameOf = (r: RunRecord) =>
    r.kind === 'regular' ? t('list.regular') : booklists.find((l) => l.id === r.listId)?.name || r.listName;

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  };

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <p className="kicker">{t('mon.kicker')}</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '0.15em', margin: 0 }}>
            {t('mon.heading')}
          </h1>
        </div>
        <div className="aside">
          <button className="btn btn-sm" onClick={onClearLogs}>
            {t('mon.btnClear')}
          </button>
          <button className="btn btn-sm btn-shu" style={{ marginLeft: 8 }} onClick={onTriggerManualCrawl}>
            {t('mon.btnTest')}
          </button>
        </div>
      </div>

      <p className="muted" style={{ marginTop: -14, marginBottom: 24, fontSize: '0.84rem' }}>
        {t('mon.sub')}
      </p>

      {/* 巡行紀錄 */}
      <div className="settings-box" style={{ marginBottom: 24 }}>
        <h2 className="settings-box-title">
          <span>{t('run.title')}</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="chips" role="group">
              {(['all', 'regular', 'custom'] as const).map((k) => (
                <button key={k} className={'chip' + (runFilter === k ? ' on' : '')} onClick={() => setRunFilter(k)}>
                  {t(`run.filter.${k}`)}
                </button>
              ))}
            </span>
            {confirmClear ? (
              <>
                <button
                  className="btn btn-sm"
                  style={{ color: 'var(--shu)', borderColor: 'var(--shu)' }}
                  onClick={() => {
                    onClearRuns();
                    setConfirmClear(false);
                  }}
                >
                  {t('run.confirmClear')}
                </button>
                <button className="btn btn-sm" onClick={() => setConfirmClear(false)}>
                  {t('list.cancel')}
                </button>
              </>
            ) : (
              <button className="btn btn-sm" disabled={runs.length === 0} onClick={() => setConfirmClear(true)}>
                {t('run.clear')}
              </button>
            )}
          </span>
        </h2>

        <div className="small" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', marginBottom: 12, color: 'var(--ink-soft)' }}>
          <span>{t('run.statTotal')}：<strong>{stats.total}</strong></span>
          <span>{t('run.statSuccess')}：<strong>{stats.success}</strong></span>
          <span>{t('run.statFailed')}：<strong style={{ color: stats.failed ? 'var(--shu)' : undefined }}>{stats.failed}</strong></span>
          <span>{t('run.statItems')}：<strong>{stats.items}</strong>（{t('run.colNew')} {stats.fresh}）</span>
          <span>{t('run.statAvg')}：<strong>{stats.avg ? fmtDuration(stats.avg) : '—'}</strong></span>
          <span>{t('run.statLast')}：<strong>{stats.last ? fmtDateTime(stats.last) : '—'}</strong></span>
        </div>

        {shownRuns.length === 0 ? (
          <p className="small muted">{t('run.empty')}</p>
        ) : (
          <div className="table-scroll" style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table className="ledger">
              <thead>
                <tr>
                  <th>{t('run.colStart')}</th>
                  <th>{t('run.colKind')}</th>
                  <th>{t('run.colList')}</th>
                  <th>{t('run.colTarget')}</th>
                  <th>{t('run.colDuration')}</th>
                  <th>{t('run.colStatus')}</th>
                  <th style={{ textAlign: 'right' }}>{t('run.colCount')}</th>
                  <th style={{ textAlign: 'right' }}>{t('run.colNew')}</th>
                </tr>
              </thead>
              <tbody>
                {shownRuns.map((r) => (
                  <tr key={r.id}>
                    <td className="small num" style={{ whiteSpace: 'nowrap' }}>
                      {fmtDateTime(r.startedAt)}
                      {r.endedAt && (
                        <div className="faint" style={{ fontSize: '0.7rem' }}>
                          → {fmtDateTime(r.endedAt).slice(11)}
                        </div>
                      )}
                    </td>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>
                      {r.kind === 'regular'
                        ? `${t('run.kindRegular')}${r.cycleNo ? ` #${r.cycleNo}` : ''}`
                        : t('run.kindCustom')}
                    </td>
                    <td className="small">
                      {listExists(r.listId) ? (
                        <button className="linklike" style={{ textDecoration: 'underline', color: 'var(--ai)' }} onClick={() => onOpenList(r.listId)}>
                          {listNameOf(r)}
                        </button>
                      ) : (
                        <span className="faint">{r.listName}（{t('run.listDeleted')}）</span>
                      )}
                    </td>
                    <td className="small" style={{ maxWidth: 260 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.keywords.join('、')}>
                        {r.keywords.join('、') || '—'}
                      </div>
                      <div className="faint" style={{ fontSize: '0.7rem' }}>
                        {r.sites.map((s) => SITE_LABEL[s] || s).join('・')} ｜ ≦{r.maxYear}年 ｜ ≦¥{r.maxPrice.toLocaleString()}
                      </div>
                    </td>
                    <td className="small num" style={{ whiteSpace: 'nowrap' }}>
                      {fmtDuration((r.endedAt ?? now) - r.startedAt)}
                    </td>
                    <td className="small" style={{ whiteSpace: 'nowrap' }} title={r.error}>
                      <span
                        style={{
                          color:
                            r.status === 'success'
                              ? 'var(--ai)'
                              : r.status === 'running'
                              ? 'var(--wood)'
                              : r.status === 'failed'
                              ? 'var(--shu)'
                              : 'var(--ink-faint)',
                          fontWeight: 600,
                        }}
                      >
                        {t(`run.status.${r.status}`)}
                      </span>
                      {r.error && r.status !== 'success' && (
                        <div className="faint" style={{ fontSize: '0.7rem', maxWidth: 180, whiteSpace: 'normal' }}>
                          {r.error}
                        </div>
                      )}
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>{r.count ?? '—'}</td>
                    <td className="num" style={{ textAlign: 'right', color: r.newCount ? 'var(--shu)' : undefined, fontWeight: r.newCount ? 700 : 400 }}>
                      {r.newCount ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 終端機面版 */}
      <div className="terminal-board">
        {logs.map((log) => (
          <div key={log.id} className="terminal-row">
            <span className="t-time">[{formatTime(log.timestamp)}]</span>
            {log.site && <span className="t-site">〔{log.site.toUpperCase()}〕</span>}
            <span className={`t-msg ${log.level}`}>{log.message}</span>
          </div>
        ))}
        <div ref={terminalEndRef} />
      </div>

      {/* 技術說明區 */}
      <div
        style={{
          marginTop: 24,
          padding: '20px 24px',
          background: 'var(--paper-card)',
          border: '1px solid var(--hair)',
          fontSize: '0.82rem',
          lineHeight: 1.8,
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
          ※ {t('mon.noteTitle')}
        </div>
        <div style={{ color: 'var(--ink-soft)' }}>
          {t('mon.noteDesc')}
        </div>
      </div>
    </div>
  );
};

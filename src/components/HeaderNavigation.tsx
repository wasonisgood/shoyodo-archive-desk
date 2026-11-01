import React from 'react';
import { useI18n } from '../i18n';
import { AdminSession } from '../types';

export type NavTab = 'catalogue' | 'expedition' | 'settings' | 'monitor';

interface Props {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  itemCount: number;
  newItemCount: number;
  isRunning: boolean;
  nextRunSeconds: number;
  onTriggerManualCrawl: () => void;
  onToggleScheduler: () => void;
  adminSession?: AdminSession | null;
  onLogout?: () => void;
}

export const HeaderNavigation: React.FC<Props> = ({
  currentTab,
  onSelectTab,
  itemCount,
  newItemCount,
  isRunning,
  nextRunSeconds,
  onTriggerManualCrawl,
  onToggleScheduler,
  adminSession,
  onLogout,
}) => {
  const { lang, setLang, t } = useI18n();

  const formatCountdown = (secs: number) => {
    if (secs >= 86400) {
      const d = Math.floor(secs / 86400);
      const h = Math.floor((secs % 86400) / 3600);
      return `${d}日 ${h}時間`;
    }
    if (secs >= 3600) {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      return `${h}時間 ${m}分`;
    }
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}分 ${s < 10 ? '0' : ''}${s}秒`;
  };

  return (
    <>
      {/* 天：細帯 */}
      <div className="topbar">
        <div className="shell topbar-row">
          <span className="topbar-note">{t('site.topnote')}</span>
          <span className="topbar-tools">
            <span className="tool" style={{ letterSpacing: '0.05em' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isRunning ? 'var(--shu)' : 'var(--hair-strong)',
                  marginRight: 6,
                  verticalAlign: 'middle',
                }}
              />
              {isRunning
                ? `${t('status.running')}（${t('status.nextRun')} ${formatCountdown(nextRunSeconds)}）`
                : t('status.paused')}
            </span>

            <button
              className="tool linklike"
              onClick={onToggleScheduler}
              style={{ textDecoration: 'underline' }}
            >
              {isRunning ? t('status.btnPause') : t('status.btnResume')}
            </button>

            <button
              className="tool linklike"
              onClick={onTriggerManualCrawl}
              style={{ color: 'var(--shu)', fontWeight: 600, textDecoration: 'underline' }}
            >
              {t('status.btnRunNow')}
            </button>

            {/* 管理者鑑札與退室 */}
            {adminSession && (
              <span className="tool" style={{ color: 'var(--shu)', fontWeight: 600 }}>
                〔 鑑札：{adminSession.name} 〕
              </span>
            )}
            {adminSession && onLogout && (
              <button
                className="tool linklike"
                onClick={onLogout}
                style={{ color: 'var(--ink-soft)', textDecoration: 'underline' }}
                title="登出並解除鑑札"
              >
                ［ 退室 ］
              </button>
            )}

            {/* 語言切換 */}
            <span className="lang" role="group" aria-label="language">
              <button
                className={lang === 'ja' ? 'on' : ''}
                onClick={() => setLang('ja')}
                lang="ja"
              >
                日本語
              </button>
              <button
                className={lang === 'zh' ? 'on' : ''}
                onClick={() => setLang('zh')}
                lang="zh-Hant"
              >
                中文
              </button>
            </span>
          </span>
        </div>
      </div>

      {/* 題字：雑誌の題字のような版面 */}
      <header className="masthead">
        <div className="shell">
          <div className="mast-brand">
            <span className="mast-en">{t('site.brandEn')}</span>
            <span className="mast-name">{t('site.name')}</span>
            <span className="mast-sub">{t('site.sub')}</span>
          </div>

          <nav className="mast-nav">
            <button
              className={`nav-btn ${currentTab === 'catalogue' ? 'on' : ''}`}
              onClick={() => onSelectTab('catalogue')}
            >
              <span className="ja">
                {t('nav.catalogue')}
                {newItemCount > 0 ? ` (${newItemCount})` : ''}
              </span>
              <span className="en">{t('nav.catalogueEn')}</span>
            </button>

            <button
              className={`nav-btn ${currentTab === 'expedition' ? 'on' : ''}`}
              onClick={() => onSelectTab('expedition')}
            >
              <span className="ja">{t('nav.expedition')}</span>
              <span className="en">{t('nav.expeditionEn')}</span>
            </button>

            <button
              className={`nav-btn ${currentTab === 'settings' ? 'on' : ''}`}
              onClick={() => onSelectTab('settings')}
            >
              <span className="ja">{t('nav.settings')}</span>
              <span className="en">{t('nav.settingsEn')}</span>
            </button>

            <button
              className={`nav-btn ${currentTab === 'monitor' ? 'on' : ''}`}
              onClick={() => onSelectTab('monitor')}
            >
              <span className="ja">{t('nav.monitor')}</span>
              <span className="en">{t('nav.monitorEn')}</span>
            </button>
          </nav>
        </div>
      </header>
    </>
  );
};

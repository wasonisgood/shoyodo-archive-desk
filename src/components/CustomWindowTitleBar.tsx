import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import { NavTab } from './HeaderNavigation';
import { AdminSession } from '../types';

interface Props {
  isRunning: boolean;
  onTriggerManualCrawl: () => void;
  onToggleScheduler: () => void;
  onSelectTab: (tab: NavTab) => void;
  adminSession?: AdminSession | null;
  onLogout?: () => void;
}

export const CustomWindowTitleBar: React.FC<Props> = ({
  isRunning,
  onTriggerManualCrawl,
  onToggleScheduler,
  onSelectTab,
  adminSession,
  onLogout,
}) => {
  const { lang, setLang, t } = useI18n();
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const isElectron = typeof window !== 'undefined' && !!(window as any).desktopControl;

  useEffect(() => {
    if (isElectron) {
      const desktop = (window as any).desktopControl;
      desktop.isMaximized().then((max: boolean) => setIsMaximized(max));
      desktop.onMaximizedState((max: boolean) => setIsMaximized(max));
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isElectron]);

  const handleMinimize = () => {
    if (isElectron) (window as any).desktopControl.minimize();
  };

  const handleMaximize = () => {
    if (isElectron) (window as any).desktopControl.maximize();
    else setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    if (isElectron) (window as any).desktopControl.close();
    else if (confirm('蕉葉堂 巡回台帳を終了しますか？')) window.close();
  };

  return (
    <div className="custom-window-titlebar" ref={menuBarRef}>
      {/* 視窗左側：店印、題名與自繪選單條 */}
      <div className="titlebar-left">
        <div className="titlebar-seal" title="蕉葉堂">蕉</div>
        <span className="titlebar-brand-name">蕉葉堂 巡回台帳</span>

        {/* 自定義古風下拉選單 */}
        <div className="custom-menu-strip">
          {/* 台帳 (F) */}
          <div className="menu-item-wrap">
            <button
              className={`menu-trigger ${activeMenu === 'file' ? 'active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}
            >
              台帳(F)
            </button>
            {activeMenu === 'file' && (
              <div className="menu-dropdown">
                <div
                  className="dropdown-item"
                  onClick={() => {
                    onTriggerManualCrawl();
                    setActiveMenu(null);
                  }}
                >
                  <span>巡行即時実行</span>
                  <span className="shortcut-hint">F5</span>
                </div>
                <div
                  className="dropdown-item"
                  onClick={() => {
                    onToggleScheduler();
                    setActiveMenu(null);
                  }}
                >
                  <span>{isRunning ? '定期巡行を休止' : '定期巡行を再開'}</span>
                  <span className="shortcut-hint">Ctrl+P</span>
                </div>
                <div className="dropdown-divider" />
                <div
                  className="dropdown-item"
                  onClick={() => {
                    onSelectTab('settings');
                    setActiveMenu(null);
                  }}
                >
                  <span>収集設定を開く</span>
                </div>
                {isElectron && (window as any).desktopControl?.checkForUpdates && (
                  <div
                    className="dropdown-item"
                    onClick={() => {
                      (window as any).desktopControl.checkForUpdates();
                      setActiveMenu(null);
                    }}
                  >
                    <span>更新を確認 (檢查更新)</span>
                  </div>
                )}
                {adminSession && onLogout && (
                  <>
                    <div className="dropdown-divider" />
                    <div
                      className="dropdown-item"
                      onClick={() => {
                        onLogout();
                        setActiveMenu(null);
                      }}
                      style={{ color: 'var(--shu, #ad3a2a)' }}
                    >
                      <span>［ 鑑札解除・退室 ］</span>
                    </div>
                  </>
                )}
                <div className="dropdown-divider" />
                <div className="dropdown-item" onClick={handleClose}>
                  <span>終了(X)</span>
                  <span className="shortcut-hint">Alt+F4</span>
                </div>
              </div>
            )}
          </div>

          {/* 市場 (M) */}
          <div className="menu-item-wrap">
            <button
              className={`menu-trigger ${activeMenu === 'market' ? 'active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'market' ? null : 'market')}
            >
              市場(M)
            </button>
            {activeMenu === 'market' && (
              <div className="menu-dropdown">
                <a
                  href="https://www.kosho.or.jp"
                  target="_blank"
                  rel="noreferrer"
                  className="dropdown-item"
                  onClick={() => setActiveMenu(null)}
                >
                  <span>日本の古本屋 (kosho.or.jp)</span>
                </a>
                <a
                  href="https://auctions.yahoo.co.jp"
                  target="_blank"
                  rel="noreferrer"
                  className="dropdown-item"
                  onClick={() => setActiveMenu(null)}
                >
                  <span>Yahoo! オークション</span>
                </a>
                <a
                  href="https://jp.mercari.com"
                  target="_blank"
                  rel="noreferrer"
                  className="dropdown-item"
                  onClick={() => setActiveMenu(null)}
                >
                  <span>メルカリ (Mercari)</span>
                </a>
              </div>
            )}
          </div>

          {/* 表示 (V) */}
          <div className="menu-item-wrap">
            <button
              className={`menu-trigger ${activeMenu === 'view' ? 'active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}
            >
              表示(V)
            </button>
            {activeMenu === 'view' && (
              <div className="menu-dropdown">
                <div
                  className="dropdown-item"
                  onClick={() => {
                    onSelectTab('catalogue');
                    setActiveMenu(null);
                  }}
                >
                  <span>巡行目録 (Catalogue)</span>
                </div>
                <div
                  className="dropdown-item"
                  onClick={() => {
                    onSelectTab('expedition');
                    setActiveMenu(null);
                  }}
                >
                  <span>単発巡行 (Expedition)</span>
                </div>
                <div
                  className="dropdown-item"
                  onClick={() => {
                    onSelectTab('settings');
                    setActiveMenu(null);
                  }}
                >
                  <span>収集設定 (Regulation)</span>
                </div>
                <div
                  className="dropdown-item"
                  onClick={() => {
                    onSelectTab('monitor');
                    setActiveMenu(null);
                  }}
                >
                  <span>監視端末 (Terminal)</span>
                </div>
              </div>
            )}
          </div>

          {/* 言語 (L) */}
          <div className="menu-item-wrap">
            <button
              className={`menu-trigger ${activeMenu === 'lang' ? 'active' : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'lang' ? null : 'lang')}
            >
              言語(L)
            </button>
            {activeMenu === 'lang' && (
              <div className="menu-dropdown">
                <div
                  className={`dropdown-item ${lang === 'ja' ? 'selected' : ''}`}
                  onClick={() => {
                    setLang('ja');
                    setActiveMenu(null);
                  }}
                >
                  <span>{lang === 'ja' ? '✓ ' : '  '}日本語 (Japanese)</span>
                </div>
                <div
                  className={`dropdown-item ${lang === 'zh' ? 'selected' : ''}`}
                  onClick={() => {
                    setLang('zh');
                    setActiveMenu(null);
                  }}
                >
                  <span>{lang === 'zh' ? '✓ ' : '  '}繁體中文 (Traditional Chinese)</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 視窗中央：可拖曳區與細緻和風巡行標籤 */}
      <div className="titlebar-center-drag">
        <span className="titlebar-subtle-hint">
          一九四五年以前資料定期巡回中 ・ {isRunning ? '常駐稼働中' : '一時休止'}
        </span>
      </div>

      {/* 視窗右側：自繪和風細線視窗按鈕 */}
      <div className="titlebar-controls">
        {adminSession ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              border: '1px solid rgba(173, 58, 42, 0.4)',
              color: 'var(--shu, #ad3a2a)',
              fontSize: '0.72rem',
              marginRight: 10,
              letterSpacing: '0.05em',
            }}
            title="管理者鑑札認可中"
          >
            〔 鑑札：{adminSession.name} 〕
          </span>
        ) : (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              border: '1px solid #555',
              color: '#888',
              fontSize: '0.72rem',
              marginRight: 10,
              letterSpacing: '0.05em',
            }}
          >
            〔 未認證 〕
          </span>
        )}
        <button
          className="titlebar-btn"
          onClick={handleMinimize}
          title="最小化"
        >
          <span className="btn-glyph">―</span>
        </button>
        <button
          className="titlebar-btn"
          onClick={handleMaximize}
          title={isMaximized ? '元に戻す' : '最大化'}
        >
          <span className="btn-glyph">{isMaximized ? '❐' : '□'}</span>
        </button>
        <button
          className="titlebar-btn close-btn"
          onClick={handleClose}
          title="終了"
        >
          <span className="btn-glyph">✕</span>
        </button>
      </div>
    </div>
  );
};

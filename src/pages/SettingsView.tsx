import React, { useState } from 'react';
import { CrawlerConfig } from '../types';
import { useI18n } from '../i18n';

interface Props {
  config: CrawlerConfig;
  onSaveConfig: (newConfig: CrawlerConfig) => void;
}

export const SettingsView: React.FC<Props> = ({ config, onSaveConfig }) => {
  const { t } = useI18n();

  const [localConfig, setLocalConfig] = useState<CrawlerConfig>(config);
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [newExcludeInput, setNewExcludeInput] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);
  const [autostart, setAutostart] = useState(false);

  // 背景自動儲存：任何設定一變更即寫入（不必按「保存」也不會在切換分頁時遺失）
  const isFirstRender = React.useRef(true);
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onSaveConfig(localConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localConfig]);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).desktopControl?.getAutostart) {
      (window as any).desktopControl.getAutostart().then((enabled: boolean) => {
        setAutostart(enabled);
      });
    }
  }, []);

  const handleToggleAutostart = async (checked: boolean) => {
    setAutostart(checked);
    if (typeof window !== 'undefined' && (window as any).desktopControl?.setAutostart) {
      // 以實際寫入登錄檔後的結果為準
      const actual = await (window as any).desktopControl.setAutostart(checked);
      setAutostart(Boolean(actual));
    }
  };

  const PRESET_ERA_WORDS = ['戦前', '明治', '大正', '昭和'];
  const PRESET_CATEGORY_WORDS = ['教科書', '資料', '古書', '読本', '台湾', '朝鮮', '地図', '絵葉書'];

  const handleAddKeyword = (kw: string) => {
    const trimmed = kw.trim();
    if (trimmed && !localConfig.keywords.includes(trimmed)) {
      setLocalConfig({
        ...localConfig,
        keywords: [...localConfig.keywords, trimmed],
      });
    }
    setNewKeywordInput('');
  };

  const handleRemoveKeyword = (kw: string) => {
    setLocalConfig({
      ...localConfig,
      keywords: localConfig.keywords.filter((k) => k !== kw),
    });
  };

  const handleAddExclude = (kw: string) => {
    const trimmed = kw.trim();
    if (trimmed && !localConfig.excludeKeywords.includes(trimmed)) {
      setLocalConfig({
        ...localConfig,
        excludeKeywords: [...localConfig.excludeKeywords, trimmed],
      });
    }
    setNewExcludeInput('');
  };

  const handleRemoveExclude = (kw: string) => {
    setLocalConfig({
      ...localConfig,
      excludeKeywords: localConfig.excludeKeywords.filter((k) => k !== kw),
    });
  };

  const handleSave = () => {
    // 剩餘輸入框中尚未按 Enter 的語彙也一併收錄
    let cfg = localConfig;
    const kw = newKeywordInput.trim();
    const ex = newExcludeInput.trim();
    if (kw && !cfg.keywords.includes(kw)) cfg = { ...cfg, keywords: [...cfg.keywords, kw] };
    if (ex && !cfg.excludeKeywords.includes(ex)) cfg = { ...cfg, excludeKeywords: [...cfg.excludeKeywords, ex] };
    if (cfg !== localConfig) {
      setLocalConfig(cfg);
      setNewKeywordInput('');
      setNewExcludeInput('');
    }
    onSaveConfig(cfg);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <p className="kicker">{t('set.kicker')}</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '0.15em', margin: 0 }}>
            {t('set.heading')}
          </h1>
        </div>
        <span className="aside" style={{ fontStyle: 'italic', fontFamily: 'var(--serif-en)', fontSize: '0.88rem' }}>
          Schedule Regulation
        </span>
      </div>

      <p className="muted" style={{ marginTop: -14, marginBottom: 24, fontSize: '0.84rem' }}>
        {t('set.sub')}
      </p>

      {savedNotice && (
        <div className="notice" style={{ marginBottom: 24 }}>
          {t('set.savedSuccess')}
        </div>
      )}

      {/* 區塊一：語彙設定（form-grid 架構） */}
      <div className="settings-box">
        <h2 className="settings-box-title">
          <span>{t('set.kwTitle')}</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', fontWeight: 400 }}>
            {localConfig.keywords.length} 語 登録済
          </span>
        </h2>

        <div className="form-grid">
          {/* 抽出語彙 Tag 區域 */}
          <div className="span-6 field">
            <span>巡行抽出語彙（Enter で追加）</span>
            <div className="kw-tag-box">
              {localConfig.keywords.map((kw) => (
                <span key={kw} className="kw-tag">
                  {kw}
                  <span className="del-btn" onClick={() => handleRemoveKeyword(kw)}>
                    ×
                  </span>
                </span>
              ))}
              <input
                type="text"
                className="kw-input-inline"
                placeholder={t('set.kwPlaceholder')}
                value={newKeywordInput}
                onChange={(e) => setNewKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddKeyword(newKeywordInput);
                  }
                }}
              />
            </div>
          </div>

          {/* 時代快捷詞 */}
          <div className="span-3 field">
            <span>{t('set.eraPresets')}</span>
            <div className="kw-presets">
              {PRESET_ERA_WORDS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className="kw-preset-chip"
                  onClick={() => handleAddKeyword(w)}
                  disabled={localConfig.keywords.includes(w)}
                >
                  ＋{w}
                </button>
              ))}
            </div>
          </div>

          {/* 種別快捷詞 */}
          <div className="span-3 field">
            <span>{t('set.catPresets')}</span>
            <div className="kw-presets">
              {PRESET_CATEGORY_WORDS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className="kw-preset-chip"
                  onClick={() => handleAddKeyword(w)}
                  disabled={localConfig.keywords.includes(w)}
                >
                  ＋{w}
                </button>
              ))}
            </div>
          </div>

          {/* 除外語彙 */}
          <div className="span-6 field" style={{ marginTop: 12 }}>
            <span>{t('set.excludeTitle')}</span>
            <div className="kw-tag-box">
              {localConfig.excludeKeywords.map((kw) => (
                <span key={kw} className="kw-tag exclude">
                  −{kw}
                  <span className="del-btn" onClick={() => handleRemoveExclude(kw)}>
                    ×
                  </span>
                </span>
              ))}
              <input
                type="text"
                className="kw-input-inline"
                placeholder={t('set.excludePlaceholder')}
                value={newExcludeInput}
                onChange={(e) => setNewExcludeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddExclude(newExcludeInput);
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 區塊二：巡行市場與價格條件設定 */}
      <div className="settings-box">
        <h2 className="settings-box-title">
          <span>{t('set.marketTitle')}</span>
        </h2>

        {/* 市場多選列表 */}
        <div style={{ marginBottom: 24 }}>
          <div className="market-row">
            <div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={localConfig.enabledSites.kosho}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      enabledSites: { ...localConfig.enabledSites, kosho: e.target.checked },
                    })
                  }
                />
                <span className="site-name">日本の古本屋 (kosho.or.jp)</span>
              </label>
              <div className="site-desc" style={{ marginLeft: 26 }}>
                {t('set.koshoDesc')}
              </div>
            </div>
            <span style={{ fontSize: '0.74rem', color: 'var(--ai)', fontFamily: 'var(--mincho)' }}>
              〔常設市場〕
            </span>
          </div>

          <div className="market-row">
            <div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={localConfig.enabledSites.yahoo}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      enabledSites: { ...localConfig.enabledSites, yahoo: e.target.checked },
                    })
                  }
                />
                <span className="site-name">Yahoo! オークション</span>
              </label>
              <div className="site-desc" style={{ marginLeft: 26 }}>
                {t('set.yahooDesc')}
              </div>
            </div>
            <span style={{ fontSize: '0.74rem', color: 'var(--wood)', fontFamily: 'var(--mincho)' }}>
              〔競売即決〕
            </span>
          </div>

          <div className="market-row">
            <div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={localConfig.enabledSites.mercari}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      enabledSites: { ...localConfig.enabledSites, mercari: e.target.checked },
                    })
                  }
                />
                <span className="site-name">メルカリ (Mercari)</span>
              </label>
              <div className="site-desc" style={{ marginLeft: 26 }}>
                {t('set.mercariDesc')}
              </div>
            </div>
            <span style={{ fontSize: '0.74rem', color: 'var(--shu)', fontFamily: 'var(--mincho)' }}>
              〔即購入〕
            </span>
          </div>
        </div>

        {/* 表單參數欄位（正統 field + span-3） */}
        <div className="form-grid">
          <label className="field span-3">
            <span>{t('set.yearLimit')}</span>
            <input
              type="number"
              value={localConfig.maxYear}
              onChange={(e) =>
                setLocalConfig({ ...localConfig, maxYear: Number(e.target.value) || 1945 })
              }
            />
            <span className="faint small">{t('set.yearLimitHint')}</span>
          </label>

          <label className="field span-3">
            <span>{t('set.priceLimit')}</span>
            <input
              type="number"
              value={localConfig.maxPrice}
              onChange={(e) =>
                setLocalConfig({ ...localConfig, maxPrice: Number(e.target.value) || 1500 })
              }
            />
            <span className="faint small">{t('set.priceLimitHint')}</span>
          </label>

          <label className="field span-6">
            <span>{t('set.interval')}</span>
            <select
              value={localConfig.intervalMinutes}
              onChange={(e) =>
                setLocalConfig({ ...localConfig, intervalMinutes: Number(e.target.value) })
              }
            >
              <option value={1440}>{t('set.interval1d')}</option>
              <option value={4320}>{t('set.interval3d')}</option>
              <option value={10080}>{t('set.interval7d')}</option>
              <option value={20160}>{t('set.interval14d')}</option>
              <option value={43200}>{t('set.interval30d')}</option>
            </select>
          </label>

          <div className="span-6" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label className="check">
              <input
                type="checkbox"
                checked={localConfig.onlyInStock}
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, onlyInStock: e.target.checked })
                }
              />
              <span>{t('set.koshoInStock')}</span>
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={localConfig.notifyOnNewFinds}
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, notifyOnNewFinds: e.target.checked })
                }
              />
              <span>{t('set.notifyToast')}</span>
            </label>

            <div style={{ paddingLeft: 26, marginTop: -6, marginBottom: 4 }}>
              <button
                type="button"
                className="linklike"
                style={{ fontSize: '0.78rem', color: 'var(--shu)', textDecoration: 'underline', cursor: 'pointer' }}
                onClick={() => {
                  if (typeof window !== 'undefined' && (window as any).desktopControl?.showNotification) {
                    (window as any).desktopControl.showNotification({
                      title: '《昭和拾一年 改訂 尋常小學算術》',
                      price: 550,
                      siteName: '日本の古本屋',
                      eraYear: '昭和11年 (1936) ≦1945',
                      body: '發現戰前尋常小學校算術教科書，保存良好，定價五百五十日圓。'
                    });
                  }
                }}
              >
                〔 點此立即測試發送 Windows 桌面通知 〕
              </button>
            </div>

            <label className="check">
              <input
                type="checkbox"
                checked={autostart}
                onChange={(e) => handleToggleAutostart(e.target.checked)}
              />
              <span>{t('set.autostart')}</span>
            </label>
          </div>

          <div className="span-6" style={{ marginTop: 24 }}>
            <button
              type="button"
              className="btn btn-shu"
              style={{ padding: '10px 32px' }}
              onClick={handleSave}
            >
              {t('set.btnSave')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

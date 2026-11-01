import React from 'react';
import { useI18n } from '../i18n';

interface Props {
  totalCount: number;
  totalCycles: number;
  lastRunTime: number | null;
}

export const ColophonFooter: React.FC<Props> = ({
  totalCount,
  totalCycles,
  lastRunTime,
}) => {
  const { t } = useI18n();
  const [storagePath, setStoragePath] = React.useState('瀏覽器本機儲存區（localStorage）');

  React.useEffect(() => {
    const dc = (window as any).desktopControl;
    if (dc?.getPaths) {
      dc.getPaths()
        .then((p: { userData: string }) => p?.userData && setStoragePath(`${p.userData}\\Local Storage`))
        .catch(() => {});
    }
  }, []);

  const formatTime = (ts: number | null) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <footer className="colophon">
      <div className="shell colophon-grid">
        <div>
          <div className="colophon-name" style={{ fontFamily: 'var(--mincho)', fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.2em', marginBottom: 8 }}>
            {t('site.name')}
          </div>
          <p className="small muted" style={{ lineHeight: 1.8 }}>
            一九四五年以前に刊行された戦前和書・尋常小學教科書・台湾朝鮮関係史料の自動巡行・収集機関。
            <br />
            Windows 桌面專屬常駐巡回版
          </p>
        </div>

        <div>
          <p className="colophon-h" style={{ fontFamily: 'var(--gothic)', fontSize: '0.76rem', letterSpacing: '0.15em', fontWeight: 600, marginBottom: 12 }}>
            巡行走査市場
          </p>
          <ul className="small muted" style={{ listStyle: 'none', padding: 0, margin: 0, lineHeight: 1.9 }}>
            <li>・ 日本の古本屋 (kosho.or.jp)</li>
            <li>・ Yahoo! オークション</li>
            <li>・ メルカリ (Mercari Japan)</li>
          </ul>
        </div>

        <div>
          <p className="colophon-h" style={{ fontFamily: 'var(--gothic)', fontSize: '0.76rem', letterSpacing: '0.15em', fontWeight: 600, marginBottom: 12 }}>
            台帳諸元（稼働状況）
          </p>
          <div className="small muted" style={{ lineHeight: 1.9 }}>
            <div>累計走査：{totalCycles} 回</div>
            <div>現在収載：{totalCount} 冊</div>
            <div>最終更新：{formatTime(lastRunTime)}</div>
          </div>
        </div>

        <div>
          <p className="colophon-h" style={{ fontFamily: 'var(--gothic)', fontSize: '0.76rem', letterSpacing: '0.15em', fontWeight: 600, marginBottom: 12 }}>
            記録先台帳
          </p>
          <p className="small muted" style={{ wordBreak: 'break-all', fontFamily: 'Consolas, monospace', fontSize: '0.74rem' }}>
            {storagePath}
          </p>
        </div>
      </div>
      <div className="shell" style={{ borderTop: '1px solid var(--hair)', padding: '14px 0', fontSize: '0.72rem', color: 'var(--ink-faint)', display: 'flex', justifyContent: 'space-between' }}>
        <span>© SHOYODO ARCHIVE DESK / 蕉葉堂 巡回台帳</span>
        <span>Windows Native App Shell (Electron + Vite)</span>
      </div>
    </footer>
  );
};

import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n';
import { AdminSession } from '../types';

interface Props {
  onAuthenticated: (session: AdminSession) => void;
}

export const AdminAuthGate: React.FC<Props> = ({ onAuthenticated }) => {
  const { lang } = useI18n();
  const [waiting, setWaiting] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successSession, setSuccessSession] = useState<AdminSession | null>(null);

  // 監聽來自 Electron 主程序的鑑札回呼（無論是本機 HTTP 還是 shoyodo:// 協定喚回）
  useEffect(() => {
    const authControl = (window as any).authControl;
    if (!authControl?.onAuthGranted) return;

    const cleanup = authControl.onAuthGranted((session: AdminSession) => {
      if (session && session.uid) {
        setSuccessSession(session);
        setTimeout(() => {
          onAuthenticated(session);
        }, 1200);
      }
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [onAuthenticated]);

  const handleLaunchWebAuth = async () => {
    setWaiting(true);
    setErrorMsg(null);
    const authControl = (window as any).authControl;
    if (authControl?.openWebLogin) {
      await authControl.openWebLogin();
    } else {
      // 瀏覽器預覽 fallback
      const url = `https://kosho-gura.web.app/admin/desktop-auth?client=shoyodo-archive-desk&port=48123`;
      window.open(url, '_blank');
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    try {
      let parsed: any = null;
      // 嘗試 base64 解碼
      try {
        const decoded = decodeURIComponent(escape(atob(manualCode.trim())));
        parsed = JSON.parse(decoded);
      } catch {
        parsed = JSON.parse(manualCode.trim());
      }

      if (parsed && (parsed.uid || parsed.token)) {
        const sess: AdminSession = {
          uid: parsed.uid || 'manual-admin',
          name: parsed.name || '蕉葉堂管理者',
          email: parsed.email || '',
          token: parsed.token || 'manual-token',
          role: 'admin',
          authorizedAt: parsed.authorizedAt || Date.now(),
        };
        setSuccessSession(sess);
        setTimeout(() => {
          onAuthenticated(sess);
        }, 800);
      } else {
        setErrorMsg(lang === 'zh' ? '鑑札認證碼格式不正確，請重新確認。' : '認証コードが無効です。');
      }
    } catch {
      setErrorMsg(lang === 'zh' ? '代碼解析失敗，請確認是否完整複製。' : 'コードの解析に失敗しました。');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 36,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'var(--paper, #f2ede2)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: 'var(--paper, #f2ede2)',
          border: '2px solid var(--border, #c8bead)',
          boxShadow: '0 8px 30px rgba(35, 32, 27, 0.08)',
          padding: '40px 36px',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {/* 頂部朱色鑑札印章動畫 */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div
            style={{
              width: 78,
              height: 78,
              border: '3px solid var(--shu, #ad3a2a)',
              color: 'var(--shu, #ad3a2a)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--mincho)',
              fontWeight: 800,
              lineHeight: 1.1,
              transform: successSession ? 'scale(1.1) rotate(0deg)' : 'scale(1) rotate(-3deg)',
              transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: 'inset 0 0 0 2px rgba(173, 58, 42, 0.18)',
            }}
          >
            <span style={{ fontSize: 30, letterSpacing: '-0.05em' }}>蕉</span>
            <span style={{ fontSize: 11, letterSpacing: '0.2em', marginTop: 2 }}>鑑札</span>
          </div>
        </div>

        {/* 題字 */}
        <p
          style={{
            fontFamily: 'var(--serif-en)',
            fontSize: '0.74rem',
            letterSpacing: '0.25em',
            color: 'var(--ink-faint, #766d62)',
            margin: '0 0 6px',
          }}
        >
          SHOYODO ARCHIVE DESK / KANSAKU VERIFICATION
        </p>
        <h2
          style={{
            fontFamily: 'var(--mincho)',
            fontSize: '1.4rem',
            margin: '0 0 16px',
            color: 'var(--ink, #23201b)',
          }}
        >
          {lang === 'zh' ? '蕉葉堂 巡回台帳 — 鑑札認證' : '蕉葉堂 巡回台帳 — 鑑札認証'}
        </h2>

        {successSession ? (
          <div
            style={{
              padding: '20px 16px',
              background: 'rgba(173, 58, 42, 0.06)',
              border: '1px solid var(--shu, #ad3a2a)',
              marginTop: 18,
            }}
          >
            <div style={{ color: 'var(--shu, #ad3a2a)', fontWeight: 700, fontSize: '1.05rem', marginBottom: 6 }}>
              {lang === 'zh' ? '【鑑札認可・入室確認】' : '【鑑札認可・入室確認】'}
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
              {lang === 'zh' ? '司書管理者：' : '司書管理者：'}
              <strong>{successSession.name}</strong>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>
              {lang === 'zh' ? '正在展開台帳卷軸…' : '台帳を開巻中…'}
            </p>
          </div>
        ) : (
          <>
            <p
              style={{
                fontSize: '0.86rem',
                lineHeight: 1.8,
                color: 'var(--ink-soft, #524b42)',
                marginBottom: 24,
                textAlign: 'justify',
              }}
            >
              {lang === 'zh'
                ? '本台帳為具備蕉葉堂管理權限（鑑札）之司書與管理者專用定期收集系統。請至網站完成管理者登入授權後入室。'
                : '本台帳は蕉葉堂の管理権限（鑑札）を有する店主・司書専用の定期収集機です。ウェブ台帳にて認証を行い、入室してください。'}
            </p>

            <button
              type="button"
              className="btn btn-shu"
              onClick={handleLaunchWebAuth}
              style={{
                width: '100%',
                padding: '12px 20px',
                fontSize: '1rem',
                fontFamily: 'var(--mincho)',
                fontWeight: 700,
                letterSpacing: '0.1em',
                marginBottom: 16,
              }}
            >
              {waiting
                ? (lang === 'zh' ? '［ 認可待機中… 點此再次開啟 ］' : '［ 認可待機中... 再開く ］')
                : (lang === 'zh' ? '［ 蕉葉堂 WEB 鑑札認證 ］' : '［ 蕉葉堂 WEB 鑑札認証 ］')}
            </button>

            {waiting && (
              <p
                className="small faint"
                style={{
                  fontSize: '0.78rem',
                  lineHeight: 1.6,
                  color: 'var(--ai, #2c4266)',
                  marginBottom: 16,
                }}
              >
                {lang === 'zh'
                  ? '瀏覽器已喚起授權頁面。於網頁確認鑑札後，將自動連通並返回本台帳。'
                  : 'ブラウザで認可頁を開きました。ウェブ上で鑑札を認可後、自動的に台帳が起動します。'}
              </p>
            )}

            {errorMsg && (
              <div style={{ color: 'var(--shu)', fontSize: '0.8rem', marginBottom: 12 }}>
                {errorMsg}
              </div>
            )}

            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 14, marginTop: 14 }}>
              <button
                type="button"
                className="linklike small muted"
                onClick={() => setShowManual(!showManual)}
                style={{ fontSize: '0.78rem' }}
              >
                {showManual
                  ? (lang === 'zh' ? '▲ 隱藏手動輸入' : '▲ 手動入力を隠す')
                  : (lang === 'zh' ? '▼ 若無法自動跳轉，可手動貼上認證代碼' : '▼ 手動で認証コードを貼付')}
              </button>

              {showManual && (
                <form onSubmit={handleManualSubmit} style={{ marginTop: 12 }}>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder={lang === 'zh' ? '貼上網頁所複製之鑑札認證代碼…' : '認証コードを貼り付け...'}
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    style={{ width: '100%', fontSize: '0.75rem', fontFamily: 'monospace' }}
                  />
                  <button
                    type="submit"
                    className="btn btn-sm btn-shu"
                    style={{ marginTop: 8, width: '100%' }}
                  >
                    {lang === 'zh' ? '［ 確認鑑札入室 ］' : '［ 鑑札を確認して入室 ］'}
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

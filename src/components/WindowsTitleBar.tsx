import React from 'react';

interface Props {
  isMaximized: boolean;
  onToggleMaximize: () => void;
  isRunning: boolean;
  nextRunSeconds: number;
}

export const WindowsTitleBar: React.FC<Props> = ({
  isMaximized,
  onToggleMaximize,
  isRunning,
  nextRunSeconds,
}) => {
  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="win-titlebar">
      <div className="win-title-left">
        <div className="win-app-icon">古</div>
        <div className="win-app-name">古物巡行 · 戦前資料定期収集機</div>
        <div className="win-status-badge">
          <span className={`win-status-dot ${isRunning ? '' : 'paused'}`} />
          <span>{isRunning ? `常駐巡行中 (次回 ${formatCountdown(nextRunSeconds)})` : '巡行待機中'}</span>
        </div>
      </div>

      <div className="win-controls">
        <button
          className="win-ctrl-btn"
          title="最小化"
          onClick={() => alert('Windows システムトレイ（通知領域）に最小化格納されました。常駐監視は継続します。')}
        >
          ─
        </button>
        <button
          className="win-ctrl-btn"
          title={isMaximized ? '元に戻す' : '最大化'}
          onClick={onToggleMaximize}
        >
          {isMaximized ? '❐' : '□'}
        </button>
        <button
          className="win-ctrl-btn close"
          title="閉じる"
          onClick={() => {
            if (confirm('定期巡行アプリを終了しますか？（バックグラウンド監視も停止します）')) {
              window.close();
            }
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

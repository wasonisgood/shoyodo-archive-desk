import React from 'react';

interface Props {
  totalItems: number;
  totalCycles: number;
  lastRunTime: number | null;
  isRunning: boolean;
}

export const StatusBar: React.FC<Props> = ({
  totalItems,
  totalCycles,
  lastRunTime,
  isRunning,
}) => {
  const formatTime = (ts: number | null) => {
    if (!ts) return '未実行';
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <footer className="win-statusbar">
      <div className="win-status-left">
        <div className="status-item">
          <span>● 機構状態:</span>
          <span style={{ color: isRunning ? 'var(--matcha)' : 'var(--kinari)', fontWeight: 600 }}>
            {isRunning ? '常駐巡行稼働中 (Active)' : '停止中 (Idle)'}
          </span>
        </div>
        <span className="status-sep">|</span>
        <div className="status-item">
          <span>累計巡行回数:</span>
          <strong>{totalCycles} 回</strong>
        </div>
        <span className="status-sep">|</span>
        <div className="status-item">
          <span>最終取得時刻:</span>
          <span>{formatTime(lastRunTime)}</span>
        </div>
      </div>

      <div className="win-status-right">
        <div className="status-item">
          <span>捕捉蔵書総数:</span>
          <strong style={{ color: 'var(--shu)' }}>{totalItems} 冊</strong>
        </div>
        <span className="status-sep">|</span>
        <div className="status-item">
          <span>保存先:</span>
          <code style={{ fontSize: '0.68rem', color: 'var(--ink-faint)' }}>C:\Users\user\code\old-thing-search\storage.db</code>
        </div>
      </div>
    </footer>
  );
};

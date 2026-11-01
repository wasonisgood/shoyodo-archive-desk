import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n';

interface Props {
  onAnimationComplete?: () => void;
}

export const OpeningSplashScreen: React.FC<Props> = ({ onAnimationComplete }) => {
  const { lang, t } = useI18n();
  const [stage, setStage] = useState<'entering' | 'stamping' | 'revealing' | 'done'>('entering');
  const [fadingOut, setFadingOut] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    // 階段計時控制
    const t1 = setTimeout(() => setStage('stamping'), 300);
    const t2 = setTimeout(() => setStage('revealing'), 800);
    const t3 = setTimeout(() => {
      setFadingOut(true);
      if (onAnimationComplete) onAnimationComplete();
    }, 1800);
    const t4 = setTimeout(() => setRemoved(true), 2400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onAnimationComplete]);

  // 點擊任意處跳過開場
  const handleSkip = () => {
    setFadingOut(true);
    if (onAnimationComplete) onAnimationComplete();
    setTimeout(() => setRemoved(true), 400);
  };

  if (removed) return null;

  return (
    <div
      className={`opening-splash-curtain ${fadingOut ? 'fade-out' : ''}`}
      onClick={handleSkip}
      title="クリックして開巻"
    >
      <div className="opening-inner-scroll">
        {/* 和風外框印簽 */}
        <div className="opening-seal-container">
          <div className={`opening-main-seal ${stage !== 'entering' ? 'stamped' : ''}`}>
            <span className="seal-char">蕉</span>
            <span className="seal-sub">葉堂</span>
          </div>
        </div>

        {/* 題字墨書 */}
        <div className={`opening-titles-block ${stage === 'revealing' || stage === 'done' ? 'visible' : ''}`}>
          <p className="opening-kicker">SHOYODO ARCHIVE DESK / AUTOMATED RECORD</p>
          <h1 className="opening-title">蕉葉堂 巡回台帳</h1>
          <p className="opening-subtitle">
            {lang === 'ja'
              ? '一九四五年以前 戦前古書・資料定期収集機'
              : '一九四五年以前 戰前古書・文獻定期收集台帳'}
          </p>
        </div>

        {/* 墨痕細流進度條 */}
        <div className="opening-progress-track">
          <div className="opening-progress-ink" />
        </div>

        <div className="opening-skip-hint">
          <span>［ 開巻 ］</span>
        </div>
      </div>
    </div>
  );
};

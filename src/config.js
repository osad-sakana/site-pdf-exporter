/**
 * ビューポート設定。PC/スマホの表示条件はここに集約する。
 * サイズやUAを変更したい場合はこのファイルのみを編集すればよい。
 */
export const VIEWPORT_CONFIGS = {
  pc: {
    label: 'pc',
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    userAgent: undefined,
  },
  mobile: {
    label: 'mobile',
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
};

export const DEFAULT_WAIT_UNTIL = 'networkidle';
export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_EXTRA_WAIT_MS = 0;

/** 遅延読み込み対策のスクロールパスの最大ステップ数（無限スクロール対策の打ち切り上限） */
export const MAX_SCROLL_STEPS = 30;

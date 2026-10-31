/**
 * 縦方向のビューポート単位(vh/dvh/svh/lvh)をpx固定値に置き換える。
 *
 * page.pdf() はページ高さをフルページ高さに設定して描画するため、
 * 100vh指定のhero等がフルページ高さ(極端に大きい値)に引き伸ばされてしまう。
 * PDF生成前に、現在のビューポート高さを基準にpxへ固定することでこれを防ぐ。
 *
 * 対象: 同一オリジンで読めるスタイルシート、<style>、インライン style 属性。
 * 読み取れないスタイルシート(クロスオリジン)の数は skippedSheets として返す。
 */
export async function freezeViewportHeightUnits(page, viewportHeight) {
  return page.evaluate((height) => {
    const UNIT_PATTERN = /(-?\d*\.?\d+)(dvh|svh|lvh|vh)\b/g;
    const toPx = (value) =>
      value.replace(UNIT_PATTERN, (_, num) => `${(parseFloat(num) * height) / 100}px`);

    const rewriteStyle = (style) => {
      for (let i = 0; i < style.length; i += 1) {
        const name = style[i];
        const value = style.getPropertyValue(name);
        if (!UNIT_PATTERN.test(value)) {
          UNIT_PATTERN.lastIndex = 0;
          continue;
        }
        UNIT_PATTERN.lastIndex = 0;
        style.setProperty(name, toPx(value), style.getPropertyPriority(name));
      }
    };

    const rewriteRules = (rules) => {
      for (const rule of rules) {
        if (rule.style) rewriteStyle(rule.style);
        if (rule.cssRules) rewriteRules(rule.cssRules);
      }
    };

    let skippedSheets = 0;
    for (const sheet of document.styleSheets) {
      try {
        rewriteRules(sheet.cssRules);
      } catch {
        skippedSheets += 1;
      }
    }

    for (const element of document.querySelectorAll('[style]')) {
      rewriteStyle(element.style);
    }

    return { skippedSheets };
  }, viewportHeight);
}

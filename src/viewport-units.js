/**
 * 高さに依存するビューポート単位(vh/vb/vmin/vmax と dvh/svh/lvh 等の派生)をpx固定値に置き換える。
 *
 * page.pdf() はページ高さをフルページ高さに設定して描画するため、
 * 100vh指定のheroがフルページ高さ(極端に大きい値)に引き伸ばされてしまう。
 * PDF生成前に、現在のビューポートで実測した値のpxへ固定することでこれを防ぐ。
 *
 * 対象: スタイルシート(@import先・adoptedStyleSheets・Shadow DOM内を含む)、<style>、インライン style 属性。
 * 読み取れないスタイルシート(クロスオリジン)の数は skippedSheets として返す。
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{ skippedSheets: number }>}
 */
export async function freezeViewportHeightUnits(page) {
  return page.evaluate(() => {
    const UNITS = [
      'dvmin', 'dvmax', 'svmin', 'svmax', 'lvmin', 'lvmax',
      'dvh', 'svh', 'lvh', 'dvb', 'svb', 'lvb',
      'vmin', 'vmax', 'vh', 'vb',
    ];

    // 各単位が実際に何pxになるかをブラウザで実測する(meta viewport未設定のモバイル等でも正しい値を得る)
    const pxPerUnit = {};
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;';
    document.documentElement.appendChild(probe);
    for (const unit of UNITS) {
      if (!CSS.supports('width', `1${unit}`)) continue;
      probe.style.width = `100${unit}`;
      const width = probe.getBoundingClientRect().width;
      if (width > 0) pxPerUnit[unit] = width / 100;
    }
    probe.remove();

    // url(...)・文字列は置換対象から除外し、識別子(--size-100vh 等)の一部にはマッチさせない
    const NUMBER = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?';
    const PATTERN = new RegExp(
      `url\\([^)]*\\)|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|(?<![\\w.-])(${NUMBER})(${UNITS.join('|')})(?![\\w-])`,
      'gi',
    );
    const toPx = (value) =>
      value.replace(PATTERN, (match, num, unit) => {
        const factor = unit && pxPerUnit[unit.toLowerCase()];
        return factor ? `${parseFloat(num) * factor}px` : match;
      });

    const rewriteStyle = (style) => {
      for (let i = 0; i < style.length; i += 1) {
        const name = style[i];
        const value = style.getPropertyValue(name);
        const next = toPx(value);
        if (next !== value) {
          style.setProperty(name, next, style.getPropertyPriority(name));
        }
      }
    };

    let skippedSheets = 0;

    const rewriteRules = (rules) => {
      for (const rule of rules) {
        if (rule.style) rewriteStyle(rule.style);
        if (rule.styleSheet) rewriteSheet(rule.styleSheet); // @import
        if (rule.cssRules) rewriteRules(rule.cssRules);
      }
    };

    const rewriteSheet = (sheet) => {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        skippedSheets += 1;
        return;
      }
      rewriteRules(rules);
    };

    const rewriteRoot = (root) => {
      for (const sheet of root.styleSheets) rewriteSheet(sheet);
      for (const sheet of root.adoptedStyleSheets ?? []) rewriteSheet(sheet);
      for (const element of root.querySelectorAll('[style]')) rewriteStyle(element.style);
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) rewriteRoot(element.shadowRoot);
      }
    };

    rewriteRoot(document);

    return { skippedSheets };
  });
}

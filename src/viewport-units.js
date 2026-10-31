/**
 * 高さに依存するビューポート単位(vh/vb/vmin/vmax と dvh/svh/lvh 等の派生)をpx固定値に置き換える。
 *
 * page.pdf() はページ高さをフルページ高さに設定して描画するため、
 * 100vh指定のheroがフルページ高さ(極端に大きい値)に引き伸ばされてしまう。
 * PDF生成前に、現在のビューポートで実測した値のpxへ固定することでこれを防ぐ。
 *
 * 対象: スタイルシート(@import先・adoptedStyleSheets・Shadow DOM内を含む)、<style>、インライン style 属性。
 * 読み取れないスタイルシート(クロスオリジン)のホスト名は skippedHosts として返す。
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{ skippedHosts: string[] }>}
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
    // サイトのCSS(*{max-width}等)に影響されないよう、独自要素名と !important で測定する
    const probe = document.createElement('spe-vh-probe');
    probe.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'display:block', 'visibility:hidden',
      'pointer-events:none', 'margin:0', 'padding:0', 'border:0', 'box-sizing:content-box',
      'min-width:0', 'max-width:none', 'transform:none', 'zoom:1', 'height:0', 'transition:none', 'animation:none',
    ].map((d) => `${d}!important`).join(';');
    document.documentElement.appendChild(probe);
    for (const unit of UNITS) {
      if (!CSS.supports('width', `1${unit}`)) continue;
      probe.style.setProperty('width', `100${unit}`, 'important');
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
        return factor ? `${Math.round(parseFloat(num) * factor * 100) / 100}px` : match;
      });

    // var() を含むショートハンドはロングハンドが空値になるため、宣言ブロック全体(cssText)で書き換える。
    // ただしcssTextが元の宣言を欠落なく往復できない場合は、既存宣言を消さないようロングハンド単位で書き換える。
    const rewriteStyle = (style) => {
      const text = style.cssText;
      const next = toPx(text);
      if (next === text) return;

      const scratch = document.createElement('div').style;
      scratch.cssText = text;
      if (scratch.length === style.length) {
        style.cssText = next;
        return;
      }

      for (let i = 0; i < style.length; i += 1) {
        const name = style[i];
        const value = style.getPropertyValue(name);
        const replaced = toPx(value);
        if (replaced !== value) {
          style.setProperty(name, replaced, style.getPropertyPriority(name));
        }
      }
    };

    const skippedHosts = [];

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
        skippedHosts.push(sheet.href ? new URL(sheet.href).host : '(inline)');
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

    return { skippedHosts: [...new Set(skippedHosts)] };
  });
}

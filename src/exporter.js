import { MAX_SCROLL_STEPS } from './config.js';
import { freezeViewportHeightUnits } from './viewport-units.js';

/**
 * ページの実際の描画高さを取得する。
 * html/bodyのscrollHeight・offsetHeightの最大値を採用し、レイアウトのばらつきを吸収する。
 */
async function getMaxPageHeight(page) {
  return page.evaluate(() => {
    const { body, documentElement } = document;
    return Math.max(
      documentElement.scrollHeight,
      documentElement.offsetHeight,
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
    );
  });
}

/**
 * 遅延読み込み(loading="lazy"やIntersectionObserver)を発火させるため、
 * ビューポート高さ単位で最下部まで段階的にスクロールしてから先頭に戻す。
 * 途中位置を実際に通過させないと、ページ中盤のIntersectionObserverコンテンツが
 * 一度もビューポートに入らず未読み込みのまま残ってしまうため、一気に最下部へ
 * ジャンプするのではなく1ステップずつ進める。
 * 無限スクロールで高さが伸び続けるページは maxSteps で打ち切る。
 */
async function triggerLazyContent(page, maxSteps) {
  const viewport = page.viewportSize();
  const stepSize = viewport ? viewport.height : 800;

  let scrollY = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    const currentHeight = await getMaxPageHeight(page);
    if (scrollY >= currentHeight) {
      break;
    }

    scrollY = Math.min(scrollY + stepSize, currentHeight);
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(200);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * 1つのビューポート設定でURLをレンダリングし、縦長1ページのPDFとして書き出す。
 * networkidle等の待機条件がタイムアウトしても、取得できた内容でPDF生成を続行する
 * （無限スクロール・常時通信するサイトでは待機条件が永久に満たされないことがあるため）。
 */
export async function exportVariantPdf({
  browser,
  url,
  variantConfig,
  outputPath,
  waitUntil,
  timeoutMs,
  extraWaitMs,
  skipScroll,
}) {
  const context = await browser.newContext({
    viewport: { width: variantConfig.width, height: variantConfig.height },
    deviceScaleFactor: variantConfig.deviceScaleFactor,
    isMobile: variantConfig.isMobile,
    hasTouch: variantConfig.hasTouch,
    userAgent: variantConfig.userAgent,
  });

  const warnings = [];

  try {
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil, timeout: timeoutMs });
    } catch (error) {
      if (error.name === 'TimeoutError') {
        warnings.push(
          `ページ読み込みの待機条件(${waitUntil})が${timeoutMs}ms以内に完了しませんでした。取得できた内容でPDFを生成します。`,
        );
      } else {
        throw new Error(`ページの読み込みに失敗しました (${url}): ${error.message}`);
      }
    }

    // 印刷用CSS(@media print)ではなく画面表示のレイアウトを再現する
    await page.emulateMedia({ media: 'screen' });

    if (!skipScroll) {
      await triggerLazyContent(page, MAX_SCROLL_STEPS);
    }

    if (extraWaitMs > 0) {
      await page.waitForTimeout(extraWaitMs);
    }

    // 100vh等がフルページ高さに引き伸ばされないよう、高さを測る前にpx固定する
    const { skippedSheets } = await freezeViewportHeightUnits(page);
    if (skippedSheets > 0) {
      warnings.push(
        `読み取れないスタイルシートが${skippedSheets}件あります。vh指定が含まれている場合は固定されていません。`,
      );
    }

    const fullHeight = await getMaxPageHeight(page);

    await page.pdf({
      path: outputPath,
      width: `${variantConfig.width}px`,
      height: `${fullHeight}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      pageRanges: '1',
    });

    return { outputPath, height: fullHeight, warnings };
  } finally {
    await context.close();
  }
}

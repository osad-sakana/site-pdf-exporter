import path from 'node:path';
import fs from 'node:fs/promises';
import { Command } from 'commander';
import { z } from 'zod';
import { chromium } from 'playwright';
import { VIEWPORT_CONFIGS, DEFAULT_WAIT_UNTIL, DEFAULT_TIMEOUT_MS, DEFAULT_EXTRA_WAIT_MS } from './config.js';
import { exportVariantPdf } from './exporter.js';
import { buildOutputFilename } from './utils.js';

const WAIT_UNTIL_VALUES = ['load', 'domcontentloaded', 'networkidle', 'commit'];

const optionsSchema = z.object({
  url: z.string().url('URLの形式が正しくありません（例: https://example.com）'),
  outputDir: z.string().min(1),
  waitUntil: z.enum(WAIT_UNTIL_VALUES),
  timeout: z.coerce.number().int().positive('--timeoutは正の整数(ms)を指定してください'),
  extraWait: z.coerce.number().int().nonnegative('--extra-waitは0以上の整数(ms)を指定してください'),
  skipScroll: z.boolean(),
});

function buildProgram() {
  return new Command()
    .name('site-pdf-exporter')
    .description('指定したURLをPC表示・スマホ表示の2パターンでPDFに書き出すCLIツール')
    .argument('<url>', '書き出し対象のURL')
    .argument('[outputDir]', '出力先ディレクトリ（省略時はカレントディレクトリ）', '.')
    .option('--wait-until <mode>', `読み込み完了判定 (${WAIT_UNTIL_VALUES.join('/')})`, DEFAULT_WAIT_UNTIL)
    .option('--timeout <ms>', 'ページ読み込みのタイムアウト(ms)', String(DEFAULT_TIMEOUT_MS))
    .option('--extra-wait <ms>', '読み込み完了後の追加待機時間(ms)（遅延読み込み対策）', String(DEFAULT_EXTRA_WAIT_MS))
    .option('--skip-scroll', 'スクロールによる遅延読み込みトリガーを行わない', false);
}

export async function run(argv) {
  const program = buildProgram();
  program.parse(argv);

  const [url, outputDir] = program.processedArgs;
  const opts = program.opts();

  const parsed = optionsSchema.safeParse({
    url,
    outputDir,
    waitUntil: opts.waitUntil,
    timeout: opts.timeout,
    extraWait: opts.extraWait,
    skipScroll: Boolean(opts.skipScroll),
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      console.error(`エラー: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const { url: targetUrl, outputDir: rawOutputDir, waitUntil, timeout, extraWait, skipScroll } = parsed.data;
  const resolvedOutputDir = path.resolve(rawOutputDir);

  await fs.mkdir(resolvedOutputDir, { recursive: true });

  const browser = await chromium.launch();
  let hadError = false;

  try {
    for (const variantConfig of Object.values(VIEWPORT_CONFIGS)) {
      const outputPath = path.join(resolvedOutputDir, buildOutputFilename(targetUrl, variantConfig.label));

      console.log(`[${variantConfig.label}] レンダリング中: ${targetUrl}`);

      try {
        const result = await exportVariantPdf({
          browser,
          url: targetUrl,
          variantConfig,
          outputPath,
          waitUntil,
          timeoutMs: timeout,
          extraWaitMs: extraWait,
          skipScroll,
        });

        for (const warning of result.warnings) {
          console.warn(`[${variantConfig.label}] 警告: ${warning}`);
        }

        console.log(`[${variantConfig.label}] 出力完了: ${result.outputPath} (高さ ${result.height}px)`);
      } catch (error) {
        hadError = true;
        console.error(`[${variantConfig.label}] 失敗: ${error.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (hadError) {
    process.exitCode = 1;
  }
}

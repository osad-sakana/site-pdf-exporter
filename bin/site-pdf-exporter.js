#!/usr/bin/env node
import { run } from '../src/cli.js';

run(process.argv).catch((error) => {
  console.error(`予期しないエラーが発生しました: ${error.message}`);
  process.exitCode = 1;
});

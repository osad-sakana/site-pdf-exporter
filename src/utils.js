/**
 * URLのホスト名からファイル名に使える安全な文字列を作る。
 * ポート番号などファイル名に使えない記号は "_" に置換する。
 */
export function sanitizeDomainForFilename(url) {
  const { hostname, port } = new URL(url);
  const withPort = port ? `${hostname}_${port}` : hostname;
  return withPort.replace(/[^a-zA-Z0-9.-]/g, '_');
}

export function buildOutputFilename(url, variantLabel) {
  const domain = sanitizeDomainForFilename(url);
  return `${domain}_${variantLabel}.pdf`;
}

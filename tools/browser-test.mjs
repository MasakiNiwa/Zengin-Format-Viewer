/**
 * 実ブラウザでの動作確認。
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node tools/browser-test.mjs
 *
 * 静的サーバーの起動から後片付けまでこのスクリプト内で行う。
 * CHROMIUM_PATH を指定すると、既存の Chromium を使う。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright が見つかりません。`npm i -D playwright && npx playwright install chromium` を実行してください。');
  process.exit(2);
}

/* ---------------- 静的サーバー ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png'
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/index.html`;

/* ---------------- 検証 ---------------- */

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

try {
  await page.goto(base, { waitUntil: 'networkidle' });

  console.log('初期画面');
  check('サンプルが 5 件', await page.locator('.sample-chip').count() === 5);
  check('未読込では書き出しメニューを隠す', !(await page.locator('[data-menu]').isVisible()));

  console.log('\n読み込みと自動判定');
  await page.locator('.sample-chip', { hasText: '総合振込' }).first().click();
  await page.waitForSelector('#workspace:not([hidden])');
  await page.waitForTimeout(400);
  check('種別コードを自動判定', (await page.locator('#format-code').textContent()).trim() === '21');
  check('データ件数を表示', (await page.locator('#tab-count-data').textContent()).trim() === '10');
  check('検証エラーなし', await page.locator('.docbar-stats .chip-ok').count() === 1);
  check('書き出しメニューが出る', await page.locator('[data-menu]').isVisible());

  console.log('\nタブ');
  for (const [tab, sel] of [['header', '.field-grid'], ['data', '.ztable'],
    ['trailer', '.field-grid'], ['raw', '.raw-list'], ['issues', '.result-ok']]) {
    await page.locator(`.tab[data-tab="${tab}"]`).click();
    await page.waitForTimeout(120);
    check(`${tab} タブ`, await page.locator(`#panel-${tab} ${sel}`).count() > 0);
  }

  console.log('\nセル編集');
  await page.locator('.tab[data-tab="data"]').click();
  await page.waitForTimeout(200);
  const amount = page.locator('#panel-data td.cell[data-field="amount"]').first();
  await amount.click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('1234567');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('金額をカンマ区切りで表示', (await amount.innerText()).includes('1,234,567'));
  check('合計不一致をエラー検出', await page.locator('.docbar-stats .chip-err').count() === 1);

  const name = page.locator('#panel-data td.cell[data-field="payeeName"]').first();
  await name.click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('カブシキガイシャ　テスト');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('全角を半角カナへ自動変換', (await name.innerText()).startsWith('ｶﾌﾞｼｷｶﾞｲｼｬ'));

  await page.locator('#panel-data .btn', { hasText: '合計を再計算' }).click();
  await page.waitForTimeout(400);
  check('合計再計算でエラー解消', await page.locator('.docbar-stats .chip-ok').count() === 1);

  console.log('\n行操作と検索');
  await page.locator('#panel-data input[type="search"]').fill('0010');
  await page.waitForTimeout(300);
  const filtered = await page.locator('#panel-data tbody tr').count();
  check('検索で絞り込み', filtered > 0 && filtered < 10, `rows=${filtered}`);
  await page.locator('#panel-data input[type="search"]').fill('');
  await page.waitForTimeout(300);
  await page.locator('#panel-data .btn', { hasText: '行を追加' }).click();
  await page.waitForTimeout(300);
  check('行追加', (await page.locator('#tab-count-data').textContent()).trim() === '11');
  await page.locator('#panel-data tbody tr').last().locator('.row-btn').click();
  await page.waitForTimeout(300);
  check('行削除', (await page.locator('#tab-count-data').textContent()).trim() === '10');

  console.log('\n生データの桁揃え');
  await page.locator('.tab[data-tab="raw"]').click();
  await page.waitForTimeout(300);
  const align = await page.evaluate(() => {
    const xs = [...document.querySelectorAll('.raw-row[data-kind="data"]')].map((row) => {
      const seg = [...row.querySelectorAll('.raw-seg')]
        .find((s) => (s.getAttribute('title') || '').startsWith('受取人名'));
      return Math.round(seg.getBoundingClientRect().left);
    });
    const ruler = document.querySelector('.raw-ruler .raw-body div:last-child');
    const range = document.createRange();
    range.setStart(ruler.firstChild, 50);
    range.setEnd(ruler.firstChild, 51);
    return { xs: [...new Set(xs)], rulerX: Math.round(range.getBoundingClientRect().left) };
  });
  check('半角カナを含む行でも桁が揃う', align.xs.length === 1, JSON.stringify(align.xs));
  check('桁目盛りと一致', Math.abs(align.xs[0] - align.rulerX) <= 1,
    `field=${align.xs[0]} ruler=${align.rulerX}`);
  await page.locator('.raw-row').nth(1).click();
  await page.waitForTimeout(250);
  check('行の内訳を表示', await page.locator('.raw-detail tbody tr').count() === 16);

  console.log('\nヘルプ');
  await page.locator('#btn-help').click();
  await page.waitForTimeout(300);
  check('ダイアログが開く', await page.locator('#help-dialog[open]').count() === 1);
  await page.locator('#help-nav button', { hasText: 'レコードレイアウト' }).click();
  await page.waitForTimeout(300);
  check('レイアウト表を生成', await page.locator('#help-content table').count() >= 16);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Escape で閉じる', await page.locator('#help-dialog[open]').count() === 0);
  check('閉じたあと操作を妨げない', await page.evaluate(() => {
    const r = document.querySelector('.tab[data-tab="data"]').getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!el && !!el.closest('.tab');
  }));

  console.log('\n書き出し');
  await page.locator('[data-menu-trigger]').click();
  await page.waitForTimeout(150);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#btn-save-zengin').click()
  ]);
  const saved = path.join(root, 'tools', '.browser-test-output.txt');
  await download.saveAs(saved);
  const buffer = fs.readFileSync(saved);
  fs.unlinkSync(saved);
  check('13 レコード × 122 バイト（120 桁 + CRLF）', buffer.length === 13 * 122, String(buffer.length));
  check('CRLF 区切り', buffer[120] === 0x0d && buffer[121] === 0x0a);

  console.log('\n入出金系フォーマット（200 桁・レイアウト未登録）');
  {
    // 種別コード 03（入出金取引明細）を模した 200 桁のファイルを読み込ませる
    const sample = path.join(root, 'tools', '.browser-test-200.txt');
    const line = (kubun, rest = '') => (kubun + rest).padEnd(200, ' ');
    fs.writeFileSync(sample, Buffer.from(
      [line('1', '030'), line('2'), line('2'), line('2'), line('8'), line('9')]
        .join('\r\n') + '\r\n', 'binary'));
    await page.evaluate(() => { window.onbeforeunload = null; });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('#file-input').setInputFiles(sample);
    await page.waitForTimeout(700);
    fs.unlinkSync(sample);

    check('種別コード 03 を識別', (await page.locator('#format-code').textContent()).trim() === '03');
    check('名称を表示', (await page.locator('#format-name').textContent()).includes('入出金取引明細'));
    check('200 桁として読み込む',
      (await page.locator('#file-meta').textContent()).includes('200桁'));
    check('データ件数を数える', (await page.locator('#tab-count-data').textContent()).trim() === '3');
    check('レイアウト未登録の案内を出す',
      (await page.locator('#panel-summary .notice-card').innerText()).includes('項目レイアウトが未登録'));
    check('検証エラーなし', await page.locator('.docbar-stats .chip-err').count() === 0);

    await page.locator('.tab[data-tab="raw"]').click();
    await page.waitForTimeout(300);
    const rulerEnd = await page.evaluate(() => {
      const ruler = document.querySelector('.raw-ruler .raw-body div:last-child');
      return ruler.textContent.length;
    });
    check('桁目盛りが 200 桁ぶん出る', rulerEnd === 200, String(rulerEnd));
    check('レコード行が 6 件', await page.locator('.raw-row').count() === 6);
  }

  console.log('\nテーマとレスポンシブ');
  await page.locator('#btn-theme').click();
  await page.waitForTimeout(250);
  check('ダークテーマ', await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(base, { waitUntil: 'networkidle' });
  await mobile.locator('.sample-chip').first().click();
  await mobile.waitForTimeout(400);
  const overflow = await mobile.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('狭い画面で横スクロールしない', overflow <= 1, `overflow=${overflow}`);

  console.log('\nコンソール');
  check('JS エラーなし', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${failures === 0 ? '✅ すべて成功' : `❌ ${failures} 件失敗`}`);
process.exit(failures === 0 ? 0 : 1);

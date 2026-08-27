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

/** 既定は閲覧モードなので、編集する前に有効にする。 */
const enableEdit = async (target) => {
  if (await target.locator('#btn-enable-edit').count()) {
    await target.locator('#btn-enable-edit').click();
    await target.waitForTimeout(250);
  }
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
  check('サンプルが 8 件', await page.locator('.sample-chip').count() === 8);
  check('提出用と受取用に分けて並ぶ', await page.locator('.sample-group').count() === 2);
  check('未読込では書き出しメニューを隠す', !(await page.locator('[data-menu]').isVisible()));
  check('初期画面に免責を明記', (await page.locator('.disclaimer-panel').innerText())
    .includes('一切の責任を負いません'));

  console.log('\n読み込みと自動判定');
  await page.locator('.sample-chip', { hasText: '総合振込' }).first().click();
  await page.waitForSelector('#workspace:not([hidden])');
  await page.waitForTimeout(400);
  check('種別コードを自動判定', (await page.locator('#format-code').textContent()).trim() === '21');
  check('データ件数を表示', (await page.locator('#tab-count-data').textContent()).trim() === '10');
  check('検証エラーなし', await page.locator('.docbar-stats .chip-err').count() === 0);
  check('書き出しメニューが出る', await page.locator('[data-menu]').isVisible());
  check('作業画面にも免責を常時表示', (await page.locator('.disclaimer-bar').innerText())
    .includes('一切の責任を負いません'));

  console.log('\nタブ');
  for (const [tab, sel] of [['header', '.field-grid'], ['data', '.ztable'],
    ['trailer', '.field-grid'], ['raw', '.raw-list'], ['issues', '.result-ok']]) {
    await page.locator(`.tab[data-tab="${tab}"]`).click();
    await page.waitForTimeout(120);
    check(`${tab} タブ`, await page.locator(`#panel-${tab} ${sel}`).count() > 0);
  }

  console.log('\n閲覧モード（既定）');
  await page.locator('.tab[data-tab="data"]').click();
  await page.waitForTimeout(300);
  check('既定は閲覧モード', await page.locator('.mode-badge.is-view').count() === 1);
  check('行を追加は押せない',
    await page.locator('#panel-data .btn', { hasText: '行を追加' }).isDisabled());
  {
    const cell = page.locator('#panel-data td.cell[data-field="amount"]').first();
    const before = await cell.innerText();
    await cell.click();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    check('セル編集が始まらない', await page.locator('.cell-editor').count() === 0);
    check('値が変わらない', (await cell.innerText()) === before);
  }
  await enableEdit(page);
  check('編集を有効にできる', await page.locator('.mode-badge.is-edit').count() === 1);

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
  check('合計再計算でエラー解消', await page.locator('.docbar-stats .chip-err').count() === 0);

  console.log('\n元に戻す／やり直す');
  {
    const cell = page.locator('#panel-data td.cell[data-field="payeeName"]').nth(1);
    const original = await cell.innerText();
    await cell.click();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('ﾃｽﾄﾒｲｷﾞ');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    check('編集が反映される', (await cell.innerText()).includes('ﾃｽﾄﾒｲｷﾞ'));

    await page.locator('#btn-undo').click();
    await page.waitForTimeout(400);
    check('元に戻せる',
      (await page.locator('#panel-data td.cell[data-field="payeeName"]').nth(1).innerText()) === original,
      await page.locator('#panel-data td.cell[data-field="payeeName"]').nth(1).innerText());

    await page.locator('#btn-redo').click();
    await page.waitForTimeout(400);
    check('やり直せる',
      (await page.locator('#panel-data td.cell[data-field="payeeName"]').nth(1).innerText()).includes('ﾃｽﾄﾒｲｷﾞ'));

    await page.locator('#btn-restore-baseline').click();
    await page.waitForTimeout(300);
    await page.locator('#confirm-ok').click();
    await page.waitForTimeout(500);
    check('読み込み時点へ戻せる', await page.locator('#btn-show-diff').count() === 0);
    check('戻すと未保存の変更が消える', await page.locator('#btn-restore-baseline').isDisabled());
  }

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
  check('削除前に確認する', await page.locator('#confirm-dialog[open]').count() === 1);
  await page.locator('#confirm-cancel').click();
  await page.waitForTimeout(300);
  check('キャンセルすると消えない', (await page.locator('#tab-count-data').textContent()).trim() === '11');
  await page.locator('#panel-data tbody tr').last().locator('.row-btn').click();
  await page.waitForTimeout(300);
  await page.locator('#confirm-ok').click();
  await page.waitForTimeout(400);
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
  await page.locator('#btn-save-zengin').click();
  await page.waitForTimeout(400);
  check('書き出し前に確認画面が出る', await page.locator('#export-dialog[open]').count() === 1);
  const dialogText = await page.locator('#export-dialog').innerText();
  check('確認画面で参考ファイルと念押し', dialogText.includes('参考用'));
  check('確認画面で免責を明記', dialogText.includes('一切の責任を負いません'));
  check('確認画面に照合の依頼', dialogText.includes('金融機関の仕様書と照合'));

  await page.locator('#export-cancel').click();
  await page.waitForTimeout(300);
  check('キャンセルで閉じる', await page.locator('#export-dialog[open]').count() === 0);

  await page.locator('[data-menu-trigger]').click();
  await page.waitForTimeout(150);
  await page.locator('#btn-save-zengin').click();
  await page.waitForTimeout(300);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-ok').click()
  ]);
  const saved = path.join(root, 'tools', '.browser-test-output.txt');
  await download.saveAs(saved);
  const buffer = fs.readFileSync(saved);
  fs.unlinkSync(saved);
  check('13 レコード × 122 バイト（120 桁 + CRLF）', buffer.length === 13 * 122, String(buffer.length));
  check('CRLF 区切り', buffer[120] === 0x0d && buffer[121] === 0x0a);

  console.log('\n照会・通知系フォーマット（200 桁）');
  {
    await page.evaluate(() => { window.onbeforeunload = null; });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.sample-chip', { hasText: '入出金取引明細' }).first().click();
    await page.waitForTimeout(600);

    check('種別コード 03 を識別', (await page.locator('#format-code').textContent()).trim() === '03');
    check('200 桁として読み込む',
      (await page.locator('#file-meta').textContent()).includes('200桁'));
    check('入金・出金を分けて集計', (await page.locator('#panel-summary .kpi-row').innerText())
      .includes('入金合計'));
    check('検証エラーなし', await page.locator('.docbar-stats .chip-err').count() === 0);

    await page.locator('.tab[data-tab="data"]').click();
    await page.waitForTimeout(300);
    const headers = await page.locator('#panel-data thead th').allInnerTexts();
    check('項目名つきで表示', headers.some((t) => t.includes('入払区分')) &&
      headers.some((t) => t.includes('取引金額')), headers.join('|'));

    await page.locator('.tab[data-tab="raw"]').click();
    await page.waitForTimeout(300);
    const rulerLen = await page.evaluate(() =>
      document.querySelector('.raw-ruler .raw-body div:last-child').textContent.length);
    check('桁目盛りが 200 桁ぶん出る', rulerLen === 200, String(rulerLen));
  }

  console.log('\n複数グループ（残高通知）');
  {
    await page.evaluate(() => { window.onbeforeunload = null; });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.sample-chip', { hasText: '残高通知' }).first().click();
    await page.waitForTimeout(600);

    check('種別コード 04 を識別', (await page.locator('#format-code').textContent()).trim() === '04');
    check('検証エラーなし', await page.locator('.docbar-stats .chip-err').count() === 0);

    await page.locator('.tab[data-tab="data"]').click();
    await page.waitForTimeout(300);
    check('全 4 件を表示', await page.locator('#panel-data tbody tr').count() === 4);
    const selector = page.locator('#panel-data .table-toolbar select').first();
    check('口座の絞り込みが出る', (await selector.innerText()).includes('すべての口座'));
    await selector.selectOption('0');
    await page.waitForTimeout(300);
    check('1 組目に絞り込める', await page.locator('#panel-data tbody tr').count() === 2);

    await page.locator('.tab[data-tab="trailer"]').click();
    await page.waitForTimeout(300);
    check('トレーラを 2 組表示', await page.locator('#panel-trailer .card').count() === 3);
  }

  console.log('\n振込入金通知のフォーマット判定');
  {
    await page.evaluate(() => { window.onbeforeunload = null; });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.sample-chip', { hasText: '振込入金通知' }).first().click();
    await page.waitForTimeout(600);
    check('種別コード 01 を識別', (await page.locator('#format-code').textContent()).trim() === '01');
    const settings = await page.locator('#panel-summary').innerText();
    check('データ・レコードの種類を表示', settings.includes('フォーマットA'), '未表示');
    check('検証エラーなし', await page.locator('.docbar-stats .chip-err').count() === 0);
  }

  console.log('\n並べ替えの反映（レコード構成を壊さない）');
  {
    await page.evaluate(() => { window.onbeforeunload = null; });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.sample-chip', { hasText: '残高通知' }).first().click();
    await page.waitForTimeout(600);
    await enableEdit(page);
    await page.locator('.tab[data-tab="data"]').click();
    await page.waitForTimeout(300);

    const kindsBefore = await page.evaluate(() => window.__zenginKinds());
    check('元の構成は ヘッダ→データ→トレーラ が 2 組', kindsBefore === 'hddthddte', kindsBefore);

    // 現在残高で並べ替えてファイルへ反映
    await page.locator('#panel-data thead th', { hasText: '現在残高' }).first().click();
    await page.waitForTimeout(300);
    await page.locator('#panel-data .btn', { hasText: '並び順をファイルに反映' }).click();
    await page.waitForTimeout(300);
    check('反映前に確認する', await page.locator('#confirm-dialog[open]').count() === 1);
    await page.locator('#confirm-ok').click();
    await page.waitForTimeout(500);

    const kindsAfter = await page.evaluate(() => window.__zenginKinds());
    check('レコードの並び（種類）が変わらない', kindsAfter === kindsBefore,
      `before=${kindsBefore} after=${kindsAfter}`);
    check('データ件数が減らない', (await page.locator('#tab-count-data').textContent()).trim() === '4');
    check('検証エラーが出ない', await page.locator('.docbar-stats .chip-err').count() === 0);

    // 口座を絞り込んだ状態でも他口座が消えない
    const selector = page.locator('#panel-data .table-toolbar select').first();
    await selector.selectOption('0');
    await page.waitForTimeout(300);
    await page.locator('#panel-data thead th', { hasText: '現在残高' }).first().click();
    await page.waitForTimeout(300);
    await page.locator('#panel-data .btn', { hasText: '並び順をファイルに反映' }).click();
    await page.waitForTimeout(300);
    await page.locator('#confirm-ok').click();
    await page.waitForTimeout(500);
    check('絞り込み中でも他口座を失わない',
      (await page.evaluate(() => window.__zenginKinds())) === kindsBefore);
    check('絞り込み中でも件数が減らない', await page.evaluate(() => window.__zenginDataCount()) === 4);
  }

  console.log('\n変更内容の差分確認');
  {
    await page.evaluate(() => { window.onbeforeunload = null; });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.sample-chip', { hasText: '総合振込' }).first().click();
    await page.waitForTimeout(600);

    check('編集前は変更バッジが出ない', await page.locator('#btn-show-diff').count() === 0);
    await enableEdit(page);

    // 1 件セルを編集する
    await page.locator('.tab[data-tab="data"]').click();
    await page.waitForTimeout(300);
    const amount = page.locator('#panel-data td.cell[data-field="amount"]').first();
    const beforeText = (await amount.innerText()).trim();
    await amount.click();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('120000');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    check('変更バッジが出る', await page.locator('#btn-show-diff').count() === 1);
    check('変更件数を表示', (await page.locator('#btn-show-diff').innerText()).includes('変更 1 件'),
      await page.locator('#btn-show-diff').innerText());
    void beforeText;

    await page.locator('#btn-show-diff').click();
    await page.waitForTimeout(400);
    check('差分ダイアログが開く', await page.locator('#diff-dialog[open]').count() === 1);
    const diffText = await page.locator('#diff-body').innerText();
    check('変更した項目名が出る', diffText.includes('振込金額'), diffText.slice(0, 120));
    check('変更前の値が出る', diffText.includes(beforeText), diffText.slice(0, 240));
    check('変更後の値が出る', diffText.includes('120,000 円'), diffText.slice(0, 240));
    check('送信しない旨を明記', (await page.locator('#diff-dialog').innerText()).includes('送信・保存されません'));
    await page.locator('#diff-close').click();
    await page.waitForTimeout(300);

    // 行の追加と削除
    await page.locator('#panel-data .btn', { hasText: '行を追加' }).click();
    await page.waitForTimeout(400);
    await page.locator('#btn-show-diff').click();
    await page.waitForTimeout(400);
    check('行追加を検知', (await page.locator('#diff-body').innerText()).includes('追加'));
    await page.locator('#diff-close').click();
    await page.waitForTimeout(300);

    await page.locator('#panel-data tbody tr').last().locator('.row-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#confirm-ok').click();
    await page.waitForTimeout(400);
    await page.locator('#panel-data tbody tr').nth(1).locator('.row-btn').click();
    await page.waitForTimeout(300);
    await page.locator('#confirm-ok').click();
    await page.waitForTimeout(400);
    await page.locator('#btn-show-diff').click();
    await page.waitForTimeout(400);
    check('行削除を検知', (await page.locator('#diff-body').innerText()).includes('削除'));
    await page.locator('#diff-close').click();
    await page.waitForTimeout(300);

    // 書き出し確認にも変更件数が出る
    await page.locator('[data-menu-trigger]').click();
    await page.waitForTimeout(150);
    await page.locator('#btn-save-zengin').click();
    await page.waitForTimeout(400);
    check('書き出し確認に変更件数を表示',
      (await page.locator('#export-dialog').innerText()).includes('読み込み後の変更'));
    await page.locator('#export-cancel').click();
    await page.waitForTimeout(300);
  }

  console.log('\n重複明細の確認');
  {
    await page.evaluate(() => { window.onbeforeunload = null; });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.sample-chip', { hasText: '総合振込' }).first().click();
    await page.waitForTimeout(600);
    await enableEdit(page);
    await page.locator('.tab[data-tab="data"]').click();
    await page.waitForTimeout(300);

    // 4 行目を 1 行目と同じ口座・同じ金額にする
    const copy = async (field) => {
      const src = (await page.locator(`#panel-data tbody tr:nth-child(1) td[data-field="${field}"]`).innerText()).trim();
      const cell = page.locator(`#panel-data tbody tr:nth-child(4) td[data-field="${field}"]`);
      await cell.click();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Control+a');
      await page.keyboard.type(src.replace(/[,—]/g, '').split(' ')[0]);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
    };
    for (const f of ['bankCode', 'branchCode', 'depositType', 'accountNumber', 'amount']) await copy(f);
    await page.waitForTimeout(400);

    await page.locator('.tab[data-tab="issues"]').click();
    await page.waitForTimeout(400);
    const issueText = await page.locator('#panel-issues').innerText();
    check('同一口座・同一金額を警告', issueText.includes('同じ口座・同じ金額'), issueText.slice(0, 200));
    check('確認を促す表現', issueText.includes('意図した重複'));
  }

  console.log('\nEBCDIC の安全確認');
  {
    // コード区分を 1（EBCDIC）にしたファイルを作って読み込ませる
    const sample = path.join(root, 'tools', '.browser-test-ebcdic.txt');
    await page.evaluate(() => { window.onbeforeunload = null; });
    await page.goto(base, { waitUntil: 'networkidle' });
    const bytes = await page.evaluate(() => {
      const codec = window.ZenginCharset.getCodec('shift_jis');
      const lines = codec.decode(window.ZenginSamples.build('21')).split('\r\n').filter(Boolean);
      lines[0] = lines[0].slice(0, 3) + '1' + lines[0].slice(4);
      return Array.from(codec.encode(lines.join('\r\n') + '\r\n'));
    });
    fs.writeFileSync(sample, Buffer.from(bytes));
    await page.locator('#file-input').setInputFiles(sample);
    await page.waitForTimeout(700);
    fs.unlinkSync(sample);

    check('EBCDIC を明確に知らせる',
      (await page.locator('#panel-summary .notice-card.is-danger').innerText()).includes('EBCDIC'));
    check('検証でエラー扱い', await page.locator('.docbar-stats .chip-err').count() === 1);

    await page.locator('[data-menu-trigger]').click();
    await page.waitForTimeout(150);
    await page.locator('#btn-save-zengin').click();
    await page.waitForTimeout(500);
    check('書き出し確認画面を開かない', await page.locator('#export-dialog[open]').count() === 0);
    check('理由を通知する',
      (await page.locator('#toast-host').innerText()).includes('EBCDIC'));
  }

  console.log('\n分析タブ');
  {
    await page.evaluate(() => { window.onbeforeunload = null; });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.sample-chip', { hasText: '入出金取引明細' }).first().click();
    await page.waitForTimeout(700);
    await page.locator('.tab[data-tab="analysis"]').click();
    await page.waitForTimeout(600);

    const charts = await page.locator('#panel-analysis .chart').count();
    check('図が複数出る', charts >= 3, String(charts));
    check('日付別の推移がある',
      (await page.locator('#panel-analysis').innerText()).includes('勘定日別'));
    check('入金・出金の凡例がある', await page.locator('#panel-analysis .chart-legend-item').count() === 2);
    check('金額の分布がある',
      (await page.locator('#panel-analysis').innerText()).includes('取引金額の分布'));

    // 図がはみ出していないこと
    const overflow = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('#panel-analysis .chart').forEach((chart) => {
        const svg = chart.querySelector('.chart-svg');
        if (!svg) return;
        if (svg.getBoundingClientRect().right > chart.getBoundingClientRect().right + 1) {
          bad.push(chart.querySelector('.chart-title').textContent);
        }
      });
      return bad;
    });
    check('図が枠からはみ出さない', overflow.length === 0, overflow.join(' / '));

    // 表示切り替え
    const first = page.locator('#panel-analysis .chart').first();
    await first.locator('button', { hasText: '表で見る' }).click();
    await page.waitForTimeout(300);
    check('表に切り替えられる', await first.locator('.chart-table').isVisible());
    check('表に見出しがある', (await first.locator('.chart-table thead').innerText()).length > 0);
    await first.locator('button', { hasText: '図で見る' }).click();
    await page.waitForTimeout(300);
    check('図に戻せる', await first.locator('.chart-svg').isVisible());

    // 値を出すヒント
    await page.locator('#panel-analysis .chart-bar').first().hover();
    await page.waitForTimeout(250);
    check('図にマウスを乗せると値が出る',
      await page.locator('#panel-analysis .chart-tooltip:not([hidden])').count() >= 1);

    // 総合振込でも分析できる
    await page.evaluate(() => { window.onbeforeunload = null; });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.sample-chip', { hasText: '総合振込' }).first().click();
    await page.waitForTimeout(600);
    await page.locator('.tab[data-tab="analysis"]').click();
    await page.waitForTimeout(500);
    const text21 = await page.locator('#panel-analysis').innerText();
    check('受取人名の上位が出る', text21.includes('受取人名別'), text21.slice(0, 160));
    check('金融機関別が出る', text21.includes('被仕向銀行別'));
    check('単一系列では凡例を出さない',
      await page.locator('#panel-analysis .chart-legend').count() === 0);
  }

  console.log('\nCSV の書き出し');
  {
    await page.evaluate(() => { window.onbeforeunload = null; });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.sample-chip', { hasText: '総合振込' }).first().click();
    await page.waitForTimeout(600);

    const csv = await page.evaluate(() => ({
      excel: window.Zengin.toCsv(window.__zenginDoc(), { excel: true }).split('\r\n')[1],
      plain: window.Zengin.toCsv(window.__zenginDoc(), {}).split('\r\n')[1]
    }));
    check('Excel 用は先頭 0 を保つ', csv.excel.includes('="0010"'), csv.excel.slice(0, 80));
    check('Excel 用でも金額は数値', /,716080,/.test(csv.excel), csv.excel.slice(0, 120));
    check('標準はそのままの値', csv.plain.startsWith('1,0010,'), csv.plain.slice(0, 40));

    // 混在レイアウトはレイアウトごとに区切る
    const mixed = await page.evaluate(() => {
      const codec = window.ZenginCharset.getCodec('shift_jis');
      const F = window.ZenginFormats;
      const timeFmt = F.withVariant(F.getFormat('03'), 'time');
      const lines = codec.decode(window.ZenginSamples.build('03')).split('\r\n').filter(Boolean);
      const hd = timeFmt.records.header;
      const header2 = window.Zengin.blankRecord(timeFmt, 'header');
      window.Zengin.setField(header2, hd.byKey.depositType, '6');
      window.Zengin.setField(header2, hd.byKey.accountNumber, '7654321');
      window.Zengin.setField(header2, hd.byKey.reserved, '0');
      const data2 = window.Zengin.blankRecord(timeFmt, 'data');
      window.Zengin.setField(data2, timeFmt.records.data.byKey.rate, '000100');
      const trailer2 = window.Zengin.blankRecord(timeFmt, 'trailer');
      const all = lines.slice(0, -1)
        .concat([header2.text, data2.text, trailer2.text, lines[lines.length - 1]]);
      const doc = window.Zengin.parse(codec.encode(all.join('\r\n') + '\r\n'), {});
      return window.Zengin.toCsv(doc, {});
    });
    check('混在レイアウトは区切って出力', mixed.includes('■ '), mixed.slice(0, 120));
    check('定期性の項目名が出る', mixed.includes('利率'), '未出力');
    check('流動性の項目名も出る', mixed.includes('振込依頼人名・契約者番号'), '未出力');
  }

  console.log('\nホームへ戻る');
  {
    await page.evaluate(() => { window.onbeforeunload = null; });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.sample-chip').first().click();
    await page.waitForTimeout(500);
    check('作業画面になる', await page.evaluate(() => document.body.dataset.view) === 'workspace');
    await page.locator('#btn-home').click();
    await page.waitForTimeout(400);
    check('ホームに戻る', await page.evaluate(() => document.body.dataset.view) === 'welcome');
    check('作業画面が隠れる', !(await page.locator('#workspace').isVisible()));
    check('もう一度読み込める', await page.locator('.sample-chip').first().isVisible());
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

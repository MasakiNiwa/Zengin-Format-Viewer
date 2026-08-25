/**
 * ブラウザ非依存の自己診断。`node tools/selftest.mjs` で実行する。
 * レイアウト定義・往復変換・検証ロジックを確認する。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

globalThis.window = globalThis;
for (const f of ['charset', 'formats', 'zengin', 'samples']) {
  require(path.join(root, 'assets', 'js', `${f}.js`));
}
const { ZenginCharset: Charset, ZenginFormats: Formats, Zengin, ZenginSamples: Samples } = globalThis;

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

console.log('レコードレイアウト');
const layoutProblems = Formats.verify();
check('全フォーマットが 120 桁ちょうど', layoutProblems.length === 0, layoutProblems.join('; '));

console.log('\n文字コード');
const allBytes = new Uint8Array(256).map((_, i) => i);
const codec = Charset.getCodec('shift_jis');
const roundTrip = codec.encode(codec.decode(allBytes));
check('0x00-0xFF がバイト単位で完全復元', allBytes.every((b, i) => roundTrip[i] === b));
check('1 バイト = 1 文字', codec.decode(allBytes).length === 256);
check('全角→半角正規化', Charset.normalize('カ）サクラ商事　１２３ガ') === 'ｶ)ｻｸﾗ商事 123ｶﾞ',
  JSON.stringify(Charset.normalize('カ）サクラ商事　１２３ガ')));
check('漢字は全銀標準外として検出', Charset.findInvalidChars('ｱｲｳ商事').length === 2);

console.log('\nサンプルの往復（生成 → 解析 → 書き出し）');
for (const entry of Samples.CATALOG) {
  const bytes = Samples.build(entry.code, { withResult: entry.withResult });
  const doc = Zengin.parse(bytes, { fileName: `${entry.label}.txt` });
  const label = `${entry.label} (${entry.code})`;

  check(`${label}: 種別コード自動判定`, doc.format.code === entry.code && !doc.format.generic,
    `判定結果=${doc.format.code}`);
  check(`${label}: 全レコード 120 桁`,
    doc.records.every((r) => r.text.length === 120));
  check(`${label}: 構成 = ヘッダ 1 / トレーラ 1 / エンド 1`,
    doc.records.filter((r) => r.kind === 'header').length === 1 &&
    doc.records.filter((r) => r.kind === 'trailer').length === 1 &&
    doc.records.filter((r) => r.kind === 'end').length === 1);

  const out = Zengin.serialize(doc);
  check(`${label}: バイト完全一致で書き戻し`,
    out.length === bytes.length && out.every((b, i) => b === bytes[i]));

  const issues = Zengin.validate(doc);
  const errors = issues.filter((i) => i.level === 'error');
  check(`${label}: エラー 0 件`, errors.length === 0,
    errors.slice(0, 3).map((e) => e.message).join(' / '));

  const sum = Zengin.summarize(doc);
  check(`${label}: 件数と金額を集計`, sum.count > 0 && sum.amount > 0);
}

console.log('\n編集操作');
{
  const bytes = Samples.build('21');
  const doc = Zengin.parse(bytes);
  const dataDef = doc.format.records.data;
  const first = Zengin.recordsOfKind(doc, 'data')[0];

  Zengin.setField(first, dataDef.byKey.amount, '1234567');
  check('金額編集後も 120 桁', first.text.length === 120);
  check('金額は右詰 0 埋め', Zengin.rawField(first, dataDef.byKey.amount) === '0001234567',
    Zengin.rawField(first, dataDef.byKey.amount));
  check('編集値を読み戻せる', Zengin.readField(first, dataDef.byKey.amount) === '1234567');

  Zengin.setField(first, dataDef.byKey.payeeName, 'ｶ)ﾃｽﾄ');
  check('文字項目は左詰 空白埋め',
    Zengin.rawField(first, dataDef.byKey.payeeName) === 'ｶ)ﾃｽﾄ' + ' '.repeat(25),
    JSON.stringify(Zengin.rawField(first, dataDef.byKey.payeeName)));

  const before = Zengin.validate(doc).filter((i) => i.level === 'error').length;
  check('合計不一致をエラー検出', before > 0);
  Zengin.recalcTrailer(doc);
  const after = Zengin.validate(doc).filter((i) => i.level === 'error').length;
  check('合計再計算でエラー解消', after === 0, `残 ${after} 件`);

  // 桁あふれの切り詰め
  Zengin.setField(first, dataDef.byKey.payeeName, 'ｱ'.repeat(50));
  check('桁あふれは切り詰め', first.text.length === 120 &&
    Zengin.rawField(first, dataDef.byKey.payeeName).length === 30);
}

console.log('\n新規レコードの初期値');
{
  const doc = Zengin.parse(Samples.build('21'));
  const dataDef = doc.format.records.data;
  const blank = Zengin.blankRecord(doc.format, 'data');
  check('データ区分だけが設定される', blank.text === '2' + ' '.repeat(119), JSON.stringify(blank.text.slice(0, 8)));

  doc.records.splice(doc.records.length - 2, 0, blank);
  Zengin.recalcTrailer(doc);
  const issues = Zengin.validate(doc);
  const codeWarnings = issues.filter((i) =>
    i.level === 'warn' && i.message.includes('未定義のコード'));
  check('未定義コードの警告が出ない', codeWarnings.length === 0,
    codeWarnings.slice(0, 2).map((i) => i.message).join(' / '));
  const required = issues.filter((i) =>
    i.level === 'error' && i.message.includes('必須項目'));
  check('未入力の必須項目は指摘される', required.length > 0);
}

console.log('\n入出金系フォーマット（レイアウト未登録）');
{
  const codec = Charset.getCodec('shift_jis');
  const line = (kubun, rest = '') => (kubun + rest).padEnd(200, ' ');
  for (const [code, name] of [['01', '振込入金通知'], ['02', '残高通知'], ['03', '入出金取引明細']]) {
    const text = [line('1', `${code}0`), line('2'), line('2'), line('8'), line('9')]
      .join('\r\n') + '\r\n';
    const bytes = codec.encode(text);
    const doc = Zengin.parse(bytes, { fileName: `${name}.txt` });
    check(`${name} (${code}): 種別コードで識別`,
      doc.format.code === code && doc.format.name === name && !doc.format.generic);
    check(`${name} (${code}): レコード長 200 桁`, doc.recordLength === 200 &&
      doc.records.every((r) => r.text.length === 200));
    check(`${name} (${code}): レイアウト未登録の印`, doc.format.layoutPending === true);
    check(`${name} (${code}): データ件数を数える`, Zengin.summarize(doc).count === 2);
    const out = Zengin.serialize(doc);
    check(`${name} (${code}): バイト完全一致で書き戻し`,
      out.length === bytes.length && out.every((b, i) => b === bytes[i]));
    const errors = Zengin.validate(doc).filter((i) => i.level === 'error');
    check(`${name} (${code}): エラー 0 件`, errors.length === 0,
      errors.slice(0, 2).map((e) => e.message).join(' / '));
  }

  // 規定と違うレコード長でも、切り詰めずに読み込むこと
  const odd = codec.encode(['1030' + '0'.repeat(246), '9' + ' '.repeat(249)].join('\r\n') + '\r\n');
  const oddDoc = Zengin.parse(odd, {});
  const oddOut = Zengin.serialize(oddDoc);
  check('規定外のレコード長でも切り詰めない',
    oddOut.length === odd.length && oddOut.every((b, i) => b === odd[i]),
    `in=${odd.length} out=${oddOut.length}`);
  check('レコード長の食い違いを通知',
    oddDoc.notices.some((n) => n.level === 'warn' && n.message.includes('200 桁')));
}

console.log('\n読み込みの頑健性');
{
  // 改行なしの連結ファイル
  const bytes = Samples.build('21');
  const text = Charset.getCodec('shift_jis').decode(bytes).replace(/\r\n/g, '');
  const flat = Charset.getCodec('shift_jis').encode(text);
  const doc = Zengin.parse(flat);
  check('改行なしファイルを 120 桁で分割', doc.records.length === 13 && doc.lineEnding === 'NONE',
    `records=${doc.records.length} eol=${doc.lineEnding}`);

  // LF のみ
  const lf = Charset.getCodec('shift_jis').encode(
    Charset.getCodec('shift_jis').decode(bytes).replace(/\r\n/g, '\n'));
  check('LF 改行を認識', Zengin.parse(lf).lineEnding === 'LF');

  // 未対応の種別コード
  const unknownText = '199' + ' '.repeat(117) + '\r\n' + '9' + ' '.repeat(119) + '\r\n';
  const unknown = Zengin.parse(Charset.getCodec('shift_jis').encode(unknownText));
  check('未対応種別は汎用表示にフォールバック', unknown.format.generic === true);

  // UTF-8 ファイル
  const utf8Bytes = new TextEncoder().encode(
    Charset.getCodec('shift_jis').decode(bytes));
  const utf8doc = Zengin.parse(utf8Bytes);
  check('UTF-8 を自動判定', utf8doc.encoding === 'utf-8', utf8doc.encoding);
  check('UTF-8 でも種別コードを判定', utf8doc.format.code === '21');
}

console.log('\nCSV 出力');
{
  const doc = Zengin.parse(Samples.build('21'));
  const csv = Zengin.toCsv(doc);
  const lines = csv.trim().split('\r\n');
  check('見出し + データ件数分の行', lines.length === 1 + Zengin.summarize(doc).count);
  check('見出しに受取人名を含む', lines[0].includes('受取人名'));
}

console.log(`\n${failures === 0 ? '✅ すべて成功' : `❌ ${failures} 件失敗`}`);
process.exit(failures === 0 ? 0 : 1);

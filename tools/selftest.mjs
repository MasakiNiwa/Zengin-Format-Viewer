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
  check(`${label}: 全レコードが規定の ${doc.format.recordLength} 桁`,
    doc.records.every((r) => r.text.length === doc.format.recordLength));
  check(`${label}: 各グループがヘッダとトレーラを持つ`, (() => {
    const list = Zengin.groups(doc);
    return list.length >= 1 && list.every((g) => g.header && g.trailer) &&
      doc.records.filter((r) => r.kind === 'end').length === 1;
  })());

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

console.log('\n仕様書どおりの桁位置か（AP-Ⅰ-12 令和元年 12 月）');
{
  // 出典の表から書き写した値。ここが変わると読み違いが起きるため固定値で守る。
  const expected = [
    ['21', 'header', 'requesterCode', 5, 10, 'N'],
    ['21', 'header', 'transferDate', 55, 4, 'N'],
    ['21', 'data', 'payeeName', 51, 30, 'C'],
    ['21', 'data', 'amount', 81, 10, 'N'],
    ['21', 'data', 'customerCode1', 92, 10, 'N'],
    ['21', 'data', 'ident', 113, 1, 'C'],
    ['11', 'header', 'requesterName', 15, 40, 'C'],
    ['11', 'data', 'clearingCode', 39, 4, 'N'],
    ['11', 'data', 'payeeName', 51, 30, 'C'],
    ['11', 'data', 'employeeNumber', 92, 10, 'N'],
    ['11', 'data', 'sectionCode', 102, 10, 'N'],
    ['91', 'header', 'depositType', 96, 1, 'N'],
    ['91', 'header', 'accountNumber', 97, 7, 'N'],
    ['91', 'data', 'customerNumber', 92, 20, 'N'],
    ['91', 'data', 'resultCode', 112, 1, 'N'],
    ['91', 'trailer', 'failAmount', 44, 12, 'N'],
    ['01', 'header', 'periodFrom', 11, 6, 'N'],
    ['01', 'header', 'accountName', 68, 40, 'C'],
    ['01', 'data', 'amount', 20, 10, 'N'],
    ['01', 'data', 'remitterName', 50, 48, 'C'],
    ['01', 'data', 'edi', 129, 20, 'C'],
    ['01', 'trailer', 'totalAmount', 8, 12, 'N'],
    ['03', 'header', 'depositType', 63, 1, 'N'],
    ['03', 'header', 'accountNumber', 64, 10, 'N'],
    ['03', 'header', 'openingBalance', 116, 14, 'N'],
    ['03', 'data', 'inOutKubun', 22, 1, 'N'],
    ['03', 'data', 'amount', 25, 12, 'N'],
    ['03', 'data', 'remitterName', 82, 48, 'C'],
    ['03', 'trailer', 'dataCount', 55, 7, 'N'],
    ['03', 'end', 'accountTotal', 12, 5, 'N'],
    ['04', 'header', 'noticeKubun', 4, 1, 'N'],
    ['04', 'header', 'requesterName', 22, 40, 'C'],
    ['04', 'data', 'depositType', 18, 1, 'N'],
    ['04', 'data', 'balance', 74, 14, 'N'],
    ['04', 'data', 'lastTxDate', 146, 6, 'N'],
    ['04', 'trailer', 'dataCount', 2, 7, 'N']
  ];
  let mismatches = [];
  for (const [code, kind, key, pos, len, type] of expected) {
    const field = Formats.getFormat(code).records[kind].byKey[key];
    if (!field) { mismatches.push(`${code}/${kind}/${key}: 定義なし`); continue; }
    if (field.pos !== pos || field.len !== len || field.type !== type) {
      mismatches.push(`${code}/${kind}/${key}: ${field.pos}-${field.end} ${field.len}${field.type}` +
        ` （期待 ${pos} ${len}${type}）`);
    }
  }
  check(`主要 ${expected.length} 項目の桁位置が仕様どおり`, mismatches.length === 0,
    mismatches.slice(0, 4).join(' / '));

  // 振込入金通知 フォーマット B のデータ・レコード
  const bData = Formats.withVariant(Formats.getFormat('01'), 'b').records.data;
  check('振込入金通知 B: 金額(2) が 129-140 桁',
    bData.byKey.amount2.pos === 129 && bData.byKey.amount2.len === 12);
  check('振込入金通知 B: EDI 情報が 153-172 桁',
    bData.byKey.edi.pos === 153 && bData.byKey.edi.len === 20);

  // 入出金取引明細 定期性預金のデータ・レコード
  const tData = Formats.withVariant(Formats.getFormat('03'), 'time').records.data;
  check('入出金明細 定期性: 利率が 78-83 桁',
    tData.byKey.rate.pos === 78 && tData.byKey.rate.len === 6,
    `${tData.byKey.rate.pos}-${tData.byKey.rate.end}`);
  check('入出金明細 定期性: 期間利息正負表示が 196 桁目',
    tData.byKey.termInterestSign.pos === 196);
}

console.log('\n照会・通知系フォーマット（200 桁）');
{
  for (const [code, name, groupCount] of [['01', '振込入金通知', 1], ['03', '入出金取引明細', 1], ['04', '残高通知（預金）', 2]]) {
    const bytes = Samples.build(code);
    const doc = Zengin.parse(bytes, { fileName: `${name}.txt` });
    check(`${name} (${code}): 種別コードで識別`, doc.format.code === code && !doc.format.generic);
    check(`${name} (${code}): レコード長 200 桁`,
      doc.recordLength === 200 && doc.records.every((r) => r.text.length === 200));
    check(`${name} (${code}): グループ数 ${groupCount}`, Zengin.groups(doc).length === groupCount);
    const out = Zengin.serialize(doc);
    check(`${name} (${code}): バイト完全一致で書き戻し`,
      out.length === bytes.length && out.every((b, i) => b === bytes[i]));
    const errors = Zengin.validate(doc).filter((i) => i.level === 'error');
    check(`${name} (${code}): エラー 0 件`, errors.length === 0,
      errors.slice(0, 2).map((e) => e.message).join(' / '));
  }

  // バリアントの自動判定
  const b = Zengin.parse(Samples.build('01', { variantKey: 'b' }));
  check('振込入金通知: フォーマット B を自動判定', b.variantKey === 'b', String(b.variantKey));
  check('振込入金通知: B でもエラー 0 件',
    Zengin.validate(b).filter((i) => i.level === 'error').length === 0);
  const a = Zengin.parse(Samples.build('01', { variantKey: 'a' }));
  check('振込入金通知: フォーマット A を自動判定', a.variantKey === 'a', String(a.variantKey));

  // 入出金取引明細は、ヘッダーの預金種目でデータ・レコードが切り替わる
  const liquid = Zengin.parse(Samples.build('03'));
  check('入出金明細: 普通預金は流動性レイアウト', liquid.variantKey === 'liquid');
  const timeText = Charset.getCodec('shift_jis').decode(Samples.build('03'));
  const timeLines = timeText.split('\r\n');
  timeLines[0] = timeLines[0].slice(0, 62) + '6' + timeLines[0].slice(63); // 預金種目を定期預金に
  const timeDoc = Zengin.parse(Charset.getCodec('shift_jis').encode(timeLines.join('\r\n')));
  check('入出金明細: 定期預金は定期性レイアウト', timeDoc.variantKey === 'time', String(timeDoc.variantKey));
  check('入出金明細: 入金・出金を分けて集計', (() => {
    const aggs = Zengin.computeAggregates(liquid, Zengin.groups(liquid)[0].data);
    return aggs.length === 3 && aggs[0].count + aggs[1].count === aggs[2].count;
  })());
}

console.log('\n複数グループ（口座ごとのヘッダー繰り返し）');
{
  const bytes = Samples.build('04');
  const doc = Zengin.parse(bytes);
  const list = Zengin.groups(doc);
  check('グループごとにヘッダーとトレーラを持つ',
    list.every((g) => g.header && g.trailer && g.data.length === 2));
  check('グループ見出しを作れる', Zengin.groupLabel(doc, list[0]).includes('227'),
    Zengin.groupLabel(doc, list[0]));

  // 2 組目のトレーラだけを壊し、そのグループだけが指摘されること
  const trailerDef = doc.format.records.trailer;
  Zengin.setField(list[1].trailer, trailerDef.byKey.dataCount, '99');
  const errors = Zengin.validate(doc).filter((i) => i.level === 'error');
  check('該当グループだけが不一致として出る',
    errors.length === 1 && errors[0].message.includes('2 組目'),
    errors.map((e) => e.message).join(' / '));
  Zengin.recalcTrailer(doc);
  check('グループ単位で再計算できる',
    Zengin.validate(doc).filter((i) => i.level === 'error').length === 0);
  const out = Zengin.serialize(doc);
  check('再計算後もバイト数が変わらない', out.length === bytes.length);
}

console.log('\n項目ごとの使用文字（付録 1）');
{
  const doc = Zengin.parse(Samples.build('21'));
  const dataDef = doc.format.records.data;
  const first = Zengin.recordsOfKind(doc, 'data')[0];

  Zengin.setField(first, dataDef.byKey.payeeName, 'ｶ)ｻｸﾗ,ｼﾖｳｼﾞ');
  const warn = Zengin.validate(doc).find((i) => i.level === 'warn' && i.message.includes('受取人名'));
  check('氏名欄のカンマを警告', !!warn, '検出されず');
  check('警告に根拠を添える', !!warn && warn.hint.includes('記号 4 種類'));

  Zengin.setField(first, dataDef.byKey.payeeName, 'ｶ)ｻｸﾗｼﾖｳｼﾞ');
  check('正しい氏名なら警告しない',
    !Zengin.validate(doc).some((i) => i.level === 'warn' && i.message.includes('受取人名')));

  Zengin.setField(first, dataDef.byKey.branchName, 'ﾏﾙﾉｳﾁ.ｼﾃﾝ');
  check('店舗名のピリオドを警告',
    Zengin.validate(doc).some((i) => i.level === 'warn' && i.message.includes('被仕向支店名')));

  Zengin.setField(first, dataDef.byKey.payeeName, 'ｶﾌﾞｼｷｶﾞｲｼｬ');
  check('小文字カナを使用文字一覧外として警告',
    Zengin.validate(doc).some((i) => i.level === 'warn' && i.message.includes('使用文字一覧')));
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

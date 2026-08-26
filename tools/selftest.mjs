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

console.log('\n往復の境界条件（未編集なら 1 バイトも変えない）');
{
  const codec = Charset.getCodec('shift_jis');
  const lines = codec.decode(Samples.build('21')).split('\r\n').filter(Boolean);
  const roundTrip = (name, bytes) => {
    const doc = Zengin.parse(bytes, {});
    const out = Zengin.serialize(doc);
    check(name, out.length === bytes.length && out.every((b, i) => b === bytes[i]),
      `in=${bytes.length} out=${out.length}`);
  };
  roundTrip('CRLF・末尾改行あり', codec.encode(lines.join('\r\n') + '\r\n'));
  roundTrip('CRLF・末尾改行なし', codec.encode(lines.join('\r\n')));
  roundTrip('LF・末尾改行あり', codec.encode(lines.join('\n') + '\n'));
  roundTrip('LF・末尾改行なし', codec.encode(lines.join('\n')));
  roundTrip('改行なしの連結', codec.encode(lines.join('')));
  roundTrip('UTF-8 BOM 付き', new TextEncoder().encode('\uFEFF' + lines.join('\r\n') + '\r\n'));
  roundTrip('規定より短いレコード',
    codec.encode(lines.slice(0, -1).join('\r\n') + '\r\n' + '9\r\n'));
  roundTrip('規定より長いレコード',
    codec.encode(lines.map((l, i) => (i === 2 ? l + 'XX' : l)).join('\r\n') + '\r\n'));
  const withRaw = codec.encode(lines.join('\r\n') + '\r\n');
  withRaw[300] = 0x80; withRaw[301] = 0xfd;
  roundTrip('未定義バイトを含む', withRaw);

  // 桁数の過不足は、読み込みでは直さず検証で伝える
  const shortDoc = Zengin.parse(codec.encode(lines.slice(0, -1).join('\r\n') + '\r\n' + '9\r\n'), {});
  const shortIssue = Zengin.validate(shortDoc).find((i) => i.message.includes('レコード長が 1 桁'));
  check('短いレコードは警告として伝える', !!shortIssue && shortIssue.level === 'warn');
  check('レコード長をそろえられる', Zengin.normalizeRecordLengths(shortDoc) === 1 &&
    shortDoc.records.every((r) => r.text.length === 120));
}

console.log('\n数字項目の判定');
{
  const fmt = Formats.getFormat('21');
  const dataDef = fmt.records.data;
  const build = (key, raw) => {
    const doc = Zengin.createEmpty('21');
    const rec = Zengin.blankRecord(fmt, 'data');
    const field = dataDef.byKey[key];
    rec.text = rec.text.slice(0, field.pos - 1) + raw + rec.text.slice(field.end);
    doc.records.splice(1, 0, rec);
    return Zengin.validate(doc).filter((i) => i.fieldKey === key && i.level === 'error');
  };
  check('0012345 は正常', build('accountNumber', '0012345').length === 0);
  check('12 345 は数字と空白の混在として検出',
    build('accountNumber', '12 345 ').some((i) => i.message.includes('混在')));
  check('先頭が空白でも検出',
    build('accountNumber', '  12345').some((i) => i.message.includes('混在')));
  check('任意項目の全桁空白は許容',
    build('clearingCode', '    ').length === 0);
  check('数字以外は従来どおり検出',
    build('accountNumber', 'ABC1234').some((i) => i.message.includes('数字以外')));
}

console.log('\n日付の妥当性');
{
  const fmt = Formats.getFormat('21');
  const dateOk = (mmdd) => {
    const doc = Zengin.createEmpty('21');
    Zengin.setField(doc.records[0], fmt.records.header.byKey.transferDate, mmdd);
    return !Zengin.validate(doc).some((i) => i.message.includes('日付として不正'));
  };
  check('0430 は通る', dateOk('0430'));
  check('0431 は弾く', !dateOk('0431'));
  check('0229 は通す（和暦のため閏年を判定しない）', dateOk('0229'));
  check('0230 は弾く', !dateOk('0230'));
  check('1231 は通る', dateOk('1231'));
  check('0000 は弾く', !dateOk('0000'));
}

console.log('\nコード区分 EBCDIC の扱い');
{
  const codec = Charset.getCodec('shift_jis');
  const lines = codec.decode(Samples.build('21')).split('\r\n').filter(Boolean);
  lines[0] = lines[0].slice(0, 3) + '1' + lines[0].slice(4);
  const doc = Zengin.parse(codec.encode(lines.join('\r\n') + '\r\n'), {});
  check('EBCDIC 宣言を検出', Zengin.usesEbcdic(doc) === true);
  const issue = Zengin.validate(doc).find((i) => i.message.includes('EBCDIC'));
  check('未対応としてエラーで伝える', !!issue && issue.level === 'error');
  check('書き出しを止める旨を伝える', !!issue && issue.hint.includes('書き出しは行えません'));

  const normal = Zengin.parse(Samples.build('21'), {});
  check('JIS のファイルは対象外', Zengin.usesEbcdic(normal) === false);
}

console.log('\nエンド・レコードの集計値');
{
  const codec = Charset.getCodec('shift_jis');
  const lines = codec.decode(Samples.build('03')).split('\r\n').filter(Boolean);
  const last = lines.length - 1;
  lines[last] = lines[last].slice(0, 1) + '0000000099' + '00009' + lines[last].slice(16);
  const doc = Zengin.parse(codec.encode(lines.join('\r\n') + '\r\n'), {});
  const issues = Zengin.validate(doc).filter((i) => i.message.includes('エンド・レコード'));
  check('口座数の不一致を検出', issues.some((i) => i.message.includes('口座数')));
  check('レコード総件数の不一致を検出', issues.some((i) => i.message.includes('レコード総件数')));
  Zengin.recalcTrailer(doc);
  check('再計算で解消', Zengin.validate(doc)
    .filter((i) => i.message.includes('エンド・レコード')).length === 0);

  // エンド自身を含める / 含めないのどちらの数え方でも指摘しない
  const endDef = doc.format.records.end;
  const endRec = Zengin.recordsOfKind(doc, 'end')[0];
  Zengin.setField(endRec, endDef.byKey.recordTotal, String(doc.records.length - 1));
  check('エンドを除く数え方も許容', !Zengin.validate(doc)
    .some((i) => i.message.includes('レコード総件数')));
}

console.log('\n預金口座振替の処理結果');
{
  const result = Zengin.parse(Samples.build('91', { withResult: true }), {});
  check('正しい結果ファイルは指摘なし',
    Zengin.validate(result).filter((i) => i.message.includes('振替')).length === 0);

  const trailerDef = result.format.records.trailer;
  const trailer = Zengin.recordsOfKind(result, 'trailer')[0];
  Zengin.setField(trailer, trailerDef.byKey.doneAmount, '1');
  const issues = Zengin.validate(result);
  check('振替済金額の不一致を検出',
    issues.some((i) => i.message.includes('振替済金額') && i.message.includes('求めた値')));
  check('振替済＋振替不能＝合計金額 も検証',
    issues.some((i) => i.message.includes('合計が、合計金額')));

  const request = Zengin.parse(Samples.build('91'), {});
  check('依頼明細では結果の突合を行わない',
    Zengin.validate(request).filter((i) => i.message.includes('振替')).length === 0);
}

console.log('\n重複明細の確認（振込依頼系のみ）');
{
  const doc = Zengin.parse(Samples.build('21'), {});
  const dataDef = doc.format.records.data;
  const rows = Zengin.recordsOfKind(doc, 'data');
  const dupIssues = () => Zengin.validate(doc).filter((i) => i.message.includes('同じ口座'));
  check('通常のサンプルでは指摘しない', dupIssues().length === 0);

  const copyKeys = ['bankCode', 'branchCode', 'depositType', 'accountNumber'];
  copyKeys.forEach((k) =>
    Zengin.setField(rows[3], dataDef.byKey[k], Zengin.readField(rows[0], dataDef.byKey[k])));
  Zengin.setField(rows[3], dataDef.byKey.amount, Zengin.readField(rows[0], dataDef.byKey.amount));
  Zengin.recalcTrailer(doc);
  const exact = dupIssues();
  check('同一口座＋同一金額を警告', exact.length === 1 && exact[0].level === 'warn',
    exact.map((i) => i.level).join(','));
  check('確認を促す表現である', exact[0].hint.includes('重複が誤りとは限りません'));

  Zengin.setField(rows[3], dataDef.byKey.amount, '999');
  Zengin.recalcTrailer(doc);
  const partial = dupIssues();
  check('同一口座＋別金額は情報にとどめる',
    partial.length === 1 && partial[0].level === 'info', partial.map((i) => i.level).join(','));

  // 別口座で同じ金額は重複扱いしない
  Zengin.setField(rows[3], dataDef.byKey.accountNumber, '9999999');
  Zengin.setField(rows[3], dataDef.byKey.amount, Zengin.readField(rows[0], dataDef.byKey.amount));
  Zengin.recalcTrailer(doc);
  check('別口座＋同一金額は指摘しない', dupIssues().length === 0);

  // 入金系フォーマットは対象外
  const incoming = Zengin.parse(Samples.build('01'), {});
  check('入金系は重複チェックの対象外',
    Zengin.validate(incoming).filter((i) => i.message.includes('同じ口座')).length === 0);
}

console.log('\nダミー領域の固定値');
{
  const doc = Zengin.parse(Samples.build('03'), {});
  check('規定どおりなら指摘しない',
    Zengin.validate(doc).filter((i) => i.message.includes('規定では')).length === 0);
  const headerDef = doc.format.records.header;
  const header = Zengin.recordsOfKind(doc, 'header')[0];
  const field = headerDef.byKey.reserved;
  header.text = header.text.slice(0, field.pos - 1) + '123' + header.text.slice(field.end);
  const issue = Zengin.validate(doc).find((i) => i.message.includes('規定では'));
  check('「0」で埋める領域の違いを警告', !!issue && issue.level === 'warn');
  check('銀行独自使用の可能性にも触れる', !!issue && issue.hint.includes('独自に使用'));
}

console.log('\n口座ごとのレイアウト判定');
{
  const codec = Charset.getCodec('shift_jis');
  const base = Formats.getFormat('03');
  const timeFmt = Formats.withVariant(base, 'time');
  const liquid = Zengin.parse(Samples.build('03'), {});
  const lines = codec.decode(Samples.build('03')).split('\r\n').filter(Boolean);

  // 2 組目として、定期預金（預金種目 6）のヘッダーと定期性データを足す
  const header2 = Zengin.blankRecord(timeFmt, 'header');
  const hd = timeFmt.records.header;
  Zengin.setField(header2, hd.byKey.codeKubun, '0');
  Zengin.setField(header2, hd.byKey.createdDate, '060501');
  Zengin.setField(header2, hd.byKey.periodFrom, '060401');
  Zengin.setField(header2, hd.byKey.periodTo, '060430');
  Zengin.setField(header2, hd.byKey.bankCode, '0009');
  Zengin.setField(header2, hd.byKey.branchCode, '227');
  Zengin.setField(header2, hd.byKey.reserved, '0');
  Zengin.setField(header2, hd.byKey.depositType, '6');
  Zengin.setField(header2, hd.byKey.accountNumber, '7654321');

  const td = timeFmt.records.data;
  const data2 = Zengin.blankRecord(timeFmt, 'data');
  Zengin.setField(data2, td.byKey.valueDate, '060415');
  Zengin.setField(data2, td.byKey.paymentDate, '060415');
  Zengin.setField(data2, td.byKey.inOutKubun, '1');
  Zengin.setField(data2, td.byKey.txKind, '15');
  Zengin.setField(data2, td.byKey.amount, '3000000');
  Zengin.setField(data2, td.byKey.billAmount, '0');
  Zengin.setField(data2, td.byKey.rate, '000100');
  Zengin.setField(data2, td.byKey.maturityDate, '070415');

  const trailer2 = Zengin.blankRecord(timeFmt, 'trailer');
  const mixedLines = lines.slice(0, -1)
    .concat([header2.text, data2.text, trailer2.text, lines[lines.length - 1]]);
  const mixed = Zengin.parse(codec.encode(mixedLines.join('\r\n') + '\r\n'), {});

  const groups = Zengin.groups(mixed);
  check('グループが 2 組に分かれる', groups.length === 2);
  check('1 組目は流動性預金のレイアウト', groups[0].variantKey === 'liquid', String(groups[0].variantKey));
  check('2 組目は定期性預金のレイアウト', groups[1].variantKey === 'time', String(groups[1].variantKey));
  check('レイアウト混在を検知', Zengin.hasMixedVariants(mixed) === true);

  const defs = Zengin.dataDefMap(mixed);
  const secondData = groups[1].data[0];
  check('2 組目は定期性の項目で読める',
    Zengin.readField(secondData, defs[secondData.id].byKey.rate) === '000100',
    Zengin.readField(secondData, defs[secondData.id].byKey.rate));
  check('1 組目は流動性の項目で読める',
    !!defs[groups[0].data[0].id].byKey.remitterName);

  Zengin.recalcTrailer(mixed);
  const errors = Zengin.validate(mixed).filter((i) => i.level === 'error');
  check('混在ファイルでもエラーなし', errors.length === 0,
    errors.slice(0, 2).map((e) => e.message).join(' / '));
  check('レイアウトが分かれる旨を情報として伝える',
    Zengin.validate(mixed).some((i) => i.level === 'info' && i.message.includes('レイアウトが異なる')));

  const out = Zengin.serialize(mixed);
  const src = codec.encode(mixedLines.join('\r\n') + '\r\n');
  check('混在ファイルも往復で壊れない', out.length === src.length);
  void liquid;
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

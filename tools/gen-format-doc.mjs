/**
 * レコードレイアウト定義から docs/format-spec.md を生成する。
 * 定義（assets/js/formats.js）が唯一の正とし、ドキュメントは常にそこから作る。
 *   node tools/gen-format-doc.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
globalThis.window = globalThis;
for (const f of ['charset', 'formats', 'zengin']) require(path.join(root, 'assets', 'js', `${f}.js`));
const { ZenginFormats: Formats, Zengin } = globalThis;

const esc = (s) => String(s).replace(/\|/g, '\\|');

/** レコード定義を Markdown の表にする。 */
function fieldTable(def) {
  const lines = [
    '| 桁位置 | 桁数 | 項目名 | 属性 | 内容 |',
    '| --- | --- | --- | --- | --- |'
  ];
  for (const field of def.fields) {
    const notes = [];
    if (field.fixed != null) notes.push(`固定値 \`${field.fixed}\``);
    if (field.required) notes.push('**必須**');
    if (field.optional) notes.push('任意');
    if (field.codes) {
      notes.push(Object.keys(field.codes).map((c) => `\`${c}\`=${field.codes[c]}`).join('、'));
    }
    if (field.charClass) notes.push(`使用文字は${field.charClass === 'name' ? '氏名欄' : field.charClass === 'branch' ? '店舗名欄' : 'EDI 情報欄'}の制限に従う`);
    if (field.dummy) notes.push('未使用（スペースで埋める）');
    else if (field.hint) notes.push(esc(field.hint));
    lines.push(`| ${field.pos}-${field.end} | ${field.len} | ${esc(field.label)} | ` +
      `${field.type === 'N' ? '数字' : '文字'} | ${notes.join(' / ') || '—'} |`);
  }
  return lines.join('\n');
}
const out = [];

out.push('# レコードレイアウト仕様');
out.push('');
out.push('本ツールが採用している全銀協制定フォーマットのレコードレイアウトです。');
out.push('この文書は `assets/js/formats.js` の定義から `node tools/gen-format-doc.mjs` で自動生成しています。');
out.push('');
out.push('**出典**: 一般社団法人全国銀行協会');
out.push('「AP-Ⅰ-12〔別冊〕全銀協パーソナル・コンピュータ用標準通信プロトコル（ベーシック手順）');
out.push('適用業務およびレコード・フォーマット」令和元年 12 月');
out.push('');
out.push('> **免責事項**');
out.push('> 本ツールおよび本文書の内容の正確性・完全性について、作者はいかなる保証も行いません。');
out.push('> 金融機関によって、ダミー領域の用途や任意項目の扱いが異なる場合があります。');
out.push('> 実際にデータを提出する際は、必ず取引金融機関の仕様書とあわせてご確認ください。');
out.push('> 本ツールの利用によって生じたいかなる損害についても、作者は一切の責任を負いません。');
out.push('');

out.push('## 共通事項');
out.push('');
out.push('| 項目 | 内容 |');
out.push('| --- | --- |');
out.push('| レコード長 | 振込依頼系は 120 桁、照会・通知系は 200 桁（いずれも固定長） |');
out.push('| 文字コード | JIS（Shift_JIS の 1 バイト領域）または EBCDIC。本ツールは JIS に対応 |');
out.push('| 属性 N（数字） | 右詰め・残りは `0` で埋める |');
out.push('| 属性 C（文字） | 左詰め・残りは半角スペースで埋める |');
out.push('| レコード構成 | ヘッダー(1) → データ(2)×n → トレーラ(8) を 1 組とし、最後にエンド(9) |');
out.push('| 複数ヘッダー | 1 ファイルに複数の組を含めてよい（種別コードは同一に限る） |');
out.push('');

out.push('### 使用できる文字（付録 1）');
out.push('');
out.push('使用文字一覧に掲げられているのは、半角スペース・数字・英大文字・');
out.push('カタカナ（大文字）・濁点・半濁点と、記号 `\' ( ) : + , ¥ - . / ? ｢ ｣` です。');
out.push('さらに項目の種類ごとに、次の制限があります。');
out.push('');
out.push('| 項目の種類 | 使用できる文字 |');
out.push('| --- | --- |');
out.push('| 口座名・氏名欄 | カナ（ヲと小文字を除く）・濁点・半濁点・英大文字・数字・スペース・記号 4 種類 `( ) - .` |');
out.push('| 店舗名欄 | カナ（ヲと小文字を除く）・濁点・半濁点・英大文字・数字・記号 1 種類 `-` |');
out.push('| EDI 情報欄 | カナ（小文字を除く）・濁点・半濁点・英大文字・数字・スペース・記号 8 種類 `¥ ｢ ｣ ( ) - / .` |');
out.push('');
out.push('小文字カナ（`ｧ ｨ ｩ` など）や `｡ ､ ･` は使用文字一覧に掲げられていません。');
out.push('本ツールでは読み込みは行いますが、警告として表示します。');
out.push('');

out.push('### 預金種目コード（付録 3）');
out.push('');
out.push('| コード | 預金種目 |');
out.push('| --- | --- |');
for (const [code, label] of Object.entries(Formats.CODE.depositAll)) {
  out.push(`| \`${code}\` | ${label} |`);
}
out.push('');
out.push('業務ごとに使用できる範囲は異なります。各レコードの「内容」欄をご覧ください。');
out.push('');

out.push('## 対応フォーマット一覧');
out.push('');
out.push('### 銀行へ提出するデータ');
out.push('');
out.push('| 種別コード | 名称 | レコード長 | 概要 |');
out.push('| --- | --- | --- | --- |');
for (const fmt of Formats.listFormats().filter((f) => f.direction === 'submit')) {
  out.push(`| \`${fmt.code}\` | ${fmt.name} | ${fmt.recordLength} 桁 | ${esc(fmt.description)} |`);
}
out.push('');
out.push('### 銀行から受け取るデータ');
out.push('');
out.push('| 種別コード | 名称 | レコード長 | 概要 |');
out.push('| --- | --- | --- | --- |');
for (const fmt of Formats.listFormats().filter((f) => f.direction === 'receive')) {
  out.push(`| \`${fmt.code}\` | ${fmt.name} | ${fmt.recordLength} 桁 | ${esc(fmt.description)} |`);
}
out.push('');
out.push('上記以外の種別コードのファイルも読み込めますが、桁の意味は解釈せず原文表示になります。');
out.push('');

for (const fmt of Formats.listFormats()) {
  out.push('---');
  out.push('');
  out.push(`## ${fmt.name}（種別コード \`${fmt.code}\`）`);
  out.push('');
  out.push(esc(fmt.description));
  out.push('');
  if (fmt.layoutPending) {
    out.push(`- **レコード長**: ${fmt.recordLength} 桁`);
    out.push('- **レコード構成**: ヘッダー(1) → データ(2)×n → トレーラ(8) → エンド(9)');
    out.push('- **項目レイアウト**: 未登録');
    out.push('');
    if (fmt.source) out.push(`> ${esc(fmt.source)}`);
    out.push('>');
    out.push('> 桁位置を誤ると、画面上は正しく見えたまま誤った金額や日付を示してしまうため、');
    out.push('> 確認できていないレイアウトは実装していません。');
    out.push('> お取引金融機関の仕様書をお持ちの方は Issue でご提供いただけると助かります。');
    out.push('');
    continue;
  }
  if (fmt.variants) {
    out.push('データ・レコードのレイアウトが次の 2 種類に分かれます（種別コードは同一）。');
    out.push('');
    for (const variant of fmt.variants) {
      out.push(`- **${esc(variant.label)}**`);
    }
    out.push('');
  }
  for (const kind of Zengin.KIND_ORDER) {
    const def = fmt.records[kind];
    if (!def) continue;
    if (kind === 'data' && fmt.variants) continue;
    out.push(`### ${def.label}（データ区分 \`${def.kubun}\`）`);
    out.push('');
    out.push(fieldTable(def));
    out.push('');
  }
  // バリアントを持つフォーマットは、データ・レコードを種類ごとに出力する
  for (const variant of fmt.variants || []) {
    out.push(`### データ・レコード — ${esc(variant.label)}`);
    out.push('');
    out.push(fieldTable(variant.data));
    out.push('');
  }
}

const target = path.join(root, 'docs', 'format-spec.md');
fs.writeFileSync(target, out.join('\n'), 'utf8');
console.log(`生成しました: ${path.relative(root, target)}（${out.length} 行）`);

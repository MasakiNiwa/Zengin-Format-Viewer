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
const out = [];

out.push('# レコードレイアウト仕様');
out.push('');
out.push('本ツールが採用している全銀協制定フォーマットのレコードレイアウトです。');
out.push('この文書は `assets/js/formats.js` の定義から `node tools/gen-format-doc.mjs` で自動生成しています。');
out.push('');
out.push('> **ご注意**');
out.push('> 金融機関によって、ダミー領域の用途や任意項目の扱いが異なる場合があります。');
out.push('> 実際にデータを提出する際は、必ず取引金融機関の仕様書とあわせてご確認ください。');
out.push('');

out.push('## 共通事項');
out.push('');
out.push('| 項目 | 内容 |');
out.push('| --- | --- |');
out.push('| レコード長 | 120 桁（バイト）固定 |');
out.push('| 文字コード | Shift_JIS（JIS X 0201）の 1 バイト文字 |');
out.push('| 使用可能文字 | 半角数字、半角英大文字、半角カナ、スペース、記号 `( ) - . , / ¥` |');
out.push('| 属性 N（数字） | 右詰め・残りは `0` で埋める |');
out.push('| 属性 C（文字） | 左詰め・残りは半角スペースで埋める |');
out.push('| レコード構成 | ヘッダー(1) → データ(2)×n → トレーラー(8) → エンド(9) |');
out.push('');

out.push('## 対応フォーマット一覧');
out.push('');
out.push('| 種別コード | 名称 | 概要 |');
out.push('| --- | --- | --- |');
for (const fmt of Formats.listFormats()) {
  out.push(`| \`${fmt.code}\` | ${fmt.name} | ${esc(fmt.description)} |`);
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
  for (const kind of Zengin.KIND_ORDER) {
    const def = fmt.records[kind];
    if (!def) continue;
    out.push(`### ${def.label}（データ区分 \`${def.kubun}\`）`);
    out.push('');
    out.push('| 桁位置 | 桁数 | 項目名 | 属性 | 内容 |');
    out.push('| --- | --- | --- | --- | --- |');
    for (const field of def.fields) {
      const notes = [];
      if (field.fixed != null) notes.push(`固定値 \`${field.fixed}\``);
      if (field.required) notes.push('**必須**');
      if (field.codes) {
        notes.push(Object.keys(field.codes).map((c) => `\`${c}\`=${field.codes[c]}`).join('、'));
      }
      if (field.hint) notes.push(esc(field.hint));
      if (field.dummy) notes.push('未使用（スペース）');
      out.push(`| ${field.pos}-${field.end} | ${field.len} | ${esc(field.label)} | ` +
        `${field.type === 'N' ? '数字' : '文字'} | ${notes.join(' / ') || '—'} |`);
    }
    out.push('');
  }
}

const target = path.join(root, 'docs', 'format-spec.md');
fs.writeFileSync(target, out.join('\n'), 'utf8');
console.log(`生成しました: ${path.relative(root, target)}（${out.length} 行）`);

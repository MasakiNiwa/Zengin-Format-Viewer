/*!
 * zengin.js - 全銀固定長データの読み込み・編集・書き出し・検証
 *
 * すべての処理はブラウザ内で完結し、外部への通信は行いません。
 */
(function (global) {
  'use strict';

  var Charset = global.ZenginCharset;
  var Formats = global.ZenginFormats;

  var recordSeq = 0;

  var KIND_BY_KUBUN = { '1': 'header', '2': 'data', '8': 'trailer', '9': 'end' };
  var KUBUN_BY_KIND = { header: '1', data: '2', trailer: '8', end: '9' };
  var KIND_ORDER = ['header', 'data', 'trailer', 'end'];

  /* ------------------------------------------------------------------ *
   * 桁合わせ
   * ------------------------------------------------------------------ */

  function padRight(text, len, fill) {
    if (text.length >= len) return text.slice(0, len);
    return text + new Array(len - text.length + 1).join(fill);
  }

  function padLeft(text, len, fill) {
    if (text.length >= len) return text.slice(text.length - len);
    return new Array(len - text.length + 1).join(fill) + text;
  }

  /** 不足分だけ埋める（padRight と違い、長い文字列を切り詰めない）。 */
  function ensureLength(text, len) {
    return text.length >= len ? text : padRight(text, len, ' ');
  }

  /* ------------------------------------------------------------------ *
   * レコード
   * ------------------------------------------------------------------ */

  function makeRecord(text, kind) {
    return {
      id: 'r' + (++recordSeq),
      kind: kind,
      text: text
    };
  }

  /**
   * 空のレコードを生成する。
   *
   * データ区分などの固定値だけを設定し、他はすべて空白で埋める。
   * 数字項目を 0 で埋めてしまうと、0 が有効値でないコード項目
   * （振込指定区分・預金種目など）が「未定義のコード」として扱われるため、
   * 未入力であることが分かる空白のままにしておく。
   */
  function blankRecord(format, kind) {
    var def = format.records[kind];
    var parts = [];
    def.fields.forEach(function (field) {
      if (field.fixed != null) {
        parts.push(padLeft(field.fixed, field.len, '0'));
      } else {
        parts.push(padRight('', field.len, ' '));
      }
    });
    return makeRecord(padRight(parts.join(''), format.recordLength, ' '), kind);
  }

  /** 項目の生の桁内容を取り出す。 */
  function rawField(record, field) {
    return padRight(record.text.slice(field.pos - 1, field.end), field.len, ' ');
  }

  /**
   * 項目の値を編集用の文字列として取り出す（前後の埋め文字を除去）。
   * 金額・件数は先頭の 0 を落とすが、銀行番号や口座番号などのコードは
   * 先頭の 0 に意味があるためそのまま保持する。
   */
  function readField(record, field) {
    var raw = rawField(record, field);
    if (field.type === 'N') {
      if (field.format === 'amount' || field.format === 'count') {
        var trimmed = raw.replace(/^[\s0]+/, '');
        if (trimmed === '') return /\d/.test(raw) ? '0' : '';
        return trimmed;
      }
      return raw.trim();
    }
    return raw.replace(/\s+$/, '');
  }

  /** 桁埋めに使う文字を決める（既存の内容を尊重する）。 */
  function fillCharFor(field, currentRaw) {
    if (field.type === 'C') return ' ';
    if (/^\s*$/.test(currentRaw)) return ' '; // もともと空白の数字項目は空白のまま
    return '0';
  }

  /** 項目に値を書き込んだ新しいレコード文字列を返す。 */
  function writeField(record, field, value) {
    var current = rawField(record, field);
    var text = value == null ? '' : String(value);
    var padded;
    if (field.type === 'N') {
      text = text.replace(/[,\s]/g, '');
      if (text === '') {
        padded = padRight('', field.len, fillCharFor(field, current));
      } else {
        padded = padLeft(text, field.len, '0');
      }
    } else {
      padded = padRight(text, field.len, ' ');
    }
    var full = ensureLength(record.text, field.end);
    return full.slice(0, field.pos - 1) + padded + full.slice(field.end);
  }

  function setField(record, field, value) {
    record.text = writeField(record, field, value);
    return record;
  }

  /* ------------------------------------------------------------------ *
   * 値の書式化
   * ------------------------------------------------------------------ */

  function toNumber(value) {
    var digits = String(value == null ? '' : value).replace(/[^\d]/g, '');
    return digits === '' ? 0 : parseInt(digits, 10);
  }

  function formatAmount(value) {
    var digits = String(value == null ? '' : value).replace(/[^\d]/g, '');
    if (digits === '') return '';
    return String(parseInt(digits, 10)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatYymmdd(value) {
    var v = String(value == null ? '' : value).replace(/\D/g, '');
    if (v === '') return '';
    if (v.length < 6) v = padLeft(v, 6, '0');
    if (v.length !== 6) return String(value);
    return v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4, 6);
  }

  function formatHhmm(value) {
    var v = String(value == null ? '' : value).replace(/\D/g, '');
    if (v === '') return '';
    if (v.length < 4) v = padLeft(v, 4, '0');
    if (v.length !== 4) return String(value);
    return v.slice(0, 2) + ':' + v.slice(2, 4);
  }

  function formatMmdd(value) {
    var v = String(value == null ? '' : value).replace(/\D/g, '');
    if (v === '') return '';
    if (v.length < 4) v = padLeft(v, 4, '0');
    if (v.length !== 4) return String(value);
    return v.slice(0, 2) + '/' + v.slice(2, 4);
  }

  /** 画面表示用の値（金額はカンマ区切り、日付は MM/DD）。 */
  function displayValue(record, field) {
    var value = readField(record, field);
    if (field.format === 'amount' || field.format === 'count') return formatAmount(value);
    if (field.format === 'mmdd') return formatMmdd(value);
    if (field.format === 'yymmdd') return formatYymmdd(value);
    if (field.format === 'hhmm') return formatHhmm(value);
    return Charset.toDisplay(value);
  }

  /** コード値に対応する意味（例: 1 -> 普通預金）。 */
  function codeLabel(field, value) {
    if (!field.codes) return '';
    var key = String(value == null ? '' : value).trim();
    if (key === '' && field.codes[' ']) return field.codes[' '];
    return field.codes[key] || '';
  }

  /* ------------------------------------------------------------------ *
   * 読み込み
   * ------------------------------------------------------------------ */

  /** 改行コードを判定する。 */
  function detectLineEnding(text) {
    if (text.indexOf('\r\n') >= 0) return 'CRLF';
    if (text.indexOf('\n') >= 0) return 'LF';
    if (text.indexOf('\r') >= 0) return 'CR';
    return 'NONE';
  }

  var CANDIDATE_LENGTHS = [120, 200, 250, 190, 130, 100];

  /** 改行のないファイルからレコード長を推定する。 */
  function detectRecordLength(text) {
    var best = null;
    for (var i = 0; i < CANDIDATE_LENGTHS.length; i++) {
      var len = CANDIDATE_LENGTHS[i];
      if (text.length === 0 || text.length % len !== 0) continue;
      var ok = true;
      for (var p = 0; p < text.length; p += len) {
        if (!KIND_BY_KUBUN[text.charAt(p)]) { ok = false; break; }
      }
      if (ok) return len;
      if (best === null) best = len;
    }
    return best || 120;
  }

  /**
   * ファイルのバイト列を解析して文書オブジェクトを返す。
   * @param {Uint8Array} bytes
   * @param {{fileName?:string, encoding?:string, formatCode?:string}} [options]
   */
  function parse(bytes, options) {
    var opts = options || {};
    var notices = [];

    var detection = Charset.detectEncoding(bytes);
    var encoding = opts.encoding || detection.codec;
    var codec = Charset.getCodec(encoding);
    var text = codec.decode(bytes);

    // BOM は取り除いて解析するが、書き出しでそのまま復元できるよう覚えておく。
    // TextDecoder は UTF-8 BOM を自動で取り除くため、判定はバイト列に対して行う。
    var hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (hasBom) {
      notices.push({ level: 'info', message: 'UTF-8 BOM を検出しました。書き出し時も同じ位置に付けます。' });
    }

    var lineEnding = detectLineEnding(text);
    // 末尾の改行の有無も、読み込んだファイルと同じ形で書き戻すために覚えておく
    var trailingNewline = lineEnding !== 'NONE' && /(\r\n|\r|\n)$/.test(text);
    var lines;
    var recordLength;

    if (lineEnding === 'NONE') {
      recordLength = detectRecordLength(text);
      lines = [];
      for (var p = 0; p < text.length; p += recordLength) {
        lines.push(text.slice(p, p + recordLength));
      }
      notices.push({
        level: 'info',
        message: '改行なしの固定長ファイルとして、' + recordLength + ' 桁ごとに分割しました。'
      });
    } else {
      lines = text.split(/\r\n|\r|\n/);
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      recordLength = modeLength(lines) || 120;
    }

    // 種別コードを判定
    var headerLine = null;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].charAt(0) === '1') { headerLine = lines[i]; break; }
    }
    var typeCode = headerLine ? headerLine.slice(1, 3).trim() : '';
    if (!headerLine) {
      notices.push({
        level: 'warn',
        message: 'ヘッダーレコード（データ区分 1）が見つかりませんでした。種別コードを自動判定できません。'
      });
    }

    var format = opts.formatCode
      ? Formats.getFormat(opts.formatCode, recordLength)
      : Formats.getFormat(typeCode, recordLength);
    if (format.generic && headerLine) {
      notices.push({
        level: 'warn',
        message: '種別コード「' + (typeCode || '不明') + '」のレイアウト定義がありません。原文表示のみ行います。'
      });
    }

    // 同一種別コードでデータ・レコードのレイアウトが分かれるフォーマットの判定
    if (format.variants) {
      var headerDef = format.records.header;
      var headerRecord = headerLine ? makeRecord(headerLine, 'header') : null;
      var context = {
        headerValue: function (key) {
          var field = headerDef.byKey[key];
          if (!field || !headerRecord) return '';
          return readField(headerRecord, field);
        },
        dataSamples: lines.filter(function (line) {
          return line.charAt(0) === '2';
        }).slice(0, 20)
      };
      var variantKey = opts.variantKey ||
        (format.selectVariant ? format.selectVariant(context) : format.variants[0].key);
      format = Formats.withVariant(format, variantKey);
      notices.push({
        level: 'info',
        message: format.name + 'のデータ・レコードを「' + format.variantLabel + '」として読み込みました。' +
          (opts.variantKey ? '' : '（自動判定）')
      });
    }

    // 規定のレコード長と食い違う場合も、ファイルの実際の長さを優先する。
    // 規定側に合わせて切り詰めると、読み込んだだけでデータが失われてしまう。
    if (!format.generic && format.recordLength !== recordLength) {
      notices.push({
        level: 'warn',
        message: format.name + 'のレコード長は通常 ' + format.recordLength + ' 桁ですが、' +
          'このファイルは ' + recordLength + ' 桁です。ファイルの長さのまま読み込みました。'
      });
    }

    // 読み込んだ内容には手を加えない。桁数の過不足は検証で指摘する。
    var records = lines.map(function (line) {
      return makeRecord(line, KIND_BY_KUBUN[line.charAt(0)] || 'unknown');
    });

    return {
      fileName: opts.fileName || '',
      encoding: encoding,
      encodingDetection: detection,
      lineEnding: lineEnding === 'NONE' ? 'NONE' : lineEnding,
      recordLength: recordLength,
      format: format,
      detectedTypeCode: typeCode,
      formatOverridden: !!opts.formatCode && opts.formatCode !== typeCode,
      records: records,
      notices: notices,
      variantKey: format.variantKey || null,
      hasBom: hasBom,
      trailingNewline: trailingNewline,
      byteLength: bytes.length
    };
  }

  /** 行長の最頻値を求める。 */
  function modeLength(lines) {
    var counts = {};
    var best = 0;
    var bestCount = 0;
    lines.forEach(function (line) {
      var len = line.length;
      counts[len] = (counts[len] || 0) + 1;
      if (counts[len] > bestCount) { bestCount = counts[len]; best = len; }
    });
    return best;
  }

  /** 空の文書を新規作成する。 */
  function createEmpty(formatCode) {
    var format = Formats.getFormat(formatCode);
    var doc = {
      fileName: '',
      encoding: 'shift_jis',
      encodingDetection: null,
      lineEnding: 'CRLF',
      recordLength: format.recordLength,
      format: format,
      detectedTypeCode: format.code,
      formatOverridden: false,
      records: [
        blankRecord(format, 'header'),
        blankRecord(format, 'trailer'),
        blankRecord(format, 'end')
      ],
      notices: [],
      hasBom: false,
      trailingNewline: true,
      byteLength: 0
    };
    return doc;
  }

  /* ------------------------------------------------------------------ *
   * 書き出し
   * ------------------------------------------------------------------ */

  var LINE_ENDINGS = { CRLF: '\r\n', LF: '\n', CR: '\r', NONE: '' };

  /**
   * 文書を全銀固定長のバイト列へ書き出す。
   * @param {object} doc
   * @param {{encoding?:string, lineEnding?:string}} [options]
   */
  /**
   * 文書を全銀固定長のバイト列へ書き出す。
   *
   * レコードの内容には手を加えない（桁揃えも切り詰めもしない）。
   * 編集していない文書なら、読み込んだファイルとバイト単位で一致する。
   * 桁数が規定と違うレコードは、検証で指摘したうえで原文のまま出力する。
   */
  function serialize(doc, options) {
    var opts = options || {};
    var encoding = opts.encoding || doc.encoding || 'shift_jis';
    var lineEnding = opts.lineEnding || doc.lineEnding || 'CRLF';
    var eol = LINE_ENDINGS[lineEnding] != null ? LINE_ENDINGS[lineEnding] : '\r\n';

    var text = doc.records.map(function (rec) { return rec.text; }).join(eol);
    var trailing = opts.trailingNewline != null ? opts.trailingNewline : doc.trailingNewline;
    if (eol && doc.records.length && trailing !== false) text += eol;
    if (doc.hasBom) text = '\uFEFF' + text;

    return Charset.getCodec(encoding).encode(text);
  }

  /**
   * 桁数が規定に満たないレコードを、末尾の空白で整える。
   * 読み込み時には行わず、利用者が明示的に選んだときだけ実行する。
   */
  function normalizeRecordLengths(doc) {
    var len = doc.recordLength || doc.format.recordLength;
    var fixed = 0;
    doc.records.forEach(function (rec) {
      if (rec.text.length < len) {
        rec.text = padRight(rec.text, len, ' ');
        fixed++;
      }
    });
    return fixed;
  }

  /* ------------------------------------------------------------------ *
   * 集計
   * ------------------------------------------------------------------ */

  function fieldByRole(recordDef, role) {
    if (!recordDef) return null;
    for (var i = 0; i < recordDef.fields.length; i++) {
      if (recordDef.fields[i].role === role) return recordDef.fields[i];
    }
    return null;
  }

  function fieldsByRole(recordDef, role) {
    if (!recordDef) return [];
    return recordDef.fields.filter(function (field) { return field.role === role; });
  }

  /**
   * レコードの金額を求める。
   * 振込入金通知フォーマット B のように金額欄が複数に分かれる場合があり、
   * その場合は使われていない側がすべて「0」になるため、合計すればよい。
   */
  function amountOf(recordDef, record) {
    var total = 0;
    fieldsByRole(recordDef, 'amount').forEach(function (field) {
      total += toNumber(readField(record, field));
    });
    return total;
  }

  function recordsOfKind(doc, kind) {
    return doc.records.filter(function (r) { return r.kind === kind; });
  }

  /**
   * ヘッダー → データ… → トレーラ のまとまり（グループ）に分ける。
   *
   * 全銀協の規定では 1 ファイルに複数のヘッダー・レコードを含めてよい
   * （残高通知や入出金取引明細では口座ごとにグループが並ぶ）。
   * 合計件数・合計金額はグループ単位で突き合わせる必要がある。
   */
  /**
   * グループのヘッダーから、そのグループのデータ・レコード定義を決める。
   *
   * 入出金取引明細のように、口座の預金種目でデータ・レコードのレイアウトが
   * 変わるフォーマットでは、口座ごと（ヘッダーごと）に判定する必要がある。
   */
  function resolveGroupData(doc, group) {
    var format = doc.format;
    if (!format.variants || !format.selectVariant) {
      return { key: format.variantKey || null, def: format.records.data };
    }
    if (!group.header) {
      return { key: doc.variantKey || format.variantKey, def: format.records.data };
    }
    var headerDef = format.records.header;
    var key = format.selectVariant({
      headerValue: function (fieldKey) {
        var field = headerDef.byKey[fieldKey];
        return field ? readField(group.header, field) : '';
      },
      dataSamples: group.data.map(function (rec) { return rec.text; }).slice(0, 20)
    });
    for (var i = 0; i < format.variants.length; i++) {
      if (format.variants[i].key === key) {
        return { key: key, def: format.variants[i].data, label: format.variants[i].label };
      }
    }
    return { key: format.variantKey || null, def: format.records.data };
  }

  function groups(doc) {
    var result = [];
    var current = null;
    var open = function (index) {
      current = { header: null, headerIndex: -1, data: [], trailer: null, trailerIndex: -1, index: result.length };
      result.push(current);
      return current;
    };
    doc.records.forEach(function (rec, index) {
      if (rec.kind === 'header') {
        current = open(index);
        current.header = rec;
        current.headerIndex = index;
      } else if (rec.kind === 'data') {
        if (!current) current = open(index);
        current.data.push(rec);
      } else if (rec.kind === 'trailer') {
        if (!current) current = open(index);
        current.trailer = rec;
        current.trailerIndex = index;
        current = null; // トレーラでグループを閉じる
      }
    });
    result.forEach(function (group) {
      var resolved = resolveGroupData(doc, group);
      group.variantKey = resolved.key;
      group.variantLabel = resolved.label || null;
      group.dataDef = resolved.def;
    });
    return result;
  }

  /** レコード ID から、そのレコードに使うデータ・レコード定義を引ける表を作る。 */
  function dataDefMap(doc) {
    var map = Object.create(null);
    groups(doc).forEach(function (group) {
      group.data.forEach(function (rec) { map[rec.id] = group.dataDef; });
    });
    return map;
  }

  /** グループごとにレイアウトが分かれているか。 */
  function hasMixedVariants(doc) {
    var list = groups(doc);
    if (list.length < 2) return false;
    var first = list[0].variantKey;
    return list.some(function (g) { return g.variantKey !== first; });
  }

  /**
   * ヘッダーのコード区分が EBCDIC（1）になっているか。
   *
   * 本ツールの文字コード処理は JIS（Shift_JIS の 1 バイト領域）と UTF-8 だけで、
   * EBCDIC の変換は持っていない。EBCDIC と宣言されたファイルを JIS として
   * 読み書きすると、画面上は文字化けし、書き出したファイルは壊れる。
   */
  function usesEbcdic(doc) {
    var field = doc.format.records.header.byKey.codeKubun;
    if (!field) return false;
    return recordsOfKind(doc, 'header').some(function (rec) {
      return readField(rec, field).trim() === '1';
    });
  }

  /** グループを人が読める見出しにする（口座単位の切り替え用）。 */
  function groupLabel(doc, group) {
    if (!group.header) return 'グループ ' + (group.index + 1);
    var def = doc.format.records.header;
    var parts = [];
    ['originBranchCode', 'originBranchName'].forEach(function (role) {
      var field = fieldByRole(def, role);
      if (field) {
        var value = readField(group.header, field);
        if (value) parts.push(value);
      }
    });
    var depositField = fieldByRole(def, 'depositType');
    if (depositField) {
      var label = codeLabel(depositField, readField(group.header, depositField));
      if (label) parts.push(label);
    }
    var accountField = fieldByRole(def, 'accountNumber');
    if (accountField) {
      var account = readField(group.header, accountField);
      if (account) parts.push(account);
    }
    return parts.length ? parts.join(' ') : 'グループ ' + (group.index + 1);
  }

  /** データレコードの件数と金額合計を集計する（ファイル全体）。 */
  function summarize(doc) {
    var dataDef = doc.format.records.data;
    var amountFields = fieldsByRole(dataDef, 'amount');
    var defs = dataDefMap(doc);
    var rows = recordsOfKind(doc, 'data');
    var total = 0;
    rows.forEach(function (rec) { total += amountOf(defs[rec.id] || dataDef, rec); });
    return {
      count: rows.length, amount: total,
      amountField: amountFields[0] || null, amountFields: amountFields
    };
  }

  /**
   * トレーラで突き合わせる集計項目の一覧。
   * フォーマットが aggregates を持たない場合は totalCount / totalAmount から導く。
   */
  function aggregateSpecs(format) {
    if (format.aggregates) return format.aggregates;
    var trailerDef = format.records.trailer;
    var countField = fieldByRole(trailerDef, 'totalCount');
    var amountField = fieldByRole(trailerDef, 'totalAmount');
    if (!countField && !amountField) return [];
    return [{
      label: '合計',
      countKey: countField ? countField.key : null,
      amountKey: amountField ? amountField.key : null
    }];
  }

  /** 与えられたデータレコード群を、集計仕様にしたがって集計する。 */
  function computeAggregates(doc, dataRecords, dataDefOverride) {
    var dataDef = dataDefOverride || doc.format.records.data;
    var hasAmountField = fieldsByRole(dataDef, 'amount').length > 0;
    return aggregateSpecs(doc.format).map(function (spec) {
      var rows = dataRecords;
      if (spec.where) {
        var whereField = dataDef.byKey[spec.where.key];
        rows = whereField
          ? rows.filter(function (rec) { return readField(rec, whereField).trim() === spec.where.equals; })
          : [];
      }
      var amount = 0;
      var hasAmount = !!(spec.amountKey && hasAmountField);
      if (hasAmount) {
        rows.forEach(function (rec) { amount += amountOf(dataDef, rec); });
      }
      return { spec: spec, count: rows.length, amount: amount, hasAmount: hasAmount };
    });
  }

  /** トレーラの合計欄を、同じグループのデータレコードから再計算する。 */
  function recalcTrailer(doc) {
    var trailerDef = doc.format.records.trailer;
    var updated = 0;
    var count = 0;
    var amount = 0;
    groups(doc).forEach(function (group) {
      if (!group.trailer) return;
      computeAggregates(doc, group.data, group.dataDef).forEach(function (agg) {
        var countField = agg.spec.countKey ? trailerDef.byKey[agg.spec.countKey] : null;
        var amountField = agg.spec.amountKey ? trailerDef.byKey[agg.spec.amountKey] : null;
        if (countField) setField(group.trailer, countField, String(agg.count));
        if (amountField && agg.hasAmount) setField(group.trailer, amountField, String(agg.amount));
      });
      updated++;
      count += group.data.length;
    });
    // エンド・レコードの集計欄（口座数・レコード総件数）
    var endDef = doc.format.records.end;
    var accountField = fieldByRole(endDef, 'accountTotal');
    var recordTotalField = fieldByRole(endDef, 'recordTotal');
    var endRecords = recordsOfKind(doc, 'end');
    var headerGroups = groups(doc).filter(function (g) { return g.header; }).length;
    endRecords.forEach(function (rec) {
      if (accountField) setField(rec, accountField, String(headerGroups));
      if (recordTotalField) {
        // エンド・レコード自身を数に含めるかは規定書に明記がないため、
        // 元のファイルが採っていた数え方をそのまま残す
        var current = toNumber(readField(rec, recordTotalField));
        var withoutEnd = doc.records.length - endRecords.length;
        setField(rec, recordTotalField,
          String(current === withoutEnd ? withoutEnd : doc.records.length));
      }
    });

    var sum = summarize(doc);
    amount = sum.amount;
    return { updated: updated, count: count, amount: amount, endRecords: endRecords.length };
  }

  /* ------------------------------------------------------------------ *
   * 検証
   * ------------------------------------------------------------------ */

  // 月ごとの最大日数。2 月は閏年を区別できないため 29 日まで許容する
  // （YYMMDD の YY は和暦のため、西暦の年を確定できない）。
  var MAX_DAY_OF_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  /** 月日として妥当か。 */
  function validMonthDay(mm, dd) {
    var m = parseInt(mm, 10);
    var d = parseInt(dd, 10);
    if (!(m >= 1 && m <= 12)) return false;
    return d >= 1 && d <= MAX_DAY_OF_MONTH[m - 1];
  }

  function issue(level, message, extra) {
    var it = { level: level, message: message, recordIndex: null, fieldKey: null, hint: '' };
    if (extra) for (var k in extra) it[k] = extra[k];
    return it;
  }

  /**
   * 文書全体を検証し、問題の一覧を返す。
   * level: 'error' = 銀行で受け付けられない可能性が高い / 'warn' = 要確認 / 'info' = 参考
   */
  // 巨大なファイルでも応答性を保つため、収集する問題の件数に上限を設ける
  var MAX_ISSUES = 5000;

  function validate(doc) {
    var issues = [];
    var format = doc.format;
    var len = doc.recordLength || format.recordLength;
    var truncated = false;

    if (!doc.records.length) {
      issues.push(issue('error', 'レコードが 1 件もありません。'));
      return issues;
    }

    var dataDefs = dataDefMap(doc);

    // --- レコード単位のチェック -------------------------------------
    doc.records.forEach(function (rec, index) {
      if (issues.length >= MAX_ISSUES) { truncated = true; return; }
      if (rec.kind === 'unknown') {
        issues.push(issue('error', 'データ区分が不正です（先頭 1 桁が 1 / 2 / 8 / 9 のいずれでもありません）。',
          { recordIndex: index, hint: '先頭 1 桁を正しいデータ区分に修正してください。' }));
        return;
      }
      if (rec.text.length < len) {
        issues.push(issue('warn', 'レコード長が ' + rec.text.length + ' 桁です（規定は ' + len + ' 桁）。',
          {
            recordIndex: index,
            hint: '末尾の空白が削られたファイルでよく見られます。「レコード長をそろえる」で補えます。'
          }));
      } else if (rec.text.length > len) {
        issues.push(issue('error', 'レコード長が ' + rec.text.length + ' 桁です（規定は ' + len + ' 桁）。',
          { recordIndex: index, hint: '規定の桁数を超えた部分は、生データタブで確認できます。' }));
      }

      var tolerated = Charset.findToleratedChars(rec.text);
      if (tolerated.length) {
        issues.push(issue('warn', '全銀協の使用文字一覧に無い文字が含まれています: ' + tolerated.join(' '),
          {
            recordIndex: index,
            hint: '小文字カナや「｡ ､ ･」は使用文字一覧に掲げられていません。金融機関によっては受け付けられない場合があります。'
          }));
      }

      var invalid = Charset.findInvalidChars(rec.text);
      if (invalid.length) {
        var samples = invalid.slice(0, 5).map(function (v) { return v.display; }).join(' ');
        issues.push(issue('error', '全銀で使用できない文字が含まれています: ' + samples +
          (invalid.length > 5 ? ' ほか' : ''),
        {
          recordIndex: index,
          hint: '半角カナ（大文字）・英大文字・数字・スペースと、使用文字一覧に掲げられた記号のみ使用できます。'
        }));
      }

      var def = rec.kind === 'data' ? (dataDefs[rec.id] || format.records.data) : format.records[rec.kind];
      if (!def) return;
      def.fields.forEach(function (field) {
        var raw = rawField(rec, field);
        var value = readField(rec, field);

        if (field.fixed != null && raw.trim() !== field.fixed) {
          issues.push(issue('error', def.label + 'の「' + field.label + '」は「' + field.fixed +
            '」である必要があります（現在: 「' + raw.trim() + '」）。',
          { recordIndex: index, fieldKey: field.key }));
        }
        if (field.type === 'N' && !field.dummy) {
          if (/[^\d\s]/.test(raw)) {
            issues.push(issue('error', def.label + 'の「' + field.label + '」は数字項目ですが、数字以外が含まれています。',
              { recordIndex: index, fieldKey: field.key, hint: '現在の値: 「' + raw + '」' }));
          } else if (/\d/.test(raw) && /\s/.test(raw)) {
            // 数字項目は右詰めで残りを「0」で埋める規定のため、
            // 数字と空白が混ざった状態は桁の取り違えを招く
            issues.push(issue('error', def.label + 'の「' + field.label + '」に数字と空白が混在しています。',
              {
                recordIndex: index, fieldKey: field.key,
                hint: '数字項目は右詰めで、残りを「0」で埋めます。現在の値: 「' + raw + '」'
              }));
          }
        }
        // 規定書が埋め文字を定めているダミー領域
        if (field.fill && raw !== new Array(field.len + 1).join(field.fill)) {
          issues.push(issue('warn', def.label + 'の「' + field.label + '」（' + field.pos + '-' + field.end +
            ' 桁）は、規定では' + (field.fill === ' ' ? 'すべて空白' : 'すべて「0」') + 'です。',
          {
            recordIndex: index, fieldKey: field.key,
            hint: '金融機関が独自に使用している場合もあります。現在の値: 「' + raw + '」'
          }));
        }
        if (field.required && value === '') {
          issues.push(issue('error', def.label + 'の必須項目「' + field.label + '」が未入力です。',
            { recordIndex: index, fieldKey: field.key }));
        }
        if (field.codes && value !== '' && !field.codes[value.trim()]) {
          issues.push(issue('warn', def.label + 'の「' + field.label + '」に未定義のコード「' + value +
            '」が設定されています。',
          {
            recordIndex: index, fieldKey: field.key,
            hint: '有効な値: ' + Object.keys(field.codes).map(function (k) {
              return k + '=' + field.codes[k];
            }).join(' / ')
          }));
        }
        if (field.format === 'mmdd' && value !== '') {
          var mmdd = padLeft(value, 4, '0');
          if (!validMonthDay(mmdd.slice(0, 2), mmdd.slice(2, 4))) {
            issues.push(issue('error', def.label + 'の「' + field.label + '」が日付として不正です（' + mmdd + '）。',
              { recordIndex: index, fieldKey: field.key, hint: 'MMDD 形式の 4 桁で入力してください。' }));
          }
        }
        if (field.format === 'yymmdd' && value !== '') {
          var ymd = padLeft(value, 6, '0');
          if (!validMonthDay(ymd.slice(2, 4), ymd.slice(4, 6))) {
            issues.push(issue('error', def.label + 'の「' + field.label + '」が日付として不正です（' + ymd + '）。',
              { recordIndex: index, fieldKey: field.key, hint: 'YYMMDD 形式の 6 桁（年は和暦）で入力してください。' }));
          }
        }
        if (field.format === 'hhmm' && value !== '') {
          var hhmm = padLeft(value, 4, '0');
          var hh = parseInt(hhmm.slice(0, 2), 10);
          var mi = parseInt(hhmm.slice(2, 4), 10);
          if (!(hh >= 0 && hh <= 23 && mi >= 0 && mi <= 59)) {
            issues.push(issue('error', def.label + 'の「' + field.label + '」が時刻として不正です（' + hhmm + '）。',
              { recordIndex: index, fieldKey: field.key, hint: 'HHMM 形式の 4 桁で入力してください。' }));
          }
        }
        // 銀行へ提出するデータで金額が 0 円なのは、記入もれの可能性が高い
        if (format.direction === 'submit' && field.role === 'amount' && toNumber(value) === 0) {
          issues.push(issue('warn', def.label + 'の「' + field.label + '」が 0 円です。',
            { recordIndex: index, fieldKey: field.key }));
        }
        // 付録 1「使用文字一覧」の注記による、項目種別ごとの制限
        if (field.charClass && value !== '') {
          var violation = Charset.checkFieldCharset(value, field.charClass);
          if (violation) {
            issues.push(issue('warn', def.label + 'の「' + field.label + '」に、' +
              violation.rule.label + 'では使えない文字があります: ' + violation.chars.join(' '),
            { recordIndex: index, fieldKey: field.key, hint: violation.rule.note }));
          }
        }
      });
    });

    // --- レコード構成のチェック -------------------------------------
    var kinds = doc.records.map(function (r) { return r.kind; });
    var headerCount = kinds.filter(function (k) { return k === 'header'; }).length;
    var trailerCount = kinds.filter(function (k) { return k === 'trailer'; }).length;
    var endCount = kinds.filter(function (k) { return k === 'end'; }).length;
    var dataCount = kinds.filter(function (k) { return k === 'data'; }).length;

    if (headerCount === 0) issues.push(issue('error', 'ヘッダーレコード（データ区分 1）がありません。'));
    if (trailerCount === 0) issues.push(issue('error', 'トレーラ・レコード（データ区分 8）がありません。'));
    if (endCount === 0) issues.push(issue('error', 'エンドレコード（データ区分 9）がありません。'));
    if (dataCount === 0) issues.push(issue('warn', 'データレコード（データ区分 2）が 1 件もありません。'));
    if (kinds[0] !== 'header') {
      issues.push(issue('error', '先頭がヘッダーレコードではありません。', { recordIndex: 0 }));
    }
    if (kinds[kinds.length - 1] !== 'end') {
      issues.push(issue('error', '末尾がエンドレコードではありません。', { recordIndex: kinds.length - 1 }));
    }
    // ヘッダー → データ… → トレーラ を 1 グループとし、その繰り返し＋エンドを許す。
    // 全銀協の規定では 1 ファイルに複数のヘッダー・レコードを含めてよい。
    var state = 'start';
    kinds.forEach(function (kind, index) {
      if (kind === 'unknown') return;
      var ok = false;
      if (kind === 'header') ok = (state === 'start' || state === 'closed');
      else if (kind === 'data') ok = (state === 'header' || state === 'data');
      else if (kind === 'trailer') ok = (state === 'header' || state === 'data');
      else if (kind === 'end') ok = (state === 'closed');

      if (!ok) {
        issues.push(issue('error', 'レコードの並び順が不正です（' + format.records[kind].label +
          'をここに置くことはできません）。',
        {
          recordIndex: index,
          hint: 'ヘッダー(1) → データ(2)… → トレーラ(8) を 1 組とし、最後にエンド(9) を置きます。'
        }));
      }
      if (kind === 'header') state = 'header';
      else if (kind === 'data') state = 'data';
      else if (kind === 'trailer') state = 'closed';
      else if (kind === 'end') state = 'end';
    });

    var groupList = groups(doc);

    // データ・レコードのレイアウトがグループごとに変わる場合の案内
    if (format.variants && groupList.length > 1) {
      var firstKey = groupList[0].variantKey;
      var mixed = groupList.filter(function (g) { return g.variantKey !== firstKey; });
      if (mixed.length) {
        issues.push(issue('info', 'このファイルには、データ・レコードのレイアウトが異なる口座が' +
          '含まれています（' + groupList.length + ' 組中 ' + mixed.length + ' 組）。',
        {
          hint: '口座ごとに正しいレイアウトで解釈しています。' +
            '「データ明細」タブでは口座を選んで表示してください。'
        }));
      }
    }

    groupList.forEach(function (group) {
      if (!group.header) {
        issues.push(issue('error', (group.index + 1) + ' 組目にヘッダー・レコードがありません。',
          { recordIndex: group.data.length ? doc.records.indexOf(group.data[0]) : null }));
      }
      if (!group.trailer) {
        issues.push(issue('error', (group.index + 1) + ' 組目にトレーラ・レコードがありません。',
          { recordIndex: group.headerIndex >= 0 ? group.headerIndex : null }));
      }
    });

    // --- 種別コードの整合 -------------------------------------------
    if (!format.generic) {
      var headerDef = format.records.header;
      var typeField = fieldByRole(headerDef, 'typeCode');
      recordsOfKind(doc, 'header').forEach(function (rec) {
        var code = readField(rec, typeField).trim();
        if (code !== format.code) {
          issues.push(issue('error', 'ヘッダーの種別コード「' + code + '」が、選択中のフォーマット（' +
            format.name + ' / ' + format.code + '）と一致しません。', { fieldKey: typeField.key }));
        }
      });
    }

    // --- 合計件数・合計金額の突合（グループ単位）--------------------
    var trailerDef = format.records.trailer;
    groupList.forEach(function (group) {
      if (!group.trailer) return;
      var recIndex = group.trailerIndex;
      computeAggregates(doc, group.data, group.dataDef).forEach(function (agg) {
        var countField = agg.spec.countKey ? trailerDef.byKey[agg.spec.countKey] : null;
        var amountField = agg.spec.amountKey ? trailerDef.byKey[agg.spec.amountKey] : null;
        var prefix = groupList.length > 1 ? (group.index + 1) + ' 組目の' : '';

        if (countField) {
          var declared = toNumber(readField(group.trailer, countField));
          if (declared !== agg.count) {
            issues.push(issue('error', prefix + 'トレーラの「' + countField.label + '」（' +
              formatAmount(declared) + ' 件）が、実際の ' + agg.spec.label + '件数（' +
              formatAmount(agg.count) + ' 件）と一致しません。',
            { recordIndex: recIndex, fieldKey: countField.key, hint: '「合計を再計算」で自動修正できます。' }));
          }
        }
        if (amountField && agg.hasAmount) {
          var declaredAmount = toNumber(readField(group.trailer, amountField));
          if (declaredAmount !== agg.amount) {
            issues.push(issue('error', prefix + 'トレーラの「' + amountField.label + '」（' +
              formatAmount(declaredAmount) + ' 円）が、実際の ' + agg.spec.label + '合計（' +
              formatAmount(agg.amount) + ' 円）と一致しません。',
            { recordIndex: recIndex, fieldKey: amountField.key, hint: '「合計を再計算」で自動修正できます。' }));
          }
        }
      });

      // 預金口座振替: 振替済 + 振替不能 = 合計
      var doneCount = trailerDef.byKey.doneCount;
      var failCount = trailerDef.byKey.failCount;
      var totalCountField = trailerDef.byKey.totalCount;
      if (doneCount && failCount && totalCountField) {
        var dc = toNumber(readField(group.trailer, doneCount));
        var fc = toNumber(readField(group.trailer, failCount));
        var tc = toNumber(readField(group.trailer, totalCountField));
        if ((dc || fc) && dc + fc !== tc) {
          issues.push(issue('warn', '振替済件数（' + dc + '）と振替不能件数（' + fc +
            '）の合計が、合計件数（' + tc + '）と一致しません。',
          { recordIndex: recIndex, fieldKey: doneCount.key }));
        }
      }
    });

    if (truncated) {
      issues.push(issue('info', 'レコード単位のチェックは ' + MAX_ISSUES +
        ' 件で打ち切りました。まず表示されている問題を修正してから、再度読み込んでください。'));
    }

    // --- コード区分（EBCDIC）---------------------------------------
    if (usesEbcdic(doc)) {
      issues.push(issue('error', 'ヘッダーのコード区分が「1：EBCDIC」です。本ツールは EBCDIC に対応していません。',
        {
          recordIndex: groupList.length ? groupList[0].headerIndex : null,
          fieldKey: 'codeKubun',
          hint: '画面の表示は文字化けし、書き出したファイルは正しい EBCDIC になりません。' +
            '書き出しは行えません。JIS のファイルを入手いただくか、コード区分をご確認ください。'
        }));
    }

    // --- エンド・レコードの集計値 -----------------------------------
    var endDef = format.records.end;
    var endRecords = recordsOfKind(doc, 'end');
    var accountField = fieldByRole(endDef, 'accountTotal');
    var recordTotalField = fieldByRole(endDef, 'recordTotal');
    endRecords.forEach(function (rec) {
      var recIndex = doc.records.indexOf(rec);
      if (accountField) {
        var declaredAccounts = toNumber(readField(rec, accountField));
        var headerGroups = groupList.filter(function (g) { return g.header; }).length;
        if (declaredAccounts !== headerGroups) {
          issues.push(issue('warn', 'エンド・レコードの「' + accountField.label + '」（' +
            formatAmount(declaredAccounts) + '）が、ヘッダー・レコードの数（' +
            formatAmount(headerGroups) + '）と一致しません。',
          { recordIndex: recIndex, fieldKey: accountField.key, hint: '「合計を再計算」で自動修正できます。' }));
        }
      }
      if (recordTotalField) {
        var declaredRecords = toNumber(readField(rec, recordTotalField));
        // 規定書はエンド・レコード自身を数に含めるか明記していないため、
        // どちらの数え方とも合わない場合にだけ指摘する
        var withEnd = doc.records.length;
        var withoutEnd = doc.records.length - endRecords.length;
        if (declaredRecords !== withEnd && declaredRecords !== withoutEnd) {
          issues.push(issue('warn', 'エンド・レコードの「' + recordTotalField.label + '」（' +
            formatAmount(declaredRecords) + '）が、実際のレコード数（' +
            formatAmount(withoutEnd) + ' または ' + formatAmount(withEnd) + '）と一致しません。',
          {
            recordIndex: recIndex, fieldKey: recordTotalField.key,
            hint: 'エンド・レコード自身を数に含めるかは規定書に明記がないため、' +
              'どちらの数え方でも合わない場合にお知らせしています。'
          }));
        }
      }
    });

    // --- 預金口座振替の処理結果明細 --------------------------------
    validateDebitResult(doc, groupList, issues);

    // --- 重複明細（振込依頼系のみ）---------------------------------
    validateDuplicates(doc, dataDefs, issues);

    // --- 文字コード -------------------------------------------------
    if (doc.encodingDetection && doc.encodingDetection.confidence === 'guess') {
      issues.push(issue('warn', '文字コードを自動判定できませんでした。' + doc.encodingDetection.reason,
        { hint: '画面右上の文字コード設定を切り替えて再読み込みしてください。' }));
    }

    return issues;
  }

  /**
   * 預金口座振替の処理結果明細を検証する。
   *
   * 依頼明細では振替済・振替不能の欄はすべて「0」と規定されているため、
   * 結果が入っているファイルだけを対象にする。
   */
  function validateDebitResult(doc, groupList, issues) {
    var format = doc.format;
    var trailerDef = format.records.trailer;
    var dataDef = format.records.data;
    var resultField = fieldByRole(dataDef, 'resultCode');
    var keys = ['doneCount', 'doneAmount', 'failCount', 'failAmount'];
    if (!resultField || keys.some(function (k) { return !trailerDef.byKey[k]; })) return;

    groupList.forEach(function (group) {
      if (!group.trailer) return;
      var recIndex = group.trailerIndex;
      var declared = {};
      keys.forEach(function (k) { declared[k] = toNumber(readField(group.trailer, trailerDef.byKey[k])); });

      var actual = { doneCount: 0, doneAmount: 0, failCount: 0, failAmount: 0 };
      var anyFailure = false;
      group.data.forEach(function (rec) {
        var code = readField(rec, resultField).trim();
        var amount = amountOf(group.dataDef || dataDef, rec);
        if (code === '' || code === '0') { actual.doneCount++; actual.doneAmount += amount; }
        else { actual.failCount++; actual.failAmount += amount; anyFailure = true; }
      });

      var hasResultTotals = keys.some(function (k) { return declared[k] !== 0; });
      if (!hasResultTotals && !anyFailure) return; // 依頼明細とみなす

      keys.forEach(function (k) {
        var field = trailerDef.byKey[k];
        if (declared[k] === actual[k]) return;
        var unit = k.indexOf('Amount') >= 0 ? ' 円' : ' 件';
        issues.push(issue('warn', 'トレーラの「' + field.label + '」（' + formatAmount(declared[k]) + unit +
          '）が、振替結果コードから求めた値（' + formatAmount(actual[k]) + unit + '）と一致しません。',
        {
          recordIndex: recIndex, fieldKey: field.key,
          hint: '振替結果コードが「0：振替済」のものを振替済、それ以外を振替不能として集計しています。'
        }));
      });

      var totalAmountField = trailerDef.byKey.totalAmount;
      if (totalAmountField) {
        var totalDeclared = toNumber(readField(group.trailer, totalAmountField));
        var sum = declared.doneAmount + declared.failAmount;
        if (sum !== totalDeclared) {
          issues.push(issue('warn', '振替済金額（' + formatAmount(declared.doneAmount) +
            ' 円）と振替不能金額（' + formatAmount(declared.failAmount) +
            ' 円）の合計が、合計金額（' + formatAmount(totalDeclared) + ' 円）と一致しません。',
          { recordIndex: recIndex, fieldKey: totalAmountField.key }));
        }
      }
    });
  }

  /**
   * 同じ振込先へ同じ金額の明細が複数ないか調べる。
   *
   * 重複が誤りとは限らない（同一取引先への複数支払は普通にある）ため、
   * エラーではなく確認を促す警告として報告する。
   * 入金明細や残高通知に同じ考え方を当てると正常な取引まで大量に指摘するため、
   * 銀行へ提出する振込依頼系のフォーマットだけを対象にする。
   */
  function validateDuplicates(doc, dataDefs, issues) {
    var format = doc.format;
    if (format.direction !== 'submit' || !format.duplicateKeys) return;
    var dataDef = format.records.data;
    var keyFields = format.duplicateKeys.map(function (k) { return dataDef.byKey[k]; });
    if (keyFields.some(function (fd) { return !fd; })) return;

    var byAccount = Object.create(null);
    var no = 0;
    doc.records.forEach(function (rec, index) {
      if (rec.kind !== 'data') return;
      no++;
      var def = dataDefs[rec.id] || dataDef;
      var account = keyFields.map(function (fd) { return readField(rec, fd); }).join('\u0001');
      var amount = amountOf(def, rec);
      if (!byAccount[account]) byAccount[account] = [];
      byAccount[account].push({ no: no, index: index, amount: amount });
    });

    Object.keys(byAccount).forEach(function (account) {
      var rows = byAccount[account];
      if (rows.length < 2) return;

      var byAmount = Object.create(null);
      rows.forEach(function (row) {
        var key = String(row.amount);
        (byAmount[key] = byAmount[key] || []).push(row);
      });

      var exact = Object.keys(byAmount).filter(function (k) { return byAmount[k].length > 1; });
      if (exact.length) {
        exact.forEach(function (key) {
          var group = byAmount[key];
          issues.push(issue('warn', '同じ口座・同じ金額（' + formatAmount(group[0].amount) +
            ' 円）の明細が ' + group.length + ' 件あります（' +
            group.map(function (r) { return r.no + ' 行目'; }).join('、') + '）。',
          {
            recordIndex: group[0].index,
            hint: '二重振込でないか、意図した重複かをご確認ください。重複が誤りとは限りません。'
          }));
        });
      } else {
        issues.push(issue('info', '同じ口座あての明細が ' + rows.length + ' 件あります（' +
          rows.map(function (r) { return r.no + ' 行目'; }).join('、') + '）。金額は異なります。',
        { recordIndex: rows[0].index, hint: 'まとめて 1 件にできないかご確認ください。' }));
      }
    });
  }

  function countByLevel(issues) {
    var result = { error: 0, warn: 0, info: 0 };
    issues.forEach(function (it) { result[it.level] = (result[it.level] || 0) + 1; });
    return result;
  }

  /* ------------------------------------------------------------------ *
   * CSV
   * ------------------------------------------------------------------ */

  function csvEscape(value) {
    var text = value == null ? '' : String(value);
    if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  /**
   * Excel で開いたときに値が変わらない形にする。
   *
   * 銀行番号「0009」や口座番号「0012345」をそのまま書くと、Excel が数値と解釈して
   * 先頭の 0 を落としてしまう。文字列であることを示す ="..." の形で書くと防げる。
   * 金額と件数は集計できるよう、数値のまま出す。
   */
  function excelCell(field, value) {
    if (field.format === 'amount' || field.format === 'count') {
      return value === '' ? '' : String(toNumber(value));
    }
    if (value === '') return '';
    // カンマや引用符を含む値は ="..." の形にできないため、通常の CSV 引用に任せる
    if (/[",\r\n]/.test(value)) return csvEscape(value);
    return '="' + value + '"';
  }

  /**
   * データ・レコードを CSV 文字列に変換する。
   *
   * 口座ごとにレイアウトが異なるファイル（入出金取引明細の普通預金と定期預金など）
   * では、1 つの見出し行に収められないため、レイアウトごとに区切って出力する。
   *
   * @param {object} doc
   * @param {{includeDummy?:boolean, excel?:boolean}} [options]
   *   excel=true で、先頭の 0 が消えないよう文字列として書き出す
   */
  function toCsv(doc, options) {
    var opts = options || {};
    var defs = dataDefMap(doc);
    var fallback = doc.format.records.data;

    // レイアウトごとにデータ・レコードをまとめる
    var buckets = [];
    var no = 0;
    doc.records.forEach(function (rec) {
      if (rec.kind !== 'data') return;
      no++;
      var def = defs[rec.id] || fallback;
      var bucket = null;
      for (var i = 0; i < buckets.length; i++) {
        if (buckets[i].def === def) { bucket = buckets[i]; break; }
      }
      if (!bucket) {
        bucket = { def: def, rows: [] };
        buckets.push(bucket);
      }
      bucket.rows.push({ no: no, rec: rec });
    });
    if (!buckets.length) buckets.push({ def: fallback, rows: [] });

    var variantLabel = function (def) {
      var variants = doc.format.variants || [];
      for (var i = 0; i < variants.length; i++) {
        if (variants[i].data === def) return variants[i].label;
      }
      return null;
    };

    var lines = [];
    buckets.forEach(function (bucket, index) {
      if (buckets.length > 1) {
        if (index) lines.push('');
        var label = variantLabel(bucket.def);
        lines.push(csvEscape('■ ' + (label || 'レイアウト ' + (index + 1)) +
          '（' + bucket.rows.length + ' 件）'));
      }
      var fields = bucket.def.fields.filter(function (fd) {
        return opts.includeDummy ? true : !fd.hideInTable;
      });
      lines.push(['行番号'].concat(fields.map(function (fd) { return fd.label; }))
        .map(csvEscape).join(','));
      bucket.rows.forEach(function (row) {
        var cells = [String(row.no)];
        fields.forEach(function (fd) {
          var value = readField(row.rec, fd);
          cells.push(opts.excel ? excelCell(fd, value) : csvEscape(value));
        });
        lines.push(cells.join(','));
      });
    });
    return lines.join('\r\n') + '\r\n';
  }

  global.Zengin = {
    KIND_BY_KUBUN: KIND_BY_KUBUN,
    KUBUN_BY_KIND: KUBUN_BY_KIND,
    KIND_ORDER: KIND_ORDER,
    parse: parse,
    serialize: serialize,
    createEmpty: createEmpty,
    normalizeRecordLengths: normalizeRecordLengths,
    blankRecord: blankRecord,
    makeRecord: makeRecord,
    rawField: rawField,
    readField: readField,
    writeField: writeField,
    setField: setField,
    displayValue: displayValue,
    codeLabel: codeLabel,
    fieldByRole: fieldByRole,
    fieldsByRole: fieldsByRole,
    amountOf: amountOf,
    recordsOfKind: recordsOfKind,
    groups: groups,
    groupLabel: groupLabel,
    dataDefMap: dataDefMap,
    hasMixedVariants: hasMixedVariants,
    aggregateSpecs: aggregateSpecs,
    computeAggregates: computeAggregates,
    summarize: summarize,
    recalcTrailer: recalcTrailer,
    validate: validate,
    usesEbcdic: usesEbcdic,
    countByLevel: countByLevel,
    toCsv: toCsv,
    toNumber: toNumber,
    formatAmount: formatAmount,
    formatMmdd: formatMmdd,
    padLeft: padLeft,
    padRight: padRight,
    ensureLength: ensureLength
  };
})(typeof window !== 'undefined' ? window : globalThis);

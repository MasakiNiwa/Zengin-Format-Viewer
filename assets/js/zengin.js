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

    // BOM 除去
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
      notices.push({ level: 'info', message: 'UTF-8 BOM を検出し、読み飛ばしました。' });
    }

    var lineEnding = detectLineEnding(text);
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

    // 規定のレコード長と食い違う場合も、ファイルの実際の長さを優先する。
    // 規定側に合わせて切り詰めると、読み込んだだけでデータが失われてしまう。
    if (!format.generic && format.recordLength !== recordLength) {
      notices.push({
        level: 'warn',
        message: format.name + 'のレコード長は通常 ' + format.recordLength + ' 桁ですが、' +
          'このファイルは ' + recordLength + ' 桁です。ファイルの長さのまま読み込みました。'
      });
    }

    var shortLines = 0;
    var longLines = 0;
    var records = lines.map(function (line) {
      var kind = KIND_BY_KUBUN[line.charAt(0)] || 'unknown';
      if (line.length < recordLength) {
        shortLines++;
        line = padRight(line, recordLength, ' ');
      } else if (line.length > recordLength) {
        longLines++;
      }
      return makeRecord(line, kind);
    });
    if (shortLines) {
      notices.push({
        level: 'info',
        message: recordLength + ' 桁に満たないレコードが ' + shortLines +
          ' 件あったため、末尾を空白で補いました。'
      });
    }
    if (longLines) {
      notices.push({
        level: 'warn',
        message: recordLength + ' 桁を超えるレコードが ' + longLines +
          ' 件あります。内容はそのまま保持しています。'
      });
    }

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
  function serialize(doc, options) {
    var opts = options || {};
    var encoding = opts.encoding || doc.encoding || 'shift_jis';
    var lineEnding = opts.lineEnding || doc.lineEnding || 'CRLF';
    var eol = LINE_ENDINGS[lineEnding] != null ? LINE_ENDINGS[lineEnding] : '\r\n';
    var len = doc.recordLength || doc.format.recordLength;

    var text = doc.records.map(function (rec) {
      return padRight(rec.text, len, ' ').slice(0, len);
    }).join(eol);
    if (eol && doc.records.length) text += eol;

    return Charset.getCodec(encoding).encode(text);
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

  function recordsOfKind(doc, kind) {
    return doc.records.filter(function (r) { return r.kind === kind; });
  }

  /** データレコードの件数と金額合計を集計する。 */
  function summarize(doc) {
    var dataDef = doc.format.records.data;
    var amountField = fieldByRole(dataDef, 'amount');
    var rows = recordsOfKind(doc, 'data');
    var total = 0;
    if (amountField) {
      rows.forEach(function (rec) { total += toNumber(readField(rec, amountField)); });
    }
    return { count: rows.length, amount: total, amountField: amountField };
  }

  /** トレーラーレコードの合計件数・合計金額をデータから再計算する。 */
  function recalcTrailer(doc) {
    var sum = summarize(doc);
    var trailerDef = doc.format.records.trailer;
    var countField = fieldByRole(trailerDef, 'totalCount');
    var amountField = fieldByRole(trailerDef, 'totalAmount');
    var updated = 0;
    recordsOfKind(doc, 'trailer').forEach(function (rec) {
      if (countField) setField(rec, countField, String(sum.count));
      if (amountField) setField(rec, amountField, String(sum.amount));
      updated++;
    });
    return { updated: updated, count: sum.count, amount: sum.amount };
  }

  /* ------------------------------------------------------------------ *
   * 検証
   * ------------------------------------------------------------------ */

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

    // --- レコード単位のチェック -------------------------------------
    doc.records.forEach(function (rec, index) {
      if (issues.length >= MAX_ISSUES) { truncated = true; return; }
      if (rec.kind === 'unknown') {
        issues.push(issue('error', 'データ区分が不正です（先頭 1 桁が 1 / 2 / 8 / 9 のいずれでもありません）。',
          { recordIndex: index, hint: '先頭 1 桁を正しいデータ区分に修正してください。' }));
        return;
      }
      if (rec.text.length !== len) {
        issues.push(issue('error', 'レコード長が ' + rec.text.length + ' 桁です（正しくは ' + len + ' 桁）。',
          { recordIndex: index }));
      }

      var invalid = Charset.findInvalidChars(rec.text);
      if (invalid.length) {
        var samples = invalid.slice(0, 5).map(function (v) { return v.display; }).join(' ');
        issues.push(issue('error', '全銀で使用できない文字が含まれています: ' + samples +
          (invalid.length > 5 ? ' ほか' : ''),
        {
          recordIndex: index,
          hint: '半角カナ・英大文字・数字・記号（ ( ) - . , / ¥ ）のみ使用できます。'
        }));
      }

      var def = format.records[rec.kind];
      if (!def) return;
      def.fields.forEach(function (field) {
        var raw = rawField(rec, field);
        var value = readField(rec, field);

        if (field.fixed != null && raw.trim() !== field.fixed) {
          issues.push(issue('error', def.label + 'の「' + field.label + '」は「' + field.fixed +
            '」である必要があります（現在: 「' + raw.trim() + '」）。',
          { recordIndex: index, fieldKey: field.key }));
        }
        if (field.type === 'N' && !field.dummy && /[^\d\s]/.test(raw)) {
          issues.push(issue('error', def.label + 'の「' + field.label + '」は数字項目ですが、数字以外が含まれています。',
            { recordIndex: index, fieldKey: field.key, hint: '現在の値: 「' + raw + '」' }));
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
          var mm = parseInt(mmdd.slice(0, 2), 10);
          var dd = parseInt(mmdd.slice(2, 4), 10);
          if (!(mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)) {
            issues.push(issue('error', def.label + 'の「' + field.label + '」が日付として不正です（' + mmdd + '）。',
              { recordIndex: index, fieldKey: field.key, hint: 'MMDD 形式の 4 桁で入力してください。' }));
          }
        }
        if (field.format === 'amount' && field.role === 'amount' && toNumber(value) === 0) {
          issues.push(issue('warn', def.label + 'の「' + field.label + '」が 0 円です。',
            { recordIndex: index, fieldKey: field.key }));
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
    if (trailerCount === 0) issues.push(issue('error', 'トレーラーレコード（データ区分 8）がありません。'));
    if (endCount === 0) issues.push(issue('error', 'エンドレコード（データ区分 9）がありません。'));
    if (dataCount === 0) issues.push(issue('warn', 'データレコード（データ区分 2）が 1 件もありません。'));
    if (kinds[0] !== 'header') {
      issues.push(issue('error', '先頭がヘッダーレコードではありません。', { recordIndex: 0 }));
    }
    if (kinds[kinds.length - 1] !== 'end') {
      issues.push(issue('error', '末尾がエンドレコードではありません。', { recordIndex: kinds.length - 1 }));
    }
    // ヘッダー -> データ -> トレーラー -> エンド の順序
    var lastRank = -1;
    kinds.forEach(function (kind, index) {
      var rank = KIND_ORDER.indexOf(kind);
      if (rank < 0) return;
      if (rank < lastRank) {
        issues.push(issue('error', 'レコードの並び順が不正です（' + format.records[kind].label +
          'が想定より後ろにあります）。', { recordIndex: index }));
      }
      lastRank = Math.max(lastRank, rank);
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

    // --- 合計件数・合計金額の突合 -----------------------------------
    var sum = summarize(doc);
    var trailerDef = format.records.trailer;
    var countField = fieldByRole(trailerDef, 'totalCount');
    var amountField = fieldByRole(trailerDef, 'totalAmount');
    recordsOfKind(doc, 'trailer').forEach(function (rec) {
      var recIndex = doc.records.indexOf(rec);
      if (countField) {
        var declared = toNumber(readField(rec, countField));
        if (declared !== sum.count) {
          issues.push(issue('error', 'トレーラーの合計件数（' + formatAmount(declared) +
            ' 件）がデータレコード件数（' + formatAmount(sum.count) + ' 件）と一致しません。',
          { recordIndex: recIndex, fieldKey: countField.key, hint: '「合計を再計算」で自動修正できます。' }));
        }
      }
      if (amountField && sum.amountField) {
        var declaredAmount = toNumber(readField(rec, amountField));
        if (declaredAmount !== sum.amount) {
          issues.push(issue('error', 'トレーラーの合計金額（' + formatAmount(declaredAmount) +
            ' 円）がデータレコードの合計（' + formatAmount(sum.amount) + ' 円）と一致しません。',
          { recordIndex: recIndex, fieldKey: amountField.key, hint: '「合計を再計算」で自動修正できます。' }));
        }
      }
      // 預金口座振替の結果ファイル: 振替済 + 振替不能 = 合計
      var doneCount = trailerDef.byKey.doneCount;
      var failCount = trailerDef.byKey.failCount;
      if (doneCount && failCount) {
        var dc = toNumber(readField(rec, doneCount));
        var fc = toNumber(readField(rec, failCount));
        var tc = countField ? toNumber(readField(rec, countField)) : 0;
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

    // --- 文字コード -------------------------------------------------
    if (doc.encodingDetection && doc.encodingDetection.confidence === 'guess') {
      issues.push(issue('warn', '文字コードを自動判定できませんでした。' + doc.encodingDetection.reason,
        { hint: '画面右上の文字コード設定を切り替えて再読み込みしてください。' }));
    }

    return issues;
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

  /** データレコードを CSV 文字列に変換する。 */
  function toCsv(doc, options) {
    var opts = options || {};
    var def = doc.format.records.data;
    var fields = def.fields.filter(function (fd) {
      return opts.includeDummy ? true : !fd.dummy;
    });
    var lines = [];
    lines.push(['行番号'].concat(fields.map(function (fd) { return fd.label; })).map(csvEscape).join(','));
    var no = 0;
    doc.records.forEach(function (rec) {
      if (rec.kind !== 'data') return;
      no++;
      var cells = [String(no)];
      fields.forEach(function (fd) { cells.push(readField(rec, fd)); });
      lines.push(cells.map(csvEscape).join(','));
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
    blankRecord: blankRecord,
    makeRecord: makeRecord,
    rawField: rawField,
    readField: readField,
    writeField: writeField,
    setField: setField,
    displayValue: displayValue,
    codeLabel: codeLabel,
    fieldByRole: fieldByRole,
    recordsOfKind: recordsOfKind,
    summarize: summarize,
    recalcTrailer: recalcTrailer,
    validate: validate,
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

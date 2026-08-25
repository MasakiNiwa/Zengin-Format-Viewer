/*!
 * formats.js - 全銀協制定フォーマットのレコードレイアウト定義
 *
 * 各フォーマットは ヘッダー(1) / データ(2) / トレーラー(8) / エンド(9) の
 * 4 種類のレコードで構成され、1 レコードは 120 桁（バイト）固定です。
 * 桁位置は定義順に自動計算し、合計が 120 桁になることを検証します。
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 共通コード表
   * ------------------------------------------------------------------ */

  var CODE = {
    kubun: { '1': 'ヘッダー', '2': 'データ', '8': 'トレーラー', '9': 'エンド' },
    codeKubun: { '0': 'JIS', '1': 'EBCDIC' },
    deposit: { '1': '普通預金', '2': '当座預金', '4': '貯蓄預金', '9': 'その他' },
    newCode: { '0': 'その他', '1': '第1回振込', '2': '変更分' },
    newCodeDebit: { '0': 'その他', '1': '第1回引落', '2': '変更分' },
    transferKubun: { '7': 'テレ振込', '8': '文書振込' },
    ident: { 'Y': '給与', 'B': '賞与' },
    result: {
      '0': '振替済', '1': '資金不足', '2': '取引なし', '3': '預金者都合',
      '4': '預金口座振替依頼書なし', '8': '委託者都合', '9': 'その他'
    }
  };

  /* ------------------------------------------------------------------ *
   * 定義ヘルパー
   * ------------------------------------------------------------------ */

  /**
   * 項目を定義する。
   * @param {string} key   内部キー
   * @param {string} label 画面表示名
   * @param {number} len   桁数
   * @param {'N'|'C'} type N=数字（右詰 0 埋め） / C=文字（左詰 空白埋め）
   * @param {object} [opts] required, dummy, codes, role, format, hint, fixed
   */
  function f(key, label, len, type, opts) {
    var field = {
      key: key, label: label, len: len, type: type,
      required: false, dummy: false, codes: null, role: null,
      format: null, hint: '', fixed: null, hideInTable: false
    };
    if (opts) for (var k in opts) field[k] = opts[k];
    if (field.dummy) field.hideInTable = true;
    return field;
  }

  /** 項目配列から桁位置を計算し、レコード定義を組み立てる。 */
  function record(kubun, label, fields, opts) {
    var pos = 1;
    for (var i = 0; i < fields.length; i++) {
      fields[i].pos = pos;
      fields[i].end = pos + fields[i].len - 1;
      fields[i].index = i;
      pos += fields[i].len;
    }
    var def = {
      kubun: kubun, label: label, fields: fields, length: pos - 1,
      byKey: Object.create(null)
    };
    for (var j = 0; j < fields.length; j++) def.byKey[fields[j].key] = fields[j];
    if (opts) for (var o in opts) def[o] = opts[o];
    return def;
  }

  /** 全フォーマット共通のエンドレコード。 */
  function endRecord() {
    return record('9', 'エンドレコード', [
      f('kubun', 'データ区分', 1, 'N', { fixed: '9', role: 'kubun', codes: CODE.kubun, required: true }),
      f('dummy', 'ダミー', 119, 'C', { dummy: true })
    ]);
  }

  /** 総合振込・給与振込で共通のトレーラーレコード。 */
  function simpleTrailer() {
    return record('8', 'トレーラーレコード', [
      f('kubun', 'データ区分', 1, 'N', { fixed: '8', role: 'kubun', codes: CODE.kubun, required: true }),
      f('totalCount', '合計件数', 6, 'N', { role: 'totalCount', format: 'count', required: true }),
      f('totalAmount', '合計金額', 12, 'N', { role: 'totalAmount', format: 'amount', required: true }),
      f('dummy', 'ダミー', 101, 'C', { dummy: true })
    ]);
  }

  /* ------------------------------------------------------------------ *
   * 総合振込（種別コード 21）
   * ------------------------------------------------------------------ */

  var SOGO_FURIKOMI = {
    code: '21',
    name: '総合振込',
    shortName: '総振',
    accent: 'indigo',
    description: '取引先への支払を一括で依頼する、もっとも利用の多いフォーマットです。',
    recordLength: 120,
    records: {
      header: record('1', 'ヘッダーレコード', [
        f('kubun', 'データ区分', 1, 'N', { fixed: '1', role: 'kubun', codes: CODE.kubun, required: true }),
        f('typeCode', '種別コード', 2, 'N', { fixed: '21', role: 'typeCode', required: true }),
        f('codeKubun', 'コード区分', 1, 'N', { codes: CODE.codeKubun, required: true, hint: '0=JIS、1=EBCDIC' }),
        f('requesterCode', '委託者コード', 10, 'N', { role: 'requesterCode', required: true, hint: '銀行から指定される 10 桁のコード' }),
        f('requesterName', '委託者名', 40, 'C', { role: 'requesterName', required: true, hint: '半角カナ・英大文字' }),
        f('transferDate', '取組日', 4, 'N', { role: 'date', format: 'mmdd', required: true, hint: '月日 4 桁（MMDD）' }),
        f('bankCode', '仕向銀行番号', 4, 'N', { role: 'originBankCode', required: true }),
        f('bankName', '仕向銀行名', 15, 'C', { role: 'originBankName' }),
        f('branchCode', '仕向支店番号', 3, 'N', { role: 'originBranchCode', required: true }),
        f('branchName', '仕向支店名', 15, 'C', { role: 'originBranchName' }),
        f('depositType', '預金種目', 1, 'N', { codes: CODE.deposit, hint: '委託者の口座種別' }),
        f('accountNumber', '口座番号', 7, 'N', { hint: '委託者の口座番号' }),
        f('dummy', 'ダミー', 17, 'C', { dummy: true })
      ]),
      data: record('2', 'データレコード', [
        f('kubun', 'データ区分', 1, 'N', { fixed: '2', role: 'kubun', codes: CODE.kubun, required: true, hideInTable: true }),
        f('bankCode', '被仕向銀行番号', 4, 'N', { required: true }),
        f('bankName', '被仕向銀行名', 15, 'C', {}),
        f('branchCode', '被仕向支店番号', 3, 'N', { required: true }),
        f('branchName', '被仕向支店名', 15, 'C', {}),
        f('clearingCode', '手形交換所番号', 4, 'N', { hint: '通常は未使用（空白または 0）' }),
        f('depositType', '預金種目', 1, 'N', { codes: CODE.deposit, required: true }),
        f('accountNumber', '口座番号', 7, 'N', { required: true }),
        f('payeeName', '受取人名', 30, 'C', { role: 'name', required: true }),
        f('amount', '振込金額', 10, 'N', { role: 'amount', format: 'amount', required: true }),
        f('newCode', '新規コード', 1, 'N', { codes: CODE.newCode }),
        f('customerCode1', '顧客コード1', 10, 'C', { hint: 'EDI 情報。銀行により振込依頼人名の指定に使用' }),
        f('customerCode2', '顧客コード2', 10, 'C', {}),
        f('transferKubun', '振込指定区分', 1, 'N', { codes: CODE.transferKubun }),
        f('ident', '識別表示', 1, 'C', { codes: CODE.ident }),
        f('dummy', 'ダミー', 7, 'C', { dummy: true })
      ]),
      trailer: simpleTrailer(),
      end: endRecord()
    }
  };

  /* ------------------------------------------------------------------ *
   * 給与振込（11） / 賞与振込（12）
   * ------------------------------------------------------------------ */

  function payrollFormat(code, name, shortName, accent, description) {
    return {
      code: code,
      name: name,
      shortName: shortName,
      accent: accent,
      description: description,
      recordLength: 120,
      records: {
        header: record('1', 'ヘッダーレコード', [
          f('kubun', 'データ区分', 1, 'N', { fixed: '1', role: 'kubun', codes: CODE.kubun, required: true }),
          f('typeCode', '種別コード', 2, 'N', { fixed: code, role: 'typeCode', required: true }),
          f('codeKubun', 'コード区分', 1, 'N', { codes: CODE.codeKubun, required: true, hint: '0=JIS、1=EBCDIC' }),
          f('requesterCode', '委託者コード', 10, 'N', { role: 'requesterCode', required: true }),
          f('requesterName', '委託者名', 40, 'C', { role: 'requesterName', required: true }),
          f('transferDate', '振込指定日', 4, 'N', { role: 'date', format: 'mmdd', required: true, hint: '月日 4 桁（MMDD）' }),
          f('bankCode', '仕向銀行番号', 4, 'N', { role: 'originBankCode', required: true }),
          f('bankName', '仕向銀行名', 15, 'C', { role: 'originBankName' }),
          f('branchCode', '仕向支店番号', 3, 'N', { role: 'originBranchCode', required: true }),
          f('branchName', '仕向支店名', 15, 'C', { role: 'originBranchName' }),
          f('depositType', '預金種目', 1, 'N', { codes: CODE.deposit }),
          f('accountNumber', '口座番号', 7, 'N', {}),
          f('dummy', 'ダミー', 17, 'C', { dummy: true })
        ]),
        data: record('2', 'データレコード', [
          f('kubun', 'データ区分', 1, 'N', { fixed: '2', role: 'kubun', codes: CODE.kubun, required: true, hideInTable: true }),
          f('bankCode', '被仕向銀行番号', 4, 'N', { required: true }),
          f('bankName', '被仕向銀行名', 15, 'C', {}),
          f('branchCode', '被仕向支店番号', 3, 'N', { required: true }),
          f('branchName', '被仕向支店名', 15, 'C', {}),
          f('dummy1', 'ダミー', 4, 'C', { dummy: true }),
          f('depositType', '預金種目', 1, 'N', { codes: CODE.deposit, required: true }),
          f('accountNumber', '口座番号', 7, 'N', { required: true }),
          f('payeeName', '受給者名', 30, 'C', { role: 'name', required: true }),
          f('amount', '振込金額', 10, 'N', { role: 'amount', format: 'amount', required: true }),
          f('newCode', '新規コード', 1, 'N', { codes: CODE.newCode }),
          f('employeeNumber', '社員番号', 10, 'C', {}),
          f('dummy2', 'ダミー', 19, 'C', { dummy: true })
        ]),
        trailer: simpleTrailer(),
        end: endRecord()
      }
    };
  }

  var KYUYO = payrollFormat('11', '給与振込', '給振',
    'emerald', '従業員の給与を一括で振り込むためのフォーマットです。');
  var SHOYO = payrollFormat('12', '賞与振込', '賞振',
    'amber', '賞与（ボーナス）を一括で振り込むためのフォーマットです。');

  /* ------------------------------------------------------------------ *
   * 預金口座振替（種別コード 91）
   * ------------------------------------------------------------------ */

  var KOZA_FURIKAE = {
    code: '91',
    name: '預金口座振替',
    shortName: '口振',
    accent: 'rose',
    description: '売掛金などを取引先口座から引き落とすためのフォーマットです。結果ファイルの読み込みにも対応します。',
    recordLength: 120,
    records: {
      header: record('1', 'ヘッダーレコード', [
        f('kubun', 'データ区分', 1, 'N', { fixed: '1', role: 'kubun', codes: CODE.kubun, required: true }),
        f('typeCode', '種別コード', 2, 'N', { fixed: '91', role: 'typeCode', required: true }),
        f('codeKubun', 'コード区分', 1, 'N', { codes: CODE.codeKubun, required: true, hint: '0=JIS、1=EBCDIC' }),
        f('requesterCode', '委託者コード', 10, 'N', { role: 'requesterCode', required: true }),
        f('requesterName', '委託者名', 40, 'C', { role: 'requesterName', required: true }),
        f('transferDate', '引落日', 4, 'N', { role: 'date', format: 'mmdd', required: true, hint: '月日 4 桁（MMDD）' }),
        f('bankCode', '取引銀行番号', 4, 'N', { role: 'originBankCode', required: true }),
        f('bankName', '取引銀行名', 15, 'C', { role: 'originBankName' }),
        f('branchCode', '取引支店番号', 3, 'N', { role: 'originBranchCode', required: true }),
        f('branchName', '取引支店名', 15, 'C', { role: 'originBranchName' }),
        f('dummy', 'ダミー', 25, 'C', { dummy: true })
      ]),
      data: record('2', 'データレコード', [
        f('kubun', 'データ区分', 1, 'N', { fixed: '2', role: 'kubun', codes: CODE.kubun, required: true, hideInTable: true }),
        f('bankCode', '引落銀行番号', 4, 'N', { required: true }),
        f('bankName', '引落銀行名', 15, 'C', {}),
        f('branchCode', '引落支店番号', 3, 'N', { required: true }),
        f('branchName', '引落支店名', 15, 'C', {}),
        f('dummy1', 'ダミー', 4, 'C', { dummy: true }),
        f('depositType', '預金種目', 1, 'N', { codes: CODE.deposit, required: true }),
        f('accountNumber', '口座番号', 7, 'N', { required: true }),
        f('payerName', '預金者名', 30, 'C', { role: 'name', required: true }),
        f('amount', '引落金額', 10, 'N', { role: 'amount', format: 'amount', required: true }),
        f('newCode', '新規コード', 1, 'N', { codes: CODE.newCodeDebit }),
        f('customerNumber', '顧客番号', 20, 'C', {}),
        f('resultCode', '振替結果コード', 1, 'C', { codes: CODE.result, role: 'resultCode', hint: '依頼時は空白。結果ファイルで銀行が設定' }),
        f('dummy2', 'ダミー', 8, 'C', { dummy: true })
      ]),
      trailer: record('8', 'トレーラーレコード', [
        f('kubun', 'データ区分', 1, 'N', { fixed: '8', role: 'kubun', codes: CODE.kubun, required: true }),
        f('totalCount', '合計件数', 6, 'N', { role: 'totalCount', format: 'count', required: true }),
        f('totalAmount', '合計金額', 12, 'N', { role: 'totalAmount', format: 'amount', required: true }),
        f('doneCount', '振替済件数', 6, 'N', { format: 'count', hint: '結果ファイルのみ設定' }),
        f('doneAmount', '振替済金額', 12, 'N', { format: 'amount', hint: '結果ファイルのみ設定' }),
        f('failCount', '振替不能件数', 6, 'N', { format: 'count', hint: '結果ファイルのみ設定' }),
        f('failAmount', '振替不能金額', 12, 'N', { format: 'amount', hint: '結果ファイルのみ設定' }),
        f('dummy', 'ダミー', 65, 'C', { dummy: true })
      ]),
      end: endRecord()
    }
  };

  /* ------------------------------------------------------------------ *
   * 入出金系（照会・通知）フォーマット
   *
   * 銀行から受け取る入金・残高データで、レコード長は 200 バイト。
   * 種別コードとレコード構成は確認できているが、項目ごとの桁位置は
   * 金融機関の仕様書で確認できていないため、桁の意味は解釈せず
   * 「レイアウト定義の登録待ち（layoutPending）」として扱う。
   *
   * 誤った桁位置で金額や日付を表示すると、画面上は正しく見えたまま
   * 誤った数値を信じさせてしまうため、推測での実装は行わない。
   * ------------------------------------------------------------------ */

  /**
   * 種別コードとレコード長だけが判明しているフォーマットを定義する。
   * ファイルの識別・レコード分割・構成の検証は行い、項目の解釈はしない。
   */
  function pendingFormat(spec) {
    var len = spec.recordLength || 200;
    function body(kubun, label, extra) {
      var fields = [
        f('kubun', 'データ区分', 1, 'N',
          { fixed: kubun, role: 'kubun', codes: CODE.kubun, required: true })
      ];
      var used = 1;
      if (extra) {
        fields.push(f('typeCode', '種別コード', 2, 'N',
          { fixed: spec.code, role: 'typeCode', required: true }));
        used += 2;
      }
      fields.push(f('body', 'レコード内容', len - used, 'C', { role: 'rawBody' }));
      return record(kubun, label, fields);
    }
    return {
      code: spec.code,
      name: spec.name,
      shortName: spec.shortName,
      accent: spec.accent,
      description: spec.description,
      recordLength: len,
      layoutPending: true,
      source: spec.source,
      records: {
        header: body('1', 'ヘッダーレコード', true),
        data: body('2', 'データレコード'),
        trailer: body('8', 'トレーラーレコード'),
        end: body('9', 'エンドレコード')
      }
    };
  }

  var FURIKOMI_NYUKIN = pendingFormat({
    code: '01', name: '振込入金通知', shortName: '振入', accent: 'sky',
    description: '自社口座への振込入金の明細を銀行から受け取るためのフォーマットです。',
    source: '種別コード・レコード長は金融機関の公開仕様で確認済み。項目の桁位置は未登録です。'
  });

  var ZANDAKA = pendingFormat({
    code: '02', name: '残高通知', shortName: '残高', accent: 'violet',
    description: '口座残高を銀行から受け取るためのフォーマットです。',
    source: '種別コード・レコード長は金融機関の公開仕様で確認済み。項目の桁位置は未登録です。'
  });

  var NYUSHUKKIN = pendingFormat({
    code: '03', name: '入出金取引明細', shortName: '入出金', accent: 'teal',
    description: '口座の入出金取引明細を銀行から受け取るためのフォーマットです。',
    source: '種別コード・レコード長は金融機関の公開仕様で確認済み。項目の桁位置は未登録です。'
  });

  /* ------------------------------------------------------------------ *
   * 汎用（種別コード 未知）
   * ------------------------------------------------------------------ */

  /**
   * 未対応の種別コードを読み込んだときの表示用フォーマット。
   * 桁の意味は解釈せず、データ区分だけを認識して原文のまま扱う。
   */
  function genericFormat(typeCode, recordLength) {
    var len = recordLength || 120;
    function generic(kubun, label) {
      return record(kubun, label, [
        f('kubun', 'データ区分', 1, 'N', { fixed: kubun, role: 'kubun', codes: CODE.kubun, required: true }),
        f('body', 'レコード内容', len - 1, 'C', { role: 'rawBody' })
      ]);
    }
    return {
      code: typeCode || '--',
      name: '未対応フォーマット',
      shortName: '汎用',
      accent: 'slate',
      generic: true,
      description: '種別コード ' + (typeCode || '不明') +
        ' のレイアウト定義がありません。桁を解釈せず原文のまま表示・編集します。',
      recordLength: len,
      records: {
        header: generic('1', 'ヘッダーレコード'),
        data: generic('2', 'データレコード'),
        trailer: generic('8', 'トレーラーレコード'),
        end: generic('9', 'エンドレコード')
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * レジストリ
   * ------------------------------------------------------------------ */

  var FORMATS = {};
  [SOGO_FURIKOMI, KYUYO, SHOYO, KOZA_FURIKAE,
    FURIKOMI_NYUKIN, ZANDAKA, NYUSHUKKIN].forEach(function (fmt) {
    FORMATS[fmt.code] = fmt;
  });

  /** 種別コードからフォーマット定義を得る。未定義なら汎用定義を返す。 */
  function getFormat(typeCode, recordLength) {
    var fmt = FORMATS[typeCode];
    if (fmt) return fmt;
    return genericFormat(typeCode, recordLength);
  }

  function listFormats() {
    return Object.keys(FORMATS).sort().map(function (k) { return FORMATS[k]; });
  }

  /** 定義の桁数合計を検証する（開発時の自己診断用）。 */
  function verify() {
    var problems = [];
    listFormats().forEach(function (fmt) {
      Object.keys(fmt.records).forEach(function (name) {
        var rec = fmt.records[name];
        if (rec.length !== fmt.recordLength) {
          problems.push(fmt.name + ' / ' + rec.label + ': 合計 ' + rec.length +
            ' 桁（期待値 ' + fmt.recordLength + ' 桁）');
        }
      });
    });
    return problems;
  }

  global.ZenginFormats = {
    CODE: CODE,
    getFormat: getFormat,
    listFormats: listFormats,
    genericFormat: genericFormat,
    verify: verify
  };
})(typeof window !== 'undefined' ? window : globalThis);

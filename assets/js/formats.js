/*!
 * formats.js - 全銀協制定フォーマットのレコードレイアウト定義
 *
 * 出典: 一般社団法人全国銀行協会
 *   「AP-Ⅰ-12〔別冊〕全銀協パーソナル・コンピュータ用標準通信プロトコル
 *     （ベーシック手順）適用業務およびレコード・フォーマット」令和元年 12 月
 *
 * 各フォーマットは ヘッダー(1) / データ(2) / トレーラ(8) / エンド(9) の
 * 4 種類のレコードで構成される。桁位置は定義順に自動計算し、合計が規定の
 * レコード長になることを verify() で検証する。
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 共通コード表（付録 3・4 および各フォーマットの「内容」欄より）
   * ------------------------------------------------------------------ */

  var CODE = {
    kubun: { '1': 'ヘッダー', '2': 'データ', '8': 'トレーラ', '9': 'エンド' },
    codeKubun: { '0': 'JIS', '1': 'EBCDIC' },

    // 付録 3 預金種目コード（業務ごとに使用できる範囲は異なる）
    depositAll: {
      '1': '普通預金', '2': '当座預金', '3': '納税準備預金', '4': '貯蓄預金',
      '5': '通知預金', '6': '定期預金', '7': '積立定期預金', '8': '定期積金', '9': 'その他'
    },
    deposit12: { '1': '普通預金', '2': '当座預金' },
    deposit129: { '1': '普通預金', '2': '当座預金', '9': 'その他' },
    deposit1249: { '1': '普通預金', '2': '当座預金', '4': '貯蓄預金', '9': 'その他' },
    deposit1239: { '1': '普通預金', '2': '当座預金', '3': '納税準備預金', '9': 'その他' },
    deposit124: { '1': '普通預金', '2': '当座預金', '4': '貯蓄預金' },
    deposit1to7: {
      '1': '普通預金', '2': '当座預金', '4': '貯蓄預金',
      '5': '通知預金', '6': '定期預金', '7': '積立定期預金'
    },

    newCode: { '0': 'その他', '1': '第1回振込分', '2': '変更分' },
    newCodeDebit: { '0': 'その他', '1': '第1回引落分', '2': '変更分' },
    transferKubun: { '7': 'テレ振込', '8': '文書振込' },
    ident: { 'Y': 'EDI情報あり' },
    result: {
      '0': '振替済', '1': '資金不足', '2': '取引なし', '3': '預金者の都合による振替停止',
      '4': '預金口座振替依頼書なし', '8': '委託者の都合による振替停止', '9': 'その他'
    },

    cancel: { '1': '取消' },
    plusMinus: { '1': 'プラス', '2': 'マイナス' },
    passbook: { '1': '通帳', '2': '証書' },
    inOut: { '1': '入金', '2': '出金' },
    txKind: {
      '10': '現金', '11': '振込', '12': '他店券入金', '13': '交換',
      '14': '振替', '15': '継続', '18': 'その他', '19': '訂正'
    },
    billKind: { '1': '小切手', '2': '約束手形', '3': '為替手形' },
    tax: {
      '1': '総合課税', '2': '源泉分離課税', '3': 'マル優', '4': 'マル財',
      '5': '非居住者', '6': '特別マル財', '9': 'その他'
    },
    interimKubun: { '1': '現払', '2': '指定口座への振替', '3': '定期預金の作成' },
    noticeKubun: { '1': '預金' }
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
   * @param {object} [opts] required / optional / dummy / codes / role /
   *                        format / hint / fixed / charClass
   */
  function f(key, label, len, type, opts) {
    var field = {
      key: key, label: label, len: len, type: type,
      required: false, optional: false, dummy: false, codes: null, role: null,
      format: null, hint: '', fixed: null, hideInTable: false, charClass: null
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

  /**
   * ダミー項目。規定書が「スペースとする」と定めている領域。
   * fill を持つ項目は、その文字で埋まっているかを検証できる。
   */
  function dummy(len, key) {
    return f(key || 'dummy', 'ダミー', len, 'C', { dummy: true, fill: ' ', hint: 'スペースとする' });
  }

  /** データ区分の固定項目。 */
  function kubunField(value) {
    // 一覧では全行が同じ値になるため、既定では列に出さない
    return f('kubun', 'データ区分', 1, 'N',
      { fixed: value, role: 'kubun', codes: CODE.kubun, required: true, hideInTable: true });
  }

  /** 種別コードの固定項目。 */
  function typeField(code, name) {
    return f('typeCode', '種別コード', 2, 'N',
      { fixed: code, role: 'typeCode', required: true, hint: code + '：' + name });
  }

  /* ================================================================== *
   * 振込依頼系（120 桁）
   * ================================================================== */

  /** 総合振込・給与振込・預金口座振替に共通するエンド・レコード。 */
  function plainEnd(len) {
    return record('9', 'エンド・レコード', [
      kubunField('9'),
      dummy((len || 120) - 1)
    ]);
  }

  /** 合計件数・合計金額のみのトレーラ・レコード。 */
  function simpleTrailer() {
    return record('8', 'トレーラ・レコード', [
      kubunField('8'),
      f('totalCount', '合計件数', 6, 'N', { role: 'totalCount', format: 'count', required: true }),
      f('totalAmount', '合計金額', 12, 'N', { role: 'totalAmount', format: 'amount', required: true }),
      dummy(101)
    ]);
  }

  /* ------------------------- 総合振込（21） ------------------------- */

  var SOGO_FURIKOMI = {
    code: '21',
    name: '総合振込',
    shortName: '総振',
    accent: 'indigo',
    direction: 'submit',
    description: '振込依頼人（企業等）が同時に多数の振込を依頼する場合の振込明細です。',
    recordLength: 120,
    duplicateKeys: ['bankCode', 'branchCode', 'depositType', 'accountNumber'],
    records: {
      header: record('1', 'ヘッダー・レコード', [
        kubunField('1'),
        typeField('21', '総合振込'),
        f('codeKubun', 'コード区分', 1, 'N', { codes: CODE.codeKubun, required: true }),
        f('requesterCode', '振込依頼人コード', 10, 'N', {
          role: 'requesterCode', required: true,
          hint: '振込依頼人識別のため銀行が採番したコード（取引企業コード）'
        }),
        f('requesterName', '振込依頼人名', 40, 'C', {
          role: 'requesterName', required: true, charClass: 'name'
        }),
        f('transferDate', '取組日', 4, 'N', {
          role: 'date', format: 'mmdd', required: true, hint: '振込日 MMDD（月日）'
        }),
        f('bankCode', '仕向銀行番号', 4, 'N', { role: 'originBankCode', required: true, hint: '統一金融機関番号' }),
        f('bankName', '仕向銀行名', 15, 'C', { role: 'originBankName', optional: true, charClass: 'branch' }),
        f('branchCode', '仕向支店番号', 3, 'N', { role: 'originBranchCode', required: true, hint: '統一店番号' }),
        f('branchName', '仕向支店名', 15, 'C', { role: 'originBranchName', optional: true, charClass: 'branch' }),
        f('depositType', '預金種目（依頼人）', 1, 'N', { codes: CODE.deposit129, optional: true }),
        f('accountNumber', '口座番号（依頼人）', 7, 'N', { optional: true }),
        dummy(17)
      ]),
      data: record('2', 'データ・レコード', [
        kubunField('2'),
        f('bankCode', '被仕向銀行番号', 4, 'N', { required: true, hint: '統一金融機関番号' }),
        f('bankName', '被仕向銀行名', 15, 'C', { optional: true, charClass: 'branch' }),
        f('branchCode', '被仕向支店番号', 3, 'N', { required: true, hint: '統一店番号' }),
        f('branchName', '被仕向支店名', 15, 'C', { optional: true, charClass: 'branch' }),
        f('clearingCode', '手形交換所番号', 4, 'N', { optional: true, hint: '統一手形交換所番号' }),
        f('depositType', '預金種目', 1, 'N', { codes: CODE.deposit1249, required: true }),
        f('accountNumber', '口座番号', 7, 'N', { required: true }),
        f('payeeName', '受取人名', 30, 'C', { role: 'name', required: true, charClass: 'name' }),
        f('amount', '振込金額', 10, 'N', { role: 'amount', format: 'amount', required: true }),
        f('newCode', '新規コード', 1, 'N', { codes: CODE.newCode }),
        f('customerCode1', '顧客コード1', 10, 'N', {
          optional: true, charClass: 'edi',
          hint: '依頼人が定めた受取人識別コード。識別表示が「Y」のときは顧客コード2と合わせて EDI 情報（20 桁）'
        }),
        f('customerCode2', '顧客コード2', 10, 'N', { optional: true, charClass: 'edi' }),
        f('transferKubun', '振込指定区分', 1, 'N', { codes: CODE.transferKubun, optional: true }),
        f('ident', '識別表示', 1, 'C', {
          codes: CODE.ident, optional: true,
          hint: '「Y」またはスペース。「Y」のとき顧客コード1・2 は EDI 情報を表す'
        }),
        dummy(7)
      ]),
      trailer: simpleTrailer(),
      end: plainEnd(120)
    }
  };

  /* --------------- 給与振込（11）・賞与振込（12） --------------- */

  function payrollFormat(code, name, shortName, accent, description) {
    return {
      code: code,
      name: name,
      shortName: shortName,
      accent: accent,
      direction: 'submit',
      description: description,
      recordLength: 120,
      duplicateKeys: ['bankCode', 'branchCode', 'depositType', 'accountNumber'],
      records: {
        header: record('1', 'ヘッダー・レコード', [
          kubunField('1'),
          typeField(code, name),
          f('codeKubun', 'コード区分', 1, 'N', { codes: CODE.codeKubun, required: true }),
          f('requesterCode', '会社コード', 10, 'N', {
            role: 'requesterCode', required: true, hint: '銀行が採番した取引先の会社コード'
          }),
          f('requesterName', '会社名', 40, 'C', {
            role: 'requesterName', required: true, charClass: 'name',
            hint: '事業所・出張所名等を含めてもよい'
          }),
          f('transferDate', '振込指定日', 4, 'N', {
            role: 'date', format: 'mmdd', required: true, hint: 'MMDD（月日）'
          }),
          f('bankCode', '仕向銀行番号', 4, 'N', { role: 'originBankCode', required: true, hint: '統一金融機関番号' }),
          f('bankName', '仕向銀行名', 15, 'C', { role: 'originBankName', optional: true, charClass: 'branch' }),
          f('branchCode', '仕向支店番号', 3, 'N', { role: 'originBranchCode', required: true, hint: '統一店番号' }),
          f('branchName', '仕向支店名', 15, 'C', { role: 'originBranchName', optional: true, charClass: 'branch' }),
          f('depositType', '預金種目（企業等）', 1, 'N', { codes: CODE.deposit12, optional: true }),
          f('accountNumber', '口座番号（企業等）', 7, 'N', { optional: true }),
          dummy(17)
        ]),
        data: record('2', 'データ・レコード', [
          kubunField('2'),
          f('bankCode', '被仕向銀行番号', 4, 'N', { required: true, hint: '統一金融機関番号' }),
          f('bankName', '被仕向銀行名', 15, 'C', { charClass: 'branch' }),
          f('branchCode', '被仕向支店番号', 3, 'N', { required: true, hint: '統一店番号' }),
          f('branchName', '被仕向支店名', 15, 'C', { charClass: 'branch' }),
          f('clearingCode', '手形交換所番号', 4, 'N', { optional: true }),
          f('depositType', '預金種目', 1, 'N', { codes: CODE.deposit12, required: true }),
          f('accountNumber', '口座番号', 7, 'N', { required: true }),
          f('payeeName', '預金者名', 30, 'C', { role: 'name', required: true, charClass: 'name' }),
          f('amount', '振込金額', 10, 'N', { role: 'amount', format: 'amount', required: true }),
          f('newCode', '新規コード', 1, 'N', {
            codes: CODE.newCode,
            hint: '2 は被仕向銀行・支店、口座番号の変更分'
          }),
          f('employeeNumber', '社員番号', 10, 'N', { optional: true, hint: '企業等での社員番号' }),
          f('sectionCode', '所属コード', 10, 'N', { optional: true, hint: '企業等での所属コード' }),
          dummy(9)
        ]),
        trailer: simpleTrailer(),
        end: plainEnd(120)
      }
    };
  }

  var KYUYO = payrollFormat('11', '給与振込', '給振', 'emerald',
    '企業等が従業員の給与を口座振込の形で支払う場合の振込明細です。');
  var SHOYO = payrollFormat('12', '賞与振込', '賞振', 'amber',
    '企業等が従業員の賞与を口座振込の形で支払う場合の振込明細です。');

  /* --------------------- 預金口座振替（91） --------------------- */

  var KOZA_FURIKAE = {
    code: '91',
    name: '預金口座振替',
    shortName: '口振',
    accent: 'rose',
    direction: 'submit',
    description: '収納企業（委託者）が預金口座振替を銀行に依頼する明細です。処理結果明細の読み込みにも対応します。',
    recordLength: 120,
    duplicateKeys: ['bankCode', 'branchCode', 'depositType', 'accountNumber'],
    records: {
      header: record('1', 'ヘッダー・レコード', [
        kubunField('1'),
        typeField('91', '預金口座振替'),
        f('codeKubun', 'コード区分', 1, 'N', { codes: CODE.codeKubun, required: true }),
        f('requesterCode', '委託者コード', 10, 'N', {
          role: 'requesterCode', required: true, hint: '銀行が定めた委託者のコード'
        }),
        f('requesterName', '委託者名', 40, 'C', { role: 'requesterName', required: true, charClass: 'name' }),
        f('transferDate', '引落日', 4, 'N', { role: 'date', format: 'mmdd', required: true, hint: 'MMDD（月日）' }),
        f('bankCode', '取引銀行番号', 4, 'N', { role: 'originBankCode', required: true, hint: '統一金融機関番号' }),
        f('bankName', '取引銀行名', 15, 'C', { role: 'originBankName', optional: true, charClass: 'branch' }),
        f('branchCode', '取引支店番号', 3, 'N', { role: 'originBranchCode', required: true, hint: '統一店番号' }),
        f('branchName', '取引支店名', 15, 'C', { role: 'originBranchName', optional: true, charClass: 'branch' }),
        f('depositType', '預金種目（委託者）', 1, 'N', { codes: CODE.deposit129, required: true }),
        f('accountNumber', '口座番号（委託者）', 7, 'N', { required: true }),
        dummy(17)
      ]),
      data: record('2', 'データ・レコード', [
        kubunField('2'),
        f('bankCode', '引落銀行番号', 4, 'N', { required: true, hint: '統一金融機関番号' }),
        f('bankName', '引落銀行名', 15, 'C', { optional: true, charClass: 'branch' }),
        f('branchCode', '引落支店番号', 3, 'N', { required: true, hint: '統一店番号' }),
        f('branchName', '引落支店名', 15, 'C', { optional: true, charClass: 'branch' }),
        dummy(4, 'dummy1'),
        f('depositType', '預金種目', 1, 'N', { codes: CODE.deposit1239, required: true }),
        f('accountNumber', '口座番号', 7, 'N', { required: true }),
        f('payerName', '預金者名', 30, 'C', { role: 'name', required: true, charClass: 'name' }),
        f('amount', '引落金額', 10, 'N', { role: 'amount', format: 'amount', required: true }),
        f('newCode', '新規コード', 1, 'N', {
          codes: CODE.newCodeDebit, hint: '2 は引落銀行・支店、口座番号の変更分'
        }),
        f('customerNumber', '顧客番号', 20, 'N', {
          hint: '委託者が定めた顧客番号。顧客番号以外のものを記載しない'
        }),
        f('resultCode', '振替結果コード', 1, 'N', {
          codes: CODE.result, role: 'resultCode',
          hint: '依頼明細では「0」。処理結果明細で銀行が設定する'
        }),
        dummy(8, 'dummy2')
      ]),
      trailer: record('8', 'トレーラ・レコード', [
        kubunField('8'),
        f('totalCount', '合計件数', 6, 'N', { role: 'totalCount', format: 'count', required: true }),
        f('totalAmount', '合計金額', 12, 'N', { role: 'totalAmount', format: 'amount', required: true }),
        f('doneCount', '振替済件数', 6, 'N', { format: 'count', hint: '依頼明細ではすべて「0」' }),
        f('doneAmount', '振替済金額', 12, 'N', { format: 'amount', hint: '依頼明細ではすべて「0」' }),
        f('failCount', '振替不能件数', 6, 'N', { format: 'count', hint: '依頼明細ではすべて「0」' }),
        f('failAmount', '振替不能金額', 12, 'N', { format: 'amount', hint: '依頼明細ではすべて「0」' }),
        dummy(65)
      ]),
      end: plainEnd(120)
    }
  };

  /* ================================================================== *
   * 照会・通知系（200 桁）
   * ================================================================== */

  /* ------------------- 振込入金通知（01） ------------------- */

  function furikomiNyukinHeader() {
    return record('1', 'ヘッダー・レコード', [
      kubunField('1'),
      typeField('01', '振込入金通知'),
      f('codeKubun', 'コード区分', 1, 'N', { codes: CODE.codeKubun, required: true }),
      f('createdDate', '作成日', 6, 'N', {
        role: 'date', format: 'yymmdd', required: true, hint: 'YYMMDD（年（和暦）月日）'
      }),
      f('periodFrom', '勘定日（自）', 6, 'N', {
        format: 'yymmdd', required: true,
        hint: '営業日単位で通知する場合は（自）（至）を同一年月日とする'
      }),
      f('periodTo', '勘定日（至）', 6, 'N', { format: 'yymmdd', required: true }),
      f('bankCode', '銀行コード', 4, 'N', { role: 'originBankCode', required: true, hint: '統一金融機関番号' }),
      f('bankName', '銀行名', 15, 'C', { role: 'originBankName', charClass: 'branch' }),
      f('branchCode', '支店コード', 3, 'N', { role: 'originBranchCode', required: true, hint: '統一店番号' }),
      f('branchName', '支店名', 15, 'C', { role: 'originBranchName', charClass: 'branch' }),
      f('depositType', '預金種目', 1, 'N', { codes: CODE.deposit124, required: true }),
      f('accountNumber', '口座番号', 7, 'N', { role: 'accountNumber', required: true }),
      f('accountName', '口座名', 40, 'C', { role: 'requesterName', charClass: 'name' }),
      dummy(93)
    ]);
  }

  function furikomiNyukinTrailer() {
    return record('8', 'トレーラ・レコード', [
      kubunField('8'),
      f('totalCount', '振込合計件数', 6, 'N', { role: 'totalCount', format: 'count', required: true }),
      f('totalAmount', '振込合計金額', 12, 'N', { role: 'totalAmount', format: 'amount', required: true }),
      f('cancelCount', '取消合計件数', 6, 'N', { format: 'count', optional: true }),
      f('cancelAmount', '取消合計金額', 12, 'N', { format: 'amount', optional: true }),
      dummy(163)
    ]);
  }

  // フォーマット A: 金額欄が 10 桁
  var FURIKOMI_NYUKIN_DATA_A = record('2', 'データ・レコード', [
    kubunField('2'),
    f('inquiryNumber', '照会番号', 6, 'N', { optional: true, hint: '銀行が採番した照会用番号' }),
    f('valueDate', '勘定日', 6, 'N', { format: 'yymmdd', required: true }),
    f('startDate', '起算日', 6, 'N', { format: 'yymmdd', required: true, hint: '入金の起算日。通常は勘定日と同日' }),
    f('amount', '金額', 10, 'N', { role: 'amount', format: 'amount', required: true }),
    f('billAmount', 'うち他店券金額', 10, 'N', { format: 'amount' }),
    f('remitterCode', '振込依頼人コード', 10, 'N', {
      optional: true, hint: '仕向銀行からの為替通知に記載された振込依頼人の識別コード'
    }),
    f('remitterName', '振込依頼人名', 48, 'C', { role: 'name', charClass: 'name' }),
    f('originBankName', '仕向銀行名', 15, 'C', { optional: true, charClass: 'branch' }),
    f('originBranchName', '仕向店名', 15, 'C', { optional: true, charClass: 'branch' }),
    f('cancelKubun', '取消区分', 1, 'N', { codes: CODE.cancel, optional: true }),
    f('edi', 'EDI情報', 20, 'C', { optional: true, charClass: 'edi' }),
    dummy(52)
  ]);

  // フォーマット B: 12 桁の金額欄を追加
  var FURIKOMI_NYUKIN_DATA_B = record('2', 'データ・レコード', [
    kubunField('2'),
    f('inquiryNumber', '照会番号', 6, 'N', { optional: true, hint: '銀行が採番した照会用番号' }),
    f('valueDate', '勘定日', 6, 'N', { format: 'yymmdd', required: true }),
    f('startDate', '起算日', 6, 'N', { format: 'yymmdd', required: true, hint: '入金の起算日。通常は勘定日と同日' }),
    f('amount1', '金額(1)', 10, 'N', {
      role: 'amount', format: 'amount',
      hint: '振込入金通知が 10 桁以内の場合に使用。金額(2) を使う場合はすべて「0」'
    }),
    f('billAmount1', 'うち他店券金額(1)', 10, 'N', { format: 'amount' }),
    f('remitterCode', '振込依頼人コード', 10, 'N', { optional: true }),
    f('remitterName', '振込依頼人名', 48, 'C', { role: 'name', charClass: 'name' }),
    f('originBankName', '仕向銀行名', 15, 'C', { optional: true, charClass: 'branch' }),
    f('originBranchName', '仕向店名', 15, 'C', { optional: true, charClass: 'branch' }),
    f('cancelKubun', '取消区分', 1, 'N', { codes: CODE.cancel, optional: true }),
    f('amount2', '金額(2)', 12, 'N', {
      role: 'amount', format: 'amount',
      hint: '振込入金通知が 10 桁を超える場合に使用。金額(1) を使う場合はすべて「0」'
    }),
    f('billAmount2', 'うち他店券金額(2)', 12, 'N', { format: 'amount' }),
    f('edi', 'EDI情報', 20, 'C', { optional: true, charClass: 'edi' }),
    dummy(28)
  ]);

  var FURIKOMI_NYUKIN = {
    code: '01',
    name: '振込入金通知',
    shortName: '振入',
    accent: 'sky',
    direction: 'receive',
    description: '取引先（企業）の口座への振込入金明細を銀行から通知するフォーマットです。',
    recordLength: 200,
    // 金額欄の桁数が異なる 2 種類があり、種別コードは同一（01）
    variants: [
      { key: 'a', label: 'フォーマットA（金額 10 桁）', data: FURIKOMI_NYUKIN_DATA_A },
      { key: 'b', label: 'フォーマットB（金額 12 桁を追加）', data: FURIKOMI_NYUKIN_DATA_B }
    ],
    /**
     * データ・レコードの 129〜152 桁目を見て判定する。
     * フォーマット B ではここが金額(2)・うち他店券金額(2) の数字 24 桁になり、
     * フォーマット A では EDI 情報とダミーなので数字で埋まることはない。
     */
    selectVariant: function (ctx) {
      var samples = ctx.dataSamples || [];
      for (var i = 0; i < samples.length; i++) {
        var slice = samples[i].slice(128, 152);
        if (slice.length === 24 && /^\d{24}$/.test(slice)) return 'b';
      }
      return 'a';
    },
    records: {
      header: furikomiNyukinHeader(),
      data: FURIKOMI_NYUKIN_DATA_A,
      trailer: furikomiNyukinTrailer(),
      end: plainEnd(200)
    },
    aggregates: [
      { label: '振込合計', countKey: 'totalCount', amountKey: 'totalAmount' }
    ]
  };

  /* ------------------ 入出金取引明細（03） ------------------ */

  // ②-1 普通預金・当座預金・貯蓄預金
  var NYUSHUKKIN_DATA_LIQUID = record('2', 'データ・レコード', [
    kubunField('2'),
    f('inquiryNumber', '照会番号', 8, 'N', { optional: true, hint: '銀行が採番した照会用番号' }),
    f('valueDate', '勘定日', 6, 'N', { format: 'yymmdd', required: true }),
    f('paymentDate', '預入・払出日', 6, 'N', { format: 'yymmdd', required: true, hint: '通常は勘定日と同日' }),
    f('inOutKubun', '入払区分', 1, 'N', { codes: CODE.inOut, role: 'inOutKubun', required: true }),
    f('txKind', '取引区分', 2, 'N', { codes: CODE.txKind, optional: true }),
    f('amount', '取引金額', 12, 'N', { role: 'amount', format: 'amount', required: true }),
    f('billAmount', 'うち他店券金額', 12, 'N', { format: 'amount' }),
    f('exchangeDate', '交換呈示日', 6, 'N', { format: 'yymmdd', optional: true }),
    f('dishonorDate', '不渡返還日', 6, 'N', { format: 'yymmdd', optional: true }),
    f('billKind', '手形・小切手区分', 1, 'N', { codes: CODE.billKind, optional: true }),
    f('billNumber', '手形・小切手番号', 7, 'N', { optional: true }),
    f('branchCode', '僚店番号', 3, 'N', { optional: true, hint: '取引のあった店（統一店番号）' }),
    f('remitterCode', '振込依頼人コード', 10, 'N', { optional: true }),
    f('remitterName', '振込依頼人名・契約者番号', 48, 'C', {
      role: 'name', optional: true, charClass: 'name',
      hint: '入金のときは振込依頼人名。出金のときは預金口座振替の契約者番号（左 20 桁）'
    }),
    f('originBankName', '仕向銀行名', 15, 'C', { optional: true, charClass: 'branch' }),
    f('originBranchName', '仕向店名', 15, 'C', { optional: true, charClass: 'branch' }),
    f('summary', '摘要内容', 20, 'C', { optional: true }),
    f('edi', 'EDI情報', 20, 'C', { optional: true, charClass: 'edi' }),
    dummy(1)
  ]);

  // ②-2 通知預金・定期預金・積立定期預金
  var NYUSHUKKIN_DATA_TIME = record('2', 'データ・レコード', [
    kubunField('2'),
    f('identNumber', '識別番号', 8, 'N', { optional: true, hint: '口座番号の枝番号等、個々の取引を特定する番号' }),
    f('valueDate', '勘定日', 6, 'N', { format: 'yymmdd', required: true }),
    f('paymentDate', '預入・払出日', 6, 'N', { format: 'yymmdd', required: true }),
    f('inOutKubun', '入払区分', 1, 'N', { codes: CODE.inOut, role: 'inOutKubun', required: true }),
    f('txKind', '取引区分', 2, 'N', { codes: CODE.txKind, optional: true }),
    f('amount', '取引金額', 12, 'N', { role: 'amount', format: 'amount', required: true }),
    f('billAmount', 'うち他店券金額', 12, 'N', { format: 'amount' }),
    f('exchangeDate', '交換呈示日', 6, 'N', { format: 'yymmdd', optional: true }),
    f('dishonorDate', '不渡返還日', 6, 'N', { format: 'yymmdd', optional: true }),
    f('billKind', '手形・小切手区分', 1, 'N', { codes: CODE.billKind, optional: true }),
    f('billNumber', '手形・小切手番号', 7, 'N', { optional: true }),
    f('branchCode', '僚店番号', 3, 'N', { optional: true, hint: '統一店番号' }),
    f('firstDepositDate', '当初預入日', 6, 'N', { format: 'yymmdd', optional: true }),
    f('rate', '利率', 6, 'N', { hint: '預入時の利率（年利・小数第 4 位まで）。変更時はスペース' }),
    f('maturityDate', '満期日', 6, 'N', { format: 'yymmdd', optional: true }),
    f('term1', '期間(1)', 7, 'N', { optional: true, hint: '年 1 桁・月 2 桁・日 4 桁。使用しないものはすべて「0」' }),
    f('termInterest', '期間利息', 11, 'N', { format: 'amount', optional: true, hint: '正負は「期間利息正負表示」で表す' }),
    f('interimRate', '中間払利率', 6, 'N', { optional: true, hint: '年利・小数第 4 位まで' }),
    f('interimKubun', '中間払区分', 1, 'N', { codes: CODE.interimKubun, optional: true }),
    f('afterTerm', '期後期間', 4, 'N', { optional: true, hint: '満期日から解約日までの日数' }),
    f('afterRate', '期後利率', 6, 'N', { optional: true, hint: '年利・小数第 4 位まで' }),
    f('afterInterest', '期後利息', 9, 'N', { format: 'amount', optional: true }),
    f('totalInterest', '合計利息', 11, 'N', { format: 'amount', optional: true }),
    f('taxKubun', '税区分', 1, 'N', { codes: CODE.tax, optional: true }),
    f('taxRate', '税率', 4, 'N', { optional: true, hint: '小数第 2 位まで。変更時はスペース' }),
    f('taxAmount', '税額', 10, 'N', { format: 'amount', optional: true }),
    f('netInterest', '税引後利息', 11, 'N', { format: 'amount', optional: true, hint: '合計利息 − 税額' }),
    f('summary', '摘要内容', 20, 'C', { optional: true }),
    f('term2', '期間(2)', 5, 'N', { optional: true, hint: '期間(1) で年・月を表せない場合に使用' }),
    f('termInterestSign', '期間利息正負表示', 1, 'N', { codes: CODE.plusMinus, optional: true }),
    dummy(4)
  ]);

  var NYUSHUKKIN = {
    code: '03',
    name: '入出金取引明細',
    shortName: '入出金',
    accent: 'teal',
    direction: 'receive',
    description: '取引先（企業）の口座の入金および出金取引の明細を銀行から通知するフォーマットです。',
    recordLength: 200,
    // 対象預金の種類でデータ・レコードのレイアウトが異なる
    variants: [
      { key: 'liquid', label: '普通・当座・貯蓄預金', data: NYUSHUKKIN_DATA_LIQUID },
      { key: 'time', label: '通知・定期・積立定期預金', data: NYUSHUKKIN_DATA_TIME }
    ],
    /** ヘッダーの預金種目で判定する（1・2・4 は流動性預金、5・6・7 は定期性預金）。 */
    selectVariant: function (ctx) {
      var deposit = ctx.headerValue('depositType');
      return (deposit === '5' || deposit === '6' || deposit === '7') ? 'time' : 'liquid';
    },
    records: {
      header: record('1', 'ヘッダー・レコード', [
        kubunField('1'),
        typeField('03', '入出金取引明細'),
        f('codeKubun', 'コード区分', 1, 'N', { codes: CODE.codeKubun, required: true }),
        f('createdDate', '作成日', 6, 'N', { role: 'date', format: 'yymmdd', required: true, hint: 'YYMMDD（年（和暦）月日）' }),
        f('periodFrom', '勘定日（自）', 6, 'N', { format: 'yymmdd', required: true }),
        f('periodTo', '勘定日（至）', 6, 'N', { format: 'yymmdd', required: true }),
        f('bankCode', '銀行コード', 4, 'N', { role: 'originBankCode', required: true, hint: '統一金融機関番号' }),
        f('bankName', '銀行名', 15, 'C', { role: 'originBankName', charClass: 'branch' }),
        f('branchCode', '支店コード', 3, 'N', { role: 'originBranchCode', required: true, hint: '統一店番号' }),
        f('branchName', '支店名', 15, 'C', { role: 'originBranchName', charClass: 'branch' }),
        f('reserved', 'ダミー', 3, 'N', { dummy: true, fill: '0', hint: '将来の拡張用。すべて「0」とする' }),
        f('depositType', '預金種目', 1, 'N', { codes: CODE.deposit1to7, role: 'depositType', required: true }),
        f('accountNumber', '口座番号', 10, 'N', { role: 'accountNumber', required: true }),
        f('accountName', '口座名', 40, 'C', { role: 'requesterName', charClass: 'name' }),
        f('overdraftKubun', '貸越区分', 1, 'N', { codes: CODE.plusMinus, optional: true, hint: '取引前残高の状態' }),
        f('passbookKubun', '通帳・証書区分', 1, 'N', { codes: CODE.passbook, optional: true }),
        f('openingBalance', '取引前残高', 14, 'N', { format: 'amount', optional: true }),
        dummy(71)
      ]),
      data: NYUSHUKKIN_DATA_LIQUID,
      trailer: record('8', 'トレーラ・レコード', [
        kubunField('8'),
        f('inCount', '入金件数', 6, 'N', { format: 'count', required: true }),
        f('inAmount', '入金額合計', 13, 'N', { format: 'amount', required: true }),
        f('outCount', '出金件数', 6, 'N', { format: 'count', required: true }),
        f('outAmount', '出金額合計', 13, 'N', { format: 'amount', required: true }),
        f('overdraftKubun', '貸越区分', 1, 'N', { codes: CODE.plusMinus, optional: true, hint: '取引後残高の状態' }),
        f('closingBalance', '取引後残高', 14, 'N', { format: 'amount', optional: true }),
        f('dataCount', 'データ・レコード件数', 7, 'N', { role: 'totalCount', format: 'count', required: true }),
        dummy(139)
      ]),
      end: record('9', 'エンド・レコード', [
        kubunField('9'),
        f('recordTotal', 'レコード総件数', 10, 'N', { role: 'recordTotal', format: 'count' }),
        f('accountTotal', '口座数', 5, 'N', { role: 'accountTotal', format: 'count' }),
        dummy(184)
      ])
    },
    aggregates: [
      { label: '入金', countKey: 'inCount', amountKey: 'inAmount', where: { key: 'inOutKubun', equals: '1' } },
      { label: '出金', countKey: 'outCount', amountKey: 'outAmount', where: { key: 'inOutKubun', equals: '2' } },
      { label: 'データ・レコード', countKey: 'dataCount' }
    ]
  };

  /* -------------------- 残高通知（預金）（04） -------------------- */

  var ZANDAKA = {
    code: '04',
    name: '残高通知（預金）',
    shortName: '残高',
    accent: 'violet',
    direction: 'receive',
    description: '取引先（企業）の預金口座の残高を銀行から通知するフォーマットです。',
    recordLength: 200,
    records: {
      header: record('1', 'ヘッダー・レコード', [
        kubunField('1'),
        typeField('04', '残高通知'),
        f('noticeKubun', '通知区分', 1, 'N', { codes: CODE.noticeKubun, required: true, hint: '残高通知の種類' }),
        f('codeKubun', 'コード区分', 1, 'N', { codes: CODE.codeKubun, required: true }),
        f('createdDate', '作成日', 6, 'N', { role: 'date', format: 'yymmdd', required: true, hint: 'YYMMDD（年（和暦）月日）' }),
        f('requesterCode', '会社コード', 10, 'N', {
          role: 'requesterCode', required: true, hint: '銀行が採番した取引先の会社コード'
        }),
        f('requesterName', '会社名', 40, 'C', { role: 'requesterName', required: true, charClass: 'name' }),
        f('bankCode', '銀行コード', 4, 'N', { role: 'originBankCode', required: true, hint: '統一金融機関番号' }),
        f('bankName', '銀行名', 15, 'C', { role: 'originBankName', charClass: 'branch' }),
        f('branchCode', '支店コード', 3, 'N', { role: 'originBranchCode', required: true, hint: '統一店番号' }),
        f('branchName', '支店名', 15, 'C', { role: 'originBranchName', charClass: 'branch' }),
        dummy(102)
      ]),
      data: record('2', 'データ・レコード', [
        kubunField('2'),
        f('baseDate', '基準日', 6, 'N', { format: 'yymmdd', required: true, hint: '現在残高の基準日' }),
        f('baseTime', '基準時刻', 4, 'N', { format: 'hhmm', optional: true }),
        f('branchCode', '支店コード', 3, 'N', { required: true, hint: '統一店番号' }),
        f('reserved', 'ダミー', 3, 'N', { dummy: true, fill: '0', hint: '将来の拡張用。すべて「000」とする' }),
        f('depositType', '預金種目', 1, 'N', { codes: CODE.depositAll, required: true }),
        f('accountNumber', '口座番号', 10, 'N', { required: true }),
        f('accountCount', '口数', 4, 'N', { optional: true, hint: '通知預金・定期預金における口数' }),
        f('accountName', '口座名', 40, 'C', { role: 'name', charClass: 'name' }),
        f('balanceKubun', '現在残高 貸越区分', 1, 'N', { codes: CODE.plusMinus, required: true }),
        f('balance', '現在残高', 14, 'N', { role: 'amount', format: 'amount', required: true, hint: '基準時刻における残高' }),
        f('billBalance', '他店券残高', 14, 'N', { format: 'amount', hint: '現在残高中の他店券残高' }),
        f('overdraftLimit', '貸越極度額', 14, 'N', { format: 'amount', hint: '当座貸越契約がある場合の極度額' }),
        f('payableKubun', '支払可能残高 貸越区分', 1, 'N', { codes: CODE.plusMinus, optional: true }),
        f('payableBalance', '支払可能残高', 14, 'N', {
          format: 'amount', optional: true, hint: '現在残高 − 他店券残高 + 貸越極度額'
        }),
        f('prevKubun', '前日残高 貸越区分', 1, 'N', { codes: CODE.plusMinus, optional: true }),
        f('prevBalance', '前日残高', 14, 'N', { format: 'amount', optional: true, hint: '前日末の残高' }),
        f('lastTxDate', '最新取引日', 6, 'N', { format: 'yymmdd', optional: true }),
        dummy(49)
      ]),
      trailer: record('8', 'トレーラ・レコード', [
        kubunField('8'),
        f('dataCount', 'データ・レコード総件数', 7, 'N', { role: 'totalCount', format: 'count', required: true }),
        dummy(192)
      ]),
      end: record('9', 'エンド・レコード', [
        kubunField('9'),
        f('recordTotal', 'レコード総件数', 10, 'N', { role: 'recordTotal', format: 'count' }),
        dummy(189)
      ])
    },
    aggregates: [
      { label: 'データ・レコード', countKey: 'dataCount' }
    ]
  };

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
        kubunField(kubun),
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
        header: generic('1', 'ヘッダー・レコード'),
        data: generic('2', 'データ・レコード'),
        trailer: generic('8', 'トレーラ・レコード'),
        end: generic('9', 'エンド・レコード')
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * レジストリ
   * ------------------------------------------------------------------ */

  var FORMATS = {};
  [FURIKOMI_NYUKIN, NYUSHUKKIN, ZANDAKA,
    KYUYO, SHOYO, SOGO_FURIKOMI, KOZA_FURIKAE].forEach(function (fmt) {
    FORMATS[fmt.code] = fmt;
  });

  /** 種別コードからフォーマット定義を得る。未定義なら汎用定義を返す。 */
  function getFormat(typeCode, recordLength) {
    var fmt = FORMATS[typeCode];
    if (fmt) return fmt;
    return genericFormat(typeCode, recordLength);
  }

  /**
   * バリアント（同一種別コード内でデータ・レコードのレイアウトが異なるもの）を
   * 適用したフォーマットを返す。
   */
  function withVariant(format, variantKey) {
    if (!format.variants) return format;
    var variant = null;
    for (var i = 0; i < format.variants.length; i++) {
      if (format.variants[i].key === variantKey) { variant = format.variants[i]; break; }
    }
    if (!variant || format.records.data === variant.data) {
      return format.variantKey === variantKey ? format : shallowVariant(format, variant || format.variants[0]);
    }
    return shallowVariant(format, variant);
  }

  function shallowVariant(format, variant) {
    var clone = Object.create(Object.getPrototypeOf(format));
    Object.keys(format).forEach(function (k) { clone[k] = format[k]; });
    clone.records = {
      header: format.records.header,
      data: variant.data,
      trailer: format.records.trailer,
      end: format.records.end
    };
    clone.variantKey = variant.key;
    clone.variantLabel = variant.label;
    return clone;
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
      (fmt.variants || []).forEach(function (variant) {
        if (variant.data.length !== fmt.recordLength) {
          problems.push(fmt.name + ' / ' + variant.label + ': 合計 ' + variant.data.length +
            ' 桁（期待値 ' + fmt.recordLength + ' 桁）');
        }
      });
    });
    return problems;
  }

  global.ZenginFormats = {
    CODE: CODE,
    getFormat: getFormat,
    withVariant: withVariant,
    listFormats: listFormats,
    genericFormat: genericFormat,
    verify: verify
  };
})(typeof window !== 'undefined' ? window : globalThis);

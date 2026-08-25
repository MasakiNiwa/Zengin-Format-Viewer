/*!
 * samples.js - 動作確認用のサンプル全銀データ
 *
 * 銀行番号・銀行名は公開されている統一金融機関コードを用いていますが、
 * 口座番号・氏名・金額はすべて架空のものです。
 */
(function (global) {
  'use strict';

  var Zengin = global.Zengin;
  var Charset = global.ZenginCharset;
  var Formats = global.ZenginFormats;

  var BANKS = [
    { code: '0001', name: 'ﾐｽﾞﾎ', branch: '001', branchName: 'ﾄｳｷﾖｳｴｲｷﾞﾖｳﾌﾞ' },
    { code: '0005', name: 'ﾐﾂﾋﾞｼUFJ', branch: '135', branchName: 'ﾏﾙﾉｳﾁ' },
    { code: '0009', name: 'ﾐﾂｲｽﾐﾄﾓ', branch: '227', branchName: 'ｼﾝｼﾞﾕｸ' },
    { code: '0010', name: 'ﾘｿﾅ', branch: '441', branchName: 'ｵｵｻｶｴｲｷﾞﾖｳﾌﾞ' },
    { code: '0036', name: 'ﾊﾟｲｾﾂﾄ', branch: '101', branchName: 'ﾎﾝﾃﾝ' },
    { code: '0138', name: 'ﾁﾊﾞ', branch: '201', branchName: 'ﾌﾅﾊﾞｼ' },
    { code: '9900', name: 'ﾕｳﾁﾖ', branch: '008', branchName: 'ﾏﾙﾊﾁ' }
  ];

  var PAYEES = [
    'ｶ)ｱｻﾋｾｲｻｸｼﾖ', 'ｶ)ﾐﾄﾞﾘｼﾖｳｶｲ', 'ﾕ)ﾆｼﾞｲﾛﾃﾞﾝｷ', 'ｶ)ｻｸﾗﾌﾟﾗﾝﾆﾝｸﾞ',
    'ﾔﾏﾀﾞ ﾀﾛｳ', 'ｽｽﾞｷ ﾊﾅｺ', 'ｶ)ﾎｸﾄﾌﾞﾂﾘﾕｳ', 'ｼﾔ)ﾆﾎﾝｷｶｸｷﾖｳｶｲ',
    'ｶ)ｱｵｿﾞﾗｼｽﾃﾑ', 'ﾀﾅｶ ｲﾁﾛｳ', 'ｶ)ｺｳﾖｳｺｳｷﾞﾖｳ', 'ｶ)ｾﾄｳﾁｼﾖｸﾋﾝ'
  ];

  var EMPLOYEES = [
    { name: 'ﾔﾏﾀﾞ ﾀﾛｳ', no: 'E00101' },
    { name: 'ｻﾄｳ ﾊﾅｺ', no: 'E00102' },
    { name: 'ｽｽﾞｷ ｼﾞﾛｳ', no: 'E00205' },
    { name: 'ﾀｶﾊｼ ﾐｻｷ', no: 'E00312' },
    { name: 'ｲﾄｳ ｹﾝｲﾁ', no: 'E00318' },
    { name: 'ﾜﾀﾅﾍﾞ ﾕｷ', no: 'E00404' },
    { name: 'ﾅｶﾑﾗ ｿｳﾀ', no: 'E00417' },
    { name: 'ｺﾊﾞﾔｼ ｱｵｲ', no: 'E00520' }
  ];

  /** 決まった系列の擬似乱数（毎回同じサンプルを得るため）。 */
  function seeded(seed) {
    var value = seed;
    return function (max) {
      value = (value * 1103515245 + 12345) & 0x7fffffff;
      return value % max;
    };
  }

  function set(rec, def, key, value) {
    var field = def.byKey[key];
    if (field) Zengin.setField(rec, field, value);
  }

  /**
   * サンプルデータを組み立て、全銀固定長のバイト列として返す。
   * @param {string} formatCode 種別コード（'21' | '11' | '12' | '91'）
   * @param {{withResult?:boolean}} [options] 預金口座振替で結果コードを設定するか
   */
  function build(formatCode, options) {
    var opts = options || {};
    var format = Formats.getFormat(formatCode);
    var doc = Zengin.createEmpty(formatCode);
    var rnd = seeded(20240415 + parseInt(formatCode, 10));

    var headerDef = format.records.header;
    var dataDef = format.records.data;

    // --- ヘッダー ---------------------------------------------------
    var header = doc.records[0];
    set(header, headerDef, 'codeKubun', '0');
    set(header, headerDef, 'requesterCode', '1234567890');
    set(header, headerDef, 'requesterName', 'ｶ)ｻｸﾗｼﾖｳｼﾞ');
    set(header, headerDef, 'transferDate', formatCode === '11' ? '0425'
      : formatCode === '12' ? '0710' : formatCode === '91' ? '0527' : '0415');
    set(header, headerDef, 'bankCode', '0009');
    set(header, headerDef, 'bankName', 'ﾐﾂｲｽﾐﾄﾓ');
    set(header, headerDef, 'branchCode', '227');
    set(header, headerDef, 'branchName', 'ｼﾝｼﾞﾕｸ');
    set(header, headerDef, 'depositType', '1');
    set(header, headerDef, 'accountNumber', '1234567');

    // --- データ -----------------------------------------------------
    var rows = [];
    var isPayroll = formatCode === '11' || formatCode === '12';
    var count = isPayroll ? 8 : formatCode === '91' ? 7 : 10;

    for (var i = 0; i < count; i++) {
      var bank = BANKS[rnd(BANKS.length)];
      var rec = Zengin.blankRecord(format, 'data');
      set(rec, dataDef, 'bankCode', bank.code);
      set(rec, dataDef, 'bankName', bank.name);
      set(rec, dataDef, 'branchCode', bank.branch);
      set(rec, dataDef, 'branchName', bank.branchName);
      set(rec, dataDef, 'depositType', rnd(10) < 8 ? '1' : '2');
      set(rec, dataDef, 'accountNumber', String(1000000 + rnd(8999999)));
      set(rec, dataDef, 'newCode', i === 0 ? '1' : '0');

      if (isPayroll) {
        var emp = EMPLOYEES[i % EMPLOYEES.length];
        set(rec, dataDef, 'payeeName', emp.name);
        set(rec, dataDef, 'employeeNumber', emp.no);
        var base = formatCode === '12' ? 480000 + rnd(900) * 500 : 268000 + rnd(400) * 500;
        set(rec, dataDef, 'amount', String(base));
      } else if (formatCode === '91') {
        set(rec, dataDef, 'payerName', PAYEES[i % PAYEES.length]);
        set(rec, dataDef, 'amount', String((3 + rnd(180)) * 1000 + rnd(10) * 100));
        set(rec, dataDef, 'customerNumber', 'CUST' + Zengin.padLeft(String(i + 1), 6, '0'));
        if (opts.withResult) {
          set(rec, dataDef, 'resultCode', i === 3 ? '1' : i === 6 ? '2' : '0');
        }
      } else {
        set(rec, dataDef, 'payeeName', PAYEES[i % PAYEES.length]);
        set(rec, dataDef, 'amount', String((12 + rnd(880)) * 1000 + rnd(100) * 10));
        set(rec, dataDef, 'customerCode1', 'INV' + Zengin.padLeft(String(2401 + i), 7, '0'));
        set(rec, dataDef, 'transferKubun', '7');
      }
      rows.push(rec);
    }

    doc.records.splice(1, 0);
    doc.records = [doc.records[0]].concat(rows, doc.records.slice(1));
    Zengin.recalcTrailer(doc);

    // 預金口座振替の結果ファイルは、振替済／不能の内訳もトレーラーに設定する
    if (formatCode === '91' && opts.withResult) {
      var trailerDef = format.records.trailer;
      var done = 0, doneAmount = 0, fail = 0, failAmount = 0;
      rows.forEach(function (rec) {
        var amount = Zengin.toNumber(Zengin.readField(rec, dataDef.byKey.amount));
        if (Zengin.readField(rec, dataDef.byKey.resultCode) === '0') {
          done++; doneAmount += amount;
        } else {
          fail++; failAmount += amount;
        }
      });
      var trailer = Zengin.recordsOfKind(doc, 'trailer')[0];
      set(trailer, trailerDef, 'doneCount', String(done));
      set(trailer, trailerDef, 'doneAmount', String(doneAmount));
      set(trailer, trailerDef, 'failCount', String(fail));
      set(trailer, trailerDef, 'failAmount', String(failAmount));
    }

    return Zengin.serialize(doc, { encoding: 'shift_jis', lineEnding: 'CRLF' });
  }

  var CATALOG = [
    { code: '21', label: '総合振込', note: '取引先 10 件への支払データ' },
    { code: '11', label: '給与振込', note: '従業員 8 名分の給与データ' },
    { code: '12', label: '賞与振込', note: '従業員 8 名分の賞与データ' },
    { code: '91', label: '預金口座振替', note: '得意先 7 件の引落データ' },
    { code: '91', label: '預金口座振替（結果）', note: '振替結果コード付きの返却データ', withResult: true }
  ];

  global.ZenginSamples = { build: build, CATALOG: CATALOG, BANKS: BANKS };
})(typeof window !== 'undefined' ? window : globalThis);

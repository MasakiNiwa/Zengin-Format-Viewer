/*!
 * samples.js - 動作確認用のサンプル全銀データ
 *
 * 銀行番号・銀行名は公開されている統一金融機関コードを用いていますが、
 * 口座番号・氏名・金額はすべて架空のものです。
 */
(function (global) {
  'use strict';

  var Zengin = global.Zengin;
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
    { name: 'ﾔﾏﾀﾞ ﾀﾛｳ', no: '101', section: '10' },
    { name: 'ｻﾄｳ ﾊﾅｺ', no: '102', section: '10' },
    { name: 'ｽｽﾞｷ ｼﾞﾛｳ', no: '205', section: '20' },
    { name: 'ﾀｶﾊｼ ﾐｻｷ', no: '312', section: '30' },
    { name: 'ｲﾄｳ ｹﾝｲﾁ', no: '318', section: '30' },
    { name: 'ﾜﾀﾅﾍﾞ ﾕｷ', no: '404', section: '40' },
    { name: 'ﾅｶﾑﾗ ｿｳﾀ', no: '417', section: '40' },
    { name: 'ｺﾊﾞﾔｼ ｱｵｲ', no: '520', section: '50' }
  ];

  var OWN = {
    bankCode: '0009', bankName: 'ﾐﾂｲｽﾐﾄﾓ',
    branchCode: '227', branchName: 'ｼﾝｼﾞﾕｸ',
    companyCode: '1234567890', companyName: 'ｶ)ｻｸﾗｼﾖｳｼﾞ',
    accountNumber: '1234567'
  };

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

  /* ------------------------------------------------------------------ *
   * 振込依頼系（120 桁）
   * ------------------------------------------------------------------ */

  function buildSubmit(formatCode, opts) {
    var format = Formats.getFormat(formatCode);
    var doc = Zengin.createEmpty(formatCode);
    var rnd = seeded(20240415 + parseInt(formatCode, 10));
    var headerDef = format.records.header;
    var dataDef = format.records.data;

    var header = doc.records[0];
    set(header, headerDef, 'codeKubun', '0');
    set(header, headerDef, 'requesterCode', OWN.companyCode);
    set(header, headerDef, 'requesterName', OWN.companyName);
    set(header, headerDef, 'transferDate', formatCode === '11' ? '0425'
      : formatCode === '12' ? '0710' : formatCode === '91' ? '0527' : '0415');
    set(header, headerDef, 'bankCode', OWN.bankCode);
    set(header, headerDef, 'bankName', OWN.bankName);
    set(header, headerDef, 'branchCode', OWN.branchCode);
    set(header, headerDef, 'branchName', OWN.branchName);
    set(header, headerDef, 'depositType', '1');
    set(header, headerDef, 'accountNumber', OWN.accountNumber);

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
        set(rec, dataDef, 'sectionCode', emp.section);
        var base = formatCode === '12' ? 480000 + rnd(900) * 500 : 268000 + rnd(400) * 500;
        set(rec, dataDef, 'amount', String(base));
      } else if (formatCode === '91') {
        set(rec, dataDef, 'payerName', PAYEES[i % PAYEES.length]);
        set(rec, dataDef, 'amount', String((3 + rnd(180)) * 1000 + rnd(10) * 100));
        set(rec, dataDef, 'customerNumber', String(20240001 + i));
        set(rec, dataDef, 'resultCode', opts.withResult ? (i === 3 ? '1' : i === 6 ? '2' : '0') : '0');
      } else {
        set(rec, dataDef, 'payeeName', PAYEES[i % PAYEES.length]);
        set(rec, dataDef, 'amount', String((12 + rnd(880)) * 1000 + rnd(100) * 10));
        set(rec, dataDef, 'customerCode1', String(2401000000 + i + 1));
        set(rec, dataDef, 'transferKubun', '7');
      }
      rows.push(rec);
    }

    doc.records = [doc.records[0]].concat(rows, doc.records.slice(1));
    Zengin.recalcTrailer(doc);

    if (formatCode === '91' && opts.withResult) {
      var trailerDef = format.records.trailer;
      var done = 0, doneAmount = 0, fail = 0, failAmount = 0;
      rows.forEach(function (rec) {
        var amount = Zengin.toNumber(Zengin.readField(rec, dataDef.byKey.amount));
        if (Zengin.readField(rec, dataDef.byKey.resultCode) === '0') { done++; doneAmount += amount; }
        else { fail++; failAmount += amount; }
      });
      var trailer = Zengin.recordsOfKind(doc, 'trailer')[0];
      set(trailer, trailerDef, 'doneCount', String(done));
      set(trailer, trailerDef, 'doneAmount', String(doneAmount));
      set(trailer, trailerDef, 'failCount', String(fail));
      set(trailer, trailerDef, 'failAmount', String(failAmount));
    }
    return doc;
  }

  /* ------------------------------------------------------------------ *
   * 照会・通知系（200 桁）
   * ------------------------------------------------------------------ */

  /** 振込入金通知（01）。フォーマット A / B を切り替えられる。 */
  function buildFurikomiNyukin(opts) {
    var base = Formats.getFormat('01');
    var format = Formats.withVariant(base, opts.variantKey || 'a');
    var rnd = seeded(20260415);
    var headerDef = format.records.header;
    var dataDef = format.records.data;
    var day = '060415';

    var header = Zengin.blankRecord(format, 'header');
    set(header, headerDef, 'codeKubun', '0');
    set(header, headerDef, 'createdDate', day);
    set(header, headerDef, 'periodFrom', day);
    set(header, headerDef, 'periodTo', day);
    set(header, headerDef, 'bankCode', OWN.bankCode);
    set(header, headerDef, 'bankName', OWN.bankName);
    set(header, headerDef, 'branchCode', OWN.branchCode);
    set(header, headerDef, 'branchName', OWN.branchName);
    set(header, headerDef, 'depositType', '1');
    set(header, headerDef, 'accountNumber', OWN.accountNumber);
    set(header, headerDef, 'accountName', OWN.companyName);

    var rows = [];
    for (var i = 0; i < 8; i++) {
      var bank = BANKS[rnd(BANKS.length)];
      var rec = Zengin.blankRecord(format, 'data');
      var amount = (35 + rnd(950)) * 1000 + rnd(100) * 10;
      set(rec, dataDef, 'inquiryNumber', String(i + 1));
      set(rec, dataDef, 'valueDate', day);
      set(rec, dataDef, 'startDate', day);
      if (format.variantKey === 'b') {
        set(rec, dataDef, 'amount1', '0');
        set(rec, dataDef, 'billAmount1', '0');
        set(rec, dataDef, 'amount2', String(amount * 1000));
        set(rec, dataDef, 'billAmount2', '0');
      } else {
        set(rec, dataDef, 'amount', String(amount));
        set(rec, dataDef, 'billAmount', '0');
      }
      set(rec, dataDef, 'remitterCode', String(70000000 + i * 137));
      set(rec, dataDef, 'remitterName', PAYEES[i % PAYEES.length]);
      set(rec, dataDef, 'originBankName', bank.name);
      set(rec, dataDef, 'originBranchName', bank.branchName);
      set(rec, dataDef, 'edi', i % 3 === 0 ? 'ｾｲｷﾕｳ' + (2401 + i) : '');
      rows.push(rec);
    }

    var trailer = Zengin.blankRecord(format, 'trailer');
    var end = Zengin.blankRecord(format, 'end');
    var doc = makeDoc(format, [header].concat(rows, [trailer, end]));
    Zengin.recalcTrailer(doc);
    return doc;
  }

  /** 入出金取引明細（03・普通預金）。 */
  function buildNyushukkin() {
    var base = Formats.getFormat('03');
    var format = Formats.withVariant(base, 'liquid');
    var rnd = seeded(20260501);
    var headerDef = format.records.header;
    var dataDef = format.records.data;
    var trailerDef = format.records.trailer;
    var opening = 8452000;

    var header = Zengin.blankRecord(format, 'header');
    set(header, headerDef, 'codeKubun', '0');
    set(header, headerDef, 'createdDate', '060501');
    set(header, headerDef, 'periodFrom', '060401');
    set(header, headerDef, 'periodTo', '060430');
    set(header, headerDef, 'bankCode', OWN.bankCode);
    set(header, headerDef, 'bankName', OWN.bankName);
    set(header, headerDef, 'branchCode', OWN.branchCode);
    set(header, headerDef, 'branchName', OWN.branchName);
    set(header, headerDef, 'reserved', '0');
    set(header, headerDef, 'depositType', '1');
    set(header, headerDef, 'accountNumber', OWN.accountNumber);
    set(header, headerDef, 'accountName', OWN.companyName);
    set(header, headerDef, 'overdraftKubun', '1');
    set(header, headerDef, 'passbookKubun', '1');
    set(header, headerDef, 'openingBalance', String(opening));

    var rows = [];
    var balance = opening;
    for (var i = 0; i < 12; i++) {
      var isIn = i % 3 !== 2;
      var bank = BANKS[rnd(BANKS.length)];
      var rec = Zengin.blankRecord(format, 'data');
      var amount = isIn ? (40 + rnd(600)) * 1000 : (20 + rnd(300)) * 1000;
      var day = '0604' + String(2 + i * 2).padStart(2, '0');
      set(rec, dataDef, 'inquiryNumber', String(i + 1));
      set(rec, dataDef, 'valueDate', day);
      set(rec, dataDef, 'paymentDate', day);
      set(rec, dataDef, 'inOutKubun', isIn ? '1' : '2');
      set(rec, dataDef, 'txKind', isIn ? '11' : '14');
      set(rec, dataDef, 'amount', String(amount));
      set(rec, dataDef, 'billAmount', '0');
      set(rec, dataDef, 'branchCode', OWN.branchCode);
      if (isIn) {
        set(rec, dataDef, 'remitterCode', String(70000000 + i * 91));
        set(rec, dataDef, 'remitterName', PAYEES[i % PAYEES.length]);
        set(rec, dataDef, 'originBankName', bank.name);
        set(rec, dataDef, 'originBranchName', bank.branchName);
      } else {
        set(rec, dataDef, 'summary', 'ﾌﾘｶｴ');
      }
      balance += isIn ? amount : -amount;
      rows.push(rec);
    }

    var trailer = Zengin.blankRecord(format, 'trailer');
    set(trailer, trailerDef, 'overdraftKubun', '1');
    set(trailer, trailerDef, 'closingBalance', String(balance));
    var end = Zengin.blankRecord(format, 'end');
    var endDef = format.records.end;
    var doc = makeDoc(format, [header].concat(rows, [trailer, end]));
    Zengin.recalcTrailer(doc);
    set(end, endDef, 'recordTotal', String(doc.records.length));
    set(end, endDef, 'accountTotal', '1');
    return doc;
  }

  /** 残高通知（04）。支店ごとにヘッダーを繰り返す構成を含む。 */
  function buildZandaka() {
    var format = Formats.getFormat('04');
    var headerDef = format.records.header;
    var dataDef = format.records.data;
    var records = [];
    var branches = [
      { code: '227', name: 'ｼﾝｼﾞﾕｸ', accounts: [
        { type: '1', number: '1234567', name: OWN.companyName, balance: 8452000, prev: 8100000 },
        { type: '2', number: '7654321', name: OWN.companyName, balance: 12500000, prev: 12500000 }
      ] },
      { code: '441', name: 'ｵｵｻｶｴｲｷﾞﾖｳﾌﾞ', accounts: [
        { type: '1', number: '2345678', name: 'ｶ)ｻｸﾗｼﾖｳｼﾞ ｵｵｻｶｼﾃﾝ', balance: 3280500, prev: 3455000 },
        { type: '6', number: '9012345', name: OWN.companyName, balance: 20000000, prev: 20000000 }
      ] }
    ];

    branches.forEach(function (branch) {
      var header = Zengin.blankRecord(format, 'header');
      set(header, headerDef, 'noticeKubun', '1');
      set(header, headerDef, 'codeKubun', '0');
      set(header, headerDef, 'createdDate', '060501');
      set(header, headerDef, 'requesterCode', OWN.companyCode);
      set(header, headerDef, 'requesterName', OWN.companyName);
      set(header, headerDef, 'bankCode', OWN.bankCode);
      set(header, headerDef, 'bankName', OWN.bankName);
      set(header, headerDef, 'branchCode', branch.code);
      set(header, headerDef, 'branchName', branch.name);
      records.push(header);

      branch.accounts.forEach(function (account) {
        var rec = Zengin.blankRecord(format, 'data');
        set(rec, dataDef, 'baseDate', '060430');
        set(rec, dataDef, 'baseTime', '1800');
        set(rec, dataDef, 'branchCode', branch.code);
        set(rec, dataDef, 'reserved', '0');
        set(rec, dataDef, 'depositType', account.type);
        set(rec, dataDef, 'accountNumber', account.number);
        set(rec, dataDef, 'accountName', account.name);
        set(rec, dataDef, 'balanceKubun', '1');
        set(rec, dataDef, 'balance', String(account.balance));
        set(rec, dataDef, 'billBalance', '0');
        set(rec, dataDef, 'overdraftLimit', '0');
        set(rec, dataDef, 'payableKubun', '1');
        set(rec, dataDef, 'payableBalance', String(account.balance));
        set(rec, dataDef, 'prevKubun', '1');
        set(rec, dataDef, 'prevBalance', String(account.prev));
        set(rec, dataDef, 'lastTxDate', '060428');
        records.push(rec);
      });

      records.push(Zengin.blankRecord(format, 'trailer'));
    });

    var end = Zengin.blankRecord(format, 'end');
    records.push(end);
    var doc = makeDoc(format, records);
    Zengin.recalcTrailer(doc);
    Zengin.setField(end, format.records.end.byKey.recordTotal, String(doc.records.length));
    return doc;
  }

  function makeDoc(format, records) {
    return {
      fileName: '', encoding: 'shift_jis', encodingDetection: null,
      lineEnding: 'CRLF', recordLength: format.recordLength, format: format,
      detectedTypeCode: format.code, formatOverridden: false,
      records: records, notices: [], variantKey: format.variantKey || null, byteLength: 0
    };
  }

  /**
   * サンプルデータを組み立て、全銀固定長のバイト列として返す。
   * @param {string} formatCode 種別コード
   * @param {{withResult?:boolean, variantKey?:string}} [options]
   */
  function build(formatCode, options) {
    var opts = options || {};
    var doc;
    if (formatCode === '01') doc = buildFurikomiNyukin(opts);
    else if (formatCode === '03') doc = buildNyushukkin();
    else if (formatCode === '04') doc = buildZandaka();
    else doc = buildSubmit(formatCode, opts);
    return Zengin.serialize(doc, { encoding: 'shift_jis', lineEnding: 'CRLF' });
  }

  var CATALOG = [
    { code: '21', label: '総合振込', note: '取引先 10 件への支払データ', group: '銀行へ提出' },
    { code: '11', label: '給与振込', note: '従業員 8 名分の給与データ', group: '銀行へ提出' },
    { code: '12', label: '賞与振込', note: '従業員 8 名分の賞与データ', group: '銀行へ提出' },
    { code: '91', label: '預金口座振替', note: '得意先 7 件の引落データ', group: '銀行へ提出' },
    { code: '91', label: '預金口座振替（結果）', note: '振替結果コード付きの返却データ', group: '銀行へ提出', withResult: true },
    { code: '01', label: '振込入金通知', note: '自社口座への入金 8 件', group: '銀行から受取' },
    { code: '03', label: '入出金取引明細', note: '普通預金 1 か月分 12 件', group: '銀行から受取' },
    { code: '04', label: '残高通知', note: '2 支店 4 口座の残高', group: '銀行から受取' }
  ];

  global.ZenginSamples = { build: build, CATALOG: CATALOG, BANKS: BANKS };
})(typeof window !== 'undefined' ? window : globalThis);

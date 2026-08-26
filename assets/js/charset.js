/*!
 * charset.js - 全銀フォーマット用 文字コード処理
 *
 * 全銀協制定フォーマットは JIS X 0201（Shift_JIS の 1 バイト領域）で構成される
 * 「1 バイト = 1 文字」の固定長データです。このモジュールでは
 *
 *   - バイト列 <-> 文字列 の 1:1 変換（バイト位置がずれない）
 *   - 未定義バイトの無損失保持（私用領域へ退避し、書き出し時に完全復元）
 *   - 全角/ひらがな/小文字 から 全銀で使える半角文字への正規化
 *
 * を提供します。外部ライブラリに依存しません。
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * JIS X 0201 テーブル
   * ------------------------------------------------------------------ */

  // 0xA1〜0xDF に割り当てられた半角カナ（63 文字）
  var HANKAKU_KANA =
    '｡｢｣､･ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝﾞﾟ';

  // 未定義バイトを退避させる私用領域の先頭。0xE000 + バイト値 で保持するため
  // どんなバイト列でも読み込み -> 書き出しでバイト単位に完全一致する。
  var PUA_BASE = 0xe000;

  var byteToChar = new Array(256);
  var charToByte = Object.create(null);

  (function buildTables() {
    var i;
    for (i = 0; i < 256; i++) {
      byteToChar[i] = String.fromCharCode(PUA_BASE + i);
    }
    // 制御文字はそのまま（改行判定などで使う）
    byteToChar[0x09] = '\t';
    byteToChar[0x0a] = '\n';
    byteToChar[0x0d] = '\r';
    // 0x20〜0x7E: ASCII。ただし JIS X 0201 では 0x5C が円記号、0x7E が上線。
    for (i = 0x20; i <= 0x7e; i++) {
      byteToChar[i] = String.fromCharCode(i);
    }
    byteToChar[0x5c] = '¥'; // ¥ YEN SIGN
    byteToChar[0x7e] = '‾'; // ‾ OVERLINE
    // 0xA1〜0xDF: 半角カナ
    for (i = 0; i < HANKAKU_KANA.length; i++) {
      byteToChar[0xa1 + i] = HANKAKU_KANA.charAt(i);
    }

    for (i = 0; i < 256; i++) {
      var ch = byteToChar[i];
      if (charToByte[ch] === undefined) charToByte[ch] = i;
    }
    // 入力ゆれの吸収（書き出し時に正規のバイトへ寄せる）
    charToByte['\\'] = 0x5c; // バックスラッシュ -> 円記号のバイト
    charToByte['￥'] = 0x5c; // ￥ 全角円記号
    charToByte['~'] = 0x7e;
    charToByte['～'] = 0x7e; // ～ 全角チルダ
  })();

  function isPrivateUse(ch) {
    var c = ch.charCodeAt(0);
    return c >= PUA_BASE && c <= PUA_BASE + 0xff;
  }

  /** 私用領域に退避した文字から元のバイト値を返す（通常文字なら -1）。 */
  function privateUseByte(ch) {
    return isPrivateUse(ch) ? ch.charCodeAt(0) - PUA_BASE : -1;
  }

  /* ------------------------------------------------------------------ *
   * コーデック
   * ------------------------------------------------------------------ */

  /**
   * JIS X 0201（Shift_JIS 1 バイト領域）コーデック。
   * 1 バイト = 1 文字。全銀フォーマットの桁数はこの単位で数える。
   */
  var jisx0201 = {
    id: 'shift_jis',
    label: 'Shift_JIS (JIS X 0201)',
    bytesPerUnit: 1,
    decode: function (bytes) {
      var out = '';
      var chunk = [];
      for (var i = 0; i < bytes.length; i++) {
        chunk.push(byteToChar[bytes[i]]);
        if (chunk.length === 4096) {
          out += chunk.join('');
          chunk.length = 0;
        }
      }
      return out + chunk.join('');
    },
    encode: function (text) {
      var bytes = new Uint8Array(text.length);
      for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        var b = charToByte[ch];
        if (b === undefined) {
          var pua = privateUseByte(ch);
          b = pua >= 0 ? pua : 0x20; // 変換不能はスペースに置換
        }
        bytes[i] = b;
      }
      return bytes;
    }
  };

  /**
   * UTF-8 コーデック。近年 UTF-8 で受け渡しする実務もあるため用意。
   * この場合は「1 文字 = 1 桁」として扱う（半角カナも 1 桁）。
   */
  var utf8 = {
    id: 'utf-8',
    label: 'UTF-8',
    bytesPerUnit: null,
    decode: function (bytes) {
      return new TextDecoder('utf-8').decode(bytes);
    },
    encode: function (text) {
      return new TextEncoder().encode(text);
    }
  };

  var CODECS = { 'shift_jis': jisx0201, 'utf-8': utf8 };

  function getCodec(id) {
    return CODECS[id] || jisx0201;
  }

  /* ------------------------------------------------------------------ *
   * 文字コード自動判定
   * ------------------------------------------------------------------ */

  /** バイト列が正しい UTF-8 として解釈できるか。 */
  function isValidUtf8(bytes) {
    var i = 0;
    var n = bytes.length;
    var sawMultiByte = false;
    while (i < n) {
      var b = bytes[i];
      if (b < 0x80) { i++; continue; }
      var need;
      if (b >= 0xc2 && b <= 0xdf) need = 1;
      else if (b >= 0xe0 && b <= 0xef) need = 2;
      else if (b >= 0xf0 && b <= 0xf4) need = 3;
      else return false;
      if (i + need >= n) return false; // 末尾で切れている
      for (var k = 1; k <= need; k++) {
        var t = bytes[i + k];
        if (t === undefined || t < 0x80 || t > 0xbf) return false;
      }
      sawMultiByte = true;
      i += need + 1;
    }
    return sawMultiByte;
  }

  /**
   * 全銀ファイルの文字コードを推定する。
   * @returns {{codec:string, confidence:'certain'|'likely'|'guess', reason:string}}
   */
  function detectEncoding(bytes) {
    var hasHighByte = false;
    var kanaOnlyHigh = true;
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if (b >= 0x80) {
        hasHighByte = true;
        if (b < 0xa1 || b > 0xdf) kanaOnlyHigh = false;
      }
    }
    if (!hasHighByte) {
      return {
        codec: 'shift_jis',
        confidence: 'certain',
        reason: 'ASCII 範囲のみのため Shift_JIS / UTF-8 のどちらでも同一バイト列です。'
      };
    }
    if (kanaOnlyHigh) {
      return {
        codec: 'shift_jis',
        confidence: 'certain',
        reason: '0xA1〜0xDF（半角カナ）のみが使われており、全銀標準の Shift_JIS です。'
      };
    }
    if (isValidUtf8(bytes)) {
      return {
        codec: 'utf-8',
        confidence: 'likely',
        reason: 'UTF-8 のマルチバイト列として矛盾なく解釈できました。'
      };
    }
    return {
      codec: 'shift_jis',
      confidence: 'guess',
      reason: '全銀標準外のバイトを含みます。Shift_JIS として読み込みました。'
    };
  }

  /* ------------------------------------------------------------------ *
   * 全銀で使用できる文字
   * ------------------------------------------------------------------ */

  // 付録 1「使用文字一覧」（JIS の場合）に掲げられた記号
  var ZENGIN_SYMBOLS = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" + "'():+,¥-./?｢｣";
  // 大文字カナ・濁点・半濁点・長音（使用文字一覧に掲げられたカナ）
  var ZENGIN_KANA = 'ｦｰ' + 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ' + 'ﾞﾟ';
  // 使用文字一覧には無いが、実務のファイルで見かける文字（警告扱い）
  var ZENGIN_TOLERATED = 'ｧｨｩｪｫｬｭｮｯ｡､･';

  function toSet(text) {
    var set = Object.create(null);
    for (var i = 0; i < text.length; i++) set[text.charAt(i)] = true;
    return set;
  }

  var BASE_CHARSET = toSet(ZENGIN_SYMBOLS + ZENGIN_KANA);
  var TOLERATED_CHARSET = toSet(ZENGIN_TOLERATED);

  /**
   * 項目種別ごとの使用可能文字（付録 1 の注 1・注 3）。
   *   name   … 口座名・振込依頼人名・受取人名・預金者名・会社名・委託者名など
   *   branch … 店舗名（銀行名・支店名）
   *   edi    … EDI 情報
   * いずれも「カナ（ヲと小文字を除く）、濁点、半濁点」を含む。
   */
  var KANA_NO_WO = 'ｰ' + 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ' + 'ﾞﾟ';
  var UPPER_DIGIT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  var FIELD_CHARSETS = {
    name: {
      label: '口座名・氏名欄',
      set: toSet(KANA_NO_WO + UPPER_DIGIT + ' ()-.'),
      note: 'カナ（ヲと小文字を除く）・濁点・半濁点・英大文字・数字・スペース・記号 4 種類（ ( ) - . ）のみ'
    },
    branch: {
      label: '店舗名欄',
      set: toSet(KANA_NO_WO + UPPER_DIGIT + ' -'),
      note: 'カナ（ヲと小文字を除く）・濁点・半濁点・英大文字・数字・記号 1 種類（ - ）のみ'
    },
    edi: {
      label: 'EDI 情報欄',
      set: toSet(KANA_NO_WO + 'ｦ' + UPPER_DIGIT + ' ¥｢｣()-/.'),
      note: 'カナ（小文字を除く）・濁点・半濁点・英大文字・数字・スペース・記号 8 種類（ ¥ ｢ ｣ ( ) - / . ）のみ。カンマは区切り文字として使われるため使用しない'
    }
  };

  function isZenginChar(ch) {
    return BASE_CHARSET[ch] === true;
  }

  /** 使用文字一覧には無いが、読み込み自体は許容する文字か。 */
  function isToleratedChar(ch) {
    return TOLERATED_CHARSET[ch] === true;
  }

  /**
   * 項目の内容が、その項目種別で許された文字だけで構成されているか調べる。
   * @returns {{chars:string[], rule:object}|null} 違反があれば内容を返す
   */
  function checkFieldCharset(text, charClass) {
    var rule = FIELD_CHARSETS[charClass];
    if (!rule) return null;
    var bad = [];
    var seen = Object.create(null);
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === ' ' || rule.set[ch]) continue;
      if (seen[ch]) continue;
      seen[ch] = true;
      bad.push(ch);
    }
    return bad.length ? { chars: bad, rule: rule } : null;
  }

  /**
   * 文字列中の、全銀フォーマットで扱えない文字を列挙する。
   * 使用文字一覧には無いが実務で見かける文字（小文字カナなど）は含めない。
   */
  function findInvalidChars(text) {
    var found = [];
    var seen = Object.create(null);
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (isZenginChar(ch) || isToleratedChar(ch)) continue;
      var key = ch;
      if (seen[key]) continue;
      seen[key] = true;
      var pua = privateUseByte(ch);
      found.push({
        char: ch,
        index: i,
        byte: pua >= 0 ? pua : null,
        display: pua >= 0 ? '0x' + pua.toString(16).toUpperCase().padStart(2, '0') : ch
      });
    }
    return found;
  }

  /* ------------------------------------------------------------------ *
   * 全角 -> 半角 正規化
   * ------------------------------------------------------------------ */

  var KATAKANA_MAP = {
    'ァ': 'ｧ', 'ィ': 'ｨ', 'ゥ': 'ｩ', 'ェ': 'ｪ', 'ォ': 'ｫ',
    'ッ': 'ｯ', 'ャ': 'ｬ', 'ュ': 'ｭ', 'ョ': 'ｮ',
    'ア': 'ｱ', 'イ': 'ｲ', 'ウ': 'ｳ', 'エ': 'ｴ', 'オ': 'ｵ',
    'カ': 'ｶ', 'キ': 'ｷ', 'ク': 'ｸ', 'ケ': 'ｹ', 'コ': 'ｺ',
    'サ': 'ｻ', 'シ': 'ｼ', 'ス': 'ｽ', 'セ': 'ｾ', 'ソ': 'ｿ',
    'タ': 'ﾀ', 'チ': 'ﾁ', 'ツ': 'ﾂ', 'テ': 'ﾃ', 'ト': 'ﾄ',
    'ナ': 'ﾅ', 'ニ': 'ﾆ', 'ヌ': 'ﾇ', 'ネ': 'ﾈ', 'ノ': 'ﾉ',
    'ハ': 'ﾊ', 'ヒ': 'ﾋ', 'フ': 'ﾌ', 'ヘ': 'ﾍ', 'ホ': 'ﾎ',
    'マ': 'ﾏ', 'ミ': 'ﾐ', 'ム': 'ﾑ', 'メ': 'ﾒ', 'モ': 'ﾓ',
    'ヤ': 'ﾔ', 'ユ': 'ﾕ', 'ヨ': 'ﾖ',
    'ラ': 'ﾗ', 'リ': 'ﾘ', 'ル': 'ﾙ', 'レ': 'ﾚ', 'ロ': 'ﾛ',
    'ワ': 'ﾜ', 'ヲ': 'ｦ', 'ン': 'ﾝ',
    // 濁音・半濁音は 2 文字に展開
    'ガ': 'ｶﾞ', 'ギ': 'ｷﾞ', 'グ': 'ｸﾞ', 'ゲ': 'ｹﾞ', 'ゴ': 'ｺﾞ',
    'ザ': 'ｻﾞ', 'ジ': 'ｼﾞ', 'ズ': 'ｽﾞ', 'ゼ': 'ｾﾞ', 'ゾ': 'ｿﾞ',
    'ダ': 'ﾀﾞ', 'ヂ': 'ﾁﾞ', 'ヅ': 'ﾂﾞ', 'デ': 'ﾃﾞ', 'ド': 'ﾄﾞ',
    'バ': 'ﾊﾞ', 'ビ': 'ﾋﾞ', 'ブ': 'ﾌﾞ', 'ベ': 'ﾍﾞ', 'ボ': 'ﾎﾞ',
    'パ': 'ﾊﾟ', 'ピ': 'ﾋﾟ', 'プ': 'ﾌﾟ', 'ペ': 'ﾍﾟ', 'ポ': 'ﾎﾟ',
    'ヴ': 'ｳﾞ', 'ヷ': 'ﾜﾞ', 'ヺ': 'ｦﾞ',
    // 使用頻度の低いカナは近い字形へ寄せる
    'ヰ': 'ｲ', 'ヱ': 'ｴ', 'ヮ': 'ﾜ', 'ヵ': 'ｶ', 'ヶ': 'ｹ',
    // 記号
    'ー': 'ｰ', '・': '･', '、': '､', '。': '｡',
    '「': '｢', '」': '｣', '゛': 'ﾞ', '゜': 'ﾟ'
  };

  // 全銀で使えない記号を、実務で慣習的に使われる代替へ寄せる
  var SYMBOL_MAP = {
    '　': ' ',
    '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '―': '-',
    '−': '-', '－': '-', 'ヽ': '-',
    '〜': '-', '～': '-',
    '‘': "'", '’': "'", '“': '"', '”': '"',
    '￥': '¥', '＼': '¥',
    '〈': '(', '〉': ')', '【': '(', '】': ')',
    '（': '(', '）': ')'
  };

  /**
   * 全銀フォーマットで使える半角文字へ正規化する。
   * 全角英数記号 -> 半角、ひらがな -> 半角カナ、小文字 -> 大文字。
   */
  function normalize(text, options) {
    var opts = options || {};
    var upper = opts.upperCase !== false;
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var code = ch.charCodeAt(0);

      // ひらがな -> カタカナ
      if (code >= 0x3041 && code <= 0x3096) {
        ch = String.fromCharCode(code + 0x60);
        code = ch.charCodeAt(0);
      }
      // 全角カタカナ -> 半角カナ
      if (KATAKANA_MAP[ch]) {
        out.push(KATAKANA_MAP[ch]);
        continue;
      }
      // 全角英数記号 -> 半角
      if (code >= 0xff01 && code <= 0xff5e && !SYMBOL_MAP[ch]) {
        ch = String.fromCharCode(code - 0xfee0);
      }
      if (SYMBOL_MAP[ch]) ch = SYMBOL_MAP[ch];
      if (upper && ch >= 'a' && ch <= 'z') ch = ch.toUpperCase();
      out.push(ch);
    }
    return out.join('');
  }

  /* ------------------------------------------------------------------ *
   * 表示ユーティリティ
   * ------------------------------------------------------------------ */

  /** 画面表示用に、制御文字・未定義バイトを可視記号へ置き換える。 */
  function toDisplay(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (isPrivateUse(ch)) { out += '□'; continue; }
      var code = ch.charCodeAt(0);
      if (code < 0x20) { out += '·'; continue; }
      out += ch;
    }
    return out;
  }

  /** 使用文字一覧に無い「許容文字」を列挙する（警告用）。 */
  function findToleratedChars(text) {
    var found = [];
    var seen = Object.create(null);
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (!isToleratedChar(ch) || seen[ch]) continue;
      seen[ch] = true;
      found.push(ch);
    }
    return found;
  }

  global.ZenginCharset = {
    PUA_BASE: PUA_BASE,
    HANKAKU_KANA: HANKAKU_KANA,
    ZENGIN_SYMBOLS: ZENGIN_SYMBOLS,
    FIELD_CHARSETS: FIELD_CHARSETS,
    codecs: CODECS,
    getCodec: getCodec,
    detectEncoding: detectEncoding,
    isZenginChar: isZenginChar,
    isToleratedChar: isToleratedChar,
    checkFieldCharset: checkFieldCharset,
    findToleratedChars: findToleratedChars,
    isPrivateUse: isPrivateUse,
    privateUseByte: privateUseByte,
    findInvalidChars: findInvalidChars,
    normalize: normalize,
    toDisplay: toDisplay
  };
})(typeof window !== 'undefined' ? window : globalThis);

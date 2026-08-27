/*!
 * app.js - 全銀フォーマットビューア 画面制御
 */
(function () {
  'use strict';

  var Zengin = window.Zengin;
  var Charset = window.ZenginCharset;
  var Formats = window.ZenginFormats;
  var Samples = window.ZenginSamples;
  var Charts = window.ZenginCharts;
  var Help = window.ZenginHelp;

  /* ================================================================
     ユーティリティ
     ================================================================ */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /**
   * 要素を生成する。データ由来の文字列は必ず text で渡し、
   * innerHTML には自前の静的文字列しか渡さない。
   */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null || value === false) return;
        if (key === 'class') el.className = value;
        else if (key === 'text') el.textContent = value;
        else if (key === 'html') el.innerHTML = value;
        else if (key === 'dataset') Object.keys(value).forEach(function (d) { el.dataset[d] = value[d]; });
        else if (key.slice(0, 2) === 'on') el.addEventListener(key.slice(2).toLowerCase(), value);
        else if (value === true) el.setAttribute(key, '');
        else el.setAttribute(key, value);
      });
    }
    appendAll(el, children);
    return el;
  }

  function appendAll(parent, children) {
    if (children == null) return parent;
    (Array.isArray(children) ? children : [children]).forEach(function (child) {
      if (child == null || child === false) return;
      parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return parent;
  }

  function svg(path, size) {
    var ns = 'http://www.w3.org/2000/svg';
    var el = document.createElementNS(ns, 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('aria-hidden', 'true');
    if (size) { el.setAttribute('width', size); el.setAttribute('height', size); }
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', path);
    el.appendChild(p);
    return el;
  }

  var ICON = {
    check: 'M20 6 9 17l-5-5',
    alert: 'M12 8v5m0 3.2v.1M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    info: 'M12 16v-5m0-3.2v-.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    close: 'M18 6 6 18M6 6l12 12',
    trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7',
    plus: 'M12 5v14M5 12h14',
    copy: 'M9 9V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-4M5 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z',
    refresh: 'M20 11a8 8 0 0 0-13.7-5.7L4 7.5M4 4v3.5H7.5M4 13a8 8 0 0 0 13.7 5.7L20 16.5M20 20v-3.5h-3.5',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.35-4.35',
    arrow: 'M5 12h14m0 0-5-5m5 5-5 5',
    sort: 'M8 4v16m0 0-3-3m3 3 3-3M16 20V4m0 0-3 3m3-3 3 3'
  };

  function icon(path, cls) {
    var el = svg(path);
    el.setAttribute('class', cls || 'icon');
    return el;
  }

  function num(value) {
    return String(value == null ? 0 : value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * 固定長の原文を、フォントに依存せず 1 文字 = 1 桁で描画する。
   *
   * 等幅フォントでも半角カナの字送りは ASCII と一致しないことが多く、
   * そのまま流すと桁がずれてしまう。ASCII は等幅が保証されるためまとめて
   * 流し、それ以外の文字だけ幅 1ch の枠に入れて桁位置を固定する。
   */
  function appendFixedWidthText(parent, text) {
    var shown = Charset.toDisplay(text);
    var buffer = '';
    for (var i = 0; i < shown.length; i++) {
      var ch = shown.charAt(i);
      var code = ch.charCodeAt(0);
      if (code >= 0x20 && code <= 0x7e) { buffer += ch; continue; }
      if (buffer) { parent.appendChild(document.createTextNode(buffer)); buffer = ''; }
      parent.appendChild(h('span', { class: 'rc', text: ch }));
    }
    if (buffer) parent.appendChild(document.createTextNode(buffer));
    return parent;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  function timestamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate()) +
      '_' + p(d.getHours()) + p(d.getMinutes());
  }

  /* ---------------- トースト ---------------- */

  var TOAST_ICON = { ok: ICON.check, warn: ICON.alert, error: ICON.alert, info: ICON.info };

  function toast(title, detail, type) {
    var kind = type || 'info';
    var el = h('div', { class: 'toast type-' + kind, role: 'status' }, [
      icon(TOAST_ICON[kind] || ICON.info, ''),
      h('div', { class: 'toast-text' }, [
        h('strong', { text: title }),
        detail ? h('span', { text: detail }) : null
      ])
    ]);
    $('#toast-host').appendChild(el);
    setTimeout(function () {
      el.classList.add('is-leaving');
      setTimeout(function () { el.remove(); }, 200);
    }, kind === 'error' ? 6500 : 3800);
  }

  /* ---------------- 確認ダイアログ ---------------- */

  function confirmAction(message, okLabel) {
    return new Promise(function (resolve) {
      var dialog = $('#confirm-dialog');
      $('#confirm-message').textContent = message;
      $('#confirm-ok').textContent = okLabel || '実行';
      var done = function (result) {
        $('#confirm-ok').onclick = null;
        $('#confirm-cancel').onclick = null;
        dialog.onclose = null;
        if (dialog.open) dialog.close();
        resolve(result);
      };
      $('#confirm-ok').onclick = function () { done(true); };
      $('#confirm-cancel').onclick = function () { done(false); };
      dialog.onclose = function () { resolve(false); };
      dialog.showModal();
    });
  }

  /**
   * 書き出し前に、参考ファイルである旨を確認してもらう。
   * @param {{title:string, meta:Array<[string,string]>}} info
   */
  function confirmExport(info) {
    return new Promise(function (resolve) {
      var dialog = $('#export-dialog');
      var counts = Zengin.countByLevel(state.issues);

      var status = $('#export-status');
      var chips = [];
      if (counts.error) {
        chips.push(h('span', { class: 'chip chip-err' },
          [icon(ICON.alert), 'エラー ' + counts.error + ' 件が未解決です']));
      }
      if (counts.warn) {
        chips.push(h('span', { class: 'chip chip-warn' },
          [icon(ICON.alert), '警告 ' + counts.warn + ' 件']));
      }
      if (!chips.length) {
        chips.push(h('span', { class: 'chip chip-ok' }, [icon(ICON.check), '検証で問題は見つかりませんでした']));
      }
      status.replaceChildren(h('div', {
        class: 'issue-summary', style: 'margin-bottom:12px'
      }, chips));

      var diff = computeDiff();
      if (diff.total) {
        status.appendChild(h('div', {
          class: 'issue-summary', style: 'margin-bottom:12px'
        }, [
          h('span', { class: 'chip chip-info' }, ['読み込み後の変更 ' + num(diff.total) + ' 件']),
          h('button', {
            type: 'button', class: 'btn btn-sm',
            onclick: function () { dialog.close(); openDiff(); }
          }, ['変更内容を見る', icon(ICON.arrow)])
        ]));
      }

      var meta = $('#export-meta');
      meta.replaceChildren();
      info.meta.forEach(function (row) {
        meta.appendChild(h('dt', { text: row[0] }));
        meta.appendChild(h('dd', { text: row[1] }));
      });

      $('#export-ok').textContent = counts.error
        ? 'エラーを承知のうえ書き出す'
        : '確認のうえ書き出す';

      var done = function (result) {
        $('#export-ok').onclick = null;
        $('#export-cancel').onclick = null;
        dialog.onclose = null;
        if (dialog.open) dialog.close();
        resolve(result);
      };
      $('#export-ok').onclick = function () { done(true); };
      $('#export-cancel').onclick = function () { done(false); };
      $('#diff-close').onclick = function () { $('#diff-dialog').close(); };
      dialog.onclose = function () { resolve(false); };
      dialog.showModal();
    });
  }

  /* ---------------- ダウンロード ---------------- */

  function download(bytes, fileName, mime) {
    var blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: fileName });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ================================================================
     状態
     ================================================================ */

  var state = {
    doc: null,
    rawBytes: null,
    baseline: null,     // 読み込み直後の内容（差分表示用・メモリ内のみ）
    activeTab: 'summary',
    issues: [],
    issuesByRecord: {},
    dirty: false,
    readonly: true,     // 既定は閲覧専用。明示的に切り替えたときだけ編集できる
    // データ明細
    page: 1,
    pageSize: 50,
    search: '',
    showDummy: false,
    autoHankaku: true,
    sortKey: null,
    sortDir: 1,
    groupIndex: null,   // null = すべてのグループ
    selected: null,      // { recordId, fieldKey }
    // 生データ
    rawPage: 1,
    rawSelectedId: null
  };

  var MAX_ISSUES_SHOWN = 400;

  /* ================================================================
     テーマ
     ================================================================ */

  var THEME_KEY = 'zengin-viewer-theme';

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 保存不可でも動作に影響なし */ }
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
    if (!saved) {
      saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = saved;
  }

  /* ================================================================
     ファイル読み込み
     ================================================================ */

  function loadBytes(bytes, fileName, options) {
    var opts = options || {};
    try {
      var doc = Zengin.parse(bytes, {
        fileName: fileName,
        encoding: opts.encoding,
        formatCode: opts.formatCode,
        variantKey: opts.variantKey
      });
      state.doc = doc;
      state.rawBytes = bytes;
      state.dirty = false;
      state.readonly = true;
      history.undo.length = 0;
      history.redo.length = 0;
      state.baseline = snapshot(doc);
      state.page = 1;
      state.rawPage = 1;
      state.search = '';
      state.sortKey = null;
      state.groupIndex = Zengin.hasMixedVariants(doc) ? 0 : null;
      state.selected = null;
      state.rawSelectedId = null;
      document.body.dataset.view = 'workspace';
      $('#workspace').hidden = false;
      revalidate();
      setTab(state.activeTab === 'welcome' ? 'summary' : state.activeTab);
      renderAll();

      var counts = Zengin.countByLevel(state.issues);
      if (counts.error) {
        toast(doc.format.name + ' として読み込みました',
          'エラー ' + counts.error + ' 件が見つかりました。「検証」タブをご確認ください。', 'warn');
      } else {
        toast(doc.format.name + ' として読み込みました',
          Zengin.summarize(doc).count + ' 件のデータレコード' +
          (counts.warn ? '（警告 ' + counts.warn + ' 件）' : ''), 'ok');
      }
    } catch (err) {
      console.error(err);
      toast('読み込みに失敗しました', String(err && err.message ? err.message : err), 'error');
    }
  }

  function readFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      loadBytes(new Uint8Array(reader.result), file.name);
    };
    reader.onerror = function () {
      toast('ファイルを読み取れませんでした', file.name, 'error');
    };
    reader.readAsArrayBuffer(file);
  }

  function guardUnsaved(action) {
    if (!state.dirty) return Promise.resolve(true);
    return confirmAction('編集中の内容は破棄されます。よろしいですか？', action || '破棄して続行');
  }

  /* ================================================================
     変更履歴（元に戻す／やり直す）

     レコードの参照をそのまま保持し、変わった内容だけを控える。
     大きなファイルでも、1 操作あたりの控えは「並び順の配列＋変わった本文」で済む。
     ================================================================ */

  var history = { undo: [], redo: [], limit: 50 };

  /** 編集できる状態か確かめる。閲覧モードなら理由を伝えて止める。 */
  function requireEditable() {
    if (!state.readonly) return true;
    toast('いまは閲覧モードです', '内容を変更するには、画面上部の「編集を有効にする」を押してください。', 'info');
    return false;
  }

  /**
   * 文書を変更する操作を、元に戻せる形で実行する。
   * @param {string} label   履歴に残す操作名
   * @param {Function} fn    実際に文書を書き換える処理
   * @returns {boolean} 変更があったか
   */
  function applyChange(label, fn) {
    var doc = state.doc;
    if (!doc) return false;
    var beforeOrder = doc.records.slice();
    var beforeTexts = doc.records.map(function (rec) { return rec.text; });

    fn();

    var patch = buildPatch(doc, beforeOrder, beforeTexts);
    if (!patch) return false;
    history.undo.push({ label: label, patch: patch });
    if (history.undo.length > history.limit) history.undo.shift();
    history.redo.length = 0;
    markDirty();
    return true;
  }

  function buildPatch(doc, beforeOrder, beforeTexts) {
    var orderChanged = beforeOrder.length !== doc.records.length ||
      beforeOrder.some(function (rec, i) { return doc.records[i] !== rec; });
    var texts = [];
    beforeOrder.forEach(function (rec, i) {
      if (rec.text !== beforeTexts[i]) texts.push({ rec: rec, text: beforeTexts[i] });
    });
    if (!orderChanged && !texts.length) return null;
    return { order: beforeOrder, texts: texts };
  }

  /** パッチを適用し、元に戻すための逆パッチを返す。 */
  function revertPatch(patch) {
    var doc = state.doc;
    var currentOrder = doc.records.slice();
    var currentTexts = patch.texts.map(function (entry) {
      return { rec: entry.rec, text: entry.rec.text };
    });
    doc.records = patch.order.slice();
    patch.texts.forEach(function (entry) { entry.rec.text = entry.text; });
    return { order: currentOrder, texts: currentTexts };
  }

  function stepHistory(from, to, verb) {
    if (!state.doc || !from.length) {
      toast(verb + 'できる操作はありません', null, 'info');
      return;
    }
    var entry = from.pop();
    to.push({ label: entry.label, patch: revertPatch(entry.patch) });
    state.selected = null;
    markDirty();
    renderAll();
    toast(verb + 'ました', entry.label, 'ok');
  }

  function undoChange() { stepHistory(history.undo, history.redo, '元に戻し'); }
  function redoChange() { stepHistory(history.redo, history.undo, 'やり直し'); }

  /** 読み込んだ時点の内容に戻す。 */
  function restoreBaseline() {
    if (!state.doc || !state.baseline) return;
    if (!computeDiff().total) {
      toast('変更はありません', '読み込んだ時点のままです。', 'info');
      return;
    }
    confirmAction('読み込んだ時点の内容に戻します。\nこれまでの編集はすべて取り消されます。よろしいですか？',
      '読み込み時点へ戻す').then(function (ok) {
      if (!ok) return;
      applyChange('読み込み時点へ戻す', function () {
        var byId = Object.create(null);
        state.doc.records.forEach(function (rec) { byId[rec.id] = rec; });
        state.doc.records = state.baseline.records.map(function (saved) {
          var rec = byId[saved.id] || Zengin.makeRecord(saved.text, saved.kind);
          rec.text = saved.text;
          rec.kind = saved.kind;
          return rec;
        });
      });
      state.selected = null;
      renderAll();
      toast('読み込み時点へ戻しました', null, 'ok');
    });
  }

  /* ================================================================
     読み込み後の変更内容（差分）

     読み込み直後の内容をメモリ上に控えておき、現在の状態と突き合わせる。
     機微な情報を含むため、ブラウザの外に出さず、保存もしない。
     ================================================================ */

  function snapshot(doc) {
    return {
      records: doc.records.map(function (rec) {
        return { id: rec.id, kind: rec.kind, text: rec.text };
      }),
      order: doc.records.map(function (rec) { return rec.id; })
    };
  }

  /** 差分の見出しに使うレコード名。 */
  function recordCaption(doc, kind, number) {
    var def = doc.format.records[kind];
    var label = def ? def.label : 'レコード';
    return number != null ? label + '（第 ' + number + ' レコード）' : label;
  }

  /**
   * 読み込み直後と現在の状態を比べる。
   * レコードは読み込み時に割り振った ID で対応づけるため、
   * 並べ替えや行の増減があっても取り違えない。
   */
  function computeDiff() {
    var empty = { changed: [], added: [], removed: [], reordered: false, total: 0 };
    if (!state.doc || !state.baseline) return empty;

    var doc = state.doc;
    var before = Object.create(null);
    state.baseline.records.forEach(function (rec, index) {
      before[rec.id] = { rec: rec, index: index };
    });
    var currentIds = Object.create(null);
    var defs = Zengin.dataDefMap(doc);

    var changed = [];
    var added = [];
    doc.records.forEach(function (rec, index) {
      currentIds[rec.id] = true;
      var origin = before[rec.id];
      if (!origin) {
        added.push({ record: rec, index: index, kind: rec.kind });
        return;
      }
      if (origin.rec.text === rec.text) return;

      var def = rec.kind === 'data'
        ? (defs[rec.id] || doc.format.records.data)
        : doc.format.records[rec.kind];
      var fields = [];
      if (def) {
        def.fields.forEach(function (field) {
          var a = Zengin.rawField(origin.rec, field);
          var b = Zengin.rawField(rec, field);
          if (a !== b) fields.push({ field: field, before: a, after: b });
        });
      }
      changed.push({
        record: rec, index: index, kind: rec.kind, fields: fields,
        beforeText: origin.rec.text, afterText: rec.text
      });
    });

    var removed = [];
    state.baseline.records.forEach(function (rec, index) {
      if (!currentIds[rec.id]) removed.push({ record: rec, originalIndex: index, kind: rec.kind });
    });

    // 残っているレコードの並びが変わっていないか
    var survivingBefore = state.baseline.order.filter(function (id) { return currentIds[id]; });
    var survivingNow = doc.records
      .filter(function (rec) { return before[rec.id]; })
      .map(function (rec) { return rec.id; });
    var reordered = survivingBefore.join(',') !== survivingNow.join(',');

    var fieldChanges = changed.reduce(function (sum, item) {
      return sum + (item.fields.length || 1);
    }, 0);
    return {
      changed: changed, added: added, removed: removed, reordered: reordered,
      fieldChanges: fieldChanges,
      total: fieldChanges + added.length + removed.length + (reordered ? 1 : 0)
    };
  }

  var MAX_DIFF_SHOWN = 200;

  /** 差分ダイアログを開く。 */
  function openDiff() {
    renderDiff();
    $('#diff-dialog').showModal();
  }

  function diffValue(text) {
    return '[' + Charset.toDisplay(text) + ']';
  }

  /** 変更前後の値を、項目の性質に合わせて読みやすく表す。 */
  function diffFieldValue(field, raw) {
    var shown = Zengin.displayValue({ text: raw }, Object.assign({}, field, { pos: 1, end: field.len }));
    if (field.format === 'amount' || field.format === 'count') {
      return { text: shown === '' ? '（未入力）' : shown + (field.format === 'amount' ? ' 円' : ' 件'), raw: raw };
    }
    if (field.format === 'mmdd' || field.format === 'yymmdd' || field.format === 'hhmm') {
      return { text: shown === '' ? '（未入力）' : shown, raw: raw };
    }
    return { text: diffValue(raw), raw: raw };
  }

  /** レコードの中身を、値の入っている項目だけで要約する。 */
  function summarizeRecord(def, text) {
    if (!def) return null;
    var record = { text: text };
    var parts = [];
    def.fields.forEach(function (field) {
      if (field.dummy || field.fixed != null) return;
      var value = Zengin.readField(record, field);
      if (value === '') return;
      parts.push(field.label + '：' + Zengin.displayValue(record, field));
    });
    return parts.length ? parts.join(' / ') : null;
  }

  function renderDiff() {
    var body = $('#diff-body');
    var diff = computeDiff();

    if (!diff.total) {
      body.replaceChildren(h('div', { class: 'diff-empty' }, [
        h('strong', { text: '読み込み後の変更はありません' }),
        h('p', { class: 'field-hint', text: 'いま書き出すと、読み込んだファイルとバイト単位で同じ内容になります。' })
      ]));
      return;
    }

    var nodes = [h('div', { class: 'diff-summary' }, [
      diff.fieldChanges ? h('span', { class: 'chip chip-info' }, ['変更 ' + num(diff.fieldChanges) + ' 項目（' + num(diff.changed.length) + ' レコード）']) : null,
      diff.added.length ? h('span', { class: 'chip chip-ok' }, ['追加 ' + num(diff.added.length) + ' レコード']) : null,
      diff.removed.length ? h('span', { class: 'chip chip-err' }, ['削除 ' + num(diff.removed.length) + ' レコード']) : null,
      diff.reordered ? h('span', { class: 'chip chip-warn' }, ['並び順の変更あり']) : null
    ])];

    var doc = state.doc;
    var defs = Zengin.dataDefMap(doc);

    var section = function (title, items, cls, render) {
      if (!items.length) return;
      nodes.push(h('div', { class: 'diff-group' }, [
        h('div', { class: 'diff-group-title', text: title + '  ' + num(items.length) + ' 件' })
      ].concat(items.slice(0, MAX_DIFF_SHOWN).map(render),
        items.length > MAX_DIFF_SHOWN
          ? [h('p', { class: 'field-hint', text: 'ほか ' + num(items.length - MAX_DIFF_SHOWN) + ' 件は省略しました。' })]
          : [])));
    };

    section('変更したレコード', diff.changed, 'is-changed', function (item) {
      var head = h('div', { class: 'diff-item-head' }, [
        h('span', { text: recordCaption(doc, item.kind, item.index + 1) }),
        h('button', {
          type: 'button', class: 'btn btn-sm', style: 'margin-left:auto',
          onclick: function () { $('#diff-dialog').close(); jumpToRecord(item.index, item.fields[0] && item.fields[0].field.key); }
        }, ['該当箇所へ', icon(ICON.arrow)])
      ]);

      var detail;
      if (item.fields.length) {
        var cells = [];
        item.fields.forEach(function (change) {
          var before = diffFieldValue(change.field, change.before);
          var after = diffFieldValue(change.field, change.after);
          cells.push(h('span', {
            class: 'diff-name',
            text: change.field.label,
            title: change.field.pos + '-' + change.field.end + ' 桁'
          }));
          cells.push(h('span', {
            class: 'diff-before', text: before.text, title: '原文: ' + diffValue(before.raw)
          }));
          cells.push(h('span', { class: 'diff-arrow', text: '→' }));
          cells.push(h('span', {
            class: 'diff-after', text: after.text, title: '原文: ' + diffValue(after.raw)
          }));
        });
        detail = h('div', { class: 'diff-fields' }, cells);
      } else {
        detail = h('div', { class: 'diff-raw' }, [
          h('div', { class: 'diff-before', text: diffValue(item.beforeText) }),
          h('div', { class: 'diff-after', text: diffValue(item.afterText) })
        ]);
      }
      return h('div', { class: 'diff-item is-changed' }, [head, detail]);
    });

    var defFor = function (kind, id) {
      if (kind !== 'data') return doc.format.records[kind];
      return (id && defs[id]) || doc.format.records.data;
    };

    section('追加したレコード', diff.added, 'is-added', function (item) {
      var summary = summarizeRecord(defFor(item.kind, item.record.id), item.record.text);
      return h('div', { class: 'diff-item is-added' }, [
        h('div', { class: 'diff-item-head' }, [
          h('span', { text: recordCaption(doc, item.kind, item.index + 1) }),
          h('span', { class: 'chip chip-ok', style: 'margin-left:auto' }, ['追加'])
        ]),
        h('div', { class: 'diff-raw', text: summary || '（まだ何も入力されていません）' })
      ]);
    });

    section('削除したレコード', diff.removed, 'is-removed', function (item) {
      var summary = summarizeRecord(defFor(item.kind, item.record.id), item.record.text);
      return h('div', { class: 'diff-item is-removed' }, [
        h('div', { class: 'diff-item-head' }, [
          h('span', { text: '読み込み時の第 ' + (item.originalIndex + 1) + ' レコード（' +
            (doc.format.records[item.kind] ? doc.format.records[item.kind].label : 'レコード') + '）' }),
          h('span', { class: 'chip chip-err', style: 'margin-left:auto' }, ['削除'])
        ]),
        h('div', { class: 'diff-raw', text: summary || diffValue(item.record.text) })
      ]);
    });

    if (diff.reordered) {
      nodes.push(h('div', { class: 'diff-group' }, [
        h('div', { class: 'diff-group-title', text: '並び順' }),
        h('div', { class: 'diff-item' }, [
          h('div', { class: 'diff-raw', text: 'レコードの並び順が読み込み時から変わっています。' })
        ])
      ]));
    }

    body.replaceChildren.apply(body, nodes);
    body.scrollTop = 0;
  }

  /* ================================================================
     検証
     ================================================================ */

  function revalidate() {
    if (!state.doc) { state.issues = []; state.issuesByRecord = {}; return; }
    // 読み込み時の判定結果（文字コード・レコード長など）も検証結果として扱う
    var notices = (state.doc.notices || []).map(function (notice) {
      return {
        level: notice.level, message: notice.message,
        recordIndex: null, fieldKey: null, hint: notice.hint || ''
      };
    });
    state.issues = notices.concat(Zengin.validate(state.doc));
    var map = {};
    state.issues.forEach(function (item) {
      if (item.recordIndex == null) return;
      (map[item.recordIndex] = map[item.recordIndex] || []).push(item);
    });
    state.issuesByRecord = map;
  }

  function markDirty() {
    revalidate();
    // 編集を取り消して元に戻れば、未保存の変更はなくなる
    state.dirty = computeDiff().total > 0;
  }

  function fieldHasIssue(recordIndex, fieldKey) {
    var list = state.issuesByRecord[recordIndex];
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].fieldKey === fieldKey && list[i].level === 'error') return list[i];
    }
    return null;
  }

  /* ================================================================
     タブ
     ================================================================ */

  function setTab(name) {
    state.activeTab = name;
    $$('.tab').forEach(function (tab) {
      var active = tab.dataset.tab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    $$('.panel').forEach(function (panel) {
      panel.classList.toggle('is-active', panel.id === 'panel-' + name);
    });
  }

  /* ================================================================
     画面全体の再描画
     ================================================================ */

  function renderAll() {
    if (!state.doc) return;
    renderDocbar();
    renderSummary();
    renderRecordForm('header', $('#panel-header'));
    renderDataPanel();
    renderTrailerPanel();
    renderAnalysis();
    renderRawPanel();
    renderIssuesPanel();
  }

  /** 編集後に呼ぶ軽量な再描画（現在のタブと共通部分のみ）。 */
  function refreshAfterEdit(options) {
    var opts = options || {};
    renderDocbar();
    renderIssuesPanel();
    if (!opts.keepSummary) renderSummary();
    if (opts.rerenderData) renderDataPanel();
    if (opts.rerenderRaw !== false) renderRawPanel();
    if (opts.rerenderForms) {
      renderRecordForm('header', $('#panel-header'));
      renderTrailerPanel();
    }
  }

  /* ---------------- 文書バー ---------------- */

  var ICON_LOCK = 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z';
  var ICON_PENCIL = 'M4 20h4L19 9a2 2 0 0 0-3-3L5 17z';
  var ICON_UNDO = 'M9 14 4 9l5-5M4 9h9a7 7 0 0 1 0 14H8';
  var ICON_REDO = 'm15 14 5-5-5-5m5 5h-9a7 7 0 0 0 0 14h5';

  function enableEditing() {
    state.readonly = false;
    renderAll();
    toast('編集を有効にしました',
      '変更は「元に戻す」で取り消せます。「読み込み時点へ戻す」ですべて戻すこともできます。', 'ok');
  }

  function backToViewMode() {
    state.readonly = true;
    renderAll();
    toast('閲覧モードに戻しました', '編集内容はそのまま残っています。', 'info');
  }

  /** 閲覧モードの切り替えと、元に戻す／やり直すの操作。 */
  function renderModeBar() {
    var host = $('#docbar-mode');
    var children = [];

    if (state.readonly) {
      children.push(h('span', { class: 'mode-badge is-view' }, [svg(ICON_LOCK), '閲覧モード']));
      children.push(h('button', {
        type: 'button', class: 'btn btn-sm', id: 'btn-enable-edit', onclick: enableEditing
      }, [icon(ICON_PENCIL), '編集を有効にする']));
    } else {
      children.push(h('span', { class: 'mode-badge is-edit' }, [svg(ICON_PENCIL), '編集中']));
      children.push(h('button', {
        type: 'button', class: 'btn btn-sm btn-icon', id: 'btn-undo',
        title: '元に戻す（Ctrl+Z）' + (history.undo.length ? '：' + history.undo[history.undo.length - 1].label : ''),
        disabled: !history.undo.length, onclick: undoChange
      }, [icon(ICON_UNDO)]));
      children.push(h('button', {
        type: 'button', class: 'btn btn-sm btn-icon', id: 'btn-redo',
        title: 'やり直す（Ctrl+Shift+Z）',
        disabled: !history.redo.length, onclick: redoChange
      }, [icon(ICON_REDO)]));
      children.push(h('button', {
        type: 'button', class: 'btn btn-sm', id: 'btn-restore-baseline',
        title: '読み込んだ時点の内容に戻します',
        disabled: !state.dirty, onclick: restoreBaseline
      }, [icon(ICON.refresh), '読み込み時点へ戻す']));
      children.push(h('button', {
        type: 'button', class: 'btn btn-sm btn-ghost', id: 'btn-view-mode', onclick: backToViewMode
      }, [icon(ICON_LOCK), '閲覧に戻す']));
    }
    host.replaceChildren.apply(host, children);
  }

  function renderDocbar() {
    renderModeBar();
    var doc = state.doc;
    var format = doc.format;
    var summary = Zengin.summarize(doc);
    var counts = Zengin.countByLevel(state.issues);

    var badge = $('#format-badge');
    badge.dataset.accent = format.accent || 'slate';
    $('#format-code').textContent = format.generic ? '??' : format.code;
    $('#format-name').textContent = format.name;

    $('#file-name').textContent = doc.fileName || '(名称未設定)';
    $('#file-meta').textContent = [
      Charset.getCodec(doc.encoding).label,
      doc.lineEnding === 'NONE' ? '改行なし' : doc.lineEnding,
      doc.recordLength + '桁',
      doc.records.length + 'レコード',
      formatBytes(doc.byteLength || 0)
    ].join('  ·  ');

    var stats = $('#docbar-stats');
    var children = [];

    if (state.dirty) {
      var diffCount = computeDiff().total;
      children.push(h('button', {
        type: 'button', class: 'chip chip-info', id: 'btn-show-diff',
        title: '読み込み後に変更した内容を一覧で確認します',
        onclick: openDiff
      }, [icon(ICON.copy), '変更 ' + num(diffCount) + ' 件（未保存）']));
    }
    children.push(h('div', { class: 'stat' }, [
      h('span', { class: 'stat-label', text: 'データ件数' }),
      h('span', { class: 'stat-value' }, [num(summary.count), h('small', { text: '件' })])
    ]));
    if (summary.amountField) {
      children.push(h('div', { class: 'stat' }, [
        h('span', { class: 'stat-label', text: '合計金額' }),
        h('span', { class: 'stat-value' }, [num(summary.amount), h('small', { text: '円' })])
      ]));
    }

    var chip;
    if (counts.error) {
      chip = h('button', {
        type: 'button', class: 'chip chip-err',
        onclick: function () { setTab('issues'); }
      }, [icon(ICON.alert), 'エラー ' + counts.error + ' 件']);
    } else if (counts.warn) {
      chip = h('button', {
        type: 'button', class: 'chip chip-warn',
        onclick: function () { setTab('issues'); }
      }, [icon(ICON.alert), '警告 ' + counts.warn + ' 件']);
    } else {
      chip = h('span', { class: 'chip chip-ok' }, [icon(ICON.check), '検証 OK']);
    }
    children.push(chip);

    stats.replaceChildren.apply(stats, children);

    $('#tab-count-data').textContent = num(summary.count);
    var issueCount = $('#tab-count-issues');
    issueCount.textContent = num(state.issues.length);
    issueCount.classList.toggle('has-error', counts.error > 0);
  }

  /* ================================================================
     概要タブ
     ================================================================ */

  /** レイアウト定義を持たない種別コードであることを知らせる。 */
  function buildLayoutPendingNotice() {
    var format = state.doc.format;
    if (!format.generic) return null;
    return h('div', { class: 'notice-card' }, [
      h('span', { class: 'notice-icon' }, [svg(ICON.info)]),
      h('div', { class: 'notice-body' }, [
        h('strong', {
          text: '種別コード「' + (state.doc.detectedTypeCode || '不明') +
            '」のレイアウト定義がありません'
        }),
        h('p', {
          text: format.recordLength + ' 桁ごとのレコード分割、レコード構成の検証、原文の編集と書き出しは行えます。' +
            'ただし「金額」「日付」などの項目名つき表示は、桁位置を誤ると正しく見えたまま' +
            '誤った数値を示してしまうため行いません。'
        }),
        h('p', {
          text: '桁位置の確認には「生データ」タブの桁目盛りをお使いください。' +
            'フォーマットが分かっている場合は、ファイル情報の「フォーマット」から選び直せます。'
        }),
        h('button', {
          type: 'button', class: 'btn btn-sm',
          onclick: function () { setTab('raw'); }
        }, ['生データで桁位置を確認', icon(ICON.arrow)])
      ])
    ]);
  }

  /** 危険度の高い状態を、概要の先頭で知らせる。 */
  function buildBlockingNotices() {
    var doc = state.doc;
    var cards = [];

    if (Zengin.usesEbcdic(doc)) {
      cards.push(h('div', { class: 'notice-card is-danger' }, [
        h('span', { class: 'notice-icon' }, [svg(ICON.alert)]),
        h('div', { class: 'notice-body' }, [
          h('strong', { text: 'コード区分が「1：EBCDIC」です。本ツールは EBCDIC に対応していません' }),
          h('p', {
            text: '本ツールの文字コード処理は JIS（Shift_JIS の 1 バイト領域）と UTF-8 だけです。' +
              'EBCDIC のファイルを JIS として読むと画面は文字化けし、書き出したファイルは壊れます。'
          }),
          h('p', {
            text: '誤った内容のファイルを作らないため、書き出しを止めています。' +
              '「生データ」タブで原文を確認するか、JIS のファイルを入手してください。'
          })
        ])
      ]));
    }

    if (Zengin.hasMixedVariants(doc)) {
      var list = Zengin.groups(doc);
      cards.push(h('div', { class: 'notice-card' }, [
        h('span', { class: 'notice-icon' }, [svg(ICON.info)]),
        h('div', { class: 'notice-body' }, [
          h('strong', { text: 'データ・レコードのレイアウトが口座ごとに異なるファイルです' }),
          h('p', {
            text: list.map(function (g) {
              return (g.index + 1) + ' 組目: ' + (g.variantLabel || g.variantKey || '既定');
            }).join(' / ') + '。検証と集計は口座ごとに正しいレイアウトで行っています。'
          }),
          h('p', { text: '「データ明細」タブでは、口座を選んでご覧ください。' }),
          h('button', {
            type: 'button', class: 'btn btn-sm',
            onclick: function () { setTab('data'); }
          }, ['データ明細へ', icon(ICON.arrow)])
        ])
      ]));
    }
    return cards;
  }

  /** 預金口座振替の処理結果を、結果コード別に集計して見せる。 */
  function buildResultBreakdown(dataRecords) {
    var doc = state.doc;
    var def = currentDataDef();
    var resultField = Zengin.fieldByRole(def, 'resultCode');
    if (!resultField || !dataRecords.length) return null;

    var hasResult = dataRecords.some(function (rec) {
      var code = Zengin.readField(rec, resultField).trim();
      return code !== '' && code !== '0';
    });
    var trailerDef = doc.format.records.trailer;
    ['doneCount', 'doneAmount', 'failCount', 'failAmount'].forEach(function (key) {
      var field = trailerDef.byKey[key];
      if (!field) return;
      Zengin.recordsOfKind(doc, 'trailer').forEach(function (rec) {
        if (Zengin.toNumber(Zengin.readField(rec, field)) !== 0) hasResult = true;
      });
    });
    if (!hasResult) return null;

    var buckets = Object.create(null);
    var total = 0;
    dataRecords.forEach(function (rec) {
      var code = Zengin.readField(rec, resultField).trim() || '0';
      var amount = Zengin.amountOf(def, rec);
      if (!buckets[code]) buckets[code] = { code: code, count: 0, amount: 0 };
      buckets[code].count++;
      buckets[code].amount += amount;
      total += amount;
    });

    var rows = Object.keys(buckets).sort().map(function (k) { return buckets[k]; });
    var body = h('tbody', null, rows.map(function (row) {
      var label = Zengin.codeLabel(resultField, row.code) || '（定義外）';
      var ok = row.code === '0';
      return h('tr', null, [
        h('td', { class: 'cell', style: 'padding:6px 12px' }, [
          h('span', { class: 'chip ' + (ok ? 'chip-ok' : 'chip-warn'), style: 'height:21px;font-size:11px' },
            [row.code + '：' + label])
        ]),
        h('td', { class: 'cell is-num', style: 'padding:6px 12px', text: num(row.count) }),
        h('td', { class: 'cell is-num', style: 'padding:6px 12px', text: num(row.amount) }),
        h('td', {
          class: 'cell is-num', style: 'padding:6px 12px;color:var(--text-2)',
          text: total ? (Math.round((row.amount / total) * 1000) / 10) + '%' : '—'
        })
      ]);
    }));

    return h('div', { class: 'card' }, [
      h('div', { class: 'card-head' }, [
        h('h2', { text: '振替結果コード別の内訳' }),
        h('span', { class: 'card-note', text: '処理結果明細として集計しています' })
      ]),
      h('div', { class: 'card-body is-tight' }, [
        h('div', { style: 'overflow:auto' }, [
          h('table', { class: 'ztable', style: 'width:100%' }, [
            h('thead', null, [h('tr', null, [
              h('th', { text: '結果' }),
              h('th', { style: 'text-align:right', text: '件数' }),
              h('th', { style: 'text-align:right', text: '金額（円）' }),
              h('th', { style: 'text-align:right', text: '構成比' })
            ])]),
            body
          ])
        ])
      ])
    ]);
  }

  function kpi(label, value, unit, sub, accent) {
    return h('div', { class: 'kpi' + (accent ? ' kpi-accent' : '') }, [
      h('div', { class: 'kpi-label', text: label }),
      h('div', { class: 'kpi-value' }, [String(value), unit ? h('small', { text: unit }) : null]),
      sub ? h('div', { class: 'kpi-sub', text: sub }) : null
    ]);
  }

  function dlRow(list, label, value, cls) {
    list.appendChild(h('dt', { text: label }));
    list.appendChild(h('dd', { class: cls || null, text: value === '' || value == null ? '—' : value }));
  }

  function renderSummary() {
    var doc = state.doc;
    var format = doc.format;
    var panel = $('#panel-summary');
    var summary = Zengin.summarize(doc);
    var dataRecords = Zengin.recordsOfKind(doc, 'data');
    var amounts = [];
    if (summary.amountField) {
      dataRecords.forEach(function (rec) {
        amounts.push(Zengin.toNumber(Zengin.readField(rec, summary.amountField)));
      });
    }
    var maxAmount = amounts.length ? Math.max.apply(null, amounts) : 0;
    var avgAmount = amounts.length ? Math.round(summary.amount / amounts.length) : 0;

    var nodes = buildBlockingNotices();
    var pending = buildLayoutPendingNotice();
    if (pending) nodes.push(pending);

    /* --- KPI --- */
    var kpis = [
      kpi('データ件数', num(summary.count), '件', null, true)
    ];
    var aggregates = Zengin.computeAggregates(doc, dataRecords);
    var detailed = aggregates.filter(function (agg) { return agg.hasAmount && agg.spec.where; });
    if (detailed.length) {
      // 入出金取引明細のように、入金・出金を分けて集計するフォーマット
      detailed.forEach(function (agg) {
        kpis.push(kpi(agg.spec.label + '合計', num(agg.amount), '円',
          num(agg.count) + ' 件', true));
      });
    } else if (summary.amountField) {
      kpis.push(kpi(summary.amountField.label + '合計', num(summary.amount), '円', null, true));
      kpis.push(kpi('平均', num(avgAmount), '円'));
      kpis.push(kpi('最高額', num(maxAmount), '円'));
    }
    kpis.push(kpi('総レコード数', num(doc.records.length), '件',
      Zengin.groups(doc).length > 1
        ? Zengin.groups(doc).length + ' 組のヘッダー／トレーラを含む'
        : 'ヘッダー / データ / トレーラ / エンド'));
    nodes.push(h('div', { class: 'kpi-row' }, kpis));

    /* --- 委託者情報 + ファイル情報 --- */
    var header = Zengin.recordsOfKind(doc, 'header')[0];
    var grid = [];

    if (header && !format.generic && !format.layoutPending) {
      var hd = format.records.header;
      var dl = h('dl', { class: 'dl' });
      var get = function (key) {
        var field = hd.byKey[key];
        return field ? Zengin.displayValue(header, field) : '';
      };
      var labelOf = function (key, fallback) {
        return hd.byKey[key] ? hd.byKey[key].label : fallback;
      };
      dlRow(dl, labelOf('requesterName', '委託者名'), get('requesterName'));
      dlRow(dl, labelOf('requesterCode', '委託者コード'), get('requesterCode'), 'mono');
      dlRow(dl, labelOf('transferDate', '取組日'), get('transferDate'), 'mono');
      var bank = [get('bankCode'), get('bankName')].filter(Boolean).join(' ');
      var branch = [get('branchCode'), get('branchName')].filter(Boolean).join(' ');
      dlRow(dl, labelOf('bankCode', '仕向銀行'), bank, 'mono');
      dlRow(dl, labelOf('branchCode', '仕向支店'), branch, 'mono');
      if (hd.byKey.depositType) {
        var dep = get('depositType');
        dlRow(dl, '委託者口座',
          [Zengin.codeLabel(hd.byKey.depositType, dep), get('accountNumber')].filter(Boolean).join(' ') || '—');
      }
      grid.push(h('div', { class: 'card' }, [
        h('div', { class: 'card-head' }, [
          h('h2', { text: '委託者・取組内容' }),
          h('button', {
            type: 'button', class: 'btn btn-sm',
            onclick: function () { setTab('header'); }
          }, ['編集', icon(ICON.arrow)])
        ]),
        h('div', { class: 'card-body' }, [dl])
      ]));
    }

    grid.push(renderFileSettings());
    nodes.push(h('div', { class: 'summary-grid' }, grid));

    /* --- 振替結果コード別の内訳 --- */
    var breakdown = buildResultBreakdown(dataRecords);
    if (breakdown) nodes.push(breakdown);

    /* --- 被仕向金融機関別の内訳 --- */
    if (!format.generic && dataRecords.length) {
      var breakdown = renderBankBreakdown(dataRecords, format);
      if (breakdown) nodes.push(breakdown);
    }

    /* --- 検証サマリ --- */
    nodes.push(renderValidationCard());

    panel.replaceChildren.apply(panel, nodes);
  }

  function renderFileSettings() {
    var doc = state.doc;

    var encodingSelect = h('select', {
      class: 'field-input', id: 'set-encoding',
      onchange: function (event) { changeParseOption({ encoding: event.target.value }); }
    }, Object.keys(Charset.codecs).map(function (id) {
      return h('option', { value: id, selected: doc.encoding === id, text: Charset.codecs[id].label });
    }));

    var eolSelect = h('select', {
      class: 'field-input', id: 'set-eol',
      onchange: function (event) { doc.lineEnding = event.target.value; renderDocbar(); }
    }, [
      h('option', { value: 'CRLF', selected: doc.lineEnding === 'CRLF', text: 'CRLF（Windows・標準）' }),
      h('option', { value: 'LF', selected: doc.lineEnding === 'LF', text: 'LF（UNIX）' }),
      h('option', { value: 'NONE', selected: doc.lineEnding === 'NONE', text: '改行なし（連結）' })
    ]);

    var formatOptions = Formats.listFormats().map(function (fmt) {
      return h('option', {
        value: fmt.code, selected: !doc.format.generic && doc.format.code === fmt.code,
        text: fmt.code + '  ' + fmt.name + (fmt.layoutPending ? '（レイアウト未登録）' : '')
      });
    });
    if (doc.format.generic) {
      formatOptions.unshift(h('option', {
        value: '', selected: true, text: '自動判定：未対応（原文表示）'
      }));
    }
    var formatSelect = h('select', {
      class: 'field-input', id: 'set-format',
      onchange: function (event) { changeParseOption({ formatCode: event.target.value }); }
    }, formatOptions);

    var detection = doc.encodingDetection;

    return h('div', { class: 'card' }, [
      h('div', { class: 'card-head' }, [
        h('h2', { text: 'ファイル情報' }),
        h('span', { class: 'card-note', text: '書き出し時にもこの設定が使われます' })
      ]),
      h('div', { class: 'field-grid' }, [
        h('div', { class: 'field' }, [
          h('div', { class: 'field-label' }, [h('span', { class: 'field-name', text: '文字コード' })]),
          encodingSelect,
          h('div', {
            class: 'field-hint',
            text: detection ? detection.reason : '書き出し時に使用する文字コードです。'
          })
        ]),
        h('div', { class: 'field' }, [
          h('div', { class: 'field-label' }, [h('span', { class: 'field-name', text: '改行コード' })]),
          eolSelect,
          h('div', { class: 'field-hint', text: '読み込み時の判定: ' + (doc.lineEnding === 'NONE' ? '改行なし' : doc.lineEnding) })
        ]),
        h('div', { class: 'field' }, [
          h('div', { class: 'field-label' }, [h('span', { class: 'field-name', text: 'フォーマット' })]),
          formatSelect,
          h('div', {
            class: 'field-hint',
            text: 'ヘッダーの種別コード「' + (doc.detectedTypeCode || '不明') + '」から自動判定しました。' +
              (doc.formatOverridden ? '（手動で変更中）' : '')
          })
        ]),
        doc.format.variants ? h('div', { class: 'field' }, [
          h('div', { class: 'field-label' }, [h('span', { class: 'field-name', text: 'データ・レコードの種類' })]),
          h('select', {
            class: 'field-input',
            onchange: function (event) { changeParseOption({ variantKey: event.target.value }); }
          }, doc.format.variants.map(function (variant) {
            return h('option', {
              value: variant.key, selected: doc.variantKey === variant.key, text: variant.label
            });
          })),
          h('div', {
            class: 'field-hint',
            text: '同じ種別コードでレイアウトが分かれるフォーマットです。読み込み時に自動判定しています。'
          })
        ]) : null,
        h('div', { class: 'field' }, [
          h('div', { class: 'field-label' }, [h('span', { class: 'field-name', text: 'レコード長 / サイズ' })]),
          h('input', { class: 'field-input', value: doc.recordLength + ' 桁 / ' + formatBytes(doc.byteLength || 0), readonly: true }),
          h('div', {
            class: 'field-hint',
            text: doc.format.generic
              ? 'レイアウト定義がないため、ファイルの構成からレコード長を推定しました。'
              : doc.format.name + 'のレコード長は ' + doc.format.recordLength + ' 桁です。' +
                (doc.recordLength !== doc.format.recordLength
                  ? '（このファイルは ' + doc.recordLength + ' 桁のため、その長さのまま扱います）'
                  : '')
          })
        ])
      ])
    ]);
  }

  function changeParseOption(options) {
    guardUnsaved('読み込み直す').then(function (ok) {
      if (!ok) { renderSummary(); return; }
      var doc = state.doc;
      loadBytes(state.rawBytes, doc.fileName, {
        encoding: options.encoding || doc.encoding,
        formatCode: options.formatCode !== undefined
          ? (options.formatCode || undefined)
          : (doc.formatOverridden ? doc.format.code : undefined),
        variantKey: options.variantKey ||
          (options.formatCode !== undefined || options.encoding ? undefined : doc.variantKey)
      });
    });
  }

  function renderBankBreakdown(dataRecords, format) {
    var def = format.records.data;
    var bankCode = def.byKey.bankCode;
    var bankName = def.byKey.bankName;
    var amountField = Zengin.fieldByRole(def, 'amount');
    if (!bankCode) return null;

    var groups = {};
    dataRecords.forEach(function (rec) {
      var code = Zengin.readField(rec, bankCode) || '(未設定)';
      if (!groups[code]) {
        groups[code] = {
          code: code,
          name: bankName ? Zengin.readField(rec, bankName) : '',
          count: 0, amount: 0
        };
      }
      groups[code].count++;
      if (amountField) groups[code].amount += Zengin.toNumber(Zengin.readField(rec, amountField));
    });

    var rows = Object.keys(groups).map(function (k) { return groups[k]; })
      .sort(function (a, b) { return b.amount - a.amount || b.count - a.count; });
    var total = rows.reduce(function (sum, r) { return sum + r.amount; }, 0);

    var tbody = h('tbody', null, rows.map(function (row) {
      var share = total ? Math.round((row.amount / total) * 1000) / 10 : 0;
      return h('tr', null, [
        h('td', { class: 'cell', style: 'padding:6px 12px' }, [
          h('span', { style: 'font-family:var(--mono)', text: row.code }),
          row.name ? h('span', { style: 'margin-left:8px;color:var(--text-2)', text: row.name }) : null
        ]),
        h('td', { class: 'cell is-num', style: 'padding:6px 12px', text: num(row.count) }),
        h('td', { class: 'cell is-num', style: 'padding:6px 12px', text: num(row.amount) }),
        h('td', { class: 'cell is-num', style: 'padding:6px 12px;color:var(--text-2)', text: share + '%' })
      ]);
    }));

    return h('div', { class: 'card' }, [
      h('div', { class: 'card-head' }, [
        h('h2', { text: (bankCode.label.replace(/番号$/, '')) + '別の内訳' }),
        h('span', { class: 'card-note', text: rows.length + ' 金融機関' })
      ]),
      h('div', { class: 'card-body is-tight' }, [
        h('div', { style: 'overflow:auto' }, [
          h('table', { class: 'ztable', style: 'width:100%' }, [
            h('thead', null, [h('tr', null, [
              h('th', { text: '金融機関' }),
              h('th', { style: 'text-align:right', text: '件数' }),
              h('th', { style: 'text-align:right', text: '金額（円）' }),
              h('th', { style: 'text-align:right', text: '構成比' })
            ])]),
            tbody
          ])
        ])
      ])
    ]);
  }

  /** 「問題なし」と言えるとき、実際に何を確認したのかを述べる。 */
  function validatedScopeText() {
    return state.doc.format.layoutPending
      ? 'レコード構成・レコード長・文字種に問題はありません。' +
        '項目ごとの検証は、レイアウトが未登録のため行っていません。'
      : '桁数・文字種・必須項目・合計件数／合計金額のいずれも整合しています。';
  }

  function renderValidationCard() {
    var counts = Zengin.countByLevel(state.issues);
    var body;
    if (!counts.error && !counts.warn) {
      body = h('div', { class: 'result-ok' }, [
        svg(ICON.check),
        h('div', null, [
          h('strong', { text: '問題は見つかりませんでした' }),
          h('span', { text: validatedScopeText() })
        ])
      ]);
    } else {
      body = h('div', { class: 'issue-summary' }, [
        counts.error ? h('span', { class: 'chip chip-err' }, [icon(ICON.alert), 'エラー ' + counts.error + ' 件']) : null,
        counts.warn ? h('span', { class: 'chip chip-warn' }, [icon(ICON.alert), '警告 ' + counts.warn + ' 件']) : null,
        counts.info ? h('span', { class: 'chip chip-info' }, [icon(ICON.info), '情報 ' + counts.info + ' 件']) : null,
        h('button', {
          type: 'button', class: 'btn btn-sm',
          onclick: function () { setTab('issues'); }
        }, ['詳細を見る', icon(ICON.arrow)])
      ]);
    }
    return h('div', { class: 'card' }, [
      h('div', { class: 'card-head' }, [h('h2', { text: '検証結果' })]),
      h('div', { class: 'card-body' }, [body])
    ]);
  }

  /* ================================================================
     分析タブ

     フォーマット定義のロールと属性から、そのファイルで意味のある切り口だけを
     組み立てる。色は識別に使わず、分類名は必ず軸ラベルで示す。
     ================================================================ */

  var AMOUNT_BANDS = [
    { limit: 10000, label: '〜1万円' },
    { limit: 50000, label: '1万〜5万円' },
    { limit: 100000, label: '5万〜10万円' },
    { limit: 500000, label: '10万〜50万円' },
    { limit: 1000000, label: '50万〜100万円' },
    { limit: 5000000, label: '100万〜500万円' },
    { limit: 10000000, label: '500万〜1000万円' },
    { limit: Infinity, label: '1000万円〜' }
  ];

  /** 分析に使うデータ行（レコードと、その口座のレイアウト）。 */
  function analysisRows() {
    var doc = state.doc;
    var defs = Zengin.dataDefMap(doc);
    return Zengin.recordsOfKind(doc, 'data').map(function (rec) {
      return { rec: rec, def: defs[rec.id] || doc.format.records.data };
    });
  }

  function readBy(row, key) {
    var field = row.def.byKey[key];
    return field ? Zengin.readField(row.rec, field) : '';
  }

  /** 指定のキーでまとめ、件数と金額を集計する。 */
  function groupRows(rows, keyOf, labelOf) {
    var map = Object.create(null);
    var order = [];
    rows.forEach(function (row) {
      var key = keyOf(row);
      if (key == null) return;
      if (!map[key]) {
        map[key] = { key: key, label: labelOf(row, key), count: 0, amount: 0 };
        order.push(key);
      }
      map[key].count++;
      map[key].amount += Zengin.amountOf(row.def, row.rec);
    });
    return order.map(function (key) { return map[key]; });
  }

  function byAmountDesc(a, b) { return b.amount - a.amount || b.count - a.count; }

  /** データ・レコードで最初に見つかる日付項目。 */
  function dateFieldOf(def) {
    for (var i = 0; i < def.fields.length; i++) {
      var field = def.fields[i];
      if (!field.dummy && (field.format === 'mmdd' || field.format === 'yymmdd')) return field;
    }
    return null;
  }

  function shortDate(field, raw) {
    var digits = String(raw).replace(/\D/g, '');
    if (field.format === 'yymmdd' && digits.length >= 6) {
      return digits.slice(2, 4) + '/' + digits.slice(4, 6);
    }
    if (digits.length >= 4) return digits.slice(0, 2) + '/' + digits.slice(2, 4);
    return raw;
  }

  function renderAnalysis() {
    var panel = $('#panel-analysis');
    var doc = state.doc;
    var format = doc.format;

    if (format.generic) {
      panel.replaceChildren(h('div', { class: 'empty-state' }, [
        h('strong', { text: 'このフォーマットは分析できません' }),
        h('span', { text: 'レイアウト定義がないため、金額や日付を取り出せません。' })
      ]));
      return;
    }

    var rows = analysisRows();
    if (!rows.length) {
      panel.replaceChildren(h('div', { class: 'empty-state' }, [
        h('strong', { text: 'データ・レコードがありません' }),
        h('span', { text: '分析できる明細が含まれていません。' })
      ]));
      return;
    }

    var dataDef = rows[0].def;
    var hasAmount = Zengin.fieldsByRole(dataDef, 'amount').length > 0;
    var amountLabel = (Zengin.fieldByRole(dataDef, 'amount') || {}).label || '金額';
    var wide = [];
    var cards = [];

    /* --- 日付別の推移 --- */
    var dateField = dateFieldOf(dataDef);
    var inOutField = Zengin.fieldByRole(dataDef, 'inOutKubun');
    if (dateField && hasAmount) {
      var byDate = Object.create(null);
      var dates = [];
      rows.forEach(function (row) {
        var raw = readBy(row, dateField.key);
        if (!raw) return;
        var key = String(raw).replace(/\D/g, '');
        if (!byDate[key]) {
          byDate[key] = { key: key, label: shortDate(dateField, key), inAmount: 0, outAmount: 0 };
          dates.push(key);
        }
        var amount = Zengin.amountOf(row.def, row.rec);
        var kubun = inOutField ? Zengin.readField(row.rec, inOutField).trim() : '1';
        if (kubun === '2') byDate[key].outAmount += amount;
        else byDate[key].inAmount += amount;
      });
      dates.sort();
      if (dates.length > 1) {
        var series = [{ name: inOutField ? '入金' : amountLabel, slot: 1,
          values: dates.map(function (k) { return byDate[k].inAmount; }) }];
        if (inOutField) {
          series.push({ name: '出金', slot: 2,
            values: dates.map(function (k) { return byDate[k].outAmount; }) });
        }
        var chart = Charts.columnChart({
          title: dateField.label + '別の' + amountLabel,
          subtitle: 'ファイル全体（' + num(rows.length) + ' 件）を日付でまとめています',
          categories: dates.map(function (k) { return byDate[k].label; }),
          series: series, unit: '円', categoryLabel: dateField.label
        });
        if (series.length > 1) {
          chart.insertBefore(Charts.legend(series), chart.querySelector('.chart-body'));
        }
        chart.classList.add('chart-wide');
        wide.push(chart);
      }
    }

    /* --- 金額帯別の件数 --- */
    if (hasAmount) {
      var bands = AMOUNT_BANDS.map(function (band) {
        return { label: band.label, value: 0, amount: 0 };
      });
      rows.forEach(function (row) {
        var amount = Zengin.amountOf(row.def, row.rec);
        for (var i = 0; i < AMOUNT_BANDS.length; i++) {
          if (amount < AMOUNT_BANDS[i].limit) { bands[i].value++; bands[i].amount += amount; break; }
        }
      });
      var used = bands.filter(function (b) { return b.value > 0; });
      if (used.length > 1) {
        cards.push(Charts.barChart({
          title: amountLabel + 'の分布',
          subtitle: '金額帯ごとの件数',
          rows: used.map(function (b) {
            return { label: b.label, value: b.value, note: Charts.comma(b.amount) + ' 円' };
          }),
          unit: ' 件', categoryLabel: '金額帯', valueLabel: '件数', noteLabel: '金額合計',
          labelWidth: 150
        }));
      }
    }

    /* --- 上位（名義別） --- */
    var nameField = Zengin.fieldByRole(dataDef, 'name');
    if (nameField && hasAmount) {
      var byName = groupRows(rows,
        function (row) { return readBy(row, nameField.key) || '（未設定）'; },
        function (row, key) { return key; }).sort(byAmountDesc);
      if (byName.length > 1) {
        cards.push(Charts.barChart({
          title: nameField.label + '別の' + amountLabel + '（上位 10）',
          subtitle: '全 ' + num(byName.length) + ' 件のうち金額の大きい順',
          rows: byName.slice(0, 10).map(function (g) {
            return { label: g.label, value: g.amount, note: g.count + ' 件' };
          }),
          unit: ' 円', categoryLabel: nameField.label, valueLabel: amountLabel, noteLabel: '件数'
        }));
      }
    }

    /* --- 金融機関別 --- */
    var bankCodeField = dataDef.byKey.bankCode;
    if (bankCodeField && hasAmount) {
      var byBank = groupRows(rows,
        function (row) { return readBy(row, 'bankCode') || '（未設定）'; },
        function (row, key) {
          var name = readBy(row, 'bankName');
          return name ? key + ' ' + name : key;
        }).sort(byAmountDesc);
      if (byBank.length > 1) {
        cards.push(Charts.barChart({
          title: bankCodeField.label.replace(/番号$/, '') + '別の' + amountLabel,
          subtitle: num(byBank.length) + ' 金融機関',
          rows: byBank.map(function (g) {
            return { label: g.label, value: g.amount, note: g.count + ' 件' };
          }),
          unit: ' 円', categoryLabel: '金融機関', valueLabel: amountLabel, noteLabel: '件数'
        }));
      }
    }

    /* --- コード項目ごとの内訳 --- */
    dataDef.fields.forEach(function (field) {
      if (!field.codes || field.dummy || field.fixed != null) return;
      if (inOutField && field.key === inOutField.key && dateField) return; // 推移で示している
      var groups = groupRows(rows,
        function (row) { return Zengin.readField(row.rec, field).trim() || '（未設定）'; },
        function (row, key) {
          var label = Zengin.codeLabel(field, key);
          return label ? key + '：' + label : key;
        });
      if (groups.length < 2) return;
      groups.sort(function (a, b) { return b.count - a.count; });
      cards.push(Charts.barChart({
        title: field.label + '別の件数',
        subtitle: field.pos + '-' + field.end + ' 桁',
        rows: groups.map(function (g) {
          return {
            label: g.label, value: g.count,
            note: hasAmount ? Charts.comma(g.amount) + ' 円' : ''
          };
        }),
        unit: ' 件', categoryLabel: field.label, valueLabel: '件数', noteLabel: '金額合計',
        labelWidth: 210
      }));
    });

    /* --- 口座別（複数グループ） --- */
    var groupList = Zengin.groups(doc);
    if (groupList.length > 1 && hasAmount) {
      cards.push(Charts.barChart({
        title: '口座別の' + amountLabel,
        subtitle: num(groupList.length) + ' 組のヘッダーごと',
        rows: groupList.map(function (group) {
          var amount = 0;
          group.data.forEach(function (rec) { amount += Zengin.amountOf(group.dataDef, rec); });
          return {
            label: Zengin.groupLabel(doc, group), value: amount,
            note: group.data.length + ' 件'
          };
        }),
        unit: ' 円', categoryLabel: '口座', valueLabel: amountLabel, noteLabel: '件数'
      }));
    }

    var nodes = [];
    nodes.push(h('div', { class: 'notice-card' }, [
      h('span', { class: 'notice-icon' }, [svg(ICON.info)]),
      h('div', { class: 'notice-body' }, [
        h('strong', { text: '読み込んだファイルの内容をそのまま集計しています' }),
        h('p', {
          text: '各図の「表で見る」で、同じ内容を数値の表として確認できます。' +
            'この集計はファイルの記載内容にもとづくもので、実際の取引や会計処理を保証するものではありません。'
        })
      ])
    ]));
    if (wide.length || cards.length) {
      nodes.push(h('div', { class: 'analysis-grid' }, wide.concat(cards)));
    } else {
      nodes.push(h('div', { class: 'empty-state' }, [
        h('strong', { text: '分析できる切り口が見つかりませんでした' }),
        h('span', { text: '明細の件数が少ないか、集計できる項目がないファイルです。' })
      ]));
    }
    panel.replaceChildren.apply(panel, nodes);
  }

  /* ================================================================
     項目フォーム（ヘッダー / トレーラ / エンド）
     ================================================================ */

  function buildFieldControl(record, field, recordIndex) {
    var value = Zengin.readField(record, field);
    var issue = fieldHasIssue(recordIndex, field.key);
    var control;

    var commit = function (raw) {
      if (state.readonly) { requireEditable(); renderRecordForm('header', $('#panel-header')); renderTrailerPanel(); return; }
      var next = applyInputValue(field, raw);
      if (next === Zengin.readField(record, field)) return;
      applyChange(field.label + 'の変更', function () {
        Zengin.setField(record, field, next);
      });
      refreshAfterEdit({ rerenderData: true, rerenderForms: true });
    };

    if (field.codes && !field.dummy) {
      var options = [h('option', { value: '', text: '（未設定）' })];
      Object.keys(field.codes).forEach(function (code) {
        options.push(h('option', {
          value: code, selected: value === code,
          text: code + '：' + field.codes[code]
        }));
      });
      if (value && !field.codes[value]) {
        options.push(h('option', { value: value, selected: true, text: value + '：（定義外）' }));
      }
      control = h('select', {
        class: 'field-input' + (issue ? ' has-error' : ''),
        disabled: (field.fixed != null || state.readonly) ? true : null,
        title: field.fixed != null ? 'このレコードの種類を表す固定値です' : null,
        onchange: function (event) { commit(event.target.value); }
      }, options);
    } else {
      var isAmount = field.format === 'amount' || field.format === 'count';
      control = h('input', {
        class: 'field-input' + (field.type === 'N' ? ' is-numeric' : '') + (issue ? ' has-error' : ''),
        value: isAmount ? num(Zengin.toNumber(value)) : value,
        maxlength: field.type === 'N' && !isAmount ? field.len : null,
        readonly: (field.fixed != null || state.readonly) ? true : null,
        onfocus: function (event) { if (isAmount) event.target.value = value; event.target.select(); },
        onblur: function (event) { commit(event.target.value); },
        onkeydown: function (event) { if (event.key === 'Enter') event.target.blur(); }
      });
    }

    var hintText = issue ? issue.message : field.hint;
    // 極端に長い項目だけ 1 行を占有させる（120 桁側の項目配置は変えない）
    var wide = field.dummy || field.role === 'rawBody' || field.len >= 60;
    return h('div', { class: 'field' + (wide ? ' field-full' : '') }, [
      h('div', { class: 'field-label' }, [
        h('span', { class: 'field-name', text: field.label }),
        h('span', { class: 'field-pos', text: field.pos + '-' + field.end + ' / ' + field.len + '桁 ' + field.type }),
        field.required ? h('span', { class: 'field-req', text: '必須' }) : null
      ]),
      control,
      hintText ? h('div', { class: 'field-hint' + (issue ? ' is-error' : ''), text: hintText }) : null
    ]);
  }

  /** 入力値を全銀で使える形へ整える。桁あふれは通知したうえで切り詰める。 */
  function applyInputValue(field, raw) {
    var text = String(raw == null ? '' : raw);
    if (field.type === 'N') {
      text = text.replace(/[^\d]/g, '');
    } else if (state.autoHankaku) {
      var normalized = Charset.normalize(text);
      if (normalized !== text) text = normalized;
    }
    if (text.length > field.len) {
      text = text.slice(0, field.len);
      toast('桁数を超えたため切り詰めました', field.label + 'は ' + field.len + ' 桁までです。', 'warn');
    }
    var bad = Charset.findInvalidChars(text);
    if (bad.length) {
      toast('全銀で使用できない文字があります',
        bad.slice(0, 4).map(function (b) { return b.display; }).join(' ') + ' は使用できません。', 'warn');
    }
    return text;
  }

  function renderRecordForm(kind, panel) {
    var doc = state.doc;
    var records = Zengin.recordsOfKind(doc, kind);
    if (!records.length) {
      panel.replaceChildren(h('div', { class: 'empty-state' }, [
        h('strong', { text: doc.format.records[kind].label + 'がありません' }),
        h('span', { text: 'ファイルに該当するレコードが含まれていません。' })
      ]));
      return;
    }
    panel.replaceChildren.apply(panel, records.map(function (record) {
      return buildRecordCard(record, kind);
    }));
  }

  function buildRecordCard(record, kind, extraActions) {
    var doc = state.doc;
    var def = doc.format.records[kind];
    var recordIndex = doc.records.indexOf(record);
    var fields = def.fields.filter(function (field) { return !field.dummy; });
    var dummies = def.fields.filter(function (field) { return field.dummy; });

    var head = h('div', { class: 'card-head' }, [
      h('h2', { text: def.label }),
      h('div', { style: 'display:flex;gap:8px;align-items:center' },
        (extraActions || []).concat([
          h('span', { class: 'card-note', text: '第 ' + (recordIndex + 1) + ' レコード / ' + def.length + ' 桁' })
        ]))
    ]);

    var grid = h('div', { class: 'field-grid' },
      fields.map(function (field) { return buildFieldControl(record, field, recordIndex); }));

    var children = [head, grid];

    if (dummies.length) {
      children.push(h('div', { class: 'card-body', style: 'border-top:1px solid var(--border);padding-top:12px' }, [
        h('div', { class: 'field-hint', text: 'ダミー領域（' +
          dummies.map(function (d) { return d.pos + '-' + d.end; }).join(', ') +
          '）は書き出し時にそのまま保持されます。' })
      ]));
    }

    children.push(h('div', {
      class: 'card-body',
      style: 'border-top:1px solid var(--border);background:var(--surface-2)'
    }, [
      h('div', { class: 'field-hint', style: 'margin-bottom:6px', text: 'レコード原文（' + def.length + ' 桁）' }),
      appendFixedWidthText(h('div', {
        class: 'raw-preview',
        style: 'font-family:var(--mono);font-size:12px;white-space:pre-wrap;word-break:break-all;color:var(--text-2)'
      }), record.text)
    ]));

    return h('div', { class: 'card' }, children);
  }

  /* ================================================================
     トレーラタブ
     ================================================================ */

  function renderTrailerPanel() {
    var doc = state.doc;
    var panel = $('#panel-trailer');
    var nodes = [];

    var recalcBtn = h('button', {
      type: 'button', class: 'btn btn-sm btn-primary',
      disabled: state.readonly, onclick: doRecalc
    }, [icon(ICON.refresh), '合計を再計算']);

    Zengin.recordsOfKind(doc, 'trailer').forEach(function (record, index) {
      nodes.push(buildRecordCard(record, 'trailer', index === 0 ? [recalcBtn] : []));
    });
    Zengin.recordsOfKind(doc, 'end').forEach(function (record) {
      nodes.push(buildRecordCard(record, 'end'));
    });

    if (!nodes.length) {
      nodes.push(h('div', { class: 'empty-state' }, [
        h('strong', { text: 'トレーラ・レコードがありません' }),
        h('span', { text: 'データ区分 8 / 9 のレコードが含まれていません。' })
      ]));
    }
    panel.replaceChildren.apply(panel, nodes);
  }

  function doRecalc() {
    if (!requireEditable()) return;
    var result;
    applyChange('合計の再計算', function () { result = Zengin.recalcTrailer(state.doc); });
    if (!result || !result.updated) {
      toast('トレーラ・レコードがありません', '合計を書き込む先が見つかりませんでした。', 'warn');
      return;
    }
    renderAll();
    toast('合計を再計算しました',
      num(result.count) + ' 件 / ' + num(result.amount) + ' 円をトレーラに設定しました。', 'ok');
  }

  /* ================================================================
     データ明細タブ
     ================================================================ */

  /**
   * いま「データ明細」タブで扱っているデータ・レコード定義。
   *
   * 入出金取引明細のように口座ごとにレイアウトが変わるファイルでは、
   * 選択中の口座の定義を使う。口座を選んでいない場合は先頭の組に合わせる。
   */
  function currentDataDef() {
    var doc = state.doc;
    var list = Zengin.groups(doc);
    if (state.groupIndex != null && list[state.groupIndex]) return list[state.groupIndex].dataDef;
    if (list.length && Zengin.hasMixedVariants(doc)) return list[0].dataDef;
    return doc.format.records.data;
  }

  /** 表示対象の行（ファイル内の並び順つき）。グループを選んでいれば絞り込む。 */
  function dataRows() {
    var rows = [];
    var no = 0;
    var scope = null;
    if (state.groupIndex != null) {
      var list = Zengin.groups(state.doc);
      var group = list[state.groupIndex];
      if (group) {
        scope = Object.create(null);
        group.data.forEach(function (rec) { scope[rec.id] = true; });
      }
    }
    // レイアウトが口座ごとに異なるファイルでは、表示中の定義に合う行だけを扱う
    var def = currentDataDef();
    var defs = Zengin.hasMixedVariants(state.doc) ? Zengin.dataDefMap(state.doc) : null;

    state.doc.records.forEach(function (rec, index) {
      if (rec.kind !== 'data') return;
      no++;
      if (scope && !scope[rec.id]) return;
      if (defs && (defs[rec.id] || def) !== def) return;
      rows.push({ rec: rec, no: no, index: index });
    });
    return rows;
  }

  /** レイアウト混在時に、いま表示できていないデータレコードの件数。 */
  function hiddenByLayoutCount() {
    if (!Zengin.hasMixedVariants(state.doc)) return 0;
    var def = currentDataDef();
    var defs = Zengin.dataDefMap(state.doc);
    return Zengin.recordsOfKind(state.doc, 'data').filter(function (rec) {
      return (defs[rec.id] || def) !== def;
    }).length;
  }

  function filteredRows() {
    var rows = dataRows();
    var query = state.search.trim();
    if (query) {
      var needle = Charset.normalize(query).toUpperCase();
      rows = rows.filter(function (row) {
        return row.rec.text.toUpperCase().indexOf(needle) >= 0;
      });
    }
    if (state.sortKey) {
      var compare = sortComparator(currentDataDef());
      if (compare) {
        rows = rows.slice().sort(function (a, b) { return compare(a.rec, b.rec); });
      }
    }
    return rows;
  }

  /** 現在の並べ替え条件で、2 つのレコードを比べる関数を作る。 */
  function sortComparator(def) {
    if (!state.sortKey || !def) return null;
    var field = def.byKey[state.sortKey];
    if (!field) return null;
    var dir = state.sortDir;
    return function (a, b) {
      var va = Zengin.readField(a, field);
      var vb = Zengin.readField(b, field);
      if (field.type === 'N') return (Zengin.toNumber(va) - Zengin.toNumber(vb)) * dir;
      return va.localeCompare(vb, 'ja') * dir;
    };
  }

  function visibleColumns() {
    return currentDataDef().fields.filter(function (field) {
      return state.showDummy || !field.hideInTable;
    });
  }

  function renderDataPanel() {
    var panel = $('#panel-data');
    var doc = state.doc;
    var rows = filteredRows();
    var totalRows = dataRows().length;

    var pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > pageCount) state.page = pageCount;
    var start = (state.page - 1) * state.pageSize;
    var pageRows = rows.slice(start, start + state.pageSize);

    var children = [buildDataToolbar()];
    var hidden = hiddenByLayoutCount();
    if (hidden) {
      children.push(h('div', { style: 'padding: 14px 16px 0' }, [
        h('div', { class: 'notice-card' }, [
          h('span', { class: 'notice-icon' }, [svg(ICON.info)]),
          h('div', { class: 'notice-body' }, [
            h('strong', { text: '別のレイアウトのデータ・レコードが ' + num(hidden) + ' 件あります' }),
            h('p', { text: '口座によってデータ・レコードの項目が異なるため、同じ表には並べられません。上の口座選択で切り替えてご覧ください。' })
          ])
        ])
      ]));
    }
    var pending = buildLayoutPendingNotice();
    if (pending) {
      children.push(h('div', { style: 'padding: 14px 16px 0' }, [pending]));
    }
    children.push(buildDataTable(pageRows));
    children.push(buildDataFooter(rows.length, totalRows, pageCount, start, pageRows.length));
    panel.replaceChildren.apply(panel, children);
  }

  function buildDataToolbar() {
    var searchInput = h('input', {
      class: 'input', type: 'search', placeholder: '受取人名・口座番号などで検索',
      value: state.search,
      oninput: function (event) {
        state.search = event.target.value;
        state.page = 1;
        renderDataPanel();
        var box = $('#panel-data .search-box .input');
        if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
      }
    });

    var groupList = Zengin.groups(state.doc);
    var groupSelect = null;
    if (groupList.length > 1) {
      groupSelect = h('select', {
        class: 'select', style: 'height:29px;font-size:12px;max-width:260px',
        title: 'ヘッダー・レコード単位（口座単位）で絞り込みます',
        onchange: function (event) {
          state.groupIndex = event.target.value === '' ? null : parseInt(event.target.value, 10);
          state.page = 1;
          renderDataPanel();
        }
      }, [h('option', {
        value: '', selected: state.groupIndex == null,
        text: 'すべての口座（' + groupList.length + ' 組）'
      })].concat(groupList.map(function (group) {
        return h('option', {
          value: String(group.index), selected: state.groupIndex === group.index,
          text: (group.index + 1) + '. ' + Zengin.groupLabel(state.doc, group) +
            '（' + group.data.length + ' 件）'
        });
      })));
    }

    return h('div', { class: 'table-toolbar' }, [
      h('div', { class: 'search-box' }, [svg(ICON.search), searchInput]),
      groupSelect,
      h('button', {
        type: 'button', class: 'btn btn-sm',
        disabled: state.readonly, onclick: addDataRow
      }, [icon(ICON.plus), '行を追加']),
      h('button', {
        type: 'button', class: 'btn btn-sm', id: 'btn-duplicate-row',
        disabled: state.readonly || !state.selected,
        onclick: duplicateSelectedRow
      }, [icon(ICON.copy), '複製']),
      h('button', {
        type: 'button', class: 'btn btn-sm btn-primary',
        disabled: state.readonly, onclick: doRecalc
      }, [icon(ICON.refresh), '合計を再計算']),
      state.sortKey ? h('button', {
        type: 'button', class: 'btn btn-sm',
        disabled: state.readonly, onclick: applySortToFile
      }, [icon(ICON.sort), '並び順をファイルに反映']) : null,

      h('span', { class: 'toolbar-spacer' }),

      h('label', { class: 'toggle' }, [
        h('input', {
          type: 'checkbox', checked: state.autoHankaku,
          onchange: function (event) { state.autoHankaku = event.target.checked; }
        }), '半角へ自動変換'
      ]),
      h('label', { class: 'toggle' }, [
        h('input', {
          type: 'checkbox', checked: state.showDummy,
          onchange: function (event) { state.showDummy = event.target.checked; renderDataPanel(); }
        }), 'ダミー項目も表示'
      ]),
      h('select', {
        class: 'select', style: 'height:29px;font-size:12px',
        onchange: function (event) { state.pageSize = parseInt(event.target.value, 10); state.page = 1; renderDataPanel(); }
      }, [25, 50, 100, 250, 1000].map(function (size) {
        return h('option', { value: size, selected: state.pageSize === size, text: size + ' 件ずつ' });
      }))
    ]);
  }

  function buildDataTable(pageRows) {
    var doc = state.doc;
    var columns = visibleColumns();

    if (!dataRows().length) {
      return h('div', { class: 'table-scroll' }, [
        h('div', { class: 'empty-state' }, [
          h('strong', { text: 'データレコードがありません' }),
          h('span', { text: '「行を追加」から新しい明細を作成できます。' })
        ])
      ]);
    }
    if (!pageRows.length) {
      return h('div', { class: 'table-scroll' }, [
        h('div', { class: 'empty-state' }, [
          h('strong', { text: '検索条件に一致する行がありません' }),
          h('span', { text: '検索キーワードを変更してください。' })
        ])
      ]);
    }

    var headCells = [h('th', { class: 'col-no' }, [h('span', { text: '#' })])];
    columns.forEach(function (field) {
      headCells.push(h('th', {
        title: field.label + '（' + field.pos + '-' + field.end + ' / ' + field.len + '桁 ' + field.type + '）' +
          (field.hint ? '\n' + field.hint : ''),
        style: 'cursor:pointer',
        onclick: function () { toggleSort(field.key); }
      }, [
        field.label + (state.sortKey === field.key ? (state.sortDir > 0 ? ' ▲' : ' ▼') : ''),
        h('span', { class: 'th-sub', text: field.pos + '-' + field.end + ' · ' + field.len + field.type })
      ]));
    });
    headCells.push(h('th', { class: 'col-actions' }, [h('span', { text: '操作' })]));

    var bodyRows = pageRows.map(function (row) {
      var hasError = (state.issuesByRecord[row.index] || []).some(function (it) { return it.level === 'error'; });
      var cells = [h('td', { class: 'col-no' }, [h('span', { text: String(row.no) })])];

      columns.forEach(function (field) {
        cells.push(buildCell(row, field));
      });

      cells.push(h('td', { class: 'col-actions' }, [
        h('span', null, [
          h('button', {
            type: 'button', class: 'row-btn',
            title: state.readonly ? '閲覧モードでは削除できません' : 'この行を削除',
            disabled: state.readonly,
            onclick: function () { deleteRow(row.rec); }
          }, [icon(ICON.trash, '')])
        ])
      ]));

      return h('tr', { class: hasError ? 'is-flagged' : null, dataset: { rec: row.rec.id } }, cells);
    });

    return h('div', { class: 'table-scroll' }, [
      h('table', { class: 'ztable' }, [
        h('thead', null, [h('tr', null, headCells)]),
        h('tbody', null, bodyRows)
      ])
    ]);
  }

  function buildCell(row, field) {
    var value = Zengin.readField(row.rec, field);
    var display = Zengin.displayValue(row.rec, field);
    var codeText = Zengin.codeLabel(field, value);
    var issue = fieldHasIssue(row.index, field.key);
    var selected = state.selected &&
      state.selected.recordId === row.rec.id && state.selected.fieldKey === field.key;

    var classes = ['cell'];
    if (field.type === 'N') classes.push('is-num');
    if (field.dummy) classes.push('is-dummy');
    if (display === '') classes.push('is-empty');
    if (issue) classes.push('is-invalid');
    if (selected) classes.push('is-selected');

    var content = [];
    if (display !== '') content.push(document.createTextNode(display));
    if (codeText) content.push(h('span', { class: 'code-tag', text: codeText }));

    return h('td', {
      class: classes.join(' '),
      tabindex: '0',
      title: issue ? issue.message : (field.label + '  ' + field.pos + '-' + field.end),
      dataset: { rec: row.rec.id, field: field.key },
      onclick: function (event) { selectCell(event.currentTarget); },
      ondblclick: function (event) { beginEdit(event.currentTarget); }
    }, content);
  }

  function buildDataFooter(shownCount, totalRows, pageCount, start, pageLength) {
    var info = state.search
      ? num(shownCount) + ' 件を表示中（全 ' + num(totalRows) + ' 件中）'
      : num(totalRows) + ' 件';
    var range = pageLength ? '  ·  ' + num(start + 1) + '–' + num(start + pageLength) + ' 行目' : '';

    return h('div', { class: 'table-footer' }, [
      h('span', { text: info + range }),
      pageCount > 1 ? buildPager(pageCount) : h('span', {
        class: 'field-hint',
        text: 'セルをクリックして Enter または直接入力で編集できます'
      })
    ]);
  }

  function buildPager(pageCount) {
    var current = state.page;
    var buttons = [];
    var go = function (page) {
      return function () { state.page = page; renderDataPanel(); $('.table-scroll').scrollTop = 0; };
    };

    buttons.push(h('button', { type: 'button', disabled: current <= 1, onclick: go(current - 1), text: '‹' }));

    var pages = [];
    for (var p = 1; p <= pageCount; p++) {
      if (p <= 2 || p > pageCount - 2 || Math.abs(p - current) <= 1) pages.push(p);
    }
    var last = 0;
    pages.forEach(function (p) {
      if (p - last > 1) buttons.push(h('span', { class: 'pager-gap', text: '…' }));
      buttons.push(h('button', {
        type: 'button', class: p === current ? 'is-current' : null,
        onclick: go(p), text: String(p)
      }));
      last = p;
    });

    buttons.push(h('button', { type: 'button', disabled: current >= pageCount, onclick: go(current + 1), text: '›' }));
    return h('div', { class: 'pager' }, buttons);
  }

  /* ---------------- 並べ替え ---------------- */

  function toggleSort(key) {
    if (state.sortKey === key) {
      if (state.sortDir === 1) state.sortDir = -1;
      else { state.sortKey = null; state.sortDir = 1; }
    } else {
      state.sortKey = key; state.sortDir = 1;
    }
    renderDataPanel();
  }

  /**
   * 画面の並べ替えをファイルの並び順に反映する。
   *
   * データ・レコードは「ヘッダー → データ → トレーラ」の組の中だけで入れ替える。
   * ヘッダー・トレーラ・エンドの位置は動かさないため、口座が複数あるファイルでも
   * レコード構成が崩れない。
   */
  function applySortToFile() {
    if (!state.sortKey) return;
    if (state.search) {
      toast('検索を解除してください', '絞り込み中は並び順を確定できません。', 'warn');
      return;
    }
    var doc = state.doc;
    var groupList = Zengin.groups(doc);
    var target = state.groupIndex != null
      ? groupList.filter(function (g) { return g.index === state.groupIndex; })
      : groupList;
    if (!target.length) return;

    var label = state.groupIndex != null
      ? Zengin.groupLabel(doc, target[0]) + ' の並び順'
      : 'すべての口座の並び順';

    confirmAction('データ・レコードの並び順をファイルに反映します（' + label + '）。\n' +
      'ヘッダー・トレーラの位置は変わりません。よろしいですか？', '並び順を反映する')
      .then(function (ok) {
        if (!ok) return;
        applyChange('並び順の反映', function () {
          // レコードの位置を id で引けるようにしておく（大きなファイルでも速い）
          var positionOf = Object.create(null);
          doc.records.forEach(function (rec, index) { positionOf[rec.id] = index; });

          target.forEach(function (group) {
            var compare = sortComparator(group.dataDef);
            if (!compare) return;
            var slots = group.data.map(function (rec) { return positionOf[rec.id]; });
            var sorted = group.data.slice().sort(compare);
            slots.forEach(function (slot, i) { doc.records[slot] = sorted[i]; });
          });
        });
        state.sortKey = null;
        renderAll();
        toast('並び順をファイルに反映しました',
          'ヘッダー・トレーラの位置は変えずに、データ・レコードだけを並べ替えました。', 'ok');
      });
  }

  /* ---------------- 行操作 ---------------- */

  function insertDataRecord(label, record, afterRecord) {
    var doc = state.doc;
    applyChange(label, function () {
      var index;
      if (afterRecord) {
        index = doc.records.indexOf(afterRecord) + 1;
      } else {
        // 選択中の口座（グループ）の末尾に入れる
        var groupList = Zengin.groups(doc);
        var group = state.groupIndex != null ? groupList[state.groupIndex] : null;
        if (!group) {
          for (var i = groupList.length - 1; i >= 0; i--) {
            if (groupList[i].header) { group = groupList[i]; break; }
          }
        }
        if (group && group.data.length) {
          index = doc.records.indexOf(group.data[group.data.length - 1]) + 1;
        } else if (group && group.trailer) {
          index = doc.records.indexOf(group.trailer);
        } else if (group && group.header) {
          index = group.headerIndex + 1;
        } else {
          index = doc.records.findIndex(function (r) { return r.kind === 'trailer'; });
          if (index < 0) index = doc.records.length;
        }
      }
      doc.records.splice(index, 0, record);
    });
    renderAll();
  }

  function addDataRow() {
    if (!requireEditable()) return;
    insertDataRecord('データ・レコードの追加',
      Zengin.blankRecord(currentDataDefFormat(), 'data'));
    var rows = dataRows();
    state.page = Math.max(1, Math.ceil(rows.length / state.pageSize));
    renderDataPanel();
    toast('データ・レコードを追加しました', '合計の再計算をお忘れなく。', 'ok');
  }

  /** 追加する空レコードは、いま表示している口座のレイアウトに合わせる。 */
  function currentDataDefFormat() {
    var doc = state.doc;
    var def = currentDataDef();
    if (def === doc.format.records.data) return doc.format;
    return { recordLength: doc.format.recordLength, records: { data: def } };
  }

  function duplicateSelectedRow() {
    if (!requireEditable()) return;
    if (!state.selected) return;
    var source = findRecordById(state.selected.recordId);
    if (!source) return;
    var copy = Zengin.makeRecord(source.text, 'data');
    insertDataRecord('行の複製', copy, source);
    toast('行を複製しました', '内容をそのままコピーしました。', 'ok');
  }

  function deleteRow(record) {
    if (!requireEditable()) return;
    var doc = state.doc;
    var index = doc.records.indexOf(record);
    if (index < 0) return;
    var def = Zengin.dataDefMap(doc)[record.id] || doc.format.records.data;
    var nameField = Zengin.fieldByRole(def, 'name');
    var amountFields = Zengin.fieldsByRole(def, 'amount');
    var summary = [
      nameField ? Zengin.readField(record, nameField) : '',
      amountFields.length ? num(Zengin.amountOf(def, record)) + ' 円' : ''
    ].filter(Boolean).join(' / ');

    confirmAction('第 ' + (index + 1) + ' レコードを削除します。' +
      (summary ? '\n' + summary : '') + '\n削除後も「元に戻す」で戻せます。', '削除する')
      .then(function (ok) {
        if (!ok) return;
        applyChange('行の削除', function () { doc.records.splice(index, 1); });
        if (state.selected && state.selected.recordId === record.id) state.selected = null;
        renderAll();
        toast('行を削除しました', '合計の再計算をお忘れなく。元に戻すこともできます。', 'ok');
      });
  }

  function findRecordById(id) {
    var records = state.doc.records;
    for (var i = 0; i < records.length; i++) if (records[i].id === id) return records[i];
    return null;
  }

  /* ---------------- セル編集 ---------------- */

  function selectCell(td) {
    $$('.ztable td.is-selected').forEach(function (el) { el.classList.remove('is-selected'); });
    td.classList.add('is-selected');
    state.selected = { recordId: td.dataset.rec, fieldKey: td.dataset.field };
    td.focus({ preventScroll: true });
    var duplicate = $('#btn-duplicate-row');
    if (duplicate) duplicate.disabled = false;
  }

  function beginEdit(td, initialChar) {
    if (td.querySelector('.cell-editor')) return;
    if (!requireEditable()) return;
    var record = findRecordById(td.dataset.rec);
    var field = currentDataDef().byKey[td.dataset.field];
    if (!record || !field) return;

    var original = Zengin.readField(record, field);
    var input = h('input', {
      class: 'cell-editor' + (field.type === 'N' ? ' is-num' : ''),
      value: initialChar != null ? initialChar : original,
      maxlength: String(field.len * 2)
    });

    var finished = false;
    var onBlur;
    var finish = function (commit, move) {
      // Enter 確定時、入力欄の除去そのものが blur を発火させるため再入を防ぐ
      if (finished || !input.parentNode) return;
      finished = true;
      input.removeEventListener('blur', onBlur);
      var raw = input.value;
      td.replaceChildren();
      if (commit) {
        var next = applyInputValue(field, raw);
        if (next !== original) {
          applyChange(field.label + 'の変更', function () {
            Zengin.setField(record, field, next);
          });
        }
      }
      renderCellContent(td, record, field);
      refreshAfterEdit({ keepSummary: false });
      if (move) moveSelection(td, move.row, move.col);
      else td.focus({ preventScroll: true });
    };

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); finish(true, { row: 1, col: 0 }); }
      else if (event.key === 'Escape') { event.preventDefault(); finish(false); }
      else if (event.key === 'Tab') { event.preventDefault(); finish(true, { row: 0, col: event.shiftKey ? -1 : 1 }); }
    });
    onBlur = function () { finish(true); };
    input.addEventListener('blur', onBlur);

    td.replaceChildren(input);
    input.focus();
    if (initialChar == null) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }

  function renderCellContent(td, record, field) {
    var value = Zengin.readField(record, field);
    var display = Zengin.displayValue(record, field);
    var codeText = Zengin.codeLabel(field, value);
    td.classList.toggle('is-empty', display === '');
    td.replaceChildren();
    if (display !== '') td.appendChild(document.createTextNode(display));
    if (codeText) td.appendChild(h('span', { class: 'code-tag', text: codeText }));
    var index = state.doc.records.indexOf(record);
    td.classList.toggle('is-invalid', !!fieldHasIssue(index, field.key));
  }

  function moveSelection(td, rowDelta, colDelta) {
    var tr = td.parentNode;
    var cells = Array.prototype.filter.call(tr.children, function (c) { return c.classList.contains('cell'); });
    var col = cells.indexOf(td);
    var target = null;

    if (rowDelta) {
      var rows = Array.prototype.slice.call(tr.parentNode.children);
      var next = rows[rows.indexOf(tr) + rowDelta];
      if (next) {
        var nextCells = Array.prototype.filter.call(next.children, function (c) { return c.classList.contains('cell'); });
        target = nextCells[col];
      }
    } else if (colDelta) {
      target = cells[col + colDelta];
    }
    if (target) { selectCell(target); target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    else td.focus({ preventScroll: true });
  }

  function onTableKeydown(event) {
    var td = event.target.closest ? event.target.closest('td.cell') : null;
    if (!td || event.target.classList.contains('cell-editor')) return;

    var key = event.key;
    if (key === 'Enter' || key === 'F2') { event.preventDefault(); beginEdit(td); return; }
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      if (!requireEditable()) return;
      var record = findRecordById(td.dataset.rec);
      var field = currentDataDef().byKey[td.dataset.field];
      if (record && field && Zengin.readField(record, field) !== '') {
        applyChange(field.label + 'の消去', function () {
          Zengin.setField(record, field, '');
        });
        renderCellContent(td, record, field);
        refreshAfterEdit({});
      }
      return;
    }
    var moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[key]) { event.preventDefault(); moveSelection(td, moves[key][0], moves[key][1]); return; }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      beginEdit(td, key);
    }
  }

  /* ================================================================
     生データタブ
     ================================================================ */

  var RAW_PAGE_SIZE = 100;

  function renderRawPanel() {
    var doc = state.doc;
    var panel = $('#panel-raw');
    var pageCount = Math.max(1, Math.ceil(doc.records.length / RAW_PAGE_SIZE));
    if (state.rawPage > pageCount) state.rawPage = pageCount;
    var start = (state.rawPage - 1) * RAW_PAGE_SIZE;
    var slice = doc.records.slice(start, start + RAW_PAGE_SIZE);

    var list = h('div', { class: 'raw-list' }, [buildRuler(doc.recordLength)].concat(
      slice.map(function (record, i) { return buildRawRow(record, start + i); })
    ));

    var children = [
      h('div', { class: 'table-toolbar' }, [
        h('span', { class: 'field-hint', text: '項目の区切りを交互の背景色で表示しています。行をクリックすると内訳が表示されます。' }),
        h('span', { class: 'toolbar-spacer' }),
        pageCount > 1 ? h('span', { class: 'field-hint', text: num(start + 1) + '–' + num(start + slice.length) + ' / ' + num(doc.records.length) + ' レコード' }) : null,
        pageCount > 1 ? h('div', { class: 'pager' }, [
          h('button', { type: 'button', disabled: state.rawPage <= 1, text: '‹', onclick: function () { state.rawPage--; renderRawPanel(); } }),
          h('button', { type: 'button', class: 'is-current', text: state.rawPage + ' / ' + pageCount, disabled: true }),
          h('button', { type: 'button', disabled: state.rawPage >= pageCount, text: '›', onclick: function () { state.rawPage++; renderRawPanel(); } })
        ]) : null
      ]),
      h('div', { class: 'raw-scroll' }, [list])
    ];

    var detail = buildRawDetail();
    if (detail) children.push(detail);
    panel.replaceChildren.apply(panel, children);
  }

  function buildRuler(length) {
    // 十の位の行は、桁数の末尾がその桁位置に来るよう右詰めで置く
    // （例: 「10」は 9-10 桁目、「120」は 118-120 桁目）
    var marks = new Array(length).fill(' ');
    for (var t = 10; t <= length; t += 10) {
      var label = String(t);
      for (var k = 0; k < label.length; k++) {
        var col = t - label.length + k + 1;
        if (col >= 1) marks[col - 1] = label.charAt(k);
      }
    }
    var tens = marks.join('');
    var ones = '';
    for (var i = 1; i <= length; i++) ones += String(i % 10);
    return h('div', { class: 'raw-ruler' }, [
      h('span', { class: 'raw-gutter', text: '桁' }),
      h('span', { class: 'raw-body', style: 'line-height:1.35' }, [
        h('div', { text: tens }),
        h('div', { text: ones })
      ])
    ]);
  }

  function buildRawRow(record, index) {
    var doc = state.doc;
    var def = doc.format.records[record.kind];
    var body = h('span', { class: 'raw-body' });

    if (def) {
      def.fields.forEach(function (field, i) {
        var raw = Zengin.rawField(record, field);
        var bad = Charset.findInvalidChars(raw).length > 0;
        var cls = 'raw-seg' + (i % 2 ? ' tint' : '') + (field.dummy ? ' dummy' : '') + (bad ? ' bad' : '');
        var seg = h('span', {
          class: cls,
          title: field.label + '  ' + field.pos + '-' + field.end + '（' + field.len + '桁 ' + field.type + '）'
        });
        appendFixedWidthText(seg, raw);
        body.appendChild(seg);
      });
      var extra = record.text.length > def.length ? record.text.slice(def.length) : '';
      if (extra) {
        appendFixedWidthText(
          body.appendChild(h('span', { class: 'raw-seg bad', title: '規定桁数を超えた部分' })), extra);
      }
    } else {
      appendFixedWidthText(
        body.appendChild(h('span', { class: 'raw-seg bad', title: 'データ区分が不正なレコード' })), record.text);
    }

    return h('div', {
      class: 'raw-row' + (state.rawSelectedId === record.id ? ' is-active' : ''),
      dataset: { kind: record.kind, rec: record.id },
      onclick: function () { state.rawSelectedId = record.id; renderRawPanel(); }
    }, [
      h('span', { class: 'raw-gutter', text: String(index + 1) }),
      body
    ]);
  }

  function buildRawDetail() {
    if (!state.rawSelectedId) return null;
    var record = findRecordById(state.rawSelectedId);
    if (!record) return null;
    var def = state.doc.format.records[record.kind];
    if (!def) return null;
    var index = state.doc.records.indexOf(record);

    var rows = def.fields.map(function (field) {
      var raw = Zengin.rawField(record, field);
      var codeText = Zengin.codeLabel(field, Zengin.readField(record, field));
      return h('tr', null, [
        h('td', { class: 'mono', text: field.pos + '-' + field.end }),
        h('td', { class: 'mono', text: field.len + field.type }),
        h('td', { text: field.label }),
        appendFixedWidthText(h('td', { class: 'mono val' }), '[' + raw + ']'),
        h('td', { text: Zengin.displayValue(record, field) + (codeText ? '（' + codeText + '）' : '') })
      ]);
    });

    return h('div', { class: 'raw-detail' }, [
      h('h3', { text: '第 ' + (index + 1) + ' レコード — ' + def.label }),
      h('table', null, [
        h('thead', null, [h('tr', null, [
          h('th', { text: '桁位置' }), h('th', { text: '桁/型' }), h('th', { text: '項目名' }),
          h('th', { text: '原文' }), h('th', { text: '値' })
        ])]),
        h('tbody', null, rows)
      ])
    ]);
  }

  /* ================================================================
     検証タブ
     ================================================================ */

  var LEVEL_META = {
    error: { title: 'エラー（修正が必要）', icon: ICON.alert },
    warn: { title: '警告（確認をおすすめします）', icon: ICON.alert },
    info: { title: '情報', icon: ICON.info }
  };

  function renderIssuesPanel() {
    var panel = $('#panel-issues');
    var issues = state.issues;

    if (!issues.length) {
      panel.replaceChildren(h('div', { class: 'result-ok' }, [
        svg(ICON.check),
        h('div', null, [
          h('strong', { text: '問題は見つかりませんでした' }),
          h('span', { text: validatedScopeText() })
        ])
      ]));
      return;
    }

    var counts = Zengin.countByLevel(issues);
    var nodes = [h('div', { class: 'issue-summary' }, [
      counts.error ? h('span', { class: 'chip chip-err' }, [icon(ICON.alert), 'エラー ' + counts.error + ' 件']) : null,
      counts.warn ? h('span', { class: 'chip chip-warn' }, [icon(ICON.alert), '警告 ' + counts.warn + ' 件']) : null,
      counts.info ? h('span', { class: 'chip chip-info' }, [icon(ICON.info), '情報 ' + counts.info + ' 件']) : null
    ].concat(buildRepairActions(issues)))];

    ['error', 'warn', 'info'].forEach(function (level) {
      var list = issues.filter(function (it) { return it.level === level; });
      if (!list.length) return;
      nodes.push(h('h2', { class: 'issue-group-title', text: LEVEL_META[level].title + '  ' + list.length + ' 件' }));
      var shown = list.slice(0, MAX_ISSUES_SHOWN);
      nodes.push(h('ul', { class: 'issue-list' }, shown.map(function (item) {
        return buildIssueItem(item, level);
      })));
      if (list.length > shown.length) {
        nodes.push(h('p', { class: 'field-hint', text: 'ほか ' + num(list.length - shown.length) + ' 件は省略しました。' }));
      }
    });

    panel.replaceChildren.apply(panel, nodes);
  }

  /** その場で直せる問題に、修正操作を添える。 */
  function buildRepairActions(issues) {
    var actions = [];
    var hasTotals = issues.some(function (it) {
      return it.hint && it.hint.indexOf('合計を再計算') >= 0;
    });
    if (hasTotals) {
      actions.push(h('button', {
        type: 'button', class: 'btn btn-sm btn-primary',
        disabled: state.readonly, onclick: doRecalc
      }, [icon(ICON.refresh), '合計を再計算']));
    }
    var hasShort = issues.some(function (it) {
      return it.hint && it.hint.indexOf('レコード長をそろえる') >= 0;
    });
    if (hasShort) {
      actions.push(h('button', {
        type: 'button', class: 'btn btn-sm', id: 'btn-normalize-length',
        disabled: state.readonly, onclick: doNormalizeLengths
      }, [icon(ICON.check), 'レコード長をそろえる']));
    }
    return actions;
  }

  function doNormalizeLengths() {
    if (!requireEditable()) return;
    var fixed = 0;
    applyChange('レコード長をそろえる', function () {
      fixed = Zengin.normalizeRecordLengths(state.doc);
    });
    if (!fixed) {
      toast('補うレコードはありませんでした', null, 'info');
      return;
    }
    renderAll();
    toast('レコード長をそろえました',
      num(fixed) + ' 件のレコードの末尾を空白で補いました。', 'ok');
  }

  function buildIssueItem(item, level) {
    var jump = null;
    if (item.recordIndex != null && state.doc.records[item.recordIndex]) {
      jump = h('button', {
        type: 'button', class: 'issue-loc',
        onclick: function () { jumpToRecord(item.recordIndex, item.fieldKey); }
      }, ['第 ' + (item.recordIndex + 1) + ' レコードへ移動', icon(ICON.arrow)]);
    }
    return h('li', { class: 'issue level-' + level }, [
      h('span', { class: 'issue-icon' }, [svg(LEVEL_META[level].icon)]),
      h('div', { class: 'issue-main' }, [
        h('div', { class: 'issue-msg', text: item.message }),
        item.hint ? h('div', { class: 'issue-hint', text: item.hint }) : null,
        jump
      ])
    ]);
  }

  function jumpToRecord(recordIndex, fieldKey) {
    var record = state.doc.records[recordIndex];
    if (!record) return;

    if (record.kind === 'data') {
      state.search = '';
      state.sortKey = null;
      var rows = dataRows();
      var position = rows.findIndex(function (row) { return row.rec.id === record.id; });
      if (position >= 0) {
        state.page = Math.floor(position / state.pageSize) + 1;
        state.selected = fieldKey ? { recordId: record.id, fieldKey: fieldKey } : null;
      }
      setTab('data');
      renderDataPanel();
      var td = $('#panel-data td.cell[data-rec="' + record.id + '"]' +
        (fieldKey ? '[data-field="' + fieldKey + '"]' : ''));
      if (td) { selectCell(td); td.scrollIntoView({ block: 'center', inline: 'center' }); }
    } else if (record.kind === 'header') {
      setTab('header');
    } else if (record.kind === 'trailer' || record.kind === 'end') {
      setTab('trailer');
    } else {
      state.rawSelectedId = record.id;
      state.rawPage = Math.floor(recordIndex / RAW_PAGE_SIZE) + 1;
      setTab('raw');
      renderRawPanel();
    }
  }

  /* ================================================================
     書き出し
     ================================================================ */

  function baseFileName() {
    var name = state.doc.fileName || 'zengin';
    return name.replace(/\.[^.]+$/, '');
  }

  /** EBCDIC 宣言のファイルは、正しい形で書き出せないため止める。 */
  function blockedByEbcdic() {
    if (!Zengin.usesEbcdic(state.doc)) return false;
    toast('EBCDIC のファイルは書き出せません',
      '本ツールは EBCDIC の変換に対応していません。誤った内容のファイルを作らないため、書き出しを止めました。', 'error');
    setTab('issues');
    return true;
  }

  function exportZengin() {
    if (blockedByEbcdic()) return;
    var doc = state.doc;
    var summary = Zengin.summarize(doc);
    confirmExport({
      meta: [
        ['形式', doc.format.name + '（種別コード ' + doc.format.code + '・' + doc.recordLength + ' 桁）'],
        ['レコード数', num(doc.records.length) + ' 件（うちデータ ' + num(summary.count) + ' 件）'],
        ['文字コード / 改行', Charset.getCodec(doc.encoding).label + ' / ' +
          (doc.lineEnding === 'NONE' ? '改行なし' : doc.lineEnding)]
      ]
    }).then(function (ok) {
      if (!ok) return;
      var bytes = Zengin.serialize(doc, { encoding: doc.encoding, lineEnding: doc.lineEnding });
      download(bytes, baseFileName() + '_' + timestamp() + '.txt', 'text/plain');
      state.dirty = false;
      renderDocbar();
      toast('参考ファイルとして書き出しました',
        doc.records.length + ' レコード / ' + formatBytes(bytes.length) +
        '。提出前に金融機関の仕様書と照合してください。', 'ok');
    });
  }

  function exportCsv(excel) {
    if (blockedByEbcdic()) return;
    var doc = state.doc;
    var layouts = Zengin.hasMixedVariants(doc)
      ? 'レイアウトごとに区切って出力します'
      : '1 つの表として出力します';
    confirmExport({
      meta: [
        ['内容', 'データ・レコードの一覧（' + num(Zengin.summarize(doc).count) + ' 件）／' + layouts],
        ['形式', excel
          ? 'Excel 用（先頭 0 が消えないよう ="0009" の形で出力）'
          : '標準（値をそのまま出力）'],
        ['文字コード', 'UTF-8（BOM 付き）'],
        ['用途', '確認・照合用。全銀形式へ戻す機能はありません']
      ]
    }).then(function (ok) { if (ok) writeCsv(excel); });
  }

  function writeCsv(excel) {
    var doc = state.doc;
    var csv = Zengin.toCsv(doc, { includeDummy: state.showDummy, excel: excel });
    // 見出しに漢字を含むため Shift_JIS では表現できない。
    // 先頭に BOM を付けた UTF-8 にすると Excel でも文字化けせずに開ける。
    var bytes = new TextEncoder().encode('\uFEFF' + csv);
    download(bytes, baseFileName() + '_明細' + (excel ? '_Excel用' : '') + '_' +
      timestamp() + '.csv', 'text/csv');
    toast('参考ファイルとして CSV を書き出しました',
      Zengin.summarize(doc).count + ' 件（' + (excel ? 'Excel 用' : '標準') + ' / UTF-8 BOM 付き）', 'ok');
  }

  /* ================================================================
     ヘルプ
     ================================================================ */

  function buildLayoutTables() {
    var container = document.createElement('div');
    Formats.listFormats().forEach(function (fmt) {
      container.appendChild(h('h4', { text: fmt.name + '（種別コード ' + fmt.code + '） — ' + fmt.recordLength + ' 桁' }));
      container.appendChild(h('p', { text: fmt.description }));
      Zengin.KIND_ORDER.forEach(function (kind) {
        var def = fmt.records[kind];
        if (!def) return;
        container.appendChild(h('p', {
          style: 'margin:12px 0 4px;font-weight:650;color:var(--text)',
          text: def.label + '（データ区分 ' + def.kubun + '）'
        }));
        container.appendChild(h('table', null, [
          h('thead', null, [h('tr', null, [
            h('th', { class: 'mono', text: '桁位置' }),
            h('th', { class: 'mono', text: '桁数' }),
            h('th', { text: '項目名' }),
            h('th', { text: '属性' }),
            h('th', { text: '備考' })
          ])]),
          h('tbody', null, def.fields.map(function (field) {
            var note = [];
            if (field.fixed != null) note.push('固定値「' + field.fixed + '」');
            if (field.required) note.push('必須');
            if (field.codes) {
              note.push(Object.keys(field.codes).map(function (c) {
                return c + '=' + field.codes[c];
              }).join('、'));
            }
            if (field.hint) note.push(field.hint);
            return h('tr', null, [
              h('td', { class: 'mono', text: field.pos + '-' + field.end }),
              h('td', { class: 'mono', text: String(field.len) }),
              h('td', { text: field.label }),
              h('td', { text: field.type === 'N' ? '数字' : '文字' }),
              h('td', { style: 'font-size:11.5px;color:var(--text-2)', text: note.join(' / ') })
            ]);
          }))
        ]));
      });
    });
    return container;
  }

  function initHelp() {
    var nav = $('#help-nav');
    var content = $('#help-content');

    var show = function (id) {
      var section = Help.SECTIONS.find(function (s) { return s.id === id; });
      if (!section) return;
      content.innerHTML = section.html;
      var slot = $('#help-layout-tables', content);
      if (slot) slot.appendChild(buildLayoutTables());
      content.scrollTop = 0;
      $$('button', nav).forEach(function (btn) {
        btn.classList.toggle('is-active', btn.dataset.section === id);
      });
    };

    nav.replaceChildren.apply(nav, Help.SECTIONS.map(function (section) {
      return h('button', {
        type: 'button', dataset: { section: section.id },
        text: section.title,
        onclick: function () { show(section.id); }
      });
    }));
    show(Help.SECTIONS[0].id);

    $('#btn-help').addEventListener('click', function () {
      $('#help-dialog').showModal();
    });
    var more = $('#btn-disclaimer-more');
    if (more) {
      more.addEventListener('click', function () {
        show('disclaimer');
        $('#help-dialog').showModal();
      });
    }
  }

  /* ================================================================
     初期化
     ================================================================ */

  function initSamples() {
    var host = $('#sample-chips');
    var groupNames = [];
    Samples.CATALOG.forEach(function (entry) {
      if (groupNames.indexOf(entry.group) < 0) groupNames.push(entry.group);
    });

    var nodes = [];
    groupNames.forEach(function (name) {
      nodes.push(h('div', { class: 'sample-group' }, [
        h('span', { class: 'sample-group-label', text: name }),
        h('div', { class: 'sample-group-items' },
          Samples.CATALOG.filter(function (e) { return e.group === name; }).map(function (entry) {
            return h('button', {
              type: 'button', class: 'sample-chip',
              onclick: function () {
                var bytes = Samples.build(entry.code, { withResult: entry.withResult });
                loadBytes(bytes, 'サンプル_' + entry.label + '.txt');
              }
            }, [
              h('strong', { text: entry.label }),
              h('span', { text: entry.note })
            ]);
          }))
      ]));
    });
    host.replaceChildren.apply(host, nodes);
  }

  function initDragAndDrop() {
    var zone = $('#dropzone');
    zone.addEventListener('click', function () { $('#file-input').click(); });
    zone.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#file-input').click(); }
    });

    var depth = 0;
    document.addEventListener('dragenter', function (event) {
      if (!event.dataTransfer || Array.prototype.indexOf.call(event.dataTransfer.types, 'Files') < 0) return;
      event.preventDefault();
      depth++;
      zone.classList.add('is-dragging');
    });
    document.addEventListener('dragover', function (event) {
      if (!event.dataTransfer || Array.prototype.indexOf.call(event.dataTransfer.types, 'Files') < 0) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    document.addEventListener('dragleave', function () {
      depth = Math.max(0, depth - 1);
      if (!depth) zone.classList.remove('is-dragging');
    });
    document.addEventListener('drop', function (event) {
      if (!event.dataTransfer || !event.dataTransfer.files.length) return;
      event.preventDefault();
      depth = 0;
      zone.classList.remove('is-dragging');
      var file = event.dataTransfer.files[0];
      guardUnsaved('読み込む').then(function (ok) { if (ok) readFile(file); });
    });
  }

  function initMenus() {
    $$('[data-menu]').forEach(function (menu) {
      var trigger = $('[data-menu-trigger]', menu);
      trigger.addEventListener('click', function (event) {
        event.stopPropagation();
        var open = menu.classList.toggle('is-open');
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
    document.addEventListener('click', function () {
      $$('[data-menu].is-open').forEach(function (menu) {
        menu.classList.remove('is-open');
        $('[data-menu-trigger]', menu).setAttribute('aria-expanded', 'false');
      });
    });
  }

  function requireDoc(fn) {
    return function () {
      if (!state.doc) {
        toast('ファイルが読み込まれていません', '「ファイルを開く」またはサンプルからお試しください。', 'warn');
        return;
      }
      fn();
    };
  }

  function init() {
    initTheme();
    initSamples();
    initDragAndDrop();
    initMenus();
    initHelp();

    $('#btn-home').addEventListener('click', function () {
      guardUnsaved('ホームに戻る').then(function (ok) {
        if (!ok) return;
        state.doc = null;
        state.rawBytes = null;
        state.baseline = null;
        state.dirty = false;
        state.issues = [];
        state.issuesByRecord = {};
        history.undo.length = 0;
        history.redo.length = 0;
        document.body.dataset.view = 'welcome';
        $('#workspace').hidden = true;
        setTab('summary');
        window.scrollTo(0, 0);
      });
    });
    $('#btn-open').addEventListener('click', function () {
      guardUnsaved('読み込む').then(function (ok) { if (ok) $('#file-input').click(); });
    });
    $('#file-input').addEventListener('change', function (event) {
      readFile(event.target.files[0]);
      event.target.value = '';
    });
    $('#btn-theme').addEventListener('click', function () {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    $('#diff-close').addEventListener('click', function () { $('#diff-dialog').close(); });
    $('#btn-save-zengin').addEventListener('click', requireDoc(exportZengin));
    $('#btn-save-csv').addEventListener('click', requireDoc(function () { exportCsv(true); }));
    $('#btn-save-csv-plain').addEventListener('click', requireDoc(function () { exportCsv(false); }));

    $('#tabs').addEventListener('click', function (event) {
      var tab = event.target.closest('.tab');
      if (tab) setTab(tab.dataset.tab);
    });
    $('#panel-data').addEventListener('keydown', onTableKeydown);

    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (state.doc) exportZengin();
      }
      if (event.key === 'F1') { event.preventDefault(); $('#help-dialog').showModal(); }
      if (!state.doc || state.readonly) return;
      var mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoChange(); else undoChange();
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoChange();
      }
    });

    window.addEventListener('beforeunload', function (event) {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  // 動作確認（tools/browser-test.mjs）から内部状態を読むための入口
  window.__zenginDoc = function () { return state.doc; };
  window.__zenginKinds = function () {
    return state.doc ? state.doc.records.map(function (r) { return r.kind.charAt(0); }).join('') : '';
  };
  window.__zenginDataCount = function () {
    return state.doc ? Zengin.recordsOfKind(state.doc, 'data').length : 0;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

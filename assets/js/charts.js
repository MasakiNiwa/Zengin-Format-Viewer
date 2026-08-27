/*!
 * charts.js - 分析タブで使う簡単な図（外部ライブラリなし・インライン SVG）
 *
 * 使うのは横棒グラフと縦棒グラフの 2 種類だけ。
 * 分類名は軸ラベルが担うため、色は識別に使わず 1 色で描く。
 * 系列が 2 つになるのは入金・出金を並べるときだけで、そこには凡例を付ける。
 */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, children) {
    var node = document.createElementNS(NS, name);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] == null) return;
        node.setAttribute(key, String(attrs[key]));
      });
    }
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function text(value, attrs) {
    var node = el('text', attrs);
    node.textContent = value;
    return node;
  }

  function div(className, content) {
    var node = document.createElement('div');
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }

  function comma(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** 軸の目盛りに使う切りのよい上限を求める。 */
  function niceMax(value) {
    if (value <= 0) return 1;
    var exp = Math.pow(10, Math.floor(Math.log10(value)));
    var scaled = value / exp;
    var step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
    return step * exp;
  }

  /**
   * 図とその表を切り替えられる入れ物を作る。
   *
   * SVG を拡大縮小すると文字まで伸び縮みして読みにくくなるため、
   * 置かれた場所の幅を実測し、その幅ちょうどで描き直す。
   */
  function figure(options, buildSvg, buildTable) {
    var wrap = div('chart');
    var head = div('chart-head');
    var titles = div('chart-titles');
    titles.appendChild(div('chart-title', options.title));
    if (options.subtitle) titles.appendChild(div('chart-subtitle', options.subtitle));
    head.appendChild(titles);

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-sm';
    toggle.textContent = '表で見る';
    head.appendChild(toggle);
    wrap.appendChild(head);

    var body = div('chart-body');
    var tooltip = div('chart-tooltip');
    tooltip.hidden = true;
    body.appendChild(tooltip);
    wrap.appendChild(body);

    var current = null;
    var lastWidth = 0;
    var draw = function () {
      // clientWidth は左右の余白を含むため、実際に描ける幅を求める
      var style = window.getComputedStyle(body);
      var inner = body.clientWidth -
        (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      var width = Math.max(320, Math.round(inner) || 700);
      if (current && Math.abs(width - lastWidth) < 6) return;
      lastWidth = width;
      var svg = buildSvg(width, tooltip, body);
      if (current) body.replaceChild(svg, current);
      else body.insertBefore(svg, tooltip);
      current = svg;
    };
    draw();
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(function () { draw(); }).observe(body);
    }

    var table = null;
    toggle.addEventListener('click', function () {
      var showTable = !table || table.hidden;
      if (!table) {
        table = buildTable();
        table.className = 'chart-table';
        wrap.appendChild(table);
      }
      table.hidden = !showTable;
      body.hidden = showTable;
      toggle.textContent = showTable ? '図で見る' : '表で見る';
    });
    return wrap;
  }

  /** マウスを乗せたときに値を出す。 */
  function attachTooltip(target, tooltip, body, label) {
    target.addEventListener('mouseenter', function () {
      tooltip.textContent = label;
      tooltip.hidden = false;
    });
    target.addEventListener('mousemove', function (event) {
      var rect = body.getBoundingClientRect();
      var x = event.clientX - rect.left;
      var y = event.clientY - rect.top;
      tooltip.style.left = Math.min(Math.max(x + 12, 4), rect.width - 8) + 'px';
      tooltip.style.top = Math.max(y - 34, 4) + 'px';
    });
    target.addEventListener('mouseleave', function () { tooltip.hidden = true; });
  }

  /**
   * 横棒グラフ。分類名が長い日本語でも読めるよう、ラベルは左に置く。
   * @param {{title, subtitle, rows:[{label, value, note}], unit, valueLabel}} options
   */
  function barChart(options) {
    var rows = options.rows.slice(0, options.limit || 12);
    var unit = options.unit || '';
    var max = niceMax(Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([0])));

    return figure(options, function (W, tooltip, body) {
      var hasNote = rows.some(function (r) { return r.note; });
      var LABEL_W = Math.min(options.labelWidth || 190, Math.round(W * 0.36));
      var VALUE_W = Math.min(116, Math.round(W * 0.2));
      var NOTE_W = hasNote ? Math.min(96, Math.round(W * 0.16)) : 0;
      var ROW_H = 30;
      var BAR_H = 14;          // 24px 以下に抑える
      var PAD_TOP = 6;
      var plotX = LABEL_W + 12;
      var plotW = Math.max(40, W - plotX - VALUE_W - NOTE_W);
      var H = PAD_TOP * 2 + rows.length * ROW_H;
      var svg = el('svg', {
        viewBox: '0 0 ' + W + ' ' + H, width: W, height: H,
        role: 'img', 'aria-label': options.title, class: 'chart-svg'
      });

      // 目盛り（控えめな実線）
      [0, 0.5, 1].forEach(function (ratio) {
        var x = plotX + plotW * ratio;
        svg.appendChild(el('line', {
          x1: x, y1: PAD_TOP, x2: x, y2: H - PAD_TOP, class: 'chart-grid'
        }));
      });

      rows.forEach(function (row, index) {
        var y = PAD_TOP + index * ROW_H;
        var cy = y + ROW_H / 2;
        var width = max ? Math.max(row.value > 0 ? 3 : 0, (row.value / max) * plotW) : 0;

        svg.appendChild(text(row.label, {
          x: LABEL_W, y: cy, 'text-anchor': 'end', 'dominant-baseline': 'central',
          class: 'chart-label'
        }));

        var bar = el('rect', {
          x: plotX, y: cy - BAR_H / 2, width: width, height: BAR_H,
          rx: 4, class: 'chart-bar'
        });
        // 棒の始点は角を落とさない（基線側は直角）
        if (width > 4) {
          bar = el('path', {
            d: 'M' + plotX + ' ' + (cy - BAR_H / 2) +
               'H' + (plotX + width - 4) + 'a4 4 0 0 1 4 4v' + (BAR_H - 8) +
               'a4 4 0 0 1 -4 4H' + plotX + 'z',
            class: 'chart-bar'
          });
        }
        svg.appendChild(bar);
        attachTooltip(bar, tooltip, body,
          row.label + '：' + comma(row.value) + unit + (row.note ? '（' + row.note + '）' : ''));

        // 値は棒の先に直接置く
        svg.appendChild(text(comma(row.value) + unit, {
          x: plotX + width + 8, y: cy, 'dominant-baseline': 'central', class: 'chart-value'
        }));
        if (row.note && NOTE_W) {
          svg.appendChild(text(row.note, {
            x: W, y: cy, 'text-anchor': 'end', 'dominant-baseline': 'central',
            class: 'chart-note'
          }));
        }
      });
      return svg;
    }, function () {
      var table = document.createElement('table');
      var thead = document.createElement('thead');
      var hr = document.createElement('tr');
      [options.categoryLabel || '分類', (options.valueLabel || '値') + (unit ? '（' + unit + '）' : ''),
        options.noteLabel || ''].forEach(function (label, i) {
        if (i === 2 && !rows.some(function (r) { return r.note; })) return;
        var th = document.createElement('th');
        th.textContent = label;
        if (i === 1) th.style.textAlign = 'right';
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = document.createElement('tbody');
      rows.forEach(function (row) {
        var tr = document.createElement('tr');
        var td1 = document.createElement('td');
        td1.textContent = row.label;
        var td2 = document.createElement('td');
        td2.textContent = comma(row.value);
        td2.style.textAlign = 'right';
        tr.appendChild(td1);
        tr.appendChild(td2);
        if (rows.some(function (r) { return r.note; })) {
          var td3 = document.createElement('td');
          td3.textContent = row.note || '';
          tr.appendChild(td3);
        }
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      return table;
    });
  }

  /**
   * 縦棒グラフ。日付ごとの推移に使う。
   * @param {{title, subtitle, categories:string[], series:[{name, values, slot}], unit}} options
   */
  function columnChart(options) {
    var categories = options.categories;
    var series = options.series;
    var unit = options.unit || '';
    var maxValue = 0;
    series.forEach(function (s) {
      s.values.forEach(function (v) { if (v > maxValue) maxValue = v; });
    });
    var max = niceMax(maxValue);

    return figure(options, function (W, tooltip, body) {
      var H = 250;
      var LEFT = 74;
      var RIGHT = 10;
      var TOP = 14;
      var BOTTOM = 40;
      var plotW = W - LEFT - RIGHT;
      var plotH = H - TOP - BOTTOM;
      var band = plotW / Math.max(categories.length, 1);
      // 系列ごとの棒。隣り合う棒のあいだは 2px の余白をとる
      var barW = Math.min(24, Math.max(4, (band - 6) / series.length - 2));
      var svg = el('svg', {
        viewBox: '0 0 ' + W + ' ' + H, width: W, height: H,
        role: 'img', 'aria-label': options.title, class: 'chart-svg'
      });

      [0, 0.25, 0.5, 0.75, 1].forEach(function (ratio) {
        var y = TOP + plotH * (1 - ratio);
        svg.appendChild(el('line', { x1: LEFT, y1: y, x2: W - RIGHT, y2: y, class: 'chart-grid' }));
        svg.appendChild(text(comma(max * ratio), {
          x: LEFT - 8, y: y, 'text-anchor': 'end', 'dominant-baseline': 'central', class: 'chart-axis'
        }));
      });

      var labelEvery = Math.ceil(categories.length / 12);
      categories.forEach(function (category, index) {
        var bandX = LEFT + band * index;
        var groupW = barW * series.length + 2 * (series.length - 1);
        var startX = bandX + (band - groupW) / 2;

        series.forEach(function (s, si) {
          var value = s.values[index] || 0;
          var height = max ? (value / max) * plotH : 0;
          if (height <= 0) return;
          var x = startX + si * (barW + 2);
          var y = TOP + plotH - height;
          var r = Math.min(4, height);
          var bar = el('path', {
            d: 'M' + x + ' ' + (y + r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r +
               'h' + (barW - r * 2) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r +
               'V' + (TOP + plotH) + 'H' + x + 'z',
            class: 'chart-bar slot-' + (s.slot || 1)
          });
          svg.appendChild(bar);
          attachTooltip(bar, tooltip, body,
            category + '  ' + s.name + '：' + comma(value) + unit);
        });

        if (index % labelEvery === 0) {
          svg.appendChild(text(category, {
            x: bandX + band / 2, y: H - BOTTOM + 18, 'text-anchor': 'middle', class: 'chart-axis'
          }));
        }
      });

      svg.appendChild(el('line', {
        x1: LEFT, y1: TOP + plotH, x2: W - RIGHT, y2: TOP + plotH, class: 'chart-axis-line'
      }));
      return svg;
    }, function () {
      var table = document.createElement('table');
      var thead = document.createElement('thead');
      var hr = document.createElement('tr');
      var th0 = document.createElement('th');
      th0.textContent = options.categoryLabel || '日付';
      hr.appendChild(th0);
      series.forEach(function (s) {
        var th = document.createElement('th');
        th.textContent = s.name + (unit ? '（' + unit + '）' : '');
        th.style.textAlign = 'right';
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = document.createElement('tbody');
      categories.forEach(function (category, index) {
        var tr = document.createElement('tr');
        var td = document.createElement('td');
        td.textContent = category;
        tr.appendChild(td);
        series.forEach(function (s) {
          var cell = document.createElement('td');
          cell.textContent = comma(s.values[index] || 0);
          cell.style.textAlign = 'right';
          tr.appendChild(cell);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      return table;
    });
  }

  /** 系列が 2 つ以上のときに添える凡例。 */
  function legend(series) {
    var wrap = div('chart-legend');
    series.forEach(function (s) {
      var item = div('chart-legend-item');
      var swatch = div('chart-swatch slot-' + (s.slot || 1));
      item.appendChild(swatch);
      item.appendChild(div('chart-legend-label', s.name));
      wrap.appendChild(item);
    });
    return wrap;
  }

  global.ZenginCharts = {
    barChart: barChart,
    columnChart: columnChart,
    legend: legend,
    comma: comma
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* Shared behaviour: recipe browser, ingredient scaling / unit toggle, random dish. No dependencies. */
(function () {
  'use strict';
  var ROOT = window.ROOT || '';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

  /* ---------------- random dish ---------------- */
  var rnd = $('randomDish');
  if (rnd && window.INDEX) {
    rnd.addEventListener('click', function () {
      var r = window.INDEX[Math.floor(Math.random() * window.INDEX.length)];
      location.href = ROOT + 'recipes/' + r.id + '.html';
    });
  }

  /* ---------------- browse ---------------- */
  var root = $('browse-root');
  if (root && window.INDEX) {
    var I = window.INDEX, form = $('filters'), out = $('cards'), countEl = $('count'), sortEl = $('sort'), q = $('q');
    var MEALS = { b: 'breakfast', l: 'lunch', d: 'dinner' };
    var timeEl = $('maxtime');

    function checked(name) {
      return Array.prototype.map.call(form.querySelectorAll('input[name="' + name + '"]:checked'), function (i) { return i.value; });
    }
    function readUrl() {
      var u = new URLSearchParams(location.search);
      q.value = u.get('q') || '';
      ['p', 'c', 'm', 'd', 'st', 'g', 'x'].forEach(function (name) {
        var vals = (u.get(name) || '').split('~').filter(Boolean);
        Array.prototype.forEach.call(form.querySelectorAll('input[name="' + name + '"]'), function (i) { i.checked = vals.indexOf(i.value) !== -1; });
      });
      timeEl.value = u.get('t') || '';
      sortEl.value = u.get('s') || 'book';
    }
    function writeUrl() {
      var u = new URLSearchParams();
      if (q.value.trim()) u.set('q', q.value.trim());
      ['p', 'c', 'm', 'd', 'st', 'g', 'x'].forEach(function (name) { var v = checked(name); if (v.length) u.set(name, v.join('~')); });
      if (timeEl.value) u.set('t', timeEl.value);
      if (sortEl.value !== 'book') u.set('s', sortEl.value);
      var s = u.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
    }
    function card(r) {
      var meta = esc(r.c) + ' &middot; ' + esc(r.pl) + (r.st === 'draft' ? '' : ' <span class="badge ' + r.st + '">' + (r.st === 'tested' ? 'Tested' : 'Reviewed') + '</span>');
      var stats = (r.tm ? r.tm + ' min &middot; ' : '') + r.k + ' kcal &middot; <b>' + r.pr + ' g protein</b>';
      return '<a class="card" href="' + ROOT + 'recipes/' + r.id + '.html"><span class="c-title">' + esc(r.t) +
        (r.n ? ' <span class="native">' + esc(r.n) + '</span>' : '') + '</span><span class="c-meta">' + meta +
        '</span><span class="c-stats">' + stats + '</span></a>';
    }
    function run() {
      var terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      var g = checked('g'), x = checked('x'), tg = function (r) { return ' ' + r.g + ' '; }, p = checked('p'), c = checked('c'), m = checked('m'), d = checked('d'), st = checked('st'), maxT = +timeEl.value || 0;
      var list = I.filter(function (r) {
        if (p.length && p.indexOf(r.p) === -1) return false;
        for (var gi = 0; gi < g.length; gi++) if (tg(r).indexOf(' ' + g[gi] + ' ') === -1) return false;
        for (var xi = 0; xi < x.length; xi++) if (tg(r).indexOf(' ' + x[xi] + ' ') !== -1) return false;
        if (c.length && c.indexOf(r.c) === -1) return false;
        if (d.length && d.indexOf(r.d) === -1) return false;
        if (st.length && st.indexOf(r.st) === -1) return false;
        if (m.length && !m.some(function (x) { return r.m.indexOf(x) !== -1; })) return false;
        if (maxT && (!r.tm || r.tm > maxT)) return false;
        for (var i = 0; i < terms.length; i++) if (r.h.indexOf(terms[i]) === -1) return false;
        return true;
      });
      var s = sortEl.value;
      if (terms.length && s === 'book') {                       // relevance: title hits first
        list = list.map(function (r) {
          var t = (r.t + ' ' + r.n).toLowerCase(), sc = 0;
          terms.forEach(function (w) { if (t.indexOf(w) === 0) sc += 3; else if (t.indexOf(w) !== -1) sc += 2; });
          return { r: r, sc: sc };
        }).sort(function (a, b) { return b.sc - a.sc; }).map(function (x) { return x.r; });
      } else if (s === 'title') list = list.slice().sort(function (a, b) { return a.t.localeCompare(b.t); });
      else if (s === 'time') list = list.slice().sort(function (a, b) { return (a.tm || 999) - (b.tm || 999); });
      else if (s === 'kcal') list = list.slice().sort(function (a, b) { return a.k - b.k; });
      else if (s === 'protein') list = list.slice().sort(function (a, b) { return b.pr - a.pr; });
      countEl.textContent = list.length + (list.length === 1 ? ' recipe' : ' recipes');
      out.innerHTML = list.length ? list.map(card).join('') :
        '<div class="empty-state">No recipes match. Try removing a filter or searching for a different word.</div>';
      writeUrl();
    }
    var timer = null;
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 120); });
    form.addEventListener('change', run);
    sortEl.addEventListener('change', run);
    form.addEventListener('submit', function (e) { e.preventDefault(); run(); });
    $('clear').addEventListener('click', function () {
      q.value = ''; timeEl.value = ''; sortEl.value = 'book';
      Array.prototype.forEach.call(form.querySelectorAll('input[type="checkbox"]'), function (i) { i.checked = false; });
      run();
    });
    var ft = $('filterToggle');
    if (ft) ft.addEventListener('click', function () { var o = form.classList.toggle('open'); ft.setAttribute('aria-expanded', String(o)); });
    readUrl(); run();
  }

  /* ---------------- recipe: scaling and units ---------------- */
  var list = $('ing');
  if (list) {
    var base = +list.dataset.base || 0, cur = base;
    var saved = store('mafk-unit');                           // else guess from the browser locale
    var unit = saved === 'imperial' || saved === 'metric' ? saved : (/^en-(us|lr|mm)/i.test(navigator.language || '') ? 'imperial' : 'metric');
    var items = Array.prototype.slice.call(list.querySelectorAll('li'));
    var out2 = $('servings');

    function num(s) {
      s = s.trim();
      var m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
      if (m) return +m[1] + m[2] / m[3];
      m = /^(\d+)\/(\d+)$/.exec(s);
      if (m) return m[1] / m[2];
      return parseFloat(s);
    }
    function parse(s) {
      var m = /^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+\/\d+|\d+(?:\.\d+)?))?\s*(.*)$/.exec(s);
      return m ? { a: num(m[1]), b: m[2] ? num(m[2]) : null, rest: m[3] } : null;
    }
    var FR = [[0, ''], [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [3 / 8, '3/8'], [1 / 2, '1/2'], [5 / 8, '5/8'], [2 / 3, '2/3'], [3 /4, '3/4'], [7 / 8, '7/8'], [1, '']];
    function frac(v) {
      var w = Math.floor(v), rem = v - w, best = FR[0], bd = 9;
      FR.forEach(function (f) { var d = Math.abs(f[0] - rem); if (d < bd) { bd = d; best = f; } });
      if (best[0] === 1) { w += 1; best = FR[0]; }
      if (!w && !best[1]) return '1/8';
      return (w ? String(w) : '') + (w && best[1] ? ' ' : '') + best[1];
    }
    function trim(n, dp) { return String(+n.toFixed(dp)); }
    function fmt(v, rest) {
      var u = (rest.split(/[\s,(]/)[0] || '').toLowerCase();
      if (/^(tsp|tbsp|cup|cups)$/.test(u)) return frac(v);
      if (u === 'g' || u === 'ml') return v >= 50 ? String(Math.round(v / 5) * 5) : v >= 10 ? String(Math.round(v)) : trim(Math.round(v * 2) / 2, 1);
      if (u === 'kg' || u === 'l') return trim(v, 2);
      if (u === 'lb') return trim(Math.round(v * 4) / 4, 2);
      if (u === 'oz') return v < 4 ? frac(v) : v >= 10 ? String(Math.round(v)) : trim(Math.round(v * 2) / 2, 1);
      return v < 4 ? frac(Math.round(v * 2) / 2 || 0.5) : String(Math.round(v));
    }
    function scale(s, f) {
      if (f === 1) return s;
      var p = parse(s);
      if (!p) return s;
      var txt = fmt(p.a * f, p.rest);
      if (p.b != null) txt += '–' + fmt(p.b * f, p.rest);
      return txt + (p.rest ? ' ' + p.rest : '');
    }
    function render() {
      var f = base ? cur / base : 1;
      var main = unit === 'metric' ? 'm' : 'i', other = unit === 'metric' ? 'i' : 'm';
      items.forEach(function (li) {
        li.querySelector('.q1').textContent = scale(li.dataset[main], f);
        li.querySelector('.q2').textContent = scale(li.dataset[other], f);
      });
      if (out2) out2.textContent = cur;
      Array.prototype.forEach.call(document.querySelectorAll('[data-unit]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.unit === unit)); });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-unit]'), function (b) {
      b.addEventListener('click', function () { unit = b.dataset.unit; store('mafk-unit', unit); render(); });
    });
    var dec = $('dec'), inc = $('inc');
    if (dec) dec.addEventListener('click', function () { if (cur > 1) { cur--; render(); } });
    if (inc) inc.addEventListener('click', function () { if (cur < 99) { cur++; render(); } });
    var cp = $('copyList');
    if (cp) cp.addEventListener('click', function () {
      var text = items.map(function (li) { return li.querySelector('.q').textContent + ' ' + li.querySelector('.n').textContent; }).join('\n');
      var done = function (ok) { cp.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(function () { cp.textContent = 'Copy ingredients'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      else done(false);
    });
    var addShop = $('addShop');
    if (addShop) addShop.addEventListener('click', function () {
      try {
        var s = JSON.parse(localStorage.getItem('mafk-shop') || '{"recipes":[],"done":[]}'), id = location.pathname.replace(/^.*\//, '').replace(/\.html$/, ''), hit = null;
        s.recipes.forEach(function (r) { if (r.id === id) hit = r; });
        if (hit) hit.n = cur; else s.recipes.push({ id: id, n: cur });
        localStorage.setItem('mafk-shop', JSON.stringify(s));
        addShop.textContent = 'Added (' + s.recipes.length + ' on list)';
      } catch (e) { addShop.textContent = 'Could not save'; }
    });
    var pr = $('printBtn');
    if (pr) pr.addEventListener('click', function () { window.print(); });
    render();
  }
})();

/* Shopping list: sums the ingredients of the chosen recipes, minus what the pantry page says you have. Needs data/index.js, data/ing.js, lib.js. */
(function () {
  'use strict';
  var CL = window.CL, $ = CL.$, esc = CL.esc, ROOT = window.ROOT || '';
  var ING = window.ING, INDEX = window.INDEX;
  if (!ING || !INDEX || !$('shop-root')) return;

  var items = ING.items, cats = ING.cats, byLabel = {}, meta = {};
  items.forEach(function (it, i) { byLabel[it[0]] = i; });
  INDEX.forEach(function (r) { meta[r.id] = r; });
  var G = CL.generics(items), unit = CL.unit();
  var showHave = false;

  function pantry() {
    var st = CL.load('mafk-pantry', null) || {}, have = {};
    (st.have || []).forEach(function (l) { if (byLabel[l] != null) have[byLabel[l]] = true; });
    (st.staples || ING.staples.map(function (i) { return items[i][0]; })).forEach(function (l) { if (byLabel[l] != null) have[byLabel[l]] = true; });
    return have;
  }

  function build() {
    var s = CL.shopGet(), have = pantry(), map = {};
    s.recipes.forEach(function (sr) {
      var rec = ING.r[sr.id];
      if (!rec) return;
      var f = sr.n / (+rec[0] || 4);
      rec[1].forEach(function (row) {
        var key = row[0].join('|');
        var e = map[key] || (map[key] = { idxs: row[0], sums: {}, from: [], optional: true, loose: false });
        if (!(row[1] & 1)) e.optional = false;
        var q = CL.qty(row[unit === 'metric' ? 2 : 3]);
        if (q) { var fv = CL.family({ v: q.v * f, u: q.u }); e.sums[fv[0]] = (e.sums[fv[0]] || 0) + fv[1]; } else e.loose = true;
        var t = meta[sr.id] ? meta[sr.id].t : sr.id;
        if (e.from.indexOf(t) < 0) e.from.push(t);
      });
    });
    var buy = [], got = [];
    Object.keys(map).forEach(function (k) {
      var e = map[k];
      e.label = e.idxs.map(function (i) { return items[i][0]; }).join(' or ');
      e.cat = items[e.idxs[0]][1];
      e.qty = Object.keys(e.sums).map(function (fam) { return CL.show(fam, e.sums[fam]); }).join(' + ');
      e.have = e.idxs.some(function (i) { return CL.has(G, have, i); });
      (e.have ? got : buy).push(e);
    });
    var cmp = function (a, b) { return a.label < b.label ? -1 : 1; };
    buy.sort(cmp); got.sort(cmp);
    return { recipes: s.recipes, done: s.done, buy: buy, got: got };
  }

  function line(e, done) {
    var id = 'i' + e.idxs.join('_');
    return '<li class="si' + (done ? ' done' : '') + (e.optional ? ' opt' : '') + '"><label><input type="checkbox" data-k="' + esc(e.label) + '"' + (done ? ' checked' : '') + '>' +
      '<span class="sq">' + esc(e.qty || (e.loose ? 'as needed' : '')) + '</span><span class="sn">' + esc(e.label) + (e.optional ? ' <i>(optional)</i>' : '') + '</span></label>' +
      '<small class="from" title="' + esc(e.from.join(', ')) + '">' + esc(e.from.length > 1 ? e.from.length + ' recipes' : e.from[0]) + '</small></li>';
  }

  function render() {
    var d = build(), root = $('shop-body');
    Array.prototype.forEach.call(document.querySelectorAll('[data-unit]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.unit === unit)); });
    if (!d.recipes.length) {
      root.innerHTML = '<p class="empty">Your list is empty. Open any recipe and press <b>Add to shopping list</b>, or use the <a href="' + ROOT + 'pantry.html">pantry finder</a> to add the dishes you can nearly make.</p>';
      $('shop-actions').hidden = true;
      return;
    }
    $('shop-actions').hidden = false;
    var rec = '<h2>Recipes <small>(' + d.recipes.length + ')</small></h2><ul class="shop-recipes">' + d.recipes.map(function (r) {
      var m = meta[r.id];
      return '<li><a href="' + ROOT + 'recipes/' + r.id + '.html">' + esc(m ? m.t : r.id) + '</a><span class="stepper"><button type="button" class="btn small" data-dec="' + r.id + '" aria-label="Fewer servings">&minus;</button><b>' + r.n + '</b> servings<button type="button" class="btn small" data-inc="' + r.id + '" aria-label="More servings">+</button></span>' +
        '<button type="button" class="btn small" data-rm="' + r.id + '">Remove</button></li>';
    }).join('') + '</ul>';
    var doneSet = {};
    d.done.forEach(function (k) { doneSet[k] = true; });
    var buy = '<h2>To buy <small>(' + d.buy.length + ')</small></h2>';
    cats.forEach(function (c, ci) {
      var rows = d.buy.filter(function (e) { return e.cat === ci; });
      if (!rows.length) return;
      buy += '<h3 class="aisle">' + esc(c) + '</h3><ul class="shop-list">' + rows.map(function (e) { return line(e, doneSet[e.label]); }).join('') + '</ul>';
    });
    var got = d.got.length ? '<details class="have"' + (showHave ? ' open' : '') + '><summary>Already have (' + d.got.length + ')</summary><ul class="shop-list">' +
      d.got.map(function (e) { return '<li class="si got"><span class="sq">' + esc(e.qty) + '</span><span class="sn">' + esc(e.label) + '</span></li>'; }).join('') + '</ul>' +
      '<p class="hint">Marked as on hand on the pantry page. Amounts are not tracked, so check you have enough.</p></details>' : '';
    root.innerHTML = rec + buy + got;
    root._data = d;
  }

  function text() {
    var d = build(), out = ['Shopping list'];
    cats.forEach(function (c, ci) {
      var rows = d.buy.filter(function (e) { return e.cat === ci; });
      if (!rows.length) return;
      out.push('', c.toUpperCase());
      rows.forEach(function (e) { out.push('- ' + (e.qty ? e.qty + ' ' : '') + e.label + (e.optional ? ' (optional)' : '')); });
    });
    out.push('', 'For: ' + d.recipes.map(function (r) { return (meta[r.id] ? meta[r.id].t : r.id) + ' x' + r.n; }).join('; '));
    return out.join('\n');
  }

  $('shop-body').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var s = CL.shopGet();
    if (b.dataset.rm) s.recipes = s.recipes.filter(function (r) { return r.id !== b.dataset.rm; });
    else if (b.dataset.inc || b.dataset.dec) {
      s.recipes.forEach(function (r) {
        if (r.id === (b.dataset.inc || b.dataset.dec)) r.n = Math.max(1, Math.min(99, r.n + (b.dataset.inc ? 1 : -1)));
      });
    } else return;
    CL.save('mafk-shop', s);
    render();
  });
  $('shop-body').addEventListener('change', function (e) {
    var k = e.target.dataset.k;
    if (k == null) return;
    var s = CL.shopGet(), at = s.done.indexOf(k);
    if (e.target.checked && at < 0) s.done.push(k); else if (!e.target.checked && at >= 0) s.done.splice(at, 1);
    CL.save('mafk-shop', s);
    e.target.closest('li').classList.toggle('done', e.target.checked);
  });
  $('shop-body').addEventListener('toggle', function (e) { if (e.target.classList && e.target.classList.contains('have')) showHave = e.target.open; }, true);
  Array.prototype.forEach.call(document.querySelectorAll('[data-unit]'), function (b) {
    b.addEventListener('click', function () { unit = b.dataset.unit; CL.store('mafk-unit', unit); render(); });
  });
  $('copyShop').addEventListener('click', function () {
    var btn = this;
    CL.copy(text(), function (ok) { btn.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(function () { btn.textContent = 'Copy as text'; }, 1800); });
  });
  $('printShop').addEventListener('click', function () { window.print(); });
  $('clearShop').addEventListener('click', function () {
    if (window.confirm('Remove every recipe from the shopping list?')) { CL.save('mafk-shop', { recipes: [], done: [] }); render(); }
  });
  var mail = $('mailShop'), sms = $('smsShop');
  function links() { var t = encodeURIComponent(text()); mail.href = 'mailto:?subject=' + encodeURIComponent('Shopping list') + '&body=' + t; sms.href = 'sms:?&body=' + t; }
  [mail, sms].forEach(function (a) { a.addEventListener('click', links); a.addEventListener('focus', links); a.addEventListener('mouseover', links); });
  render();
})();

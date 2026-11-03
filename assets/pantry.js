/* Pantry finder: tick what you have, get the 3 closest recipes per cuisine. Needs data/index.js, data/ing.js and lib.js. */
(function () {
  'use strict';
  var CL = window.CL, $ = CL.$, esc = CL.esc, ROOT = window.ROOT || '';
  var ING = window.ING, INDEX = window.INDEX;
  if (!ING || !INDEX || !$('pantry-root')) return;

  var items = ING.items, cats = ING.cats, byLabel = {};
  items.forEach(function (it, i) { byLabel[it[0]] = i; });
  var G = CL.generics(items);
  var meta = {};
  INDEX.forEach(function (r) { meta[r.id] = r; });

  // how many recipes use each item, so the picker can offer the common ones first
  var uses = items.map(function () { return 0; });
  Object.keys(ING.r).forEach(function (id) { ING.r[id][1].forEach(function (row) { row[0].forEach(function (i) { uses[i]++; }); }); });

  var state = CL.load('mafk-pantry', null) || {};
  var have = {};                                    // item index -> true
  var staples = {};                                 // item index -> true (assumed on hand)
  (state.have || []).forEach(function (l) { if (byLabel[l] != null) have[byLabel[l]] = true; });
  var stapleLabels = state.staples || ING.staples.map(function (i) { return items[i][0]; });
  stapleLabels.forEach(function (l) { if (byLabel[l] != null) staples[byLabel[l]] = true; });
  var opt = { veg: !!state.veg, max: state.max == null ? 3 : state.max };

  function persist() {
    CL.save('mafk-pantry', {
      have: Object.keys(have).map(function (i) { return items[i][0]; }),
      staples: Object.keys(staples).map(function (i) { return items[i][0]; }),
      veg: opt.veg, max: opt.max
    });
  }

  var q = $('pq'), picker = $('picker'), mine = $('mine'), stapleBox = $('staples'), results = $('results');

  /* ---------------- picker ---------------- */
  var order = items.map(function (_, i) { return i; }).sort(function (a, b) { return uses[b] - uses[a]; });

  function chip(i) {
    return '<label class="chip"><input type="checkbox" data-i="' + i + '"' + (have[i] ? ' checked' : '') + '><span>' + esc(items[i][0]) + '</span></label>';
  }
  function renderPicker() {
    var term = q.value.trim().toLowerCase();
    if (term) {
      var hits = order.filter(function (i) { return items[i][0].toLowerCase().indexOf(term) >= 0 && !staples[i]; }).slice(0, 60);
      picker.innerHTML = hits.length ? '<div class="chips">' + hits.map(chip).join('') + '</div>' : '<p class="hint">Nothing matches "' + esc(term) + '".</p>';
      return;
    }
    var html = '';
    cats.forEach(function (c, ci) {
      var list = order.filter(function (i) { return items[i][1] === ci && !staples[i] && uses[i] >= 3; }).slice(0, 36);
      if (!list.length) return;
      html += '<details class="pcat"' + (have && ci < 3 ? ' open' : '') + '><summary>' + esc(c) + '</summary><div class="chips">' + list.map(chip).join('') + '</div></details>';
    });
    picker.innerHTML = html + '<p class="hint">Showing the most-used items in each group. Type above to find anything else.</p>';
  }

  function renderMine() {
    var ids = Object.keys(have);
    mine.innerHTML = ids.length
      ? ids.map(function (i) { return '<button type="button" class="tag-x" data-rm="' + i + '" title="Remove">' + esc(items[i][0]) + ' &times;</button>'; }).join('') +
        ' <button type="button" class="btn small" id="clearAll">Clear all</button>'
      : '<p class="hint">Nothing yet. Tick what is in your fridge and cupboards below.</p>';
  }

  function renderStaples() {
    var ids = Object.keys(staples).map(Number);
    var all = ING.staples.concat(ids).filter(function (v, k, a) { return a.indexOf(v) === k; });
    stapleBox.innerHTML = all.map(function (i) {
      return '<label class="chip"><input type="checkbox" data-st="' + i + '"' + (staples[i] ? ' checked' : '') + '><span>' + esc(items[i][0]) + '</span></label>';
    }).join('');
  }

  /* ---------------- matching ---------------- */
  function covered(row) {
    for (var k = 0; k < row[0].length; k++) if (CL.has(G, have, row[0][k]) || staples[row[0][k]]) return true;
    return false;
  }
  function score(id) {
    var rows = ING.r[id][1], need = 0, miss = [];
    rows.forEach(function (row) {
      if (row[1] & 1) return;                       // optional / to taste / garnish never blocks
      need++;
      if (!covered(row)) miss.push(row[0].map(function (i) { return items[i][0]; }).join(' or '));
    });
    return { need: need, miss: miss };
  }

  function run() {
    var n = Object.keys(have).length;
    if (!n) {
      results.innerHTML = '<p class="empty">Pick a few ingredients to see what you can cook. Water, salt, oil, sugar and pepper are assumed.</p>';
      return;
    }
    var byC = {};
    INDEX.forEach(function (r) {
      if (opt.veg && (' ' + r.g + ' ').indexOf(' vegetarian ') < 0) return;
      var s = score(r.id);
      if (s.miss.length > opt.max) return;
      var cover = s.need ? (s.need - s.miss.length) / s.need : 1;
      // a recipe made only of staples is not an answer to "what can I cook with this?": it must use something picked
      var usesPick = ING.r[r.id][1].some(function (row) { return row[0].some(function (i) { return CL.has(G, have, i); }); });
      if (!usesPick) return;
      (byC[r.c] = byC[r.c] || []).push({ r: r, s: s, cover: cover });
    });
    var cuisines = Object.keys(byC).map(function (c) {
      byC[c].sort(function (a, b) { return a.s.miss.length - b.s.miss.length || b.cover - a.cover || a.r.tm - b.r.tm || (a.r.t < b.r.t ? -1 : 1); });
      return { c: c, list: byC[c].slice(0, 3), total: byC[c].length };
    });
    cuisines.sort(function (a, b) {
      return a.list[0].s.miss.length - b.list[0].s.miss.length || b.list[0].cover - a.list[0].cover || (a.c < b.c ? -1 : 1);
    });
    if (!cuisines.length) {
      results.innerHTML = '<p class="empty">No recipe is within ' + opt.max + ' missing ingredient' + (opt.max === 1 ? '' : 's') + ' of what you picked. Try allowing more missing ingredients.</p>';
      return;
    }
    var ready = cuisines.reduce(function (t, c) { return t + c.list.filter(function (x) { return !x.s.miss.length; }).length; }, 0);
    var shopIds = CL.shopGet().recipes.map(function (r) { return r.id; });
    results.innerHTML = '<p class="sub">' + cuisines.length + ' cuisines have a match' + (ready ? '; ' + ready + ' of the shown recipes you can make right now' : '') + '.</p>' +
      cuisines.map(function (cu) {
        return '<section class="pc"><h3><a href="' + ROOT + 'cuisine/' + cdir(cu.c) + '.html">' + esc(cu.c) + '</a><small>' + cu.total + ' match' + (cu.total === 1 ? '' : 'es') + '</small></h3><div class="cards">' +
          cu.list.map(function (x) {
            var r = x.r, m = x.s.miss, inList = shopIds.indexOf(r.id) >= 0;
            return '<div class="card pcard"><a class="ptitle" href="' + ROOT + 'recipes/' + r.id + '.html"><b>' + esc(r.t) + '</b></a>' +
              '<span class="meta">' + esc(r.pl) + ' &middot; ' + r.tm + ' min &middot; ' + r.k + ' kcal</span>' +
              (m.length ? '<span class="miss">Missing ' + m.length + ': ' + esc(m.join(', ')) + '</span>' : '<span class="ok">You can make this now</span>') +
              '<button type="button" class="btn small" data-add="' + r.id + '"' + (inList ? ' disabled' : '') + '>' + (inList ? 'On shopping list' : 'Add to shopping list') + '</button></div>';
          }).join('') + '</div></section>';
      }).join('');
  }

  function cdir(c) { return ING.cd[c]; }

  /* ---------------- wiring ---------------- */
  function refresh() { persist(); renderMine(); run(); }
  picker.addEventListener('change', function (e) {
    var i = e.target.dataset.i;
    if (i == null) return;
    if (e.target.checked) have[i] = true; else delete have[i];
    refresh();
  });
  mine.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'clearAll') have = {}; else delete have[b.dataset.rm];
    renderPicker(); refresh();
  });
  stapleBox.addEventListener('change', function (e) {
    var i = e.target.dataset.st;
    if (i == null) return;
    if (e.target.checked) staples[i] = true; else delete staples[i];
    renderPicker(); refresh();
  });
  q.addEventListener('input', renderPicker);
  $('veg').addEventListener('change', function (e) { opt.veg = e.target.checked; persist(); run(); });
  $('maxMiss').addEventListener('change', function (e) { opt.max = +e.target.value; persist(); run(); });
  results.addEventListener('click', function (e) {
    var b = e.target.closest('[data-add]');
    if (!b || b.disabled) return;
    var r = ING.r[b.dataset.add];
    CL.shopAdd(b.dataset.add, +r[0] || 4);
    b.disabled = true; b.textContent = 'On shopping list';
    var link = $('shopLink');
    if (link) link.textContent = 'Shopping list (' + CL.shopGet().recipes.length + ')';
  });

  $('veg').checked = opt.veg;
  $('maxMiss').value = String(opt.max);
  var link = $('shopLink');
  if (link && CL.shopGet().recipes.length) link.textContent = 'Shopping list (' + CL.shopGet().recipes.length + ')';
  renderStaples(); renderPicker(); renderMine(); run();
})();

/* Shared helpers for the pantry finder and the shopping list. No dependencies. window.CL = {...} */
(function () {
  'use strict';
  var CL = window.CL = {};

  CL.$ = function (id) { return document.getElementById(id); };
  CL.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  CL.store = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; };
  CL.load = function (k, dflt) { try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : dflt; } catch (e) { return dflt; } };
  CL.save = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  /* the unit choice made on recipe pages; first visit guesses from the browser locale (same rule as site.js) */
  CL.unit = function () {
    var s = CL.store('mafk-unit');
    return s === 'imperial' || s === 'metric' ? s : (/^en-(us|lr|mm)/i.test(navigator.language || '') ? 'imperial' : 'metric');
  };

  /* ---- quantity cells: '800 g', '1 1/2 tbsp', '2-3 cloves', '6', 'to taste' ---- */
  function num(s) {
    s = s.trim();
    var m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
    if (m) return +m[1] + m[2] / m[3];
    m = /^(\d+)\/(\d+)$/.exec(s);
    if (m) return m[1] / m[2];
    return parseFloat(s);
  }
  var SING = { cloves: 'clove', stalks: 'stalk', sprigs: 'sprig', slices: 'slice', pieces: 'piece', leaves: 'leaf', heads: 'head',
               bunches: 'bunch', cubes: 'cube', cans: 'can', packets: 'packet', sheets: 'sheet', cups: 'cup' };
  /* -> {v, u} with u the unit word ('' for a bare count), or null when there is no leading number. Ranges use the larger end. */
  CL.qty = function (s) {
    var m = /^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+\/\d+|\d+(?:\.\d+)?))?\s*(.*)$/.exec(s || '');
    if (!m) return null;
    var u = (m[3].split(/[\s,(]/)[0] || '').toLowerCase().replace(/\.$/, '');
    u = SING[u] || u;
    return { v: num(m[2] || m[1]), u: u };
  };

  var FR = [[0, ''], [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [3 / 8, '3/8'], [1 / 2, '1/2'], [5 / 8, '5/8'], [2 / 3, '2/3'], [3 / 4, '3/4'], [7 / 8, '7/8'], [1, '']];
  function frac(v) {
    var w = Math.floor(v), rem = v - w, best = FR[0], bd = 9;
    FR.forEach(function (f) { var d = Math.abs(f[0] - rem); if (d < bd) { bd = d; best = f; } });
    if (best[0] === 1) { w += 1; best = FR[0]; }
    if (!w && !best[1]) return '1/8';
    return (w ? String(w) : '') + (w && best[1] ? ' ' : '') + best[1];
  }
  function trim(n, dp) { return String(+n.toFixed(dp)); }

  /* Add quantities of one item. parts: [{v,u}] already scaled. Returns {unit: total} keyed by unit family:
     metric: g, ml, or the counting word; imperial: oz, tsp (volume, all spoon/cup sizes), or the counting word. */
  var TO_TSP = { tsp: 1, tbsp: 3, cup: 48, cups: 48 };
  var TO_OZ = { oz: 1, lb: 16 };
  var TO_G = { g: 1, kg: 1000 };
  var TO_ML = { ml: 1, l: 1000 };
  CL.family = function (q) {
    if (TO_G[q.u]) return ['g', q.v * TO_G[q.u]];
    if (TO_ML[q.u]) return ['ml', q.v * TO_ML[q.u]];
    if (TO_TSP[q.u]) return ['tsp', q.v * TO_TSP[q.u]];
    if (TO_OZ[q.u]) return ['oz', q.v * TO_OZ[q.u]];
    return [q.u, q.v];                                           // a counting word, or '' for a bare count
  };
  CL.show = function (fam, v) {
    if (fam === 'g') return v >= 1000 ? trim(v / 1000, 2) + ' kg' : (v >= 50 ? Math.round(v / 5) * 5 : Math.ceil(v)) + ' g';
    if (fam === 'ml') return v >= 1000 ? trim(v / 1000, 2) + ' L' : (v >= 50 ? Math.round(v / 5) * 5 : Math.ceil(v)) + ' ml';
    if (fam === 'tsp') return v >= 48 ? frac(v / 48) + ' cup' + (v / 48 > 1.2 ? 's' : '') : v >= 6 ? frac(v / 3) + ' tbsp' : frac(v) + ' tsp';
    if (fam === 'oz') return v >= 16 ? trim(Math.round(v / 16 * 4) / 4, 2) + ' lb' : (v >= 10 ? Math.round(v) : trim(Math.round(v * 2) / 2, 1)) + ' oz';
    var n = v < 4 ? frac(Math.round(v * 2) / 2 || 0.5) : String(Math.ceil(v - 0.01));
    return n + (fam ? ' ' + fam : '');
  };


  /* a bare 'chicken' or 'mushroom' in a recipe is satisfied by any more specific item you have ('chicken thigh', 'shiitake mushroom') */
  CL.GENERIC = ['chicken', 'pork', 'beef', 'lamb', 'duck', 'fish', 'mushroom', 'noodle', 'cabbage', 'herb'];
  CL.ALSO = { 'cooked rice': ['jasmine rice', 'short-grain rice', 'glutinous rice'], 'hard-boiled egg': ['egg'] };
  CL.generics = function (items) {
    var g = {}, byName = {};
    items.forEach(function (it, i) { byName[it[0]] = i; });
    Object.keys(CL.ALSO).forEach(function (label) {            // cooked rice is covered by any raw rice, and so on
      if (byName[label] == null) return;
      g[byName[label]] = CL.ALSO[label].filter(function (l) { return byName[l] != null; }).map(function (l) { return byName[l]; });
    });
    items.forEach(function (it, i) {
      if (CL.GENERIC.indexOf(it[0]) < 0) return;
      var rx = new RegExp('\\b' + it[0] + '\\b');
      g[i] = [];
      items.forEach(function (o, j) { if (j !== i && rx.test(o[0])) g[i].push(j); });
    });
    return g;
  };
  CL.has = function (g, have, i) {
    if (have[i]) return true;
    var l = g[i];
    if (l) for (var k = 0; k < l.length; k++) if (have[l[k]]) return true;
    return false;
  };

  CL.copy = function (text, done) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    else fallback();
  };

  /* the shopping list: [{id, n}] where n is the number of servings wanted */
  CL.shopGet = function () { return CL.load('mafk-shop', { recipes: [], done: [] }); };
  CL.shopAdd = function (id, servings) {
    var s = CL.shopGet(), hit = s.recipes.filter(function (r) { return r.id === id; })[0];
    if (hit) hit.n = servings; else s.recipes.push({ id: id, n: servings });
    CL.save('mafk-shop', s);
    return s.recipes.length;
  };
})();

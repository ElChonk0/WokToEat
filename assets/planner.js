/* Meal planner: builds a week of breakfasts, lunches and dinners that land near your daily targets.
   Needs window.PLAN (data/plan.js) and window.ROOT (set inline on the page). */
(function () {
  'use strict';
  var ROOT = window.ROOT || '';
  var D = window.PLAN;
  var R = D.recipes, byId = {};
  R.forEach(function (r) { byId[r.id] = r; });

  var PROTEINS = [['chicken', 'Chicken'], ['duck', 'Duck'], ['pork', 'Pork'], ['beef', 'Beef'], ['seafood', 'Seafood'], ['tofu', 'Tofu & veg']];
  var PLABEL = { chicken: 'Chicken', duck: 'Duck', pork: 'Pork', beef: 'Beef', seafood: 'Seafood', tofu: 'Tofu & vegetarian' };
  var MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner']];
  var PRESETS = [['Balanced', 2000, 130, 220, 67], ['Higher protein', 2200, 180, 200, 73], ['Lower carb', 1800, 140, 120, 85]];
  var RICE = { k: 1.30, p: 0.027, c: 0.28, f: 0.003 };          // per gram of cooked jasmine rice
  var MULTS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];
  var RICE_G = [0, 50, 75, 100, 125, 150, 175, 200, 250, 300];
  var DEFAULTS = { proteins: ['chicken', 'pork', 'beef', 'seafood'], cuisines: [], days: 7,
                   meals: ['breakfast', 'lunch', 'dinner'], t: { k: 2000, p: 130, c: 220, f: 67 },
                   split: { breakfast: 25, lunch: 35, dinner: 40 }, rice: true };
  var S = load('mafk-settings') || JSON.parse(JSON.stringify(DEFAULTS));
  var plan = load('mafk-plan');

  function load(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem('mafk-settings', JSON.stringify(S)); localStorage.setItem('mafk-plan', JSON.stringify(plan)); } catch (e) {} }
  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n) { return Math.round(n).toLocaleString(); }

  // ---- controls ----
  var pc = document.getElementById('proteinChips');
  PROTEINS.forEach(function (p) {
    var n = D.counts[p[0]] || 0;
    var lab = el('label', { class: 'chip' }, '<input type="checkbox" id="pro-' + p[0] + '" value="' + p[0] + '"><span>' + p[1] + '<small>' + n + '</small></span>');
    pc.appendChild(lab);
  });
  var cc = document.getElementById('cuisineChips');
  D.cuisines.forEach(function (c, i) {
    cc.appendChild(el('label', { class: 'chip' }, '<input type="checkbox" id="cui-' + i + '" value="' + esc(c) + '"><span>' + esc(c) + '</span>'));
  });
  var ds = document.getElementById('daysSeg');
  for (var d = 1; d <= 7; d++) ds.appendChild(el('label', {}, '<input type="radio" name="days" id="days-' + d + '" value="' + d + '"><span>' + d + '</span>'));
  var mc = document.getElementById('mealChips');
  MEALS.forEach(function (m) { mc.appendChild(el('label', { class: 'chip' }, '<input type="checkbox" id="meal-' + m[0] + '" value="' + m[0] + '"><span>' + m[1] + '</span>')); });
  var pr = document.getElementById('presets');
  PRESETS.forEach(function (p) {
    var b = el('button', { type: 'button', class: 'btn' }, p[0]);
    b.addEventListener('click', function () { S.t = { k: p[1], p: p[2], c: p[3], f: p[4] }; fillControls(); kcalCheck(); });
    pr.appendChild(b);
  });
  var tK = document.getElementById('tK'), tP = document.getElementById('tP'), tC = document.getElementById('tC'), tF = document.getElementById('tF');
  var sB = document.getElementById('sB'), sL = document.getElementById('sL'), sD = document.getElementById('sD');
  var riceBox = document.getElementById('rice');

  function fillControls() {
    PROTEINS.forEach(function (p) { document.getElementById('pro-' + p[0]).checked = S.proteins.indexOf(p[0]) !== -1; });
    D.cuisines.forEach(function (c, i) { document.getElementById('cui-' + i).checked = S.cuisines.indexOf(c) !== -1; });
    document.getElementById('days-' + S.days).checked = true;
    MEALS.forEach(function (m) { document.getElementById('meal-' + m[0]).checked = S.meals.indexOf(m[0]) !== -1; });
    tK.value = S.t.k; tP.value = S.t.p; tC.value = S.t.c; tF.value = S.t.f;
    sB.value = S.split.breakfast; sL.value = S.split.lunch; sD.value = S.split.dinner;
    riceBox.checked = !!S.rice;
  }
  function readControls() {
    S.proteins = PROTEINS.map(function (p) { return p[0]; }).filter(function (k) { return document.getElementById('pro-' + k).checked; });
    S.cuisines = D.cuisines.filter(function (c, i) { return document.getElementById('cui-' + i).checked; });
    S.days = +document.querySelector('input[name="days"]:checked').value;
    S.meals = MEALS.map(function (m) { return m[0]; }).filter(function (k) { return document.getElementById('meal-' + k).checked; });
    function num(i, lo, hi, dflt) { var v = parseFloat(i.value); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt; }
    S.t = { k: num(tK, 800, 5000, 2000), p: num(tP, 20, 400, 130), c: num(tC, 20, 600, 220), f: num(tF, 10, 250, 67) };
    S.split = { breakfast: num(sB, 0, 100, 25), lunch: num(sL, 0, 100, 35), dinner: num(sD, 0, 100, 40) };
    S.rice = riceBox.checked;
  }
  function kcalCheck() {
    var k = (+tP.value || 0) * 4 + (+tC.value || 0) * 4 + (+tF.value || 0) * 9, set = +tK.value || 0;
    var kc = document.getElementById('kcalCheck');
    kc.textContent = 'Your macros add up to ' + fmt(k) + ' kcal' + (set ? ' (target ' + fmt(set) + ')' : '') + '.';
    kc.classList.toggle('off', set && Math.abs(k - set) / set > 0.08);
  }
  [tK, tP, tC, tF].forEach(function (i) { i.addEventListener('input', kcalCheck); });

  // ---- core maths ----
  function mealTarget(meal) {
    var tot = 0; S.meals.forEach(function (m) { tot += S.split[m] || 0; });
    var share = tot > 0 ? (S.split[meal] || 0) / tot : 1 / S.meals.length;
    return { k: S.t.k * share, p: S.t.p * share, c: S.t.c * share, f: S.t.f * share };
  }
  function sq(x) { return x * x; }
  function fit(r, T) {
    var best = null, grams = (S.rice && !r.s) ? RICE_G : [0];
    for (var i = 0; i < MULTS.length; i++) for (var j = 0; j < grams.length; j++) {
      var m = MULTS[i], g = grams[j];
      var k = r.k * m + RICE.k * g, p = r.pr * m + RICE.p * g, c = r.cb * m + RICE.c * g, f = r.f * m + RICE.f * g;
      var s = 3 * sq((k - T.k) / Math.max(T.k, 1)) + 2 * sq((p - T.p) / Math.max(T.p, 1)) +
              sq((c - T.c) / Math.max(T.c, 1)) + sq((f - T.f) / Math.max(T.f, 1)) + 0.03 * Math.abs(m - 1);
      if (!best || s < best.score) best = { m: m, g: g, k: k, p: p, c: c, f: f, score: s };
    }
    return best;
  }
  function poolFor(meal) {
    return R.filter(function (r) {
      return S.proteins.indexOf(r.p) !== -1 && (!S.cuisines.length || S.cuisines.indexOf(r.c) !== -1) && r.m.indexOf(meal) !== -1;
    });
  }
  function pick(meal, ctx, excludeId) {
    var pool = poolFor(meal);
    if (!pool.length) return null;
    var T = mealTarget(meal);
    var fresh = pool.filter(function (r) { return !ctx.used[r.id] && r.id !== excludeId; });
    var list = fresh.length ? fresh : pool.filter(function (r) { return r.id !== excludeId; });
    if (!list.length) list = pool;
    var expected = ctx.total / Math.max(S.proteins.length, 1);
    var scored = list.map(function (r) {
      var f = fit(r, T);
      var pen = 0.12 * Math.max(0, (ctx.protein[r.p] || 0) - expected) + 0.02 * (ctx.cuisine[r.c] || 0) +
                (ctx.dayCuisines[r.c] ? 0.06 : 0) + (ctx.used[r.id] ? 0.5 : 0);
      return { r: r, f: f, total: f.score + pen };
    }).sort(function (a, b) { return a.total - b.total; });
    var top = scored.slice(0, Math.min(5, scored.length));
    var w = top.map(function (_, i) { return 1 / (i + 1); }), sum = w.reduce(function (a, b) { return a + b; }, 0), x = Math.random() * sum;
    var chosen = top[0];
    for (var i = 0; i < top.length; i++) { x -= w[i]; if (x <= 0) { chosen = top[i]; break; } }
    return { id: chosen.r.id, m: chosen.f.m, g: chosen.f.g, k: chosen.f.k, p: chosen.f.p, c: chosen.f.c, f: chosen.f.f,
             locked: false, repeat: !!ctx.used[chosen.r.id] };
  }
  function note(ctx, slot) {
    if (!slot) return;
    var r = byId[slot.id];
    ctx.used[slot.id] = (ctx.used[slot.id] || 0) + 1;
    ctx.protein[r.p] = (ctx.protein[r.p] || 0) + 1;
    ctx.cuisine[r.c] = (ctx.cuisine[r.c] || 0) + 1;
    ctx.total++;
  }
  function refit(slot, meal) {      // recompute a kept slot's portions against the current targets
    var r = byId[slot.id]; if (!r) return null;
    var f = fit(r, mealTarget(meal));
    slot.m = f.m; slot.g = f.g; slot.k = f.k; slot.p = f.p; slot.c = f.c; slot.f = f.f;
    return slot;
  }
  function valid(slot) {
    var r = slot && byId[slot.id];
    return !!r && S.proteins.indexOf(r.p) !== -1 && (!S.cuisines.length || S.cuisines.indexOf(r.c) !== -1);
  }
  function build() {
    var old = plan && plan.days ? plan.days : [];
    var ctx = { used: {}, protein: {}, cuisine: {}, total: 0, dayCuisines: {} };
    var days = [];
    for (var d = 0; d < S.days; d++) {
      var day = {};
      S.meals.forEach(function (m) {
        var o = old[d] && old[d][m];
        if (o && o.locked && valid(o)) { day[m] = refit(o, m); note(ctx, day[m]); }
      });
      days.push(day);
    }
    days.forEach(function (day) {
      ctx.dayCuisines = {};
      S.meals.forEach(function (m) { if (day[m]) ctx.dayCuisines[byId[day[m].id].c] = 1; });
      MEALS.forEach(function (mm) {
        var m = mm[0];
        if (S.meals.indexOf(m) === -1 || day[m]) return;
        var s = pick(m, ctx);
        day[m] = s;
        note(ctx, s);
        if (s) ctx.dayCuisines[byId[s.id].c] = 1;
      });
    });
    plan = { days: days };
    save(); render();
  }
  function swap(di, meal) {
    var ctx = { used: {}, protein: {}, cuisine: {}, total: 0, dayCuisines: {} };
    plan.days.forEach(function (day, i) {
      S.meals.forEach(function (m) { if (day[m] && !(i === di && m === meal)) note(ctx, day[m]); });
      if (i === di) S.meals.forEach(function (m) { if (day[m] && m !== meal) ctx.dayCuisines[byId[day[m].id].c] = 1; });
    });
    var cur = plan.days[di][meal];
    plan.days[di][meal] = pick(meal, ctx, cur && cur.id);
    save(); render();
  }

  // ---- rendering ----
  function status(actual, target) {
    var d = Math.abs(actual / Math.max(target, 1) - 1);
    return d <= 0.1 ? ['good', 'On target'] : d <= 0.2 ? ['close', 'Close'] : ['off', actual > target ? 'Over' : 'Under'];
  }
  function meter(cls, label, actual, target, unit) {
    var st = status(actual, target), pct = Math.min(120, actual / Math.max(target, 1) * 100);
    return '<div class="meter ' + cls + '"><div class="lab"><span>' + label + '</span><span class="pill ' + st[0] + '">' + st[1] + '</span></div>' +
           '<div class="val">' + fmt(actual) + '<small> / ' + fmt(target) + unit + '</small></div>' +
           '<div class="bar"><i style="width:' + (pct / 1.2).toFixed(1) + '%"></i></div></div>';
  }
  function portionText(s) {
    var m = s.m === 1 ? '1 portion' : (s.m + ' portions');
    return '<b>' + m + '</b>' + (s.g ? ' + <b>' + s.g + ' g</b> cooked rice' : '');
  }
  function render() {
    var box = document.getElementById('results');
    if (!plan || !plan.days) { box.innerHTML = ''; return; }
    var totals = { k: 0, p: 0, c: 0, f: 0 }, n = plan.days.length, empties = {};
    var dayHtml = plan.days.map(function (day, di) {
      var t = { k: 0, p: 0, c: 0, f: 0 };
      var rows = MEALS.filter(function (mm) { return S.meals.indexOf(mm[0]) !== -1; }).map(function (mm) {
        var m = mm[0], s = day[m];
        if (!s) {
          empties[m] = 1;
          return '<div class="meal"><div class="meal-top"><span class="meal-name">' + mm[1] + '</span></div><p class="empty">No ' + mm[1].toLowerCase() + ' recipes match these proteins and cuisines yet.</p></div>';
        }
        var r = byId[s.id];
        t.k += s.k; t.p += s.p; t.c += s.c; t.f += s.f;
        return '<div class="meal' + (s.locked ? ' locked' : '') + '">' +
          '<div class="meal-top"><span class="meal-name">' + mm[1] + '</span><span class="meal-btns">' +
          '<button type="button" class="btn" data-act="lock" data-d="' + di + '" data-m="' + m + '" aria-pressed="' + (!!s.locked) + '">' + (s.locked ? 'Locked' : 'Lock') + '</button>' +
          '<button type="button" class="btn" data-act="swap" data-d="' + di + '" data-m="' + m + '"' + (s.locked ? ' disabled' : '') + '>Swap</button></span></div>' +
          '<a class="dish" href="' + ROOT + 'recipes/' + r.id + '.html">' + esc(r.t) + '</a>' +
          '<div class="meta">' + PLABEL[r.p] + ' &middot; ' + esc(r.c) + (s.repeat ? ' &middot; repeat' : '') + '</div>' +
          '<div class="portion">' + portionText(s) + ' <span class="meta">(recipe serves ' + esc(r.sv) + ')</span></div>' +
          '<div class="mm">' + fmt(s.k) + ' kcal &middot; <span class="p">' + fmt(s.p) + ' g P</span> &middot; <span class="c">' + fmt(s.c) + ' g C</span> &middot; <span class="f">' + fmt(s.f) + ' g F</span></div></div>';
      }).join('');
      totals.k += t.k; totals.p += t.p; totals.c += t.c; totals.f += t.f;
      var st = status(t.k, S.t.k);
      return '<article class="day"><div class="day-head"><h4>Day ' + (di + 1) + '</h4><div class="day-tot"><span class="pill ' + st[0] + '">' + fmt(t.k) + ' kcal</span><br>' +
             fmt(t.p) + ' P &middot; ' + fmt(t.c) + ' C &middot; ' + fmt(t.f) + ' F</div></div>' + rows + '</article>';
    }).join('');
    var avg = { k: totals.k / n, p: totals.p / n, c: totals.c / n, f: totals.f / n };
    var notes = Object.keys(empties).map(function (m) { return 'No ' + m + ' recipes match your current proteins and cuisines. Widen the filters or turn that meal off.'; });
    var bk = poolFor('breakfast').length;
    if (S.meals.indexOf('breakfast') !== -1 && bk && bk < S.days) notes.push('Only ' + bk + ' breakfast recipes match, so some breakfasts repeat. More breakfast dishes are added over time.');
    box.innerHTML =
      '<section class="summary"><div class="summary-top"><h3>Daily average over ' + n + (n === 1 ? ' day' : ' days') + '</h3>' +
      '<span class="meal-btns"><button type="button" class="btn" id="copyPlan">Copy plan</button><button type="button" class="btn" id="planToShop">Add to shopping list</button></span></div>' +
      '<div class="meters">' + meter('k', 'Calories', avg.k, S.t.k, ' kcal') + meter('p', 'Protein', avg.p, S.t.p, ' g') +
      meter('c', 'Carbs', avg.c, S.t.c, ' g') + meter('f', 'Fat', avg.f, S.t.f, ' g') + '</div>' +
      notes.map(function (t) { return '<p class="notice">' + esc(t) + '</p>'; }).join('') +
      '<p class="notice">Portions scale the whole dish, so protein, carbs and fat move together. Rice fills the carb gap; fat lands within a range rather than exactly.</p></section>' +
      '<div class="days">' + dayHtml + '</div>';
  }
  document.getElementById('results').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'copyPlan') { copyPlan(b); return; }
    if (b.id === 'planToShop') { planToShop(b); return; }
    var di = +b.dataset.d, m = b.dataset.m;
    if (b.dataset.act === 'lock') { var s = plan.days[di][m]; s.locked = !s.locked; save(); render(); }
    if (b.dataset.act === 'swap') swap(di, m);
  });
  function planText() {
    var lines = ['Meal plan: ' + S.t.k + ' kcal, ' + S.t.p + ' g protein, ' + S.t.c + ' g carbs, ' + S.t.f + ' g fat per day', ''];
    plan.days.forEach(function (day, i) {
      lines.push('Day ' + (i + 1));
      MEALS.forEach(function (mm) {
        var s = day[mm[0]]; if (S.meals.indexOf(mm[0]) === -1) return;
        if (!s) { lines.push('  ' + mm[1] + ': no match'); return; }
        lines.push('  ' + mm[1] + ': ' + byId[s.id].t + ' — ' + s.m + ' portion' + (s.m === 1 ? '' : 's') + (s.g ? ' + ' + s.g + ' g rice' : '') +
                   ' (' + fmt(s.k) + ' kcal, ' + fmt(s.p) + 'P/' + fmt(s.c) + 'C/' + fmt(s.f) + 'F)');
      });
      lines.push('');
    });
    return lines.join('\n');
  }
  // every meal in the plan goes onto the shopping list: servings = the recipe's servings x the portion multiplier, summed per recipe
  function planToShop(btn) {
    var need = {};
    plan.days.forEach(function (day) {
      MEALS.forEach(function (mm) {
        var s = day[mm[0]];
        if (!s || S.meals.indexOf(mm[0]) === -1) return;
        need[s.id] = (need[s.id] || 0) + (+byId[s.id].sv || 4) * s.m;
      });
    });
    try {
      var sh = JSON.parse(localStorage.getItem('mafk-shop') || '{"recipes":[],"done":[]}');
      Object.keys(need).forEach(function (id) {
        var n = Math.max(1, Math.min(99, Math.round(need[id])));
        var hit = sh.recipes.filter(function (r) { return r.id === id; })[0];
        if (hit) hit.n = Math.max(hit.n, n); else sh.recipes.push({ id: id, n: n });
      });
      localStorage.setItem('mafk-shop', JSON.stringify(sh));
      btn.outerHTML = '<a class="btn" href="' + ROOT + 'shop.html">On your shopping list: open it</a>';
    } catch (err) { btn.textContent = 'Could not save'; }
  }
  function copyPlan(btn) {
    var text = planText();
    function done(ok) { btn.textContent = ok ? 'Copied' : 'Select and copy below'; setTimeout(function () { btn.textContent = 'Copy plan'; }, 2000); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.getElementById('copyBox') || el('textarea', { id: 'copyBox', rows: '10', style: 'width:100%;font:13px/1.4 monospace' });
      ta.value = text; document.querySelector('.summary').appendChild(ta); ta.select(); done(false);
    }
  }
  document.getElementById('controls').addEventListener('submit', function (e) {
    e.preventDefault(); readControls();
    if (!S.proteins.length) { S.proteins = ['chicken']; fillControls(); }
    if (!S.meals.length) { S.meals = ['dinner']; fillControls(); }
    build();
  });
  document.getElementById('unlockAll').addEventListener('click', function () {
    if (!plan) return;
    plan.days.forEach(function (d) { Object.keys(d).forEach(function (m) { if (d[m]) d[m].locked = false; }); });
    save(); render();
  });

  // ---- start ----
  fillControls(); kcalCheck();
  var ok = plan && plan.days && plan.days.length === S.days && plan.days.every(function (d) {
    return Object.keys(d).every(function (m) { return !d[m] || byId[d[m].id]; });
  });
  if (ok) render(); else build();
})();

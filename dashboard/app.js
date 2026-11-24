/* Token Radar dashboard — model v5. Renders window.RADAR (written by main.ts
   from the same board.json), so every number on this page is the number the
   program computed. No network: all data is local. */
(function () {
  var R = window.RADAR;
  var rows = R.rows;
  var fmt$ = function (n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  };
  var fmtPct = function (x, digits) {
    return (x * 100).toFixed(digits === undefined ? 1 : digits) + '%';
  };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // Hero cards: top protocol, model multiple, coverage, validation headline.
  var top = rows[0];
  var v = R.validation;
  document.getElementById('heroes').innerHTML =
    hero('Top implied value', fmt$(top.implied_value_usd), top.name + ' — TVL ' + fmt$(top.tvl_usd)) +
    hero('Multiple', R.multiple_display, 'median mcap/TVL, ' + v.multiple_fit_n + ' live tokens') +
    hero('Ranked / accounted', rows.length + ' / ' + R.accounting.total_protocols, 'watchlist ' + R.accounting.watchlist_ranked + '/' + R.accounting.watchlist + ' covered') +
    hero('Leave-one-out miss', v.loo_median_abs_pct.toFixed(1) + '%', 'median absolute miss, ' + v.loo_n + ' live tokens');
  function hero(k, val, d) {
    return '<div class="hero"><div class="k">' + k + '</div><div class="v">' + esc(val) + '</div><div class="d">' + esc(d) + '</div></div>';
  }

  // Category filter options.
  var cats = [];
  rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
  cats.sort();
  var catSel = document.getElementById('cat');
  cats.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  });

  var sortKey = 'rank';
  function visibleRows() {
    var q = document.getElementById('q').value.trim().toLowerCase();
    var cat = catSel.value;
    var watchOnly = document.getElementById('watch-only').checked;
    var list = rows.filter(function (r) {
      if (watchOnly && !r.watchlist) return false;
      if (cat && r.category !== cat) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var by = {
      rank: function (a, b) { return a.rank - b.rank; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d_pct || 0) - (a.change_7d_pct || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
      name: function (a, b) { return a.name.localeCompare(b.name); },
    }[sortKey];
    return list.sort(by);
  }

  function renderBoard() {
    var list = visibleRows();
    document.getElementById('count').textContent = list.length + ' of ' + rows.length + ' ranked protocols';
    var html = list.map(function (r) {
      var chg = r.change_7d_pct === null ? '—' : ((r.change_7d_pct >= 0 ? '+' : '') + r.change_7d_pct.toFixed(1) + '%');
      var chgCls = r.change_7d_pct === null ? '' : (r.change_7d_pct >= 0 ? 'up' : 'down');
      var age = r.age_days === null ? 'unknown' : r.age_days + 'd';
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td>' + r.rank + '</td><td><b>' + esc(r.name) + '</b>' + (r.watchlist ? '<span class="pill">watchlist</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + fmt$(r.tvl_usd) + '</td>' +
        '<td class="num ' + chgCls + '">' + chg + '</td>' +
        '<td class="num">' + age + '</td>' +
        '<td class="num"><b>' + fmt$(r.implied_value_usd) + '</b></td>' +
        '<td class="num">G ' + r.growth_factor.toFixed(3) + ' &times; A ' + r.maturity_factor.toFixed(3) + '</td></tr>';
    }).join('');
    document.getElementById('rows').innerHTML = html;
  }

  function showDetail(slug) {
    var r = rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      tr.classList.toggle('sel', tr.getAttribute('data-slug') === slug);
    });
    var chg = r.change_7d_pct === null
      ? 'not reported (treated as 0%)'
      : ((r.change_7d_pct >= 0 ? '+' : '') + r.change_7d_pct.toFixed(2) + '%');
    var age = r.age_days === null ? 'unknown (scored at 0 days)' : r.age_days + ' days with no token';
    var eq = fmt$(r.tvl_usd) + ' &times; 0.246 &times; ' + r.growth_factor.toFixed(4) + ' &times; ' + r.maturity_factor.toFixed(4) +
      ' = ' + fmt$(r.implied_value_usd);
    document.getElementById('detail').innerHTML =
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="muted">Rank #' + r.rank + ' &middot; ' + esc(r.category || 'Uncategorised') + ' &middot; ' + esc(r.chains.join(', ')) +
      (r.watchlist ? ' &middot; on the watchlist' : '') + '</p>' +
      '<div class="big">' + fmt$(r.implied_value_usd) + '</div>' +
      '<p class="muted">Implied value — TVL &times; multiple &times; growth &times; maturity</p>' +
      '<div class="eq">' + eq + '</div>' +
      '<h3>Inputs</h3><p>TVL ' + fmt$(r.tvl_usd) + ' &middot; 7-day change ' + chg + ' &rarr; growth factor ' + r.growth_factor.toFixed(3) +
      '<br>Tokenless age ' + age + ' &rarr; maturity factor ' + r.maturity_factor.toFixed(3) +
      '<br>Multiple 0.246x &middot; cap 20&times; TVL (' + fmt$(20 * r.tvl_usd) + ')</p>' +
      '<h3>90% range &amp; launch odds</h3><p>Conformal 90% range ' + fmt$(r.conformal_low_usd) + ' – ' + fmt$(r.conformal_high_usd) +
      ' (from live-token residuals).<br>Launch odds for ' + esc(r.category || 'Uncategorised') + ': ' + fmtPct(r.launch_odds) +
      ' of that category&rsquo;s protocols record a token.</p>' +
      '<h3>How to farm it</h3><ol>' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="muted">Records no token — not a promise that it has none, or that one will launch.</p>';
  }

  document.getElementById('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });
  ['q', 'cat', 'sort', 'watch-only'].forEach(function (id) {
    document.getElementById(id).addEventListener(id === 'q' ? 'input' : 'change', function () {
      if (id === 'sort') sortKey = document.getElementById('sort').value;
      renderBoard();
    });
  });
  document.querySelectorAll('#board thead th[data-k]').forEach(function (th) {
    th.addEventListener('click', function () {
      sortKey = th.getAttribute('data-k');
      var sel = document.getElementById('sort');
      if (sel.querySelector('option[value="' + sortKey + '"]')) sel.value = sortKey;
      renderBoard();
    });
  });

  // Validation tables.
  document.getElementById('val-summary').textContent =
    'Multiple ' + R.multiple_display + ' fitted on ' + v.multiple_fit_n + ' live tokens. ' +
    'Leave-one-out median absolute miss ' + v.loo_median_abs_pct.toFixed(1) + '% (signed ' +
    (v.loo_median_signed_pct >= 0 ? '+' : '') + v.loo_median_signed_pct.toFixed(1) + '%); ' +
    v.loo_within_2x_pct.toFixed(1) + '% of live tokens priced within 2x. ' +
    'Conformal 90% multipliers on implied value: ' + v.conformal_low_mult.toFixed(3) + 'x – ' + v.conformal_high_mult.toFixed(3) + 'x.';
  function kvTable(el, head, rowsHtml) {
    document.getElementById(el).innerHTML = '<thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rowsHtml + '</tbody>';
  }
  kvTable('loo', ['Measure', 'Value'], '<tr><td>Live tokens (leave-one-out)</td><td>' + v.loo_n + '</td></tr>' +
    '<tr><td>Median absolute miss</td><td>' + v.loo_median_abs_pct.toFixed(2) + '%</td></tr>' +
    '<tr><td>Median signed miss</td><td>' + v.loo_median_signed_pct.toFixed(2) + '%</td></tr>' +
    '<tr><td>Priced within 2x of actual mcap</td><td>' + v.loo_within_2x_pct.toFixed(1) + '%</td></tr>');
  kvTable('ablation', ['Model', 'Median |log err|', 'Median abs miss'],
    v.ablation.map(function (a) { return '<tr><td>' + esc(a.model) + '</td><td>' + a.median_abs_log_err.toFixed(3) + '</td><td>' + a.median_abs_pct.toFixed(1) + '%</td></tr>'; }).join(''));
  kvTable('walk', ['Fold', 'Test n', 'Median abs miss'],
    v.walk_forward.map(function (w) { return '<tr><td>' + esc(w.fold) + '</td><td>' + w.n + '</td><td>' + w.median_abs_pct.toFixed(1) + '%</td></tr>'; }).join('') ||
    '<tr><td colspan="3">No fold had enough tokens on both sides.</td></tr>');
  kvTable('odds', ['Category', 'Protocols', 'With token', 'Launch odds'],
    v.launch_odds.map(function (o) { return '<tr><td>' + esc(o.category) + '</td><td>' + o.protocols + '</td><td>' + o.with_token + '</td><td>' + fmtPct(o.odds) + '</td></tr>'; }).join(''));
  kvTable('variants', ['Variant', 'Held-out median |log err|'],
    v.variants.map(function (x, i) { return '<tr><td>' + (i + 1) + '. ' + esc(x.variant) + '</td><td>' + x.test_median_abs_log_err.toFixed(3) + '</td></tr>'; }).join(''));
  document.getElementById('variant-note').textContent =
    'Held-out winner: ' + v.variant_winner + '. The entry prices with the full-sample median multiple 0.246x, growth and maturity, capped at 20x TVL — the spec-fixed model, not the split winner when the split prefers another variant.';

  // Coverage and set-aside list.
  var a = R.accounting;
  document.getElementById('accounting').textContent =
    a.total_protocols + ' protocols recorded in the snapshot: ' + a.ranked + ' ranked pre-token rows (watchlist ' +
    a.watchlist_ranked + '/' + a.watchlist + '), ' + a.live_token_set_aside + ' set aside because they record a token that already trades, and ' +
    a.pre_token_set_aside + ' pre-token protocols set aside as wrapped, bridged, staked or exchange products or versioned names. ' +
    a.ranked + ' + ' + a.live_token_set_aside + ' + ' + a.pre_token_set_aside + ' = ' + a.total_protocols + '.';
  document.querySelector('#setaside tbody').innerHTML = R.set_aside.map(function (s) {
    return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.reason) + '</td></tr>';
  }).join('');

  renderBoard();
  showDetail(top.slug);
})();

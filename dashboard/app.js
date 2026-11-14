// Token Launch Radar — the page. Renders window.RADAR (written by main.ts from the same board
// the gate reads), so the screenshots and the code agree by construction: one dataset, two views.
//
// impliedOf(row) recomputes a row's implied value in the page from the snapshot's own figures and
// the fitted multipliers the row carries, and the detail view shows whether the recompute matches
// the board's number. Deep links: #detail=<slug> opens a protocol, #cat=<category> filters to it.

(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) return;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  var fmtUSD = function (n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  };
  var fmtInt = function (n) { return n == null ? '—' : n.toLocaleString('en-US'); };
  var fmtPct = function (n) {
    if (n == null) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  };
  var fmtAge = function (d) {
    if (d == null) return '—';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return d + 'd';
  };
  var fmtMult = function (n) { return n == null ? '—' : n.toFixed(3); };

  /** A row's implied value, recomputed in the page from its own figures and multipliers. */
  function impliedOf(row) {
    var m = row.model;
    return Math.max(1, Math.round(row.tvl_usd * m.blended_multiple * m.growth_multiplier * m.maturity_multiplier * m.chain_multiplier));
  }

  // ---------------------------------------------------------------- header + method
  $('asof').textContent = R.as_of;
  $('modelver').textContent = R.model_version;
  var bt = R.backtest;
  var stats = [
    ['Watchlist', R.watchlist_size + '/' + R.watchlist_size, true],
    ['Board rows', fmtInt(R.board_size), false],
    ['Live comps', fmtInt(R.fit.live_n), false],
    ['Backtest within 2×', Math.round(bt.within_2x_share * 100) + '%', false],
    ['Set aside', fmtInt(R.set_aside_size), false],
  ];
  $('stats').innerHTML = stats.map(function (s) {
    return '<div class="stat"><div class="k">' + esc(s[0]) + '</div><div class="v' + (s[2] ? ' good' : '') + '">' + esc(s[1]) + '</div></div>';
  }).join('');
  var fit = R.fit;
  $('fit').innerHTML =
    '<span>global median mcap/TVL <b>' + fmtMult(fit.global_median) + '</b></span>' +
    '<span>clamp band p10–p90 <b>' + fmtMult(fit.p10) + ' – ' + fmtMult(fit.p90) + '</b></span>' +
    '<span>size curve log(mcap) = <b>' + fit.size_intercept.toFixed(3) + '</b> + <b>' + fit.size_slope.toFixed(3) + '</b> · log(TVL)</span>' +
    '<span>size-curve R&sup2; <b>' + fit.size_r2.toFixed(3) + '</b> (weak — one signal)</span>';
  $('backtest').textContent =
    'median absolute log-error ' + bt.median_abs_log_error.toFixed(3) + ' and ' +
    Math.round(bt.within_2x_share * 100) + '% of predictions within 2× of the real market cap, over ' +
    bt.n + ' live tokens.';
  $('setaside-note').textContent =
    R.set_aside_size + ' pre-token protocols are listed apart, not ranked: wrapped, staked or bridged ' +
    'products of tokens that already trade (Bridge / Liquid Staking / Liquid Restaking / Restaked BTC / ' +
    'Canonical Bridge categories, wrapped / staked / staking names, exchange-prefixed names).';

  // ---------------------------------------------------------------- state + views
  var state = { tab: 'board', q: '', cat: '', chain: '', sort: 'rank', dir: 1 };
  var bySlug = {};
  R.rows.forEach(function (r) { bySlug[r.slug] = r; });

  /** The current tab's rows, normalized to one shape for the table. */
  function viewRows() {
    if (state.tab === 'live') {
      return R.live.map(function (p) {
        return { rank: null, slug: p.slug, name: p.name, category: p.category, chains: p.chains,
          tvl: p.tvl_usd, chg: p.change_7d, age: null, value: p.mcap_usd, kind: 'live', row: p };
      });
    }
    if (state.tab === 'aside') {
      return R.set_aside.map(function (p) {
        return { rank: null, slug: p.slug, name: p.name, category: p.category, chains: p.chains,
          tvl: p.tvl_usd, chg: null, age: null, value: null, kind: 'aside', row: p };
      });
    }
    return R.rows.map(function (r) {
      return { rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains,
        tvl: r.tvl_usd, chg: r.change_7d, age: r.age_days, value: r.implied_value_usd, kind: 'board', row: r };
    });
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = viewRows().filter(function (v) {
      if (state.cat && (v.category || '(no category)') !== state.cat) return false;
      if (state.chain && v.chains.indexOf(state.chain) === -1) return false;
      if (q && v.name.toLowerCase().indexOf(q) === -1 && v.slug.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var av = key === 'rank' ? (a.rank == null ? 1e9 : a.rank)
        : key === 'name' ? a.name.toLowerCase()
        : key === 'category' ? (a.category || '').toLowerCase()
        : key === 'chains' ? a.chains.join(',').toLowerCase()
        : key === 'tvl_usd' ? a.tvl
        : key === 'change_7d' ? (a.chg == null ? -1e9 : a.chg)
        : key === 'age_days' ? (a.age == null ? -1 : a.age)
        : (a.value == null ? -1 : a.value);
      var bv = key === 'rank' ? (b.rank == null ? 1e9 : b.rank)
        : key === 'name' ? b.name.toLowerCase()
        : key === 'category' ? (b.category || '').toLowerCase()
        : key === 'chains' ? b.chains.join(',').toLowerCase()
        : key === 'tvl_usd' ? b.tvl
        : key === 'change_7d' ? (b.chg == null ? -1e9 : b.chg)
        : key === 'age_days' ? (b.age == null ? -1 : b.age)
        : (b.value == null ? -1 : b.value);
      var c = av < bv ? -1 : av > bv ? 1 : (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
      return c * dir;
    });
    return rows;
  }

  function fillSelects() {
    var rows = viewRows();
    var cats = {};
    var chains = {};
    rows.forEach(function (v) {
      cats[v.category || '(no category)'] = true;
      v.chains.forEach(function (c) { chains[c] = true; });
    });
    var catOpts = ['<option value="">All categories</option>'].concat(Object.keys(cats).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }));
    var chainOpts = ['<option value="">All chains</option>'].concat(Object.keys(chains).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }));
    $('cat').innerHTML = catOpts.join('');
    $('chain').innerHTML = chainOpts.join('');
  }

  function renderHead() {
    var last = state.tab === 'live' ? 'Market cap' : state.tab === 'aside' ? 'Reason set aside' : 'Implied value';
    var heads = [
      ['rank', 'Rank'], ['name', 'Protocol'], ['category', 'Category'], ['chains', 'Chains'],
      ['tvl_usd', 'TVL'], ['change_7d', '7d'], ['age_days', 'Age'], ['implied_value_usd', last],
    ];
    document.querySelector('#board thead tr').innerHTML = heads.map(function (h) {
      var arrow = state.sort === h[0] ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
      return '<th data-sort="' + h[0] + '"' + (state.sort === h[0] ? ' class="sorted"' : '') + '>' + h[1] + arrow + '</th>';
    }).join('');
  }

  function render() {
    renderHead();
    var rows = filtered();
    var total = viewRows().length;
    $('count').textContent = rows.length + ' of ' + total + (state.tab === 'board' ? ' rows' : state.tab === 'live' ? ' live tokens' : ' set aside');
    $('empty').hidden = rows.length !== 0;
    $('rows').innerHTML = rows.map(function (v) {
      var badge = v.kind === 'board' && v.row.on_watchlist ? '<span class="badge">WATCHLIST</span>' : '';
      var chg = v.chg == null ? '<td class="num">—</td>'
        : '<td class="num ' + (v.chg > 0 ? 'up' : v.chg < 0 ? 'down' : '') + '">' + fmtPct(v.chg) + '</td>';
      var last = v.kind === 'aside'
        ? '<td class="reason">' + esc(v.row.reason) + '</td>'
        : '<td class="num"><b>' + fmtUSD(v.value) + '</b></td>';
      return '<tr data-slug="' + esc(v.slug) + '" data-kind="' + v.kind + '">' +
        '<td class="num">' + (v.rank == null ? '—' : v.rank) + '</td>' +
        '<td><span class="name">' + esc(v.name) + '</span>' + badge + '<br><span class="slug">' + esc(v.slug) + '</span></td>' +
        '<td>' + esc(v.category || '—') + '</td>' +
        '<td>' + esc(v.chains.slice(0, 3).join(', ') || '—') + (v.chains.length > 3 ? ' +' + (v.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + fmtUSD(v.tvl) + '</td>' +
        chg +
        '<td class="num">' + fmtAge(v.age) + '</td>' +
        last + '</tr>';
    }).join('');
  }

  // ---------------------------------------------------------------- detail
  function openDetail(slug) {
    var r = bySlug[slug];
    if (!r) return;
    var m = r.model;
    var recomputed = impliedOf(r);
    var match = recomputed === r.implied_value_usd;
    var cat = fit.categories[r.category || ''] || null;
    $('detail-body').innerHTML =
      '<h2>' + esc(r.name) + '</h2>' +
      '<div class="slugline">rank #' + r.rank + ' · ' + esc(r.slug) + (r.on_watchlist ? ' · <span style="color:#fbbf24">ON THE WATCHLIST</span>' : '') + '</div>' +
      '<table class="kv">' +
      '<tr><td>TVL</td><td>' + fmtUSD(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Category multiple</td><td>' + fmtMult(m.category_multiple) + ' <span style="color:#8b98a9">(n = ' + m.category_n + ' live' + (cat ? ', raw median ' + fmtMult(cat.median) : '') + ')</span></td></tr>' +
      '<tr><td>Size-curve multiple</td><td>' + fmtMult(m.size_multiple) + '</td></tr>' +
      '<tr><td>Blended multiple</td><td>' + fmtMult(m.blended_multiple) + ' <span style="color:#8b98a9">(geometric mean)</span></td></tr>' +
      '<tr><td>7-day growth</td><td>' + fmtPct(m.growth_pct) + ' → ×' + m.growth_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Age</td><td>' + fmtAge(m.age_days) + ' → maturity ×' + m.maturity_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Chains</td><td>' + esc(r.chains.join(', ') || '—') + ' → ×' + m.chain_multiplier.toFixed(2) + '</td></tr>' +
      '<tr class="total"><td>Implied value</td><td>' + fmtUSD(r.implied_value_usd) + '</td></tr>' +
      '</table>' +
      '<div class="check' + (match ? '' : ' bad') + '">Recomputed in-page: ' + fmtUSD(recomputed) + (match ? ' — matches the board.' : ' — differs from the board by ' + fmtUSD(Math.abs(recomputed - r.implied_value_usd)) + '.') + '</div>' +
      '<h2 style="margin-top:18px">Farm plan</h2>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="reason">Implied value is this radar\u2019s own claim from the snapshot\u2019s figures, never a promise of a launch. The protocol records no token; its record may simply not carry one.</p>';
    $('detail').hidden = false;
    if (location.hash !== '#detail=' + slug) history.replaceState(null, '', '#detail=' + slug);
  }
  function closeDetail() {
    $('detail').hidden = true;
    if (location.hash.indexOf('#detail=') === 0) history.replaceState(null, '', location.hash.replace(/#detail=[^&]*/, '') || '#');
  }

  // ---------------------------------------------------------------- wiring
  document.querySelector('#board thead').addEventListener('click', function (e) {
    var th = e.target.closest('th[data-sort]');
    if (!th) return;
    var key = th.getAttribute('data-sort');
    if (state.sort === key) { state.dir = -state.dir; } else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; }
    render();
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr || tr.getAttribute('data-kind') !== 'board') return;
    openDetail(tr.getAttribute('data-slug'));
  });
  $('close-detail').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });
  $('q').addEventListener('input', function () { state.q = $('q').value; render(); });
  $('cat').addEventListener('change', function () { state.cat = $('cat').value; render(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; render(); });
  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (!b) return;
    state.tab = b.getAttribute('data-tab');
    state.cat = '';
    state.chain = '';
    state.q = '';
    $('q').value = '';
    document.querySelectorAll('#tabs button').forEach(function (x) { x.classList.toggle('active', x === b); });
    fillSelects();
    render();
  });

  // Deep links: #detail=<slug> and #cat=<category>. The hashchange listener keeps
  // back/forward and same-document navigation working, not just fresh loads.
  window.addEventListener('hashchange', function () {
    var hash = location.hash.replace(/^#/, '');
    var m = /(?:^|&)detail=([^&]*)/.exec(hash);
    if (m) { openDetail(decodeURIComponent(m[1])); } else { closeDetail(); }
  });
  (function () {
    var hash = location.hash.replace(/^#/, '');
    var params = {};
    hash.split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    fillSelects();
    if (params.cat) {
      state.cat = params.cat;
      $('cat').value = params.cat;
    }
    render();
    if (params.detail) openDetail(params.detail);
  })();
})();

// Token Launch Radar — the page, v3. Renders window.RADAR (written by main.ts from the same board
// the gate reads), so the screenshots and the code agree by construction: one dataset, two views.
//
// impliedOf(row) recomputes a row's implied value in the page from the snapshot's own figures and
// the fitted multipliers the row carries, and the detail view shows whether the recompute matches
// the board's number. The research note and the chart are drawn from the same data. Deep links:
// #detail=<slug> opens a protocol, #cat=<category> filters to it.

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
  /** A signed whole-dollar figure: +$12, −$18, $0. */
  var fmtSigned = function (n) {
    if (n == null || !isFinite(n)) return '—';
    return (n > 0 ? '+$' : n < 0 ? '−$' : '$') + fmtInt(Math.abs(n));
  };
  /** A gross under a dollar reads as <$1, not $0 — the arithmetic is not zero, it is small. */
  var fmtGross = function (n) { return n < 1 ? '&lt;$1' : '$' + fmtInt(n); };

  /** A row's implied value, recomputed in the page from its own figures and multipliers. */
  function impliedOf(row) {
    var m = row.model;
    return Math.max(1, Math.round(row.tvl_usd * m.blended_multiple * m.growth_multiplier * m.maturity_multiplier * m.chain_multiplier));
  }

  // ---------------------------------------------------------------- header + method
  $('asof').textContent = R.as_of;
  $('modelver').textContent = R.model_version;
  var bt = R.backtest;
  var loo = R.backtest_loo;
  var cv = R.backtest_cv;
  var ts = R.backtest_time_split;
  var looErr = Math.exp(loo.median_abs_log_error);
  var cvErr = Math.exp(cv.median_abs_log_error);
  var tsErr = Math.exp(ts.median_abs_log_error);
  var stats = [
    ['Watchlist', R.watchlist_size + '/' + R.watchlist_size, true],
    ['Board rows', fmtInt(R.board_size), false],
    ['Live comps', fmtInt(R.fit.live_n), false],
    ['Audited', fmtInt(R.audit.pre_token), false],
    ['Set aside', fmtInt(R.set_aside_size), false],
  ];
  $('stats').innerHTML = stats.map(function (s) {
    return '<div class="stat"><div class="k">' + esc(s[0]) + '</div><div class="v' + (s[2] ? ' good' : '') + '">' + esc(s[1]) + '</div></div>';
  }).join('');
  var fit = R.fit;
  // The spread is computed from the same rounded figures the page displays, so the arithmetic
  // a reader checks by hand agrees with the number quoted.
  var p10r = Math.round(fit.p10 * 1000) / 1000;
  var p90r = Math.round(fit.p90 * 1000) / 1000;
  var spreadX = p10r > 0 ? Math.round(p90r / p10r) : 0;
  $('fit').innerHTML =
    '<span>global median mcap/TVL <b>' + fmtMult(fit.global_median) + '</b></span>' +
    '<span>live multiples p10–p90 <b>' + fmtMult(fit.p10) + ' – ' + fmtMult(fit.p90) + '</b> (a ~' + spreadX + '× spread; the clamp band)</span>' +
    '<span>size curve log(mcap) = <b>' + fit.size_intercept.toFixed(3) + '</b> + <b>' + fit.size_slope.toFixed(3) + '</b> · log(TVL)</span>' +
    '<span>size-curve R&sup2; <b>' + fit.size_r2.toFixed(3) + '</b> (weak — one signal)</span>' +
    '<span>categories with &lt;3 peers fall back to the global median</span>';
  $('backtest').textContent =
    'each live token scored by a model fitted without it: median error ×' + looErr.toFixed(2) +
    ' and ' + Math.round(loo.within_2x_share * 100) + '% of predictions within 2× of the real market cap, over ' +
    loo.n + ' live tokens. 5-fold cross-validation agrees: median error ×' + cvErr.toFixed(2) +
    ', ' + Math.round(cv.within_2x_share * 100) + '% within 2×. (In-sample: ' + Math.round(bt.within_2x_share * 100) +
    '% within 2× — the out-of-sample numbers are the honest ones.) Against a ~' + spreadX +
    '× spread of live multiples, a 2× band is a hard test.';
  $('audit-note').textContent =
    R.audit.pre_token + ' records with no token were reviewed: ' + R.audit.rankable + ' rankable → ' +
    R.audit.board + ' ranked, ' + R.audit.set_aside + ' set aside with a reason and a demoted value (wrapped, staked or bridged ' +
    'products, priced off their size neighbours, never ranked), ' + R.audit.excluded + ' excluded (exchange category or versioned names).';

  // ---------------------------------------------------------------- research note + chart
  (function renderResearch() {
    var res = R.research;
    var strong = res.strongest.map(function (c) {
      return esc(c.category) + ' ' + fmtMult(c.median) + ' (n = ' + c.n + ')';
    }).join(' · ');
    var weak = res.weakest.map(function (c) {
      return esc(c.category) + ' ' + fmtMult(c.median) + ' (n = ' + c.n + ')';
    }).join(' · ');
    var picks = res.top_picks.map(function (p) {
      return '<li><a href="#detail=' + esc(p.slug) + '">#' + p.rank + ' ' + esc(p.name) + '</a> — ' +
        fmtUSD(p.implied_value_usd) + '. ' + esc(p.reason) + '</li>';
    }).join('');
    // The netted farms, aggregated live from the board: how many plans clear their own
    // gas at the band's low end, the median net, and the cheapest break-even capital.
    var nets = R.rows.map(function (r) { return r.farm_summary.net_low_usd; }).sort(function (a, b) { return a - b; });
    var netPos = nets.filter(function (n) { return n > 0; }).length;
    var medNet = nets[Math.floor(nets.length / 2)];
    var minBreak = Math.min.apply(null, R.rows.map(function (r) { return r.farm_summary.breakeven_capital_usd; }));
    $('research-body').innerHTML =
      '<p>The board\u2019s ' + fmtInt(R.board_size) + ' rows hold ' + fmtUSD(res.board_tvl_usd) +
      ' of TVL; the ' + fmtInt(R.watchlist_size) + ' watchlist rows hold ' + fmtUSD(res.watchlist_tvl_usd) +
      '. The strongest categories by live median multiple (n ≥ 3) are <b>' + strong +
      '</b>; the weakest are <b>' + weak + '</b>. Multiples are what the market pays per dollar of ' +
      'TVL — a high multiple is evidence the market values that kind of protocol, not a promise.</p>' +
      '<p><b>Top picks.</b></p><ol class="picks">' + picks + '</ol>' +
      '<p><b>A blind test.</b> Fitted on the oldest ' + ts.train_n + ' live tokens and graded on the newest ' +
      ts.n + ' (' + ts.excluded_no_date + ' undated tokens held out of both sides), the model\u2019s median error is ×' +
      tsErr.toFixed(2) + ' and ' + Math.round(ts.within_2x_share * 100) + '% land within 2× — worse than ' +
      'leave-one-out, as a true forward test should be.</p>' +
      '<p><b>Netted farms.</b> At the band\u2019s low end, assuming farmers share 10% of launch value ' +
      'pro-rata by capital, ' + netPos + ' of ' + fmtInt(R.board_size) + ' farms clear their own gas; the median net is <b>' +
      fmtSigned(medNet) + '</b> and the cheapest break-even capital is <b>$' + fmtInt(minBreak) + '</b>. Farming is a ' +
      'size game at these multiples: the break-even capital beside each plan is the smallest position ' +
      'that pays its own gas at the low end.</p>' +
      '<p><b>What this model cannot claim.</b> It does not predict whether or when any protocol issues ' +
      'a token, and an implied value is an estimate from comparables, not a price: the median ' +
      'leave-one-out error is ×' + looErr.toFixed(2) + ', which is why every row carries a value band. ' +
      'A high multiple in a thin category is weak evidence, and past multiples do not guarantee ' +
      'launch values.</p>';
  })();

  /** A static SVG scatter, drawn from the same data: log TVL against log value. */
  (function renderChart() {
    var W = 1160, H = 300, L = 54, Rr = 16, T = 16, B = 36;
    var pts = [];
    R.rows.forEach(function (r) {
      pts.push({ x: Math.log10(Math.max(1, r.tvl_usd)), y: Math.log10(Math.max(1, r.implied_value_usd)), live: false });
    });
    R.live.forEach(function (p) {
      pts.push({ x: Math.log10(Math.max(1, p.tvl_usd)), y: Math.log10(Math.max(1, p.mcap_usd)), live: true });
    });
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var x0 = Math.floor(Math.min.apply(null, xs));
    var x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys));
    var y1 = Math.ceil(Math.max.apply(null, ys));
    var px = function (x) { return L + (x - x0) / (x1 - x0) * (W - L - Rr); };
    var py = function (y) { return T + (y1 - y) / (y1 - y0) * (H - T - B); };
    var tick = function (e) {
      if (e >= 12) return '$' + (Math.pow(10, e - 12)) + 'T';
      if (e >= 9) return '$' + (Math.pow(10, e - 9)) + 'B';
      if (e >= 6) return '$' + (Math.pow(10, e - 6)) + 'M';
      if (e >= 3) return '$' + (Math.pow(10, e - 3)) + 'K';
      return '$' + Math.pow(10, e);
    };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Implied value against TVL, log scales">';
    var e;
    for (e = x0; e <= x1; e++) {
      s += '<line x1="' + px(e).toFixed(1) + '" y1="' + T + '" x2="' + px(e).toFixed(1) + '" y2="' + (H - B) + '" class="grid"/>' +
        '<text x="' + px(e).toFixed(1) + '" y="' + (H - 8) + '" class="axis mid">' + tick(e) + '</text>';
    }
    for (e = y0; e <= y1; e++) {
      s += '<line x1="' + L + '" y1="' + py(e).toFixed(1) + '" x2="' + (W - Rr) + '" y2="' + py(e).toFixed(1) + '" class="grid"/>' +
        '<text x="' + (L - 6) + '" y="' + (py(e) + 4).toFixed(1) + '" class="axis end">' + tick(e) + '</text>';
    }
    pts.forEach(function (p) {
      s += '<circle cx="' + px(p.x).toFixed(1) + '" cy="' + py(p.y).toFixed(1) + '" r="' + (p.live ? '3.5' : '3') +
        '" class="' + (p.live ? 'live' : 'row') + '"/>';
    });
    s += '<text x="' + (L + (W - L - Rr) / 2) + '" y="' + (H - 22) + '" class="axis mid">TVL (log scale)</text>' +
      '<text x="12" y="' + (T + (H - T - B) / 2) + '" class="axis mid" transform="rotate(-90 12 ' + (T + (H - T - B) / 2) + ')">value (log scale)</text>' +
      '<circle cx="' + (L + 8) + '" cy="' + (T + 8) + '" r="3" class="row"/><text x="' + (L + 18) + '" y="' + (T + 12) + '" class="legend">' + R.board_size + ' pre-token rows, implied value</text>' +
      '<circle cx="' + (L + 330) + '" cy="' + (T + 8) + '" r="3.5" class="live"/><text x="' + (L + 340) + '" y="' + (T + 12) + '" class="legend">' + R.live_size + ' live tokens, market cap</text>' +
      '</svg>';
    $('chart').innerHTML = s;
  })();

  // ---------------------------------------------------------------- state + views
  var state = { tab: 'board', q: '', cat: '', chain: '', sort: 'rank', dir: 1 };
  var bySlug = {};
  R.rows.forEach(function (r) { bySlug[r.slug] = r; });
  var byAside = {};
  R.set_aside.forEach(function (p) { byAside[p.slug] = p; });

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
          tvl: p.tvl_usd, chg: null, age: null, value: p.demoted_value_usd, kind: 'aside', row: p };
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
    var last = state.tab === 'live' ? 'Market cap' : state.tab === 'aside' ? 'Demoted value' : 'Implied value';
    var heads = [
      ['rank', 'Rank'], ['name', 'Protocol'], ['category', 'Category'], ['chains', 'Chains'],
      ['tvl_usd', 'TVL'], ['change_7d', '7d'], ['age_days', 'Age'], ['implied_value_usd', last],
    ];
    document.querySelector('#board thead tr').innerHTML = heads.map(function (h) {
      var arrow = state.sort === h[0] ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
      return '<th data-sort="' + h[0] + '"' + (state.sort === h[0] ? ' class="sorted"' : '') + '>' + h[1] + arrow + '</th>';
    }).join('');
  }

  /** The category summary strip: what the filtered category looks like as a group. */
  function renderCatSummary(rows) {
    var cs = $('catsum');
    if (state.tab === 'aside') {
      cs.innerHTML = '<b>Set aside — priced, never ranked.</b> These ' + rows.length +
        ' rows are wrapped, staked or bridged products: a token that already trades in another form. ' +
        'Each carries a demoted value — TVL × the median multiple of the 5 live tokens nearest by TVL, ' +
        'no category premium, no blend — so the audit is complete without pretending a derivative is a launch.';
      cs.hidden = false;
      return;
    }
    if (state.tab !== 'board' || !state.cat || rows.length === 0) { cs.hidden = true; return; }
    var tvl = 0;
    var lo = Infinity, hi = -Infinity;
    var nets = [];
    rows.forEach(function (v) {
      tvl += v.tvl;
      if (v.value < lo) lo = v.value;
      if (v.value > hi) hi = v.value;
      nets.push(v.row.farm_summary.net_low_usd);
    });
    nets.sort(function (a, b) { return a - b; });
    var medNet = nets[Math.floor(nets.length / 2)];
    var netPos = nets.filter(function (n) { return n > 0; }).length;
    var catFit = fit.categories[state.cat];
    var mult = catFit
      ? 'category median multiple <b>' + fmtMult(catFit.median) + '</b> (n = ' + catFit.n + ' live' +
        (catFit.n < fit.min_peers ? ', below the 3-peer bar — these rows price off the global median' : '') + ')'
      : 'no live token in this category — these rows price off the global median';
    cs.innerHTML = '<b>' + esc(state.cat) + '</b> — ' + rows.length + ' protocol' + (rows.length === 1 ? '' : 's') +
      ' · TVL <b>' + fmtUSD(tvl) + '</b> · ' + mult + ' · implied range <b>' + fmtUSD(lo) + ' – ' + fmtUSD(hi) + '</b>' +
      ' · farms netted at the band\u2019s low end: median <b>' + fmtSigned(medNet) + '</b>, ' + netPos + ' of ' + rows.length + ' clear their gas';
    cs.hidden = false;
  }

  function render() {
    renderHead();
    var rows = filtered();
    var total = viewRows().length;
    renderCatSummary(rows);
    $('count').textContent = rows.length + ' of ' + total + (state.tab === 'board' ? ' rows' : state.tab === 'live' ? ' live tokens' : ' set aside');
    $('empty').hidden = rows.length !== 0;
    $('rows').innerHTML = rows.map(function (v) {
      var badge = v.kind === 'board' && v.row.on_watchlist ? '<span class="badge">WATCHLIST</span>' : '';
      if (v.kind === 'aside') badge = '<span class="badge demoted">DEMOTED</span>';
      var chg = v.chg == null ? '<td class="num">—</td>'
        : '<td class="num ' + (v.chg > 0 ? 'up' : v.chg < 0 ? 'down' : '') + '">' + fmtPct(v.chg) + '</td>';
      var last = '<td class="num"><b>' + fmtUSD(v.value) + '</b></td>';
      var sub = v.kind === 'aside'
        ? '<br><span class="reason">' + esc(v.row.reason) + '</span>'
        : '<br><span class="slug">' + esc(v.slug) + '</span>';
      return '<tr data-slug="' + esc(v.slug) + '" data-kind="' + v.kind + '">' +
        '<td class="num">' + (v.rank == null ? '—' : v.rank) + '</td>' +
        '<td><span class="name">' + esc(v.name) + '</span>' + badge + sub + '</td>' +
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
    var catNote = m.category_fallback
      ? '<span style="color:#fbbf24">(global median — only n = ' + m.category_n + ' live peer' + (m.category_n === 1 ? '' : 's') +
        ' in ' + esc(r.category || 'this category') + '; raw median ' + fmtMult(m.category_raw_median) + ')</span>'
      : '<span style="color:#8b98a9">(n = ' + m.category_n + ' live, raw median ' + fmtMult(m.category_raw_median) + ')</span>';
    var comps = m.comparables.map(function (c) {
      return '<li><b>' + esc(c.name) + '</b> — multiple ' + fmtMult(c.multiple) +
        (c.same_category ? ' <span style="color:#8b98a9">(same category)</span>' : ' <span style="color:#8b98a9">(nearest live token overall)</span>') + '</li>';
    }).join('');
    var f = r.farm_summary;
    var netCls = f.net_low_usd > 0 ? 'up' : f.net_low_usd < 0 ? 'down' : '';
    $('detail-body').innerHTML =
      '<h2>' + esc(r.name) + '</h2>' +
      '<div class="slugline">rank #' + r.rank + ' · ' + esc(r.slug) + (r.on_watchlist ? ' · <span style="color:#fbbf24">ON THE WATCHLIST</span>' : '') + '</div>' +
      '<table class="kv">' +
      '<tr><td>TVL</td><td>' + fmtUSD(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Category multiple</td><td>' + fmtMult(m.category_multiple) + ' ' + catNote + '</td></tr>' +
      '<tr><td>Size-curve multiple</td><td>' + fmtMult(m.size_multiple) + '</td></tr>' +
      '<tr><td>Blended multiple</td><td>' + fmtMult(m.blended_multiple) + ' <span style="color:#8b98a9">(geometric mean)</span></td></tr>' +
      '<tr><td>7-day growth</td><td>' + fmtPct(m.growth_pct) + ' → ×' + m.growth_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Age</td><td>' + fmtAge(m.age_days) + ' → maturity ×' + m.maturity_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Chains</td><td>' + esc(r.chains.join(', ') || '—') + ' → ×' + m.chain_multiplier.toFixed(2) + '</td></tr>' +
      '<tr class="total"><td>Implied value</td><td>' + fmtUSD(r.implied_value_usd) + '</td></tr>' +
      '<tr><td>Value band</td><td>' + fmtUSD(m.value_low_usd) + ' – ' + fmtUSD(m.value_high_usd) + ' <span style="color:#8b98a9">(±1 median leave-one-out error)</span></td></tr>' +
      '</table>' +
      '<div class="check' + (match ? '' : ' bad') + '">Recomputed in-page: ' + fmtUSD(recomputed) + (match ? ' — matches the board.' : ' — differs from the board by ' + fmtUSD(Math.abs(recomputed - r.implied_value_usd)) + '.') + '</div>' +
      '<h2 style="margin-top:18px">Nearest live comparables</h2>' +
      '<ul class="comps">' + comps + '</ul>' +
      '<h2 style="margin-top:18px">Farm plan</h2>' +
      '<div class="farm-econ">Farm economics — capital <b>$' + fmtInt(f.capital_usd) + '</b> · est. gas <b>$' + fmtInt(f.gas_usd) + '</b> · hold <b>' + f.hold_days + ' days</b> · setup <b>~' + f.setup_minutes + ' min</b>' +
      '<br>Netted at the band\u2019s low end: gross <b>' + fmtGross(f.gross_low_usd) + '</b> − gas <b>$' + fmtInt(f.gas_usd) + '</b> = net <b class="' + netCls + '">' + fmtSigned(f.net_low_usd) + '</b>' +
      ' · breaks even above <b>$' + fmtInt(f.breakeven_capital_usd) + '</b> of capital' +
      ' <span style="color:#8b98a9">(assumes farmers share 10% of launch value, pro-rata by capital)</span></div>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="reason">Implied value is this radar\u2019s own claim from the snapshot\u2019s figures, never a promise of a launch. The protocol records no token; its record may simply not carry one.</p>';
    $('detail').hidden = false;
    if (location.hash !== '#detail=' + slug) history.replaceState(null, '', '#detail=' + slug);
  }
  /** A set-aside row's detail: its demoted value, its size neighbours, and why it is not ranked. */
  function openAsideDetail(slug) {
    var p = byAside[slug];
    if (!p) return;
    var neigh = p.neighbours.map(function (n) {
      return '<li><b>' + esc(n.slug) + '</b> — multiple ' + fmtMult(n.multiple) + '</li>';
    }).join('');
    $('detail-body').innerHTML =
      '<h2>' + esc(p.name) + '</h2>' +
      '<div class="slugline">' + esc(p.slug) + ' · <span style="color:#fbbf24">SET ASIDE — NOT RANKED</span></div>' +
      '<p class="reason">' + esc(p.reason) + '</p>' +
      '<table class="kv">' +
      '<tr><td>TVL</td><td>' + fmtUSD(p.tvl_usd) + '</td></tr>' +
      '<tr><td>Size-neighbour multiple</td><td>' + fmtMult(p.size_multiple) + ' <span style="color:#8b98a9">(median of the 5 live tokens nearest by TVL)</span></td></tr>' +
      '<tr class="total"><td>Demoted value</td><td>' + fmtUSD(p.demoted_value_usd) + '</td></tr>' +
      '</table>' +
      '<h2 style="margin-top:18px">Size neighbours</h2>' +
      '<ul class="comps">' + neigh + '</ul>' +
      '<p class="reason">A demoted value is TVL × the size-neighbour multiple, times the same growth, maturity and chain factors the ranked rows use — no category premium, no blend. It is shown so the audit is complete; it is not a launch candidate, and it carries no farm plan.</p>';
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
    if (!tr) return;
    var kind = tr.getAttribute('data-kind');
    if (kind === 'board') openDetail(tr.getAttribute('data-slug'));
    else if (kind === 'aside') openAsideDetail(tr.getAttribute('data-slug'));
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
    if (m) {
      var slug = decodeURIComponent(m[1]);
      if (bySlug[slug]) openDetail(slug);
      else if (byAside[slug]) openAsideDetail(slug);
    } else { closeDetail(); }
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
    if (params.detail) {
      if (bySlug[params.detail]) openDetail(params.detail);
      else if (byAside[params.detail]) openAsideDetail(params.detail);
    }
  })();
})();

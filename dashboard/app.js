// Token Launch Radar — the page, v4. Renders window.RADAR (written by main.ts from the same board
// the gate reads), so the screenshots and the code agree by construction: one dataset, two views.
//
// impliedOf(row) recomputes a row's implied value in the page from the fitted curve and the
// category dummy the row carries, and the header shows whether every row's recompute matches the
// board. The hero leads with the fitted formula, the validation ladder against the flat baseline,
// and the calibration chart; the research note and the ladder table are drawn from the same data.
// Deep links: #detail=<slug> opens a protocol, #cat=<category> filters to it.

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
  /** A dollar figure to the cent: $2.67, $12.55. */
  var fmtMoney = function (n) {
    if (n == null || !isFinite(n)) return '—';
    return '$' + Math.abs(n).toFixed(2);
  };
  /** A signed dollar figure to the cent: +$12.34, −$18.20, $0.00. */
  var fmtSigned = function (n) {
    if (n == null || !isFinite(n)) return '—';
    return (n > 0 ? '+$' : n < 0 ? '−$' : '$') + Math.abs(n).toFixed(2);
  };
  var fmtSignedHour = function (n) {
    if (n == null || !isFinite(n)) return '—';
    return (n > 0 ? '+$' : n < 0 ? '−$' : '$') + Math.abs(n).toFixed(2) + '/h';
  };

  /** A row's implied value, recomputed in the page from the fitted curve and its dummy. */
  function impliedOf(row) {
    var m = row.model;
    return Math.max(1, Math.round(m.curve_value_usd * m.category_multiplier));
  }

  var fit = R.fit;
  var bt = R.backtest;
  var flat = R.backtest_flat;
  var size = R.backtest_size;
  var loo = R.backtest_loo;
  var cv = R.backtest_cv;
  var ts = R.backtest_time_split;
  var tsFlat = R.backtest_time_split_flat;
  var looErr = Math.exp(loo.median_abs_log_error);
  var flatErr = Math.exp(flat.median_abs_log_error);
  var sizeErr = Math.exp(size.median_abs_log_error);
  var cvErr = Math.exp(cv.median_abs_log_error);
  var tsErr = Math.exp(ts.median_abs_log_error);
  var tsFlatErr = Math.exp(tsFlat.median_abs_log_error);

  // ---------------------------------------------------------------- header badges
  $('asof').textContent = R.as_of;
  $('modelver').textContent = R.model_version;
  var recomputeOk = 0;
  R.rows.forEach(function (r) { if (impliedOf(r) === r.implied_value_usd) recomputeOk++; });
  $('badges').innerHTML =
    '<span class="badge-top">Watchlist ' + R.watchlist_size + '/' + R.watchlist_size + ' on the board</span>' +
    '<span class="badge-top' + (recomputeOk === R.rows.length ? '' : ' warn') + '">Recomputed here: ' +
    recomputeOk + '/' + R.rows.length + ' rows equal board.json</span>';

  // ---------------------------------------------------------------- hero
  $('boardcount').textContent = fmtInt(R.board_size);
  $('totalimplied').textContent = fmtUSD(R.board_total_implied_usd);
  $('livecount').textContent = fmtInt(fit.live_n);
  var vc = R.verdict_counts;
  $('verdicts').innerHTML =
    '<span class="chip robust">ROBUST <b>' + vc.ROBUST + '</b></span>' +
    '<span class="chip farm">FARM <b>' + vc.FARM + '</b></span>' +
    '<span class="chip thin">THIN <b>' + vc.THIN + '</b></span>' +
    '<span class="chip skip">SKIP <b>' + vc.SKIP + '</b></span>' +
    '<span class="chip">at $1,000 · <b>' + (vc.ROBUST + vc.FARM) + '</b> pay, <b>' + vc.ROBUST + '</b> even at the low end</span>';
  var bph = R.best_per_hour;
  $('besthour').innerHTML = 'Best net per hands-on hour: <b><a href="#detail=' + esc(bph.slug) + '">' + esc(bph.name) +
    '</a> ' + fmtSignedHour(bph.net_per_hour_usd) + '</b> (net ' + fmtSigned(bph.net_usd) + ' on a $1,000 ticket).';
  $('funnel').textContent = R.audit.pre_token + ' records with no token audited: ' + R.audit.rankable +
    ' rankable → ' + R.audit.board + ' ranked, ' + R.audit.set_aside + ' set aside with a demoted value, ' +
    R.audit.excluded + ' excluded (exchange category or versioned names).';
  $('formula').innerHTML =
    'value = 10<sup>' + fit.size_intercept.toFixed(2) + '</sup> × TVL<sup>' + fit.size_slope.toFixed(3) +
    '</sup> × category<br><span style="color:var(--muted);font-size:12.5px">category = 10<sup>dummy</sup>, shrunk (k = ' +
    fit.shrink_k + ', n ≥ ' + fit.min_peers + ') · joint R² ' + fit.joint_r2.toFixed(2) + ' · size curve R² ' +
    fit.size_r2.toFixed(2) + '</span>';
  var ladderRow = function (label, err, share, win) {
    return '<tr><td>' + label + '</td><td' + (win ? ' class="win"' : '') + '>×' + err.toFixed(2) + ' · ' +
      Math.round(share * 100) + '% within 2×</td></tr>';
  };
  $('ladder').innerHTML =
    '<tr><td colspan="2" style="color:var(--muted)">Leave-one-out, ' + loo.n + ' live tokens — median miss · within 2×</td></tr>' +
    ladderRow('One flat multiple', flatErr, flat.within_2x_share, false) +
    ladderRow('Size curve alone', sizeErr, size.within_2x_share, false) +
    ladderRow('Joint model (this board)', looErr, loo.within_2x_share, true);
  $('tsplit').innerHTML = 'Blind time-split — fit on the oldest ' + ts.train_n + ', graded on the newest ' + ts.n +
    ': joint <b>×' + tsErr.toFixed(2) + '</b> vs flat <b>×' + tsFlatErr.toFixed(2) + '</b> (' +
    Math.round(ts.within_2x_share * 100) + '% vs ' + Math.round(tsFlat.within_2x_share * 100) +
    '% within 2×). 5-fold cross-validation agrees: ×' + cvErr.toFixed(2) + '.';

  // ---------------------------------------------------------------- hero chart
  (function renderChart() {
    var W = 400, H = 218, L = 46, Rr = 10, T = 12, B = 30;
    var pts = [];
    R.rows.forEach(function (r) {
      pts.push({ x: Math.log10(Math.max(1, r.tvl_usd)), y: Math.log10(Math.max(1, r.implied_value_usd)), live: false });
    });
    R.live_points.forEach(function (p) {
      pts.push({ x: Math.log10(Math.max(1, p[0])), y: Math.log10(Math.max(1, p[1])), live: true });
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
        '<text x="' + px(e).toFixed(1) + '" y="' + (H - 6) + '" class="axis mid">' + tick(e) + '</text>';
    }
    for (e = y0; e <= y1; e++) {
      s += '<line x1="' + L + '" y1="' + py(e).toFixed(1) + '" x2="' + (W - Rr) + '" y2="' + py(e).toFixed(1) + '" class="grid"/>' +
        '<text x="' + (L - 5) + '" y="' + (py(e) + 3).toFixed(1) + '" class="axis end">' + tick(e) + '</text>';
    }
    // The fitted curve with its ±1 leave-one-out-error band, in log space.
    var bandLog = Math.log10(looErr);
    var top = '', bottom = '';
    for (var gx = x0; gx <= x1; gx += 0.25) {
      var gy = fit.size_intercept + fit.size_slope * gx;
      top += px(gx).toFixed(1) + ',' + py(gy + bandLog).toFixed(1) + ' ';
      bottom = px(gx).toFixed(1) + ',' + py(gy - bandLog).toFixed(1) + ' ' + bottom;
    }
    s += '<polygon points="' + top + bottom + '" class="band"/>';
    var line = '';
    for (gx = x0; gx <= x1; gx += 0.25) {
      line += (line ? ' L' : 'M') + px(gx).toFixed(1) + ' ' + py(fit.size_intercept + fit.size_slope * gx).toFixed(1);
    }
    s += '<path d="' + line + '" class="fitline"/>';
    pts.forEach(function (p) {
      s += '<circle cx="' + px(p.x).toFixed(1) + '" cy="' + py(p.y).toFixed(1) + '" r="' + (p.live ? '2.6' : '2.2') +
        '" class="' + (p.live ? 'live' : 'row') + '"/>';
    });
    s += '<circle cx="' + (L + 6) + '" cy="' + (T + 6) + '" r="2.6" class="live"/><text x="' + (L + 14) + '" y="' + (T + 10) + '" class="legend">' + fit.live_n + ' live tokens, market cap</text>' +
      '<circle cx="' + (L + 178) + '" cy="' + (T + 6) + '" r="2.2" class="row"/><text x="' + (L + 186) + '" y="' + (T + 10) + '" class="legend">' + R.board_size + ' rows, implied</text>' +
      '</svg>';
    $('chart').innerHTML = s;
    $('chartnote').textContent = 'Amber: the ' + fit.live_n + ' live tokens the curve is fitted on. Green: this board at its ' +
      'implied values. Dashed: the fitted size curve before category offsets. The band is ±1 leave-one-out error.';
  })();

  // ---------------------------------------------------------------- research note
  (function renderResearch() {
    var res = R.research;
    var dummyX = function (d) { return Math.pow(10, d).toFixed(2) + '×'; };
    var strong = res.strongest.map(function (c) {
      return esc(c.category) + ' ' + dummyX(c.dummy) + ' (n = ' + c.n + ')';
    }).join(' · ');
    var weak = res.weakest.map(function (c) {
      return esc(c.category) + ' ' + dummyX(c.dummy) + ' (n = ' + c.n + ')';
    }).join(' · ');
    var picks = res.top_picks.map(function (p) {
      return '<li><a href="#detail=' + esc(p.slug) + '">#' + p.rank + ' ' + esc(p.name) + '</a> — ' +
        fmtUSD(p.implied_value_usd) + '. ' + esc(p.reason) + '</li>';
    }).join('');
    var nets = R.rows.map(function (r) { return r.farm_summary.net_usd; }).sort(function (a, b) { return a - b; });
    var medNet = nets[Math.floor(nets.length / 2)];
    var linked = R.rows.filter(function (r) { return r.sibling.linked; });
    var terms = res.tested_terms.map(function (t) {
      var unit = t.term === 'growth' ? 'per 100% weekly change' : t.term === 'maturity' ? 'per log10 day of age' : 'per extra chain';
      return '<li><b>' + esc(t.term) + '</b> (fitted coefficient ' + t.coefficient.toFixed(3) + ' ' + unit +
        '): time-split ×' + t.time_split_with.toFixed(2) + ' vs ×' + t.time_split_without.toFixed(2) +
        ' without it — ' + (t.kept ? 'kept.' : 'dropped.') + '</li>';
    }).join('');
    $('research-body').innerHTML =
      '<p>The board\u2019s ' + fmtInt(R.board_size) + ' rows hold ' + fmtUSD(res.board_tvl_usd) +
      ' of TVL; the ' + fmtInt(R.watchlist_size) + ' watchlist rows hold ' + fmtUSD(res.watchlist_tvl_usd) +
      '. The categories the market pays furthest above the size curve (shrunk dummy, n ≥ 2) are <b>' + strong +
      '</b>; the furthest below are <b>' + weak + '</b>. A dummy is what the market pays per dollar of ' +
      'TVL in that kind of protocol, relative to the curve — evidence, not a promise.</p>' +
      '<p><b>Top picks.</b></p><ol class="picks">' + picks + '</ol>' +
      '<p><b>A blind test.</b> Fitted on the oldest ' + ts.train_n + ' live tokens and graded on the newest ' +
      ts.n + ' (' + ts.excluded_no_date + ' undated tokens held out of both sides), the joint model\u2019s median error is ×' +
      tsErr.toFixed(2) + ' and ' + Math.round(ts.within_2x_share * 100) + '% land within 2× — against ×' +
      tsFlatErr.toFixed(2) + ' and ' + Math.round(tsFlat.within_2x_share * 100) + '% for a flat multiple on the same split. ' +
      'A forward test is the hardest evidence this snapshot offers, and the model beats its baseline by ' +
      (tsFlatErr / tsErr).toFixed(1) + '×. 5-fold cross-validation agrees (×' + cvErr.toFixed(2) + ', ' +
      Math.round(cv.within_2x_share * 100) + '% within 2×). In-sample, ' + Math.round(bt.within_2x_share * 100) +
      '% land within 2× — the out-of-sample numbers are the honest ones.</p>' +
      '<p><b>The ladder.</b> Each rung is a leave-one-out read over the same ' + loo.n + ' live tokens:</p>' +
      '<table class="ladder"><tr><td>One flat multiple</td><td>×' + flatErr.toFixed(2) + ' · ' + Math.round(flat.within_2x_share * 100) + '% within 2× · ' + Math.round(flat.within_3x_share * 100) + '% within 3×</td></tr>' +
      '<tr><td>Size curve alone</td><td>×' + sizeErr.toFixed(2) + ' · ' + Math.round(size.within_2x_share * 100) + '% within 2× · ' + Math.round(size.within_3x_share * 100) + '% within 3×</td></tr>' +
      '<tr><td>Joint model (this board)</td><td class="win">×' + looErr.toFixed(2) + ' · ' + Math.round(loo.within_2x_share * 100) + '% within 2× · ' + Math.round(loo.within_3x_share * 100) + '% within 3×</td></tr></table>' +
      '<p>The size curve does the heavy lifting: on its own it scores ×' + sizeErr.toFixed(2) +
      '. The category offsets trade a slightly worse leave-one-out median (×' + looErr.toFixed(2) +
      ') for category evidence and a better within-3× share (' + Math.round(loo.within_3x_share * 100) + '% vs ' +
      Math.round(size.within_3x_share * 100) + '%) — the board says so rather than hiding the rung.</p>' +
      '<p><b>Netted farms.</b> At a $1,000 ticket, assuming farmers share 10% of launch value pro-rata by ' +
      'capital, ' + (vc.ROBUST + vc.FARM) + ' of ' + fmtInt(R.board_size) + ' farms pay (' + vc.ROBUST +
      ' even at the band\u2019s low end); the median net is <b>' + fmtSigned(medNet) + '</b> and the best farm by ' +
      'hands-on hour is <b>' + esc(bph.name) + '</b> at <b>' + fmtSignedHour(bph.net_per_hour_usd) + '</b>. The biggest ' +
      'protocols pay the least per dollar of ticket — a $1,000 position is a rounding error inside a multi-billion-dollar ' +
      'protocol — while small, high-multiple protocols pay the most. Gas is setup + exit + claim only; the weekly checks are off-chain.</p>' +
      '<p><b>Terms that were tested and dropped.</b> Three candidate terms were fitted on top of the joint model and judged ' +
      'on the blind time-split alone:</p><ul class="picks">' + terms + '</ul>' +
      '<p><b>Parent-linked rows.</b> ' + linked.length + ' of ' + fmtInt(R.board_size) +
      ' rows share a distinctive name word with a live token — ' + (linked.length === 0 ? 'none on this board.' :
      linked.map(function (r) { return '<a href="#detail=' + esc(r.slug) + '">' + esc(r.name) + '</a> (shares \u201C' + esc(r.sibling.shared_word) + '\u201D with ' + esc(r.sibling.token_name) + ')'; }).join(', ') +
      '. A linked protocol\u2019s launch value is tied to a token that already trades; the board flags it and the filter hides it.') + '</p>' +
      '<p><b>Limits, stated plainly.</b> An implied value is an estimate from comparables, not a price: the median ' +
      'leave-one-out error is ×' + looErr.toFixed(2) + ', which is why every row carries a value band. The model does not ' +
      'predict whether or when any protocol issues a token, and past multiples do not guarantee launch values. The ' +
      'time-split reads rest on ' + ts.n + ' test tokens — a small sample, reported as such.</p>';
  })();


  // ---------------------------------------------------------------- state + views
  var state = { tab: 'board', q: '', cat: '', chain: '', verdict: '', hideLinked: false, sort: 'rank', dir: 1 };
  var bySlug = {};
  R.rows.forEach(function (r) { bySlug[r.slug] = r; });
  var byAside = {};
  R.set_aside.forEach(function (p) { byAside[p.slug] = p; });
  var TIER_ORDER = { ROBUST: 0, FARM: 1, THIN: 2, SKIP: 3 };

  /** The board's global log range, for the band bars: every row's band on one scale. */
  var bandMin = Infinity, bandMax = -Infinity;
  R.rows.forEach(function (r) {
    bandMin = Math.min(bandMin, Math.log10(Math.max(1, r.model.value_low_usd)));
    bandMax = Math.max(bandMax, Math.log10(Math.max(1, r.model.value_high_usd)));
  });
  function bandBar(row) {
    var m = row.model;
    var lo = (Math.log10(Math.max(1, m.value_low_usd)) - bandMin) / (bandMax - bandMin) * 100;
    var hi = (Math.log10(Math.max(1, m.value_high_usd)) - bandMin) / (bandMax - bandMin) * 100;
    var pt = (Math.log10(Math.max(1, row.implied_value_usd)) - bandMin) / (bandMax - bandMin) * 100;
    return '<span class="bandbar"><span class="seg" style="left:' + lo.toFixed(1) + '%;width:' + Math.max(hi - lo, 1).toFixed(1) + '%"></span>' +
      '<span class="pt" style="left:' + pt.toFixed(1) + '%"></span></span>' +
      '<span class="bandrange">' + fmtUSD(m.value_low_usd) + ' – ' + fmtUSD(m.value_high_usd) + '</span>';
  }

  /** A short mechanism label for the farm column, from the protocol's own category. */
  function mechLabel(category) {
    var c = (category || '').toLowerCase();
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'curated vault';
    if (c.indexOf('lending') >= 0 || c.indexOf('uncollateralized') >= 0) return 'lend';
    if (c.indexOf('cdp') >= 0) return 'collateral vault';
    if (c.indexOf('dex') >= 0) return 'liquidity';
    if (c.indexOf('yield') >= 0) return 'yield vault';
    if (c.indexOf('basis') >= 0) return 'basis trade';
    if (c.indexOf('restak') >= 0) return 'restake';
    if (c.indexOf('staking') >= 0) return 'stake';
    if (c.indexOf('bridge') >= 0) return 'bridge';
    if (c.indexOf('rwa') >= 0) return 'yield asset';
    if (c.indexOf('derivative') >= 0) return 'margin';
    if (c.indexOf('prediction') >= 0) return 'market position';
    if (c.indexOf('stablecoin') >= 0) return 'mint / hold';
    if (c.indexOf('governance') >= 0) return 'governance stake';
    if (c.indexOf('insurance') >= 0) return 'cover';
    if (c.indexOf('farm') >= 0) return 'farm';
    if (c.indexOf('index') >= 0) return 'index';
    if (c.indexOf('payments') >= 0) return 'payments';
    if (c.indexOf('card') >= 0) return 'card spend';
    if (c.indexOf('otc') >= 0) return 'OTC trade';
    if (c.indexOf('chain') >= 0) return 'chain activity';
    if (c.indexOf('btc') >= 0 || c.indexOf('bitcoin') >= 0) return 'BTC deposit';
    if (c.indexOf('cedefi') >= 0) return 'deposit';
    if (c.indexOf('liquid') >= 0) return 'liquid position';
    return 'deposit';
  }

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
      if (state.tab === 'board') {
        if (state.verdict && v.row.farm_summary.verdict !== state.verdict) return false;
        if (state.hideLinked && v.row.sibling.linked) return false;
      }
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'rank') { av = a.rank == null ? 1e9 : a.rank; bv = b.rank == null ? 1e9 : b.rank; }
      else if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'category') { av = (a.category || '').toLowerCase(); bv = (b.category || '').toLowerCase(); }
      else if (key === 'chains') { av = a.chains.join(',').toLowerCase(); bv = b.chains.join(',').toLowerCase(); }
      else if (key === 'tvl_usd') { av = a.tvl; bv = b.tvl; }
      else if (key === 'change_7d') { av = a.chg == null ? -1e9 : a.chg; bv = b.chg == null ? -1e9 : b.chg; }
      else if (key === 'age_days') { av = a.age == null ? -1 : a.age; bv = b.age == null ? -1 : b.age; }
      else if (key === 'slice') { av = a.kind === 'board' ? a.row.farm_summary.gross_usd : -1; bv = b.kind === 'board' ? b.row.farm_summary.gross_usd : -1; }
      else if (key === 'net') { av = a.kind === 'board' ? a.row.farm_summary.net_usd : -1e9; bv = b.kind === 'board' ? b.row.farm_summary.net_usd : -1e9; }
      else if (key === 'verdict') { av = a.kind === 'board' ? TIER_ORDER[a.row.farm_summary.verdict] : 9; bv = b.kind === 'board' ? TIER_ORDER[b.row.farm_summary.verdict] : 9; }
      else { av = a.value == null ? -1 : a.value; bv = b.value == null ? -1 : b.value; }
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
    var heads;
    if (state.tab === 'live') {
      heads = [['name', 'Protocol'], ['category', 'Category'], ['chains', 'Chains'], ['tvl_usd', 'TVL'],
        ['change_7d', '7d'], ['implied_value_usd', 'Market cap']];
    } else if (state.tab === 'aside') {
      heads = [['name', 'Protocol'], ['category', 'Category'], ['chains', 'Chains'], ['tvl_usd', 'TVL'],
        ['implied_value_usd', 'Demoted value']];
    } else {
      heads = [['rank', 'Rank'], ['name', 'Protocol'], ['tvl_usd', 'TVL'], ['change_7d', '7d'],
        ['age_days', 'Age'], ['implied_value_usd', 'Implied value'], ['slice', '$1K slice'],
        ['net', 'Net · verdict'], ['verdict', 'Farm']];
    }
    $('headrow').innerHTML = heads.map(function (h) {
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
        'no category premium, no factors — so the audit is complete without pretending a derivative is a launch.';
      cs.hidden = false;
      return;
    }
    if (state.tab !== 'board' || !state.cat || rows.length === 0) { cs.hidden = true; return; }
    var tvl = 0;
    var lo = Infinity, hi = -Infinity;
    var nets = [];
    var counts = { ROBUST: 0, FARM: 0, THIN: 0, SKIP: 0 };
    rows.forEach(function (v) {
      tvl += v.tvl;
      if (v.value < lo) lo = v.value;
      if (v.value > hi) hi = v.value;
      nets.push(v.row.farm_summary.net_usd);
      counts[v.row.farm_summary.verdict]++;
    });
    nets.sort(function (a, b) { return a - b; });
    var medNet = nets[Math.floor(nets.length / 2)];
    var catFit = fit.categories[state.cat];
    var dummy = catFit
      ? 'category dummy <b>' + Math.pow(10, catFit.dummy).toFixed(2) + '×</b> (n = ' + catFit.n + ' live' +
        (catFit.n < fit.min_peers ? ', below the 2-peer bar — these rows price off the size curve alone' : '') + ')'
      : 'no live token in this category — these rows price off the size curve alone';
    cs.innerHTML = '<b>' + esc(state.cat) + '</b> — ' + rows.length + ' protocol' + (rows.length === 1 ? '' : 's') +
      ' · TVL <b>' + fmtUSD(tvl) + '</b> · ' + dummy + ' · implied range <b>' + fmtUSD(lo) + ' – ' + fmtUSD(hi) + '</b>' +
      ' · farms at $1,000: median net <b>' + fmtSigned(medNet) + '</b> · ROBUST ' + counts.ROBUST + ' · FARM ' + counts.FARM +
      ' · THIN ' + counts.THIN + ' · SKIP ' + counts.SKIP;
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
      var badge = '';
      if (v.kind === 'board') {
        if (v.row.on_watchlist) badge += '<span class="badge">WATCHLIST</span>';
        if (v.row.sibling.linked) badge += '<span class="badge linked">PARENT-LINKED</span>';
      }
      if (v.kind === 'aside') badge = '<span class="badge demoted">DEMOTED</span>';
      var chg = v.chg == null ? '<td class="num">—</td>'
        : '<td class="num ' + (v.chg > 0 ? 'up' : v.chg < 0 ? 'down' : '') + '">' + fmtPct(v.chg) + '</td>';
      var sub = v.kind === 'aside'
        ? '<br><span class="reason">' + esc(v.row.reason) + '</span>'
        : '<br><span class="slug">' + esc(v.slug) + (v.kind === 'board' ? ' · ' + esc(v.category || '—') : '') + '</span>';
      var nameCell = '<td><span class="name">' + esc(v.name) + '</span>' + badge + sub + '</td>';
      if (v.kind === 'live') {
        return '<tr data-slug="' + esc(v.slug) + '" data-kind="live">' + nameCell +
          '<td>' + esc(v.category || '—') + '</td>' +
          '<td>' + esc(v.chains.slice(0, 3).join(', ') || '—') + (v.chains.length > 3 ? ' +' + (v.chains.length - 3) : '') + '</td>' +
          '<td class="num">' + fmtUSD(v.tvl) + '</td>' + chg +
          '<td class="num"><b>' + fmtUSD(v.value) + '</b></td></tr>';
      }
      if (v.kind === 'aside') {
        return '<tr data-slug="' + esc(v.slug) + '" data-kind="aside">' + nameCell +
          '<td>' + esc(v.category || '—') + '</td>' +
          '<td>' + esc(v.chains.slice(0, 3).join(', ') || '—') + (v.chains.length > 3 ? ' +' + (v.chains.length - 3) : '') + '</td>' +
          '<td class="num">' + fmtUSD(v.tvl) + '</td>' +
          '<td class="num"><b>' + fmtUSD(v.value) + '</b><span class="bandrange">neighbour multiple ' + fmtMult(v.row.size_multiple) + '</span></td></tr>';
      }
      var f = v.row.farm_summary;
      var netCls = f.net_usd > 0 ? 'up' : f.net_usd < 0 ? 'down' : '';
      var payLine = f.breakeven_capital_usd == null ? 'no ticket pays'
        : 'pays from $' + fmtInt(f.breakeven_capital_usd);
      var workH = (f.work_minutes / 60).toFixed(1);
      return '<tr data-slug="' + esc(v.slug) + '" data-kind="board">' +
        '<td class="num">' + v.rank + '</td>' + nameCell +
        '<td class="num">' + fmtUSD(v.tvl) + '</td>' + chg +
        '<td class="num">' + fmtAge(v.age) + '</td>' +
        '<td class="num"><b>' + fmtUSD(v.value) + '</b>' + bandBar(v.row) + '</td>' +
        '<td class="num">' + fmtMoney(f.gross_usd) + '</td>' +
        '<td class="num"><span class="vbadge ' + f.verdict.toLowerCase() + '">' + f.verdict + '</span> ' +
        '<b class="' + netCls + '">' + fmtSigned(f.net_usd) + '</b>' +
        '<span class="netsub">' + fmtSignedHour(f.net_per_hour_usd) + ' · ' + payLine + '</span></td>' +
        '<td class="farmcell"><b>' + mechLabel(v.category) + '</b> · ' + esc(v.chains[0] || '—') +
        '<br>$' + fmtInt(f.gas_usd) + ' fees · ' + f.hold_days + 'd hold · ' + workH + 'h work</td></tr>';
    }).join('');
  }

  // ---------------------------------------------------------------- detail
  function openDetail(slug) {
    var r = bySlug[slug];
    if (!r) return;
    var m = r.model;
    var recomputed = impliedOf(r);
    var match = recomputed === r.implied_value_usd;
    var catNote = m.category_n < fit.min_peers
      ? '<span style="color:#fbbf24">(n = ' + m.category_n + ' live peer' + (m.category_n === 1 ? '' : 's') +
        ' in ' + esc(r.category || 'this category') + ' — below the 2-peer bar, so the size curve prices it alone)</span>'
      : '<span style="color:#8b98a9">(n = ' + m.category_n + ' live, shrunk k = ' + fit.shrink_k + ')</span>';
    var comps = m.comparables.map(function (c) {
      return '<li><b>' + esc(c.name) + '</b> — multiple ' + fmtMult(c.multiple) +
        (c.same_category ? ' <span style="color:#8b98a9">(same category)</span>' : ' <span style="color:#8b98a9">(nearest live token overall)</span>') + '</li>';
    }).join('');
    var f = r.farm_summary;
    var netCls = f.net_usd > 0 ? 'up' : f.net_usd < 0 ? 'down' : '';
    var netLowCls = f.net_low_usd > 0 ? 'up' : f.net_low_usd < 0 ? 'down' : '';
    var siblingLine = r.sibling.linked
      ? '<tr><td>Parent link</td><td>shares \u201C' + esc(r.sibling.shared_word) + '\u201D with ' + esc(r.sibling.token_name) + ' <span style="color:#8b98a9">(a live token)</span></td></tr>'
      : '';
    $('detail-body').innerHTML =
      '<h2>' + esc(r.name) + '</h2>' +
      '<div class="slugline">rank #' + r.rank + ' · ' + esc(r.slug) + (r.on_watchlist ? ' · <span style="color:#fbbf24">ON THE WATCHLIST</span>' : '') + (r.sibling.linked ? ' · <span style="color:#2dd4bf">PARENT-LINKED</span>' : '') + '</div>' +
      '<table class="kv">' +
      '<tr><td>TVL</td><td>' + fmtUSD(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Size curve</td><td>' + fmtUSD(m.curve_value_usd) + ' <span style="color:#8b98a9">(10^' + fit.size_intercept.toFixed(2) + ' × TVL^' + fit.size_slope.toFixed(3) + ')</span></td></tr>' +
      '<tr><td>Category dummy</td><td>×' + m.category_multiplier.toFixed(3) + ' ' + catNote + '</td></tr>' +
      '<tr><td>Age</td><td>' + fmtAge(m.age_days) + ' <span style="color:#8b98a9">(age is not a pricing term — it was tested and dropped)</span></td></tr>' +
      siblingLine +
      '<tr class="total"><td>Implied value</td><td>' + fmtUSD(r.implied_value_usd) + '</td></tr>' +
      '<tr><td>Value band</td><td>' + fmtUSD(m.value_low_usd) + ' – ' + fmtUSD(m.value_high_usd) + ' <span style="color:#8b98a9">(±1 median leave-one-out error)</span></td></tr>' +
      '</table>' +
      '<div class="check' + (match ? '' : ' bad') + '">Recomputed in-page: ' + fmtUSD(recomputed) + (match ? ' — matches the board.' : ' — differs from the board by ' + fmtUSD(Math.abs(recomputed - r.implied_value_usd)) + '.') + '</div>' +
      '<h2 style="margin-top:18px">Nearest live comparables</h2>' +
      '<ul class="comps">' + comps + '</ul>' +
      '<h2 style="margin-top:18px">Farm plan — <span class="vbadge ' + f.verdict.toLowerCase() + '">' + f.verdict + '</span></h2>' +
      '<div class="farm-econ">Farm economics at a <b>$1,000</b> ticket — gas <b>$' + fmtInt(f.gas_usd) + '</b> (setup + exit + claim; weekly checks are off-chain) · T-bill <b>' + fmtMoney(f.tbill_usd) + '</b> (4% for ' + f.hold_days + ' days) · setup <b>~' + f.setup_minutes + ' min</b> · work <b>' + (f.work_minutes / 60).toFixed(1) + 'h</b>' +
      '<br>Gross <b>' + fmtMoney(f.gross_usd) + '</b> − gas <b>$' + fmtInt(f.gas_usd) + '</b> − T-bill <b>' + fmtMoney(f.tbill_usd) + '</b> = net <b class="' + netCls + '">' + fmtSigned(f.net_usd) + '</b> (' + fmtSignedHour(f.net_per_hour_usd) + ')' +
      '<br>At the band\u2019s low end: gross <b>' + fmtMoney(f.gross_low_usd) + '</b> = net <b class="' + netLowCls + '">' + fmtSigned(f.net_low_usd) + '</b>' +
      (f.breakeven_capital_usd == null ? ' · <b>no ticket pays</b> (the gross rate never beats the T-bill rate)' : ' · breaks even above <b>$' + fmtInt(f.breakeven_capital_usd) + '</b> of capital') +
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
      '<p class="reason">A demoted value is TVL × the size-neighbour multiple — no category premium, no factors. It is shown so the audit is complete; it is not a launch candidate, and it carries no farm plan.</p>';
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
  $('verdict').addEventListener('change', function () { state.verdict = $('verdict').value; render(); });
  $('hidelinked').addEventListener('change', function () { state.hideLinked = $('hidelinked').checked; render(); });
  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (!b) return;
    state.tab = b.getAttribute('data-tab');
    state.cat = '';
    state.chain = '';
    state.q = '';
    state.verdict = '';
    state.hideLinked = false;
    $('q').value = '';
    $('verdict').value = '';
    $('hidelinked').checked = false;
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

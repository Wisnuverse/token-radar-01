// Token Radar dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, category breakdown, filterable table, per-protocol detail drawer with the
// model's own inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, minTvl: 0 };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtDate(s) {
    if (!s) return 'unknown';
    return s;
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainMult = 1 + Math.min(row.chains ? row.chains.length : 0, model.chain_cap) * model.chain_weight;
    var catMult = row.category_multiplier || 1;
    var readinessMult = row.readiness_multiplier || 1;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * chainMult * catMult * readinessMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 500;
    if (p.tvl_usd >= 1e9) return 250;
    if (p.tvl_usd >= 1e8) return 150;
    if (p.tvl_usd >= 1e7) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares. Curator vaults reward long-term depositors.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open. Borrow a small amount to show full usage.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open. Swap through it weekly.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge. Trade at least once a week.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '. Stay active across multiple markets.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it. Real-world asset protocols reward holders.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('chain') >= 0) return 'Use ' + name + "'s chain: bridge $" + capital + ' to it, swap on its native DEX, and interact with its dApps.';
    if (c.indexOf('payment') >= 0) return 'Send $' + capital + " through " + name + "'s payment rails and keep a balance in its wallet.";
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " into " + name + "'s basis trading vault on " + chain + ' and hold the position.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + " into " + name + "'s incentive program on " + chain + ' and participate in governance votes.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open. Use every feature it offers.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var multi = p.chains && p.chains.length > 1 ? ' Also use ' + p.chains[1] + ' if the protocol runs there.' : '';
    return [
      { text: 'Set up a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Never reuse a wallet that holds your main funds.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain) + multi, cost: '$' + capital + ' of capital and about $' + (capital >= 250 ? 10 : capital >= 100 ? 6 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Consistency beats size for airdrop snapshots.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot. Early leavers are often filtered out.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Join the protocol's Discord and follow its X account. Complete any quests, Galxe tasks or Zealy campaigns it runs.", cost: 'free, just your time', time: '15 minutes a week' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Never trust DMs or search ads.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it safely.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'readiness') { av = a.launch_readiness; bv = b.launch_readiness; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'logo', text: '◎' }),
        el('div', null,
          el('div', { class: 'brand-name', text: 'Token Radar' }),
          el('div', { class: 'brand-tag', text: 'Pre-token launch radar' })
        )
      ),
      el('div', { class: 'top-meta' },
        el('span', { class: 'pill', html: 'Snapshot <b>' + DATA.as_of + '</b>' }),
        el('span', { class: 'pill', html: 'Model <b>' + DATA.model_version + '</b>' }),
        el('span', { class: 'pill', html: '<b>' + DATA.board_size + '</b> protocols ranked' })
      )
    );
  }

  function hero() {
    var top = DATA.rows[0];
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { html: 'Which pre-token protocol is <span class="hl">worth farming next?</span>' }),
        el('p', { text: 'Every protocol DefiLlama tracks that records no token, ranked by what its launch would be worth. The watchlist is the floor — ' + DATA.watchlist_size + ' protocols above $' + Math.round(DATA.floor_usd / 1e6) + 'M TVL — plus ' + DATA.early_size + ' early finds below it. Each row carries a farm plan with costs and times.' })
      ),
      el('div', { class: 'hero-stats' },
        el('div', { class: 'stat accent' },
          el('div', { class: 'label', text: 'Total implied value' }),
          el('div', { class: 'value', text: fmtUsd(DATA.total_implied) }),
          el('div', { class: 'note', text: 'across ' + DATA.board_size + ' pre-token protocols' })
        ),
        el('div', { class: 'stat' },
          el('div', { class: 'label', text: 'Total TVL tracked' }),
          el('div', { class: 'value', text: fmtUsd(DATA.total_tvl) }),
          el('div', { class: 'note', text: 'locked in pre-token protocols' })
        ),
        el('div', { class: 'stat' },
          el('div', { class: 'label', text: 'Top pick' }),
          el('div', { class: 'value', text: top ? top.name : '—' }),
          el('div', { class: 'note', text: top ? fmtUsd(top.implied_value_usd) + ' implied value' : '' })
        ),
        el('div', { class: 'stat' },
          el('div', { class: 'label', text: 'Watchlist covered' }),
          el('div', { class: 'value', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }),
          el('div', { class: 'note', text: 'every watchlist protocol ranked' })
        )
      )
    );
  }

  function categoryBars() {
    var cats = DATA.categories.slice(0, 8);
    var max = cats.length ? cats[0].total_implied : 1;
    return el('section', { class: 'cats' },
      el('h2', { text: 'Where the value sits' }),
      el('p', { class: 'sub', text: 'Implied launch value by category — the sectors with the most pre-token TVL waiting to launch.' }),
      cats.map(function (c) {
        return el('div', { class: 'cat-row' },
          el('span', { class: 'cat-name', text: c.category }),
          el('div', { class: 'cat-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((c.total_implied / max) * 100)) + '%' })),
          el('span', { class: 'num', html: '<b>' + fmtUsd(c.total_implied) + '</b>' }),
          el('span', { class: 'num', text: c.count + ' protocols' })
        );
      })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainSet = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainSet[c] = true; }); });
    var chains = Object.keys(chainSet).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain…', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token (' + DATA.board_size + ')', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token (' + DATA.live.length + ')', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null
      )
    );
  }

  function readinessRing(r) {
    var pct = Math.round(r.launch_readiness * 100);
    var cls = pct >= 60 ? 'high' : pct >= 40 ? 'mid' : 'low';
    return el('div', { class: 'readiness' },
      el('span', { class: 'ring ' + cls, text: pct + '%' }),
      el('span', { class: 'sub', text: pct >= 60 ? 'Ready' : pct >= 40 ? 'Warming' : 'Early' })
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank' + (r.rank <= 3 ? ' top3' : ''), text: '#' + r.rank }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, r.name,
            r.watchlist ? el('span', { class: 'badge watch', text: 'Watchlist' }) : el('span', { class: 'badge early', text: 'Early' })
          ),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, readinessRing(r)),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('readiness', 'Launch readiness'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status live', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'sub', text: 'already trades — market cap is a fact, not a model' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Note' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The same function runs in main.ts and in this page — the detail view recomputes each row and checks it against board.json.' }),
      el('div', { class: 'formula', text: 'implied = round( tvl_usd × ' + m.base_multiple + ' × growth × maturity × chains × category × readiness )\n\n  growth    = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + '\n  maturity  = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + '\n  chains    = 1 + min(chain_count, ' + m.chain_cap + ') × ' + m.chain_weight + '\n  category  = sector multiplier (Risk Curators 1.25, Chain 1.30, Dexs 1.15, …)\n  readiness = ' + m.readiness_floor + ' + launch_readiness × ' + m.readiness_range + '  (age + growth + size)' }),
      el('div', { class: 'factors' },
        el('div', { class: 'factor' }, el('b', { text: 'TVL base' }), el('span', { text: 'A protocol\'s locked value is the anchor. Larger protocols launch larger tokens.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Growth & maturity' }), el('span', { text: 'Seven-day growth shows momentum; age with no token shows how long it has built without one.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Reach & readiness' }), el('span', { text: 'Multi-chain protocols reach more users. Readiness blends age, growth and size into a launch signal.' }))
      ),
      el('p', { class: 'sub', text: 'Implied value is the entry\'s own claim, never a price or a prediction of whether or when a token launches. A protocol "records no token" in DefiLlama\'s data — it may still have one the record does not carry.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var matches = recomputed === row.implied_value_usd;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · Watchlist' : ' · Early find') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' · listed ' + fmtDate(row.listed_at) + ' · ' + fmtAge(row.age_days) + ' old' }),
        el('div', { class: 'chains' }, (row.chains || []).map(function (c) { return el('span', { class: 'chain-tag', text: c }); }))
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: '✕ Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('div', { class: 'detail-stats' },
      el('div', { class: 'dstat' }, el('div', { class: 'label', text: 'TVL' }), el('div', { class: 'value', text: fmtUsd(row.tvl_usd) })),
      el('div', { class: 'dstat' }, el('div', { class: 'label', text: '7-day change' }), el('div', { class: 'value ' + (row.change_7d !== null && row.change_7d >= 0 ? 'pos' : row.change_7d !== null ? 'neg' : ''), text: fmtPct(row.change_7d) })),
      el('div', { class: 'dstat' }, el('div', { class: 'label', text: 'Launch readiness' }), el('div', { class: 'value', text: Math.round(row.launch_readiness * 100) + '%' }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value breakdown' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL × ' + DATA.model.base_multiple }), el('b', { class: 'num', text: fmtUsd(Math.round(row.tvl_usd * DATA.model.base_multiple)) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: '× ' + row.growth_multiplier })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: '× ' + row.maturity_multiplier })),
        el('div', null, el('span', { text: 'Chain multiplier (' + (row.chains ? row.chains.length : 0) + ' chains)' }), el('b', { class: 'num', text: '× ' + row.chain_multiplier })),
        el('div', null, el('span', { text: 'Category multiplier' }), el('b', { class: 'num', text: '× ' + row.category_multiplier })),
        el('div', null, el('span', { text: 'Readiness multiplier' }), el('b', { class: 'num', text: '× ' + row.readiness_multiplier })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': this page recomputes the row as ' + fmtUsd(recomputed) + (matches ? ' — the same number board.json carries.' : ' — which differs from the board; the data would be stale.') + ' An estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — ' + steps.length + ' steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    if (state.tab === 'pre-token') shell.appendChild(categoryBars());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();

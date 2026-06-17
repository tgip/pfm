/**
 * ─────────────────────────────────────────────────────────────
 *  STORAGE LAYER  (human-readable JSON; localStorage by default,
 *  or a user-chosen local file via the File System Access API)
 * ─────────────────────────────────────────────────────────────
 */
const DB_KEY = 'tgippfm_db';
const DB_HANDLE_META_KEY = 'tgippfm_db_handle_meta'; // just remembers the chosen file's name for display

let dbFileHandle = null;   // FileSystemFileHandle, when user picked a custom location
let dbFileName = null;     // display name of chosen file, or null = browser storage

function loadDB() {
    try {
        const raw = localStorage.getItem(DB_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {
    }
    return {users: [], banks: [], accounts: [], transactions: []};
}

function saveDB(db) {
    const json = JSON.stringify(db, null, 2);
    localStorage.setItem(DB_KEY, json);
    if (dbFileHandle) {
        writeToFileHandle(dbFileHandle, json).catch(err => {
            console.error('Could not write to chosen file location:', err);
        });
    }
}

async function writeToFileHandle(handle, content) {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
}

function fsAccessSupported() {
    return 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
}

async function chooseNewDBLocation() {
    if (!fsAccessSupported()) {
        alert('Your browser does not support choosing a local file location. Chrome, Edge, or other Chromium-based browsers are required for this feature. Data will continue to be stored in browser storage.');
        return;
    }
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: 'tgippfm_data.json',
            types: [{description: 'JSON Database', accept: {'application/json': ['.json']}}]
        });
        dbFileHandle = handle;
        dbFileName = handle.name;
        await writeToFileHandle(handle, JSON.stringify(db, null, 2));
        state.prefMessage = `Database location set to "${handle.name}". All future changes will save here automatically (and to browser storage as a backup).`;
        renderModal();
    } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
    }
}

async function openExistingDBLocation() {
    if (!fsAccessSupported()) {
        alert('Your browser does not support opening a local file location. Chrome, Edge, or other Chromium-based browsers are required for this feature.');
        return;
    }
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{description: 'JSON Database', accept: {'application/json': ['.json']}}]
        });
        const file = await handle.getFile();
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed.users || !parsed.banks || !parsed.accounts || !parsed.transactions) {
            alert('That file does not look like a tgippfm database.');
            return;
        }
        dbFileHandle = handle;
        dbFileName = handle.name;
        db = parsed;
        saveDB(db);
        state.prefMessage = `Loaded database from "${handle.name}". This is now your active storage location.`;
        state.currentUser = null;
        state.screen = 'auth';
        renderModal();
        render();
    } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
    }
}

function useBrowserStorageOnly() {
    dbFileHandle = null;
    dbFileName = null;
    state.prefMessage = 'Now using browser storage only.';
    renderModal();
}

let db = loadDB();

function commit() {
    saveDB(db);
    render();
}

/**
 * ─────────────────────────────────────────────────────────────
 *  UTILITIES
 * ─────────────────────────────────────────────────────────────
 */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);
const CURRENCIES = {
    EUR: {symbol: '€', label: 'Euro (€)', locale: 'de-DE'},
    USD: {symbol: '$', label: 'US Dollar ($US)', locale: 'en-US'},
    CAD: {symbol: 'CA$', label: 'Canadian Dollar ($CA)', locale: 'en-CA'},
    NOK: {symbol: 'kr', label: 'Norwegian Krone (NOK)', locale: 'nb-NO'},
    GBP: {symbol: '£', label: 'British Pound (GBP)', locale: 'en-GB'},
};

function getUserPrefs() {
    const u = state.currentUser;
    return {
        currency: (u && u.defaultCurrency) || 'USD',
        dateFormat: (u && u.dateFormat) || 'YYYY-MM-DD',
    };
}

// fmt(amount, currencyCode?) — currencyCode defaults to the user's preference.
// Pass an account's own currency explicitly when formatting a value that
// belongs to a specific account (accounts can override the default).
const fmt = (n, currencyCode) => {
    if (n == null) return '—';
    const code = currencyCode || getUserPrefs().currency;
    const info = CURRENCIES[code] || CURRENCIES.USD;
    try {
        return new Intl.NumberFormat(info.locale, {style: 'currency', currency: code}).format(n);
    } catch (e) {
        return info.symbol + n.toFixed(2);
    }
};

// fmtDate(dateStr) — dateStr is always stored as YYYY-MM-DD; display format
// follows the user's preference but the stored value never changes.
const fmtDate = (d) => {
    if (!d) return '—';
    const fmtPref = getUserPrefs().dateFormat;
    const [y, m, day] = d.split('-');
    if (fmtPref === 'DD-MM-YYYY') return `${day}-${m}-${y}`;
    return `${y}-${m}-${day}`;
};

function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

function addMonths(dateStr, n) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 10);
}

function addYears(dateStr, n) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setFullYear(d.getFullYear() + n);
    return d.toISOString().slice(0, 10);
}

function getLast6Months() {
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        months.push(d.toISOString().slice(0, 7));
    }
    return months;
}

function hashPass(pass) {
    // Simple hash for demo (bcrypt not available as module in browser)
    return btoa(encodeURIComponent(pass + '::tgippfm::salt'));
}

function checkPass(pass, hash) {
    return hashPass(pass) === hash;
}

// Chart color palette
const PALETTE = ['#6c63ff', '#34d399', '#f87171', '#fbbf24', '#60a5fa', '#fb923c', '#a78bfa', '#2dd4bf', '#f472b6'];

/**
 * ─────────────────────────────────────────────────────────────
 *  LOGGING  (in-memory + persisted, viewable in Preferences)
 * ─────────────────────────────────────────────────────────────
 */
const LOG_KEY = 'tgippfm_logs';
const MAX_LOGS = 500;
let appLogs = [];
try {
    appLogs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
} catch (e) {
    appLogs = [];
}

function logEvent(level, message, data) {
    const entry = {
        ts: new Date().toISOString(),
        level, // info | warn | error
        message,
        data: data !== undefined ? safeStringify(data) : undefined,
    };
    appLogs.push(entry);
    if (appLogs.length > MAX_LOGS) appLogs = appLogs.slice(-MAX_LOGS);
    try {
        localStorage.setItem(LOG_KEY, JSON.stringify(appLogs));
    } catch (e) {
    }
    const tag = '[tgippfm]';
    if (level === 'error') console.error(tag, message, data);
    else if (level === 'warn') console.warn(tag, message, data);
    else console.log(tag, message, data);
}

function safeStringify(data) {
    try {
        if (data instanceof Error) return data.message + '\n' + (data.stack || '');
        return typeof data === 'string' ? data : JSON.stringify(data);
    } catch (e) {
        return String(data);
    }
}

function clearLogs() {
    appLogs = [];
    localStorage.removeItem(LOG_KEY);
}

// Catch unhandled errors anywhere in the app
window.addEventListener('error', (e) => {
    logEvent('error', `Unhandled error: ${e.message}`, {filename: e.filename, line: e.lineno, col: e.colno});
});
window.addEventListener('unhandledrejection', (e) => {
    logEvent('error', 'Unhandled promise rejection', e.reason);
});

logEvent('info', 'App boot started');


let state = {
    screen: 'auth',      // auth | dashboard | bank | account
    authTab: 'login',
    currentUser: null,
    selectedBank: null,
    selectedAccount: null,
    authError: '',
    authSuccess: '',
    modal: null,         // null | 'addBank' | 'editBank' | 'addAccount' | 'editAccount' | 'recurringSetup' | 'termDeposit' | 'confirmDelete'
    modalData: {},
    txnRangeStart: addDays(today(), -30),
    txnRangeEnd: today(),
    editingTxnId: null,
    prefMessage: '',
    csvImportPreview: null,
    showLogs: false,
    txnSortCol: 'date',
    txnSortDir: 'desc',
    txnPage: 1,
    txnPageSize: 15,
};

/**
 * ─────────────────────────────────────────────────────────────
 *  BUSINESS LOGIC
 * ─────────────────────────────────────────────────────────────
 */

function getUserBanks() {
    return db.banks.filter(b => b.userId === state.currentUser.id);
}

function getBankAccounts(bankId) {
    return db.accounts.filter(a => a.bankId === bankId);
}

function getAccountTxns(accountId) {
    return db.transactions.filter(t => t.accountId === accountId).sort((a, b) => a.date.localeCompare(b.date));
}

function getRunningBalance(accountId, upToDate) {
    return db.transactions
        .filter(t => t.accountId === accountId && t.date <= upToDate)
        .reduce((sum, t) => sum + (t.signedAmount || 0), 0);
}

function getMonthEndBalance(accountId, yearMonth) {
    // last day of that month
    const [y, m] = yearMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).toISOString().slice(0, 10);
    return getRunningBalance(accountId, lastDay);
}

function getDailyBalances(accountId, startDate, endDate) {
    const dates = [];
    let cur = startDate;
    while (cur <= endDate) {
        dates.push(cur);
        cur = addDays(cur, 1);
    }
    return dates.map(d => ({date: d, balance: getRunningBalance(accountId, d)}));
}

function createTransaction(txn) {
    db.transactions.push({id: uid(), ...txn});
}

function createRecurringTransactions(base, period, count) {
    for (let i = 0; i < count; i++) {
        let date = base.date;
        if (period === 'monthly') date = addMonths(base.date, i);
        else if (period === 'yearly') date = addYears(base.date, i);
        else if (period.startsWith('days:')) date = addDays(base.date, parseInt(period.slice(5)) * i);
        else if (period.startsWith('months:')) date = addMonths(base.date, parseInt(period.slice(7)) * i);
        else if (period.startsWith('years:')) date = addYears(base.date, parseInt(period.slice(6)) * i);
        else date = addDays(base.date, i);

        db.transactions.push({
            id: uid(),
            ...base,
            date,
            recurring: true,
            recurringGroup: base.recurringGroup || uid(),
            future: date > today(),
        });
    }
}

/**
 * ─────────────────────────────────────────────────────────────
 *  RENDER ENGINE
 * ─────────────────────────────────────────────────────────────
 */
const root = document.getElementById('root');

function render() {
    destroyCharts();
    if (state.screen === 'auth') {
        root.innerHTML = renderAuth();
    } else {
        root.innerHTML = renderApp();
    }
    bindEvents();
    if (state.modal) renderModal();
    drawScreenCharts();
}

function drawScreenCharts() {
    // Charts must be created after the canvas elements exist in the DOM;
    // innerHTML-injected <script> tags never execute, so chart creation
    // is done here instead, right after each render.
    if (state.screen === 'dashboard') drawDashboardChart();
    else if (state.screen === 'bank') drawBankChart();
    else if (state.screen === 'account') drawAccountChart();
}

let _charts = [];

function destroyCharts() {
    _charts.forEach(c => {
        try {
            c.destroy();
        } catch (e) {
        }
    });
    _charts = [];
}

function trackChart(c) {
    _charts.push(c);
}

// Remembers which legend entries (banks/accounts) the user has hidden,
// per chart, so toggled visibility survives the destroy/recreate cycle
// that happens on every render() call.
const _hiddenLegendKeys = {dashboard: new Set(), bank: new Set(), account: new Set()};

function makeLegendClickHandler(chartKey) {
    return function (e, legendItem, legend) {
        const chart = legend.chart;
        const label = legendItem.text;
        const hiddenSet = _hiddenLegendKeys[chartKey];
        if (hiddenSet.has(label)) hiddenSet.delete(label);
        else hiddenSet.add(label);
        const meta = chart.getDatasetMeta(legendItem.datasetIndex);
        meta.hidden = hiddenSet.has(label);
        chart.update();
    };
}

function datasetHiddenFor(chartKey, label) {
    return _hiddenLegendKeys[chartKey].has(label);
}

/**
 * ─────────────────────────────────────────────────────────────
 *  AUTH SCREEN
 * ─────────────────────────────────────────────────────────────
 */
function renderAuth() {
    const t = state.authTab;
    return `
<div class="auth-wrap">
  <div class="auth-card">
    <div class="auth-logo">⬡ TGIP pfm</div>
    <div class="auth-sub">Personal Local Finance Manager.</div>
    ${state.authError ? `<div class="msg msg-error">${esc(state.authError)}</div>` : ''}
    ${state.authSuccess ? `<div class="msg msg-success">${esc(state.authSuccess)}</div>` : ''}
    <div class="auth-tabs">
      <button class="auth-tab ${t === 'login' ? 'active' : ''}" data-action="authTab" data-tab="login">Sign In</button>
      <button class="auth-tab ${t === 'register' ? 'active' : ''}" data-action="authTab" data-tab="register">Create Account</button>
      <button class="auth-tab ${t === 'reset' ? 'active' : ''}" data-action="authTab" data-tab="reset">Reset Password</button>
    </div>

    ${t === 'login' ? `
      <div class="field"><label>Email</label><input type="email" id="auth-email" placeholder="you@example.com"></div>
      <div class="field"><label>Password</label><input type="password" id="auth-pass" placeholder="••••••••"></div>
      <button class="btn btn-primary btn-full" data-action="login">Sign In</button>
    ` : t === 'register' ? `
      <div class="field"><label>Name</label><input type="text" id="auth-name" placeholder="Your name"></div>
      <div class="field"><label>Email</label><input type="email" id="auth-email" placeholder="you@example.com"></div>
      <div class="field"><label>Password</label><input type="password" id="auth-pass" placeholder="••••••••"></div>
      <button class="btn btn-primary btn-full" data-action="register">Create Account</button>
    ` : `
      <div class="field"><label>Email</label><input type="email" id="auth-email" placeholder="you@example.com"></div>
      <button class="btn btn-primary btn-full" data-action="resetRequest">Send Reset Link</button>
      <div class="msg msg-info" style="margin-top:.75rem;font-size:.8rem;">A reset link will appear below (demo — normally sent by email).</div>
    `}
    <div id="reset-link-out"></div>
  </div>
</div>`;
}

/**
 * ─────────────────────────────────────────────────────────────
 *  APP SHELL
 * ─────────────────────────────────────────────────────────────
 */
function renderApp() {
    const banks = getUserBanks();
    const u = state.currentUser;
    const initials = (u.name || u.email).slice(0, 2).toUpperCase();

    let bankNavBtns = banks.map(b =>
        `<button class="nav-btn ${state.selectedBank === b.id && state.screen !== 'dashboard' ? 'active' : ''}" data-action="selectBank" data-id="${b.id}">${esc(b.name)}</button>`
    ).join('');

    let accountNavBtns = '';
    if (state.screen === 'account' || state.screen === 'bank') {
        const accs = state.selectedBank ? getBankAccounts(state.selectedBank) : [];
        accountNavBtns = accs.map(a =>
            `<button class="nav-btn ${state.selectedAccount === a.id ? 'active' : ''}" data-action="selectAccount" data-id="${a.id}">${esc(a.name)}</button>`
        ).join('');
    }

    let mainContent = '';
    if (state.screen === 'dashboard') mainContent = renderDashboard(banks);
    else if (state.screen === 'bank') mainContent = renderBankScreen();
    else if (state.screen === 'account') mainContent = renderAccountScreen();

    return `
<div class="app">
  <div class="topbar">
    <div class="topbar-logo" style="cursor:pointer" data-action="goDash">⬡ tgippfm</div>
    <div class="topbar-nav">
      <button class="nav-btn ${state.screen === 'dashboard' ? 'active' : ''}" data-action="goDash">Dashboard</button>
      ${bankNavBtns}
      <button class="nav-btn add-btn" data-action="openModal" data-modal="addBank">+ Bank</button>
      ${state.screen !== 'dashboard' && accountNavBtns ? `<span style="color:var(--border)">|</span>${accountNavBtns}<button class="nav-btn add-btn" data-action="openModal" data-modal="addAccount">+ Account</button>` : ''}
    </div>
    <div class="topbar-user">
      <button class="icon-btn" data-action="exportAllXLS" title="Export all data as .xlsx">⇩ Export All</button>
      <button class="icon-btn" data-action="openModal" data-modal="preferences" title="Preferences">⚙ Preferences</button>
      <div class="avatar">${initials}</div>
      <button class="btn btn-secondary btn-sm" data-action="logout">Sign out</button>
    </div>
  </div>
  <div class="main" id="main-content">
    ${mainContent}
  </div>
</div>`;
}

/**
 * ─────────────────────────────────────────────────────────────
 *  DASHBOARD
 * ─────────────────────────────────────────────────────────────
 */
function renderDashboard(banks) {
    if (!banks.length) {
        return `<div class="empty-state">
      <div class="empty-icon">🏦</div>
      <h3>No banks yet</h3>
      <p style="margin-bottom:1.5rem">Add your first bank to get started.</p>
      <button class="btn btn-primary" data-action="openModal" data-modal="addBank">+ Add Bank</button>
    </div>`;
    }

    /**
     * Bank management cards
     */
    const bankCards = banks.map(b => {
        const accs = getBankAccounts(b.id);
        const currenciesUsed = new Set(accs.map(a => a.currency || getUserPrefs().currency));
        const mixedCurrency = currenciesUsed.size > 1;
        const totalBal = accs.reduce((sum, a) => sum + getRunningBalance(a.id, today()), 0);
        const totalDisplay = mixedCurrency
            ? `<span title="Accounts use different currencies; totals shown in ${getUserPrefs().currency} for reference only">${fmt(totalBal)} *</span>`
            : fmt(totalBal, accs[0] ? (accs[0].currency || getUserPrefs().currency) : undefined);
        return `<div class="card" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:1rem" data-action="selectBank" data-id="${b.id}">
      <div>
        <div style="font-weight:700">${esc(b.name)}</div>
        <div style="font-size:.8rem;color:var(--text2)">${accs.length} account${accs.length !== 1 ? 's' : ''} · ${esc(b.institution || '')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:1.2rem;font-weight:800;color:var(--green)">${totalDisplay}</div>
        <div style="display:flex;gap:.4rem;margin-top:.4rem;justify-content:flex-end">
          <button class="btn btn-secondary btn-sm" data-action="editBank" data-id="${b.id}" style="z-index:1">Edit</button>
          <button class="btn btn-danger btn-sm" data-action="deleteBank" data-id="${b.id}" style="z-index:1">Delete</button>
        </div>
      </div>
    </div>`;
    }).join('');

    return `
<div class="section-title">Monthly Balance Overview — All Banks</div>
<div class="card"><div class="chart-wrap"><canvas id="dash-chart"></canvas></div></div>
<div style="margin-top:1.5rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem">
  ${bankCards}
</div>`;
}

function drawDashboardChart() {
    const ctx = document.getElementById('dash-chart');
    if (!ctx) return;
    const banks = getUserBanks();
    const months = getLast6Months();
    const symbol = (CURRENCIES[getUserPrefs().currency] || CURRENCIES.USD).symbol;
    const datasets = banks.map((bank, bi) => {
        const accs = getBankAccounts(bank.id);
        const data = months.map(m => accs.reduce((sum, a) => sum + getMonthEndBalance(a.id, m), 0));
        return {
            label: bank.name,
            data,
            backgroundColor: PALETTE[bi % PALETTE.length],
            hidden: datasetHiddenFor('dashboard', bank.name)
        };
    });
    const c = new Chart(ctx, {
        type: 'bar',
        data: {labels: months, datasets},
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {color: '#94a3b8', font: {size: 12}},
                    onClick: makeLegendClickHandler('dashboard')
                }
            },
            scales: {
                x: {stacked: true, grid: {color: '#2e334d'}, ticks: {color: '#94a3b8'}},
                y: {
                    stacked: true,
                    grid: {color: '#2e334d'},
                    ticks: {color: '#94a3b8', callback: v => symbol + v.toLocaleString()}
                }
            }
        }
    });
    trackChart(c);
}

/**
 * ─────────────────────────────────────────────────────────────
 *  BANK SCREEN
 * ─────────────────────────────────────────────────────────────
 */
function renderBankScreen() {
    const bank = db.banks.find(b => b.id === state.selectedBank);
    if (!bank) return '<div class="empty-state"><h3>Bank not found</h3></div>';
    const accs = getBankAccounts(bank.id);

    let accCards = '';
    if (!accs.length) {
        accCards = `<div class="empty-state"><div class="empty-icon">💳</div><h3>No accounts yet</h3>
      <p style="margin-bottom:1.5rem">Add your first account to ${esc(bank.name)}.</p>
      <button class="btn btn-primary" data-action="openModal" data-modal="addAccount">+ Add Account</button></div>`;
    } else {
        accCards = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem;margin-top:1.5rem">` +
            accs.map(a => {
                const bal = getRunningBalance(a.id, today());
                return `<div class="card" style="cursor:pointer" data-action="selectAccount" data-id="${a.id}">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div style="font-weight:700">${esc(a.name)}</div>
              <div style="font-size:.75rem;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">${a.type}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:1.1rem;font-weight:800;color:${bal >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(bal, a.currency)}</div>
            </div>
          </div>
          <div style="display:flex;gap:.4rem;margin-top:.75rem">
            <button class="btn btn-secondary btn-sm" data-action="editAccount" data-id="${a.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-action="deleteAccount" data-id="${a.id}">Delete</button>
          </div>
        </div>`;
            }).join('') + '</div>';
    }

    return `
<div class="breadcrumb"><span data-action="goDash">Dashboard</span><span class="sep">›</span><span>${esc(bank.name)}</span></div>
<div class="section-title">Monthly Balances — ${esc(bank.name)}</div>
<div class="card"><div class="chart-wrap"><canvas id="bank-chart"></canvas></div></div>
${accCards}`;
}

function drawBankChart() {
    const ctx = document.getElementById('bank-chart');
    if (!ctx) return;
    const bank = db.banks.find(b => b.id === state.selectedBank);
    if (!bank) return;
    const accs = getBankAccounts(bank.id);
    const months = getLast6Months();
    const symbol = (CURRENCIES[(accs[0] && accs[0].currency) || getUserPrefs().currency] || CURRENCIES.USD).symbol;
    const datasets = accs.map((a, ai) => {
        const data = months.map(m => getMonthEndBalance(a.id, m));
        return {
            label: a.name,
            data,
            backgroundColor: PALETTE[ai % PALETTE.length],
            hidden: datasetHiddenFor('bank', a.name)
        };
    });
    const c = new Chart(ctx, {
        type: 'bar',
        data: {labels: months, datasets},
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {legend: {labels: {color: '#94a3b8'}, onClick: makeLegendClickHandler('bank')}},
            scales: {
                x: {stacked: true, grid: {color: '#2e334d'}, ticks: {color: '#94a3b8'}},
                y: {
                    stacked: true,
                    grid: {color: '#2e334d'},
                    ticks: {color: '#94a3b8', callback: v => symbol + v.toLocaleString()}
                }
            }
        }
    });
    trackChart(c);
}

/**
 * ─────────────────────────────────────────────────────────────
 *  ACCOUNT SCREEN
 * ─────────────────────────────────────────────────────────────
 */
function renderAccountScreen() {
    const acc = db.accounts.find(a => a.id === state.selectedAccount);
    if (!acc) return '<div class="empty-state"><h3>Account not found</h3></div>';
    const bank = db.banks.find(b => b.id === acc.bankId);
    const start = state.txnRangeStart;
    const end = state.txnRangeEnd;

    // Transactions in range (date input values are 'YYYY-MM-DD' strings, comparable lexically)
    const allTxns = getAccountTxns(acc.id).filter(t => t.date >= start && t.date <= end);

    // Running balance computed in chronological order first (balance must reflect true history)
    let runBal = getRunningBalance(acc.id, addDays(start, -1));
    const chronological = allTxns.slice().sort((a, b) => a.date.localeCompare(b.date));
    const balanceById = {};
    chronological.forEach(t => {
        runBal += (t.signedAmount || 0);
        balanceById[t.id] = runBal;
    });
    let txnsWithBal = allTxns.map(t => ({...t, runningBalance: balanceById[t.id]}));

    // Sorting
    const sortCol = state.txnSortCol;
    const sortDir = state.txnSortDir;
    const sortFns = {
        date: (a, b) => a.date.localeCompare(b.date),
        type: (a, b) => a.type.localeCompare(b.type),
        description: (a, b) => (a.description || '').localeCompare(b.description || ''),
        amount: (a, b) => (a.signedAmount || 0) - (b.signedAmount || 0),
        balance: (a, b) => (a.runningBalance || 0) - (b.runningBalance || 0),
    };
    txnsWithBal.sort(sortFns[sortCol] || sortFns.date);
    if (sortDir === 'desc') txnsWithBal.reverse();

    // Pagination
    const pageSize = state.txnPageSize;
    const totalRows = txnsWithBal.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    if (state.txnPage > totalPages) state.txnPage = totalPages;
    if (state.txnPage < 1) state.txnPage = 1;
    const pageStart = (state.txnPage - 1) * pageSize;
    const pageRows = txnsWithBal.slice(pageStart, pageStart + pageSize);

    const sortArrow = (col) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

    const txnRows = pageRows.map(t => {
        const isFuture = t.date > today();
        const cls = isFuture ? 'txn-future' : '';
        return `<tr class="${cls}" data-txn-id="${t.id}">
      <td>${fmtDate(t.date)}</td>
      <td><span class="badge badge-${t.type}">${t.type}</span>${t.recurring ? '<span style="margin-left:.3rem;font-size:.7rem;color:var(--text3)">↻</span>' : ''}</td>
      <td>${esc(t.description || '')}</td>
      <td class="${t.signedAmount >= 0 ? 'txn-income' : 'txn-outgoing'} text-right">${fmt(Math.abs(t.signedAmount || 0), acc.currency)}</td>
      <td class="running-bal ${t.runningBalance >= 0 ? 'running-pos' : 'running-neg'} text-right">${fmt(t.runningBalance, acc.currency)}</td>
      <td>
        <div style="display:flex;gap:.3rem">
          <button class="btn btn-secondary btn-sm" data-action="editTxn" data-id="${t.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-action="deleteTxn" data-id="${t.id}">Del</button>
        </div>
      </td>
    </tr>`;
    }).join('');

    // New transaction row
    const allAccounts = db.accounts.filter(a => a.id !== acc.id);
    const accOptions = allAccounts.map(a => {
        const b = db.banks.find(x => x.id === a.bankId);
        return `<option value="${a.id}">[${esc(b ? b.name : '?')}] ${esc(a.name)}</option>`;
    }).join('');

    const txnTypeOptions = `
    <option value="">— type —</option>
    <option value="income">Income</option>
    <option value="outgoing">Outgoing</option>
    <option value="transfer">Transfer</option>
    <option value="interest">Interest</option>
    ${acc.type === 'regular' || acc.type === 'savings' ? '<option value="term_deposit">Term Deposit</option>' : ''}
    <option value="recurring">Recurring</option>`;

    const paginationBar = totalRows > 0 ? `
    <div class="gap-row" style="margin-top:.75rem;justify-content:space-between">
      <div style="font-size:.8rem;color:var(--text2)">
        Showing ${pageStart + 1}–${Math.min(pageStart + pageSize, totalRows)} of ${totalRows}
      </div>
      <div class="gap-row" style="gap:.4rem">
        <button class="btn btn-secondary btn-sm" data-action="txnPagePrev" ${state.txnPage <= 1 ? 'disabled' : ''}>‹ Prev</button>
        <span style="font-size:.8rem;color:var(--text2)">Page ${state.txnPage} of ${totalPages}</span>
        <button class="btn btn-secondary btn-sm" data-action="txnPageNext" ${state.txnPage >= totalPages ? 'disabled' : ''}>Next ›</button>
        <select id="txn-page-size" style="width:auto;padding:.35rem .5rem;font-size:.8rem;margin-left:.5rem">
          <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 / page</option>
          <option value="15" ${pageSize === 15 ? 'selected' : ''}>15 / page</option>
          <option value="30" ${pageSize === 30 ? 'selected' : ''}>30 / page</option>
          <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 / page</option>
        </select>
      </div>
    </div>` : '';

    return `
<div class="breadcrumb">
  <span data-action="goDash">Dashboard</span><span class="sep">›</span>
  <span data-action="goBank" data-id="${acc.bankId}">${esc(bank ? bank.name : 'Bank')}</span><span class="sep">›</span>
  <span>${esc(acc.name)}</span>
</div>
<div class="section-title">Daily Balance — ${esc(acc.name)} <span style="font-size:.8rem;color:var(--text3);font-weight:400;text-transform:uppercase;letter-spacing:.5px">${acc.type}</span></div>
<div class="card">
  <div style="font-size:.8rem;color:var(--text2);margin-bottom:.5rem">${fmtDate(start)} – ${fmtDate(end)}</div>
  <div class="chart-wrap"><canvas id="acc-chart"></canvas></div>
</div>

<div class="card" style="margin-top:1rem">
  <div class="gap-row">
    <div class="section-title" style="margin:0">Transactions</div>
    <div class="spacer"></div>
    <div class="range-bar">
      <label>From <input type="date" id="range-start" value="${start}"></label>
      <label>To <input type="date" id="range-end" value="${end}"></label>
    </div>
    <button class="icon-btn" data-action="exportAccountCSV" data-id="${acc.id}">⇩ Export CSV</button>
    <button class="icon-btn" data-action="openModal" data-modal="importCSV" data-id="${acc.id}">⇧ Import CSV</button>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
            <th class="sortable-th" data-action="sortTxn" data-col="date">Date${sortArrow('date')}</th>
            <th class="sortable-th" data-action="sortTxn" data-col="type">Type${sortArrow('type')}</th>
            <th class="sortable-th" data-action="sortTxn" data-col="description">Description${sortArrow('description')}</th>
            <th class="sortable-th text-right" data-action="sortTxn" data-col="amount">Amount${sortArrow('amount')}</th>
            <th class="sortable-th text-right" data-action="sortTxn" data-col="balance">Balance${sortArrow('balance')}</th>
            <th></th>
        </tr>
      </thead>
      <tbody>
        <tr class="add-row" id="add-txn-row">
          <td><input type="date" id="new-txn-date" value="${today()}"></td>
          <td><select id="new-txn-type">${txnTypeOptions}</select></td>
          <td><input type="text" id="new-txn-desc" placeholder="Description"></td>
          <td><input type="number" id="new-txn-amt" placeholder="0.00" step="0.01"></td>
          <td></td>
          <td><button class="btn btn-primary btn-sm" data-action="addTxn">Add</button></td>
        </tr>
        ${txnRows || `<tr><td colspan="6" class="dimmed" style="text-align:center;padding:2rem">No transactions in this range</td></tr>`}
      </tbody>
    </table>
  </div>
  ${paginationBar}
</div>

<div id="transfer-select-wrap" style="display:none" class="card" style="margin-top:.5rem">
  <div class="field"><label>Transfer to account</label>
    <select id="transfer-dest">${accOptions}</select>
  </div>
</div>`;
}

function drawAccountChart() {
    const ctx = document.getElementById('acc-chart');
    if (!ctx) return;
    const acc = db.accounts.find(a => a.id === state.selectedAccount);
    if (!acc) return;
    const start = state.txnRangeStart;
    const end = state.txnRangeEnd;
    const dailyData = getDailyBalances(acc.id, start, end);
    const labels = dailyData.map(d => d.date);
    const data = dailyData.map(d => d.balance);
    const symbol = (CURRENCIES[acc.currency || getUserPrefs().currency] || CURRENCIES.USD).symbol;
    const c = new Chart(ctx, {
        type: 'line',
        data: {
            labels, datasets: [{
                label: 'Balance', data, borderColor: '#6c63ff', backgroundColor: 'rgba(108,99,255,.15)',
                fill: true, tension: .3, pointRadius: 0, borderWidth: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {legend: {display: false}},
            scales: {
                x: {grid: {color: '#2e334d'}, ticks: {color: '#94a3b8', maxTicksLimit: 8}},
                y: {grid: {color: '#2e334d'}, ticks: {color: '#94a3b8', callback: v => symbol + v.toLocaleString()}}
            }
        }
    });
    trackChart(c);
}

/**
 * ─────────────────────────────────────────────────────────────
 *  MODALS
 * ─────────────────────────────────────────────────────────────
 */
function renderModal() {
    const existing = document.getElementById('modal-overlay');
    if (existing) existing.remove();
    const m = state.modal;
    const md = state.modalData;
    let html = '';

    if (m === 'addBank' || m === 'editBank') {
        const b = m === 'editBank' ? db.banks.find(x => x.id === md.id) : null;
        html = `<div class="modal">
      <div class="modal-title">${m === 'addBank' ? 'Add New Bank' : 'Edit Bank'}</div>
      <div class="field"><label>Bank Name</label><input type="text" id="m-bank-name" value="${esc(b ? b.name : '')}" placeholder="e.g. Chase"></div>
      <div class="field"><label>Institution</label><input type="text" id="m-bank-inst" value="${esc(b ? b.institution || '' : '')}"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-action="closeModal">Cancel</button>
        <button class="btn btn-primary" data-action="${m === 'addBank' ? 'saveNewBank' : 'saveEditBank'}" data-id="${b ? b.id : ''}">Save</button>
      </div>
    </div>`;
    } else if (m === 'addAccount' || m === 'editAccount') {
        const a = m === 'editAccount' ? db.accounts.find(x => x.id === md.id) : null;
        const banks = getUserBanks();
        const bankOpts = banks.map(b => `<option value="${b.id}" ${(a && a.bankId === b.id) || (state.selectedBank === b.id) ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
        const accCurrency = a ? (a.currency || getUserPrefs().currency) : getUserPrefs().currency;
        const currencyOpts = Object.entries(CURRENCIES).map(([code, info]) =>
            `<option value="${code}" ${accCurrency === code ? 'selected' : ''}>${esc(info.label)}</option>`
        ).join('');
        html = `<div class="modal">
      <div class="modal-title">${m === 'addAccount' ? 'Add Account' : 'Edit Account'}</div>
      <div class="field"><label>Account Name</label><input type="text" id="m-acc-name" value="${esc(a ? a.name : '')}" placeholder="e.g. Checking"></div>
      <div class="row2">
        <div class="field"><label>Bank</label><select id="m-acc-bank">${bankOpts}</select></div>
        <div class="field"><label>Type</label>
          <select id="m-acc-type">
            <option value="regular" ${a && a.type === 'regular' ? 'selected' : ''}>Regular</option>
            <option value="savings" ${a && a.type === 'savings' ? 'selected' : ''}>Savings</option>
            <option value="compound" ${a && a.type === 'compound' ? 'selected' : ''}>Compound</option>
            <option value="term" ${a && a.type === 'term' ? 'selected' : ''}>Term</option>
          </select>
        </div>
      </div>
      <div class="row2">
        <div class="field"><label>Account Number / Reference</label><input type="text" id="m-acc-ref" value="${esc(a ? a.reference || '' : '')}" placeholder="Optional"></div>
        <div class="field"><label>Currency</label><select id="m-acc-currency">${currencyOpts}</select></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-action="closeModal">Cancel</button>
        <button class="btn btn-primary" data-action="${m === 'addAccount' ? 'saveNewAccount' : 'saveEditAccount'}" data-id="${a ? a.id : ''}">Save</button>
      </div>
    </div>`;
    } else if (m === 'recurringSetup') {
        html = `<div class="modal">
      <div class="modal-title">Set Up Recurring Transaction</div>
      <div class="info-box">This will create multiple transaction entries. Future-dated ones appear greyed out until their date arrives.</div>
      <div class="field"><label>Period</label>
        <select id="m-rec-period">
          <option value="monthly">Monthly (same day)</option>
          <option value="yearly">Yearly (same day)</option>
          <option value="days:7">Every 7 days</option>
          <option value="days:14">Every 14 days</option>
          <option value="months:3">Every 3 months</option>
          <option value="months:6">Every 6 months</option>
        </select>
      </div>
      <div class="field"><label>Number of occurrences</label><input type="number" id="m-rec-count" value="12" min="1" max="120"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-action="closeModal">Cancel</button>
        <button class="btn btn-primary" data-action="saveRecurring">Create</button>
      </div>
    </div>`;
    } else if (m === 'termDeposit') {
        const banks = getUserBanks();
        const allAcc = db.accounts;
        const parentOpts = allAcc.map(a => {
            const b = db.banks.find(x => x.id === a.bankId);
            return `<option value="${a.id}">${esc(b ? b.name : '?')} — ${esc(a.name)}</option>`;
        }).join('');
        const defDate = addMonths(md.date || today(), 12);
        html = `<div class="modal">
      <div class="modal-title">Create Term Deposit</div>
      <div class="field"><label>Account Name / Reference</label><input type="text" id="m-td-name" placeholder="e.g. 12-Month CD"></div>
      <div class="field"><label>Description</label><input type="text" id="m-td-desc" placeholder="Optional"></div>
      <div class="field"><label>Parent Account (funds come from)</label><select id="m-td-parent" onchange="calcTD()">${parentOpts}</select></div>
      <div class="row2">
        <div class="field"><label>Amount</label><input type="number" id="m-td-amt" value="${md.amount || ''}" step="0.01" oninput="calcTD()"></div>
        <div class="field"><label>Rate (% p.a.)</label><input type="number" id="m-td-rate" value="4.5" step="0.01" oninput="calcTD()"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Term (months)</label><input type="number" id="m-td-term" value="12" min="1" oninput="updateTDEnd()"></div>
        <div class="field"><label>Maturity Date</label><input type="date" id="m-td-end" value="${defDate}"></div>
      </div>
      <div class="interest-preview" id="td-preview">
        <div style="color:var(--text2);font-size:.8rem">Interest at maturity</div>
        <div class="big" id="td-interest-out">—</div>
        <div style="color:var(--text2);font-size:.8rem;margin-top:.25rem">Total: <span id="td-total-out">—</span></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-action="closeModal">Cancel</button>
        <button class="btn btn-primary" data-action="saveTermDeposit">Create</button>
      </div>
    </div>`;
    } else if (m === 'preferences') {
        const u = state.currentUser;
        const storageLine = dbFileName
            ? `<div class="storage-path">📄 ${esc(dbFileName)}</div>`
            : `<div class="storage-path">🌐 Browser storage (this device only)</div>`;
        const fsSupport = fsAccessSupported();
        html = `<div class="modal">
      <div class="modal-title">Preferences</div>

      <div class="pref-section">
        <h4>Account</h4>
        <div class="field"><label>Name</label><input type="text" id="m-pref-name" value="${esc(u.name || '')}"></div>
        <div class="field"><label>Email</label><input type="text" value="${esc(u.email)}" disabled style="opacity:.6"></div>
        <button class="btn btn-secondary btn-sm" data-action="savePrefName">Save Name</button>
      </div>

      <div class="pref-section">
        <h4>Display</h4>
        <div class="pref-desc">Sets the default currency for new accounts and totals where multiple accounts share a currency. Each account can override this individually when you create or edit it.</div>
        <div class="row2">
          <div class="field"><label>Default Currency</label>
            <select id="m-pref-currency">
              ${Object.entries(CURRENCIES).map(([code, info]) =>
            `<option value="${code}" ${getUserPrefs().currency === code ? 'selected' : ''}>${esc(info.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Date Format</label>
            <select id="m-pref-dateformat">
              <option value="YYYY-MM-DD" ${getUserPrefs().dateFormat === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD</option>
              <option value="DD-MM-YYYY" ${getUserPrefs().dateFormat === 'DD-MM-YYYY' ? 'selected' : ''}>DD-MM-YYYY</option>
            </select>
          </div>
        </div>
        <div class="pref-desc" style="margin-top:-.4rem">Dates are always stored as YYYY-MM-DD internally — this only changes how they're displayed.</div>
        <button class="btn btn-secondary btn-sm" data-action="savePrefDisplay">Save Display Settings</button>
      </div>

      <div class="pref-section">
        <h4>Database Location</h4>
        <div class="pref-desc">By default your data is stored in this browser only. Choose a local file to keep your database in a file you control — tgippfm will keep writing to it automatically as you make changes. Requires a Chromium-based browser (Chrome, Edge).</div>
        ${storageLine}
        <div class="gap-row" style="margin-top:.75rem">
          <button class="btn btn-secondary btn-sm" data-action="chooseDBLocation" ${fsSupport ? '' : 'disabled'}>Choose File…</button>
          <button class="btn btn-secondary btn-sm" data-action="openDBLocation" ${fsSupport ? '' : 'disabled'}>Open Existing File…</button>
          ${dbFileName ? `<button class="btn btn-secondary btn-sm" data-action="useBrowserOnly">Use Browser Storage Only</button>` : ''}
        </div>
        ${!fsSupport ? `<div class="msg msg-info" style="margin-top:.6rem;font-size:.78rem">Not supported in this browser — data will stay in browser storage.</div>` : ''}
        ${state.prefMessage ? `<div class="msg msg-success" style="margin-top:.6rem">${esc(state.prefMessage)}</div>` : ''}
      </div>

      <div class="pref-section">
        <h4>Data Export</h4>
        <div class="pref-desc">Export your entire database — every bank, account, and transaction — as a single .xlsx workbook with one sheet per account.</div>
        <button class="btn btn-secondary btn-sm" data-action="exportAllXLS">⇩ Export All as .xlsx</button>
      </div>

      <div class="pref-section">
        <h4>Diagnostic Log</h4>
        <div class="pref-desc">Recent app activity and errors — useful for troubleshooting things like CSV imports that don't behave as expected.</div>
        <div class="gap-row" style="margin-bottom:.6rem">
          <button class="btn btn-secondary btn-sm" data-action="toggleLogView">${state.showLogs ? 'Hide Log' : 'Show Log'}</button>
          <button class="btn btn-secondary btn-sm" data-action="downloadLogs">⇩ Download Log</button>
          <button class="btn btn-danger btn-sm" data-action="clearLogsAction">Clear Log</button>
        </div>
        ${state.showLogs ? renderLogTable() : ''}
      </div>

      <div class="modal-actions">
        <button class="btn btn-primary" data-action="closeModal">Done</button>
      </div>
    </div>`;
    } else if (m === 'importCSV') {
        html = `<div class="modal">
      <div class="modal-title">Import Transactions from CSV</div>
      <div class="pref-desc" style="margin-bottom:1rem">
        Expected columns: <strong>date, type, description, amount</strong>.
        Date as YYYY-MM-DD. Type is one of income, outgoing, interest, transfer.
        Amount is positive for credits, negative for debits (or use type to infer sign).
      </div>
      <div class="file-drop" id="csv-drop-zone">
        <div>Click to choose a .csv file, or drag one here</div>
        <input type="file" id="csv-file-input" accept=".csv" style="display:none">
      </div>
      <div id="csv-preview-wrap"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-action="closeModal">Cancel</button>
        <button class="btn btn-primary" id="csv-confirm-btn" data-action="confirmCSVImport" data-id="${md.id}" style="display:none">Import Rows</button>
      </div>
    </div>`;
    } else if (m === 'confirmDelete') {
        html = `<div class="modal">
      <div class="modal-title">Confirm Delete</div>
      <p style="color:var(--text2);margin-bottom:1.5rem">${esc(md.message || 'Are you sure?')}</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-action="closeModal">Cancel</button>
        <button class="btn btn-danger" data-action="confirmDeleteAction">Delete</button>
      </div>
    </div>`;
    } else if (m === 'resetConfirm') {
        html = `<div class="modal">
      <div class="modal-title">Reset Password</div>
      <div class="field"><label>New Password</label><input type="password" id="m-new-pass" placeholder="New password"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-action="closeModal">Cancel</button>
        <button class="btn btn-primary" data-action="doResetPass">Save Password</button>
      </div>
    </div>`;
    } else if (m === 'editTxn') {
        const t = db.transactions.find(x => x.id === md.id);
        if (!t) return;
        html = `<div class="modal">
      <div class="modal-title">Edit Transaction</div>
      <div class="row2">
        <div class="field"><label>Date</label><input type="date" id="m-et-date" value="${t.date}"></div>
        <div class="field"><label>Type</label>
          <select id="m-et-type">
            <option value="income" ${t.type === 'income' ? 'selected' : ''}>Income</option>
            <option value="outgoing" ${t.type === 'outgoing' ? 'selected' : ''}>Outgoing</option>
            <option value="transfer" ${t.type === 'transfer' ? 'selected' : ''}>Transfer</option>
            <option value="interest" ${t.type === 'interest' ? 'selected' : ''}>Interest</option>
          </select>
        </div>
      </div>
      <div class="field"><label>Description</label><input type="text" id="m-et-desc" value="${esc(t.description || '')}"></div>
      <div class="field"><label>Amount (positive = credit, negative = debit)</label>
        <input type="number" id="m-et-amt" value="${t.signedAmount || 0}" step="0.01"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-action="closeModal">Cancel</button>
        <button class="btn btn-primary" data-action="saveEditTxn" data-id="${t.id}">Save</button>
      </div>
    </div>`;
    }

    if (html) {
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.id = 'modal-overlay';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeModal();
        });
        // inject helpers
        if (m === 'termDeposit') {
            window.calcTD = calcTermDepositPreview;
            window.updateTDEnd = updateTDEnd;
            setTimeout(calcTermDepositPreview, 50);
        }
        if (m === 'importCSV') {
            setupCSVDropZone(md.id);
        }
    }
}

function closeModal() {
    const o = document.getElementById('modal-overlay');
    if (o) o.remove();
    state.modal = null;
    state.modalData = {};
}

function calcTermDepositPreview() {
    const amt = parseFloat(document.getElementById('m-td-amt')?.value) || 0;
    const rate = parseFloat(document.getElementById('m-td-rate')?.value) || 0;
    const term = parseFloat(document.getElementById('m-td-term')?.value) || 12;
    const parentId = document.getElementById('m-td-parent')?.value;
    const parentAcc = parentId ? db.accounts.find(a => a.id === parentId) : null;
    const currency = parentAcc ? parentAcc.currency : undefined;
    const interest = amt * (rate / 100) * (term / 12);
    const total = amt + interest;
    const io = document.getElementById('td-interest-out');
    const to = document.getElementById('td-total-out');
    if (io) io.textContent = fmt(interest, currency);
    if (to) to.textContent = fmt(total, currency);
}

function updateTDEnd() {
    const term = parseInt(document.getElementById('m-td-term')?.value) || 12;
    const date = state.modalData.date || today();
    const endEl = document.getElementById('m-td-end');
    if (endEl) endEl.value = addMonths(date, term);
    calcTermDepositPreview();
}

/**
 * ─────────────────────────────────────────────────────────────
 *  EVENT BINDING
 * ─────────────────────────────────────────────────────────────
 */
function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function numVal(id) {
    return parseFloat(val(id)) || 0;
}

let _eventsBound = false;

function bindEvents() {
    if (_eventsBound) return;
    document.body.addEventListener('click', handleClick, {capture: false});
    document.body.addEventListener('change', handleChange, {capture: false});
    _eventsBound = true;
}

function handleChange(e) {
    const id = e.target.id;
    if (id === 'range-start') {
        state.txnRangeStart = e.target.value;
        state.txnPage = 1;
        render();
    }
    if (id === 'range-end') {
        state.txnRangeEnd = e.target.value;
        state.txnPage = 1;
        render();
    }
    if (id === 'txn-page-size') {
        state.txnPageSize = parseInt(e.target.value) || 15;
        state.txnPage = 1;
        render();
    }
    if (id === 'new-txn-type') {
        const wrap = document.getElementById('transfer-select-wrap');
        if (wrap) wrap.style.display = e.target.value === 'transfer' ? 'block' : 'none';
        if (e.target.value === 'recurring') {
            state.modal = 'recurringSetup';
            state.modalData = {};
            renderModal();
        }
        if (e.target.value === 'term_deposit') {
            state.modal = 'termDeposit';
            state.modalData = {date: val('new-txn-date'), amount: numVal('new-txn-amt')};
            renderModal();
        }
    }
}

function handleClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    e.stopPropagation();

    // AUTH
    if (action === 'authTab') {
        state.authError = '';
        state.authSuccess = '';
        state.authTab = btn.dataset.tab;
        render();
        return;
    }
    if (action === 'login') {
        doLogin();
        return;
    }
    if (action === 'register') {
        doRegister();
        return;
    }
    if (action === 'resetRequest') {
        doResetRequest();
        return;
    }
    if (action === 'logout') {
        doLogout();
        return;
    }

    // NAV
    if (action === 'goDash') {
        state.screen = 'dashboard';
        state.selectedBank = null;
        state.selectedAccount = null;
        render();
        return;
    }
    if (action === 'goBank') {
        const id = btn.dataset.id || state.selectedBank;
        state.screen = 'bank';
        state.selectedBank = id;
        state.selectedAccount = null;
        render();
        return;
    }
    if (action === 'selectBank') {
        state.screen = 'bank';
        state.selectedBank = btn.dataset.id;
        state.selectedAccount = null;
        render();
        return;
    }
    if (action === 'selectAccount') {
        state.screen = 'account';
        state.selectedAccount = btn.dataset.id;
        state.txnPage = 1;
        render();
        return;
    }

    // MODALS
    if (action === 'openModal') {
        state.modal = btn.dataset.modal;
        state.modalData = btn.dataset.id ? {id: btn.dataset.id} : {};
        state.prefMessage = '';
        renderModal();
        return;
    }
    if (action === 'closeModal') {
        closeModal();
        return;
    }

    // BANKS
    if (action === 'editBank') {
        e.stopPropagation();
        state.modal = 'editBank';
        state.modalData = {id: btn.dataset.id};
        renderModal();
        return;
    }
    if (action === 'deleteBank') {
        e.stopPropagation();
        handleDeleteBank(btn.dataset.id);
        return;
    }
    if (action === 'saveNewBank') {
        saveNewBank();
        return;
    }
    if (action === 'saveEditBank') {
        saveEditBank(btn.dataset.id);
        return;
    }

    // ACCOUNTS
    if (action === 'editAccount') {
        e.stopPropagation();
        state.modal = 'editAccount';
        state.modalData = {id: btn.dataset.id};
        renderModal();
        return;
    }
    if (action === 'deleteAccount') {
        e.stopPropagation();
        handleDeleteAccount(btn.dataset.id);
        return;
    }
    if (action === 'saveNewAccount') {
        saveNewAccount();
        return;
    }
    if (action === 'saveEditAccount') {
        saveEditAccount(btn.dataset.id);
        return;
    }

    // TRANSACTIONS
    if (action === 'addTxn') {
        addTransaction();
        return;
    }
    if (action === 'editTxn') {
        state.modal = 'editTxn';
        state.modalData = {id: btn.dataset.id};
        renderModal();
        return;
    }
    if (action === 'saveEditTxn') {
        saveEditTxn(btn.dataset.id);
        return;
    }
    if (action === 'deleteTxn') {
        handleDeleteTxn(btn.dataset.id);
        return;
    }
    if (action === 'sortTxn') {
        handleSortTxn(btn.dataset.col);
        return;
    }
    if (action === 'txnPagePrev') {
        state.txnPage = Math.max(1, state.txnPage - 1);
        render();
        return;
    }
    if (action === 'txnPageNext') {
        state.txnPage = state.txnPage + 1;
        render();
        return;
    }
    if (action === 'confirmDeleteAction') {
        executeConfirmedDelete();
        return;
    }
    if (action === 'saveRecurring') {
        saveRecurring();
        return;
    }
    if (action === 'saveTermDeposit') {
        saveTermDeposit();
        return;
    }
    if (action === 'doResetPass') {
        doResetPass();
        return;
    }

    // PREFERENCES / STORAGE
    if (action === 'savePrefName') {
        savePrefName();
        return;
    }
    if (action === 'savePrefDisplay') {
        savePrefDisplay();
        return;
    }
    if (action === 'chooseDBLocation') {
        chooseNewDBLocation();
        return;
    }
    if (action === 'openDBLocation') {
        openExistingDBLocation();
        return;
    }
    if (action === 'useBrowserOnly') {
        useBrowserStorageOnly();
        return;
    }
    if (action === 'toggleLogView') {
        toggleLogView();
        return;
    }
    if (action === 'downloadLogs') {
        downloadLogs();
        return;
    }
    if (action === 'clearLogsAction') {
        clearLogsAction();
        return;
    }

    // CSV / XLSX
    if (action === 'exportAccountCSV') {
        exportAccountCSV(btn.dataset.id);
        return;
    }
    if (action === 'confirmCSVImport') {
        confirmCSVImport(btn.dataset.id);
        return;
    }
    if (action === 'exportAllXLS') {
        exportAllXLS();
        return;
    }
}

/**
 * ─────────────────────────────────────────────────────────────
 *  AUTH ACTIONS
 * ─────────────────────────────────────────────────────────────
 */
function doLogin() {
    const email = val('auth-email');
    const pass = val('auth-pass');
    if (!email || !pass) {
        state.authError = 'Enter email and password.';
        render();
        return;
    }
    const user = db.users.find(u => u.email === email.toLowerCase());
    if (!user || !checkPass(pass, user.passwordHash)) {
        logEvent('warn', 'Login failed', {email});
        state.authError = 'Invalid email or password.';
        render();
        return;
    }
    logEvent('info', 'Login succeeded', {email});
    state.currentUser = user;
    state.screen = 'dashboard';
    state.authError = '';
    render();
}

function doRegister() {
    const name = val('auth-name');
    const email = val('auth-email');
    const pass = val('auth-pass');
    if (!email || !pass) {
        state.authError = 'Email and password required.';
        render();
        return;
    }
    if (db.users.find(u => u.email === email.toLowerCase())) {
        state.authError = 'Email already registered.';
        render();
        return;
    }
    const user = {
        id: uid(),
        name,
        email: email.toLowerCase(),
        passwordHash: hashPass(pass),
        createdAt: today(),
        defaultCurrency: 'USD',
        dateFormat: 'YYYY-MM-DD'
    };
    db.users.push(user);
    commit();
    state.currentUser = user;
    state.screen = 'dashboard';
    state.authError = '';
    render();
}

function doResetRequest() {
    const email = val('auth-email');
    const user = db.users.find(u => u.email === email.toLowerCase());
    const out = document.getElementById('reset-link-out');
    if (!user) {
        if (out) out.innerHTML = `<div class="msg msg-info">If that email exists, a link will be sent.</div>`;
        return;
    }
    const token = uid() + uid();
    user.resetToken = token;
    saveDB(db);
    if (out) out.innerHTML = `<div class="msg msg-success">Reset link (demo — would be emailed):<br>
    <a href="#" onclick="window._resetToken='${token}';window._resetUser='${user.id}';
    document.getElementById('root').dispatchEvent(new CustomEvent('resetClick'));return false;" 
    style="color:var(--accent2)">Click here to reset password</a></div>`;
    document.getElementById('root').addEventListener('resetClick', () => {
        state.modal = 'resetConfirm';
        state.modalData = {userId: window._resetUser, token: window._resetToken};
        renderModal();
    }, {once: true});
}

function doResetPass() {
    const newPass = val('m-new-pass');
    const {userId, token} = state.modalData;
    const user = db.users.find(u => u.id === userId && u.resetToken === token);
    if (!user) {
        alert('Invalid reset token.');
        return;
    }
    user.passwordHash = hashPass(newPass);
    delete user.resetToken;
    saveDB(db);
    closeModal();
    state.authSuccess = 'Password updated. Please sign in.';
    state.authTab = 'login';
    render();
}

function doLogout() {
    state.currentUser = null;
    state.screen = 'auth';
    state.authError = '';
    state.authSuccess = '';
    state.selectedBank = null;
    state.selectedAccount = null;
    render();
}

/**
 * ─────────────────────────────────────────────────────────────
 *  BANK ACTIONS
 * ─────────────────────────────────────────────────────────────
 */
function saveNewBank() {
    const name = val('m-bank-name');
    const inst = val('m-bank-inst');
    if (!name) {
        alert('Bank name required.');
        return;
    }
    db.banks.push({id: uid(), userId: state.currentUser.id, name, institution: inst, createdAt: today()});
    closeModal();
    commit();
}

function saveEditBank(id) {
    const bank = db.banks.find(b => b.id === id);
    if (!bank) return;
    bank.name = val('m-bank-name') || bank.name;
    bank.institution = val('m-bank-inst');
    closeModal();
    commit();
}

function handleDeleteBank(id) {
    const accs = getBankAccounts(id);
    if (accs.length) {
        alert('Remove all accounts from this bank before deleting it.');
        return;
    }
    state.modal = 'confirmDelete';
    state.modalData = {type: 'bank', id, message: `Delete this bank? This cannot be undone.`};
    renderModal();
}

/**
 * ─────────────────────────────────────────────────────────────
 *  ACCOUNT ACTIONS
 * ─────────────────────────────────────────────────────────────
 */
function saveNewAccount() {
    const name = val('m-acc-name');
    const bankId = val('m-acc-bank');
    const type = val('m-acc-type');
    const reference = val('m-acc-ref');
    const currency = val('m-acc-currency') || getUserPrefs().currency;
    if (!name || !bankId) {
        alert('Account name and bank required.');
        return;
    }
    db.accounts.push({id: uid(), bankId, name, type: type || 'regular', reference, currency, createdAt: today()});
    closeModal();
    commit();
}

function saveEditAccount(id) {
    const acc = db.accounts.find(a => a.id === id);
    if (!acc) return;
    acc.name = val('m-acc-name') || acc.name;
    acc.bankId = val('m-acc-bank') || acc.bankId;
    acc.type = val('m-acc-type') || acc.type;
    acc.reference = val('m-acc-ref');
    acc.currency = val('m-acc-currency') || acc.currency || getUserPrefs().currency;
    closeModal();
    commit();
}

function handleDeleteAccount(id) {
    const txns = getAccountTxns(id);
    if (txns.length) {
        alert('Remove all transactions from this account before deleting it.');
        return;
    }
    state.modal = 'confirmDelete';
    state.modalData = {type: 'account', id, message: 'Delete this account? This cannot be undone.'};
    renderModal();
}

/**
 * ─────────────────────────────────────────────────────────────
 *  TRANSACTION ACTIONS
 * ─────────────────────────────────────────────────────────────
 */
function addTransaction() {
    const date = val('new-txn-date') || today();
    const type = val('new-txn-type');
    const desc = val('new-txn-desc');
    const amt = numVal('new-txn-amt');
    const accId = state.selectedAccount;
    if (!accId) return;

    if (type === 'recurring' || type === 'term_deposit') return; // handled by modal

    if (!type) {
        alert('Please select a transaction type.');
        return;
    }
    if (!amt) {
        alert('Enter an amount.');
        return;
    }

    const signedAmt = (type === 'outgoing' || type === 'transfer') ? -Math.abs(amt) : Math.abs(amt);

    if (type === 'transfer') {
        const destId = val('transfer-dest');
        if (!destId) {
            alert('Select a destination account.');
            return;
        }
        const transferRef = uid();
        db.transactions.push({
            id: uid(),
            accountId: accId,
            date,
            type: 'transfer',
            description: `Transfer to ${getAccName(destId)}${desc ? ' — ' + desc : ''}`,
            signedAmount: -Math.abs(amt),
            transferRef
        });
        db.transactions.push({
            id: uid(),
            accountId: destId,
            date,
            type: 'transfer',
            description: `Transfer from ${getAccName(accId)}${desc ? ' — ' + desc : ''}`,
            signedAmount: Math.abs(amt),
            transferRef
        });
    } else {
        db.transactions.push({id: uid(), accountId: accId, date, type, description: desc, signedAmount: signedAmt});
    }
    commit();
}

function getAccName(accId) {
    const a = db.accounts.find(x => x.id === accId);
    if (!a) return 'Unknown';
    const b = db.banks.find(x => x.id === a.bankId);
    return (b ? b.name + ' — ' : '') + a.name;
}

function saveEditTxn(id) {
    const t = db.transactions.find(x => x.id === id);
    if (!t) return;
    t.date = val('m-et-date') || t.date;
    t.type = val('m-et-type') || t.type;
    t.description = val('m-et-desc');
    const newAmt = parseFloat(document.getElementById('m-et-amt')?.value);
    if (!isNaN(newAmt)) t.signedAmount = newAmt;
    closeModal();
    commit();
}

function handleDeleteTxn(id) {
    const t = db.transactions.find(x => x.id === id);
    if (!t) return;
    if (t.signedAmount !== 0 && t.signedAmount != null) {
        state.modal = 'confirmDelete';
        state.modalData = {type: 'txn', id, message: 'Delete this transaction? This will affect balances.'};
        renderModal();
    } else {
        db.transactions = db.transactions.filter(x => x.id !== id);
        commit();
    }
}

function handleSortTxn(col) {
    if (state.txnSortCol === col) {
        state.txnSortDir = state.txnSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        state.txnSortCol = col;
        state.txnSortDir = 'asc';
    }
    state.txnPage = 1;
    render();
}

function saveRecurring() {
    const period = val('m-rec-period');
    const count = parseInt(val('m-rec-count')) || 1;
    const date = val('new-txn-date') || today();
    const type = 'outgoing'; // placeholder; user set via main field or defaults
    const desc = val('new-txn-desc');
    const amt = numVal('new-txn-amt');
    const accId = state.selectedAccount;

    if (!accId || !amt) {
        alert('Enter an amount on the transaction row first.');
        closeModal();
        return;
    }

    const base = {
        accountId: accId,
        date,
        type: 'outgoing',
        description: desc || 'Recurring',
        signedAmount: -Math.abs(amt),
        recurring: true,
        recurringGroup: uid(),
    };

    createRecurringTransactions(base, period, count);
    closeModal();
    commit();
}

function saveTermDeposit() {
    const name = val('m-td-name');
    const desc = val('m-td-desc');
    const parentId = val('m-td-parent');
    const amt = numVal('m-td-amt');
    const rate = numVal('m-td-rate');
    const term = parseInt(val('m-td-term')) || 12;
    const endDate = val('m-td-end');
    const startDate = state.modalData.date || today();

    if (!name || !amt || !parentId) {
        alert('Fill in all required fields.');
        return;
    }

    const parentAcc = db.accounts.find(a => a.id === parentId);
    if (!parentAcc) return;

    // Create term deposit account under same bank
    const tdAccId = uid();
    db.accounts.push({
        id: tdAccId,
        bankId: parentAcc.bankId,
        name,
        type: 'term',
        reference: name,
        createdAt: today(),
        termEnd: endDate,
        termRate: rate
    });

    // Transfer from parent to TD
    const tRef = uid();
    db.transactions.push({
        id: uid(),
        accountId: parentId,
        date: startDate,
        type: 'transfer',
        description: `Term Deposit — ${name}`,
        signedAmount: -Math.abs(amt),
        transferRef: tRef
    });
    db.transactions.push({
        id: uid(),
        accountId: tdAccId,
        date: startDate,
        type: 'transfer',
        description: `Opening — ${desc || name}`,
        signedAmount: Math.abs(amt),
        transferRef: tRef
    });

    // Maturity: transfer back + interest
    const interest = amt * (rate / 100) * (term / 12);
    const mRef = uid();
    db.transactions.push({
        id: uid(),
        accountId: tdAccId,
        date: endDate,
        type: 'transfer',
        description: `Maturity transfer to ${parentAcc.name}`,
        signedAmount: -Math.abs(amt),
        transferRef: mRef
    });
    db.transactions.push({
        id: uid(),
        accountId: parentId,
        date: endDate,
        type: 'transfer',
        description: `Maturity from ${name}`,
        signedAmount: Math.abs(amt),
        transferRef: mRef
    });
    db.transactions.push({
        id: uid(),
        accountId: parentId,
        date: endDate,
        type: 'interest',
        description: `Interest from ${name}`,
        signedAmount: Math.abs(interest)
    });

    closeModal();
    // Clear the term_deposit type selector
    commit();
}

function executeConfirmedDelete() {
    const {type, id} = state.modalData;
    if (type === 'bank') {
        db.banks = db.banks.filter(b => b.id !== id);
        if (state.selectedBank === id) {
            state.selectedBank = null;
            state.screen = 'dashboard';
        }
    } else if (type === 'account') {
        db.accounts = db.accounts.filter(a => a.id !== id);
        if (state.selectedAccount === id) {
            state.selectedAccount = null;
            state.screen = 'bank';
        }
    } else if (type === 'txn') {
        db.transactions = db.transactions.filter(t => t.id !== id);
    }
    closeModal();
    commit();
}

/**
 * ─────────────────────────────────────────────────────────────
 *  CSV IMPORT / EXPORT (per account)
 * ─────────────────────────────────────────────────────────────
 */
let _csvParsedRows = null; // staged rows awaiting confirm

function setupCSVDropZone(accountId) {
    logEvent('info', 'CSV import modal opened', {accountId});
    const zone = document.getElementById('csv-drop-zone');
    const input = document.getElementById('csv-file-input');
    if (!zone || !input) {
        logEvent('error', 'CSV drop zone or file input not found in DOM');
        return;
    }
    if (!accountId) {
        logEvent('error', 'CSV import setup called without an accountId — import will fail');
    }

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', e => {
        const file = e.target.files[0];
        logEvent('info', 'CSV file selected via picker', {name: file?.name, size: file?.size, type: file?.type});
        if (file) handleCSVFile(file, accountId);
        else logEvent('warn', 'File input change fired with no file');
    });
    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        logEvent('info', 'CSV file dropped', {name: file?.name, size: file?.size, type: file?.type});
        if (file) handleCSVFile(file, accountId);
        else logEvent('warn', 'Drop event fired with no file');
    });
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length);
    if (!lines.length) {
        logEvent('warn', 'CSV file appears empty');
        return [];
    }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    logEvent('info', 'CSV headers parsed', {headers, lineCount: lines.length - 1});
    const requiredCols = ['date', 'amount'];
    const missing = requiredCols.filter(c => !headers.includes(c));
    if (missing.length) logEvent('warn', 'CSV missing expected columns', {missing, headers});
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = splitCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => row[h] = (cells[idx] || '').trim());
        rows.push(row);
    }
    return rows;
}

function splitCSVLine(line) {
    const out = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            out.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out.map(c => c.replace(/^"|"$/g, ''));
}

function handleCSVFile(file, accountId) {
    if (!accountId) {
        logEvent('error', 'handleCSVFile called without accountId — aborting import');
        alert('Could not determine which account to import into. Please close this dialog and try again from the account screen.');
        return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
        logEvent('error', 'FileReader failed to read the CSV file', reader.error);
        alert('Could not read that file. Please try again.');
    };
    reader.onload = e => {
        try {
            const rows = parseCSV(e.target.result);
            const validTypes = ['income', 'outgoing', 'interest', 'transfer'];
            const parsed = rows.map((r, idx) => {
                const date = r.date || '';
                let type = (r.type || '').toLowerCase();
                if (!validTypes.includes(type)) type = parseFloat(r.amount) < 0 ? 'outgoing' : 'income';
                let amount = parseFloat(r.amount);
                if (isNaN(amount)) amount = 0;
                if (type === 'outgoing' && amount > 0) amount = -amount;
                if (type !== 'outgoing' && type !== 'transfer' && amount < 0) amount = Math.abs(amount);
                const valid = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && amount !== 0;
                return {row: idx + 2, date, type, description: r.description || '', amount, valid};
            });
            const validCount = parsed.filter(p => p.valid).length;
            logEvent('info', 'CSV parsed', {
                totalRows: parsed.length,
                validRows: validCount,
                invalidRows: parsed.length - validCount
            });
            _csvParsedRows = {accountId, parsed};
            renderCSVPreview(parsed, accountId);
        } catch (err) {
            logEvent('error', 'Exception while parsing CSV', err);
            alert('Something went wrong reading that CSV. Check the log in Preferences for details.');
        }
    };
    reader.readAsText(file);
}

function renderCSVPreview(parsed, accountId) {
    const wrap = document.getElementById('csv-preview-wrap');
    const acc = db.accounts.find(a => a.id === accountId);
    const currency = acc ? acc.currency : undefined;
    const validCount = parsed.filter(p => p.valid).length;
    const invalidCount = parsed.length - validCount;
    const rowsHtml = parsed.slice(0, 15).map(p => `
    <tr style="${p.valid ? '' : 'opacity:.4'}">
      <td>${p.row}</td><td>${esc(p.date) || '<span class="dimmed">missing</span>'}</td>
      <td><span class="badge badge-${p.type}">${p.type}</span></td>
      <td>${esc(p.description)}</td>
      <td class="text-right">${fmt(p.amount, currency)}</td>
    </tr>`).join('');
    wrap.innerHTML = `
    <div class="info-box" style="margin-top:1rem">
      ${validCount} valid row${validCount !== 1 ? 's' : ''} ready to import${invalidCount ? `, ${invalidCount} skipped (missing/invalid date or zero amount)` : ''}.
    </div>
    <div class="table-wrap" style="max-height:240px;overflow-y:auto">
      <table>
        <thead><tr><th>Row</th><th>Date</th><th>Type</th><th>Description</th><th class="text-right">Amount</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    ${parsed.length > 15 ? `<div class="dimmed" style="margin-top:.4rem;font-size:.8rem">…and ${parsed.length - 15} more rows</div>` : ''}`;
    const confirmBtn = document.getElementById('csv-confirm-btn');
    if (confirmBtn) confirmBtn.style.display = validCount ? 'inline-flex' : 'none';
}

function confirmCSVImport(accountId) {
    if (!_csvParsedRows) {
        logEvent('error', 'confirmCSVImport called with no staged rows');
        return;
    }
    if (!accountId) logEvent('warn', 'confirmCSVImport accountId param missing, falling back to staged accountId', {staged: _csvParsedRows.accountId});
    const targetAccountId = accountId || _csvParsedRows.accountId;
    const valid = _csvParsedRows.parsed.filter(p => p.valid);
    valid.forEach(p => {
        db.transactions.push({
            id: uid(), accountId: targetAccountId, date: p.date, type: p.type,
            description: p.description, signedAmount: p.amount, imported: true
        });
    });
    logEvent('info', 'CSV import committed', {accountId: targetAccountId, rowsImported: valid.length});
    _csvParsedRows = null;
    closeModal();
    commit();
}

function exportAccountCSV(accountId) {
    const acc = db.accounts.find(a => a.id === accountId);
    if (!acc) {
        logEvent('error', 'exportAccountCSV: account not found', {accountId});
        return;
    }
    const txns = getAccountTxns(accountId);
    const header = 'date,type,description,amount\n';
    const rows = txns.map(t => {
        const desc = (t.description || '').replace(/"/g, '""');
        return `${t.date},${t.type},"${desc}",${t.signedAmount || 0}`;
    }).join('\n');
    downloadFile(`${acc.name.replace(/[^a-z0-9]+/gi, '_')}_transactions.csv`, header + rows, 'text/csv');
    logEvent('info', 'Account CSV exported', {accountId, rowCount: txns.length});
}

function downloadFile(filename, content, mime) {
    const blob = new Blob([content], {type: mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/**
 * ─────────────────────────────────────────────────────────────
 *  GLOBAL XLSX EXPORT  (one sheet per account)
 * ─────────────────────────────────────────────────────────────
 */
function exportAllXLS() {
    if (typeof XLSX === 'undefined') {
        logEvent('error', 'XLSX library not loaded');
        alert('Spreadsheet library failed to load.');
        return;
    }
    const banks = getUserBanks();
    if (!banks.length) {
        logEvent('warn', 'exportAllXLS: no banks to export');
        alert('No data to export yet.');
        return;
    }

    const wb = XLSX.utils.book_new();
    const usedNames = new Set();

    banks.forEach(bank => {
        const accs = getBankAccounts(bank.id);
        accs.forEach(acc => {
            const txns = getAccountTxns(acc.id);
            let running = 0;
            const data = txns.map(t => {
                running += (t.signedAmount || 0);
                return {
                    Date: t.date,
                    Type: t.type,
                    Description: t.description || '',
                    Amount: t.signedAmount || 0,
                    'Running Balance': running,
                    Recurring: t.recurring ? 'Yes' : '',
                };
            });
            const ws = XLSX.utils.json_to_sheet(data.length ? data : [{
                Date: '',
                Type: '',
                Description: '',
                Amount: '',
                'Running Balance': '',
                Recurring: ''
            }]);
            ws['!cols'] = [{wch: 12}, {wch: 10}, {wch: 30}, {wch: 12}, {wch: 16}, {wch: 10}];

            let sheetName = `${bank.name}-${acc.name}`.replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31);
            let base = sheetName, n = 1;
            while (usedNames.has(sheetName)) {
                sheetName = `${base.slice(0, 28)}~${n++}`;
            }
            usedNames.add(sheetName);

            XLSX.utils.book_append_sheet(wb, ws, sheetName || `Sheet${usedNames.size}`);
        });
    });

    if (!wb.SheetNames.length) {
        logEvent('warn', 'exportAllXLS: no accounts to export');
        alert('No accounts to export yet.');
        return;
    }
    XLSX.writeFile(wb, `tgippfm_export_${today()}.xlsx`);
    logEvent('info', 'Global XLSX export completed', {sheets: wb.SheetNames.length});
}

/**
 * ─────────────────────────────────────────────────────────────
 *  PREFERENCES ACTIONS
 * ─────────────────────────────────────────────────────────────
 */
function savePrefName() {
    const name = val('m-pref-name');
    if (state.currentUser) {
        state.currentUser.name = name;
        saveDB(db);
    }
    state.prefMessage = 'Name updated.';
    renderModal();
}

function savePrefDisplay() {
    const currency = val('m-pref-currency');
    const dateFormat = val('m-pref-dateformat');
    if (state.currentUser) {
        state.currentUser.defaultCurrency = currency || state.currentUser.defaultCurrency;
        state.currentUser.dateFormat = dateFormat || state.currentUser.dateFormat;
        saveDB(db);
        logEvent('info', 'Display preferences updated', {
            currency: state.currentUser.defaultCurrency,
            dateFormat: state.currentUser.dateFormat
        });
    }
    state.prefMessage = 'Display settings updated.';
    render();
}

function renderLogTable() {
    if (!appLogs.length) return `<div class="dimmed" style="font-size:.85rem">No log entries yet.</div>`;
    const rows = appLogs.slice().reverse().slice(0, 200).map(l => {
        const colorVar = l.level === 'error' ? 'var(--red)' : l.level === 'warn' ? 'var(--yellow)' : 'var(--text2)';
        const time = new Date(l.ts).toLocaleTimeString();
        return `<tr>
      <td style="white-space:nowrap;font-size:.75rem;color:var(--text3)">${time}</td>
      <td style="white-space:nowrap"><span style="color:${colorVar};font-weight:700;font-size:.72rem;text-transform:uppercase">${l.level}</span></td>
      <td style="font-size:.8rem">${esc(l.message)}</td>
      <td style="font-size:.75rem;color:var(--text3);font-family:monospace">${esc((l.data || '').slice(0, 160))}</td>
    </tr>`;
    }).join('');
    return `<div class="table-wrap" style="max-height:320px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm)">
    <table>
      <thead><tr><th>Time</th><th>Level</th><th>Message</th><th>Detail</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function toggleLogView() {
    state.showLogs = !state.showLogs;
    renderModal();
}

function downloadLogs() {
    const lines = appLogs.map(l => `${l.ts}\t${l.level.toUpperCase()}\t${l.message}${l.data ? '\t' + l.data : ''}`).join('\n');
    downloadFile(`tgippfm_log_${today()}.txt`, lines, 'text/plain');
    logEvent('info', 'Log downloaded by user');
}

function clearLogsAction() {
    clearLogs();
    state.prefMessage = 'Log cleared.';
    renderModal();
}


function checkURLReset() {
    const hash = window.location.hash;
    if (hash.startsWith('#reset=')) {
        const token = hash.slice(7);
        const user = db.users.find(u => u.resetToken === token);
        if (user) {
            state.authTab = 'reset';
            state.modal = 'resetConfirm';
            state.modalData = {userId: user.id, token};
        }
        window.location.hash = '';
    }
}

/**
 * ─────────────────────────────────────────────────────────────
 *  BOOT
 * ─────────────────────────────────────────────────────────────
 */
checkURLReset();
render();
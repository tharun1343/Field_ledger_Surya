/*
 * FieldLedger acceptance tests — drives the real app (index.html) in headless Chromium via Playwright.
 *
 *   npm install            # installs playwright (or use a global install)
 *   npm test               # = node tests/acceptance.js
 *
 * Output: tests/results/results.json, tests/results/*.png screenshots, downloaded export files.
 * Exit code is non-zero if any check fails.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'results');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
let currentGroup = '';
function group(name) { currentGroup = name; console.log('\n## ' + name); }
function check(name, ok, detail = '') {
  results.push({ group: currentGroup, name, pass: !!ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const launchOpts = fs.existsSync('/opt/pw-browsers/chromium') ? {} : {};
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  // Dialog control: queue of 'accept' | 'dismiss'; default accept. Messages are recorded.
  const dialogQueue = []; const dialogLog = [];
  page.on('dialog', async d => { dialogLog.push(d.message()); const act = dialogQueue.shift() || 'accept'; if (act === 'accept') await d.accept(); else await d.dismiss(); });

  const st = () => page.evaluate(() => window.FieldLedger.getState());
  const text = sel => page.locator(sel).first().innerText();
  const nav = async view => { await page.locator(`.nav [data-nav="${view}"]`).click(); };
  const product = async p => { await page.locator(`[data-product-tab="${p}"]`).click(); };
  const setMonth = async m => { await page.locator('.month-input').first().fill(m); await page.locator('.month-input').first().dispatchEvent('change'); };
  const download = async (action, scope = page) => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), scope.locator(`[data-action="${action}"]`).first().click()]);
    const file = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(file); return file;
  };

  // ---------------------------------------------------------------- fresh start
  await page.goto(base + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto(base + '/index.html');
  await page.waitForSelector('#viewContainer .kpi');

  group('11. Monthly report reconciles with the source sheet (sample data)');
  {
    const s = await page.evaluate(() => window.FieldLedger.buildStatement('brinjal', '2026-10'));
    const t = s.totals;
    check('Brinjal Oct 2026: 8 rows sorted by date, no duplicates', s.rows.length === 8 && s.rows.every((r, i) => i === 0 || r.date > s.rows[i - 1].date), s.rows.map(r => r.date).join(','));
    check('Brinjal totals 94 bags / 3,008 kg / ₹45,120 / ₹12,000 / ₹14,500 labour / 29 workers', t.bags === 94 && t.kg === 3008 && t.gross === 45120 && t.expenses === 12000 && t.labour === 14500 && t.workers === 29, JSON.stringify({ bags: t.bags, kg: t.kg, gross: t.gross, exp: t.expenses, labour: t.labour, workers: t.workers }));
    check('Brinjal net after costs = 45,120 − 12,000 − 14,500 = ₹18,620', t.net === 18620, t.net);
    const m = await page.evaluate(() => window.FieldLedger.buildStatement('muskmelon', '2026-10'));
    check('Muskmelon Oct 2026: 6 rows, 10,900 kg, ₹1,30,500 gross, ₹18,000 expenses, ₹1,12,500 net', m.rows.length === 6 && m.totals.kg === 10900 && m.totals.gross === 130500 && m.totals.expenses === 18000 && m.totals.net === 112500, JSON.stringify(m.totals));
    await nav('reports'); await setMonth('2026-10');
    const foot = await text('#reportTable tfoot');
    check('Report screen TOTAL row shows ₹45,120 / ₹12,000 / ₹14,500 / ₹18,620', ['94', '3,008', '₹45,120', '₹12,000', '₹14,500', '₹18,620'].every(v => foot.includes(v)), foot.replace(/\s+/g, ' '));
    const dates = await page.locator('#reportTable tbody tr td:first-child').allInnerTexts();
    check('Statement dates oldest → newest', dates.join('|') === ['1 Oct', '2 Oct', '3 Oct', '4 Oct', '5 Oct', '6 Oct', '7 Oct', '8 Oct'].join('|'), dates.join('|'));
    const head = await text('#reportTable thead');
    check('Legacy aggregate labour shown in its own “split unknown” column (not as men)', /split unknown/i.test(head) && s.rows.every(r => r.men === 0 && r.legacyWorkers > 0), head.replace(/\s+/g, ' '));
    await page.screenshot({ path: path.join(OUT, 'desktop-report-brinjal.png'), fullPage: true });
    await setMonth('2026-11');
    check('A month without data shows an empty statement message', (await text('#reportTable tbody')).includes('No entries for November 2026'));
    await setMonth('2026-10');
  }

  group('9/10. Product switching, theming and Muskmelon monthly-first overview');
  {
    await nav('dashboard');
    const bKpi = await page.locator('.kpi .kpi-value').allInnerTexts();
    await page.screenshot({ path: path.join(OUT, 'desktop-overview-brinjal.png'), fullPage: true });
    await product('muskmelon');
    const prodAttr = await page.evaluate(() => document.body.dataset.product);
    const primary = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--primary').trim());
    check('Switching to Muskmelon changes theme to yellow/amber', prodAttr === 'muskmelon' && primary === '#b07a06', primary);
    const html = await page.content();
    check('Muskmelon overview is month-first (month navigator + Monthly performance table)', (await page.locator('.month-hero .month-nav').count()) === 1 && html.includes('Monthly performance') && html.includes('Monthly focus'));
    check('Muskmelon uses the melon SVG icon and no coconut icon', (await page.locator('.melon-svg').count()) > 0 && !html.includes('🥥') && !/coconut/i.test(html));
    const mKpi = await page.locator('.kpi .kpi-value').allInnerTexts();
    check('Muskmelon KPIs show its own totals (10,900 kg, ₹1,30,500, ₹18,000, ₹1,12,500)', mKpi.join('|') === ['10,900 kg', '₹1,30,500', '₹18,000', '₹1,12,500'].join('|'), mKpi.join(' | '));
    check('Brinjal KPIs are different (no mixing)', bKpi.join('|') === ['94', '3,008 kg', '₹45,120', '₹12,000', '₹14,500', '₹18,620'].join('|'), bKpi.join(' | '));
    await page.screenshot({ path: path.join(OUT, 'desktop-overview-muskmelon.png'), fullPage: true });
    await page.locator('[data-month-report="2026-10"]').first().click();
    check('“Statement” button on a month row opens that month’s report (prototype bug fixed)', (await text('#pageTitle')) === 'Monthly statement' && (await page.locator('#reportTable tbody tr').count()) === 6);
    const mHead = await text('#reportTable thead');
    check('Muskmelon statement labels Gross income and Net after expenses (not “Profit”)', /Gross income/i.test(mHead) && /Net after expenses/i.test(mHead) && !/Profit/i.test(mHead));
    await nav('records');
    const recCount = await page.locator('.records-table tbody tr').count();
    check('Muskmelon Records list shows only muskmelon records (6)', recCount === 6, recCount);
    await product('brinjal');
    check('Switching back restores Brinjal violet theme', await page.evaluate(() => document.body.dataset.product === 'brinjal'));
  }

  group('1/2. Bag selector opens exactly N bag sections; weights sum');
  {
    await nav('entry');
    await page.locator('#entryDate').fill('2026-10-15');
    await page.locator('#bagCount').selectOption('5');
    await page.waitForSelector('#bagModalTitle');
    const cards = await page.locator('.bag-entry-card').count();
    check('Selecting 5 bags shows exactly 5 bag sections', cards === 5, cards);
    const titles = await page.locator('.bag-entry-card .entry-card-title').allInnerTexts();
    check('Sections are numbered Bag 1 … Bag 5', titles.map(t => t.replace(/\s+/g, ' ').trim()).join(',') === '1 Bag 1,2 Bag 2,3 Bag 3,4 Bag 4,5 Bag 5', titles.join(','));
    const perBag = await page.evaluate(() => Array.from(document.querySelectorAll('.bag-entry-card')).map(c => [c.querySelectorAll('input[data-key="weightKg"]').length, c.querySelectorAll('select[data-key="brinjalType"]').length, Array.from(c.querySelectorAll('select[data-key="size"] option')).map(o => o.value).join('')]));
    check('Each bag has weight, type dropdown and S/M/L size', perBag.every(([w, t, s]) => w === 1 && t === 1 && s === 'SML'), JSON.stringify(perBag));
    const weights = [30, 32, 33, 34, 31];
    for (let i = 0; i < 5; i++) await page.locator('#bagWeight' + i).fill(String(weights[i]));
    await page.locator('#bagSize1').selectOption('L'); await page.locator('#bagSize3').selectOption('S');
    check('Modal running total shows 160 kg', (await text('#modalBagTotal')) === '160 kg');
    await page.locator('#saveBagModal').click();
    check('Daily form shows total weight 160 kg and 5 bags', (await text('#calcKg')) === '160 kg' && (await text('#calcBags')) === '5 bags');
    const d = await page.evaluate(() => document.querySelector('#bagCount').value);
    check('Bag count selector matches saved bag rows (5)', d === '5');
  }

  group('4. Bag draft persists when the modal is reopened');
  {
    await page.locator('[data-action="open-bags"]').click();
    const vals = await page.locator('.bag-entry-card input[data-key="weightKg"]').evaluateAll(els => els.map(e => e.value));
    check('Reopened modal still has 30, 32, 33, 34, 31', vals.join(',') === '30,32,33,34,31', vals.join(','));
    const sizes = await page.locator('.bag-entry-card select[data-key="size"]').evaluateAll(els => els.map(e => e.value));
    check('Sizes kept (M, L, M, S, M)', sizes.join('') === 'MLMSM', sizes.join(''));
    await page.locator('#bagWeight2').fill('35');
    dialogQueue.push('accept'); // discard modal edits
    await page.locator('.modal-foot [data-modal-close]').click();
    check('Cancel asks before discarding modal edits and keeps the saved draft (160 kg)', dialogLog[dialogLog.length - 1].includes('Discard') && (await text('#calcKg')) === '160 kg');
    await page.locator('[data-action="open-bags"]').click();
    await page.locator('#bagWeight2').fill('35'); await page.locator('#saveBagModal').click();
    check('Editing one bag in the modal updates the draft total (162 kg)', (await text('#calcKg')) === '162 kg');
    await page.locator('[data-action="open-bags"]').click(); await page.locator('#bagWeight2').fill('33'); await page.locator('#saveBagModal').click();
  }

  group('Bag count changes never silently lose data');
  {
    dialogQueue.push('dismiss');
    await page.locator('#bagCount').selectOption('3');
    const msg = dialogLog[dialogLog.length - 1];
    check('Reducing 5 → 3 asks for confirmation naming Bags 4–5 and their weight', /Bags 4–5/.test(msg) && /65 kg/.test(msg), msg.replace(/\n/g, ' '));
    check('Declining keeps 5 bags and the selector at 5', (await page.evaluate(() => document.querySelector('#bagCount').value)) === '5' && (await text('#calcKg')) === '160 kg');
    await page.locator('#bagCount').selectOption('7');
    const vals7 = await page.locator('.bag-entry-card input[data-key="weightKg"]').evaluateAll(els => els.map(e => e.value));
    check('Increasing 5 → 7 keeps bags 1–5 and adds 2 new bags', vals7.length === 7 && vals7.slice(0, 5).join(',') === '30,32,33,34,31', vals7.join(','));
    await page.locator('.modal-foot [data-modal-close]').click(); // unchanged since open except added rows → confirm
    check('Cancelling the modal reverts the selector to the saved count (5)', (await page.evaluate(() => document.querySelector('#bagCount').value)) === '5' && (await text('#calcBags')) === '5 bags');
  }

  group('3. Settings brinjal types flow into the bag dropdown');
  {
    dialogQueue.push('accept'); // leave entry with unsaved changes? -> we test the guard separately; accept here is NOT wanted
    dialogQueue.length = 0;
    dialogQueue.push('dismiss');
    await nav('records');
    check('Leaving Daily entry with unsaved changes asks first; declining stays on the form', /unsaved changes/i.test(dialogLog[dialogLog.length - 1]) && (await text('#pageTitle')) === 'Add daily entry');
  }

  group('6. Men/women labour');
  {
    await page.locator('#menCount').selectOption('5'); await page.locator('#menWage').fill('500');
    await page.locator('#womenCount').selectOption('5'); await page.locator('#womenWage').fill('400');
    check('5 men × ₹500 + 5 women × ₹400 = ₹4,500', (await text('#calcLabour')) === '₹4,500', await text('#calcLabour'));
    check('Men and women subtotals shown separately (₹2,500 / ₹2,000)', (await text('#menSubtotal')).includes('₹2,500') && (await text('#womenSubtotal')).includes('₹2,000'));
    const zeroOpt = await page.locator('#womenCount option[value="0"]').count();
    check('Zero is selectable for men and women', zeroOpt === 1 && (await page.locator('#menCount option[value="0"]').count()) === 1);
  }

  group('5. Expense modal');
  {
    await page.locator('[data-action="open-expenses"]').click();
    const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    check('New expense item date defaults to today', (await page.locator('#expenseDate0').inputValue()) === today, await page.locator('#expenseDate0').inputValue());
    await page.locator('#expenseDate0').fill('2026-10-15');
    await page.locator('#expensePurpose0').fill('Transport'); await page.locator('#expenseAmount0').fill('150');
    await page.locator('[data-exp-add]').click();
    check('“Add another expense” appends a second full item', (await page.locator('.expense-entry-card').count()) === 2 && (await page.locator('#expenseNotes1').count()) === 1);
    await page.locator('#expenseDate1').fill('2026-10-15');
    await page.locator('#expensePurpose1').fill('Packing'); await page.locator('#expenseAmount1').fill('250');
    check('Modal total ₹400', (await text('#modalExpenseTotal')) === '₹400');
    await page.locator('#saveExpenseModal').click();
    check('Daily form shows operating expenses ₹400 (notes left blank)', (await text('#calcExpenses')) === '₹400');
    await page.locator('[data-action="open-expenses"]').click();
    check('Reopen shows both items with their values', (await page.locator('#expensePurpose1').inputValue()) === 'Packing' && (await page.locator('#expenseAmount0').inputValue()) === '150');
    await page.locator('#expenseAmount0').fill('100');
    await page.locator('[data-exp-remove="1"]').click();
    await page.locator('#saveExpenseModal').click();
    check('Edit item to ₹100 and delete the other → total ₹100', (await text('#calcExpenses')) === '₹100');
    await page.locator('[data-action="open-expenses"]').click();
    await page.locator('#expenseAmount0').fill('150');
    await page.locator('[data-exp-add]').click();
    await page.locator('#expenseAmount1').fill('250');
    await page.locator('#saveExpenseModal').click();
    check('Validation: an item without “What for?” is rejected', (await page.locator('#saveExpenseModal').count()) === 1 && (await page.locator('#expensePurpose1').getAttribute('aria-invalid')) === 'true');
    await page.locator('#expensePurpose1').fill('Packing');
    await page.locator('#expenseDate1').fill('2026-10-15');
    await page.locator('[data-exp-add]').click();
    await page.locator('#expenseDate2').fill('2026-11-02'); await page.locator('#expensePurpose2').fill('Seeds for next month'); await page.locator('#expenseAmount2').fill('600'); await page.locator('#expenseNotes2').fill('Paid in advance');
    await page.locator('#saveExpenseModal').click();
    check('Three items saved; draft expense total ₹1,000', (await text('#calcExpenses')) === '₹1,000');
  }

  group('8. Brinjal daily net formula (live summary)');
  {
    await page.locator('#entryRate').fill('15');
    // gross 160×15 = 2400; expenses 1000; labour 4500 → net −3100
    check('Gross 160 kg × ₹15 = ₹2,400', (await text('#calcGross')) === '₹2,400');
    check('Net = 2,400 − 1,000 − 4,500 = −₹3,100 (negative highlighted)', (await text('#calcNet')) === '−₹3,100' && (await page.locator('#calcNet.negative').count()) === 1, await text('#calcNet'));
    await page.locator('#entryRate').fill('-5');
    await page.locator('#entryForm button[type="submit"]').click();
    check('Negative rate is rejected on save', (await page.locator('#entryRate').getAttribute('aria-invalid')) === 'true' && (await text('#pageTitle')) === 'Add daily entry');
    await page.locator('#entryRate').fill('40');
    await page.locator('#entryForm button[type="submit"]').click();
    await page.waitForSelector('.records-table');
    check('Daily entry saved → Records view', (await text('#pageTitle')) === 'Daily records');
    const s = await st(); const rec = s.data.brinjal.find(r => r.date === '2026-10-15');
    check('Saved record has 5 bags, 160 kg, men/women split, 3 expense items with ids', rec && rec.bagDetails.length === 5 && rec.bagDetails.reduce((a, b) => a + b.weightKg, 0) === 160 && rec.menCount === 5 && rec.womenCount === 5 && rec.expenseItems.length === 3 && rec.expenseItems.every(x => x.id) && rec.bagDetails.every(b => b.id), rec && JSON.stringify({ bags: rec.bagDetails.length, men: rec.menCount }));
  }

  group('4b. Persistence after reload + edit');
  {
    await page.reload(); await page.waitForSelector('#viewContainer');
    await nav('records');
    const row = page.locator('tr[data-record-row]').filter({ hasText: '15 Oct' });
    await row.locator('[data-action="edit-record"]').click();
    check('Edit form loads saved record (5 bags, rate 40)', (await text('#calcBags')) === '5 bags' && (await page.locator('#entryRate').inputValue()) === '40');
    await page.locator('[data-action="open-bags"]').click();
    const vals = await page.locator('.bag-entry-card input[data-key="weightKg"]').evaluateAll(els => els.map(e => e.value));
    const sizes = await page.locator('.bag-entry-card select[data-key="size"]').evaluateAll(els => els.map(e => e.value));
    check('After reload, bag weights 30,32,33,34,31 and sizes M,L,M,S,M are intact', vals.join(',') === '30,32,33,34,31' && sizes.join('') === 'MLMSM', vals.join(',') + ' ' + sizes.join(''));
    await page.locator('.modal-foot [data-modal-close]').click();
    await page.locator('[data-action="open-expenses"]').click();
    const exp = await page.evaluate(() => [0, 1, 2].map(i => ['Date', 'Purpose', 'Amount', 'Notes'].map(k => document.querySelector('#expense' + k + i).value)));
    check('After reload, expense items load with date, purpose, amount and notes', JSON.stringify(exp) === JSON.stringify([['2026-10-15', 'Transport', '150', ''], ['2026-10-15', 'Packing', '250', ''], ['2026-11-02', 'Seeds for next month', '600', 'Paid in advance']]), JSON.stringify(exp));
    await page.locator('.modal-foot [data-modal-close]').click();
  }

  group('5b. Expense-date rule in monthly reports');
  {
    const oct = await page.evaluate(() => window.FieldLedger.buildStatement('brinjal', '2026-10'));
    const nov = await page.evaluate(() => window.FieldLedger.buildStatement('brinjal', '2026-11'));
    const row15 = oct.rows.find(r => r.date === '2026-10-15');
    check('October counts only expense items dated in October for 15 Oct (₹400)', row15 && row15.expenses === 400 && oct.totals.expenses === 12400, `${row15 && row15.expenses} / total ${oct.totals.expenses}`);
    check('The 2 Nov item appears in November as an “expenses only” row (₹600), not double-counted', nov.rows.length === 1 && nov.rows[0].kind === 'expense-only' && nov.totals.expenses === 600 && nov.totals.net === -600, JSON.stringify(nov.totals));
    const rowSum = oct.rows.reduce((a, r) => a + r.expenses, 0);
    check('Statement rows add up exactly to the month total', rowSum === oct.totals.expenses);
  }

  group('7. Changing a day’s rate updates gross/net and report totals');
  {
    await page.locator('#entryRate').fill('20');
    check('Live gross updates to ₹3,200', (await text('#calcGross')) === '₹3,200');
    await page.locator('#entryForm button[type="submit"]').click();
    await page.waitForSelector('.records-table');
    const oct = await page.evaluate(() => window.FieldLedger.buildStatement('brinjal', '2026-10'));
    check('Report gross = 45,120 + 3,200 = ₹48,320; net = 48,320 − 12,400 − 19,000 = ₹16,920', oct.totals.gross === 48320 && oct.totals.labour === 19000 && oct.totals.net === 16920, JSON.stringify({ g: oct.totals.gross, l: oct.totals.labour, n: oct.totals.net }));
    await nav('reports'); await setMonth('2026-10');
    const foot = await text('#reportTable tfoot');
    check('Report screen totals match (₹48,320 / ₹12,400 / ₹19,000 / ₹16,920)', ['₹48,320', '₹12,400', '₹19,000', '₹16,920'].every(v => foot.includes(v)), foot.replace(/\s+/g, ' '));
    const rows = await page.locator('#reportTable tbody tr').count();
    check('9 dated rows in October (8 sample + 15 Oct), no duplicates', rows === 9, rows);
  }

  group('3b. Brinjal types: add / remove without rewriting history');
  {
    await nav('tools'); await page.locator('.quick-card[data-nav="settings"]').click();
    const html = await page.locator('#viewContainer').innerHTML();
    check('Settings has no “calculation defaults” panel', !/calculation default/i.test(html) && !/default bag weight/i.test(html));
    await page.locator('#newBrinjalType').fill('Green long'); await page.locator('#typeForm button[type="submit"]').click();
    check('New type listed in Settings', (await page.locator('.type-pill').filter({ hasText: 'Green long' }).count()) === 1);
    await nav('entry');
    await page.locator('#bagCount').selectOption('1');
    const opts = await page.locator('#bagType0 option').allInnerTexts();
    check('“Green long” appears in the bag type dropdown without reload', opts.includes('Green long'), opts.join(','));
    await page.locator('#bagType0').selectOption('Green long');
    await page.locator('#bagWeight0').fill('25');
    await page.locator('#saveBagModal').click();
    await page.locator('#entryDate').fill('2026-10-16'); await page.locator('#entryRate').fill('18');
    await page.locator('#entryForm button[type="submit"]').click(); await page.waitForSelector('.records-table');
    await nav('tools'); await page.locator('.quick-card[data-nav="settings"]').click();
    dialogQueue.push('accept');
    await page.locator('[data-action="remove-type"][data-type="Green long"]').click();
    const msg = dialogLog[dialogLog.length - 1];
    check('Removing a type asks for confirmation and says saved bags keep the label', /Remove “Green long”/.test(msg) && /KEEP the label/.test(msg), msg.replace(/\n/g, ' '));
    const s = await st(); const rec = s.data.brinjal.find(r => r.date === '2026-10-16');
    check('Historical record still says “Green long” after removal', rec.bagDetails[0].brinjalType === 'Green long' && !s.settings.brinjalTypes.includes('Green long'));
    await nav('records');
    await page.locator('tr[data-record-row]').filter({ hasText: '16 Oct' }).locator('[data-action="edit-record"]').click();
    await page.locator('[data-action="open-bags"]').click();
    const sel = await page.locator('#bagType0').inputValue(); const lbl = await page.locator('#bagType0 option:checked').innerText();
    check('Editing that record keeps “Green long” selected (marked removed from list)', sel === 'Green long' && /removed from list/.test(lbl), lbl);
    await page.locator('.modal-foot [data-modal-close]').click();
    await nav('records');
  }

  group('Duplicate date handling and delete');
  {
    await nav('entry');
    await page.locator('#entryDate').fill('2026-10-16');
    await page.locator('#bagCount').selectOption('2'); await page.locator('#saveBagModal').click();
    await page.locator('#entryRate').fill('10');
    dialogQueue.push('dismiss');
    await page.locator('#entryForm button[type="submit"]').click();
    check('Saving a second entry on the same date asks before replacing', /already exists/.test(dialogLog[dialogLog.length - 1]) && (await text('#pageTitle')) === 'Add daily entry');
    dialogQueue.push('accept');
    await page.locator('#entryForm button[type="submit"]').click(); await page.waitForSelector('.records-table');
    let s = await st();
    check('Accepting replaces it: still exactly one 16 Oct record (2 bags, ₹10)', s.data.brinjal.filter(r => r.date === '2026-10-16').length === 1 && s.data.brinjal.find(r => r.date === '2026-10-16').bagDetails.length === 2);
    dialogQueue.push('dismiss');
    await page.locator('tr[data-record-row]').filter({ hasText: '16 Oct' }).locator('[data-action="delete-record"]').click();
    s = await st();
    check('Delete asks for confirmation; declining keeps the record', s.data.brinjal.some(r => r.date === '2026-10-16'));
    dialogQueue.push('accept');
    await page.locator('tr[data-record-row]').filter({ hasText: '16 Oct' }).locator('[data-action="delete-record"]').click();
    s = await st();
    check('Accepting deletes it', !s.data.brinjal.some(r => r.date === '2026-10-16'));
    await page.locator('tr[data-record-row]').filter({ hasText: '15 Oct' }).locator('[data-action="view-record"]').click();
    const view = await text('.modal-panel');
    check('View modal shows bags, labour breakdown and expense items', /Bags \(5\)/.test(view) && /Women: 5 × ₹400 = ₹2,000/.test(view) && /Seeds for next month/.test(view));
    await page.locator('.modal-foot [data-modal-close]').click();
    await page.locator('#recordsSearch').fill('seeds');
    check('Records search filters (1 match for “seeds”)', (await page.locator('.records-table tbody tr').count()) === 1);
    await page.locator('#recordsSearch').fill('');
    await page.locator('#recordsMonth').fill('2026-11'); await page.locator('#recordsMonth').dispatchEvent('change');
    check('Records month filter shows a no-match state for November', (await text('#recordsList')).includes('No records match'));
    await page.locator('#recordsList [data-action="records-clear"]').click();
  }

  group('8b. Muskmelon daily entry formula');
  {
    await product('muskmelon'); await nav('entry');
    const fields = await page.locator('#entryForm').innerHTML();
    check('Muskmelon form has no bag/labour fields', !/bagCount|menCount|womenCount/.test(fields));
    await page.locator('#entryDate').fill('2026-10-25'); await page.locator('#entryKg').fill('1000'); await page.locator('#entryRate').fill('12');
    await page.locator('[data-action="open-expenses"]').click();
    await page.locator('#expenseDate0').fill('2026-10-25'); await page.locator('#expensePurpose0').fill('Loading'); await page.locator('#expenseAmount0').fill('500');
    await page.locator('#saveExpenseModal').click();
    check('Gross 1,000 × ₹12 = ₹12,000; net = 12,000 − 500 = ₹11,500', (await text('#calcGross')) === '₹12,000' && (await text('#calcNet')) === '₹11,500');
    await page.locator('#entryForm button[type="submit"]').click(); await page.waitForSelector('.records-table');
    const m = await page.evaluate(() => window.FieldLedger.buildStatement('muskmelon', '2026-10'));
    check('Muskmelon October now 11,900 kg / ₹1,42,500 / ₹18,500 / ₹1,24,000 net', m.totals.kg === 11900 && m.totals.gross === 142500 && m.totals.expenses === 18500 && m.totals.net === 124000, JSON.stringify(m.totals));
    const b = await page.evaluate(() => window.FieldLedger.buildStatement('brinjal', '2026-10'));
    check('Brinjal October totals unaffected by the Muskmelon entry', b.totals.gross === 48320 && b.totals.expenses === 12400);
  }

  group('14. Exports (selected product + month)');
  {
    await nav('reports'); await setMonth('2026-10');
    const csv = await download('export-csv');
    const csvText = fs.readFileSync(csv, 'utf8');
    check('CSV filename fieldledger-muskmelon-2026-10.csv', path.basename(csv) === 'fieldledger-muskmelon-2026-10.csv');
    const lines = csvText.replace(/^﻿/, '').trim().split(/\r\n/);
    check('CSV has header + 7 rows + TOTAL with correct totals', lines.length === 9 && lines[8] === 'TOTAL,11900,,142500,18500,124000', lines[8]);
    const xlsx = await download('export-xlsx');
    const py = `
import openpyxl,json,sys
wb=openpyxl.load_workbook(sys.argv[1])
ws=wb['Statement']; rows=[[c.value for c in r] for r in ws.iter_rows()]
tot=[r for r in rows if r and r[0]=='TOTAL'][0]
ex=wb['Expense items']; er=[[c.value for c in r] for r in ex.iter_rows()]
print(json.dumps({'sheets':wb.sheetnames,'title':rows[0][0],'header':rows[3],'total':tot,'exp_rows':len([r for r in er if r and isinstance(r[0],str) and r[0][:2]=='20'])}))`;
    const xr = JSON.parse(execFileSync('python3', ['-c', py, xlsx]).toString());
    check('XLSX opens in openpyxl with Statement + Expense items sheets', xr.sheets.join(',') === 'Statement,Expense items', xr.sheets.join(','));
    check('XLSX totals numeric: 11900 kg, 142500 gross, 18500 expenses, 124000 net', JSON.stringify(xr.total) === JSON.stringify(['TOTAL', 11900, null, 142500, 18500, 124000]), JSON.stringify(xr.total));
    check('XLSX title names product and month; 5 expense items listed', /Muskmelon monthly statement — October 2026/.test(xr.title) && xr.exp_rows === 5, xr.title + ' / ' + xr.exp_rows);
    const png = await download('export-png');
    const pr = JSON.parse(execFileSync('python3', ['-c', 'import sys,json;from PIL import Image;im=Image.open(sys.argv[1]);print(json.dumps({"fmt":im.format,"size":im.size}))', png]).toString());
    check('PNG is a real PNG image named fieldledger-muskmelon-2026-10.png', pr.fmt === 'PNG' && path.basename(png) === 'fieldledger-muskmelon-2026-10.png' && pr.size[0] >= 2000, JSON.stringify(pr));
    await product('brinjal'); await nav('reports'); await setMonth('2026-10');
    const bpng = await download('export-png');
    fs.copyFileSync(bpng, path.join(OUT, 'export-brinjal-statement.png'));
    const bcsv = fs.readFileSync(await download('export-csv'), 'utf8').replace(/^﻿/, '').trim().split(/\r\n/);
    check('Brinjal CSV header includes men, women, legacy workers, labour salary and net', /Men,Women,"?Workers, split unknown \(legacy\)"?,Labour salary/.test(bcsv[0]), bcsv[0]);
    check('Brinjal CSV TOTAL row: 99 bags, 3168 kg, 48320, 12400, 5 men, 5 women, 29 legacy, 19000, 16920', bcsv[bcsv.length - 1] === 'TOTAL,99,3168,,48320,12400,5,5,29,19000,16920', bcsv[bcsv.length - 1]);
    // PDF: stub print, verify print mode is set, then render the print layout to a real PDF and read it.
    await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++; window.__printClass = document.body.classList.contains('printing-report'); window.__printTitle = document.title; }; });
    await page.locator('[data-action="export-pdf"]').first().click();
    await page.waitForFunction(() => window.__printCalls > 0);
    const pinfo = await page.evaluate(() => ({ calls: window.__printCalls, cls: window.__printClass, title: window.__printTitle }));
    check('PDF button opens the print dialog in report print mode, titled fieldledger-brinjal-2026-10', pinfo.calls === 1 && pinfo.cls && pinfo.title === 'fieldledger-brinjal-2026-10', JSON.stringify(pinfo));
    await page.evaluate(() => document.body.classList.add('printing-report'));
    const pdfPath = path.join(OUT, 'fieldledger-brinjal-2026-10.pdf');
    await page.pdf({ path: pdfPath, landscape: true, printBackground: true });
    await page.evaluate(() => document.body.classList.remove('printing-report'));
    const pdfText = execFileSync('pdftotext', ['-layout', pdfPath, '-']).toString();
    check('Printed PDF contains the statement title and totals, not the app chrome', /Brinjal — October 2026/.test(pdfText) && /16,920/.test(pdfText) && !/Quick actions/.test(pdfText) && !/Overview\s+Daily entry/.test(pdfText), pdfText.split('\n').slice(0, 3).join(' / ').slice(0, 120));
    await nav('tools');
    const json = await download('export-json');
    const backup = JSON.parse(fs.readFileSync(json, 'utf8'));
    check('JSON backup has both products, expense details, settings and profile', backup.app === 'FieldLedger' && backup.schemaVersion === 2 && backup.data.brinjal.length === 9 && backup.data.muskmelon.length === 7 && backup.settings.brinjalTypes && backup.profile.farmName && backup.data.brinjal.some(r => r.expenseItems.some(x => x.notes === 'Paid in advance')), `${backup.data.brinjal.length} brinjal / ${backup.data.muskmelon.length} muskmelon`);
    fs.copyFileSync(json, path.join(OUT, 'backup.json'));
  }

  group('14b. JSON import: malformed, invalid, cancel, success');
  {
    const before = JSON.stringify(await st());
    await page.setInputFiles('#importFile', { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{ "app": "FieldLedger", data: [oops') });
    await page.waitForFunction(() => /not valid JSON/.test(document.querySelector('#importStatus').textContent));
    check('Malformed JSON is rejected with a message; data unchanged', JSON.stringify(await st()) === before);
    await page.setInputFiles('#importFile', { name: 'other.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ hello: 'world' })) });
    await page.waitForFunction(() => /not a valid FieldLedger backup/.test(document.querySelector('#importStatus').textContent));
    check('Wrong-shape JSON is rejected; data unchanged', JSON.stringify(await st()) === before);
    const bad = JSON.parse(fs.readFileSync(path.join(OUT, 'backup.json'), 'utf8')); bad.data.brinjal[0].date = '15/10/2026';
    await page.setInputFiles('#importFile', { name: 'baddate.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
    await page.waitForFunction(() => /record 1: date/.test(document.querySelector('#importStatus').textContent));
    check('Backup with an invalid record date is rejected with the record named', JSON.stringify(await st()) === before);
    dialogQueue.push('dismiss');
    await page.setInputFiles('#importFile', path.join(OUT, 'backup.json'));
    await page.waitForFunction(() => /cancelled/.test(document.querySelector('#importStatus').textContent));
    check('Import asks for confirmation; cancelling changes nothing', /REPLACES everything/.test(dialogLog[dialogLog.length - 1]) && JSON.stringify(await st()) === before);
    // Reset to sample, then restore the backup to prove round-trip.
    dialogQueue.push('accept');
    await page.locator('[data-action="reset-demo"]').click();
    check('Restore sample data asks first and resets to 8 + 6 records', (await st()).data.brinjal.length === 8 && (await st()).data.muskmelon.length === 6);
    dialogQueue.push('accept');
    await page.setInputFiles('#importFile', path.join(OUT, 'backup.json'));
    await page.waitForFunction(() => /restored/.test(document.querySelector('#importStatus').textContent));
    const after = await st();
    check('Accepting restores the backup exactly (round-trip)', JSON.stringify(after.data) === JSON.stringify(JSON.parse(before).data));
  }

  group('12. Theme, text size and reduced motion');
  {
    await nav('tools'); await page.locator('.quick-card[data-nav="settings"]').click();
    await page.locator('[data-action="set-theme"][data-value="dark"]').click();
    await page.locator('[data-action="set-text"][data-value="large"]').click();
    const fsLarge = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.kpi-note, .muted.small, .field-hint') || document.body).fontSize));
    await page.reload(); await page.waitForSelector('#viewContainer');
    const after = await page.evaluate(() => ({ theme: document.body.dataset.theme, large: document.body.classList.contains('text-large'), bg: getComputedStyle(document.body).backgroundColor }));
    check('Dark theme and Large text survive reload', after.theme === 'dark' && after.large && after.bg === 'rgb(17, 16, 24)', JSON.stringify(after));
    await page.screenshot({ path: path.join(OUT, 'desktop-settings-dark-large.png'), fullPage: true });
    await page.locator('[data-action="set-text"][data-value="small"]').click();
    const fsSmall = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.kpi-note, .muted.small, .field-hint') || document.body).fontSize));
    check('Text size actually changes small print (Large > Small)', fsLarge > fsSmall, `${fsLarge}px vs ${fsSmall}px`);
    await page.locator('[data-action="set-text"][data-value="medium"]').click();
    await page.locator('[data-action="set-theme"][data-value="light"]').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await nav('dashboard');
    const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.view > *')).animationDuration);
    check('prefers-reduced-motion: view animations collapse to ~0s', parseFloat(dur) < 0.001, dur);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }

  group('Migration from the original prototype storage');
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p2 = await ctx2.newPage(); const errs2 = [];
    p2.on('pageerror', e => errs2.push(e.message)); p2.on('dialog', d => d.accept());
    await p2.goto(base + '/original/farm_business_ledger_prototype.html');
    await p2.waitForSelector('.kpi');
    const v1 = await p2.evaluate(() => JSON.parse(localStorage.getItem('fieldledger-prototype-v1')));
    await p2.goto(base + '/index.html'); await p2.waitForSelector('.kpi');
    const migrated = await p2.evaluate(() => ({ s: window.FieldLedger.buildStatement('brinjal', '2026-10').totals, m: window.FieldLedger.buildStatement('muskmelon', '2026-10').totals, st: window.FieldLedger.getState(), legacyKept: !!localStorage.getItem('fieldledger-prototype-v1'), banner: document.querySelector('#bannerArea').textContent }));
    check('Prototype (v1) data is upgraded automatically with identical totals', migrated.s.bags === 94 && migrated.s.kg === 3008 && migrated.s.gross === 45120 && migrated.s.labour === 14500 && migrated.m.net === 112500, JSON.stringify({ bags: migrated.s.bags, labour: migrated.s.labour }));
    check('Migration keeps the men/women values exactly as stored (no silent re-labelling) and keeps the v1 copy', migrated.st.data.brinjal[0].menCount === v1.data.brinjal[0].men && migrated.legacyKept && /upgraded/.test(migrated.banner));
    check('No page errors in the migration run', errs2.length === 0, errs2.join('; '));
    await ctx2.close();
  }

  group('13. Mobile 360px, tablet and desktop layouts');
  {
    const mctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const m = await mctx.newPage(); const merr = [];
    m.on('pageerror', e => merr.push(e.message)); m.on('dialog', d => d.accept());
    await m.goto(base + '/index.html'); await m.evaluate(() => localStorage.clear()); await m.goto(base + '/index.html'); await m.waitForSelector('.kpi');
    const overflow = () => m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const views = ['dashboard', 'entry', 'records', 'reports', 'tools', 'settings', 'profile'];
    const bad = [];
    for (const p of ['brinjal', 'muskmelon']) {
      await m.locator(`[data-product-tab="${p}"]`).click();
      for (const v of views) {
        await m.evaluate(v => { location.hash = `#/${document.body.dataset.product}/${v}`; }, v);
        await m.waitForTimeout(120);
        const o = await overflow(); if (o > 0) bad.push(`${p}/${v}:+${o}px`);
        if (['dashboard', 'entry', 'records', 'reports'].includes(v)) await m.screenshot({ path: path.join(OUT, `mobile360-${p}-${v}.png`), fullPage: true });
      }
    }
    check('No page-level horizontal overflow at 360px on any screen (both products)', bad.length === 0, bad.join(', ') || 'all 14 screens fit');
    await m.evaluate(() => { location.hash = '#/brinjal/dashboard'; }); await m.waitForTimeout(100);
    const navBox = await m.locator('.nav').boundingBox();
    const navPos = await m.evaluate(() => getComputedStyle(document.querySelector('.nav')).position);
    check('Bottom navigation is fixed and fully on-screen', navPos === 'fixed' && navBox.y + navBox.height <= 740 && navBox.y > 600, JSON.stringify(navBox));
    const navTargets = await m.locator('.nav-btn').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
    check('Bottom nav touch targets ≥ 48px tall', navTargets.every(h => h >= 48), navTargets.join(','));
    await m.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await m.waitForTimeout(100);
    const navBox2 = await m.locator('.nav').boundingBox();
    check('Bottom nav still reachable after scrolling to the bottom', navBox2.y + navBox2.height <= 740);
    await m.locator('.nav [data-nav="entry"]').click();
    await m.locator('#bagCount').selectOption('12');
    await m.waitForSelector('#bagModalTitle'); await m.waitForTimeout(900); // let the smooth scroll-to-top finish
    const modal = await m.evaluate(() => { const b = document.querySelector('.modal-body'); const f = document.querySelector('#saveBagModal').getBoundingClientRect(); return { scrollable: b.scrollHeight > b.clientHeight, saveBottom: f.bottom, saveTop: f.top, vw: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    check('12-bag modal scrolls internally and its Save button stays visible', modal.scrollable && modal.saveBottom <= 740 && modal.saveTop > 0 && modal.vw <= 0, JSON.stringify(modal));
    await m.screenshot({ path: path.join(OUT, 'mobile360-bag-modal.png') });
    await m.locator('.modal-body').evaluate(b => b.scrollTo(0, b.scrollHeight));
    await m.locator('#bagWeight11').fill('29'); await m.locator('#saveBagModal').click();
    check('Bag modal usable on phone (12 bags saved)', (await m.locator('#calcBags').innerText()) === '12 bags');
    await m.locator('[data-action="open-expenses"]').click();
    const em = await m.evaluate(() => { const f = document.querySelector('#saveExpenseModal').getBoundingClientRect(); return f.bottom <= innerHeight && f.top > 0; });
    check('Expense modal Save button visible on phone', em);
    await m.screenshot({ path: path.join(OUT, 'mobile360-expense-modal.png') });
    await m.keyboard.press('Escape');
    check('Escape closes the modal', (await m.locator('.modal-layer').count()) === 0);
    check('No page errors on mobile', merr.length === 0, merr.join('; '));
    for (const [w, h, name] of [[768, 1024, 'tablet'], [1440, 900, 'desktop']]) {
      await m.setViewportSize({ width: w, height: h });
      const badW = [];
      for (const v of views) { await m.evaluate(v => { location.hash = `#/brinjal/${v}`; }, v); await m.waitForTimeout(80); const o = await overflow(); if (o > 0) badW.push(`${v}:+${o}`); }
      check(`No horizontal overflow at ${w}px (${name})`, badW.length === 0, badW.join(', ') || 'all screens fit');
    }
    await m.setViewportSize({ width: 768, height: 1024 }); await m.evaluate(() => { location.hash = '#/muskmelon/dashboard'; }); await m.waitForTimeout(100);
    await m.screenshot({ path: path.join(OUT, 'tablet768-muskmelon-overview.png'), fullPage: true });
    await mctx.close();
  }

  group('Android back button / browser history');
  {
    await page.goto(base + '/index.html#/brinjal/dashboard'); await page.waitForSelector('.kpi');
    await nav('records'); await nav('reports');
    await page.goBack(); await page.waitForTimeout(100);
    check('Back returns to the previous screen (Records)', (await text('#pageTitle')) === 'Daily records');
  }

  group('15. Console errors and dead controls');
  {
    const dead = [];
    for (const p of ['brinjal', 'muskmelon']) for (const v of ['dashboard', 'entry', 'records', 'reports', 'tools', 'settings', 'profile']) {
      await page.goto(`${base}/index.html#/${p}/${v}`); await page.waitForSelector('#viewContainer > *');
      const d = await page.evaluate(() => Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null && !b.matches('[data-nav],[data-action],[data-product-tab],[data-month-report],[type="submit"],#quickThemeBtn,#quickTextBtn')).map(b => b.outerHTML.slice(0, 80)));
      if (d.length) dead.push(`${p}/${v}: ${d.join(' ')}`);
    }
    check('Every visible button has a wired action', dead.length === 0, dead.join(' | '));
    check('No uncaught errors / console errors during the whole run', consoleErrors.length === 0, consoleErrors.join(' | '));
  }

  await browser.close(); server.close();
  const passed = results.filter(r => r.pass).length;
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ ranAt: new Date().toISOString(), passed, total: results.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });

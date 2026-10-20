/*
 * FieldLedger acceptance tests — drives the real app (index.html) in headless Chromium via Playwright.
 *
 *   npm install            # installs playwright (or use a global install)
 *   npm test               # = node tests/acceptance.js
 *
 * Cloud sign-in and sync run against tests/mock-supabase.js (an in-memory stand-in for Supabase Auth +
 * PostgREST). Output: tests/results/results.json, screenshots and exported files.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { createMockSupabase } = require('./mock-supabase');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'results');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/\.(png|csv|xlsx|json|pdf)$/.test(f) && f !== 'results.json') fs.unlinkSync(path.join(OUT, f));

const results = [];
let currentGroup = '';
function group(name) { currentGroup = name; console.log('\n## ' + name); }
function check(name, ok, detail = '') {
  results.push({ group: currentGroup, name, pass: !!ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

// Answers the app's in-app confirm dialog from a queue ('accept' | 'dismiss'); default accept.
const ASK_HOOK = `window.addEventListener('fl-ask', e => {
  const answer = window.__testAsk ? window.__testAsk(e.detail.message) : Promise.resolve('accept');
  Promise.resolve(answer).then(a => setTimeout(() => { const b = document.querySelector(a === 'accept' ? '#askOk' : '#askCancel'); if (b) b.click(); }, 0));
});`;

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

/** Page helpers bound to one Playwright page. */
async function helpers(page, ctxName) {
  const dialogQueue = []; const dialogLog = []; const errors = []; let nativeDialogs = 0;
  page.on('dialog', async d => { nativeDialogs++; dialogLog.push(d.message()); await d.accept(); });
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`[${ctxName}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${ctxName}] pageerror: ${e.message}`));
  await page.exposeFunction('__testAsk', msg => { dialogLog.push(msg); return dialogQueue.shift() || 'accept'; });
  await page.addInitScript(ASK_HOOK);
  const h = {
    dialogQueue, dialogLog, errors, nativeDialogs: () => nativeDialogs,
    st: () => page.evaluate(() => window.FieldLedger.getState()),
    text: sel => page.locator(sel).first().innerText(),
    settle: async () => { await page.waitForFunction(() => !document.querySelector('.ask-layer')); await page.waitForTimeout(80); },
    view: () => page.evaluate(() => document.body.dataset.view),
    nav: async v => { await page.locator(`.nav [data-nav="${v}"]`).click(); await page.waitForFunction(v => document.body.dataset.view === v, v); },
    product: async p => { if (await page.evaluate(() => document.body.dataset.product) !== p) await page.locator('#productToggle').click(); await page.waitForFunction(p => document.body.dataset.product === p, p); },
    setMonth: async m => { const el = page.locator('.month-input').first(); await el.fill(m); await el.dispatchEvent('change'); },
    download: async (action, filenameOut) => {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.locator(`[data-action="${action}"]:visible`).first().click()]);
      const file = path.join(OUT, filenameOut || dl.suggestedFilename()); await dl.saveAs(file); return file;
    },
    rates: async (s, m, l) => { await page.locator('#rateS').fill(String(s)); await page.locator('#rateM').fill(String(m ?? s)); await page.locator('#rateL').fill(String(l ?? s)); },
    setBags: async n => { await page.locator('#bagCount').fill(String(n)); await page.locator('#bagCount').dispatchEvent('change'); }
  };
  return h;
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const mock = createMockSupabase(); const cloudUrl = await mock.start();
  const browser = await chromium.launch();
  const allErrors = []; let allNativeDialogs = 0;

  // Main desktop context. Reduced motion keeps screen changes synchronous for most checks;
  // transitions are verified separately below.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const H = await helpers(page, 'main');
  const { st, text, settle, nav, product, setMonth, download, setBags, rates } = H;

  await page.goto(base + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto(base + '/index.html');

  group('Sign-in screen and local mode');
  {
    await page.waitForSelector('.login-card');
    check('First launch shows the email sign-in for the built-in Supabase project', (await page.locator('#loginForm #loginEmail').count()) === 1 && /ylztkijajqkuzmgmdody\.supabase\.co/.test(await text('.login-card')) && (await page.locator('.nav').isHidden()));
    await page.locator('[data-action="local-only"]').click();
    await page.waitForSelector('#viewContainer .kpi');
    check('“Use without an account” opens the app on this device', (await H.view()) === 'dashboard');
    const dot = await page.locator('#statusDot').getAttribute('class');
    check('Status dot is orange when online but not signed in', /orange/.test(dot), dot);
    await page.reload(); await page.waitForSelector('#viewContainer .kpi');
    check('Local-only choice is remembered after reload', (await page.locator('.login-card').count()) === 0);
  }

  group('Compact shell: product switch beside theme, no page title block');
  {
    const ids = await page.evaluate(() => Array.from(document.querySelector('.top-actions').children).map(e => e.className || e.id));
    check('Top bar order: product toggle → theme → account', /product-toggle/.test(ids[0]) && /icon-btn/.test(ids[1]) && /account-chip/.test(ids[2]), ids.join(' | '));
    check('Text-size button removed from the top bar', (await page.locator('#quickTextBtn').count()) === 0);
    check('Large page title / emblem block removed', (await page.locator('.context-row, #pageTitle, .emblem').count()) === 0);
    check('Small brinjal SVG icon used instead of the eggplant emoji', !(await page.content()).includes('🍆') && (await page.locator('#brandMark svg').count()) === 1);
    const tog = await page.evaluate(() => { const b = document.querySelector('#productToggle'); return { role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), text: b.innerText.trim() }; });
    check('Business switch is a text-free toggle (role=switch)', tog.role === 'switch' && tog.checked === 'false' && tog.text === '', JSON.stringify(tog));
    check('Top-left shows the Brinjal icon and name', (await text('#brandTitle')) === 'Brinjal' && (await page.locator('#brandMark.single svg').count()) === 1);
    await page.locator('#productToggle').click(); await page.waitForFunction(() => document.body.dataset.product === 'muskmelon');
    check('Toggling switches to Muskmelon: knob moves, top-left shows Muskmelon', (await page.locator('#productToggle').getAttribute('aria-checked')) === 'true' && (await text('#brandTitle')) === 'Muskmelon' && (await page.locator('#ptKnob .melon-svg').count()) === 1);
    await page.goto(base + '/index.html'); await page.waitForSelector('#viewContainer .kpi');
    check('A fresh launch always opens on Brinjal', await page.evaluate(() => document.body.dataset.product === 'brinjal'));
    check('Quick-actions duplicate card removed from the overview', !(await page.content()).includes('Quick actions'));
  }

  group('Sample data reconciles with the source sheet');
  {
    const s = await page.evaluate(() => window.FieldLedger.buildStatement('brinjal', '2026-10'));
    const t = s.totals;
    check('Brinjal Oct 2026: 8 rows, 94 bags, 3,008 kg, ₹45,120, ₹12,000, ₹14,500 labour, 29 workers, net ₹18,620', s.rows.length === 8 && t.bags === 94 && t.kg === 3008 && t.gross === 45120 && t.expenses === 12000 && t.labour === 14500 && t.workers === 29 && t.net === 18620, JSON.stringify({ bags: t.bags, kg: t.kg, net: t.net }));
    check('Brinjal type is one value per day (sample: Local)', s.rows.every(r => r.type === 'Local'));
    const m = await page.evaluate(() => window.FieldLedger.buildStatement('muskmelon', '2026-10'));
    check('Muskmelon Oct 2026: 10,900 kg, ₹1,30,500 gross, ₹18,000 expenses, ₹0 labour, net ₹1,12,500', m.rows.length === 6 && m.totals.kg === 10900 && m.totals.gross === 130500 && m.totals.expenses === 18000 && m.totals.labour === 0 && m.totals.net === 112500, JSON.stringify(m.totals));
    await nav('reports'); await setMonth('2026-10');
    const foot = await text('#reportTable tfoot');
    check('Report TOTAL row shows ₹45,120 / ₹12,000 / ₹14,500 / ₹18,620', ['94', '3,008', '₹45,120', '₹12,000', '₹14,500', '₹18,620'].every(v => foot.includes(v)), foot.replace(/\s+/g, ' '));
  }

  group('Settings: text size, default labour wages, brinjal types');
  {
    await nav('tools'); await page.locator('.quick-card[data-nav="settings"]').click(); await page.waitForFunction(() => document.body.dataset.view === 'settings');
    check('Text size options live in Settings', (await page.locator('[data-action="set-text"]').count()) === 3);
    await page.locator('#wage-brinjal-men').fill('600'); await page.locator('#wage-brinjal-women').fill('450');
    await page.locator('#wage-muskmelon-men').fill('550'); await page.locator('#wage-muskmelon-women').fill('420');
    await page.locator('#wagesForm button[type="submit"]').click();
    const w = (await st()).settings.wages;
    check('Default wages saved per business', w.brinjal.men === 600 && w.brinjal.women === 450 && w.muskmelon.men === 550 && w.muskmelon.women === 420, JSON.stringify(w));
  }

  group('Brinjal daily entry: date pill, typed bag count, one type for all bags');
  {
    await nav('entry');
    const pill = await text('#datePillText');
    check('Entry shows today’s date with a tap-to-change pill', /^Today · /.test(pill), pill);
    await page.locator('#entryDate').fill('2026-10-15'); await page.locator('#entryDate').dispatchEvent('input');
    check('Changing the date updates the pill', /15 Oct 2026/.test(await text('#datePillText')) && !/Today/.test(await text('#datePillText')), await text('#datePillText'));
    check('Number of bags is a whole-number input, not a dropdown', (await page.locator('input#bagCount[type="number"]').count()) === 1);
    check('Labour wages prefilled from Settings (₹600 / ₹450)', (await page.locator('#menWage').inputValue()) === '600' && (await page.locator('#womenWage').inputValue()) === '450');
    await setBags('2.5'); await page.waitForTimeout(100);
    check('A fractional bag count is rejected', (await page.locator('#bagCount').getAttribute('aria-invalid')) === 'true' && (await page.locator('.modal-layer').count()) === 0);
    await setBags(5); await page.waitForSelector('#bagModalTitle');
    check('Typing 5 opens exactly 5 bag sections', (await page.locator('.bag-entry-card').count()) === 5);
    check('Bag sections ask only weight and size (type is on the main form)', (await page.locator('.bag-entry-card select[data-key="brinjalType"]').count()) === 0 && (await page.locator('.bag-entry-card [data-key="weightKg"]').count()) === 5 && (await page.locator('.bag-entry-card [data-key="size"]').count()) === 5);
    const weights = [30, 32, 33, 34, 31];
    for (let i = 0; i < 5; i++) await page.locator('#bagWeight' + i).fill(String(weights[i]));
    await page.locator('#bagSize1').selectOption('L');
    check('Sheet header total shows 160 kg', (await text('#modalBagTotal')) === '160 kg');
    await page.locator('#saveBagModal').click();
    check('Form shows 160 kg and 5 bags', (await text('#calcKg')) === '160 kg' && (await text('#calcBags')) === '5 bags');
    H.dialogQueue.push('dismiss'); await setBags(3); await settle();
    check('Reducing 5 → 3 asks first; declining keeps 5 bags', /Bags 4–5/.test(H.dialogLog[H.dialogLog.length - 1]) && (await page.locator('#bagCount').inputValue()) === '5');
    await page.locator('[data-action="open-bags"]').click();
    const vals = await page.locator('.bag-entry-card input[data-key="weightKg"]').evaluateAll(els => els.map(e => e.value));
    check('Reopening keeps the weights', vals.join(',') === '30,32,33,34,31', vals.join(','));
    await page.locator('.modal-foot [data-modal-close]').click(); await settle();
    // Custom type
    await page.locator('#entryType').selectOption('__custom__');
    check('“New type…” reveals a text field', await page.locator('#entryTypeCustom').isVisible());
    await page.locator('#entryTypeCustom').fill('Green round');
    // Labour override for this entry only
    await page.locator('#menCount').fill('5'); await page.locator('#menCount').dispatchEvent('input');
    await page.locator('[data-step="womenCount"][data-delta="1"]').click();
    for (let i = 0; i < 4; i++) await page.locator('[data-step="womenCount"][data-delta="1"]').click();
    await page.locator('#menWage').fill('700'); await page.locator('#menWage').dispatchEvent('input');
    check('Changed wage is marked “this entry only”', /This entry only/.test(await text('#menWageHint')));
    check('Labour = 5 × ₹700 + 5 × ₹450 = ₹5,750', (await text('#calcLabour')) === '₹5,750', await text('#calcLabour'));
    await rates(20); await page.locator('#entryWastage').fill('4.5');
    await page.locator('[data-action="open-expenses"]').click();
    await page.locator('#expenseDate0').fill('2026-10-15'); await page.locator('#expensePurpose0').fill('Transport'); await page.locator('#expenseAmount0').fill('150');
    await page.locator('[data-exp-add]').click();
    await page.locator('#expenseDate1').fill('2026-10-15'); await page.locator('#expensePurpose1').fill('Packing'); await page.locator('#expenseAmount1').fill('250');
    await page.locator('#saveExpenseModal').click();
    check('Expenses ₹150 + ₹250 = ₹400', (await text('#calcExpenses')) === '₹400');
    check('Gross 160 × ₹20 = ₹3,200; net = 3,200 − 400 − 5,750 = −₹2,950; wastage not priced', (await text('#calcGross')) === '₹3,200' && (await text('#calcNet')) === '−₹2,950' && (await text('#calcWastage')) === '4.50 kg', await text('#calcNet'));
    await page.locator('#entryForm button[type="submit"]').click();
    await page.waitForFunction(() => document.body.dataset.view === 'records');
    const s = await st(); const rec = s.data.brinjal.find(r => r.date === '2026-10-15');
    check('Saved: type “Green round”, 5 bags, 160 kg, wage ₹700 for this entry, wastage 4.5', rec && rec.brinjalType === 'Green round' && rec.bagDetails.length === 5 && rec.menWage === 700 && rec.womenWage === 450 && rec.wastageKg === 4.5 && rec.bagDetails.every(b => !('brinjalType' in b)), rec && JSON.stringify({ t: rec.brinjalType, mw: rec.menWage }));
    check('New type added to Settings, most recent first', s.settings.brinjalTypes[0] === 'Green round', s.settings.brinjalTypes.join(','));
    check('Settings default wage unchanged by the per-entry edit (₹600)', s.settings.wages.brinjal.men === 600);
    await nav('entry');
    check('Next entry offers “Green round” first and the default wage again', (await page.locator('#entryType').inputValue()) === 'Green round' && (await page.locator('#menWage').inputValue()) === '600');
    await nav('records');
  }

  group('Brinjal types: remove keeps history');
  {
    await nav('tools'); await page.locator('.quick-card[data-nav="settings"]').click(); await page.waitForFunction(() => document.body.dataset.view === 'settings');
    await page.locator('[data-action="remove-type"][data-type="Green round"]').click(); await settle();
    check('Removing asks and mentions entries keep the label', /KEEP the label/.test(H.dialogLog[H.dialogLog.length - 1]));
    const s = await st();
    check('Past entry still says “Green round”', s.data.brinjal.find(r => r.date === '2026-10-15').brinjalType === 'Green round' && !s.settings.brinjalTypes.includes('Green round'));
    await nav('records');
    await page.locator('tr[data-record-row]').filter({ hasText: '15 Oct' }).locator('[data-action="edit-record"]').click();
    await page.waitForFunction(() => document.body.dataset.view === 'entry');
    check('Editing keeps it selected (shown as not in list)', (await page.locator('#entryType').inputValue()) === 'Green round' && /not in list/.test(await page.locator('#entryType option:checked').innerText()));
    check('Editing loads the entry’s own wage (₹700)', (await page.locator('#menWage').inputValue()) === '700');
    await nav('records');
  }

  group('Brinjal: Small / Medium / Large prices and size cards');
  {
    await nav('entry');
    await page.locator('#entryDate').fill('2026-10-16'); await page.locator('#entryDate').dispatchEvent('input');
    check('Daily entry starts with today’s price for each size', (await page.locator('.price-panel #rateS, .price-panel #rateM, .price-panel #rateL').count()) === 3);
    await rates(20, 15, 10);
    await setBags(3); await page.waitForSelector('#saveBagModal');
    for (const [i, w, z] of [[0, 10, 'S'], [1, 20, 'M'], [2, 30, 'L']]) { await page.locator('#bagWeight' + i).fill(String(w)); await page.locator('#bagSize' + i).selectOption(z); }
    await page.locator('#saveBagModal').click();
    check('Gross = 10 kg × ₹20 + 20 kg × ₹15 + 30 kg × ₹10 = ₹800', (await text('#calcGross')) === '₹800', await text('#calcGross'));
    const cards = await page.locator('#sizeCards .size-card').allInnerTexts();
    check('Three coloured size cards: bags, weight, rate and amount', cards.length === 3 && /₹200/.test(cards[0]) && /₹300/.test(cards[1]) && /₹300/.test(cards[2]) && /₹800/.test(await text('#sizeCards .size-total')), cards.join(' | ').replace(/\n/g, ' '));
    await page.locator('#rateL').fill('');
    await page.locator('#entryForm button[type="submit"]').click();
    check('A size with bags needs its price before saving', (await page.locator('#rateL').getAttribute('aria-invalid')) === 'true' && (await H.view()) === 'entry');
    await page.locator('#rateL').fill('10');
    await page.locator('#entryForm button[type="submit"]').click();
    await page.waitForFunction(() => document.body.dataset.view === 'records');
    const rec = (await st()).data.brinjal.find(r => r.date === '2026-10-16');
    check('Saved with the three prices; average rate kept for older apps', rec && rec.sizeRates.S === 20 && rec.sizeRates.M === 15 && rec.sizeRates.L === 10 && Math.abs(rec.ratePerKg - 800 / 60) < 1e-9, rec && JSON.stringify(rec.sizeRates));
    await page.locator('tr[data-record-row]').filter({ hasText: '16 Oct' }).locator('[data-action="view-record"]').click();
    check('Record view shows the size cards', (await page.locator('.modal-panel .size-card').count()) === 3);
    await page.keyboard.press('Escape'); await settle();
    await nav('reports'); await setMonth('2026-10');
    check('Monthly report has a “Sales by size” section', (await page.locator('#printArea .size-grid .size-card').count()) === 3 && /Rate S \/ M \/ L/i.test(await text('#reportTable thead')));
    await nav('dashboard');
    check('Home has bar charts: daily sales by size, size bars, money in vs out, bills to pay', (await page.locator('.vstack').count()) > 0 && (await page.locator('.hbar-row').count()) === 3 && (await page.locator('.vgroup').count()) > 0 && /Bills to pay/.test(await text('#viewContainer')));
  }

  group('Ledger: bills, part payments and bill photos');
  {
    await nav('ledger');
    check('Ledger totals: ₹2,500 still to pay (7 Oct unpaid, 8 Oct ₹500 of ₹1,500 paid)', /₹2,500/.test(await text('.ls-tile.due')), await text('.ls-tile.due'));
    check('Filter chips with counts; “Not settled” shows 2 bills', (await page.locator('.bill-list .bill-card').count()) === 2 && /Not settled\s*2/.test(await text('.chips')));
    await page.locator('.bill-card').filter({ hasText: '7 Oct' }).click();
    await page.locator('[data-bill-action="pay"]').click();
    check('Record payment suggests the full balance', (await page.locator('#payAmount').inputValue()) === '1500');
    await page.locator('#payAmount').fill('600'); await page.locator('#payNote').fill('Cash');
    await page.locator('#payForm button[type="submit"]').click();
    await page.waitForSelector('.pay-row');
    const b1 = (await st()).data.brinjal.find(r => r.date === '2026-10-07').expenseItems[0];
    check('Part payment saved: paid ₹600, balance ₹900, status part paid', b1.paid === 600 && b1.payments.length === 1 && /Part paid/.test(await text('.modal-panel .st-pill')) && /₹900/.test(await text('.modal-panel .ls-tile.due')));
    await page.locator('[data-bill-action="settle"]').click(); await settle(); await page.waitForTimeout(100);
    const b2 = (await st()).data.brinjal.find(r => r.date === '2026-10-07').expenseItems[0];
    check('“Mark fully paid” settles the bill and records the last ₹900', b2.paid === 1500 && b2.payments.length === 2 && /Settled/.test(await text('.modal-panel .st-pill')));
    const png = path.join(OUT, 'bill-fixture.png'); fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64'));
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-bill-photo-add]').click()]);
    await fc.setFiles(png);
    await page.waitForFunction(() => { const i = document.querySelector('.modal-panel .thumb img'); return i && /^data:image\/jpeg/.test(i.src); }, null, { timeout: 8000 });
    const b3 = (await st()).data.brinjal.find(r => r.date === '2026-10-07').expenseItems[0];
    check('Bill photo attached (shrunk to JPEG and shown as a thumbnail)', b3.bills.length === 1);
    await page.locator('.modal-panel [data-bill-view]').first().click({ position: { x: 10, y: 50 } });
    check('Tapping the photo opens it full screen', (await page.locator('.viewer-layer img').count()) === 1);
    await page.locator('.viewer-layer').click(); await page.keyboard.press('Escape'); await settle();
    await nav('ledger');
    check('Ledger now shows ₹1,000 still to pay', /₹1,000/.test(await text('.ls-tile.due')), await text('.ls-tile.due'));
    // Expense entered as part paid in the daily entry
    await nav('entry');
    await page.locator('#entryDate').fill('2026-10-17'); await page.locator('#entryDate').dispatchEvent('input');
    await rates(15); await setBags(1); await page.waitForSelector('#saveBagModal'); await page.locator('#saveBagModal').click();
    await page.locator('[data-action="open-expenses"]').click();
    await page.locator('#expensePurpose0').fill('Fertiliser'); await page.locator('#expenseAmount0').fill('300'); await page.locator('#expenseParty0').fill('Agro store');
    await page.locator('[data-pay-mode="part"][data-i="0"]').click(); await page.locator('#expensePaid0').fill('100');
    await page.locator('#saveExpenseModal').click();
    await page.locator('#entryForm button[type="submit"]').click(); await page.waitForFunction(() => document.body.dataset.view === 'records');
    const fx = (await st()).data.brinjal.find(r => r.date === '2026-10-17').expenseItems[0];
    check('Expense saved as part paid: ₹100 of ₹300, paid to Agro store', fx.paid === 100 && fx.party === 'Agro store' && fx.payments.length === 1);
    await nav('ledger');
    check('It appears in the ledger with a ₹200 balance', /Balance ₹200/.test(await page.locator('.bill-card').filter({ hasText: 'Fertiliser' }).innerText()));
    // Backup round trip keeps payments and photos
    await nav('tools'); const backupFile = await download('export-json', 'backup-with-photo.json');
    const bj = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    check('Backup includes payments and the bill photo', Object.keys(bj.files || {}).length === 1 && bj.data.brinjal.find(r => r.date === '2026-10-07').expenseItems[0].payments.length === 2);
    const rctx = await browser.newContext({ viewport: { width: 400, height: 860 }, reducedMotion: 'reduce' });
    const rp = await rctx.newPage(); const RH = await helpers(rp, 'restore');
    await rp.addInitScript(() => { if (!localStorage.getItem('fieldledger-cloud')) localStorage.setItem('fieldledger-cloud', JSON.stringify({ localOnly: true })); });
    await rp.goto(base + '/index.html#/brinjal/tools'); await rp.waitForSelector('[data-action="import-json"]');
    await rp.setInputFiles('#importFile', backupFile); await RH.settle();
    await rp.waitForFunction(() => window.FieldLedger.getState().data.brinjal.some(r => r.date === '2026-10-17'));
    await rp.evaluate(() => { location.hash = '#/brinjal/ledger'; }); await rp.waitForSelector('.bill-card');
    await rp.locator('[data-ledger-filter="all"]').click();
    await rp.locator('.bill-card').filter({ hasText: '7 Oct' }).click();
    await rp.waitForFunction(() => { const i = document.querySelector('.modal-panel .thumb img'); return i && /^data:image/.test(i.src); }, null, { timeout: 8000 });
    check('Restoring the backup on another browser brings back records, payments and the photo', true);
    check('No errors while restoring', RH.errors.length === 0, RH.errors.join(' | '));
    await rctx.close();
  }

  group('Account sheet → Settings');
  {
    for (const from of ['dashboard', 'settings']) {
      if (from === 'settings') { await nav('tools'); await page.locator('.quick-card[data-nav="settings"]').click(); await page.waitForFunction(() => document.body.dataset.view === 'settings'); } else await nav(from);
      await page.locator('#accountChip').click(); await page.waitForSelector('.modal-panel');
      await page.locator('#modalRoot [data-nav="settings"]').click(); await page.waitForTimeout(150);
      check(`From ${from === 'settings' ? 'Settings itself' : 'Home'}: the sheet closes and Settings is shown`, (await H.view()) === 'settings' && (await page.locator('#modalRoot .modal-layer').count()) === 0);
    }
    check('Settings has the App updates card', (await page.locator('h2', { hasText: /App (updates|version)/ }).count()) === 1);
    // Remove the two extra test days so the statement checks below keep the source-sheet totals.
    await nav('records');
    for (const d of ['16 Oct', '17 Oct']) { await page.locator('tr[data-record-row]').filter({ hasText: d }).locator('[data-action="delete-record"]').click(); await settle(); }
    check('Extra test days removed', !(await st()).data.brinjal.some(r => r.date === '2026-10-16' || r.date === '2026-10-17'));
  }

  group('Muskmelon: labour, wastage, monthly-first overview');
  {
    await product('muskmelon');
    check('Product theme switches to amber', await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--primary').trim() === '#b07a06'));
    await nav('dashboard');
    check('Overview is month-first with a labour card', (await page.locator('.month-hero .month-nav').count()) === 1 && (await page.locator('.kpi-top > span').filter({ hasText: /^Labour$/ }).count()) === 1);
    await nav('entry');
    check('Muskmelon entry has labour section with Settings defaults (₹550 / ₹420)', (await page.locator('#menWage').inputValue()) === '550' && (await page.locator('#womenWage').inputValue()) === '420');
    await page.locator('#entryDate').fill('2026-10-25'); await page.locator('#entryDate').dispatchEvent('input');
    await page.locator('#entryKg').fill('1000'); await page.locator('#entryRate').fill('12'); await page.locator('#entryWastage').fill('50');
    await page.locator('#menCount').fill('2'); await page.locator('#menCount').dispatchEvent('input');
    await page.locator('#womenCount').fill('1'); await page.locator('#womenCount').dispatchEvent('input');
    check('Labour = 2 × ₹550 + 1 × ₹420 = ₹1,520', (await text('#calcLabour')) === '₹1,520');
    check('Net = 12,000 − 0 − 1,520 = ₹10,480', (await text('#calcNet')) === '₹10,480', await text('#calcNet'));
    await page.locator('#entryForm button[type="submit"]').click(); await page.waitForFunction(() => document.body.dataset.view === 'records');
    const m = await page.evaluate(() => window.FieldLedger.buildStatement('muskmelon', '2026-10'));
    check('Month: 11,900 kg, 50 kg wastage, ₹1,42,500 gross, ₹1,520 labour, net ₹1,22,980', m.totals.kg === 11900 && m.totals.wastage === 50 && m.totals.gross === 142500 && m.totals.labour === 1520 && m.totals.net === 122980, JSON.stringify(m.totals));
    const b = await page.evaluate(() => window.FieldLedger.buildStatement('brinjal', '2026-10'));
    check('Brinjal totals unaffected (₹48,320 gross)', b.totals.gross === 48320, b.totals.gross);
  }

  group('Exports');
  {
    await nav('reports'); await setMonth('2026-10');
    const csv = fs.readFileSync(await download('export-csv'), 'utf8').replace(/^﻿/, '').trim().split(/\r\n/);
    check('Muskmelon CSV has labour columns and correct TOTAL', /Men,Women,Labour salary/.test(csv[0]) && csv[csv.length - 1] === 'TOTAL,11900,50,,142500,18000,2,1,1520,122980', csv[csv.length - 1]);
    const xlsx = await download('export-xlsx');
    const xr = JSON.parse(execFileSync('python3', ['-c', `
import openpyxl,json,sys
wb=openpyxl.load_workbook(sys.argv[1]); ws=wb['Statement']
rows=[[c.value for c in r] for r in ws.iter_rows()]
print(json.dumps({'sheets':wb.sheetnames,'total':[r for r in rows if r and r[0]=='TOTAL'][0]}))`, xlsx]).toString());
    check('XLSX opens with Statement + Expense items and numeric totals', xr.sheets.join() === 'Statement,Expense items' && xr.total[4] === 142500 && xr.total[9] === 122980, JSON.stringify(xr.total));
    const png = await download('export-png');
    const pr = JSON.parse(execFileSync('python3', ['-c', 'import sys,json;from PIL import Image;im=Image.open(sys.argv[1]);print(json.dumps({"fmt":im.format,"w":im.size[0]}))', png]).toString());
    check('PNG statement is a real image', pr.fmt === 'PNG' && pr.w >= 2000, JSON.stringify(pr));
    await product('brinjal'); await nav('reports'); await setMonth('2026-10');
    const bcsv = fs.readFileSync(await download('export-csv'), 'utf8').replace(/^﻿/, '').trim().split(/\r\n/);
    check('Brinjal CSV has Type, size and TOTAL 99 bags / 3168 kg / ₹48,320', /^Date,Type,Bags,Small \(kg\),Medium \(kg\),Large \(kg\)/.test(bcsv[0]) && /^TOTAL,,99,0,3136,32,3168,4.5,,,48320,12400,5,5,29,20250,15670$/.test(bcsv[bcsv.length - 1]), bcsv[bcsv.length - 1]);
    fs.copyFileSync(await download('export-png'), path.join(OUT, 'export-brinjal-statement.png'));
    await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++; window.__printClass = document.body.classList.contains('printing-report'); }; });
    await page.locator('[data-action="export-pdf"]:visible').first().click();
    await page.waitForFunction(() => window.__printCalls > 0);
    check('PDF opens the print dialog in statement print mode', await page.evaluate(() => window.__printClass === true));
    await page.evaluate(() => document.body.classList.add('printing-report'));
    const pdfPath = path.join(OUT, 'fieldledger-brinjal-2026-10.pdf');
    await page.pdf({ path: pdfPath, landscape: true, printBackground: true });
    await page.evaluate(() => document.body.classList.remove('printing-report'));
    const pdfText = execFileSync('pdftotext', ['-layout', pdfPath, '-']).toString();
    check('Printed PDF contains the statement and totals only', /Brinjal — October 2026/.test(pdfText) && /15,670/.test(pdfText) && !/Daily entry\s+Records/.test(pdfText));
    await nav('tools');
    const json = await download('export-json');
    const backup = JSON.parse(fs.readFileSync(json, 'utf8'));
    check('JSON backup has both products, wages and types', backup.data.brinjal.length === 9 && backup.data.muskmelon.length === 7 && backup.settings.wages.brinjal.men === 600 && backup.data.brinjal.some(r => r.brinjalType === 'Green round'));
    fs.copyFileSync(json, path.join(OUT, 'backup.json'));
  }

  group('Backup import');
  {
    const before = JSON.stringify(await st());
    await page.setInputFiles('#importFile', { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{ nope') });
    await page.waitForFunction(() => /not a FieldLedger backup/.test(document.querySelector('#importStatus').textContent));
    check('Malformed JSON rejected; nothing changed', JSON.stringify(await st()) === before);
    H.dialogQueue.push('dismiss');
    await page.setInputFiles('#importFile', path.join(OUT, 'backup.json'));
    await page.waitForFunction(() => /cancelled/.test(document.querySelector('#importStatus').textContent));
    check('Import asks first; cancelling changes nothing', JSON.stringify(await st()) === before);
    await page.locator('[data-action="reset-demo"]').click(); await settle();
    check('Restore sample data resets to 8 + 6 records', (await st()).data.brinjal.length === 8);
    await page.setInputFiles('#importFile', path.join(OUT, 'backup.json'));
    await page.waitForFunction(() => /restored/.test(document.querySelector('#importStatus').textContent));
    const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));
    check('Backup round-trips exactly', canon((await st()).data) === canon(JSON.parse(before).data));
  }

  group('Theme and text size persistence');
  {
    await page.locator('#quickThemeBtn').click();
    await nav('tools'); await page.locator('.quick-card[data-nav="settings"]').click(); await page.waitForFunction(() => document.body.dataset.view === 'settings');
    await page.locator('[data-action="set-text"][data-value="large"]').click();
    await page.reload(); await page.waitForSelector('#viewContainer > *');
    const a = await page.evaluate(() => ({ theme: document.body.dataset.theme, large: document.body.classList.contains('text-large') }));
    check('Dark theme (top-bar toggle) and Large text (Settings) survive reload', a.theme === 'dark' && a.large, JSON.stringify(a));
    await page.screenshot({ path: path.join(OUT, 'desktop-settings-dark.png'), fullPage: true });
    await page.locator('[data-action="set-text"][data-value="medium"]').click();
    await page.locator('#quickThemeBtn').click();
  }

  group('Smooth transitions');
  {
    const tctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const tp = await tctx.newPage();
    await tp.addInitScript(() => { localStorage.setItem('fieldledger-cloud', JSON.stringify({ localOnly: true })); });
    await tp.goto(base + '/index.html'); await tp.waitForSelector('.kpi');
    await tp.evaluate(() => {
      window.__vt = 0; window.__enter = [];
      const orig = document.startViewTransition && document.startViewTransition.bind(document);
      document.startViewTransition = cb => { window.__vt++; return orig ? orig(cb) : (cb(), { finished: Promise.resolve() }); };
      new MutationObserver(() => { const c = document.querySelector('#viewContainer').className; if (/enter/.test(c)) window.__enter.push(c); }).observe(document.querySelector('#viewContainer'), { attributes: true, attributeFilter: ['class'] });
    });
    await tp.locator('.nav [data-nav="records"]').click(); await tp.waitForTimeout(400);
    await tp.locator('.nav [data-nav="dashboard"]').click(); await tp.waitForTimeout(400);
    await tp.locator('#productToggle').click(); await tp.waitForTimeout(400);
    const enters = await tp.evaluate(() => window.__enter);
    check('Tabs and business switch animate only the content (GPU slide/fade, no full-page snapshot)', enters.some(c => /enter-side/.test(c)) && enters.some(c => /(^| )enter( |$)/.test(c)) && (await tp.evaluate(() => window.__vt)) === 0, enters.join(','));
    await tp.locator('#quickThemeBtn').click(); await tp.waitForTimeout(500);
    check('Theme change is one cross-fade and does not rebuild the screen', (await tp.evaluate(() => window.__vt)) === 1 && (await tp.evaluate(() => document.body.dataset.theme)) === 'dark');
    const perf = await tp.evaluate(() => { const cs = getComputedStyle(document.body); const card = getComputedStyle(document.querySelector('.card')); return { attach: cs.backgroundAttachment, cardTrans: card.transitionProperty }; });
    check('No fixed-background repaint and no colour transitions on every card', perf.attach !== 'fixed' && !/background-color/.test(perf.cardTrans), JSON.stringify(perf));
    await tp.locator('#quickThemeBtn').click(); await tp.waitForTimeout(400);
    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const tt = await touch.newPage(); await tt.addInitScript(() => localStorage.setItem('fieldledger-cloud', JSON.stringify({ localOnly: true })));
    await tt.goto(base + '/index.html'); await tt.waitForSelector('.kpi');
    check('Phones: no live blur (backdrop-filter) on buttons and bars', await tt.evaluate(() => ['.nav', '.btn', '.icon-btn'].every(sel => { const el = document.querySelector(sel); const v = getComputedStyle(el).backdropFilter; return !v || v === 'none'; })));
    await touch.close();
    await tctx.close();
  }

  group('Cloud sign-in and sync (mock Supabase)');
  {
    const mkDevice = async name => {
      const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, reducedMotion: 'reduce' });
      const p = await ctx.newPage(); const h = await helpers(p, name);
      await p.goto(base + '/index.html'); await p.waitForSelector('#loginForm');
      // Point this phone at the mock server through the app's own “Change server” link.
      await p.locator('[data-action="change-server"]').click(); await p.waitForSelector('#cloudSetupForm');
      return { ctx, p, h };
    };
    const A = await mkDevice('phoneA');
    await A.p.locator('#cloudUrl').fill('not a url'); await A.p.locator('#cloudKey').fill('x'); await A.p.locator('#cloudSetupForm button[type="submit"]').click();
    check('Bad project URL is rejected with a message', /Project URL/.test(await A.p.locator('#loginStatus').innerText()));
    await A.p.locator('#cloudUrl').fill(cloudUrl); await A.p.locator('#cloudKey').fill('anon-key-for-tests-0123456789'); await A.p.locator('#cloudSetupForm button[type="submit"]').click();
    await A.p.waitForSelector('#loginForm');
    check('Sign-in asks only for an email (no password field)', (await A.p.locator('input[type="password"]').count()) === 0);
    await A.p.route('**/auth/v1/otp', async r => { await new Promise(res => setTimeout(res, 700)); await r.continue(); });
    await A.p.locator('#loginEmail').fill('farmer@example.com'); await A.p.locator('#loginForm [type="submit"]').click();
    const sending = await A.p.locator('#loginForm [type="submit"]').evaluate(b => ({ loading: b.classList.contains('loading'), disabled: b.disabled, text: b.innerText, spinner: !!b.querySelector('.spinner') }));
    check('“Send code” shows a spinner and “Sending code…” while sending', sending.loading && sending.disabled && sending.spinner && /Sending code/.test(sending.text), JSON.stringify(sending));
    await A.p.waitForSelector('#otpCode'); await A.p.unroute('**/auth/v1/otp');
    await A.p.waitForSelector('#otpCode');
    check('“Send code” emails a 6-digit code and shows the code field', /^\d{6}$/.test(mock.codes.get('farmer@example.com') || '') && (await A.p.locator('#otpCode').getAttribute('autocomplete')) === 'one-time-code');
    check('Resend is locked for 60 seconds', await A.p.locator('#otpResend').isDisabled() && /Resend in/.test(await A.p.locator('#otpResend').innerText()));
    await A.p.route('**/auth/v1/verify', async r => { await new Promise(res => setTimeout(res, 700)); await r.continue(); });
    await A.p.locator('#otpCode').fill('000000');   // 6 digits auto-submit
    await A.p.waitForFunction(() => document.querySelector('#otpForm [type="submit"]').classList.contains('loading'));
    const verifying = await A.p.evaluate(() => ({ text: document.querySelector('#otpForm [type="submit"]').innerText, status: document.querySelector('#loginStatus').textContent, inputLocked: document.querySelector('#otpCode').disabled }));
    check('While checking, the button shows “Verifying code…” with a spinner and the code field is locked', /Verifying code/.test(verifying.text) && /Verifying your code/.test(verifying.status) && verifying.inputLocked, JSON.stringify(verifying));
    await A.p.waitForFunction(() => /wrong or has expired/.test(document.querySelector('#loginStatus').textContent));
    await A.p.unroute('**/auth/v1/verify');
    check('A wrong code shows a clear message', true);
    await A.p.waitForFunction(() => !document.querySelector('#otpCode').disabled);
    await A.p.locator('#otpCode').fill(mock.codes.get('farmer@example.com'));   // 6 digits auto-submit
    await A.p.waitForSelector('#viewContainer .kpi');
    await A.p.waitForFunction(() => document.querySelector('#statusDot').classList.contains('green'), null, { timeout: 8000 });
    check('Correct code creates the account, signs in, and the dot turns green', mock.users.size === 1);
    let sA = await A.h.st();
    check('Sample records are removed once an account is used', sA.data.brinjal.length === 0 && sA.data.muskmelon.length === 0);
    // Add an entry on phone A
    await A.p.locator('.nav [data-nav="entry"]').click();
    await A.p.locator('#bagCount').fill('2'); await A.p.locator('#bagCount').dispatchEvent('change'); await A.p.waitForSelector('#saveBagModal');
    await A.p.locator('#bagWeight0').fill('30'); await A.p.locator('#bagWeight1').fill('31'); await A.p.locator('#saveBagModal').click();
    await A.h.rates(18); await A.p.locator('#entryForm button[type="submit"]').click();
    await A.p.waitForFunction(() => document.body.dataset.view === 'records');
    await A.p.waitForFunction(() => document.querySelector('#statusDot').classList.contains('green'), null, { timeout: 8000 });
    const userId = [...mock.users.values()][0].id;
    const rowsA = [...mock.entries.values()].filter(r => r.user_id === userId && !r.deleted);
    check('Entry uploaded to the account (row with user_id, product, data)', rowsA.length === 1 && rowsA[0].product === 'brinjal' && rowsA[0].data.bagDetails.length === 2, rowsA.length);
    // Phone B signs in and gets it
    const B = await mkDevice('phoneB');
    await B.p.locator('#cloudUrl').fill(cloudUrl); await B.p.locator('#cloudKey').fill('anon-key-for-tests-0123456789'); await B.p.locator('#cloudSetupForm button[type="submit"]').click();
    await B.p.locator('#loginEmail').fill('Farmer@Example.com'); await B.p.locator('#loginForm [type="submit"]').click();
    await B.p.waitForSelector('#otpCode'); await B.p.locator('#otpCode').fill(mock.codes.get('farmer@example.com'));
    await B.p.waitForSelector('#viewContainer .kpi');
    await B.p.waitForFunction(() => window.FieldLedger.getState().data.brinjal.length === 1, null, { timeout: 8000 });
    check('Second phone signs in and receives the entry', true);
    // Edit on B, sync on A
    const id = (await B.h.st()).data.brinjal[0].id;
    await B.p.evaluate(() => { location.hash = '#/brinjal/records'; }); await B.p.waitForSelector('.record-card [data-action="edit-record"]');
    await B.p.locator('.record-card [data-action="edit-record"]').first().click(); await B.p.waitForSelector('#rateM');
    await B.h.rates(25); await B.p.locator('#entryForm button[type="submit"]').click();
    await B.p.waitForFunction(() => document.querySelector('#statusDot').classList.contains('green'), null, { timeout: 8000 });
    await A.p.locator('#accountChip').click(); await A.p.locator('[data-action="sync-now"]').click();
    await A.p.waitForFunction(id => (window.FieldLedger.getState().data.brinjal.find(r => r.id === id) || {}).ratePerKg === 25, id, { timeout: 8000 });
    check('Edit on phone B reaches phone A after “Sync now”', true);
    await A.p.keyboard.press('Escape');
    // Offline on A: red dot, change queued, then synced when back online
    await A.ctx.setOffline(true); await A.p.evaluate(() => window.dispatchEvent(new Event('offline')));
    await A.p.waitForFunction(() => document.querySelector('#statusDot').classList.contains('red'));
    check('Offline shows a red dot', true);
    await A.p.locator('.nav [data-nav="entry"]').click();
    await A.p.locator('#entryDate').fill('2026-10-21'); await A.p.locator('#entryDate').dispatchEvent('input');
    await A.p.locator('#bagCount').fill('1'); await A.p.locator('#bagCount').dispatchEvent('change'); await A.p.waitForSelector('#saveBagModal'); await A.p.locator('#saveBagModal').click();
    await A.h.rates(19); await A.p.locator('#entryForm button[type="submit"]').click();
    await A.p.waitForFunction(() => document.body.dataset.view === 'records');
    check('Saving offline works and is queued', /waiting/.test(await A.p.locator('#accountChip').getAttribute('title')), await A.p.locator('#accountChip').getAttribute('title'));
    await A.ctx.setOffline(false); await A.p.evaluate(() => window.dispatchEvent(new Event('online')));
    await A.p.waitForFunction(() => document.querySelector('#statusDot').classList.contains('green'), null, { timeout: 8000 });
    check('Back online: queued entry uploads and the dot turns green', [...mock.entries.values()].filter(r => r.user_id === userId && !r.deleted).length === 2);
    // Delete on A propagates to B
    await A.p.locator('.record-card').filter({ hasText: '21 Oct' }).locator('[data-action="delete-record"]').click(); await A.h.settle();
    await A.p.waitForFunction(() => document.querySelector('#statusDot').classList.contains('green'), null, { timeout: 8000 });
    await B.p.locator('#accountChip').click(); await B.p.locator('[data-action="sync-now"]').click();
    await B.p.waitForFunction(() => window.FieldLedger.getState().data.brinjal.length === 1, null, { timeout: 8000 });
    check('Delete on phone A removes the entry on phone B', true);
    await B.p.keyboard.press('Escape');
    // Settings sync
    const wagesB = (await B.h.st()).settings.wages;
    check('Settings (wages, types) come with the account', wagesB && wagesB.brinjal && typeof wagesB.brinjal.men === 'number');
    // Sign out
    await A.p.locator('#accountChip').click(); await A.p.locator('[data-action="sign-out"]').click(); await A.h.settle();
    await A.p.waitForSelector('#loginForm');
    check('Sign out returns to the sign-in screen and clears this phone’s copy', (await A.h.st()).data.brinjal.length === 0);
    // Fallback: someone taps the magic link in the email instead of typing the code
    const link = mock.session(mock.users.get('farmer@example.com'));
    await B.p.goto('about:blank'); await B.p.goto(`${base}/index.html#access_token=${link.access_token}&refresh_token=${link.refresh_token}&expires_in=3600&type=magiclink`);
    await B.p.waitForFunction(() => window.FieldLedger.getState().data.brinjal.length === 1 && !location.hash.includes('access_token'), null, { timeout: 8000 });
    check('Tapping the email link instead of typing the code also signs in (token removed from address bar)', true);
    check('No errors on either phone', A.h.errors.length === 0 && B.h.errors.length === 0, [...A.h.errors, ...B.h.errors].join(' | '));
    await A.p.screenshot({ path: path.join(OUT, 'mobile-login.png') });
    await A.ctx.close(); await B.ctx.close();
  }

  group('Migration from earlier versions');
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const p2 = await ctx2.newPage(); const errs2 = [];
    p2.on('pageerror', e => errs2.push(e.message)); p2.on('dialog', d => d.accept());
    await p2.goto(base + '/original/farm_business_ledger_prototype.html'); await p2.waitForSelector('.kpi');
    await p2.evaluate(() => localStorage.setItem('fieldledger-cloud', JSON.stringify({ localOnly: true })));
    await p2.goto(base + '/index.html'); await p2.waitForSelector('.kpi');
    const mig = await p2.evaluate(() => ({ b: window.FieldLedger.buildStatement('brinjal', '2026-10').totals, st: window.FieldLedger.getState() }));
    check('Original prototype data upgrades with identical totals', mig.b.bags === 94 && mig.b.gross === 45120 && mig.b.labour === 14500);
    check('Per-bag types become one type per day', mig.st.data.brinjal.every(r => r.brinjalType && r.bagDetails.every(bg => !('brinjalType' in bg))));
    const v21 = await p2.evaluate(() => window.FieldLedger.normalizeState({ data: { brinjal: [{ id: 'x', date: '2026-10-01', ratePerKg: 10, bagDetails: [{ weightKg: 5, brinjalType: 'Long', size: 'S' }, { weightKg: 5, brinjalType: 'Long', size: 'M' }, { weightKg: 5, brinjalType: 'Round', size: 'M' }] }], muskmelon: [{ id: 'y', date: '2026-10-01', kg: 10, ratePerKg: 5 }] } }, true));
    check('v2.1 backups import: most common bag type kept; muskmelon gets zero labour', v21.state.data.brinjal[0].brinjalType === 'Long' && v21.state.data.muskmelon[0].menCount === 0 && v21.state.settings.wages.brinjal.men === 500);
    check('No page errors during migration', errs2.length === 0, errs2.join('; '));
    await ctx2.close();
  }

  group('Phone layout (360px), tablet and desktop');
  {
    const mctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await mctx.addInitScript(ASK_HOOK);
    await mctx.addInitScript(() => { if (!localStorage.getItem('fieldledger-cloud')) localStorage.setItem('fieldledger-cloud', JSON.stringify({ localOnly: true })); });
    const m = await mctx.newPage(); const merr = [];
    m.on('pageerror', e => merr.push(e.message));
    await m.goto(base + '/index.html'); await m.waitForSelector('.kpi');
    const overflow = () => m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const bad = [];
    for (const p of ['brinjal', 'muskmelon']) for (const v of ['dashboard', 'entry', 'records', 'ledger', 'reports', 'tools', 'settings', 'profile']) {
      await m.evaluate(([p, v]) => { location.hash = `#/${p}/${v}`; }, [p, v]); await m.waitForTimeout(120);
      const o = await overflow(); if (o > 0) bad.push(`${p}/${v}:+${o}px`);
      if (['dashboard', 'entry', 'reports'].includes(v)) await m.screenshot({ path: path.join(OUT, `mobile360-${p}-${v}.png`), fullPage: true });
    }
    check('No horizontal overflow at 360px on any screen', bad.length === 0, bad.join(', ') || '16 screens fit');
    const top = await m.evaluate(() => { const r = el => document.querySelector(el).getBoundingClientRect(); return { brand: r('.brand').right, toggle: r('#productToggle').left, acct: r('#accountChip').right, vw: innerWidth }; });
    check('Top bar fits at 360px (brand, toggle, theme, account on one row)', top.brand <= top.toggle && top.acct <= top.vw, JSON.stringify(top));
    await m.evaluate(() => { location.hash = '#/brinjal/dashboard'; }); await m.waitForTimeout(100);
    check('Recent entries show as a tappable list on phones (no sideways table)', (await m.locator('.recent-list .recent-row').count()) === 5 && (await m.locator('.records-table').first().isHidden()));
    await m.evaluate(() => { location.hash = '#/brinjal/entry'; }); await m.waitForTimeout(100);
    const rw = await m.evaluate(() => { const r = k => document.querySelector('#rate' + k).getBoundingClientRect(); return Math.abs(r('S').top - r('L').top) < 2 && r('S').right < r('M').left && r('M').right < r('L').left && r('L').right <= innerWidth; });
    check('Small / Medium / Large prices sit side by side on phones', rw);
    await m.evaluate(() => { location.hash = '#/brinjal/dashboard'; }); await m.waitForTimeout(100);
    const navBox = await m.locator('.nav').boundingBox();
    check('Bottom navigation fixed and on-screen', navBox.y + navBox.height <= 740 && navBox.y > 600, JSON.stringify(navBox));
    await m.locator('.nav [data-nav="entry"]').click();
    await m.locator('#bagCount').fill('12'); await m.locator('#bagCount').dispatchEvent('change'); await m.waitForSelector('#bagModalTitle'); await m.waitForTimeout(300);
    const modal = await m.evaluate(() => { const b = document.querySelector('.modal-body'); const f = document.querySelector('#saveBagModal').getBoundingClientRect(); return { scrollable: b.scrollHeight > b.clientHeight, bottom: f.bottom }; });
    check('12-bag sheet scrolls and Save stays visible', modal.scrollable && modal.bottom <= 740, JSON.stringify(modal));
    await m.screenshot({ path: path.join(OUT, 'mobile360-bag-modal.png') });
    await m.locator('#saveBagModal').click();
    check('12 bags saved on phone', (await m.locator('#calcBags').innerText()) === '12 bags');
    check('No page errors on phone', merr.length === 0, merr.join('; '));
    for (const [w, hgt, name] of [[768, 1024, 'tablet'], [1440, 900, 'desktop']]) {
      await m.setViewportSize({ width: w, height: hgt });
      const badW = [];
      for (const v of ['dashboard', 'entry', 'records', 'reports', 'tools', 'settings']) { await m.evaluate(v => { location.hash = `#/brinjal/${v}`; }, v); await m.waitForTimeout(80); const o = await overflow(); if (o > 0) badW.push(`${v}:+${o}`); }
      check(`No horizontal overflow at ${w}px (${name})`, badW.length === 0, badW.join(', ') || 'all fit');
    }
    await mctx.close();
  }

  group('Android app bridge (simulated native shell)');
  {
    const actx = await browser.newContext({ viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await actx.addInitScript(ASK_HOOK);
    await actx.addInitScript(() => {
      localStorage.setItem('fieldledger-cloud', JSON.stringify({ localOnly: true }));
      window.__native = { saved: [], prints: [], checks: [] };
      window.FieldLedgerAndroid = {
        getAppInfo: () => JSON.stringify({ versionName: '2.2.0', versionCode: 220, updateUrl: 'https://example.invalid/version.json', lastCheck: '' }),
        saveFile: (name, mime, b64) => { window.__native.saved.push({ name, mime, text: mime.startsWith('text') ? atob(b64) : '' }); return 'Saved to Downloads/FieldLedger/' + name + '.'; },
        print: name => window.__native.prints.push(name), setThemeColor: () => {}, checkForUpdates: m => window.__native.checks.push(m),
        startUpdate: () => window.__native.checks.push('start'), cancelUpdate: () => window.__native.checks.push('cancel'), openInstallPermission: () => {},
        pickFile: kind => window.__native.checks.push('pick:' + kind), putFile: () => 'ok', getFile: () => '', deleteFile: () => {}
      };
    });
    const a = await actx.newPage(); const aerr = []; a.on('pageerror', e => aerr.push(e.message));
    await a.goto(base + '/index.html#/brinjal/reports'); await a.waitForSelector('#reportTable');
    await a.locator('.month-input').first().fill('2026-10'); await a.locator('.month-input').first().dispatchEvent('change');
    await a.locator('[data-action="export-csv"]:visible').first().click();
    await a.waitForFunction(() => window.__native.saved.length === 1);
    const saved = await a.evaluate(() => window.__native.saved[0]);
    check('Exports are handed to the Android shell', saved.name === 'fieldledger-brinjal-2026-10.csv' && /TOTAL,,94,0,3008,0,3008/.test(saved.text), saved.name);
    await a.locator('[data-action="export-pdf"]:visible').first().click();
    await a.waitForFunction(() => window.__native.prints.length === 1);
    check('PDF uses the Android print dialog', (await a.evaluate(() => window.__native.prints[0])) === 'fieldledger-brinjal-2026-10');
    await a.evaluate(() => window.FieldLedgerNativeEvent('print-finished', ''));
    await a.evaluate(() => { location.hash = '#/brinjal/tools'; }); await a.waitForSelector('#updatesCard');
    await a.locator('[data-action="check-updates"]').click();
    check('Check for updates calls the shell and shows “Checking…”', (await a.evaluate(() => window.__native.checks)).join() === 'true' && /Checking/.test(await a.locator('#updatesCard').innerText()));
    check('No update-address editing (just one clear button)', (await a.locator('#updateUrl, #updateUrlForm').count()) === 0 && (await a.locator('#updatesCard button').count()) === 1);
    await a.evaluate(() => window.FieldLedgerNativeEvent('update', JSON.stringify({ state: 'available', versionCode: 260, versionName: '2.6.0', notes: 'New things', size: 340000, auto: false })));
    await a.waitForSelector('[data-upd="now"]');
    check('Update found → sheet with “Update later” and “Update now”', /Update available/.test(await a.locator('.modal-panel').innerText()) && (await a.locator('[data-upd="later"]').count()) === 1);
    await a.locator('[data-upd="now"]').click();
    await a.evaluate(() => window.FieldLedgerNativeEvent('update', JSON.stringify({ state: 'progress', done: 170000, total: 340000 })));
    check('“Update now” downloads inside the app with a progress bar', (await a.evaluate(() => window.__native.checks)).includes('start') && /50%/.test(await a.locator('.modal-panel').innerText()));
    await a.evaluate(() => window.FieldLedgerNativeEvent('update', JSON.stringify({ state: 'confirm' })));
    check('Then installs from inside the app (Android confirm step explained)', /Installing version 2\.6\.0/.test(await a.locator('.modal-panel').innerText()));
    await a.locator('[data-upd="later"]').click();
    await a.evaluate(() => window.FieldLedgerNativeEvent('update', JSON.stringify({ state: 'available', versionCode: 260, versionName: '2.6.0', auto: true })));
    await a.waitForTimeout(150);
    check('After “later”, the automatic check does not ask again for the same version', (await a.locator('[data-upd="now"]').count()) === 0);
    const backupText = JSON.stringify({ app: 'FieldLedger', schemaVersion: 2, settings: {}, profile: {}, data: { brinjal: [], muskmelon: [{ id: 'mx1', date: '2026-10-03', kg: 100, ratePerKg: 10, expenseItems: [] }] } });
    await a.locator('[data-action="import-json"]').click();
    check('Restore backup uses the phone’s own file picker', (await a.evaluate(() => window.__native.checks)).includes('pick:backup'));
    await a.evaluate(t => window.FieldLedgerNativeEvent('file-picked', JSON.stringify({ kind: 'backup', name: 'fieldledger-backup.json', text: t })), backupText);
    await a.waitForFunction(() => window.FieldLedger.getState().data.muskmelon.length === 1, null, { timeout: 5000 });
    check('Backup chosen on the phone is restored', (await a.evaluate(() => window.FieldLedger.getState().data.brinjal.length)) === 0);
    await a.evaluate(() => { location.hash = '#/brinjal/entry'; }); await a.waitForSelector('#bagCount');
    await a.locator('#bagCount').fill('2'); await a.locator('#bagCount').dispatchEvent('change'); await a.waitForSelector('.modal-layer');
    const handled = await a.evaluate(() => window.FieldLedgerBack()); await a.waitForTimeout(150);
    check('Android back closes an open sheet first', handled === true && (await a.locator('.modal-layer').count()) === 0);
    check('No page errors with the native shell', aerr.length === 0, aerr.join('; '));
    await actx.close();
  }

  group('Published claude.ai page (host simulated)');
  {
    const hctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await hctx.addInitScript(() => { window.__saves = []; window.claude = { use: async n => n === 'downloads' ? { save: async r => { window.__saves.push(r.filename); return { status: 'saved' }; } } : null }; });
    const hp = await hctx.newPage(); const herr = []; hp.on('pageerror', e => herr.push(e.message));
    await hp.goto(base + '/dist/web/fieldledger.html#/brinjal/reports'); await hp.waitForSelector('#reportTable');
    check('No sign-in screen where the cloud cannot be reached', (await hp.locator('.login-card').count()) === 0);
    await hp.locator('.month-input').first().fill('2026-10'); await hp.locator('.month-input').first().dispatchEvent('change');
    await hp.locator('[data-action="export-xlsx"]:visible').first().click();
    await hp.waitForFunction(() => window.__saves.length === 1);
    check('Exports use the host downloads capability; PDF hidden', (await hp.evaluate(() => window.__saves[0])) === 'fieldledger-brinjal-2026-10.xlsx' && (await hp.locator('[data-action="export-pdf"]:visible').count()) === 0);
    check('No page errors on the published page', herr.length === 0, herr.join('; '));
    await hctx.close();
  }

  group('Console errors and controls');
  {
    await page.evaluate(() => localStorage.setItem('fieldledger-cloud', JSON.stringify({ localOnly: true })));
    const dead = [];
    for (const p of ['brinjal', 'muskmelon']) for (const v of ['dashboard', 'entry', 'records', 'ledger', 'reports', 'tools', 'settings', 'profile']) {
      await page.goto(`${base}/index.html#/${p}/${v}`); await page.waitForSelector('#viewContainer > *');
      const d = await page.evaluate(() => Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null && !b.matches('[data-nav],[data-action],[data-product-tab],[data-month-report],[data-step],[type="submit"],#quickThemeBtn,[data-bill],[data-ledger-filter]')).map(b => b.outerHTML.slice(0, 80)));
      if (d.length) dead.push(`${p}/${v}: ${d.join(' ')}`);
    }
    check('Every visible button has a wired action', dead.length === 0, dead.join(' | '));
    check('No native browser pop-ups used', H.nativeDialogs() === 0, H.nativeDialogs());
    check('No console errors during the main run', H.errors.length === 0, H.errors.join(' | '));
  }

  await browser.close(); server.close(); mock.stop();
  const passed = results.filter(r => r.pass).length;
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ ranAt: new Date().toISOString(), passed, total: results.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });

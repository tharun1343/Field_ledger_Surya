# FieldLedger — Farm Business Tracker

A mobile-first daily ledger for two separate farm businesses:

- **Brinjal / கத்திரிக்காய்** (violet). Bag-by-bag weights with type and size, a daily rate per kg, separate men's and women's labour, and itemised expenses.
- **Muskmelon / முலாம்பழம்** (yellow/amber). Daily quantity in kg, rate per kg and itemised expenses, with a **monthly-first** overview.

You record production, sales, labour and expenses each day, review month-wise statements, and export them as PDF, Excel, CSV or PNG, plus a full JSON backup.

> **Latest runnable build: [`index.html`](index.html).** It is a single standalone file with no build step and no dependencies.
> The original prototype is kept unchanged at [`original/farm_business_ledger_prototype.html`](original/farm_business_ledger_prototype.html).

---

## Run it

| Option | How |
|---|---|
| Just open it | Double-click `index.html`, or open it in Chrome, Edge, Firefox or Safari. |
| Local web server (recommended for phones on the same Wi-Fi) | `npm start` (serves on `http://localhost:8080`), or any static server such as `python3 -m http.server 8080`. |
| Phone | Host the file on any static host (GitHub Pages, Netlify and so on), open it in Chrome on Android, then use **⋮ → Add to Home screen**. |

**Browser requirements:** a current Chrome, Edge, Firefox or Safari, with JavaScript and local storage (`localStorage`) enabled. In private/incognito windows or with site data blocked, the app shows a warning banner because changes cannot be saved.

## Run the tests

```bash
npm install        # installs Playwright (uses the bundled Chromium)
npm test           # node tests/acceptance.js
```

The suite drives the real `index.html` in headless Chromium and writes these to `tests/results/`: `results.json`, screenshots for 360 px, 768 px and desktop widths, and the exported files. Results are in [TEST_REPORT.md](TEST_REPORT.md). The XLSX check uses `python3` with `openpyxl`, and the PDF check uses `pdftotext`.

---

## Features

**Common to both businesses**
- **Product switcher.** Each business has its own data, theme colour and totals. Nothing is mixed between them.
- **Overview.** Month navigator (‹ month ›), summary cards and quick actions for Daily entry, Monthly report, Records, Export & backup, Settings and Profile.
- **Daily entry.** You edit a *draft*, and nothing is stored until **Save daily entry**.
  - Editing an existing day lets you save, cancel or delete it (delete asks first).
  - If another entry already exists for that date, the app asks before replacing it.
  - Leaving the form with unsaved changes asks for confirmation, including on tab close and the Back button.
- **Expense modal.** Each line item has a date (defaults to today), *What for?*, an amount in ₹ and optional notes.
  - Use **Add another expense** for more lines. Each line can be removed.
  - Values are validated, and completely blank lines are ignored.
- **Records.** Newest first, with a month filter and text search (date, brinjal type, expense purpose, notes).
  - Each record can be viewed in detail, edited or deleted.
  - Phones get a card layout; desktop gets a table.
- **Monthly report.** A date-wise statement (oldest → newest) with summary tiles, a TOTAL row, an expense-items table and explanatory notes.
- **Exports** for the selected business and month, named like `fieldledger-brinjal-2026-10.*`:
  - **PDF:** the browser print dialog with a print-only statement layout. Choose **Save as PDF**.
  - **Excel `.xlsx`:** a *Statement* sheet (numeric cells, frozen header, totals) and an *Expense items* sheet.
  - **CSV:** UTF-8 with a header row and a TOTAL row.
  - **PNG:** a formatted statement image. On phones that support file sharing it opens the share sheet so you can save to Photos/Gallery; otherwise it downloads.
  - **JSON backup:** both businesses, every bag and expense detail, settings and profile.
- **Restore from backup.**
  - The file is fully validated first. Malformed files, wrong-shape files and files with invalid records are rejected and nothing changes.
  - The app shows what the file contains and asks before replacing anything.
  - Backups from the original prototype are also accepted and upgraded.
- **Settings.**
  - Light/Dark theme and Small/Medium/Large text, both remembered on the device.
  - Brinjal types/categories: add new ones; removing one asks first and never rewrites saved bags.
  - There is no "calculation defaults" panel.
- **Profile.** Farm name (default "My Farm"), owner name, phone and location. No personal name is hard-coded.
- **Phone experience.**
  - Fixed bottom navigation with 54 px touch targets, compact header and card layouts.
  - Modals are bottom sheets: the body scrolls while the Save/Cancel bar stays visible.
  - The Android Back button moves between screens because routes use the URL hash, e.g. `#/brinjal/records`.
- **Accessibility.**
  - Every input has a label, focus is visible, and focus stays inside an open modal (Esc closes it).
  - The toast is an ARIA live status, and an invalid field is highlighted and receives focus.
  - Icons are SVG and paired with text labels.
  - Animations are minimal and switch off when the device has *reduce motion* turned on.

**Brinjal**
- Choosing the **number of bags** (1–60) immediately opens a modal with exactly that many numbered sections: **Bag 1 … Bag N**.
  - Each section has **Weight (kg)**, **Brinjal type/category** (from Settings) and **Size S/M/L**.
  - Shortcuts: "Use Bag 1 type & size for all bags", add a bag, remove a specific bag.
- Saving the modal updates the **draft only**. Reopening it shows the same values.
- **Cancel semantics.** Cancel or ✕ throws away edits made in that modal since it opened (it asks first if anything changed). The draft's saved bags and the count selector go back to what they were.
- **Changing the count:**
  - Increasing keeps bags 1…N and adds new bags.
  - Decreasing asks first and names what will go, e.g. "Bags 4–5 (65 kg) will be removed".
  - The selector always equals the number of saved bag rows.
- New bags are pre-filled with **32 kg**, the sample sheet's 320 kg ÷ 10 bags. This is only an editable starting value, not a setting.
- **Labour:** separate Men and Women counts (0–50) and separate wages, with each subtotal shown, e.g. `5 × ₹500 = ₹2,500`.
- Live summary cards show Total weight and bags, Gross sales, Operating expenses, Labour salary and Net after costs.

**Muskmelon**
- The overview is **month-first**:
  - A "Monthly focus" hero card with month navigation and net for the month.
  - Monthly KPIs, a table of every active month with a link to its statement, and a gross-income-by-month chart.
- Daily entry has Date, Quantity (kg), Rate/kg and expense line items. There are no bag or labour fields.
- A custom cantaloupe icon (netted rind with an orange wedge) is used. There is no coconut.

---

## Calculation rules

| Business | Rule |
|---|---|
| Brinjal | `bags = bagDetails.length` · `totalKg = Σ bag.weightKg` · `gross = totalKg × ratePerKg` · `expenses = Σ expenseItem.amount` · `labour = men × menWage + women × womenWage (+ legacy aggregate, see below)` · `net = gross − expenses − labour` |
| Muskmelon | `gross = kg × ratePerKg` · `expenses = Σ expenseItem.amount` · `net = gross − expenses` |

- Numbers use Indian grouping (`₹1,30,500`). Whole rupees show no decimals; anything else shows 2 decimals. Negatives show as `−₹3,100`.
- Intermediate values are not rounded. Exports round to 2 decimals.
- Every screen and export uses the same `calc` and `buildStatement` functions, also exposed as `window.FieldLedger` for testing, so every screen and export reports identical figures.
- The source sheet's Muskmelon column "Profit" is really quantity × rate, so the app labels it **Gross income** and shows **Net after expenses** separately.

### Expense-date rule (monthly reports)

Each expense item keeps **its own date**:

- **Monthly statements, report totals and the overview count each expense on the item's own date.** An item dated 2 Nov that belongs to a 15 Oct daily record is reported in **November**.
- If a date has expenses but no sales record that month, it appears as an **"expenses only"** row. The rows therefore always add up to the month total, and nothing is double-counted or lost.
- **Daily entry, Records and the record detail view** show all expense items *attached to that daily record*, whatever their dates. The report notes how many items are dated differently from their record.

### Historical (legacy) labour

The source sheet records only the **total** number of labourers and the total labour salary per day, not a men/women split. The sample rows therefore store this as `legacyLabour: { workers, salary }`, with men = 0 and women = 0:

- It is included in labour salary and net, so the sample totals still reconcile: ₹14,500 labour and 29 workers.
- Reports and exports show it in a separate **"Workers, split unknown (legacy)"** column. It is never presented as men or women.
- When editing such a day you can choose **Replace with men/women split**. That removes the legacy amount on save so you can enter the real split.
- **Migration does not re-label existing data.** Data saved by the original prototype, which stored the aggregate in the "men" field, is upgraded *as stored*. Converting real records to a men/women split is the owner's decision.

---

## Data, storage and backup / restore

- Data lives in the browser's `localStorage` under the key **`fieldledger-v2`**. The last selected business is kept under `fieldledger-ui`.
- **Upgrading from the prototype.** On first run, data under the prototype's key `fieldledger-prototype-v1` is migrated automatically and that key is **left untouched** as a fallback copy.
- **Damaged storage.** If saved data cannot be read, a raw copy is kept under `fieldledger-unreadable-<timestamp>`, a warning banner appears, and sample data loads so the app still works.
- If storage is full or blocked, saving reports an error and **does not claim success**. The banner tells you to export a backup.

**Moving to a new phone or browser, or before clearing browser data:**
1. On the old device, open **More → Export complete backup (JSON)**. This saves `fieldledger-backup-YYYY-MM-DD.json`.
2. Copy the file to the new device (WhatsApp to yourself, email, USB, Drive and so on).
3. On the new device, open FieldLedger → **More → Restore from backup…** → choose the file → confirm.

Restoring **replaces** all records, settings and profile in that browser.

### Data model (schema v2)

```text
state = { app:"FieldLedger", schemaVersion:2,
  settings: { theme:"light|dark", textSize:"small|medium|large", brinjalTypes:[string] },
  profile:  { farmName, ownerName, phone, location },
  data: {
    brinjal:   [{ id, date:"YYYY-MM-DD", ratePerKg, bagDetails:[{ id, weightKg, brinjalType, size:"S|M|L" }],
                  menCount, womenCount, menWage, womenWage, legacyLabour:null|{workers,salary},
                  expenseItems:[{ id, date, purpose, amount, notes }], createdAt, updatedAt }],
    muskmelon: [{ id, date, kg, ratePerKg, expenseItems:[…], createdAt, updatedAt }] } }
```

- IDs are stable random IDs and are never display indexes.
- Totals are always **derived** and never stored, so stored totals cannot drift from the details.
- A JSON backup is this object plus `exportedAt`.

---

## Files

| Path | What |
|---|---|
| `index.html` | **Latest runnable application** (HTML, CSS and vanilla JS in one file) |
| `original/farm_business_ledger_prototype.html` | Original prototype, preserved unchanged |
| `tests/acceptance.js` | Playwright acceptance suite (112 checks) |
| `tests/results/` | Latest run: `results.json`, screenshots, sample PNG export |
| `TEST_REPORT.md` | Acceptance-test summary |
| `docs/` | Handoff documents: master prompt, technical spec, original table image |

---

## Known limitations

- **Single device and browser only.** There is no backend, login, cloud sync or automatic backup. Moving data relies on JSON backup and restore.
- **Not a native Android app.** It is a responsive web app that can be added to the home screen. There is no service worker or offline install manifest yet; opening the file directly works offline.
- **PDF goes through the browser print dialog.** The user must pick "Save as PDF". Page layout depends on the browser.
- **PNG sharing.** Sharing to Gallery depends on the phone browser supporting the Web Share API with files; otherwise the PNG downloads.
- **Fonts.** On some devices the 🍆 in the PDF/PNG header may render as a plain glyph.
- **Excel output.** XLSX files are generated in the browser without compression. They open in Excel, LibreOffice and openpyxl but are larger than Excel-saved files.
- **Duplicate dates.** One daily record per business per date is enforced when saving from the form. Imported backups with duplicate dates are kept and shown as separate rows.
- **Confirmations use the browser's native dialogs.** They are reliable but plain.
- **What the automated tests cover.** The tests ran in headless Chromium only. Firefox and Safari, real Android devices, real print-to-PDF dialogs and the mobile share sheet were **not** tested. See [TEST_REPORT.md](TEST_REPORT.md).

## Material changes from the prototype

- **New Brinjal record shape:** ids on bags and expenses, `ratePerKg`, `menCount`/`womenCount`, `legacyLabour`, and derived totals. Automatic migration from the v1 key and from v1 backups.
- **Fixed the Muskmelon "View daily statement" button.** It read the wrong data attribute, so months never opened.
- **Fixed save matching by date.** Editing a record onto another record's date could overwrite the wrong record. Saving now matches by id and asks before replacing a same-date entry.
- **Bag count and bag details can no longer get out of step.** Cancelling the bag modal used to leave the selector at the new count. Reducing the count now asks first.
- **Unsaved-draft protection** when navigating, switching business, using Back or closing the tab.
- **Expense-date rule implemented.** Expenses used to be lumped into the daily record's month.
- **Brinjal overview** gained a month selector and separate cards for expenses and labour. The Muskmelon overview is rebuilt as month-first with month navigation and a trend chart.
- **Records:** search, month filter, detail view and a phone card layout.
- **Text size** now scales all text; it previously affected very little because most sizes were fixed in px.
- **Exports:** filenames are `fieldledger-<product>-<month>`. XLSX has styles and two sheets, the PNG layout adapts to its columns, and the PDF print layout is cleaner.
- **Import** is fully validated and reports exactly why a file was rejected. Restoring sample data asks first.
- **Visuals:** a coherent SVG icon set, a new cantaloupe icon, visible focus rings, an Android-style bottom nav and bottom-sheet modals, and hash routing for the Back button.
- **Profile defaults** are generic ("My Farm"); the hard-coded personal name is gone.

## Recommended next phase

1. **Installable PWA:** manifest and service worker for offline use and a home-screen icon, plus `navigator.storage.persist()` to reduce the risk of the browser evicting data.
2. **Owner decision on legacy labour:** whether to convert historical aggregate labour into men/women splits.
3. **Optional cloud sync** if multiple devices or users are needed. For example, a small backend with auth such as Supabase or Firebase, keeping the JSON schema as the sync and export format.
4. Cross-browser and real-device test pass (Android Chrome, iOS Safari, Firefox), plus a Tamil UI language option.

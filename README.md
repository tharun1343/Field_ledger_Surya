# FieldLedger — Farm Business Tracker

A mobile-first daily ledger for two separate farm businesses:

- **Brinjal / கத்திரிக்காய்** (violet). Bag-by-bag weights with type and size, a daily rate per kg, separate men's and women's labour, and itemised expenses.
- **Muskmelon / முலாம்பழம்** (yellow/amber). Daily quantity in kg, rate per kg and itemised expenses, with a **monthly-first** overview.

You record production, sales, labour and expenses each day, review month-wise statements, and export them as PDF, Excel, CSV or PNG, plus a full JSON backup.

> **Latest runnable build: [`index.html`](index.html)** (v2.4.0). It is a single standalone file with no build step and no dependencies.
> **Android app:** `release/FieldLedger-2.4.0.apk`, the same app in a native shell with in-app updates (see [Android app](#android-app)).
> **Web link:** https://claude.ai/artifact/D9nAx8srHFF4tJuNo5epya, the same app published on claude.ai. It is private until shared from its Share menu.
> The original prototype is kept unchanged at [`original/farm_business_ledger_prototype.html`](original/farm_business_ledger_prototype.html).

---

## What's new in 2.4

- **Business switch:** the Brinjal/Muskmelon choice is now a text-free toggle next to the theme button. The top-left shows the current business's icon and name.
- **Always opens on Brinjal,** including right after signing in.
- **Sign-in feedback:**
  - The button shows a spinner and "Sending code…" while the email is sent.
  - It shows "Verifying code…" while the code is checked, with the code field locked meanwhile.
- **Button colours on hover:** coloured buttons (Save, Discard, Delete) keep their colour; previously they turned white in light theme.
- **Phone layout:**
  - Recent entries and Muskmelon months show as tappable lists instead of sideways-scrolling tables.
  - Rate and Wastage share a row.
  - An odd last summary card spans the full width.
  - The desktop entry form has a comfortable maximum width.

## What's new in 2.3

- **Sign-in with a 6-digit email code.** There are no passwords; a new email address gets its account created by its first code. Tapping the email link also works as a fallback.
- **Single repository.** Releases are published from this repository:
  - web app: `index.html` via GitHub Pages;
  - APK and update manifest: `release/`.
- **Setup steps:** [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) (email templates with `{{ .Token }}`, OTP length 6).

## What's new in 2.2

- **Sign-in and cloud sync (Supabase).**
  - Email and password accounts, with forgot password and set-new-password.
  - The same records on every phone and on the hosted web link.
  - Works offline: saves wait in a queue and upload when the connection returns.
  - If two phones edit the same entry, the newest save wins.
  - Setup: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).
- **Status dot** on the account button: 🟢 online and synced, 🟠 syncing / waiting / not signed in, 🔴 offline.
- **Simpler screens.**
  - The big page title block is gone.
  - Daily entry opens on **today's date**, shown in a tap-to-change date pill.
  - The overview's duplicate quick-action card is gone.
- **Top bar:** the Brinjal/Muskmelon switch sits next to the dark-mode button. **Text size** moved to Settings.
- **Number of bags** is a whole-number field (no dropdown). The bag sheet asks only **weight and size**.
- **Brinjal type is chosen once per day** on the main form.
  - **＋ New type…** adds a custom type, which is saved to Settings.
  - The list is ordered by most recently used; remove types in Settings.
- **Labour for Muskmelon** too. Net = gross − expenses − labour for both businesses.
- **Default wages in Settings** for men and women, per business.
  - They fill every new entry and can be changed for one entry only. The form says "This entry only" when you do.
- **Visual changes:**
  - Glass-style buttons.
  - Smooth slide, cross-fade and circular theme-reveal transitions (off when reduce motion is on).
  - Small plump brinjal icon.
  - New app icon combining a brinjal and a muskmelon.
- **Updates:** a clear message when nothing has been published yet, instead of "Could not check".

## What's new in 2.1

- **Wastage (kg)** in both the Brinjal and Muskmelon daily entry.
  - It has **no price**: gross sales and net never change because of it.
  - It appears in the live summary, Records, the record view, monthly statements, the overview notes, and the CSV, XLSX, PNG and PDF exports.
  - Older records and backups load with wastage 0.
- **3D look and feel.** Raised cards that tilt toward the mouse on desktop (not on phones, and never with reduce-motion on), pressable buttons, cylinder-style chart bars, a 3D product emblem, a raised product switch, a lifted bottom-nav pill and bottom sheets with a drag handle.
- **In-app confirmation dialogs** replace browser pop-ups. They work inside the Android app and on the claude.ai web link, where native pop-ups are blocked.
- **Android app with in-app updates.**

## Run it

| Option | How |
|---|---|
| Just open it | Double-click `index.html`, or open it in Chrome, Edge, Firefox or Safari. |
| Local web server (recommended for phones on the same Wi-Fi) | `npm start` (serves on `http://localhost:8080`), or any static server such as `python3 -m http.server 8080`. |
| Phone | Host the file on any static host (GitHub Pages, Netlify and so on), open it in Chrome on Android, then use **⋮ → Add to Home screen**. |

**Browser requirements:** a current Chrome, Edge, Firefox or Safari, with JavaScript and local storage (`localStorage`) enabled. In private/incognito windows or with site data blocked, the app shows a warning banner because changes cannot be saved.

## Android app

`android/` is a small native WebView shell around the same `index.html`. There is no AndroidX and no Gradle; it builds with Ubuntu's packaged Android tools.

| | |
|---|---|
| Package | `com.fieldledger.farm` |
| Requires | Android 7.0 (API 24) or newer; targets Android 14 (API 34) |
| Permissions | Internet (update checks only) and "install unknown apps" (to install updates) |
| Data | Stays in the app's own storage and survives updates. The JSON backup works the same as on the web. |

**What the native shell adds:**
- **PNG** exports go to the Gallery (`Pictures/FieldLedger`). Other exports go to `Download/FieldLedger`. On Android 7–9 a share sheet opens instead.
- **PDF** opens Android's print dialog; choose "Save as PDF".
- **Restore from backup** opens the system file picker.
- The **Back** button closes dialogs and sheets first, then steps back through screens.
- The **status bar** follows the product colour.

### Install
1. Copy `FieldLedger-2.4.0.apk` to the phone and open it.
2. Allow "install unknown apps" for the app you opened it from (Files, Chrome, WhatsApp) when Android asks.
3. Google Play Protect may warn that the app is from an unknown developer, because it isn't on the Play Store. Choose **Install anyway**.

### In-app updates
- The app reads a small manifest, `version.json`, from an HTTPS address. It checks automatically at most every 12 hours, and on demand from **More → App updates → Check for updates**.
- When a newer `versionCode` is listed, the app offers **Download & install** and shows download progress.
- It then verifies the APK before installing:
  - the **SHA-256 checksum** matches the manifest;
  - the file is a **FieldLedger** package;
  - it is **newer** than the installed version.
- Android's own installer then asks for confirmation. The first time, Android asks once to allow FieldLedger to install apps.
- Android only accepts an update **signed with the same key** as the installed app. Your records are kept.

**Manifest location.** It is set in `android/version.properties` and defaults to
`https://raw.githubusercontent.com/tharun1343/fieldledger-releases/main/version.json`. You can change it in the app under More → App updates → Update source. Any public HTTPS host works: GitHub, Google Drive direct links, your own site.

**Publishing an update:**
1. Edit `index.html`.
2. In `android/version.properties`, raise `VERSION_CODE` (e.g. 210 → 211) and `VERSION_NAME`.
3. Build: `RELEASE_NOTES="What changed" android/build-apk.sh`. This writes `dist/FieldLedger-<version>.apk` and `dist/version.json`.
4. Upload **both files** to the public release location. Phones pick the update up on their next check.

**Signing key.** The key lives at `android/keystore/fieldledger-release.jks`, with its password in `keystore.properties`.
- It is committed to this **private** repository so that future updates can be signed.
- **Back it up.** If it is lost, phones cannot update; FieldLedger has to be uninstalled and reinstalled after exporting a backup.
- **Never publish it.** Keep it out of any public repository.

**Building the APK** needs: `sudo apt-get install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23` plus a JDK.

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
| Muskmelon | `gross = kg × ratePerKg` · `expenses = Σ expenseItem.amount` · `labour = men × menWage + women × womenWage` · `net = gross − expenses − labour` |

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
| `docs/SUPABASE_SETUP.md` | Step-by-step Supabase, GitHub Pages and update-channel setup (SQL included) |
| `scripts/configure-cloud.py` | Builds your Supabase URL + anon key into the app |
| `tests/mock-supabase.js` | In-memory Supabase stand-in used by the tests |
| `android/` | Android WebView shell (Java), icons, manifest, `build-apk.sh`, signing key |
| `dist/FieldLedger-2.2.0.apk`, `dist/version.json` | Built, signed APK and its update manifest |
| `dist/web/fieldledger.html`, `scripts/build-web.py` | `index.html` reshaped for publishing on claude.ai |
| `original/farm_business_ledger_prototype.html` | Original prototype, preserved unchanged |
| `tests/acceptance.js` | Playwright acceptance suite (112 checks) |
| `tests/results/` | Latest run: `results.json`, screenshots, sample PNG export |
| `TEST_REPORT.md` | Acceptance-test summary |
| `docs/` | Handoff documents: master prompt, technical spec, original table image |

---

## Known limitations

- **Cloud sync needs your own Supabase project** (free plan is fine; see the guide). Without it, records stay on the device; use JSON backup/restore to move them. Sync resolves conflicts per entry with "newest save wins".
- **Android app is a WebView shell.** It runs the same web code with native file saving, printing and updates. It is not on the Play Store, so it is installed by sideloading.
- **Not tested on a real phone or emulator.** The APK was built, signed and structurally verified, but no emulator was available in the build environment. Test install, save, print and update on a phone before relying on it.
- **Updates and the sign-in web link need the public `fieldledger-releases` repository** (guide step 4). Files are staged in `dist/release-repo/`.
- **Previously:** The source repo is private, so phones can't download from it. Until `version.json` and the APK are published somewhere public, "Check for updates" reports that it could not check.
- **On the claude.ai web link,** exports go through claude.ai's download prompt and PDF printing is unavailable. Records saved there live only in that browser.
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

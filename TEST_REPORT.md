# FieldLedger — Acceptance Test Report

- **Build tested:** `index.html` v2.1.0, plus the published-page variant and a simulated Android shell
- **How:** `npm test` (`tests/acceptance.js`) drives the real app in **headless Chromium 141 (Playwright 1.56)**, served over local HTTP.
- **Viewports:** 1280×900 desktop, 360×740 phone (touch, DPR 2), 768×1024 tablet and 1440×900.
- **Result:** **129 / 129 automated checks passed** (run 2026-10-19). The raw results are in `tests/results/results.json`; screenshots and exported files are alongside them.

## Master-prompt acceptance scenarios

| # | Scenario | Result | Evidence (groups below) |
|---|---|---|---|
| 1 | Select 5 bags → exactly 5 sections with weight, type and S/M/L size | ✅ Pass | 1/2 |
| 2 | Weights 30, 32, 33, 34, 31 → 160 kg and 5 bags | ✅ Pass | 1/2 |
| 3 | A type added in Settings appears in the bag dropdown without reload; removal asks and does not rewrite history | ✅ Pass | 3b |
| 4 | Reopen the bag modal → values kept and editable; save, reload, edit → values kept | ✅ Pass | 4, 4b |
| 5 | Expenses ₹150 + ₹250 = ₹400; edit/delete refreshes; blank notes OK; expense-date rule | ✅ Pass | 5, 5b |
| 6 | 5 men × ₹500 + 5 women × ₹400 = ₹4,500 | ✅ Pass | 6 |
| 7 | Changing a day's rate updates gross, net and report totals | ✅ Pass | 7 |
| 8 | Brinjal net = gross − expenses − labour; Muskmelon net = gross − expenses | ✅ Pass | 8, 8b |
| 9 | Product switching keeps data, theme and monthly totals separate | ✅ Pass | 9/10, 8b |
| 10 | Muskmelon overview is monthly-first, with a melon icon and no coconut | ✅ Pass | 9/10 |
| 11 | Monthly report: correct month, sorted, correct totals, no duplicate or missing rows | ✅ Pass | 11, 7 |
| 12 | Theme and text size survive reload; reduced motion respected | ✅ Pass | 12 |
| 13 | 360 px: no horizontal overflow, bottom nav reachable, modals scroll with actions usable; tablet and desktop | ✅ Pass | 13 |
| 14 | PDF/XLSX/CSV/PNG/JSON exports contain the selected product and month; malformed import and import cancellation | ✅ Pass (with notes) | 14, 14b |
| 15 | No uncaught console errors; every visible control is wired | ✅ Pass | 15 |

## What "tested" means here, and what was not tested

- **PDF.** The test stubs `window.print`. It confirms the button enters the print-only report mode and sets the document title to `fieldledger-brinjal-2026-10`. It then renders that print layout to a real PDF with Chromium and reads it back with `pdftotext`: statement title and totals present, app navigation absent. The interactive *Save as PDF* dialog itself was not clicked.
- **XLSX.** Opened with Python `openpyxl`: sheet names, numeric totals, title and expense items checked.
- **PNG.** Decoded with Pillow, and the brinjal statement was reviewed visually (`tests/results/export-brinjal-statement.png`). The mobile **share sheet** path (`navigator.share`) was **not** tested because headless Chromium has no share target; the download fallback was tested.
- **Not tested:** Firefox, Safari/iOS, physical Android devices, storage-quota-exceeded behaviour (the code path exists but was not forced), and screen readers.
- **Sample data** reconciles exactly with the source sheet: Brinjal 94 bags / 3,008 kg / ₹45,120 / ₹12,000 / ₹14,500 / 29 workers, net ₹18,620; Muskmelon 10,900 kg / ₹1,30,500 / ₹18,000, net ₹1,12,500.
- **Migration:** the original prototype was loaded in the same browser profile so it wrote its own v1 storage. The new build then loaded and upgraded that data with identical totals.

## v2.1 additions

| Area | Result | Notes |
|---|---|---|
| Wastage (kg) in both forms, summaries, reports, CSV/XLSX/PNG | ✅ Pass | Wastage never changes gross or net |
| In-app confirmation dialogs (no native pop-ups anywhere) | ✅ Pass | Every confirm flow is exercised through the new dialog |
| Android bridge, web side: save files, print, theme colour, updates panel, back button | ✅ Pass | Native object simulated in Chromium |
| Published web link: exports via the host downloads capability, PDF hidden | ✅ Pass | claude.ai host simulated |
| APK build: manifest, v2/v3 signature, zip alignment, dex contains all classes | ✅ Pass | `aapt dump badging`, `apksigner verify`, `zipalign -c` |
| APK on a real phone or emulator (install, save, print, in-app update) | ⚠️ Not tested | No emulator in the build environment |

## All automated checks

### 11. Monthly report reconciles with the source sheet (sample data)

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Brinjal Oct 2026: 8 rows sorted by date, no duplicates | 2026-10-01,2026-10-02,2026-10-03,2026-10-04,2026-10-05,2026-10-06,2026-10-07,2026-10-08 |
| ✅ Pass | Brinjal totals 94 bags / 3,008 kg / ₹45,120 / ₹12,000 / ₹14,500 labour / 29 workers | {"bags":94,"kg":3008,"gross":45120,"exp":12000,"labour":14500,"workers":29} |
| ✅ Pass | Brinjal net after costs = 45,120 − 12,000 − 14,500 = ₹18,620 | 18620 |
| ✅ Pass | Muskmelon Oct 2026: 6 rows, 10,900 kg, ₹1,30,500 gross, ₹18,000 expenses, ₹1,12,500 net | {"records":6,"bags":0,"kg":10900,"wastage":0,"gross":130500,"expenses":18000,"men":0,"women":0,"legacyWorkers":0,"workers":0,"labour":0,"net |
| ✅ Pass | Report screen TOTAL row shows ₹45,120 / ₹12,000 / ₹14,500 / ₹18,620 | TOTAL 94 3,008 0 — ₹45,120 ₹12,000 0 0 29 ₹14,500 ₹18,620 |
| ✅ Pass | Statement dates oldest → newest | 1 Oct/2 Oct/3 Oct/4 Oct/5 Oct/6 Oct/7 Oct/8 Oct |
| ✅ Pass | Legacy aggregate labour shown in its own “split unknown” column (not as men) | DATE BAGS TOTAL WEIGHT (KG) WASTAGE (KG) RATE/KG (₹) GROSS SALES (₹) OPERATING EXPENSES (₹) MEN WOMEN WORKERS, SPLIT UNKNOWN (LEGACY) LABOUR |
| ✅ Pass | A month without data shows an empty statement message |  |

### 9/10. Product switching, theming and Muskmelon monthly-first overview

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Switching to Muskmelon changes theme to yellow/amber | #b07a06 |
| ✅ Pass | Muskmelon overview is month-first (month navigator + Monthly performance table) |  |
| ✅ Pass | Muskmelon uses the melon SVG icon and no coconut icon |  |
| ✅ Pass | Muskmelon KPIs show its own totals (10,900 kg, ₹1,30,500, ₹18,000, ₹1,12,500) | 10,900 kg / ₹1,30,500 / ₹18,000 / ₹1,12,500 |
| ✅ Pass | Brinjal KPIs are different (no mixing) | 94 / 3,008 kg / ₹45,120 / ₹12,000 / ₹14,500 / ₹18,620 |
| ✅ Pass | “Statement” button on a month row opens that month’s report (prototype bug fixed) |  |
| ✅ Pass | Muskmelon statement labels Gross income and Net after expenses (not “Profit”) |  |
| ✅ Pass | Muskmelon Records list shows only muskmelon records (6) | 6 |
| ✅ Pass | Switching back restores Brinjal violet theme |  |

### 1/2. Bag selector opens exactly N bag sections; weights sum

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Selecting 5 bags shows exactly 5 bag sections | 5 |
| ✅ Pass | Sections are numbered Bag 1 … Bag 5 | 1 Bag 1,2 Bag 2,3 Bag 3,4 Bag 4,5 Bag 5 |
| ✅ Pass | Each bag has weight, type dropdown and S/M/L size | [[1,1,"SML"],[1,1,"SML"],[1,1,"SML"],[1,1,"SML"],[1,1,"SML"]] |
| ✅ Pass | Modal running total shows 160 kg |  |
| ✅ Pass | Daily form shows total weight 160 kg and 5 bags |  |
| ✅ Pass | Bag count selector matches saved bag rows (5) |  |

### 4. Bag draft persists when the modal is reopened

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Reopened modal still has 30, 32, 33, 34, 31 | 30,32,33,34,31 |
| ✅ Pass | Sizes kept (M, L, M, S, M) | MLMSM |
| ✅ Pass | Cancel asks before discarding modal edits and keeps the saved draft (160 kg) |  |
| ✅ Pass | Editing one bag in the modal updates the draft total (162 kg) |  |

### Bag count changes never silently lose data

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Reducing 5 → 3 asks for confirmation naming Bags 4–5 and their weight | Reduce from 5 to 3 bags?  Bags 4–5 (65 kg) will be removed when you save the bag details. Bags 1–3 keep their values. |
| ✅ Pass | Declining keeps 5 bags and the selector at 5 |  |
| ✅ Pass | Increasing 5 → 7 keeps bags 1–5 and adds 2 new bags | 30,32,33,34,31,32,32 |
| ✅ Pass | Cancelling the modal reverts the selector to the saved count (5) |  |

### 3. Settings brinjal types flow into the bag dropdown

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Leaving Daily entry with unsaved changes asks first; declining stays on the form |  |

### 6. Men/women labour

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | 5 men × ₹500 + 5 women × ₹400 = ₹4,500 | ₹4,500 |
| ✅ Pass | Men and women subtotals shown separately (₹2,500 / ₹2,000) |  |
| ✅ Pass | Zero is selectable for men and women |  |

### 5. Expense modal

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | New expense item date defaults to today | 2026-10-19 |
| ✅ Pass | “Add another expense” appends a second full item |  |
| ✅ Pass | Modal total ₹400 |  |
| ✅ Pass | Daily form shows operating expenses ₹400 (notes left blank) |  |
| ✅ Pass | Reopen shows both items with their values |  |
| ✅ Pass | Edit item to ₹100 and delete the other → total ₹100 |  |
| ✅ Pass | Validation: an item without “What for?” is rejected |  |
| ✅ Pass | Three items saved; draft expense total ₹1,000 |  |

### 8. Brinjal daily net formula (live summary)

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Wastage 4.5 kg shown in the live summary | 4.50 kg |
| ✅ Pass | Gross 160 kg × ₹15 = ₹2,400 |  |
| ✅ Pass | Net = 2,400 − 1,000 − 4,500 = −₹3,100 (negative highlighted) | −₹3,100 |
| ✅ Pass | Negative rate is rejected on save |  |
| ✅ Pass | Daily entry saved → Records view |  |
| ✅ Pass | Saved record stores wastageKg 4.5 | 4.5 |
| ✅ Pass | Saved record has 5 bags, 160 kg, men/women split, 3 expense items with ids | {"bags":5,"men":5} |

### 4b. Persistence after reload + edit

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Edit form loads saved record (5 bags, rate 40) |  |
| ✅ Pass | After reload, bag weights 30,32,33,34,31 and sizes M,L,M,S,M are intact | 30,32,33,34,31 MLMSM |
| ✅ Pass | After reload, expense items load with date, purpose, amount and notes | [["2026-10-15","Transport","150",""],["2026-10-15","Packing","250",""],["2026-11-02","Seeds for next month","600","Paid in advance"]] |

### 5b. Expense-date rule in monthly reports

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | October counts only expense items dated in October for 15 Oct (₹400) | 400 / total 12400 |
| ✅ Pass | The 2 Nov item appears in November as an “expenses only” row (₹600), not double-counted | {"records":0,"bags":0,"kg":0,"wastage":0,"gross":0,"expenses":600,"men":0,"women":0,"legacyWorkers":0,"workers":0,"labour":0,"net":-600,"avg |
| ✅ Pass | Statement rows add up exactly to the month total |  |

### 7. Changing a day’s rate updates gross/net and report totals

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Live gross updates to ₹3,200 |  |
| ✅ Pass | Report gross = 45,120 + 3,200 = ₹48,320; net = 48,320 − 12,400 − 19,000 = ₹16,920 | {"g":48320,"l":19000,"n":16920} |
| ✅ Pass | Report screen totals match (₹48,320 / ₹12,400 / ₹19,000 / ₹16,920) | TOTAL 99 3,168 4.50 — ₹48,320 ₹12,400 5 5 29 ₹19,000 ₹16,920 |
| ✅ Pass | 9 dated rows in October (8 sample + 15 Oct), no duplicates | 9 |

### 3b. Brinjal types: add / remove without rewriting history

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Settings has no “calculation defaults” panel |  |
| ✅ Pass | New type listed in Settings |  |
| ✅ Pass | “Green long” appears in the bag type dropdown without reload | Local,Hybrid,Long,Round,Green long |
| ✅ Pass | Removing a type asks for confirmation and says saved bags keep the label | Remove “Green long” from the brinjal type list?  1 saved bag(s) use this type. They will KEEP the label “Green long” — it is only removed fr |
| ✅ Pass | Historical record still says “Green long” after removal |  |
| ✅ Pass | Editing that record keeps “Green long” selected (marked removed from list) | Green long (removed from list) |

### Duplicate date handling and delete

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Saving a second entry on the same date asks before replacing |  |
| ✅ Pass | Accepting replaces it: still exactly one 16 Oct record (2 bags, ₹10) |  |
| ✅ Pass | Delete asks for confirmation; declining keeps the record |  |
| ✅ Pass | Accepting deletes it |  |
| ✅ Pass | View modal shows bags, labour breakdown and expense items |  |
| ✅ Pass | Records search filters (1 match for “seeds”) |  |
| ✅ Pass | Records month filter shows a no-match state for November |  |

### 8b. Muskmelon daily entry formula

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Muskmelon form has no bag/labour fields |  |
| ✅ Pass | Gross 1,000 × ₹12 = ₹12,000; net = 12,000 − 500 = ₹11,500 (50 kg wastage not priced) |  |
| ✅ Pass | Muskmelon October wastage total 50 kg | 50 |
| ✅ Pass | Muskmelon October now 11,900 kg / ₹1,42,500 / ₹18,500 / ₹1,24,000 net | {"records":7,"bags":0,"kg":11900,"wastage":50,"gross":142500,"expenses":18500,"men":0,"women":0,"legacyWorkers":0,"workers":0,"labour":0,"ne |
| ✅ Pass | Brinjal October totals unaffected by the Muskmelon entry |  |

### 14. Exports (selected product + month)

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | CSV filename fieldledger-muskmelon-2026-10.csv |  |
| ✅ Pass | CSV has header + 7 rows + TOTAL with correct totals | TOTAL,11900,50,,142500,18500,124000 |
| ✅ Pass | XLSX opens in openpyxl with Statement + Expense items sheets | Statement,Expense items |
| ✅ Pass | XLSX totals numeric: 11900 kg, 50 kg wastage, 142500 gross, 18500 expenses, 124000 net | ["TOTAL",11900,50,null,142500,18500,124000] |
| ✅ Pass | XLSX title names product and month; 5 expense items listed | Muskmelon monthly statement — October 2026 / 5 |
| ✅ Pass | PNG is a real PNG image named fieldledger-muskmelon-2026-10.png | {"fmt":"PNG","size":[2200,1208]} |
| ✅ Pass | Brinjal CSV header includes wastage, men, women, legacy workers, labour salary and net | Date,Bags,Total weight (kg),Wastage (kg),Rate/kg (₹),Gross sales (₹),Operating expenses (₹),Men,Women,"Workers, split unknown (legacy)",Labo |
| ✅ Pass | Brinjal CSV TOTAL row: 99 bags, 3168 kg, 4.5 kg wastage, 48320, 12400, 5 men, 5 women, 29 legacy, 19000, 16920 | TOTAL,99,3168,4.5,,48320,12400,5,5,29,19000,16920 |
| ✅ Pass | PDF button opens the print dialog in report print mode, titled fieldledger-brinjal-2026-10 | {"calls":1,"cls":true,"title":"fieldledger-brinjal-2026-10"} |
| ✅ Pass | Printed PDF contains the statement title and totals, not the app chrome | 🍆 Brinjal — October 2026 / M Y FA R M · M O N T H LY S TAT E M E N T /  |
| ✅ Pass | JSON backup has both products, expense details, settings and profile | 9 brinjal / 7 muskmelon |

### 14b. JSON import: malformed, invalid, cancel, success

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Malformed JSON is rejected with a message; data unchanged |  |
| ✅ Pass | Wrong-shape JSON is rejected; data unchanged |  |
| ✅ Pass | Backup with an invalid record date is rejected with the record named |  |
| ✅ Pass | Import asks for confirmation; cancelling changes nothing |  |
| ✅ Pass | Restore sample data asks first and resets to 8 + 6 records |  |
| ✅ Pass | Accepting restores the backup exactly (round-trip) |  |

### 12. Theme, text size and reduced motion

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Dark theme and Large text survive reload | {"theme":"dark","large":true,"bg":"rgb(17, 16, 24)"} |
| ✅ Pass | Text size actually changes small print (Large > Small) | 13.8px vs 10.8px |
| ✅ Pass | prefers-reduced-motion: view animations collapse to ~0s | 1e-05s |

### Migration from the original prototype storage

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Prototype (v1) data is upgraded automatically with identical totals | {"bags":94,"labour":14500} |
| ✅ Pass | Migration keeps the men/women values exactly as stored (no silent re-labelling) and keeps the v1 copy |  |
| ✅ Pass | No page errors in the migration run |  |

### 13. Mobile 360px, tablet and desktop layouts

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | No page-level horizontal overflow at 360px on any screen (both products) | all 14 screens fit |
| ✅ Pass | Bottom navigation is fixed and fully on-screen | {"x":8,"y":664,"width":344,"height":68} |
| ✅ Pass | Bottom nav touch targets ≥ 48px tall | 54,54,54,54,54 |
| ✅ Pass | Bottom nav still reachable after scrolling to the bottom |  |
| ✅ Pass | 12-bag modal scrolls internally and its Save button stays visible | {"scrollable":true,"saveBottom":728,"saveTop":665.40625,"vw":0} |
| ✅ Pass | Bag modal usable on phone (12 bags saved) |  |
| ✅ Pass | Expense modal Save button visible on phone |  |
| ✅ Pass | Escape closes the modal |  |
| ✅ Pass | No page errors on mobile |  |
| ✅ Pass | No horizontal overflow at 768px (tablet) | all screens fit |
| ✅ Pass | No horizontal overflow at 1440px (desktop) | all screens fit |

### Android app bridge (web side, with a simulated native shell)

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | CSV export is handed to the Android shell with the right name and content | fieldledger-brinjal-2026-10.csv TOTAL,94,3008,0,,45120,12000,0,0,29,14500,18620 |
| ✅ Pass | PNG export goes to the shell as image/png (saved to Gallery on the phone) | {"mime":"image/png","len":468884} |
| ✅ Pass | PDF uses the Android print dialog with the statement in print mode | {"name":"fieldledger-brinjal-2026-10","printing":true} |
| ✅ Pass | Print-finished event restores the normal screen |  |
| ✅ Pass | Status bar colour follows the product theme |  |
| ✅ Pass | More → App updates shows the installed version |  |
| ✅ Pass | “Check for updates” calls the shell and shows its status |  |
| ✅ Pass | Android back button closes an open sheet instead of leaving the screen |  |
| ✅ Pass | Back on a plain screen is passed to the shell (history back) |  |
| ✅ Pass | No page errors with the native shell |  |

### Published web link (claude.ai host simulated)

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Excel export uses the host downloads capability (fieldledger-brinjal-2026-10.xlsx) | {"filename":"fieldledger-brinjal-2026-10.xlsx","size":14889} |
| ✅ Pass | PDF button hidden where the print dialog is unavailable |  |
| ✅ Pass | Published variant renders with sample totals and no page errors |  |

### Android back button / browser history

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Back returns to the previous screen (Records) |  |

### 15. Console errors and dead controls

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Every visible button has a wired action |  |
| ✅ Pass | No native browser pop-ups used (all confirmations are in-app dialogs) | 0 |
| ✅ Pass | No uncaught errors / console errors during the whole run |  |

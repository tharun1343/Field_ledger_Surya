# FieldLedger: Acceptance Test Report

- **Build tested:** `index.html` v2.2.0, the claude.ai page variant, and a simulated Android shell.
- **How:** `npm test` (`tests/acceptance.js`) drives the real app in headless Chromium 141 (Playwright 1.56).
  - Sign-in and sync run against `tests/mock-supabase.js`, an in-memory stand-in for Supabase Auth + PostgREST. The real Supabase service was **not** used.
- **Result:** **98 / 98 automated checks passed** (run 2026-10-20).

## Not tested

- **The APK on a phone or emulator.** None was available here. Install, file saving, printing and in-app update still need checking on a real phone.
- **The APK structure was verified:** `aapt dump badging`, `apksigner verify`, `zipalign -c`, and the same signing certificate as 2.1.0.
- **A real Supabase project.** The SQL in `docs/SUPABASE_SETUP.md` was not run against Supabase from here.
- **Firefox and Safari.**

## All checks

### Sign-in screen and local mode

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | First launch shows the sign-in screen (Supabase setup step when not configured) |  |
| ✅ Pass | “Use without an account” opens the app on this device |  |
| ✅ Pass | Status dot is orange when online but not signed in | status-dot orange |
| ✅ Pass | Local-only choice is remembered after reload |  |

### Compact shell: product switch beside theme, no page title block

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Top bar order: product switch → theme → account | product-switch / icon-btn / account-chip |
| ✅ Pass | Text-size button removed from the top bar |  |
| ✅ Pass | Large page title / emblem block removed |  |
| ✅ Pass | Small brinjal SVG icon used instead of the eggplant emoji |  |
| ✅ Pass | Quick-actions duplicate card removed from the overview |  |

### Sample data reconciles with the source sheet

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Brinjal Oct 2026: 8 rows, 94 bags, 3,008 kg, ₹45,120, ₹12,000, ₹14,500 labour, 29 workers, net ₹18,620 | {"bags":94,"kg":3008,"net":18620} |
| ✅ Pass | Brinjal type is one value per day (sample: Local) |  |
| ✅ Pass | Muskmelon Oct 2026: 10,900 kg, ₹1,30,500 gross, ₹18,000 expenses, ₹0 labour, net ₹1,12,500 | {"records":6,"bags":0,"kg":10900,"wastage":0,"gross":130500,"expenses":18000,"men":0,"women":0,"legacyWorkers":0,"worker |
| ✅ Pass | Report TOTAL row shows ₹45,120 / ₹12,000 / ₹14,500 / ₹18,620 | TOTAL — 94 3,008 0 — ₹45,120 ₹12,000 0 0 29 ₹14,500 ₹18,620 |

### Settings: text size, default labour wages, brinjal types

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Text size options live in Settings |  |
| ✅ Pass | Default wages saved per business | {"brinjal":{"men":600,"women":450},"muskmelon":{"men":550,"women":420}} |

### Brinjal daily entry: date pill, typed bag count, one type for all bags

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Entry shows today’s date with a tap-to-change pill | Today · 20 Oct 2026 |
| ✅ Pass | Changing the date updates the pill | Thu · 15 Oct 2026 |
| ✅ Pass | Number of bags is a whole-number input, not a dropdown |  |
| ✅ Pass | Labour wages prefilled from Settings (₹600 / ₹450) |  |
| ✅ Pass | A fractional bag count is rejected |  |
| ✅ Pass | Typing 5 opens exactly 5 bag sections |  |
| ✅ Pass | Bag sections ask only weight and size (type is on the main form) |  |
| ✅ Pass | Sheet header total shows 160 kg |  |
| ✅ Pass | Form shows 160 kg and 5 bags |  |
| ✅ Pass | Reducing 5 → 3 asks first; declining keeps 5 bags |  |
| ✅ Pass | Reopening keeps the weights | 30,32,33,34,31 |
| ✅ Pass | “New type…” reveals a text field |  |
| ✅ Pass | Changed wage is marked “this entry only” |  |
| ✅ Pass | Labour = 5 × ₹700 + 5 × ₹450 = ₹5,750 | ₹5,750 |
| ✅ Pass | Expenses ₹150 + ₹250 = ₹400 |  |
| ✅ Pass | Gross 160 × ₹20 = ₹3,200; net = 3,200 − 400 − 5,750 = −₹2,950; wastage not priced | −₹2,950 |
| ✅ Pass | Saved: type “Green round”, 5 bags, 160 kg, wage ₹700 for this entry, wastage 4.5 | {"t":"Green round","mw":700} |
| ✅ Pass | New type added to Settings, most recent first | Green round,Local,Hybrid,Long,Round |
| ✅ Pass | Settings default wage unchanged by the per-entry edit (₹600) |  |
| ✅ Pass | Next entry offers “Green round” first and the default wage again |  |

### Brinjal types: remove keeps history

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Removing asks and mentions entries keep the label |  |
| ✅ Pass | Past entry still says “Green round” |  |
| ✅ Pass | Editing keeps it selected (shown as not in list) |  |
| ✅ Pass | Editing loads the entry’s own wage (₹700) |  |

### Muskmelon: labour, wastage, monthly-first overview

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Product theme switches to amber |  |
| ✅ Pass | Overview is month-first with a labour card |  |
| ✅ Pass | Muskmelon entry has labour section with Settings defaults (₹550 / ₹420) |  |
| ✅ Pass | Labour = 2 × ₹550 + 1 × ₹420 = ₹1,520 |  |
| ✅ Pass | Net = 12,000 − 0 − 1,520 = ₹10,480 | ₹10,480 |
| ✅ Pass | Month: 11,900 kg, 50 kg wastage, ₹1,42,500 gross, ₹1,520 labour, net ₹1,22,980 | {"records":7,"bags":0,"kg":11900,"wastage":50,"gross":142500,"expenses":18000,"men":2,"women":1,"legacyWorkers":0,"worke |
| ✅ Pass | Brinjal totals unaffected (₹48,320 gross) | 48320 |

### Exports

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Muskmelon CSV has labour columns and correct TOTAL | TOTAL,11900,50,,142500,18000,2,1,1520,122980 |
| ✅ Pass | XLSX opens with Statement + Expense items and numeric totals | ["TOTAL",11900,50,null,142500,18000,2,1,1520,122980] |
| ✅ Pass | PNG statement is a real image | {"fmt":"PNG","w":2432} |
| ✅ Pass | Brinjal CSV has Type column and TOTAL 99 bags / 3168 kg / ₹48,320 | TOTAL,,99,3168,4.5,,48320,12400,5,5,29,20250,15670 |
| ✅ Pass | PDF opens the print dialog in statement print mode |  |
| ✅ Pass | Printed PDF contains the statement and totals only |  |
| ✅ Pass | JSON backup has both products, wages and types |  |

### Backup import

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Malformed JSON rejected; nothing changed |  |
| ✅ Pass | Import asks first; cancelling changes nothing |  |
| ✅ Pass | Restore sample data resets to 8 + 6 records |  |
| ✅ Pass | Backup round-trips exactly |  |

### Theme and text size persistence

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Dark theme (top-bar toggle) and Large text (Settings) survive reload | {"theme":"dark","large":true} |

### Smooth transitions

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Tabs slide forward/back, product cross-fades, theme reveals (View Transitions) | forward,back,product,theme |
| ✅ Pass | No transition left running |  |

### Cloud sign-in and sync (mock Supabase)

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Bad project URL is rejected with a message |  |
| ✅ Pass | Wrong credentials show the server message |  |
| ✅ Pass | Create account signs in; status dot turns green when synced |  |
| ✅ Pass | Sample records are removed once an account is used |  |
| ✅ Pass | Entry uploaded to the account (row with user_id, product, data) | 1 |
| ✅ Pass | Second phone signs in and receives the entry |  |
| ✅ Pass | Edit on phone B reaches phone A after “Sync now” |  |
| ✅ Pass | Offline shows a red dot |  |
| ✅ Pass | Saving offline works and is queued | Offline · 2 changes waiting |
| ✅ Pass | Back online: queued entry uploads and the dot turns green |  |
| ✅ Pass | Delete on phone A removes the entry on phone B |  |
| ✅ Pass | Settings (wages, types) come with the account |  |
| ✅ Pass | Sign out returns to the sign-in screen and clears this phone’s copy |  |
| ✅ Pass | Password-reset link shows “Set a new password” and changes it |  |
| ✅ Pass | No errors on either phone |  |

### Migration from earlier versions

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Original prototype data upgrades with identical totals |  |
| ✅ Pass | Per-bag types become one type per day |  |
| ✅ Pass | v2.1 backups import: most common bag type kept; muskmelon gets zero labour |  |
| ✅ Pass | No page errors during migration |  |

### Phone layout (360px), tablet and desktop

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | No horizontal overflow at 360px on any screen | 14 screens fit |
| ✅ Pass | Product names fit in the top bar at 360px | [true,true] |
| ✅ Pass | Bottom navigation fixed and on-screen | {"x":8,"y":664,"width":344,"height":68} |
| ✅ Pass | 12-bag sheet scrolls and Save stays visible | {"scrollable":true,"bottom":728} |
| ✅ Pass | 12 bags saved on phone |  |
| ✅ Pass | No page errors on phone |  |
| ✅ Pass | No horizontal overflow at 768px (tablet) | all fit |
| ✅ Pass | No horizontal overflow at 1440px (desktop) | all fit |

### Android app bridge (simulated native shell)

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Exports are handed to the Android shell | fieldledger-brinjal-2026-10.csv |
| ✅ Pass | PDF uses the Android print dialog |  |
| ✅ Pass | Check for updates calls the shell |  |
| ✅ Pass | Android back closes an open sheet first |  |
| ✅ Pass | No page errors with the native shell |  |

### Published claude.ai page (host simulated)

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | No sign-in screen where the cloud cannot be reached |  |
| ✅ Pass | Exports use the host downloads capability; PDF hidden |  |
| ✅ Pass | No page errors on the published page |  |

### Console errors and controls

| Result | Check | Observed |
|---|---|---|
| ✅ Pass | Every visible button has a wired action |  |
| ✅ Pass | No native browser pop-ups used | 0 |
| ✅ Pass | No console errors during the main run |  |

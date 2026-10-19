# FieldLedger — Product & Technical Handoff

## 1. Product summary
FieldLedger is a mobile-first business ledger prototype for two product lines: **Brinjal / கத்திரிக்காய்** and **Muskmelon / முலாம்பழம்**. Users record date-wise weights/quantities, daily prices, expenses, and (for Brinjal) labour. They need reliable net calculations and date-wise monthly statements that can be downloaded or shared.

## 2. Files in this handoff
- `farm_business_ledger_prototype.html` — current standalone working prototype. Inspect this first.
- `FieldLedger_Agent_Master_Prompt.txt` — complete copy/paste prompt for Agent Mode.
- `FieldLedger_Product_Technical_Spec.md` — this handoff brief.
- `reference_original_tables.png` — screenshot of the two original tables used for sample data.
- `preview_mobile.png`, `preview_desktop.png`, `preview_bag_modal.png` — visual previews of the prototype.

## 3. Current implementation facts
- Single-file HTML with embedded CSS and vanilla JavaScript.
- Browser-side persistence via `localStorage`, key `fieldledger-prototype-v1`.
- Two separate datasets: `state.data.brinjal` and `state.data.muskmelon`.
- Settings currently include theme, text size, and `brinjalTypes`; profile details are stored separately.
- Brinjal rows use `bagDetails[]` with `weight`, `type`, `size`, and `expenseItems[]`.
- Muskmelon rows use kg/rate and expense line items.
- Built-in exports include CSV, XLSX, print/save-to-PDF, PNG statement and JSON backup/restore.
- No production API, database, authentication, remote sync, or app-store packaging exists yet.

## 4. Daily calculation rules
### Brinjal
- `bagCount = bagDetails.length`
- `totalKg = sum(bag.weightKg)`
- `grossSales = totalKg × ratePerKg`
- `expenseTotal = sum(expenseItem.amount)`
- `labourSalary = menCount × menDailyWage + womenCount × womenDailyWage`
- `netAfterCosts = grossSales − expenseTotal − labourSalary`

### Muskmelon
- `grossIncome = kg × ratePerKg`
- `expenseTotal = sum(expenseItem.amount)`
- `netAfterCosts = grossIncome − expenseTotal`

Format rupees with `₹` and Indian digit grouping (`en-IN`). Avoid rounding intermediate calculations unnecessarily; use consistent display/export rounding.

## 5. Core workflows
### Brinjal bag editor
Selecting N bags immediately opens a modal with exactly N bag sections. Each row has weight (kg), Brinjal type (editable in Settings), and size (S/M/L). Save updates the daily form draft; it does not save the daily record. The form can reopen the modal and view/edit the draft before final day save. Total weight updates from all rows.

### Expense editor
A modal supports multiple expense rows. Required fields: expense date (today by default), purpose, amount in INR; Notes are optional. “Add another expense” adds another row. Save returns to the daily form and updates its total. Values are editable before the full daily record save.

### Men/women labour
Count men and women independently, and input a wage per person for each group. Formula: `men × men's wage + women × women's wage`. Validation case: 5 × ₹500 + 5 × ₹400 = ₹4,500.

### Reports/export
Monthly reports should be product- and month-specific, sorted by date, with totals. Available prototype formats: CSV, XLSX, browser print/save-to-PDF and PNG, plus a whole-app JSON backup. Keep wording honest: PDF uses the browser print dialog; PNG share-to-gallery depends on mobile browser support.

## 6. Visual requirements
- Brinjal theme: violet/purple.
- Muskmelon theme: yellow/amber, with a recognizable muskmelon icon, not coconut.
- Desktop remains a web dashboard.
- Mobile becomes app-like with a bottom navigation bar and compact screen structure.
- Light/dark mode; Small/Medium/Large text size; tasteful animation and transitions; respect reduced-motion preference.
- Settings must not contain the old generic calculation-defaults panel. Brinjal type/category management belongs in Settings.

## 7. Data caveats
- Source table Brinjal provides only an aggregate number of labourers and total labour salary for prior daily rows, not a men/women split. Prototype sample rows currently assign the aggregate worker count to the men field for compatibility; this is only a demonstration mapping, not a fact about the historical workforce.
- Muskmelon source labels quantity × rate as “Profit”; this is actually gross income before expenses. Keep gross and net separate in the app.
- Original sheet totals: Brinjal = 94 bags, 3,008 kg, ₹45,120 gross, ₹12,000 expenses, 29 aggregate labourers, ₹14,500 labour salary. Muskmelon = 10,900 kg, ₹130,500 gross, ₹18,000 expenses, ₹112,500 net after expenses.
- Expense rows have their own dates. Agent must define and consistently implement how monthly reports aggregate expenses when an expense date differs from the parent daily record date.

## 8. Prototype limitations
- Data is only local to the current browser/device. No automatic multi-device transfer; use JSON backup/restore.
- Not an installed native Android application.
- No login or multi-user roles.
- No cloud database or server backups.
- Production deployment architecture is an open decision; inspect and recommend before replacing the simple prototype stack.

## 9. Minimum acceptance test checklist
- [ ] Selecting 5 bags creates exactly 5 bag rows.
- [ ] Weights 30, 32, 33, 34, 31 sum to 160 kg.
- [ ] Settings-created brinjal type appears in the bag dropdown.
- [ ] Bag drafts persist when the modal is reopened and after editing a saved record.
- [ ] Two expense rows ₹150 and ₹250 total ₹400.
- [ ] 5 men × ₹500 + 5 women × ₹400 = ₹4,500.
- [ ] Brinjal net and Muskmelon net match their formulas.
- [ ] Product switching isolates data and theme.
- [ ] Monthly report rows and totals reconcile against source data.
- [ ] All export/import paths work or have a clearly documented limitation.
- [ ] A 360px mobile viewport has no horizontal page overflow.
- [ ] No uncaught browser-console errors.

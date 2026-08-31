# Next session brief — Reports UI: responsive pass + filter redesign

Hand this file to the next Arena coding session. Everything below was verified
against the code as merged on `main` (merge commit `0983713`, PR #25) and
against the live preview DOM, not assumed.

> **Re-verified 2026-08-31.** The previous session's local commit `3cde6fb`
> did **not** survive into the fresh checkout (session workspaces do not carry
> un-pushed local commits between sessions), and neither did
> `docs/design/reports-responsive-mockup.png` or
> `/home/user/preview-mock-api.mjs`. This file was reconstructed from the
> handoff paste and every claim re-checked against `main@0983713` — all five
> defects confirmed. Deltas found during re-verification are marked
> **[re-verified]** inline: the media-query count in §1.4 is corrected, the
> mock-API path in §4 now points at a file committed to the repo, and the
> mockup's absence is replaced by a written layout spec in §1.3.

---

## 1. Confirmed defects

### 1.1 Two tabs read identically in Khmer (real bug)

`apps/admin/src/locales/km.json`:

| key              | en        | km              |
| ---------------- | --------- | --------------- |
| `reports.waste`  | Waste     | `ការខាតបង់`     |
| `reports.losses` | Losses    | `ការខាតបង់`     |

The tab strip therefore renders `ការខាតបង់` twice and a Khmer-speaking owner
cannot tell the spoilage tab from the money-lost tab. Waste is physical
spoilage; Losses is the financial rollup (waste + discounts + voids + refunds +
cash shortages). Give them distinct Khmer wording, and sweep the rest of
`reports.*` for other collisions while there.

**[re-verified] Full duplicate-value sweep of `reports.*` (both languages):**

- km: `waste` = `losses` = `ការខាតបង់` — **the tab-label bug.**
- km: `ordersCol` = `ordersShort` = `ការបញ្ជាទិញ` — column header vs. short
  KPI word; consider distinct wording.
- km: `detailTitle` = `ordersInPeriod` = `ការបញ្ជាទិញក្នុងអំឡុងពេលនេះ` —
  detail-table heading vs. export-meta title; same string, low risk but worth
  splitting while in there.
- en: only intentional column-variant pairs (`discounts`/`discountsCol`,
  `refunds`/`refundsCol`, `voids`/`voidsCol`, `detailTitle`/`ordersInPeriod`).
  No tab-label collisions in English.
- km `wasteTrend` (`និន្នាការថ្លៃខាតបង់`), `wasteRecords`
  (`កំណត់ត្រាការខាតបង់`) and `wasteCost` (`តម្លៃការខាតបង់`) are distinct
  strings — only the bare tab labels collide.

### 1.2 Filters survive a date-range change and silently empty the table

`apps/admin/src/components/ReportDetailTable.tsx` resets sort/filters/search
only when `title` changes; the `[from, to, query, selected, pageSize]` effect
resets the **page** only. So picking a new preset keeps the old column filters,
and the table can render zero rows under the generic message
`reports.noTransactions` ("No orders in this period") — which is a lie, there
are orders, they just do not match a filter the admin has forgotten about.
That is exactly what the pasted DOM shows: the empty state is rendered while
`.report-detail-clear` is also rendered (that button only exists when a filter
is active).

Fix as a UX problem, not by nuking state: keep the filters, but make the empty
state filter-aware — "No records match these filters" plus a **Clear filters**
action and the unfiltered count ("84 records in this period").

### 1.3 The filter row is visually messy

`.report-detail-filters` is a `flex-wrap` row of a search box plus four pill
`<label><span>label</span><select></label>` controls. With Khmer labels the
pills are wide, wrap onto two ragged lines, and the native select arrow sits
inside a rounded chip that was never designed to hold it. The owner called this
out directly.

**Target design (written spec — the original mockup image was not preserved
across sessions):**

- Keep the inline search on the left.
- Replace the four always-visible pills with **one outlined `Filters (n)`
  button** that opens a dropdown/popover panel containing the labelled
  selects, plus `Clear all`.
- Show applied filters as **removable chips** next to the button
  (`Payment: KHQR ×`), which is also what the export dialog already lists.
- Native `<select>` stays inside the panel (accessible, no custom listbox
  needed) but gets a proper field style, not a pill.
- On mobile the dropdown becomes a **bottom sheet** with an **Apply** button
  (see §2.4), and the record table becomes stacked cards.

**[re-verified] Locale keys already available:** `common.filters` exists in
both files ("Filters" / `តម្រង`, line 232); `common.clear`, `common.all`,
`common.export`, `common.cancel` also exist. New keys needed:
`reports.clearFilters` ("Clear all"), `reports.noRecordsMatch`
("No records match these filters" + clear action), `reports.unfilteredCount`
("{count} records in this period"), `reports.apply` ("Apply"), and a
`reports.filtersCount` ("Filters ({count})") if the count is to be localized.

### 1.4 No responsive rules for anything added in the overhaul

**[re-verified — precise inventory]**. In the overhaul block
(`apps/admin/src/index.css` lines ~6665–6934) there are exactly **two**
media-query rules, both at `max-width: 820px`:

- `.table-pagination` (justify-content) + `.report-detail-table .detail-items`
  (max-width 180px) — line ~6770
- `.export-preview-choices` (column) + `.report-detail-filter select`
  (max-width 120px) — line ~6921

Older rules touching the reports header exist at 560px/680px/900px
(`.reports-header` stacks at 560px, toolbar-actions scroll at 680px,
`.report-export-actions` wraps at 900px), but there is nothing at all below
560px and nothing for `.report-detail-panel`, `.report-detail-filters`,
`.report-detail-table` or `.export-preview-table`. Consequences:

- 9 columns with `white-space: nowrap` ⇒ the record table is a horizontal
  scroller on tablets and unusable on phones.
- The export review dialog (`modal-large`, 900px, 320px-tall inner table)
  nests two scroll areas on a phone.
- `.reports-header` puts 7 tabs + 6 presets + 2 date inputs + 2 export buttons
  on one line; only `.report-export-actions` wraps, at 900px.

### 1.5 Redundant export buttons in the toolbar

Toolbar has both **Word** and **Excel**, but the review dialog it opens already
has a Word/Excel/CSV chooser. Collapse to a single **Export** button; format
belongs in the dialog. (`ExportRequest.defaultFormat` can then be dropped or
kept defaulting to Word.)

---

## 2. What to build

1. **Locale fix** — distinct Khmer for `reports.waste` vs `reports.losses`
   (and their titles), audit `reports.*` for other duplicate Khmer strings
   (full dup list in §1.1).
2. **Filter dropdown** — `Filters (n)` button + popover + removable chips, in
   `ReportDetailTable`. Close on outside click and `Escape`; the trigger must
   keep an accessible name and `aria-expanded`. See layout spec in §1.3.
3. **Filter-aware empty state** — distinguish "nothing in this period" from
   "nothing matches these filters", with a Clear action.
4. **Responsive pass**, mobile-first, three breakpoints:
   - `≥1024px` — as today, plus a sticky first column while scrolling.
   - `640–1024px` — condensed cell padding, secondary columns
     (Customer/cashier, Items detail line) hidden behind the row, filters
     popover full width.
   - `≤640px` — the record table becomes a **stacked card list** (one card per
     record: id + date header, label/value pairs, status pill, bold total),
     the filter popover becomes a bottom sheet with an Apply button, and the
     export dialog goes full-screen with the preview as the same card list.
   - Toolbar: tabs become a horizontally scrollable strip (no wrap), presets
     stay a segmented control that scrolls, the two date inputs collapse into
     one range chip/popover under 640px.
5. **Single Export button** in the toolbar.
6. Re-check the other Reports panels at small widths while in there:
   `.report-tab-table--2col/--3col/--4col` (line ~3672),
   `.accountability-head`/`.variance-row` (~3715/3718),
   `.report-library-grid` (~4051), `.report-kpi-row`, `.report-chart-card`.

Do **not** change what the exports contain — that part is verified and shipped
(`e2e/exports-verify/verify.mjs` asserts on the real files; keep it green).

**CSS line map** (all in `apps/admin/src/index.css`): `.reports-header` 3569,
`.report-presets` 3579, `.report-tabs` 3628, `.modal-large` 1535,
`.report-detail-panel` 6665, `.report-detail-table` 6678, `.table-pagination`
6734, `.report-detail-filters` 6781, `.report-detail-filter` 6794,
`.report-detail-clear` 6821, `.export-preview-*` 6826–6934.

---

## 3. Acceptance criteria

- No two Reports tabs render the same string in Khmer or English.
- Applying a filter, then switching preset, never shows "No orders in this
  period"; it shows the filter-aware empty state with a working Clear.
- At 390px wide, the record table shows no horizontal scrollbar and every
  record is fully readable; the export dialog is usable without pinch-zoom.
- At 1440px the layout is unchanged apart from the new filter control and the
  single Export button.
- `npm run typecheck`, `format:check`, `test:unit`, `test:locale`,
  `test:jsdom`, `test:ui` (which includes `test:ui:reports` and `test:exports`)
  all pass. `e2e/ui-audit/verify-report-detail.mjs` currently drives
  `.report-detail-filter select`, the `Review & export` button,
  `.export-preview-formats` and `.report-detail-clear`; update it in the same
  commit and add checks for the new dropdown, the chips and the filter-aware
  empty state.
- Prettier warns on many pre-existing `e2e/**` and `backend/**` files; only
  format the files you touch.

---

## 4. Environment notes (save time)

- **Preview**: `node e2e/ui-audit/preview-mock-api.mjs` — a zero-dep mock API
  now **committed to the repo** (the old `/home/user/preview-mock-api.mjs`
  was a workspace-only file and did not survive; do not rely on it). It binds
  `0.0.0.0:8080` and serves branding, 84 orders spread across the current
  year, waste events, and every other endpoint the admin app fetches.
  Then `npm run dev:admin` (Vite on `0.0.0.0:4173`, `allowedHosts: true`,
  proxies `/api` and `/healthz` to `127.0.0.1:8080` — verified in
  `apps/admin/vite.config.ts`). `npm run dev:sale` runs on 4174.
- **Playwright browsers cannot be downloaded in this sandbox** (`ECONNRESET`),
  so screenshots are impossible — verify with the jsdom harnesses and ask the
  owner to eyeball the preview. Do not burn time retrying the install.
- **No PHP runtime** — backend changes cannot be linted or tested locally.

---

## 5. Prompt to paste into the new session

> Read `docs/NEXT-SESSION-REPORTS-UI.md` and do everything in sections 2 and 3.
> Priority order: (1) the duplicate Khmer tab labels, (2) the filter dropdown +
> removable chips + filter-aware empty state, (3) the full responsive pass down
> to 390px including the stacked-card record table and the export dialog, (4)
> collapse the toolbar Word/Excel buttons into one Export button. Update
> `e2e/ui-audit/verify-report-detail.mjs` alongside, keep every existing test
> green, and confirm what shipped with a direct `git diff` against `main`.

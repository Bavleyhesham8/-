# Access-to-Web Coverage Register

## Coverage commitment

The supplied Access file is the source of truth for scope. The web migration must
account for every source table and field, form, report, saved query, lookup,
relationship, and workflow. No Access object is silently discarded. Each object
must be implemented, replaced by an equivalent, or explicitly marked as deferred
or obsolete with the reason and an approval decision.

The user selected exact Access table and column names for the PostgreSQL legacy
data tables. Keep original spellings, spaces, Arabic names, and apparent typos,
including the distinct tables `الفئة` and `الفئه`. New authentication,
authorization, audit, and web-only workflow tables may use descriptive
application names and must be identified as additions, not replacements.

This is a metadata-only inventory. No Access resident, staff, inventory, medical,
invoice, or other operational records were read or imported.

## Source inventory and current gap

| Access object | Count | Web coverage |
|---|---:|---|
| Application data tables | 32 | Partial; exact source names/fields are implemented for selected resident-schema, canteen, invoice, refrigerator, meat-sale, staff, leave, warehouse, custody, and lookup work |
| Forms | 42 | Some resident, inventory, canteen, meat-sale, staff, and lookup screens exist; full object-by-object mapping remains |
| Reports | 40 | Sprints 9-11 add three web report workflows as candidate equivalents for 11 named reports; exact Access output reconciliation and the other 29 reports remain |
| Saved query definitions | 120 | Two named queries (`Q_Report`, `Query1`); some `~sq_` query SQL was inspected, but all 118 generated definitions still need tracing to parent forms/reports |
| Declared application relationships | 12 | Identified below; Access metadata does not enable referential integrity on these relations |

The current PostgreSQL schema defines 57 tables, including Better Auth,
resident/stay and inventory functionality, exact-name Access source tables for
selected sprints, and web-only workflow/audit tables, including staff attendance
and an actor-attributed audit log. This is not yet a complete
32-table representation of the Access schema. Existing web names such as
`residents` and `inventory_items` are not evidence that identically named
Access fields were covered.

### Privacy and storage constraints

- **Confirmed display/search decision:** the user explicitly allows resident
  church, confessor, and priest fields to be displayed and searched. Access is
  limited to administrators and staff with the existing resident-edit
  permission and the residents screen. View-only accounts do not gain access
  to these fields. The same guard is applied to both resident DTOs and church
  lookup DTOs; users with only the lookups screen do not receive resident rows.
- Resident birth dates are administrator-only, including stay-report responses.
- **Decision recorded 2026-11-10:** import all source tables and columns,
  including sensitive `nam` and treatment data, to the approved `import-test`
  branch. Keep the existing least-privilege screen DTOs: sensitive resident
  fields not needed for a screen are administrator-only; national ID, health,
  treatment, recovery, and image content must not leak to non-admin screens.
  Import `ImagePath` as text only; do not copy image files.
- Reference-list creation, editing, and deletion are administrator-only.
  Deleting a villa is blocked while any current or historical stay references
  it.
- The user confirmed privacy/hosting approval for staff-profile fields in
  Sprint 7; staff profile access remains administrator-editable and
  employee-self-view only. No Access records have been imported.
- Access login password values must never be copied as plaintext. Replace the
  old login workflow with Better Auth; staff accounts must be reset/created
  through the secure account workflow.
- Never import the legacy program-login CSV or its plaintext passwords.
- Storage/hosting approval for Neon was confirmed on 2026-11-09. This approval
  is limited to the configured `import-test` branch for the staged import
  rehearsal; no production branch or deployment is authorized.

## Import staging decisions (2026-11-10)

- Preserve all source columns and sensitive data in the database; expose
  sensitive resident data only to administrators unless an existing explicit
  server-side permission grants the necessary access. Do not weaken existing
  DTO redaction or screen guards.
- For warehouse header IDs 73–80, create catalog entries using the exact CSV
  item text and generated IDs beginning at `MAX(ID) + 1`; do not overwrite
  existing catalog rows. If an item cannot satisfy the unique catalog link,
  quarantine that row with a reason.
- Custody name matching uses normalization followed by exact equality only.
  Save source-ID-to-target-ID mappings in ignored `mappings/custody.json`;
  quarantine unmatched or ambiguous rows. Do not use fuzzy or guessed matches.
- Refrigerator receipt rows with missing dates may be stored only when marked
  `needs_review`; never derive an unverified date during import.
- **Decision recorded 2026-11-10:** allow duplicate refrigerator catalog names
  by dropping `refrigerator_item_catalog_name_unique`; preserve source IDs and
  the unique catalog link per refrigerator header. This enables importing
  catalog IDs 10–16, dependent headers 8–14, and review-marked movement ID 17.
- Warehouse rows with both incoming and outgoing quantities are imported as
  `receipt` placeholders with `needs_review = true`; all balance calculations
  must ignore review rows.
- Rows missing required values or foreign keys are preserved in
  `import_quarantine` with a reason, without fabricated values. Exclude the
  refrigerator detail ID 4 and meat-sale detail IDs 5, 10, 16, 17, and 26 from
  their target tables until reviewed.
- Every import group is dry-run by default, idempotent, and committed in its
  own transaction. After each group, verify row accounting, foreign keys,
  sequences, replacement characters, date ranges, and integer precision using
  counts and IDs only.
- Migration and import scripts must connect to `import-test` only. Print the
  database hostname without credentials before every database write. No
  deployment or commit is authorized.

## Schema verification on import-test (2026-11-10)

- Applied migrations through `0019_tough_morlocks`; the database migration
  history contains 20 entries, including `0016_special_richard_fisk`.
- Compared the Drizzle schema snapshot with PostgreSQL metadata: 57/57 tables,
  472/472 columns, 6/6 enums, 38/38 expected checks, and 89/89 foreign keys
  matched. No table/column, type, or nullability differences remain.
- Added indexes to cover all 89 foreign keys. All 100 declared indexes are
  present, and no foreign-key child column lacks an index.
- Corrected 12 nullable columns to match the declared `NOT NULL` schema after
  confirming the affected tables contained no rows. This changed no records.
- `drizzle-kit check`, tests, lint, and production build passed. No source
  records were imported, and no deployment or commit was performed.

### Phase A schema re-verification (2026-11-10)

- Applied migrations through `0021_curved_sumo`; the migration history contains
  22 entries and no migration is pending.
- Re-compared the `0021` Drizzle snapshot with PostgreSQL metadata: 57/57
  tables, 472/472 columns, 89/89 foreign keys (0 missing/extra, 0 action
  mismatches), 99/99 declared indexes (0 missing/extra, 0 column/unique
  mismatches), 15/15 unique constraints, 38/38 checks, and 6/6 enums matched.
- All 89 foreign keys are covered by an index whose leading columns match the
  foreign-key columns.
- `drizzle-kit check` and `drizzle-kit migrate` passed; no pending migrations
  remain.

## Access tables and every field

Types below are the Access ODBC metadata types. `ID` fields are listed as found,
regardless of whether Access declared them as a primary key.

| Access table | Fields (source name: type) |
|---|---|
| `nam` | `ID`: Integer; `num`: Text; `nam`: Text; `Dat_Brth`: DateTime; `Adrres`: Text; `tal`: Text; `num_A`: Text; `Con`: Text; `mar`: Text; `Dat_Ent`: DateTime; `sak`: Text; `khn`: Boolean; `no_A`: Boolean; `Mot`: Boolean; `Alt`: Text; `ALF`: Text; `N-AL`: Text; `Dat_AO`: DateTime; `ALm`: Text; `Phot`: Text; `Num_ROm`: Text; `Mon`: Text; `ImagePath`: Text; `mmon`: Text; `F_N`: Text; `Nom`: Text; `Achesh`: Text; `Fathr`: Text; `المؤهل الدراسى`: Text; `الخبرات السابقة`: Text; `اماكن العمل السابقة`: Text; `دخول النزيل`: Text; `صلة القرابة`: Text; `من االدرجة`: Text; `ساعة الدخول`: Text; `طريقة الخروج`: Text; `رقم الطبيب المعالج`: Text; `عنوان الطبيب المعالج`: Text; `فريق التأهل والارشاد`: Text; `مرحلة التأهيل والتعافى`: Text; `المدرب`: Text; `المشرف`: Text; `المحاضر`: Text |
| `اطراف الثلاجة` | `ID`: Integer; `الصنف / الفئة`: Text; `الكمية`: Double; `السعر`: Double; `الاجمالى`: Double; `المنصرف`: Double; `تاريخ الصرف`: DateTime; `رقم اذن الصرف`: Double; `جهة الصرف`: Text; `رقم الصنف`: Integer |
| `اطراف العلاج` | `ID`: Integer; `اسم الدواء`: Text; `المبلغ`: Double; `الكمية`: Double; `الخصم`: Double; `التاريخ`: DateTime; `الاجمالى`: Double; `رقم`: Integer |
| `اطراف الفاتورة` | `ID`: Integer; `الرصيد`: Integer; `الفئه`: Text; `الفئة`: Integer; `الصنف`: Text; `السعر`: Text; `الكمية`: Text; `الاجمالى`: Integer; `التاريخ`: DateTime; `اليوم`: Text; `الشهر`: Text; `رقم`: Integer |
| `اطراف الكانتين` | `ID`: Integer; `اسم الصنف`: Text; `الرصيد`: Double; `الوارد`: Double; `تاريخ`: DateTime; `المنصرف`: Double; `تاريخ المنصرف`: DateTime; `رقم الصنف`: Integer |
| `اطراف المخزن` | `ID`: Integer; `الرصيد`: Double; `الوارد`: Double; `تاريخ الوارد`: DateTime; `المنصرف`: Double; `تاريخ الصرف`: DateTime; `المتبقى`: Double; `حذف`: Boolean; `رقم`: Integer |
| `اطراف الموظفين` | `ID`: Integer; `تاريخ النزول`: DateTime; `تاريخ العودة`: DateTime; `نوع الاجازة`: Text; `ملاحظات`: Text; `رقم`: Integer |
| `اطراف النزيل` | `ID`: Integer; `المبلغ`: Double; `التاريخ`: DateTime; `تاريخ العودة`: DateTime; `رقم`: Integer |
| `اطراف فواتير البيع` | `ID`: Integer; `الصنف / الفئة`: Text; `السعر`: Double; `الكمية`: Double; `الاجمالى`: Double; `تاريخ البيع`: DateTime; `رقم`: Integer |
| `الاصناف` | `ID`: Integer; `الاصناف`: Text |
| `الاصناف / الفئة` | `ID`: Integer; `الصنف / الفئة`: Text; `السعر`: Double; `الكمية`: Double |
| `الدخول للبرنامج` | `ID`: Integer; `الاسم الاول`: Text; `الاسم الثالث`: Text; `الرقم السرى`: Text; `الاوذنات`: Text; `مسار الصورة`: Text; `تاريخ التسجيل`: DateTime |
| `العهدة` | `ID`: Integer; `الاصناف / الفئة`: Text; `الكمية`: Double; `السعر`: Double; `الإجمالى`: Double; `التاريخ`: DateTime; `رقم`: Integer |
| `الفئة` | `ID`: Integer; `الفئة`: Text |
| `الفئه` | `ID`: Integer; `الفئة`: Text |
| `الكنيسة التابع لها` | `ID`: Integer; `num`: Text; `nam`: Text; `Achesh`: Text; `Fathr`: Text |
| `المحافظة` | `ID`: Integer; `Cont`: Text; `Cet`: Text |
| `الموظفين` | `ID`: Integer; `اسم الموظف / العامل`: Text; `رقم الموظف`: Integer |
| `اليوم` | `ID`: Integer; `اليوم`: Text |
| `تحديث البيانات` | `ID1`: Integer; `ID`: Text; `الاسم الاول`: Text; `الاسم الثالث`: Text; `الرقم القومى`: Text; `العنوان`: Text; `المحافظة`: Text; `المركز / الحى`: Text; `تاريخ الميلاد`: DateTime; `الحالة الاجتماعية`: Text; `الموهل الدراسى`: Text; `تاريخ الالتحاق بالعمل`: DateTime; `الموبايل`: Text; `الكنيسة التابع لها`: Text; `أب الاعتراف`: Text; `رقم اب الاعتراف`: Text; `الطائفة`: Text; `اماكن العمل السابقة`: Text; `برامج الكمبيوتر`: Text; `تخصص العمل`: Text; `مكتب التوظيف`: Text; `صورة`: Text; `ملاحظات`: Text; `ImagePath`: Text |
| `راس الثلاجة` | `ID`: Integer; `رقم الصنف`: Integer; `رقم سند الصرف`: Double; `اسم المستفيد`: Text; `الصنف / الفئة`: Text |
| `راس العلاج` | `ID`: Integer; `رقم النزيل`: Integer; `اسم النزيل`: Text |
| `راس العهدة` | `ID`: Integer; `رقم العهدة`: Integer; `التاريخ`: DateTime; `العهدة`: Text |
| `راس الفاتورة` | `ID`: Integer; `رقم الفاتورة`: Integer; `تاريخ الفاتورة`: DateTime; `اسم النزيل`: Integer |
| `راس الكانتين` | `ID`: Integer; `رقم الصنف`: Integer; `المستلم`: Text; `الصنف / الفئة`: Text |
| `راس المخزن` | `ID`: Integer; `رقم`: Integer; `الصنف`: Text; `السعر`: Double; `المسئول`: Text |
| `راس النزيل` | `ID`: Integer; `رقم النزيل`: Integer; `اسم النزيل`: Text |
| `رقم الفيلا` | `ID`: Integer; `N_V`: Text |
| `طرف الكانين` | `ID1`: Integer; `الرصيد`: Double; `الوارد`: Double; `تاريخ الوارد`: DateTime; `المنصرف`: Double; `تاريخ المنصرف`: DateTime; `رقم`: Integer |
| `فواتير بيع اللحوم` | `ID`: Integer; `رقم الفاتورة`: Integer; `تاريخ البيع`: DateTime; `رقم اذن الصرف`: Double; `اسم المستفيد`: Text |
| `كانتين` | `ID`: Integer; `اسم الصنف`: Text; `رقم الصنف`: Integer |
| `مشتريات النزلاء` | `ID`: Integer; `الصنف`: Text; `السعر`: Double; `اضافة`: Boolean |

### Table-by-table implementation status

The inventory above records every Access table and field. This separate
implementation matrix prevents inventory from being mistaken for completed web
functionality. “Implemented” means the web schema preserves the listed source
fields and a workflow exists; it does not mean Access records have been imported
or reports/forms have all been reproduced.
At Sprint 16, 28 of the 32 source tables have implemented web workflows; two
remain partially mapped and two treatment tables are deferred below.

| Access table | Status | Notes |
|---|---|---|
| `nam` | Partial | Exact 43-field Access schema and UUID bridge are present; current resident screens do not synchronize to it and sensitive fields remain out of screens/imports. |
| `اطراف الثلاجة` | Implemented | Refrigerator receipt/issue ledger and meat-sales linkage; report forms remain. |
| `اطراف العلاج` | Deferred | Medical/treatment workflow is blocked pending a separate approved privacy and access design. |
| `اطراف الفاتورة` | Implemented | Invoice lines, balances, category/date fields, payments, and void workflow; Sprint 9 adds date/category detail and daily/monthly reports. |
| `اطراف الكانتين` | Implemented | Canteen stock ledger and item links; report equivalents remain. |
| `اطراف المخزن` | Implemented | Exact Access fields store the warehouse movement ledger; receipts, custody issues, returns, and void restorations are recorded transactionally. |
| `اطراف الموظفين` | Implemented | Administrator-entered approved leave with exact source fields and employee relation. |
| `اطراف النزيل` | Implemented | Administrator-only resident receipts use the exact source fields, allow multiple positive entries, and preserve reasoned void history. |
| `اطراف فواتير البيع` | Implemented | Meat-sale details and refrigerator stock links; report equivalents remain. |
| `الاصناف` | Implemented | Exact catalog fields and Access primary key are used for administrator-managed warehouse items. |
| `الاصناف / الفئة` | Implemented | Refrigerator item catalog; catalog quantity remains metadata, not on-hand stock. |
| `الدخول للبرنامج` | Replaced, partial mapping | Better Auth replaces login/passwords. Legacy authorization and profile metadata are not copied as-is; see Sprint 7 notes. |
| `العهدة` | Implemented | Exact detail fields store catalog-linked custody items, quantities, issue prices, calculated totals, dates, and custody number. Web-only fields link stock items and track current holders. |
| `الفئة` | Implemented | Invoice category lookup is present; remaining source lookup/report use is pending. |
| `الفئه` | Implemented | Sprint 14 adds its separate exact-name lookup and admin-managed invoice choices; kept distinct from `الفئة`. |
| `الكنيسة التابع لها` | Implemented | Sprint 14 adds all source fields and admin-managed choices; staff profiles store the selected `nam` text. |
| `المحافظة` | Implemented | Sprint 14 adds all source fields and admin-managed choices; `Cont`/`Cet` map to staff profile governorate/district text. |
| `الموظفين` | Implemented | Exact employee ID, name, and primary employee number fields; linked manually to account/profile. |
| `اليوم` | Implemented | Sprint 14 adds exact fields and admin-managed lookup screens; invoice day remains derived from its date as requested. |
| `تحديث البيانات` | Implemented | All 24 source fields; administrator edits and linked employee self-view. |
| `راس الثلاجة` | Implemented | Refrigerator product/voucher header and catalog link; key behavior documented in Sprint 6. |
| `راس العلاج` | Deferred | Medical/treatment workflow is blocked pending a separate approved privacy and access design. |
| `راس العهدة` | Implemented | Exact header fields and Access primary key store the issue date and original employee recipient; web-only employee and void-audit fields support secure workflows. |
| `راس الفاتورة` | Implemented | Invoice headers with resident linking; resident key reconciliation remains outstanding. |
| `راس الكانتين` | Implemented | Canteen issue vouchers and recipient/header tracking. |
| `راس المخزن` | Implemented | Exact header fields and Access primary key identify each catalog-linked warehouse item and its current reference price. |
| `راس النزيل` | Implemented | Administrator-created standalone resident headers use the exact source fields and manually entered resident number; no UUID resident or `nam` synchronization occurs. |
| `رقم الفيلا` | Implemented | Administrators manage unique `N_V` values; new or changed stay villa values use this lookup, while unchanged historical text remains intact. |
| `طرف الكانين` | Implemented | Exact canteen receipt/issue detail fields are used in the stock workflow. |
| `فواتير بيع اللحوم` | Implemented | Meat-sale invoice, full payment, stock deduction, and audited void/refund workflow. |
| `كانتين` | Implemented | Exact canteen item catalog and item-number key are used. |
| `مشتريات النزلاء` | Implemented | Purchase catalog including `اضافة`; its business meaning remains intentionally unassigned. |

## Declared Access relationships and keys

The relations below are present in Access metadata. Access reports referential
integrity as disabled for these relations; the web implementation must validate
references and preserve history explicitly rather than assuming Access enforced
these rules.

| Parent field | Child field |
|---|---|
| `nam.ID` | `راس الفاتورة.اسم النزيل` |
| `الفئة.ID` | `اطراف الفاتورة.الفئة` |
| `الموظفين.رقم الموظف` | `اطراف الموظفين.رقم` |
| `راس الثلاجة.رقم الصنف` | `اطراف الثلاجة.رقم الصنف` |
| `راس العلاج.رقم النزيل` | `اطراف العلاج.رقم` |
| `راس العهدة.رقم العهدة` | `العهدة.رقم` |
| `راس الفاتورة.رقم الفاتورة` | `اطراف الفاتورة.رقم` |
| `راس الكانتين.رقم الصنف` | `اطراف الكانتين.رقم الصنف` |
| `راس المخزن.رقم` | `اطراف المخزن.رقم` |
| `راس النزيل.رقم النزيل` | `اطراف النزيل.رقم` |
| `فواتير بيع اللحوم.رقم الفاتورة` | `اطراف فواتير البيع.رقم` |
| `كانتين.رقم الصنف` | `طرف الكانين.رقم` |

Access declares these primary keys (the remaining source tables have no
declared primary key):

| Table | Access primary key |
|---|---|
| `nam` | `ID` |
| `اطراف الثلاجة` | `ID` |
| `اطراف العلاج` | `ID` |
| `اطراف الفاتورة` | `ID` |
| `اطراف الكانتين` | `ID` |
| `اطراف المخزن` | `ID` |
| `اطراف فواتير البيع` | `ID` |
| `الاصناف` | `ID` |
| `الاصناف / الفئة` | `ID` |
| `الدخول للبرنامج` | `ID` |
| `الفئة` | `ID` |
| `الفئه` | `ID` |
| `الكنيسة التابع لها` | `ID` |
| `المحافظة` | `ID` |
| `الموظفين` | `رقم الموظف` |
| `اليوم` | `ID` |
| `تحديث البيانات` | `ID1` |
| `راس الثلاجة` | `رقم الصنف` |
| `راس العلاج` | `رقم النزيل` |
| `راس العهدة` | `رقم العهدة` |
| `راس الفاتورة` | `رقم الفاتورة` |
| `راس المخزن` | `رقم` |
| `راس النزيل` | `رقم النزيل` |
| `رقم الفيلا` | `ID` |
| `فواتير بيع اللحوم` | `رقم الفاتورة` |
| `كانتين` | `رقم الصنف` |
| `مشتريات النزلاء` | `ID` |

## Forms (42)

`اسماء النزلاء`; `اطراف الثلاجة Subform`; `اطراف العلاج Subform`;
`اطراف الفاتورة`; `اطراف الكانتين Subform`; `اطراف الكانتين Subform1`;
`اطراف المخزن`; `اطراف الموظفين Subform`; `اطراف النزيل Subform`;
`اطراف فواتير البيع Subform`; `الاسماء`; `الدخول`; `الدخول للبرنامج`;
`الرقم السرى`; `الشاشة الرئيسية`; `العناوين`; `العهدة Subform`;
`الكنيسة التابع لها`; `المبيعات`; `المحافظة`; `الموظفين`; `بحث`;
`بحث المبيعات`; `بحث النزلاء`; `بحث بين تاريخين`; `تحديث البيانات`;
`تحديث البيانات1`; `راس الثلاجة`; `راس العلاج`; `راس العهدة`; `راس الفاتورة`;
`راس الكانتين`; `راس الكانتين1`; `راس المخزن`; `راس النزيل`; `رقم الفيلا`;
`سن النزيل`; `طرف الكانين Subform`; `فترة النزلاء`; `فواتير بيع اللحوم`;
`كانتين`; `مشتريات النزلاء`.

## Reports (40)

`nam`; `اطراف الثلاجة`; `اطراف الثلاجة1`; `اطراف الثلاجة2`;
`اطراف الثلاجة3`; `اطراف الثلاجة4`; `اطراف الفاتورة`; `اطراف الفاتورة1`;
`اطراف الكانتين`; `اطراف الكانتين1`; `التشحيص`; `العهدة`; `العهدة1`;
`الفئة والشهر`; `الفئةوالتاريخ`; `المحافظة`; `اليوم والشهر`; `تحديث البيانات`;
`حساب اليومية`; `خريج - عدم استكمال`; `راس الثلاجة`; `راس العلاج`;
`راس العهدة`; `راس الفاتورة`; `راس الفاتورة1`; `راس الفاتورة2`;
`راس الكانتين`; `راس الكانتين1`; `راس المخزن`; `راس المخزن1`;
`راس المخزن2`; `راس المخزن3`; `راس المخزن4`; `راس المخزن5`;
`رقم الفيلا والغرفة`; `سحب الايام`; `سكن النزلاء - فيلا - غرفة`;
`فواتير بيع اللحوم`; `فواتير بيع اللحوم2`; `مسكن النزلاء`.

Sprints 9-11 add candidate web equivalents for these Access reports:

| Access reports | Web workflow | Mapping status |
|---|---|---|
| `الفئة والشهر`; `الفئةوالتاريخ`; `حساب اليومية`; `سحب الايام` | Invoice report with date/category filters, Access source-detail columns, daily/monthly gross totals, CSV, and browser print-to-PDF | Source-query fields verified and exposed in the detail table/CSV; user confirmed gross totals from `الاجمالى`, both resident and cash invoices, and exclusion of voided invoices. Access report grouping/layout formulas still need reconciliation. `سحب الايام` is classified here because its source query joins invoice header/detail records. |
| `رقم الفيلا والغرفة`; `سكن النزلاء - فيلا - غرفة`; `مسكن النزلاء` | Resident stay report with admission-date range, villa/room filters, basic identity/stay fields, CSV, and browser print-to-PDF | Safe candidate equivalent for all three; `رقم الفيلا والغرفة` and `مسكن النزلاء` use `SELECT DISTINCTROW * FROM nam`, while the third has no matching saved-query definition. Exact field mappings/layouts remain unverified; the web report uses UUID-based stays and does not read `nam`. |
| `اطراف الكانتين`; `اطراف الكانتين1`; `راس الكانتين`; `راس الكانتين1` | Canteen stock balances, date-filtered receipts/issues, period quantity totals, recipient/voucher details, optional void audit rows, CSV, and browser print-to-PDF | Candidate equivalents only; original Access report prompts, formulas, and layouts remain unverified |

Resident stay reports query the current UUID-based resident/stay model, not the
unpopulated legacy `nam` table. They show file number, resident name, status,
admission/exit dates, villa, and room only. Staff use requires the existing
resident-edit permission; archived residents are excluded by default and can
be included explicitly. The date range filters admission date.

Canteen reports require the existing canteen grant for staff and use the exact
canteen ledger, voucher, movement-link, and void records. Effective balances
and period totals exclude voided movements; the optional audit toggle displays
their reason without adding them back to totals. Current balances are computed
from all non-voided movements, regardless of the selected date range. The
period applies to movement details and period totals.

## Saved queries (120)

The 118 `~sq_` names are Access-generated form/report/control queries; map them
through their owning screen/report and replace their user-visible behavior.
The two separately named saved queries are also explicitly accounted for.

```text
~sq_cاسماء النزلاء~sq_csak
~sq_cالعناوين~sq_cCon
~sq_cالعناوين~sq_cmar
~sq_cالمبيعات اليومية~sq_cاسم النزيل
~sq_cالمبيعات اليومية~sq_cحساب اليومية Subform
~sq_cالموظفين~sq_cCombo9
~sq_cالموظفين~sq_cاطراف الموظفين Subform
~sq_cبحث اصناف~sq_cالمبيعات
~sq_cبحث المبيعات~sq_cالمبيعات
~sq_cبحث النزلاء - كانتين~sq_cA
~sq_cبحث النزلاء - كانتين~sq_cB
~sq_cبحث النزلاء - كانتين~sq_cC
~sq_cبحث النزلاء~sq_cبحث
~sq_cتحديث البيانات~sq_csak
~sq_cجرد الثلاجة بالسعر الجديد~sq_cالسعر السابق
~sq_cجرد الثلاجة بالسعر الجديد~sq_cالصنف
~sq_cجرد الثلاجة بالسعر الجديد~sq_cالوزن
~sq_cجرد الثلاجة~sq_cالوزن
~sq_cراس الثلاجة~sq_cCombo20
~sq_cراس الثلاجة~sq_cاطراف الثلاجة
~sq_cراس الثلاجة~sq_cاطراف الثلاجة Subform
~sq_cراس الثلاجة~sq_cالصنف / الفئة
~sq_cراس العلاج~sq_cCombo15
~sq_cراس العلاج~sq_cاطراف العلاج Subform
~sq_cراس العهدة~sq_cالعهدة Subform
~sq_cراس الفاتورة~sq_cDaily
~sq_cراس الفاتورة~sq_cاسم النزيل
~sq_cراس الفاتورة~sq_cاطراف الفاتورة
~sq_cراس الكانتين~sq_cCombo18
~sq_cراس الكانتين~sq_cاطراف الكانتين Subform
~sq_cراس الكانتين~sq_cالصنف / الفئة
~sq_cراس الكانتين1~sq_cاطراف الكانتين Subform1
~sq_cراس المخزن~sq_cCombo29
~sq_cراس المخزن~sq_cاطراف المخزن
~sq_cراس المخزن~sq_cاطراف المخزن Subform
~sq_cراس المخزن~sq_cالصنف
~sq_cراس النزيل~sq_cCombo15
~sq_cراس النزيل~sq_cاطراف النزيل Subform
~sq_cسحب الكانتين ب~sq_cA
~sq_cسحب الكانتين ب~sq_cB
~sq_cسحب الكانتين ب~sq_cC
~sq_cسحب الكانتين~sq_cAA
~sq_cفواتير بيع اللحوم~sq_cاطراف فواتير البيع Subform
~sq_cكانتين~sq_cCombo14
~sq_cكانتين~sq_cطرف الكانين Subform
~sq_cمشتريات النزلاء1~sq_cالصنف
~sq_dاطراف الفاتورة1~sq_dالفئة
~sq_dالفئة والشهر~sq_dاسم النزيل
~sq_dالفئةوالتاريخ~sq_dاسم النزيل
~sq_dاليوم والشهر~sq_dاسم النزيل
~sq_dحساب اليومية~sq_dاسم النزيل
~sq_dحساب اليومية~sq_dالفئة
~sq_dراس الفاتورة~sq_dاسم النزيل
~sq_dراس الفاتورة~sq_dالفئة
~sq_dراس الفاتورة1~sq_dاسم النزيل
~sq_dراس الفاتورة2~sq_dاسم النزيل
~sq_dسحب الايام~sq_dاسم النزيل
~sq_fاسماء النزلاء
~sq_fاطراف النزيل Subform
~sq_fاطراف فواتير البيع Subform
~sq_fالدخول للبرنامج
~sq_fالرقم السرى
~sq_fالعناوين
~sq_fالمحافظة
~sq_fالموظفين
~sq_fبحث
~sq_fتحديث البيانات
~sq_fتحديث البيانات1
~sq_fراس الثلاجة
~sq_fراس العلاج
~sq_fراس العهدة
~sq_fراس الفاتورة
~sq_fراس الكانتين
~sq_fراس الكانتين1
~sq_fراس المخزن
~sq_fراس النزيل
~sq_fسن النزيل
~sq_fفترة النزلاء
~sq_fفواتير بيع اللحوم
~sq_fكانتين
~sq_fمشتريات النزلاء
~sq_rnam
~sq_rاطراف الثلاجة
~sq_rاطراف الثلاجة1
~sq_rاطراف الثلاجة2
~sq_rاطراف الثلاجة3
~sq_rاطراف الثلاجة4
~sq_rاطراف الفاتورة
~sq_rاطراف الفاتورة1
~sq_rاطراف الكانتين
~sq_rاطراف الكانتين1
~sq_rالعهدة
~sq_rالعهدة1
~sq_rالفئة والشهر
~sq_rالفئةوالتاريخ
~sq_rاليوم والشهر
~sq_rتحديث البيانات
~sq_rحساب اليومية
~sq_rخريج - عدم استكمال
~sq_rراس الثلاجة
~sq_rراس العلاج
~sq_rراس العهدة
~sq_rراس الفاتورة
~sq_rراس الفاتورة1
~sq_rراس الفاتورة2
~sq_rراس الكانتين
~sq_rراس الكانتين1
~sq_rراس المخزن
~sq_rراس المخزن1
~sq_rراس المخزن2
~sq_rراس المخزن3
~sq_rراس المخزن4
~sq_rراس المخزن5
~sq_rرقم الفيلا والغرفة
~sq_rسحب الايام
~sq_rفواتير بيع اللحوم
~sq_rفواتير بيع اللحوم2
~sq_rمسكن النزلاء
Q_Report
Query1
```

## Coverage status and delivery order

| Domain | Source objects | Current status | Planned disposition |
|---|---|---|---|
| Resident identity and stay | `nam`, `راس النزيل`, `اطراف النزيل`, `رقم الفيلا` | Sprint 8 preserves the separate UUID/legacy-ID bridge with no `nam` synchronization; Sprint 16 adds standalone admin-only receipt records and uses the villa lookup in stay entry. Sensitive fields remain deferred. | Reconcile remaining resident reports/forms and any future `nam` mapping only after an explicit interview and privacy approval |
| Staff directory, leave, and attendance | `تحديث البيانات`, `الموظفين`, `اطراف الموظفين`, `الدخول للبرنامج` | Sprint 7 implements the directory and approved leave; web-only `staff_attendance` records clock-in/out linked to the employee account; `audit_logs` records actor and operation metadata without field values | Access login is replaced by Better Auth; no legacy password migration; reports remain |
| General inventory/warehouse | `الاصناف`, `الاصناف / الفئة`, `الفئة`, `الفئه`, `راس المخزن`, `اطراف المخزن` | Sprint 15 implements and demo-tests the warehouse catalog, receipts, and stock ledger using Sprint 12's exact schemas. `الاصناف / الفئة` and invoice `الفئة` are implemented for fridge/sales workflows; the lookup tables remain distinct. Migration generated, not applied. | Reconcile warehouse reports/forms and complete persistent-database acceptance after approved database configuration. |
| Canteen stock | `كانتين`, `طرف الكانين`, `راس الكانتين`, `اطراف الكانتين` | Sprint 4 implemented; Sprint 11 adds stock balance/movement report candidate; migration generated, not applied | Catalog, inbound/outbound stock ledger, recipient/voucher trace, explicit per-staff grant; admin-only void with reason |
| Canteen sales and resident purchases | `مشتريات النزلاء`, `راس الفاتورة`, `اطراف الفاتورة`, `الفئة` | Sprint 5 implemented; demo-tested; migration generated, not applied | Admin-only cash sales and resident invoices, linked stock deduction, partial resident payments, audited cancellation/refund |
| Refrigerator inventory/issues | `راس الثلاجة`, `اطراف الثلاجة` | Sprint 6 implemented for product mapping, receipts, and sale issues; migration generated, not applied | Exact-name product and ledger fields; derive balances from receipt and issue history; reports remain |
| Treatment/medication | `راس العلاج`, `اطراف العلاج` | Not implemented; sensitive and deferred | Only after privacy/region approval and a separate access-control interview |
| Resident invoices and daily accounting | `راس الفاتورة`, `اطراف الفاتورة`, `الفئة`, `اليوم` | Invoice entry implemented in Sprint 5; Sprint 9 adds date/category detail reports and daily/monthly gross totals; resident-key reconciliation and `اليوم` lookup remain | Keep invoice entry/cancellation administrator-only; staff with the canteen grant may view all non-voided resident and cash invoice lines; reconcile `nam.ID` before importing records |
| Meat sales | `فواتير بيع اللحوم`, `اطراف فواتير البيع` | Sprint 6 implemented; demo-tested; migration generated, not applied | Exact-name sales lines, full payment, per-sale editable price, refrigerator deduction, admin-only void/refund |
| Custody/assets | `راس العهدة`, `العهدة` | Sprint 15 implements and demo-tests issue, partial return, full outstanding transfer, reasoned cancellation/restoration, and employee-scoped read-only history using Sprint 13's exact schemas. Migration generated, not applied. | Reconcile custody reports/forms and complete persistent-database acceptance after approved database configuration. |
| Lookups and geography/church | `الكنيسة التابع لها`, `المحافظة`, `اليوم`, `الفئة`, `الفئه` | Sprint 14 implements exact schemas and admin-managed lookup screens for the four remaining tables. Staff profiles use church `nam` and governorate `Cont`/district `Cet` as text; invoice `الفئه` is selected from its distinct list; invoice day stays date-derived. | Preserve source names and types, cascade renames to linked text values, and block deletion when referenced; keep `الفئة` and `الفئه` distinct. |
| Legacy reports/search | All listed forms/reports and 120 saved queries | Sprints 9-11 add invoice, resident-stay, and canteen-stock report candidates for 11 named reports; 29 report objects and all saved-query definitions remain unmapped | Trace each screen/query/report to an acceptance-tested web workflow or a signed-off retirement decision |

### Sprint sequence

1. **Sprint 4 — Canteen stock:** exact source names for canteen catalog/ledger and
   issue-voucher data; staff receive full canteen access only when individually
   granted by an administrator. Any authorized staff member may post receipts
   and issues; only an administrator may void, with a reason and immutable
   history. Web-only additions preserve `created_at`/`created_by` on issue
   headers, add `رقم المستند` to issue lines to retain the header-to-line link,
   and add separate movement-link, access-grant, and void-audit tables. The
   Access `راس الكانتين.رقم الصنف` primary-key behavior is replaced by a
   generated voucher `ID` so the same product can appear in multiple vouchers;
   the original `رقم الصنف` field remains. This key change must be confirmed in
   the migration rehearsal before any Access records are imported.
2. **Sprint 5 — Canteen sales and resident invoices:** exact-name tables cover
   `مشتريات النزلاء` (`ID`, `الصنف`, `السعر`, `اضافة`), `راس الفاتورة`
   (`ID`, `رقم الفاتورة`, `تاريخ الفاتورة`, `اسم النزيل`), and `اطراف الفاتورة`
   (`ID`, `الرصيد`, `الفئه`, `الفئة`, `الصنف`, `السعر`, `الكمية`, `الاجمالى`,
   `التاريخ`, `اليوم`, `الشهر`, `رقم`). The `الفئة` lookup retains its own exact
   table and key. Cash sales and resident charges, stock linkage, partial
   resident payments, and administrator-only reasoned cancellation/refunds
   are implemented. The migration is generated but not applied.
3. **Sprint 6 — Refrigerator issues and meat sales:** preserve the exact
   `الاصناف / الفئة` catalog (`ID`, `الصنف / الفئة`, `السعر`, `الكمية`),
   `راس الثلاجة` (`ID`, `رقم الصنف`, `رقم سند الصرف`, `اسم المستفيد`,
   `الصنف / الفئة`), and `اطراف الثلاجة` (`ID`, `الصنف / الفئة`, `الكمية`,
   `السعر`, `الاجمالى`, `المنصرف`, `تاريخ الصرف`, `رقم اذن الصرف`,
   `جهة الصرف`, `رقم الصنف`) schemas. Admin-entered receipts establish the
   on-hand balance; sales deduct stock in the same transaction. The exact-name
   sales tables are `فواتير بيع اللحوم` (`ID`, `رقم الفاتورة`, `تاريخ البيع`,
   `رقم اذن الصرف`, `اسم المستفيد`) and `اطراف فواتير البيع` (`ID`,
   `الصنف / الفئة`, `السعر`, `الكمية`, `الاجمالى`, `تاريخ البيع`, `رقم`).
   Sales are fully paid on creation, prices may be edited per sale, and admins
   can void with a reason after confirming the refund. The migration is
   generated but not applied.
4. **Resident identity:** reconcile the field meanings and manually link UUID
   residents to legacy integer IDs without automatic synchronization. Invoice
   report/search equivalents remain outstanding; custody is implemented in
   Sprint 15.
5. **Treatment/recovery:** blocked until data-region and privacy/access decisions
   are approved.
6. **Cross-cutting reports/searches:** trace all 40 reports and 120 saved query
   definitions to tested web equivalents or documented retirement decisions.
7. **Schema reconciliation and migration rehearsal:** compare every Access
   table/column/key/relation with PostgreSQL; import only after approval and
   verify counts and business invariants without disclosing record contents.
8. **Sprint 12 — Warehouse schema coverage:** add the exact Access fields and
   types for `الاصناف`, `راس المخزن`, and `اطراف المخزن` only. Do not infer
   primary keys, relationships, defaults, or workflow semantics from the field
   list. No Access data is imported and the generated migration is not applied.
9. **Sprint 13 — Custody schema coverage:** add the exact Access fields and
   types for `راس العهدة` and `العهدة` only. Do not infer primary keys,
   relationships, defaults, or workflow semantics from the field list. No
   Access data is imported and the generated migration is not applied.
10. **Sprint 14 — Reference lookups:** add and manage the exact schemas for
    `الكنيسة التابع لها`, `المحافظة`, `اليوم`, and `الفئه` as distinct source
    tables. Administrators manage values and signed-in staff can view them.
    Staff-profile text fields use church `nam` and governorate `Cont`/`Cet`;
    invoice `الفئه` uses its own lookup while invoice day stays derived.
    Renames cascade to linked text values and deletion is blocked while
    referenced. No Access records are imported.
11. **Sprint 15 — Warehouse and custody workflows:** use the exact source
    fields in `الاصناف`, `راس المخزن`, `اطراف المخزن`, `راس العهدة`, and
    `العهدة`. Administrators add catalog items and receipts, issue stock as
    custody to a listed employee, record partial/full returns and full
    outstanding-item transfers, and void with a required reason. Demo acceptance
    covered receipt, insufficient-stock rejection, issue, partial return,
    transfer, void/restoration, and employee-scoped read-only history. Persistent
    database acceptance is pending approved database configuration. Voids and
    returns restore only the outstanding quantity. Employees can view only
    their own custody history; only administrators can manage stock or custody.
    Catalog item selection is required; stock begins at zero and cannot go
    negative. Custody line prices default from the warehouse item but can be
    overridden; `الإجمالى` is calculated from quantity × price. Declared Access
    keys/relations are enforced; additional web-only links and event/audit
    records preserve the workflow. No Access records are imported. The
    warehouse/custody Access reports and full form-by-form acceptance remain
    outstanding.

12. **Sprint 16 — Resident financial records and villa lookup:** preserve the
    separate UUID resident model and do not create or import `nam` rows. Admins
    manually enter `راس النزيل.رقم النزيل` and `اسم النزيل`, then record multiple
    positive receipts in `اطراف النزيل` with required transaction dates and
    optional expected settlement dates. Access is administrator-only. Voids
    require a reason and preserve audit history; they do not represent cash
    refunds. Administrators manage unique `رقم الفيلا.N_V` choices with
    web-generated IDs; new/changed villa values use the list, and unchanged
    historical stay text is preserved. No Access records are imported.

### Sprint 15 compatibility notes

- The schema preserves all Access fields for the five source tables and uses
  their declared keys/relations: `الاصناف.ID`,
  `راس المخزن.رقم` → `اطراف المخزن.رقم`, and
  `راس العهدة.رقم العهدة` → `العهدة.رقم`.
- `راس المخزن.catalog_id`, `راس العهدة.recipient_employee_number`, and
  `العهدة.web_id`, `warehouse_number`, and `current_employee_number` are
  web-only keys. `العهدة.ID` and the non-key `ID` fields in the two headers
  remain preserved without assigning undocumented meanings.
- `اطراف المخزن` is an append-only ledger for receipts, custody issues,
  returns, and void restorations. `الرصيد` and `المتبقى` record before/after
  balances; `الوارد`/`المنصرف` and their dates preserve the original movement
  columns. On-hand stock is calculated from non-deleted ledger rows.
- Web-only `custody_events` records returns, transfers, and voids with actor,
  date, quantity, participants, reason, and stock movement link. The original
  custody header retains the initial employee; each detail tracks its current
  holder. Transfers do not change stock. Partial/full returns and voids restore
  only their outstanding quantity.
- The screen provides core warehouse receipt and custody workflows. The
  Access reports `العهدة`, `العهدة1`, `راس العهدة`, `راس المخزن`,
  `راس المخزن1`–`راس المخزن5`, and original form layouts/queries have not yet
  been reconciled. The migration is generated but unapplied; demo records reset
  on refresh and no Access data was imported.

### Sprint 16 compatibility notes

- `راس النزيل` retains `ID`, `رقم النزيل`, and `اسم النزيل`; the web requires an
  administrator-entered resident number and name. The `ID` source field is
  preserved without assigning it an undocumented meaning.
- `اطراف النزيل` retains `ID`, `المبلغ`, `التاريخ`, `تاريخ العودة`, and `رقم`.
  The web generates detail IDs, requires positive received amounts and receipt
  dates, and treats `تاريخ العودة` as an optional expected settlement date.
  Voids set web-only audit fields and do not record a cash refund. Details with
  no resident number remain visible as unassigned records for administrator
  review.
- `رقم الفيلا` retains `ID` and nullable `N_V`; new IDs are generated by the
  web. Unique, non-empty values are available in resident stay forms. Updating
  a lookup cascades to matching stay text; deleting a referenced value is
  blocked. Unchanged historical text outside the list remains available when
  editing an existing stay, while a new stay requires a listed value.
- Resident financial records are separate from UUID residents and `nam`;
  there is no automatic field mapping, synchronization, or Access import.
  Existing resident-sensitive fields remain excluded from screens and imports.
- The Sprint 16 migration is generated but unapplied. The resident financial
  workflow is available only to administrators; no production database was
  configured or tested.

### Sprint 17 compatibility notes

- Read-only DAO inspection of the Access `QueryDefs` collection verified the
  source queries for `الفئة والشهر`, `الفئةوالتاريخ`, `حساب اليومية`, and
  `سحب الايام`.
  Their datasets select invoice number/date/name and the source detail fields;
  the SQL joins `راس الفاتورة` to `اطراف الفاتورة` and contains no explicit
  aggregate expression or `WHERE` criteria. `سحب الايام` is grouped with
  invoice reports because its source query selects invoice and detail fields,
  including `اليوم`; it is not a resident-stay report. No operational Access
  rows were queried.
- The web invoice detail table and CSV preserve `الرصيد`, `الفئه`, numeric
  `الفئة`, `الصنف`, `السعر`, `الكمية`, `الاجمالى`, detail `التاريخ`, and
  `اليوم`/`الشهر`, alongside header date, legacy resident number, and current
  web resident name. The distinct `الفئة`/`الفئه` values are not conflated.
- By user decision, report totals sum `الاجمالى` (gross line totals), not
  `الرصيد` or payments collected; both resident and cash invoices are included,
  voided invoices are excluded, and the date/category filters, daily/monthly
  summaries, CSV, and print/PDF outputs remain.
- `راس الفاتورة.اسم النزيل` remains a nullable legacy integer key and is shown
  separately from the UUID-linked web resident name when available. This
  preserves the separation from `nam`; no Access records were imported.

### Sprint 18 compatibility notes

- Read-only DAO inspection verified that `~sq_rرقم الفيلا والغرفة` and
  `~sq_rمسكن النزلاء` use `SELECT DISTINCTROW * FROM nam`. The `nam` table has
  sensitive source fields, so the web report does not query it and does not
  import or display those fields. No operational Access rows were queried.
- No matching saved-query definition was found for
  `سكن النزلاء - فيلا - غرفة`; its exact report source and layout remain
  unverified. Per the interview decision, it is included only as a safe
  candidate equivalent and is marked accordingly.
- The candidate report uses current UUID-based stays and the approved basic
  fields: file number, name, status, admission/exit dates, villa, and room.
  Filters remain admission-date range, villa, room, and name/file search;
  archived residents are excluded by default with an explicit include toggle.
  Summaries, CSV, and print/PDF remain unchanged. The field mapping is not
  represented as a verified one-to-one mapping to `nam`.

### Sprint 5 compatibility notes

- Every field listed above is present in its exact-name PostgreSQL source table
  with the inventoried Access type. Web-only fields are separate additions:
  `resident_id`, `sale_type`, audit timestamps/users, catalog-to-canteen item
  linkage, payment/refund rows, and invoice-to-stock-movement links.
- The current web resident model uses UUIDs and is not the Access `nam` table.
  Until that table is reconciled, `راس الفاتورة.اسم النزيل` remains nullable and
  the screen links a resident through the separate `resident_id` field. Do not
  import resident invoices until `nam.ID` has an approved, verified mapping.
- `مشتريات النزلاء.اضافة` is stored and shown as the source boolean. Its
  business meaning was not inferable from available saved-query definitions,
  so the app does not assign behavior to it yet.
- Sales reduce stock at save time only when a catalog item is explicitly linked
  to a canteen stock item. General invoice items without that link do not affect
  canteen stock. Cash invoices are paid in full at creation; resident invoices
  allow partial payments. Cancellation records a reason, reverses linked stock,
  and requires confirmation that any amount paid was refunded.
- The Access `الاجمالى` and `الرصيد` fields are integers. Invoice line totals
  and payments therefore use whole currency units; a calculated line total
  that is not an integer is rejected instead of rounded.
- `الفئه` and `اليوم` source lookup tables, invoice printing, and the historical
  report/query equivalents are still tracked separately. The `الفئه` text field
  in `اطراف الفاتورة` remains distinct from the `الفئة` numeric relation.

### Sprint 6 compatibility notes

- The refrigerator catalog is the exact source table `الاصناف / الفئة`; its
  `الكمية` field is preserved as catalog metadata. Per the user's decision,
  actual available stock is derived only from explicitly recorded refrigerator
  receipts and issue rows, not from this catalog value.
- The exact refrigerator and meat-sale tables retain all listed source fields
  and Access primary keys. Web-only fields add receipt direction/date, catalog
  linkage, invoice-to-stock linkage, payment/refund history, and reasoned void
  audit. `فواتير بيع اللحوم.رقم الفاتورة` remains the invoice key, while
  `راس الثلاجة.رقم الصنف` remains the fridge-product key.
- Meat sales use the saved catalog price by default; the administrator may
  override the unit price on a sale line. Every line is linked to a refrigerator
  product; stock is checked under a product-row lock and deducted atomically
  with the invoice and full-payment record. Voiding reverses the linked issue
  rows and records a refund after administrator confirmation.
- The Access form-definition export is blocked by the file's Trust Center/VBA
  state. The saved-query SQL was inspected without reading any table records;
  unsupported form-only behaviors remain unclaimed and must be reconciled in a
  later acceptance review. No Access rows have been imported.

### Sprint 7 compatibility notes

- `تحديث البيانات` preserves all 24 Access fields: `ID1`, `ID`, `الاسم الاول`,
  `الاسم الثالث`, `الرقم القومى`, `العنوان`, `المحافظة`, `المركز / الحى`,
  `تاريخ الميلاد`, `الحالة الاجتماعية`, `الموهل الدراسى`,
  `تاريخ الالتحاق بالعمل`, `الموبايل`, `الكنيسة التابع لها`, `أب الاعتراف`,
  `رقم اب الاعتراف`, `الطائفة`, `اماكن العمل السابقة`, `برامج الكمبيوتر`,
  `تخصص العمل`, `مكتب التوظيف`, `صورة`, `ملاحظات`, and `ImagePath`. Profile
  dates are entered as calendar dates; image fields preserve text paths only
  and do not upload files.
- `الموظفين` preserves `ID`, `اسم الموظف / العامل`, and the declared key
  `رقم الموظف`. `ID` is optional/non-key in the web entry form because Access
  metadata does not declare it as a key or establish an ID-generation rule.
  `اطراف الموظفين` preserves `ID`, `تاريخ النزول`, `تاريخ العودة`,
  `نوع الاجازة`, `ملاحظات`, and `رقم`; the web enforces a valid employee
  reference and requires return date to be on or after the leave date.
- The administrator enters approved leave; there is no separate request,
  approval, or rejection state. `نوع الاجازة` remains free text. Staff can
  view only their own linked profile and leave history; only administrators
  can edit profiles or record leave. Account linking is an explicit admin
  action, and the two Access employee IDs are not assumed to be equivalent.
- `الدخول للبرنامج` is not copied as a table: Better Auth replaces its login.
  `الرقم السرى` is never migrated; old `الاوذنات` are not trusted as web grants;
  account name/email and role are managed through the web account workflow.
  `ID`, `الاسم الاول`, `الاسم الثالث`, `مسار الصورة`, and `تاريخ التسجيل`
  remain unmapped legacy metadata unless a future reconciliation approves a
  specific use.
- Staff profile privacy and hosting approval were confirmed by the user for
  this sprint. This does not approve importing Access records, processing
  resident sensitive data, or deploying the database to an unreviewed region.
- Migrations `0006` and `0007` are generated and have not been applied to any
  database. `0007` adds the non-key `ID` source field to `الموظفين`.

### Sprint 8 compatibility notes

- The exact `nam` table schema contains all 43 inventoried source fields,
  including the integer `ID` primary key, nullable legacy fields, Boolean
  fields, and DateTime fields represented as PostgreSQL timestamps. Exact
  related schemas were added for `راس النزيل`, `اطراف النزيل`, and `رقم الفيلا`.
- `resident_legacy_links` is a web-only crosswalk from the existing UUID
  `residents.id` to `nam.ID`. No synchronization is performed by current
  resident screens. A one-shot migration script now contains a candidate
  mapping, runs read-only by default, and has not been run against a database.
  The relationship from
  `راس الفاتورة.اسم النزيل` to `nam.ID` is represented, but current web invoices
  continue to use their separate nullable UUID `resident_id` until a later
  reconciliation implements that link.
- Candidate `nam` mapping for review; no database write has been authorized or
  performed:

  | `nam` source | `residents` / `resident_stays` target |
  | --- | --- |
  | `ID` | `resident_legacy_links.legacy_resident_id` |
  | `num` | `residents.file_number` |
  | `nam` | `residents.name` |
  | `Dat_Brth` | `residents.birth_date` |
  | `Adrres` | `residents.address` |
  | `tal` | `residents.phone` |
  | `Con` | `residents.governorate` |
  | `mar` | `residents.district` |
  | `Achesh` | `residents.church` |
  | `Fathr` | `residents.confessor` |
  | `Dat_Ent` | `resident_stays.admission_date` |
  | `Dat_AO` | `resident_stays.exit_date` |
  | `sak` | `resident_stays.villa` |
  | `Num_ROm` | `resident_stays.room` |

  Unlisted/uncertain columns, including national-ID, treatment, and image
  fields, are not selected or imported. Obtain approval of this mapping before
  any `--apply` run.
- Existing resident screens remain on the UUID resident/stay model. Staff only
  receive file number, name, stay dates, villa, room, and status; staff edits
  require the existing individual resident-edit grant. The server rejects
  extended-field submissions from staff. Administrators may manage the
  existing non-religious contact fields. Church/confessor fields are returned
  only to administrators and staff with the resident-edit grant.
- Sensitive fields in the exact `nam` schema are preserved as nullable schema
  columns only. Health/recovery, national-ID, and image fields are not surfaced
  in resident forms or imported. Church/confessor fields follow the explicit
  access decision above.
- Migrations for the resident schema/bridge and related Access tables are
  generated but have not been applied to any database.

### Release gate

Do not call the migration complete until the coverage register has no
unreviewed table, field, form, report, query, or relationship; all deviations
have an owner-approved disposition; exact legacy names have been verified in
PostgreSQL; migrations and backups have been rehearsed in an approved region;
and role-based access and privacy controls have passed tests. No production
Access data has been imported.

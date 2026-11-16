# Security Audit Report

**Date:** 2026-11-09  
**Scope:** Static, source-only review of authentication and authorization, server actions and report routes, validation and database queries, audit logging, file and image handling, CSV exports, and selected balance/date logic.

## Summary

The source review found authorization and data-minimization defects, but no confirmed SQL injection in the reviewed database paths. The selected source-level fixes are implemented below. No database was contacted, no real resident data was read or written, and no deployment was performed.

## Follow-up source fixes

- `SEC-01`: viewers cannot use staff write-permission flags; changing an account to viewer clears write flags and inventory-category grants.
- `SEC-02`: inventory actions require `canManageWarehouse`; custody permission no longer authorizes warehouse changes.
- `SEC-03`: non-admin resident data is redacted; national-ID, treatment-profile, recovery, and image fields are omitted for all roles from resident DTOs, forms, and resident-profile printing. Church/confessor fields require admin or a staff resident-edit grant plus the residents screen.
- `SEC-04`: canteen recipient/voucher/reason data is returned only to explicitly authorized readers. Invoice issuers receive only product and stock-balance fields needed for sales.
- `APP-01`: treatment records load only with both the treatment screen and clinic permission; the diagnosis report tab is hidden otherwise.
- `DATA-01`: the `nam` migration maps the candidate church/governorate/district and stay fields rather than dropping them. The mapping is documented for review and has not been applied.
- `IMP-01`: CSV imports are dry-run by default, reject inconsistent row widths, protect application/auth tables, and require explicit `import-test` target confirmation and branch marker to connect. Truncation requires a separate confirmation.

Validation before the reference-page phase: 11 tests passed, ESLint passed, the production build passed, and both import scripts passed Node syntax checks. The reference-page phase adds two authorization tests; its validation results are recorded below.

## Reviewed controls

- Session, role, screen, and permission guards are used by representative server actions and report data functions. Report routes delegate to guarded data functions.
- Representative action and report inputs are validated with schemas and bounds. Reviewed queries use Drizzle expressions and parameterized values; no unsafe raw SQL sink was identified in the reviewed application code.
- Better Auth disables public sign-up. Administrator account creation applies a 12–128 character password length requirement.
- Representative resident and staff-attendance writes create audit events, and audit-log reads are administrator-guarded.
- Report CSV utilities escape formula-leading values. Reviewed report endpoints set private, no-store response headers.
- Reviewed stock and movement code includes quantity validation and database checks. Date-only report inputs are parsed as UTC date values.

## Findings resolved in the reference-page phase

- `AUTH-05`: church lookup DTOs could contain church, confessor, and priest
  fields for staff with resident-edit permission but without the residents
  screen. A shared role/screen guard now limits these values to administrators
  or resident editors who also have the residents screen. Lookup-only users no
  longer receive resident rows.
- `PRIV-01`: resident stay-report responses included birth dates for every
  user with the report screen. Non-administrators now receive an empty
  birth-date field; the report's non-birth-date columns remain available under
  the screen permission.
- `AUTH-06`: staff with resident-edit permission could mutate villa lookups.
  All lookup mutation actions and management controls now require an
  administrator.
- `DATA-02`: villa deletion checked active stays only, leaving historical stay
  references unprotected. Deletion now rejects any current or historical stay
  reference.

The day lookup remains a separate reference list: invoice day labels are
derived from invoice dates. The daily report uses an actual calendar date;
no unsupported mapping from the legacy day list was introduced.

Reference-page validation: 13 tests passed, ESLint passed, and the production
build passed. No database connection, real resident data, deployment, or
commit was used.

## Findings resolved in the navigation phase

- `UI-01`: quick-access buttons included unavailable or mismatched destinations.
  The quick-access panel now filters by screen permission and the required
  capability, routes invoice links to the correct sales/history tab, and
  removes nonfunctional destinations.
- `AUTH-07`: dashboard shortcuts could expose screens that were not assigned
  to the current account, and the initial screen did not consistently follow
  that account's allowed screens. Sidebar links, dashboard actions, and the
  initial screen now use the same screen permissions; accounts with no
  accessible screen receive an explicit no-access state.
- `UX-02`: the sidebar and quick-access actions were difficult to scan. The
  sidebar is organized into five work groups, and quick-access actions are
  grouped by task without changing the underlying screen permission keys.

Navigation-phase validation: 14 tests passed, ESLint passed, and the production
build passed. Interactive browser verification remains unavailable because
the app previously stayed on its loading state. No database connection, real
resident data, deployment, or commit was used.

## Phase G security review

- The source security reviewer reported no confirmed application vulnerabilities
  in the reviewed changes.
- `DEP-01` — Medium, unresolved: `esbuild` in the `drizzle-kit` dependency tree
  is affected by GHSA-67mh-4wv8-2f99. The lockfile resolves `esbuild@0.18.20`.
  The available forced npm remediation downgrades `drizzle-kit` to `0.18.1`,
  which is a breaking change and conflicts with the project's optional peer
  range. A non-breaking override did not yield a reproducible lockfile, so it
  was removed rather than leaving an invalid dependency tree. The user chose
  to leave this finding documented instead of applying the breaking downgrade.
- `DEP-02` — Medium, fixed: `minimatch` in the ESLint/TypeScript dependency
  tree was affected by GHSA-g3hv-75wg-m249. An npm override now resolves that
  branch to `minimatch@11.0.5`; `package-lock.json` is updated accordingly.
- After the `DEP-02` fix, `npm audit` reports four moderate instances of
  `DEP-01` and no high or critical findings.
- `gitleaks` was not installed, so a Git-history secret scan was not run.
- After the dependency update, all 14 tests passed, ESLint and the production
  build passed, and `npm ci --dry-run` passed. No clean install was executed.

The source review does not validate production runtime or deployment settings.
No database connection, real resident data, deployment, or commit was used.

## Limitations and follow-up checks

These items were not verified and should not be treated as passing:

- Dynamic authentication, session expiration, cookie flags under production HTTPS, login rate limiting, and brute-force behavior.
- Deployment security headers, CSP, framework CSRF/origin enforcement, and production error responses.
- Secret scanning and secret review of Git history (`gitleaks` was unavailable).
- Complete audit-log coverage, including failure and transaction behavior for every sensitive operation.
- Database permissions, actual Neon branch identity, migration results, backup/restore, and import readiness were not verified.
- Legacy image-path columns remain in the database schema but are not returned or accepted by resident UI/actions.
- End-to-end accounting/balance correctness, fractional values across all integer fields, and Cairo-time-zone behavior.

The source checks provide no assurance about deployment configuration or runtime behavior for these items. Verify them in a controlled environment without production resident data before treating the audit as complete.

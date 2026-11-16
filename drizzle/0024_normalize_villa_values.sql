WITH villa_rows AS (
	SELECT
		"ID",
		upper(regexp_replace(btrim("N_V"), '^فيلا[[:space:]]*', '', 'i')) AS canonical,
		row_number() OVER (
			PARTITION BY upper(regexp_replace(btrim("N_V"), '^فيلا[[:space:]]*', '', 'i'))
			ORDER BY "ID"
		) AS duplicate_number
	FROM "رقم الفيلا"
	WHERE upper(regexp_replace(btrim("N_V"), '^فيلا[[:space:]]*', '', 'i')) IN ('A', 'B', 'C', 'D')
)
DELETE FROM "رقم الفيلا" AS lookup
USING villa_rows
WHERE lookup."ID" = villa_rows."ID"
	AND villa_rows.duplicate_number > 1;
--> statement-breakpoint

UPDATE "رقم الفيلا"
SET "N_V" = upper(regexp_replace(btrim("N_V"), '^فيلا[[:space:]]*', '', 'i'))
WHERE upper(regexp_replace(btrim("N_V"), '^فيلا[[:space:]]*', '', 'i')) IN ('A', 'B', 'C', 'D');
--> statement-breakpoint

UPDATE resident_stays
SET villa = upper(regexp_replace(btrim(villa), '^فيلا[[:space:]]*', '', 'i'))
WHERE upper(regexp_replace(btrim(villa), '^فيلا[[:space:]]*', '', 'i')) IN ('A', 'B', 'C', 'D');

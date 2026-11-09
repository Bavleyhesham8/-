CREATE TABLE "العهدة" (
	"ID" integer,
	"الاصناف / الفئة" text,
	"الكمية" double precision,
	"السعر" double precision,
	"الإجمالى" double precision,
	"التاريخ" timestamp,
	"رقم" integer
);
--> statement-breakpoint
CREATE TABLE "راس العهدة" (
	"ID" integer,
	"رقم العهدة" integer,
	"التاريخ" timestamp,
	"العهدة" text
);

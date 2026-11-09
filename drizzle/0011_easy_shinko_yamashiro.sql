CREATE TABLE "الفئه" (
	"ID" serial PRIMARY KEY NOT NULL,
	"الفئة" text
);
--> statement-breakpoint
CREATE TABLE "الكنيسة التابع لها" (
	"ID" serial PRIMARY KEY NOT NULL,
	"num" text,
	"nam" text,
	"Achesh" text,
	"Fathr" text
);
--> statement-breakpoint
CREATE TABLE "اليوم" (
	"ID" serial PRIMARY KEY NOT NULL,
	"اليوم" text
);
--> statement-breakpoint
CREATE TABLE "المحافظة" (
	"ID" serial PRIMARY KEY NOT NULL,
	"Cont" text,
	"Cet" text
);

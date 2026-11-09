CREATE TABLE "الاصناف" (
	"ID" integer,
	"الاصناف" text
);
--> statement-breakpoint
CREATE TABLE "اطراف المخزن" (
	"ID" integer,
	"الرصيد" double precision,
	"الوارد" double precision,
	"تاريخ الوارد" timestamp,
	"المنصرف" double precision,
	"تاريخ الصرف" timestamp,
	"المتبقى" double precision,
	"حذف" boolean,
	"رقم" integer
);
--> statement-breakpoint
CREATE TABLE "راس المخزن" (
	"ID" integer,
	"رقم" integer,
	"الصنف" text,
	"السعر" double precision,
	"المسئول" text
);

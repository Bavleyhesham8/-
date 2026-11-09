CREATE TABLE "اطراف النزيل" (
	"ID" integer PRIMARY KEY NOT NULL,
	"المبلغ" double precision,
	"التاريخ" timestamp,
	"تاريخ العودة" timestamp,
	"رقم" integer
);
--> statement-breakpoint
CREATE TABLE "راس النزيل" (
	"ID" integer,
	"رقم النزيل" integer PRIMARY KEY NOT NULL,
	"اسم النزيل" text
);
--> statement-breakpoint
CREATE TABLE "nam" (
	"ID" integer PRIMARY KEY NOT NULL,
	"num" text,
	"nam" text,
	"Dat_Brth" timestamp,
	"Adrres" text,
	"tal" text,
	"num_A" text,
	"Con" text,
	"mar" text,
	"Dat_Ent" timestamp,
	"sak" text,
	"khn" boolean,
	"no_A" boolean,
	"Mot" boolean,
	"Alt" text,
	"ALF" text,
	"N-AL" text,
	"Dat_AO" timestamp,
	"ALm" text,
	"Phot" text,
	"Num_ROm" text,
	"Mon" text,
	"ImagePath" text,
	"mmon" text,
	"F_N" text,
	"Nom" text,
	"Achesh" text,
	"Fathr" text,
	"المؤهل الدراسى" text,
	"الخبرات السابقة" text,
	"اماكن العمل السابقة" text,
	"دخول النزيل" text,
	"صلة القرابة" text,
	"من االدرجة" text,
	"ساعة الدخول" text,
	"طريقة الخروج" text,
	"رقم الطبيب المعالج" text,
	"عنوان الطبيب المعالج" text,
	"فريق التأهل والارشاد" text,
	"مرحلة التأهيل والتعافى" text,
	"المدرب" text,
	"المشرف" text,
	"المحاضر" text
);
--> statement-breakpoint
CREATE TABLE "resident_legacy_links" (
	"resident_id" uuid PRIMARY KEY NOT NULL,
	"legacy_resident_id" integer NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_by" text,
	CONSTRAINT "resident_legacy_links_legacy_resident_id_unique" UNIQUE("legacy_resident_id")
);
--> statement-breakpoint
CREATE TABLE "رقم الفيلا" (
	"ID" integer PRIMARY KEY NOT NULL,
	"N_V" text
);
--> statement-breakpoint
ALTER TABLE "اطراف النزيل" ADD CONSTRAINT "اطراف النزيل_رقم_راس النزيل_رقم النزيل_fk" FOREIGN KEY ("رقم") REFERENCES "public"."راس النزيل"("رقم النزيل") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_legacy_links" ADD CONSTRAINT "resident_legacy_links_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_legacy_links" ADD CONSTRAINT "resident_legacy_links_legacy_resident_id_nam_ID_fk" FOREIGN KEY ("legacy_resident_id") REFERENCES "public"."nam"("ID") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_legacy_links" ADD CONSTRAINT "resident_legacy_links_linked_by_user_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "راس الفاتورة" ADD CONSTRAINT "راس الفاتورة_اسم النزيل_nam_ID_fk" FOREIGN KEY ("اسم النزيل") REFERENCES "public"."nam"("ID") ON DELETE restrict ON UPDATE no action;
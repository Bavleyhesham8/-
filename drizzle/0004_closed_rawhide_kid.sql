CREATE TYPE "public"."invoice_payment_kind" AS ENUM('payment', 'refund');--> statement-breakpoint
CREATE TABLE "الفئة" (
	"ID" serial PRIMARY KEY NOT NULL,
	"الفئة" text NOT NULL,
	CONSTRAINT "الفئة_الفئة_unique" UNIQUE("الفئة")
);
--> statement-breakpoint
CREATE TABLE "invoice_stock_movement_links" (
	"invoice_line_id" integer PRIMARY KEY NOT NULL,
	"movement_id" integer NOT NULL,
	CONSTRAINT "invoice_stock_movement_links_movement_id_unique" UNIQUE("movement_id")
);
--> statement-breakpoint
CREATE TABLE "اطراف الفاتورة" (
	"ID" serial PRIMARY KEY NOT NULL,
	"الرصيد" integer DEFAULT 0 NOT NULL,
	"الفئه" text DEFAULT '' NOT NULL,
	"الفئة" integer,
	"الصنف" text NOT NULL,
	"السعر" text NOT NULL,
	"الكمية" text NOT NULL,
	"الاجمالى" integer NOT NULL,
	"التاريخ" date NOT NULL,
	"اليوم" text NOT NULL,
	"الشهر" text NOT NULL,
	"رقم" integer NOT NULL,
	"purchase_id" integer,
	CONSTRAINT "resident_invoice_lines_total_check" CHECK ("اطراف الفاتورة"."الاجمالى" > 0)
);
--> statement-breakpoint
CREATE TABLE "resident_invoice_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" integer NOT NULL,
	"kind" "invoice_payment_kind" DEFAULT 'payment' NOT NULL,
	"amount" integer NOT NULL,
	"payment_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "resident_invoice_payments_amount_check" CHECK ("resident_invoice_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "resident_invoice_voids" (
	"invoice_number" integer PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"voided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "راس الفاتورة" (
	"ID" serial NOT NULL,
	"رقم الفاتورة" serial PRIMARY KEY NOT NULL,
	"تاريخ الفاتورة" date NOT NULL,
	"اسم النزيل" integer,
	"resident_id" uuid,
	"sale_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "راس الفاتورة_ID_unique" UNIQUE("ID"),
	CONSTRAINT "resident_invoices_sale_type_check" CHECK ("راس الفاتورة"."sale_type" IN ('resident', 'cash')),
	CONSTRAINT "resident_invoices_sale_resident_check" CHECK (("راس الفاتورة"."sale_type" = 'resident' AND "راس الفاتورة"."resident_id" IS NOT NULL) OR ("راس الفاتورة"."sale_type" = 'cash' AND "راس الفاتورة"."resident_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "مشتريات النزلاء" (
	"ID" serial PRIMARY KEY NOT NULL,
	"الصنف" text NOT NULL,
	"السعر" double precision NOT NULL,
	"اضافة" boolean DEFAULT false NOT NULL,
	"canteen_item_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "resident_purchases_price_check" CHECK ("مشتريات النزلاء"."السعر" >= 0)
);
--> statement-breakpoint
ALTER TABLE "invoice_stock_movement_links" ADD CONSTRAINT "invoice_stock_movement_links_invoice_line_id_اطراف الفاتورة_ID_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."اطراف الفاتورة"("ID") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_stock_movement_links" ADD CONSTRAINT "invoice_stock_movement_links_movement_id_طرف الكانين_ID1_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."طرف الكانين"("ID1") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "اطراف الفاتورة" ADD CONSTRAINT "اطراف الفاتورة_الفئة_الفئة_ID_fk" FOREIGN KEY ("الفئة") REFERENCES "public"."الفئة"("ID") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "اطراف الفاتورة" ADD CONSTRAINT "اطراف الفاتورة_رقم_راس الفاتورة_رقم الفاتورة_fk" FOREIGN KEY ("رقم") REFERENCES "public"."راس الفاتورة"("رقم الفاتورة") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "اطراف الفاتورة" ADD CONSTRAINT "اطراف الفاتورة_purchase_id_مشتريات النزلاء_ID_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."مشتريات النزلاء"("ID") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_invoice_payments" ADD CONSTRAINT "resident_invoice_payments_invoice_number_راس الفاتورة_رقم الفاتورة_fk" FOREIGN KEY ("invoice_number") REFERENCES "public"."راس الفاتورة"("رقم الفاتورة") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_invoice_payments" ADD CONSTRAINT "resident_invoice_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_invoice_voids" ADD CONSTRAINT "resident_invoice_voids_invoice_number_راس الفاتورة_رقم الفاتورة_fk" FOREIGN KEY ("invoice_number") REFERENCES "public"."راس الفاتورة"("رقم الفاتورة") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_invoice_voids" ADD CONSTRAINT "resident_invoice_voids_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "راس الفاتورة" ADD CONSTRAINT "راس الفاتورة_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "راس الفاتورة" ADD CONSTRAINT "راس الفاتورة_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "مشتريات النزلاء" ADD CONSTRAINT "مشتريات النزلاء_canteen_item_number_كانتين_رقم الصنف_fk" FOREIGN KEY ("canteen_item_number") REFERENCES "public"."كانتين"("رقم الصنف") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "مشتريات النزلاء" ADD CONSTRAINT "مشتريات النزلاء_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resident_invoice_lines_invoice_number_idx" ON "اطراف الفاتورة" USING btree ("رقم");--> statement-breakpoint
CREATE INDEX "resident_invoice_lines_category_id_idx" ON "اطراف الفاتورة" USING btree ("الفئة");--> statement-breakpoint
CREATE INDEX "resident_invoice_payments_invoice_number_idx" ON "resident_invoice_payments" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "resident_invoices_resident_id_idx" ON "راس الفاتورة" USING btree ("resident_id");--> statement-breakpoint
CREATE INDEX "resident_invoices_invoice_date_idx" ON "راس الفاتورة" USING btree ("تاريخ الفاتورة");--> statement-breakpoint
CREATE UNIQUE INDEX "resident_purchases_item_name_unique" ON "مشتريات النزلاء" USING btree ("الصنف");
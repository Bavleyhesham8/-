CREATE TYPE "public"."meat_sale_payment_kind" AS ENUM('payment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."refrigerator_movement_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TABLE "meat_sale_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" integer NOT NULL,
	"kind" "meat_sale_payment_kind" DEFAULT 'payment' NOT NULL,
	"amount" double precision NOT NULL,
	"payment_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "meat_sale_payments_amount_check" CHECK ("meat_sale_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "meat_sale_stock_movement_links" (
	"invoice_line_id" integer PRIMARY KEY NOT NULL,
	"movement_id" integer NOT NULL,
	CONSTRAINT "meat_sale_stock_movement_links_movement_id_unique" UNIQUE("movement_id")
);
--> statement-breakpoint
CREATE TABLE "meat_sale_voids" (
	"invoice_number" integer PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"voided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "اطراف فواتير البيع" (
	"ID" serial PRIMARY KEY NOT NULL,
	"الصنف / الفئة" text NOT NULL,
	"السعر" double precision NOT NULL,
	"الكمية" double precision NOT NULL,
	"الاجمالى" double precision NOT NULL,
	"تاريخ البيع" date NOT NULL,
	"رقم" integer NOT NULL,
	"refrigerator_item_number" integer NOT NULL,
	CONSTRAINT "meat_sales_invoice_lines_price_check" CHECK ("اطراف فواتير البيع"."السعر" >= 0),
	CONSTRAINT "meat_sales_invoice_lines_quantity_check" CHECK ("اطراف فواتير البيع"."الكمية" > 0),
	CONSTRAINT "meat_sales_invoice_lines_total_check" CHECK ("اطراف فواتير البيع"."الاجمالى" >= 0)
);
--> statement-breakpoint
CREATE TABLE "فواتير بيع اللحوم" (
	"ID" serial NOT NULL,
	"رقم الفاتورة" serial PRIMARY KEY NOT NULL,
	"تاريخ البيع" date NOT NULL,
	"رقم اذن الصرف" double precision,
	"اسم المستفيد" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "فواتير بيع اللحوم_ID_unique" UNIQUE("ID")
);
--> statement-breakpoint
CREATE TABLE "الاصناف / الفئة" (
	"ID" serial PRIMARY KEY NOT NULL,
	"الصنف / الفئة" text NOT NULL,
	"السعر" double precision NOT NULL,
	"الكمية" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "refrigerator_item_catalog_price_check" CHECK ("الاصناف / الفئة"."السعر" >= 0),
	CONSTRAINT "refrigerator_item_catalog_quantity_check" CHECK ("الاصناف / الفئة"."الكمية" >= 0)
);
--> statement-breakpoint
CREATE TABLE "راس الثلاجة" (
	"ID" serial NOT NULL,
	"رقم الصنف" serial PRIMARY KEY NOT NULL,
	"رقم سند الصرف" double precision,
	"اسم المستفيد" text,
	"الصنف / الفئة" text NOT NULL,
	"catalog_id" integer NOT NULL,
	CONSTRAINT "راس الثلاجة_ID_unique" UNIQUE("ID"),
	CONSTRAINT "راس الثلاجة_catalog_id_unique" UNIQUE("catalog_id")
);
--> statement-breakpoint
CREATE TABLE "اطراف الثلاجة" (
	"ID" serial PRIMARY KEY NOT NULL,
	"الصنف / الفئة" text NOT NULL,
	"الكمية" double precision,
	"السعر" double precision NOT NULL,
	"الاجمالى" double precision NOT NULL,
	"المنصرف" double precision,
	"تاريخ الصرف" date,
	"رقم اذن الصرف" double precision,
	"جهة الصرف" text,
	"رقم الصنف" integer NOT NULL,
	"movement_direction" "refrigerator_movement_direction" NOT NULL,
	"received_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "refrigerator_stock_ledger_price_check" CHECK ("اطراف الثلاجة"."السعر" >= 0),
	CONSTRAINT "refrigerator_stock_ledger_total_check" CHECK ("اطراف الثلاجة"."الاجمالى" >= 0),
	CONSTRAINT "refrigerator_stock_ledger_direction_check" CHECK (("اطراف الثلاجة"."movement_direction" = 'in' AND "اطراف الثلاجة"."الكمية" > 0 AND "اطراف الثلاجة"."received_date" IS NOT NULL AND "اطراف الثلاجة"."المنصرف" IS NULL AND "اطراف الثلاجة"."تاريخ الصرف" IS NULL) OR ("اطراف الثلاجة"."movement_direction" = 'out' AND "اطراف الثلاجة"."المنصرف" > 0 AND "اطراف الثلاجة"."تاريخ الصرف" IS NOT NULL AND "اطراف الثلاجة"."الكمية" IS NULL AND "اطراف الثلاجة"."received_date" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "refrigerator_stock_voids" (
	"movement_id" integer PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"voided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meat_sale_payments" ADD CONSTRAINT "meat_sale_payments_invoice_number_فواتير بيع اللحوم_رقم الفاتورة_fk" FOREIGN KEY ("invoice_number") REFERENCES "public"."فواتير بيع اللحوم"("رقم الفاتورة") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meat_sale_payments" ADD CONSTRAINT "meat_sale_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meat_sale_stock_movement_links" ADD CONSTRAINT "meat_sale_stock_movement_links_invoice_line_id_اطراف فواتير البيع_ID_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."اطراف فواتير البيع"("ID") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meat_sale_stock_movement_links" ADD CONSTRAINT "meat_sale_stock_movement_links_movement_id_اطراف الثلاجة_ID_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."اطراف الثلاجة"("ID") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meat_sale_voids" ADD CONSTRAINT "meat_sale_voids_invoice_number_فواتير بيع اللحوم_رقم الفاتورة_fk" FOREIGN KEY ("invoice_number") REFERENCES "public"."فواتير بيع اللحوم"("رقم الفاتورة") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meat_sale_voids" ADD CONSTRAINT "meat_sale_voids_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "اطراف فواتير البيع" ADD CONSTRAINT "اطراف فواتير البيع_رقم_فواتير بيع اللحوم_رقم الفاتورة_fk" FOREIGN KEY ("رقم") REFERENCES "public"."فواتير بيع اللحوم"("رقم الفاتورة") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "اطراف فواتير البيع" ADD CONSTRAINT "اطراف فواتير البيع_refrigerator_item_number_راس الثلاجة_رقم الصنف_fk" FOREIGN KEY ("refrigerator_item_number") REFERENCES "public"."راس الثلاجة"("رقم الصنف") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "فواتير بيع اللحوم" ADD CONSTRAINT "فواتير بيع اللحوم_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "راس الثلاجة" ADD CONSTRAINT "راس الثلاجة_catalog_id_الاصناف / الفئة_ID_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."الاصناف / الفئة"("ID") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "اطراف الثلاجة" ADD CONSTRAINT "اطراف الثلاجة_رقم الصنف_راس الثلاجة_رقم الصنف_fk" FOREIGN KEY ("رقم الصنف") REFERENCES "public"."راس الثلاجة"("رقم الصنف") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "اطراف الثلاجة" ADD CONSTRAINT "اطراف الثلاجة_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refrigerator_stock_voids" ADD CONSTRAINT "refrigerator_stock_voids_movement_id_اطراف الثلاجة_ID_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."اطراف الثلاجة"("ID") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refrigerator_stock_voids" ADD CONSTRAINT "refrigerator_stock_voids_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meat_sale_payments_invoice_number_idx" ON "meat_sale_payments" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "meat_sales_invoice_lines_invoice_number_idx" ON "اطراف فواتير البيع" USING btree ("رقم");--> statement-breakpoint
CREATE INDEX "meat_sales_invoice_lines_item_number_idx" ON "اطراف فواتير البيع" USING btree ("refrigerator_item_number");--> statement-breakpoint
CREATE INDEX "meat_sales_invoice_date_idx" ON "فواتير بيع اللحوم" USING btree ("تاريخ البيع");--> statement-breakpoint
CREATE UNIQUE INDEX "refrigerator_item_catalog_name_unique" ON "الاصناف / الفئة" USING btree ("الصنف / الفئة");--> statement-breakpoint
CREATE INDEX "refrigerator_stock_ledger_item_number_idx" ON "اطراف الثلاجة" USING btree ("رقم الصنف");--> statement-breakpoint
CREATE INDEX "refrigerator_stock_ledger_received_date_idx" ON "اطراف الثلاجة" USING btree ("received_date");--> statement-breakpoint
CREATE INDEX "refrigerator_stock_ledger_outgoing_date_idx" ON "اطراف الثلاجة" USING btree ("تاريخ الصرف");
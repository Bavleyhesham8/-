CREATE TABLE "اطراف الكانتين" (
	"ID" serial PRIMARY KEY NOT NULL,
	"اسم الصنف" text NOT NULL,
	"الرصيد" double precision NOT NULL,
	"الوارد" double precision,
	"تاريخ" date,
	"المنصرف" double precision,
	"تاريخ المنصرف" date,
	"رقم الصنف" integer NOT NULL,
	"رقم المستند" integer NOT NULL,
	CONSTRAINT "canteen_issue_lines_balance_check" CHECK ("اطراف الكانتين"."الرصيد" >= 0),
	CONSTRAINT "canteen_issue_lines_outgoing_check" CHECK ("اطراف الكانتين"."المنصرف" > 0 AND "اطراف الكانتين"."تاريخ المنصرف" IS NOT NULL AND "اطراف الكانتين"."الوارد" IS NULL AND "اطراف الكانتين"."تاريخ" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "راس الكانتين" (
	"ID" serial PRIMARY KEY NOT NULL,
	"رقم الصنف" integer NOT NULL,
	"المستلم" text NOT NULL,
	"الصنف / الفئة" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "كانتين" (
	"ID" serial NOT NULL,
	"اسم الصنف" text NOT NULL,
	"رقم الصنف" serial PRIMARY KEY NOT NULL,
	CONSTRAINT "كانتين_ID_unique" UNIQUE("ID")
);
--> statement-breakpoint
CREATE TABLE "طرف الكانين" (
	"ID1" serial PRIMARY KEY NOT NULL,
	"الرصيد" double precision NOT NULL,
	"الوارد" double precision,
	"تاريخ الوارد" date,
	"المنصرف" double precision,
	"تاريخ المنصرف" date,
	"رقم" integer NOT NULL,
	CONSTRAINT "canteen_stock_ledger_balance_check" CHECK ("طرف الكانين"."الرصيد" >= 0),
	CONSTRAINT "canteen_stock_ledger_direction_check" CHECK (("طرف الكانين"."الوارد" > 0 AND "طرف الكانين"."تاريخ الوارد" IS NOT NULL AND "طرف الكانين"."المنصرف" IS NULL AND "طرف الكانين"."تاريخ المنصرف" IS NULL) OR ("طرف الكانين"."المنصرف" > 0 AND "طرف الكانين"."تاريخ المنصرف" IS NOT NULL AND "طرف الكانين"."الوارد" IS NULL AND "طرف الكانين"."تاريخ الوارد" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "canteen_stock_movement_links" (
	"movement_id" integer PRIMARY KEY NOT NULL,
	"voucher_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canteen_stock_voids" (
	"movement_id" integer PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"voided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_canteen_access" (
	"user_id" text PRIMARY KEY NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" text
);
--> statement-breakpoint
ALTER TABLE "اطراف الكانتين" ADD CONSTRAINT "اطراف الكانتين_رقم الصنف_كانتين_رقم الصنف_fk" FOREIGN KEY ("رقم الصنف") REFERENCES "public"."كانتين"("رقم الصنف") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "اطراف الكانتين" ADD CONSTRAINT "اطراف الكانتين_رقم المستند_راس الكانتين_ID_fk" FOREIGN KEY ("رقم المستند") REFERENCES "public"."راس الكانتين"("ID") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "راس الكانتين" ADD CONSTRAINT "راس الكانتين_رقم الصنف_كانتين_رقم الصنف_fk" FOREIGN KEY ("رقم الصنف") REFERENCES "public"."كانتين"("رقم الصنف") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "راس الكانتين" ADD CONSTRAINT "راس الكانتين_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "طرف الكانين" ADD CONSTRAINT "طرف الكانين_رقم_كانتين_رقم الصنف_fk" FOREIGN KEY ("رقم") REFERENCES "public"."كانتين"("رقم الصنف") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_stock_movement_links" ADD CONSTRAINT "canteen_stock_movement_links_movement_id_طرف الكانين_ID1_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."طرف الكانين"("ID1") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_stock_movement_links" ADD CONSTRAINT "canteen_stock_movement_links_voucher_id_راس الكانتين_ID_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."راس الكانتين"("ID") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_stock_voids" ADD CONSTRAINT "canteen_stock_voids_movement_id_طرف الكانين_ID1_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."طرف الكانين"("ID1") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canteen_stock_voids" ADD CONSTRAINT "canteen_stock_voids_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_canteen_access" ADD CONSTRAINT "user_canteen_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_canteen_access" ADD CONSTRAINT "user_canteen_access_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canteen_issue_lines_item_number_idx" ON "اطراف الكانتين" USING btree ("رقم الصنف");--> statement-breakpoint
CREATE INDEX "canteen_issue_lines_voucher_id_idx" ON "اطراف الكانتين" USING btree ("رقم المستند");--> statement-breakpoint
CREATE INDEX "canteen_issue_vouchers_item_number_idx" ON "راس الكانتين" USING btree ("رقم الصنف");--> statement-breakpoint
CREATE INDEX "canteen_stock_ledger_item_number_idx" ON "طرف الكانين" USING btree ("رقم");--> statement-breakpoint
CREATE INDEX "canteen_stock_movement_links_voucher_id_idx" ON "canteen_stock_movement_links" USING btree ("voucher_id");
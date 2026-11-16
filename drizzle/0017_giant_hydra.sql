CREATE TABLE "import_quarantine" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_table" text NOT NULL,
	"source_id" text NOT NULL,
	"payload" jsonb,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	CONSTRAINT "import_quarantine_status_check" CHECK ("import_quarantine"."status" IN ('pending', 'resolved'))
);
--> statement-breakpoint
ALTER TABLE "اطراف الثلاجة" DROP CONSTRAINT "refrigerator_stock_ledger_direction_check";--> statement-breakpoint
ALTER TABLE "اطراف الثلاجة" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف المخزن" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "import_quarantine" ADD CONSTRAINT "import_quarantine_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_quarantine_source_unique" ON "import_quarantine" USING btree ("source_table","source_id");--> statement-breakpoint
CREATE INDEX "import_quarantine_status_created_idx" ON "import_quarantine" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "import_quarantine_resolved_by_idx" ON "import_quarantine" USING btree ("resolved_by");--> statement-breakpoint
CREATE INDEX "refrigerator_stock_ledger_needs_review_idx" ON "اطراف الثلاجة" USING btree ("needs_review");--> statement-breakpoint
CREATE INDEX "warehouse_details_needs_review_idx" ON "اطراف المخزن" USING btree ("needs_review");--> statement-breakpoint
ALTER TABLE "اطراف الثلاجة" ADD CONSTRAINT "refrigerator_stock_ledger_direction_check" CHECK (("اطراف الثلاجة"."movement_direction" = 'in' AND "اطراف الثلاجة"."الكمية" > 0 AND ("اطراف الثلاجة"."received_date" IS NOT NULL OR "اطراف الثلاجة"."needs_review" = true) AND "اطراف الثلاجة"."المنصرف" IS NULL AND "اطراف الثلاجة"."تاريخ الصرف" IS NULL) OR ("اطراف الثلاجة"."movement_direction" = 'out' AND "اطراف الثلاجة"."المنصرف" > 0 AND "اطراف الثلاجة"."تاريخ الصرف" IS NOT NULL AND "اطراف الثلاجة"."الكمية" IS NULL AND "اطراف الثلاجة"."received_date" IS NULL));
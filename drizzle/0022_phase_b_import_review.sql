DROP INDEX "resident_purchases_item_name_unique";--> statement-breakpoint
ALTER TABLE "العهدة" ALTER COLUMN "الكمية" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "العهدة" ALTER COLUMN "التاريخ" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "العهدة" ALTER COLUMN "warehouse_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "راس العهدة" ALTER COLUMN "التاريخ" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "راس العهدة" ALTER COLUMN "recipient_employee_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف الكانتين" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "راس الكانتين" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "كانتين" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "العهدة" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "راس العهدة" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "مشتريات النزلاء" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "canteen_issue_lines_needs_review_idx" ON "اطراف الكانتين" USING btree ("needs_review");--> statement-breakpoint
CREATE INDEX "canteen_issue_vouchers_needs_review_idx" ON "راس الكانتين" USING btree ("needs_review");--> statement-breakpoint
CREATE INDEX "canteen_products_needs_review_idx" ON "كانتين" USING btree ("needs_review");--> statement-breakpoint
CREATE INDEX "custody_details_needs_review_idx" ON "العهدة" USING btree ("needs_review");--> statement-breakpoint
CREATE INDEX "custody_headers_needs_review_idx" ON "راس العهدة" USING btree ("needs_review");--> statement-breakpoint
CREATE INDEX "resident_purchases_needs_review_idx" ON "مشتريات النزلاء" USING btree ("needs_review");
CREATE INDEX "canteen_issue_vouchers_created_by_idx" ON "راس الكانتين" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "canteen_stock_voids_voided_by_idx" ON "canteen_stock_voids" USING btree ("voided_by");--> statement-breakpoint
CREATE INDEX "custody_details_warehouse_number_idx" ON "العهدة" USING btree ("warehouse_number");--> statement-breakpoint
CREATE INDEX "custody_events_warehouse_movement_id_idx" ON "custody_events" USING btree ("warehouse_movement_id");--> statement-breakpoint
CREATE INDEX "custody_events_created_by_idx" ON "custody_events" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "custody_headers_voided_by_idx" ON "راس العهدة" USING btree ("voided_by");--> statement-breakpoint
CREATE INDEX "custody_headers_created_by_idx" ON "راس العهدة" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "inventory_movements_created_by_idx" ON "inventory_movements" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "inventory_movements_voided_by_idx" ON "inventory_movements" USING btree ("voided_by");--> statement-breakpoint
CREATE INDEX "resident_finance_details_voided_by_idx" ON "اطراف النزيل" USING btree ("voided_by");--> statement-breakpoint
CREATE INDEX "resident_finance_details_created_by_idx" ON "اطراف النزيل" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "legacy_resident_headers_created_by_idx" ON "راس النزيل" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "treatment_details_voided_by_idx" ON "اطراف العلاج" USING btree ("voided_by");--> statement-breakpoint
CREATE INDEX "treatment_details_created_by_idx" ON "اطراف العلاج" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "legacy_treatment_headers_created_by_idx" ON "راس العلاج" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "meat_sale_payments_created_by_idx" ON "meat_sale_payments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "meat_sale_voids_voided_by_idx" ON "meat_sale_voids" USING btree ("voided_by");--> statement-breakpoint
CREATE INDEX "meat_sales_invoices_created_by_idx" ON "فواتير بيع اللحوم" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "refrigerator_stock_ledger_created_by_idx" ON "اطراف الثلاجة" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "refrigerator_stock_voids_voided_by_idx" ON "refrigerator_stock_voids" USING btree ("voided_by");--> statement-breakpoint
CREATE INDEX "resident_invoice_lines_purchase_id_idx" ON "اطراف الفاتورة" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "resident_invoice_payments_created_by_idx" ON "resident_invoice_payments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "resident_invoice_voids_voided_by_idx" ON "resident_invoice_voids" USING btree ("voided_by");--> statement-breakpoint
CREATE INDEX "resident_invoices_resident_number_idx" ON "راس الفاتورة" USING btree ("اسم النزيل");--> statement-breakpoint
CREATE INDEX "resident_invoices_created_by_idx" ON "راس الفاتورة" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "resident_legacy_links_linked_by_idx" ON "resident_legacy_links" USING btree ("linked_by");--> statement-breakpoint
CREATE INDEX "resident_purchases_canteen_item_number_idx" ON "مشتريات النزلاء" USING btree ("canteen_item_number");--> statement-breakpoint
CREATE INDEX "resident_purchases_created_by_idx" ON "مشتريات النزلاء" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "resident_stays_created_by_idx" ON "resident_stays" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "residents_created_by_idx" ON "residents" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "staff_account_links_linked_by_idx" ON "staff_account_links" USING btree ("linked_by");--> statement-breakpoint
CREATE INDEX "staff_attendance_clock_in_by_idx" ON "staff_attendance" USING btree ("clock_in_by");--> statement-breakpoint
CREATE INDEX "staff_attendance_clock_out_by_idx" ON "staff_attendance" USING btree ("clock_out_by");--> statement-breakpoint
CREATE INDEX "staff_profiles_created_by_idx" ON "تحديث البيانات" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "user_canteen_access_granted_by_idx" ON "user_canteen_access" USING btree ("granted_by");--> statement-breakpoint
CREATE INDEX "user_inventory_categories_granted_by_idx" ON "user_inventory_categories" USING btree ("granted_by");--> statement-breakpoint
CREATE INDEX "warehouse_details_custody_detail_id_idx" ON "اطراف المخزن" USING btree ("custody_detail_id");--> statement-breakpoint
CREATE INDEX "warehouse_details_created_by_idx" ON "اطراف المخزن" USING btree ("created_by");
--> statement-breakpoint
ALTER TABLE "راس العهدة" ALTER COLUMN "التاريخ" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "راس العهدة" ALTER COLUMN "العهدة" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "الاصناف" ALTER COLUMN "الاصناف" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف المخزن" ALTER COLUMN "الرصيد" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف المخزن" ALTER COLUMN "الوارد" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف المخزن" ALTER COLUMN "المنصرف" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف المخزن" ALTER COLUMN "المتبقى" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف المخزن" ALTER COLUMN "حذف" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف المخزن" ALTER COLUMN "رقم" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "راس المخزن" ALTER COLUMN "الصنف" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "راس المخزن" ALTER COLUMN "السعر" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "راس المخزن" ALTER COLUMN "المسئول" SET NOT NULL;
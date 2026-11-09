ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'staff';--> statement-breakpoint
ALTER TABLE "كانتين" ADD COLUMN "السعر" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "governorate" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "resident_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "incomplete_stay" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "follow_up" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "graduated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "can_access_clinic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "can_manage_canteen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "can_issue_invoices" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "can_manage_warehouse" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "can_manage_custody" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "can_manage_meat_sales" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "allowed_screens" text DEFAULT '' NOT NULL;
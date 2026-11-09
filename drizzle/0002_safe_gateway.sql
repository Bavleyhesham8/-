ALTER TABLE "inventory_movements" ADD COLUMN "voided" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
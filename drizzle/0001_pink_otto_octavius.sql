CREATE TYPE "public"."inventory_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TABLE "inventory_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'وحدة' NOT NULL,
	"unit_price" double precision DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_unit_price_check" CHECK ("inventory_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"direction" "inventory_direction" NOT NULL,
	"quantity" double precision NOT NULL,
	"unit_price" double precision DEFAULT 0 NOT NULL,
	"movement_date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "inventory_movements_quantity_check" CHECK ("inventory_movements"."quantity" > 0),
	CONSTRAINT "inventory_movements_unit_price_check" CHECK ("inventory_movements"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_inventory_categories" (
	"user_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" text,
	CONSTRAINT "user_inventory_categories_pk" PRIMARY KEY("user_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_category_id_inventory_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_inventory_categories" ADD CONSTRAINT "user_inventory_categories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_inventory_categories" ADD CONSTRAINT "user_inventory_categories_category_id_inventory_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_inventory_categories" ADD CONSTRAINT "user_inventory_categories_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_categories_active_idx" ON "inventory_categories" USING btree ("active");--> statement-breakpoint
CREATE INDEX "inventory_items_category_id_idx" ON "inventory_items" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_category_name_unique" ON "inventory_items" USING btree ("category_id","name");--> statement-breakpoint
CREATE INDEX "inventory_items_active_idx" ON "inventory_items" USING btree ("active");--> statement-breakpoint
CREATE INDEX "inventory_movements_item_id_idx" ON "inventory_movements" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_date_idx" ON "inventory_movements" USING btree ("movement_date");--> statement-breakpoint
CREATE INDEX "user_inventory_categories_category_id_idx" ON "user_inventory_categories" USING btree ("category_id");--> statement-breakpoint
INSERT INTO "inventory_categories" ("id", "name") VALUES
	('90000000-0000-4000-8000-000000000001', 'المخازن'),
	('90000000-0000-4000-8000-000000000002', 'الكانتين'),
	('90000000-0000-4000-8000-000000000003', 'الثلاجة')
ON CONFLICT ("name") DO NOTHING;
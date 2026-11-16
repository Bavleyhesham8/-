CREATE TABLE "center_custody_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" text NOT NULL,
  "transaction_date" date NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "unit" text NOT NULL DEFAULT '',
  "quantity" double precision NOT NULL DEFAULT 0,
  "unit_price" double precision NOT NULL DEFAULT 0,
  "amount" double precision NOT NULL,
  "target_balance" double precision NOT NULL DEFAULT 15000,
  "balance_after" double precision NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" text
);
--> statement-breakpoint
ALTER TABLE "center_custody_transactions" ADD CONSTRAINT "center_custody_transactions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "center_custody_transactions" ADD CONSTRAINT "center_custody_transactions_kind_check" CHECK ("kind" IN ('expense', 'replenishment'));
--> statement-breakpoint
ALTER TABLE "center_custody_transactions" ADD CONSTRAINT "center_custody_transactions_amount_check" CHECK ("amount" > 0);
--> statement-breakpoint
CREATE INDEX "center_custody_transactions_date_idx" ON "center_custody_transactions" USING btree ("transaction_date");

CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_number" integer NOT NULL,
	"clock_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_out_at" timestamp with time zone,
	"clock_in_by" text NOT NULL,
	"clock_out_by" text
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_employee_number_الموظفين_رقم الموظف_fk" FOREIGN KEY ("employee_number") REFERENCES "public"."الموظفين"("رقم الموظف") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_clock_in_by_user_id_fk" FOREIGN KEY ("clock_in_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_clock_out_by_user_id_fk" FOREIGN KEY ("clock_out_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_actor_occurred_idx" ON "audit_logs" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_occurred_idx" ON "audit_logs" USING btree ("entity","occurred_at");--> statement-breakpoint
CREATE INDEX "staff_attendance_employee_clock_in_idx" ON "staff_attendance" USING btree ("employee_number","clock_in_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_attendance_one_open_per_employee_idx" ON "staff_attendance" USING btree ("employee_number") WHERE "staff_attendance"."clock_out_at" is null;
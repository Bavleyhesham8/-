-- إضافة صلاحية إدارة البوابة للمستخدمين
ALTER TABLE "user" 
ADD COLUMN IF NOT EXISTS "can_manage_gate" boolean NOT NULL DEFAULT false;

-- إنشاء جدول زوار المركز
CREATE TABLE IF NOT EXISTS "gate_visitors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "national_id" text NOT NULL DEFAULT '',
  "phone" text NOT NULL DEFAULT '',
  "notes" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "gate_visitors_national_id_unique"
  ON "gate_visitors" ("national_id")
  WHERE "national_id" <> '';

CREATE INDEX IF NOT EXISTS "gate_visitors_name_idx" ON "gate_visitors" ("name");
CREATE INDEX IF NOT EXISTS "gate_visitors_created_by_idx" ON "gate_visitors" ("created_by");

-- إنشاء جدول سجل حركات الدخول والخروج للبوابة
CREATE TABLE IF NOT EXISTS "gate_visits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "person_kind" text NOT NULL,
  "resident_id" uuid REFERENCES "residents"("id") ON DELETE SET NULL,
  "employee_number" integer REFERENCES "الموظفين"("رقم الموظف") ON DELETE SET NULL,
  "visitor_id" uuid REFERENCES "gate_visitors"("id") ON DELETE SET NULL,
  "person_name" text NOT NULL,
  "national_id" text NOT NULL DEFAULT '',
  "entry_at" timestamp with time zone NOT NULL DEFAULT now(),
  "exit_at" timestamp with time zone,
  "notes" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "gate_visits_person_kind_check" CHECK ("person_kind" IN ('resident', 'employee', 'visitor')),
  CONSTRAINT "gate_visits_exit_after_entry_check" CHECK ("exit_at" IS NULL OR "exit_at" >= "entry_at")
);

CREATE INDEX IF NOT EXISTS "gate_visits_entry_at_idx" ON "gate_visits" ("entry_at");
CREATE INDEX IF NOT EXISTS "gate_visits_exit_at_idx" ON "gate_visits" ("exit_at");
CREATE INDEX IF NOT EXISTS "gate_visits_resident_id_idx" ON "gate_visits" ("resident_id");
CREATE INDEX IF NOT EXISTS "gate_visits_employee_number_idx" ON "gate_visits" ("employee_number");
CREATE INDEX IF NOT EXISTS "gate_visits_visitor_id_idx" ON "gate_visits" ("visitor_id");
CREATE INDEX IF NOT EXISTS "gate_visits_created_by_idx" ON "gate_visits" ("created_by");

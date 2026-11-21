-- إضافة الوظيفة وبيانات السيارة إلى ملفات الزوار وسجل الزيارات
ALTER TABLE "gate_visitors"
  ADD COLUMN IF NOT EXISTS "job_title" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "car_number" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "car_type" text NOT NULL DEFAULT '';

ALTER TABLE "gate_visits"
  ADD COLUMN IF NOT EXISTS "job_title" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "car_number" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "car_type" text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "gate_visits_job_title_idx"
  ON "gate_visits" ("job_title");

CREATE INDEX IF NOT EXISTS "gate_visits_car_number_idx"
  ON "gate_visits" ("car_number");

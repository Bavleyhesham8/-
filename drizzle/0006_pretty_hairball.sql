CREATE TABLE "staff_account_links" (
	"user_id" text PRIMARY KEY NOT NULL,
	"profile_number" integer NOT NULL,
	"employee_number" integer NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_by" text,
	CONSTRAINT "staff_account_links_profile_number_unique" UNIQUE("profile_number"),
	CONSTRAINT "staff_account_links_employee_number_unique" UNIQUE("employee_number")
);
--> statement-breakpoint
CREATE TABLE "الموظفين" (
	"رقم الموظف" integer PRIMARY KEY NOT NULL,
	"اسم الموظف / العامل" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "اطراف الموظفين" (
	"ID" serial PRIMARY KEY NOT NULL,
	"تاريخ النزول" date NOT NULL,
	"تاريخ العودة" date NOT NULL,
	"نوع الاجازة" text NOT NULL,
	"ملاحظات" text,
	"رقم" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "staff_leave_dates_check" CHECK ("اطراف الموظفين"."تاريخ العودة" >= "اطراف الموظفين"."تاريخ النزول")
);
--> statement-breakpoint
CREATE TABLE "تحديث البيانات" (
	"ID1" serial PRIMARY KEY NOT NULL,
	"ID" text,
	"الاسم الاول" text,
	"الاسم الثالث" text,
	"الرقم القومى" text,
	"العنوان" text,
	"المحافظة" text,
	"المركز / الحى" text,
	"تاريخ الميلاد" date,
	"الحالة الاجتماعية" text,
	"الموهل الدراسى" text,
	"تاريخ الالتحاق بالعمل" date,
	"الموبايل" text,
	"الكنيسة التابع لها" text,
	"أب الاعتراف" text,
	"رقم اب الاعتراف" text,
	"الطائفة" text,
	"اماكن العمل السابقة" text,
	"برامج الكمبيوتر" text,
	"تخصص العمل" text,
	"مكتب التوظيف" text,
	"صورة" text,
	"ملاحظات" text,
	"ImagePath" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "staff_account_links" ADD CONSTRAINT "staff_account_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_account_links" ADD CONSTRAINT "staff_account_links_profile_number_تحديث البيانات_ID1_fk" FOREIGN KEY ("profile_number") REFERENCES "public"."تحديث البيانات"("ID1") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_account_links" ADD CONSTRAINT "staff_account_links_employee_number_الموظفين_رقم الموظف_fk" FOREIGN KEY ("employee_number") REFERENCES "public"."الموظفين"("رقم الموظف") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_account_links" ADD CONSTRAINT "staff_account_links_linked_by_user_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "اطراف الموظفين" ADD CONSTRAINT "اطراف الموظفين_رقم_الموظفين_رقم الموظف_fk" FOREIGN KEY ("رقم") REFERENCES "public"."الموظفين"("رقم الموظف") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "اطراف الموظفين" ADD CONSTRAINT "اطراف الموظفين_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "تحديث البيانات" ADD CONSTRAINT "تحديث البيانات_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_leave_employee_number_idx" ON "اطراف الموظفين" USING btree ("رقم");--> statement-breakpoint
CREATE INDEX "staff_leave_date_idx" ON "اطراف الموظفين" USING btree ("تاريخ النزول");--> statement-breakpoint
CREATE INDEX "staff_profiles_employee_id_idx" ON "تحديث البيانات" USING btree ("ID");--> statement-breakpoint
CREATE INDEX "staff_profiles_name_idx" ON "تحديث البيانات" USING btree ("الاسم الاول","الاسم الثالث");
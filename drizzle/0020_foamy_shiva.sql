ALTER TABLE "اطراف فواتير البيع" ALTER COLUMN "الاجمالى" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف الثلاجة" ALTER COLUMN "السعر" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف الثلاجة" ALTER COLUMN "الاجمالى" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف المخزن" ALTER COLUMN "الرصيد" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف المخزن" ALTER COLUMN "الوارد" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف المخزن" ALTER COLUMN "المنصرف" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "اطراف المخزن" ALTER COLUMN "المتبقى" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "راس المخزن" ALTER COLUMN "السعر" DROP NOT NULL;
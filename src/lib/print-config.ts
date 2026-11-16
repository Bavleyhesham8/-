const fallbackChurchName = "كنيسة الشهيد العظيم مارمرقس — مصر الجديدة";

function publicValue(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/**
 * إعدادات الهوية الظاهرة في كل وثيقة مطبوعة.
 * يمكن تغييرها من متغيرات البيئة دون تعديل الكود:
 * NEXT_PUBLIC_CENTER_NAME / NEXT_PUBLIC_CHURCH_NAME /
 * NEXT_PUBLIC_CENTER_LOGO_PATH / NEXT_PUBLIC_CENTER_ADDRESS /
 * NEXT_PUBLIC_CENTER_PHONE
 */
export const printConfig = {
  centerName: publicValue(
    process.env.NEXT_PUBLIC_CENTER_NAME,
    "مركز قيثارة داود للتأهيل والتعافي",
  ),
  churchName: publicValue(
    process.env.NEXT_PUBLIC_CHURCH_NAME,
    fallbackChurchName,
  ),
  logoPath: publicValue(
    process.env.NEXT_PUBLIC_CENTER_LOGO_PATH,
    "/david-lyre-logo-v2.svg",
  ),
  address: publicValue(
    process.env.NEXT_PUBLIC_CENTER_ADDRESS,
    "مصر الجديدة — القاهرة",
  ),
  phone: publicValue(process.env.NEXT_PUBLIC_CENTER_PHONE, ""),
  systemName: "نظام إدارة ومتابعة النزلاء",
} as const;

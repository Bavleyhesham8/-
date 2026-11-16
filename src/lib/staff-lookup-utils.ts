import type { LookupData } from "@/lib/lookup-types";
import type { StaffProfile } from "@/lib/staff-types";

type StaffLocationFields = Pick<
  StaffProfile,
  "church" | "governorate" | "district"
>;

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().normalize("NFC");
}

function nextLookupId(rows: { id: number }[]) {
  return Math.max(0, ...rows.map((row) => row.id)) + 1;
}

/**
 * يضيف كنيسة الموظف أو محافظته/مركزه الجديد إلى قوائم الاقتراحات المحلية
 * بعد حفظ الملف، حتى تظهر القيمة فورًا دون انتظار إعادة تحميل الصفحة.
 * الخادم يضيف القيم نفسها إلى جداول البيانات المرجعية في الوضع الدائم.
 */
export function mergeStaffProfileLookups(
  lookups: LookupData,
  profile: StaffLocationFields,
): LookupData {
  const church = normalize(profile.church);
  const governorate = normalize(profile.governorate);
  const district = normalize(profile.district);

  const churchExists =
    !church ||
    lookups.churches.some((entry) => normalize(entry.name) === church);
  const locationExists =
    !governorate ||
    !district ||
    lookups.governorates.some(
      (entry) =>
        normalize(entry.governorate) === governorate &&
        normalize(entry.district) === district,
    );

  if (churchExists && locationExists) return lookups;

  return {
    ...lookups,
    churches: churchExists
      ? lookups.churches
      : [
          ...lookups.churches,
          {
            id: nextLookupId(lookups.churches),
            number: null,
            name: church,
            acheshe: null,
          },
        ],
    governorates: locationExists
      ? lookups.governorates
      : [
          ...lookups.governorates,
          {
            id: nextLookupId(lookups.governorates),
            governorate,
            district,
          },
        ],
  };
}

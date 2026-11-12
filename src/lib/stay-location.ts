/** توحيد قيم الفيلا والغرفة بين سجلات Access والواجهة. */

const VILLA_LETTERS = new Set(["A", "B", "C", "D"]);

export function normalizeLocationText(value: string | null | undefined) {
  return (value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

/** يستخرج حرف الفيلا A-D من قيم مثل «فيلا A» أو «A» أو «فيلا  B». */
export function villaLetter(value: string | null | undefined) {
  const normalized = normalizeLocationText(value)
    .replace(/^فيلا\s*/i, "")
    .replace(/[أإآ]/g, "ا")
    .trim()
    .toLocaleUpperCase("en-US");
  return VILLA_LETTERS.has(normalized) ? normalized : "";
}

export function isVillaLocation(value: string | null | undefined) {
  return Boolean(villaLetter(value));
}

/** القيمة المعتمدة المخزنة في عمود الفيلا: A أو B أو C أو D. */
export function canonicalVilla(value: string | null | undefined) {
  return villaLetter(value);
}

/** أي قيمة غير تابعة لفيلا A-D تُعد غرفة. */
export function canonicalRoom(value: string | null | undefined) {
  const normalized = normalizeLocationText(value);
  if (!normalized || isVillaLocation(normalized)) return "";
  return normalized.replace(/^غرفة\s*/i, "").trim();
}

export function formatVilla(value: string | null | undefined) {
  const letter = villaLetter(value);
  if (letter) return `فيلا ${letter}`;
  return normalizeLocationText(value);
}

export function formatRoom(value: string | null | undefined) {
  const room = canonicalRoom(value);
  if (!room) return "";
  return /^غرفة/i.test(normalizeLocationText(value)) ? normalizeLocationText(value) : `غرفة ${room}`;
}

/**
 * مطابقة أسماء النزلاء بين سجلات Access القديمة وسجل النزلاء الحديث.
 *
 * أرقام النزيل القديمة (`nam.Nom`) غير فريدة، لذلك الاعتماد الأساسي على الاسم
 * مع تطبيع عربي ومطابقة تقريبية للأسماء المختصرة أو المكتوبة بخطأ إملائي.
 * الرقم يُستخدم فقط لترجيح المرشح عند تقارب الدرجات.
 */

export type ResidentNameCandidate = {
  id?: string | null;
  name: string;
  residentNumber?: string | number | null;
  fileNumber?: string | null;
};

export type ResidentMatch<T> = {
  resident: T;
  score: number;
  ambiguous: boolean;
  exact: boolean;
};

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/** تطبيع الاسم للمقارنة: إزالة التشكيل وتوحيد الحروف المتشابهة. */
export function normalizeArabicName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/[ةه]/g, "ه")
    .replace(/[ؤو]/g, "و")
    .replace(/[ئ]/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ar");
}

export function residentNameTokens(value: string | null | undefined) {
  return normalizeArabicName(value).split(" ").filter(Boolean);
}

/** هيكل الحروف: حذف حروف المد لتقريب (شجيع/شجع) و(متّى/متي). */
function consonantSkeleton(token: string) {
  return token.replace(/[اويى]/g, "");
}

function levenshtein(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function tokenScore(left: string, right: string) {
  if (left === right) return 1;
  const leftSkeleton = consonantSkeleton(left);
  const rightSkeleton = consonantSkeleton(right);
  if (
    leftSkeleton === rightSkeleton &&
    Math.min(leftSkeleton.length, rightSkeleton.length) >= 3
  ) {
    return 0.96;
  }
  if (
    left.length >= 3 &&
    right.length >= 3 &&
    (left.startsWith(right) || right.startsWith(left))
  ) {
    return 0.9;
  }
  if (Math.min(left.length, right.length) >= 5) {
    const distance = levenshtein(left, right);
    if (distance === 1) return 0.88;
    if (distance === 2 && Math.max(left.length, right.length) >= 7) return 0.8;
  }
  return 0;
}

/**
 * درجة تشابه بين اسمين من 0 إلى 1.
 * تعطي الأولوية لتغطية اسم السجل القديم بالكامل داخل اسم النزيل.
 */
export function residentNameScore(
  legacyName: string | null | undefined,
  residentName: string | null | undefined,
) {
  const query = residentNameTokens(legacyName);
  const target = residentNameTokens(residentName);
  if (!query.length || !target.length) return 0;
  if (query.join(" ") === target.join(" ")) return 1;

  let matched = 0;
  const used = new Set<number>();
  for (const queryToken of query) {
    let best = 0;
    let bestIndex = -1;
    for (let index = 0; index < target.length; index += 1) {
      if (used.has(index)) continue;
      const score = tokenScore(queryToken, target[index]);
      if (score > best) {
        best = score;
        bestIndex = index;
      }
    }
    if (best >= 0.8) {
      matched += best;
      used.add(bestIndex);
    }
  }

  if (matched === 0) return 0;

  // الاسم الأول في السجل القديم يجب أن يطابق أحد الاسمين الأولين في السجل الحديث.
  const firstNameMatched = target
    .slice(0, 2)
    .some((token) => tokenScore(query[0], token) >= 0.8);
  if (!firstNameMatched) return 0;

  const coverage = matched / query.length;
  const containment = matched / target.length;
  return coverage * 0.72 + containment * 0.28;
}

function sameNumber(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
) {
  const leftValue = String(left ?? "").trim();
  const rightValue = String(right ?? "").trim();
  return Boolean(leftValue) && leftValue === rightValue;
}

const MATCH_THRESHOLD = 0.66;
const AMBIGUITY_MARGIN = 0.045;

/** يختار أفضل نزيل مطابق لاسم سجل قديم. */
export function findResidentByName<T extends ResidentNameCandidate>(
  legacyName: string | null | undefined,
  residents: T[],
  legacyNumber?: string | number | null,
): ResidentMatch<T> | null {
  if (!legacyName?.trim() || !residents.length) return null;
  const scored = residents
    .map((resident) => {
      const base = residentNameScore(legacyName, resident.name);
      const numberMatch =
        sameNumber(legacyNumber, resident.residentNumber) ||
        sameNumber(legacyNumber, resident.fileNumber);
      return {
        resident,
        score: Math.min(1, base + (numberMatch ? 0.05 : 0)),
        numberMatch,
      };
    })
    .filter((entry) => entry.score >= MATCH_THRESHOLD)
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (!best) return null;
  const runnerUp = scored[1];
  const ambiguous = Boolean(
    runnerUp &&
      !best.numberMatch &&
      !runnerUp.numberMatch &&
      best.score - runnerUp.score < AMBIGUITY_MARGIN,
  );
  return {
    resident: best.resident,
    score: best.score,
    ambiguous,
    exact: residentNameScore(legacyName, best.resident.name) === 1,
  };
}

/** يختار أفضل سجل قديم لنزيل معروف (للكشف الموحد والتقارير). */
export function findRecordForResident<
  T extends {
    residentId?: string | null;
    residentName?: string | null;
    residentNumber?: number | string | null;
  },
>(resident: ResidentNameCandidate, records: T[]): T | undefined {
  if (resident.id) {
    const byId = records.find((record) => record.residentId === resident.id);
    if (byId) return byId;
  }

  const residentNumbers = [resident.residentNumber, resident.fileNumber]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const byNumber = records.filter((record) =>
    residentNumbers.some((number) => sameNumber(record.residentNumber, number)),
  );
  if (byNumber.length === 1) return byNumber[0];

  let best: { record: T; score: number } | null = null;
  for (const record of records) {
    const nameScore = residentNameScore(record.residentName, resident.name);
    if (!nameScore) continue;
    const score = nameScore +
      (sameNumber(record.residentNumber, resident.residentNumber) ? 0.05 : 0);
    if (!best || score > best.score) best = { record, score };
  }
  return best && best.score >= MATCH_THRESHOLD ? best.record : undefined;
}

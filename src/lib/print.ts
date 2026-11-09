export type PrintMode = "view" | "document";

const printClasses = ["print-current-view", "print-document-only"] as const;

function clearPrintClasses() {
  document.body.classList.remove(...printClasses);
}

/**
 * يطبع الشاشة الحالية مع إمكانية التحكم في العناصر الظاهرة عبر فئات body
 * (print-hide-brand / print-show-filters / print-show-demo).
 */
export function printCurrentView() {
  clearPrintClasses();
  document.body.classList.add("print-current-view");
  const cleanup = () => {
    clearPrintClasses();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

/**
 * يطبع وثيقة داخل نافذة منبثقة فقط (ملف النزيل / كشف الحساب) دون خلفية اللوحة.
 */
export function printDocument() {
  clearPrintClasses();
  document.body.classList.add("print-document-only");
  const cleanup = () => {
    clearPrintClasses();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

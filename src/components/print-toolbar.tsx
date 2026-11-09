"use client";

import { useEffect, useState } from "react";
import { printCurrentView } from "@/lib/print";

type Orientation = "portrait" | "landscape";
type PrintSection = "both" | "summary" | "detail";

export default function PrintToolbar() {
  const [open, setOpen] = useState(false);
  const [showBrand, setShowBrand] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showDemoNote, setShowDemoNote] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [printSection, setPrintSection] = useState<PrintSection>("both");

  useEffect(() => {
    document.body.classList.toggle("print-hide-brand", !showBrand);
    document.body.classList.toggle("print-show-filters", showFilters);
    document.body.classList.toggle("print-show-demo", showDemoNote);
    document.body.classList.toggle(
      "print-only-summary",
      printSection === "summary",
    );
    document.body.classList.toggle(
      "print-only-detail",
      printSection === "detail",
    );
  }, [showBrand, showFilters, showDemoNote, printSection]);

  useEffect(() => {
    let style = document.getElementById(
      "print-orientation-style",
    ) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "print-orientation-style";
      document.head.append(style);
    }
    style.textContent = `@media print { @page { size: A4 ${orientation}; margin: 8mm; } }`;
  }, [orientation]);

  useEffect(
    () => () => {
      document.body.classList.remove(
        "print-hide-brand",
        "print-show-filters",
        "print-show-demo",
        "print-only-summary",
        "print-only-detail",
      );
    },
    [],
  );

  return (
    <div className="print-toolbar no-print">
      <button
        className="primary-button"
        type="button"
        onClick={printCurrentView}
        title="طباعة الشاشة الحالية أو حفظها PDF"
      >
        <span aria-hidden="true">🖨️</span>
        طباعة الشاشة
      </button>
      <button
        className="secondary-button"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        إعدادات الطباعة
      </button>

      {open && (
        <div className="print-toolbar-menu" role="dialog" aria-label="إعدادات الطباعة">
          <p className="print-toolbar-title">تحكم في محتوى الطباعة</p>
          <label className="print-toolbar-option">
            <input
              type="checkbox"
              checked={showBrand}
              onChange={(event) => setShowBrand(event.target.checked)}
            />
            إظهار الشعار واسم الكنيسة والمركز
          </label>
          <label className="print-toolbar-option">
            <input
              type="checkbox"
              checked={showFilters}
              onChange={(event) => setShowFilters(event.target.checked)}
            />
            إظهار عوامل التصفية في الورقة
          </label>
          <label className="print-toolbar-option">
            <input
              type="checkbox"
              checked={showDemoNote}
              onChange={(event) => setShowDemoNote(event.target.checked)}
            />
            إظهار ملاحظة البيانات التجريبية
          </label>
          <label className="print-toolbar-option print-toolbar-select">
            اتجاه الورقة
            <select
              value={orientation}
              onChange={(event) =>
                setOrientation(event.target.value as Orientation)
              }
            >
              <option value="portrait">طولي (Portrait)</option>
              <option value="landscape">عرضي (Landscape)</option>
            </select>
          </label>
          <label className="print-toolbar-option print-toolbar-select">
            محتوى الطباعة
            <select
              value={printSection}
              onChange={(event) =>
                setPrintSection(event.target.value as PrintSection)
              }
            >
              <option value="both">الملخص + التفاصيل</option>
              <option value="summary">الملخص فقط</option>
              <option value="detail">التفاصيل فقط</option>
            </select>
          </label>
          <p className="print-toolbar-hint">
            تُطبق الإعدادات على زر «طباعة الشاشة» وعلى أزرار الطباعة داخل
            التقارير.
          </p>
        </div>
      )}
    </div>
  );
}

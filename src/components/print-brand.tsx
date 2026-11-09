"use client";

import { useState } from "react";
import { printConfig } from "@/lib/print-config";

type PrintBrandProps = {
  title?: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
};

export default function PrintBrand({
  title,
  subtitle,
  meta = [],
}: PrintBrandProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const printDate = new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "long",
  }).format(new Date());

  return (
    <header className="print-brand" dir="rtl">
      <div className="print-brand-side print-brand-logo">
        {logoFailed ? (
          <span className="print-brand-fallback" aria-hidden="true">
            ق
          </span>
        ) : (
          // الشعار يُطبع كما هو دون تحسين Next/Image لأنه قد يكون ملفًا محليًا أو SVG.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={printConfig.logoPath}
            alt={`شعار ${printConfig.centerName}`}
            onError={() => setLogoFailed(true)}
          />
        )}
      </div>

      <div className="print-brand-main">
        <p className="print-brand-church">{printConfig.churchName}</p>
        <h1 className="print-brand-center">{printConfig.centerName}</h1>
        <p className="print-brand-system">{printConfig.systemName}</p>
        {title && <h2 className="print-brand-title">{title}</h2>}
        {subtitle && <p className="print-brand-subtitle">{subtitle}</p>}
      </div>

      <div className="print-brand-side print-brand-meta">
        <span>تاريخ الطباعة</span>
        <strong suppressHydrationWarning>{printDate}</strong>
        {meta.map((item) => (
          <span key={item.label}>
            {item.label}: <strong>{item.value}</strong>
          </span>
        ))}
        <span className="print-brand-address">{printConfig.address}</span>
        {printConfig.phone && (
          <span className="print-brand-address">{printConfig.phone}</span>
        )}
      </div>
    </header>
  );
}

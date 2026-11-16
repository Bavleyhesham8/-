"use client";

import { useId, useMemo, useState } from "react";
import type { Resident } from "@/lib/demo-data";

type Props = {
  residents: Resident[];
  value: string;
  onChange: (value: string, resident: Resident | null) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

function optionLabel(resident: Resident) {
  // يظهر الاسم فقط في قائمة الاختيار، مع بقاء الربط بسجل النزيل الكامل.
  return resident.name;
}

export default function ResidentPicker({
  residents,
  value,
  onChange,
  placeholder = "ابحث باسم النزيل...",
  required,
  disabled,
  className,
}: Props) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const options = useMemo(() => {
    const query = value.trim().toLocaleLowerCase("ar");
    return residents
      .filter((resident) => !resident.archived)
      .filter((resident) => !query || resident.name.toLocaleLowerCase("ar").includes(query))
      .slice(0, 100);
  }, [residents, value]);

  function handleChange(nextValue: string) {
    const exactMatches = residents.filter(
      (resident) =>
        !resident.archived && (optionLabel(resident) === nextValue ||
        resident.name.trim() === nextValue.trim()),
    );
    onChange(nextValue, exactMatches.length === 1 ? exactMatches[0] : null);
  }

  return (
    <div className="resident-picker" style={{ position: "relative" }}>
      <input
        aria-autocomplete="list"
        aria-controls={listId}
        autoComplete="off"
        className={className}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        value={value}
      />
      {focused && options.length > 0 && (
        <div id={listId} role="listbox" className="resident-picker-options" style={{ position: "absolute", insetInline: 0, top: "calc(100% + 4px)", zIndex: 50, maxHeight: 280, overflowY: "auto", borderRadius: 12, background: "#1f2433", padding: 6, boxShadow: "0 12px 28px rgba(0,0,0,.2)" }}>
          {options.map((resident) => (
            <button key={resident.id} type="button" role="option" aria-selected={resident.name === value} className="resident-picker-option" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(resident.name, resident); setFocused(false); }} style={{ display: "block", width: "100%", border: 0, borderRadius: 8, background: "transparent", padding: "10px 12px", color: "white", textAlign: "start", cursor: "pointer" }}>
              {optionLabel(resident)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

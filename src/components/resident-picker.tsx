"use client";

import { useId } from "react";
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
  return `${resident.name} — ${resident.fileNumber}`;
}

export default function ResidentPicker({
  residents,
  value,
  onChange,
  placeholder = "ابحث بالاسم أو رقم الملف...",
  required,
  disabled,
  className,
}: Props) {
  const listId = useId();

  function handleChange(nextValue: string) {
    const exactMatches = residents.filter(
      (resident) =>
        optionLabel(resident) === nextValue ||
        resident.name.trim() === nextValue.trim(),
    );
    onChange(nextValue, exactMatches.length === 1 ? exactMatches[0] : null);
  }

  return (
    <>
      <input
        aria-autocomplete="list"
        aria-controls={listId}
        autoComplete="off"
        className={className}
        disabled={disabled}
        list={listId}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        value={value}
      />
      <datalist id={listId}>
        {residents.map((resident) => (
          <option key={resident.id} value={optionLabel(resident)} />
        ))}
      </datalist>
    </>
  );
}

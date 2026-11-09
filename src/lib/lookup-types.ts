export type ChurchLookup = {
  id: number;
  number: string | null;
  name: string | null;
  acheshe: string | null;
  father: string | null;
};

export type GovernorateLookup = {
  id: number;
  governorate: string | null;
  district: string | null;
};

export type DayLookup = {
  id: number;
  day: string | null;
};

export type AlternateInvoiceCategory = {
  id: number;
  name: string | null;
};

export type VillaNumberLookup = {
  id: number;
  villaNumber: string | null;
};

export type LookupData = {
  churches: ChurchLookup[];
  governorates: GovernorateLookup[];
  days: DayLookup[];
  alternateCategories: AlternateInvoiceCategory[];
  villas: VillaNumberLookup[];
};

export type LookupKind =
  | "church"
  | "governorate"
  | "day"
  | "alternate-category"
  | "villa";

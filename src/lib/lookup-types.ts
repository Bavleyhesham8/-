export type ChurchLookup = {
  id: number;
  number: string | null;
  /** اسم الكنيسة. */
  name: string | null;
  /** أب الاعتراف. */
  acheshe: string | null;
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
  /** الفيلات فقط: A وB وC وD. */
  villas: VillaNumberLookup[];
  /** الغرف، مخزنة في نفس جدول القيم القديم ولكنها ليست فيلات. */
  rooms: VillaNumberLookup[];
};

export type LookupKind =
  | "church"
  | "governorate"
  | "day"
  | "alternate-category"
  | "villa"
  | "room";

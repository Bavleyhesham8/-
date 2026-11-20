export type GatePersonKind = "resident" | "employee" | "visitor";

export type GateVisit = {
  id: string;
  personKind: GatePersonKind;
  personId: string | null;
  personName: string;
  nationalId: string;
  entryAt: string;
  exitAt: string | null;
  notes: string;
  createdAt: string;
};

export type GateVisitorProfile = {
  id: string;
  name: string;
  nationalId: string;
  phone: string;
  notes: string;
  visitCount: number;
  lastVisitAt: string | null;
};

export type GatePersonOption = {
  kind: GatePersonKind;
  id: string;
  name: string;
  nationalId: string;
  meta: string;
};

export type GateBundle = {
  visits: GateVisit[];
  visitors: GateVisitorProfile[];
  residents: GatePersonOption[];
  employees: GatePersonOption[];
};

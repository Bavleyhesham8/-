export type ResidentStatus = "current" | "departed";

export type Resident = {
  id: string;
  fileNumber: string;
  name: string;
  birthDate: string;
  phone: string;
  address: string;
  district: string;
  emergencyContact: string;
  emergencyPhone: string;
  relationship: string;
  church: string;
  confessor: string;
  admissionDate: string;
  exitDate: string;
  villa: string;
  room: string;
  status: ResidentStatus;
  archived: boolean;
  governorate?: string;
  residentNumber?: string;
  incompleteStay?: boolean;
  followUp?: boolean;
  graduated?: boolean;
  nationalId?: string;
  maritalStatus?: string;
  qualification?: string;
  previousExperience?: string;
  previousWorkplaces?: string;
  residentEntry?: string;
  relationshipDegree?: string;
  entryTime?: string;
  exitMethod?: string;
  treatingDoctorNumber?: string;
  treatingDoctorAddress?: string;
  rehabilitationTeam?: string;
  rehabilitationStage?: string;
  trainer?: string;
  supervisor?: string;
  lecturer?: string;
  imagePath?: string;
};

export type UserRole = "admin" | "staff" | "viewer";

export type DemoUser = {
  id: string;
  name: string;
  role: UserRole;
  canEdit: boolean;
  email?: string;
  inventoryCategoryIds?: string[];
  canteenAccess?: boolean;
  canAccessClinic?: boolean;
  canManageCanteen?: boolean;
  canIssueInvoices?: boolean;
  canManageWarehouse?: boolean;
  canManageCustody?: boolean;
  canManageMeatSales?: boolean;
  allowedScreens?: string[];
};

export const demoResidents: Resident[] = [
  {
    id: "demo-001",
    fileNumber: "D-1001",
    name: "نموذج تجريبي ٠١",
    birthDate: "1994-05-14",
    phone: "",
    address: "بيانات تجريبية",
    district: "",
    emergencyContact: "",
    emergencyPhone: "",
    relationship: "",
    church: "كنيسة العذراء مريم",
    confessor: "أب الاعتراف تادرس",
    governorate: "القاهرة",
    admissionDate: "2026-10-12",
    exitDate: "",
    villa: "١",
    room: "١٠١",
    status: "current",
    archived: false,
  },
  {
    id: "demo-002",
    fileNumber: "D-1002",
    name: "نموذج تجريبي ٠٢",
    birthDate: "1999-11-02",
    phone: "",
    address: "بيانات تجريبية",
    district: "",
    emergencyContact: "",
    emergencyPhone: "",
    relationship: "",
    church: "كنيسة العذراء مريم",
    confessor: "أب الاعتراف تادرس",
    governorate: "القاهرة",
    admissionDate: "2026-10-08",
    exitDate: "",
    villa: "١",
    room: "١٠٢",
    status: "current",
    archived: false,
  },
  {
    id: "demo-003",
    fileNumber: "D-1003",
    name: "نموذج تجريبي ٠٣",
    birthDate: "1988-03-21",
    phone: "",
    address: "بيانات تجريبية",
    district: "",
    emergencyContact: "",
    emergencyPhone: "",
    relationship: "",
    church: "كنيسة العذراء مريم",
    confessor: "أب الاعتراف تادرس",
    governorate: "القاهرة",
    admissionDate: "2026-09-25",
    exitDate: "",
    villa: "٢",
    room: "٢٠١",
    status: "current",
    archived: false,
  },
  {
    id: "demo-004",
    fileNumber: "D-1004",
    name: "نموذج تجريبي ٠٤",
    birthDate: "2001-07-09",
    phone: "",
    address: "بيانات تجريبية",
    district: "",
    emergencyContact: "",
    emergencyPhone: "",
    relationship: "",
    church: "كنيسة العذراء مريم",
    confessor: "أب الاعتراف تادرس",
    governorate: "القاهرة",
    admissionDate: "2026-09-18",
    exitDate: "",
    villa: "٢",
    room: "٢٠٢",
    status: "current",
    archived: false,
  },
  {
    id: "demo-005",
    fileNumber: "D-1005",
    name: "نموذج تجريبي ٠٥",
    birthDate: "1992-12-30",
    phone: "",
    address: "بيانات تجريبية",
    district: "",
    emergencyContact: "",
    emergencyPhone: "",
    relationship: "",
    church: "كنيسة العذراء مريم",
    confessor: "أب الاعتراف تادرس",
    governorate: "القاهرة",
    admissionDate: "2026-08-30",
    exitDate: "",
    villa: "٣",
    room: "٣٠١",
    status: "current",
    archived: false,
  },
  {
    id: "demo-006",
    fileNumber: "D-1006",
    name: "نموذج تجريبي ٠٦",
    birthDate: "1996-02-17",
    phone: "",
    address: "بيانات تجريبية",
    district: "",
    emergencyContact: "",
    emergencyPhone: "",
    relationship: "",
    church: "كنيسة العذراء مريم",
    confessor: "أب الاعتراف تادرس",
    governorate: "القاهرة",
    admissionDate: "2026-08-15",
    exitDate: "",
    villa: "٣",
    room: "٣٠٢",
    status: "current",
    archived: false,
  },
  {
    id: "demo-007",
    fileNumber: "D-1007",
    name: "نموذج تجريبي ٠٧",
    birthDate: "1990-08-05",
    phone: "",
    address: "بيانات تجريبية",
    district: "",
    emergencyContact: "",
    emergencyPhone: "",
    relationship: "",
    church: "كنيسة العذراء مريم",
    confessor: "أب الاعتراف تادرس",
    governorate: "القاهرة",
    admissionDate: "2026-07-20",
    exitDate: "2026-09-03",
    villa: "",
    room: "",
    status: "departed",
    archived: false,
  },
  {
    id: "demo-008",
    fileNumber: "D-1008",
    name: "نموذج تجريبي ٠٨",
    birthDate: "1983-10-26",
    phone: "",
    address: "بيانات تجريبية",
    district: "",
    emergencyContact: "",
    emergencyPhone: "",
    relationship: "",
    church: "كنيسة العذراء مريم",
    confessor: "أب الاعتراف تادرس",
    governorate: "القاهرة",
    admissionDate: "2026-06-11",
    exitDate: "2026-07-14",
    villa: "",
    room: "",
    status: "departed",
    archived: false,
  },
];

export const demoUsers: DemoUser[] = [
  {
    id: "admin-demo",
    name: "مدير النظام (أدمن)",
    role: "admin",
    canEdit: true,
    canteenAccess: true,
    canAccessClinic: true,
    canManageCanteen: true,
    canIssueInvoices: true,
    canManageWarehouse: true,
    canManageCustody: true,
    canManageMeatSales: true,
  },
  {
    id: "staff-demo-1",
    name: "أحمد فؤاد (موظف كانتين ومخزن)",
    role: "staff",
    canEdit: false,
    canteenAccess: true,
    canManageCanteen: true,
    canIssueInvoices: true,
    canManageWarehouse: true,
    canManageCustody: false,
    canAccessClinic: false,
    canManageMeatSales: false,
  },
  {
    id: "staff-demo-2",
    name: "د. مينا عادل (مسؤول العيادة والنزلاء)",
    role: "staff",
    canEdit: true,
    canteenAccess: false,
    canAccessClinic: true,
    canManageCanteen: false,
    canIssueInvoices: false,
    canManageWarehouse: false,
    canManageCustody: false,
    canManageMeatSales: false,
  },
  {
    id: "viewer-demo-1",
    name: "أ. كيرلس وجيه (مستعرض بيانات وزائر)",
    role: "viewer",
    canEdit: false,
    canteenAccess: true,
    canAccessClinic: true,
    canManageCanteen: true,
    canIssueInvoices: true,
    canManageWarehouse: true,
    canManageCustody: true,
    canManageMeatSales: true,
    allowedScreens: [
      "overview",
      "residents",
      "treatment",
      "rooms",
      "inventory",
      "custody",
      "resident-finance",
      "canteen",
      "canteen-reports",
      "sales",
      "invoice-reports",
      "resident-stay-reports",
      "meat-sales",
      "staff",
      "lookups",
    ],
  },
];

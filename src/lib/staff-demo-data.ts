import type { StaffBundle } from "@/lib/staff-types";

const emptyProfile = {
  employeeId: "",
  nationalId: "",
  address: "",
  governorate: "",
  district: "",
  birthDate: "",
  maritalStatus: "",
  qualification: "",
  employmentStartDate: "",
  mobile: "",
  church: "",
  confessor: "",
  confessorPhone: "",
  denomination: "",
  previousWorkplaces: "",
  computerPrograms: "",
  jobSpecialty: "",
  employmentOffice: "",
  photo: "",
  notes: "",
  imagePath: "",
};

export const demoStaffBundle: StaffBundle = {
  profiles: [
    {
      ...emptyProfile,
      profileNumber: 1,
      firstName: "موظف تجريبي ١",
      thirdName: "",
      employeeId: "DEMO-1001",
    },
    {
      ...emptyProfile,
      profileNumber: 2,
      firstName: "موظف تجريبي ٢",
      thirdName: "",
      employeeId: "DEMO-1002",
    },
  ],
  employees: [
    { id: 1, employeeNumber: 1001, employeeName: "موظف تجريبي ١" },
    { id: 2, employeeNumber: 1002, employeeName: "موظف تجريبي ٢" },
  ],
  leaveEntries: [
    {
      id: 1,
      leaveDate: "2026-10-10",
      returnDate: "2026-10-11",
      leaveType: "إجازة تجريبية",
      notes: "سجل وهمي للاختبار",
      employeeNumber: 1001,
      employeeName: "موظف تجريبي ١",
    },
  ],
  accountOptions: [
    { id: "staff-demo-1", name: "موظف تجريبي ١", email: "staff1@example.test" },
    { id: "staff-demo-2", name: "موظف تجريبي ٢", email: "staff2@example.test" },
  ],
  accountLinks: [
    { userId: "staff-demo-1", profileNumber: 1, employeeNumber: 1001 },
    { userId: "staff-demo-2", profileNumber: 2, employeeNumber: 1002 },
  ],
};

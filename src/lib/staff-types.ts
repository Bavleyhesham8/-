export type StaffProfile = {
  profileNumber: number;
  employeeId: string;
  firstName: string;
  thirdName: string;
  nationalId: string;
  address: string;
  governorate: string;
  district: string;
  birthDate: string;
  maritalStatus: string;
  qualification: string;
  employmentStartDate: string;
  mobile: string;
  church: string;
  confessor: string;
  confessorPhone: string;
  denomination: string;
  previousWorkplaces: string;
  computerPrograms: string;
  jobSpecialty: string;
  employmentOffice: string;
  photo: string;
  notes: string;
  imagePath: string;
};

export type StaffEmployee = {
  id: number | null;
  employeeNumber: number;
  employeeName: string;
};

export type StaffLeaveEntry = {
  id: number;
  leaveDate: string;
  returnDate: string;
  leaveType: string;
  notes: string;
  employeeNumber: number;
  employeeName: string;
};

export type StaffAccountOption = {
  id: string;
  name: string;
  email: string;
};

export type StaffAccountLink = {
  userId: string;
  profileNumber: number;
  employeeNumber: number;
};

export type StaffBundle = {
  profiles: StaffProfile[];
  employees: StaffEmployee[];
  leaveEntries: StaffLeaveEntry[];
  accountOptions: StaffAccountOption[];
  accountLinks: StaffAccountLink[];
};

export type StaffAttendanceEntry = {
  id: number;
  employeeNumber: number;
  employeeName: string;
  clockInAt: string;
  clockOutAt: string | null;
};

export type StaffAttendanceEmployee = {
  employeeNumber: number;
  employeeName: string;
};

export type StaffAttendanceBundle = {
  entries: StaffAttendanceEntry[];
  employees: StaffAttendanceEmployee[];
  linkedEmployeeNumber: number | null;
};

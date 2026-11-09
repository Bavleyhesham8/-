export type ResidentStayReportRow = {
  stayId: string;
  fileNumber: string;
  residentName: string;
  birthDate: string;
  admissionDate: string;
  exitDate: string;
  villa: string;
  room: string;
  archived: boolean;
};

export type ResidentStayReportFilters = {
  startDate: string;
  endDate: string;
  villa: string;
  room: string;
  search: string;
  includeArchived: boolean;
};

export type ResidentStayReportData = {
  rows: ResidentStayReportRow[];
};

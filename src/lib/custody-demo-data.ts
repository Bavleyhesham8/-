import type { CustodyBundle } from "@/lib/custody-types";

export const demoCustody: CustodyBundle = {
  employees: [
    { employeeNumber: 1001, employeeName: "موظف تجريبي ١" },
    { employeeNumber: 1002, employeeName: "موظف تجريبي ٢" },
  ],
  records: [
    {
      custodyNumber: 1,
      custodyDate: "2026-11-02",
      recipientEmployeeNumber: 1001,
      recipientName: "موظف تجريبي ١",
      voided: false,
      voidReason: "",
      details: [
        {
          id: "demo-custody-detail-1",
          itemName: "أدوات مكتبية",
          unit: "علبة",
          notes: "عهدة إدارية",
          quantity: 2,
          issueDate: "2026-11-02",
          currentEmployeeNumber: 1001,
          currentEmployeeName: "موظف تجريبي ١",
          returnedQuantity: 0,
          outstandingQuantity: 2,
          events: [],
        },
      ],
    },
    {
      custodyNumber: 2,
      custodyDate: "2026-11-03",
      recipientEmployeeNumber: 1002,
      recipientName: "موظف تجريبي ٢",
      voided: false,
      voidReason: "",
      details: [
        {
          id: "demo-custody-detail-2",
          itemName: "أدوات نظافة",
          unit: "عبوة",
          notes: "",
          quantity: 3,
          issueDate: "2026-11-03",
          currentEmployeeNumber: 1002,
          currentEmployeeName: "موظف تجريبي ٢",
          returnedQuantity: 0,
          outstandingQuantity: 3,
          events: [],
        },
      ],
    },
  ],
  linkedEmployeeNumber: null,
};

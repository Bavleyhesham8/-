import { demoCanteen } from "@/lib/canteen-demo-data";
import type {
  CanteenReportData,
  CanteenReportFilters,
} from "@/lib/canteen-report-types";
import { filterCanteenReport } from "@/lib/canteen-report-utils";

function currentDateValue() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function getDemoCanteenReport(
  filters: CanteenReportFilters,
): CanteenReportData {
  return filterCanteenReport(
    {
      ...demoCanteen,
      movements: [
        ...demoCanteen.movements,
        {
          id: 5,
          itemNumber: 1003,
          itemName: "زيت طعام",
          balance: 16,
          incoming: null,
          incomingDate: null,
          outgoing: 2,
          outgoingDate: currentDateValue(),
          recipient: "مستلم تجريبي",
          voucherId: 2,
          voided: true,
          voidReason: "حركة ملغاة تجريبية",
        },
      ],
    },
    filters,
  );
}

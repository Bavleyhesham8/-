import type {
  CanteenReportData,
  CanteenReportFilters,
  CanteenReportMovement,
} from "@/lib/canteen-report-types";
import type { CanteenBundle } from "@/lib/canteen-types";

export function filterCanteenReport(
  bundle: CanteenBundle,
  filters: CanteenReportFilters,
): CanteenReportData {
  const products = bundle.products
    .map((product) => ({
      itemNumber: product.itemNumber,
      name: product.name,
      price: product.price,
    }));
  const selectedProducts = products
    .filter(
      (product) =>
        filters.itemNumber === null ||
        product.itemNumber === filters.itemNumber,
    );

  const allMovements: CanteenReportMovement[] = bundle.movements.map(
    (movement): CanteenReportMovement => {
      const direction = movement.incoming !== null ? "in" : "out";
      const quantity =
        direction === "in"
          ? (movement.incoming ?? 0)
          : (movement.outgoing ?? 0);
      const price =
        products.find((product) => product.itemNumber === movement.itemNumber)
          ?.price ?? 0;
      return {
        id: movement.id,
        itemNumber: movement.itemNumber,
        itemName: movement.itemName,
        date:
          (direction === "in"
            ? movement.incomingDate
            : movement.outgoingDate) ?? "",
        direction,
        quantity,
        price,
        value: quantity * price,
        balanceAfter: movement.balance,
        recipient: movement.recipient,
        issueCategory: movement.issueCategory ?? "",
        voucherId: movement.voucherId,
        voided: movement.voided,
        voidReason: movement.voidReason,
      };
    },
  ).sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.id - right.id,
  );

  const selectedMovements = allMovements.filter((movement) => {
    if (
      movement.date < filters.startDate ||
      movement.date > filters.endDate
    ) {
      return false;
    }
    if (
      filters.itemNumber !== null &&
      movement.itemNumber !== filters.itemNumber
    ) {
      return false;
    }
    if (filters.direction !== "all" && movement.direction !== filters.direction) {
      return false;
    }
    if (
      filters.recipient.trim() &&
      !movement.recipient
        .toLocaleLowerCase()
        .includes(filters.recipient.trim().toLocaleLowerCase())
    ) {
      return false;
    }
    if (!filters.includeVoided && movement.voided) return false;
    return true;
  });

  const balances = selectedProducts.map((product) => {
    const balance = allMovements
      .filter(
        (movement) =>
          movement.itemNumber === product.itemNumber && !movement.voided,
      )
      .reduce(
        (current, movement) =>
          current +
          (movement.direction === "in"
            ? movement.quantity
            : -movement.quantity),
        0,
      );
    return {
      itemNumber: product.itemNumber,
      itemName: product.name,
      price: product.price,
      balance,
      value: balance * product.price,
    };
  });
  const effectivePeriodMovements = selectedMovements.filter(
    (movement) => !movement.voided,
  );

  return {
    products,
    balances,
    movements: selectedMovements,
    totals: {
      incoming: effectivePeriodMovements
        .filter((movement) => movement.direction === "in")
        .reduce((sum, movement) => sum + movement.quantity, 0),
      outgoing: effectivePeriodMovements
        .filter((movement) => movement.direction === "out")
        .reduce((sum, movement) => sum + movement.quantity, 0),
      remaining: balances.reduce((sum, balance) => sum + balance.balance, 0),
      value: balances.reduce((sum, balance) => sum + balance.value, 0),
    },
  };
}

function safeCsvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function canteenReportToCsv(report: CanteenReportData): string {
  const header = [
    "القسم",
    "رقم الصنف",
    "الصنف",
    "السعر",
    "الرصيد الفعال",
    "قيمة الرصيد",
    "الحركة",
    "التاريخ",
    "الوارد",
    "المنصرف",
    "السعر",
    "القيمة",
    "الرصيد بعد الحركة",
    "المستلم",
    "بند الصرف",
    "رقم المستند",
    "ملغاة",
    "سبب الإلغاء",
  ];
  const balanceRows = report.balances.map((balance) => [
    "الرصيد الحالي",
    balance.itemNumber,
    balance.itemName,
    balance.price,
    balance.balance,
    balance.value,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  const totalRows = [
    [
      "إجمالي الفترة",
      "",
      "",
      "",
      report.totals.remaining,
      report.totals.value,
      "",
      "",
      report.totals.incoming,
      report.totals.outgoing,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ],
  ];
  const movementRows = report.movements.map((movement) => [
    "حركة",
    movement.itemNumber,
    movement.itemName,
    movement.price,
    "",
    "",
    movement.direction === "in" ? "وارد" : "منصرف",
    movement.date,
    movement.direction === "in" ? movement.quantity : "",
    movement.direction === "out" ? movement.quantity : "",
    movement.price,
    movement.value,
    movement.balanceAfter,
    movement.recipient,
    movement.issueCategory,
    movement.voucherId ?? "",
    movement.voided ? "نعم" : "",
    movement.voidReason,
  ]);

  return `\uFEFF${[header, ...balanceRows, ...totalRows, ...movementRows]
    .map((row) => row.map(safeCsvCell).join(","))
    .join("\r\n")}`;
}

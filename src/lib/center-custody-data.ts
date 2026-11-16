import "server-only";

import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDatabase } from "@/db";
import { centerCustodyTransactions, residents } from "@/db/schema";
import { requireAnyScreenAccess } from "@/lib/auth-session";
import type { ResidentCustodyCharge } from "@/lib/center-custody-types";

/**
 * حركات عهدة المركز المرتبطة بحساب نزيل فقط.
 * تُستخدم في كشف حساب النزيل دون كشف باقي حركة عهدة المركز.
 */
export async function listResidentCustodyChargesForCurrentUser(): Promise<
  ResidentCustodyCharge[]
> {
  await requireAnyScreenAccess(
    "custody",
    "resident-finance",
    "residents",
    "resident-reports",
    "resident-search",
    "rooms",
  );

  const rows = await getDatabase()
    .select({
      id: centerCustodyTransactions.id,
      transactionDate: centerCustodyTransactions.transactionDate,
      description: centerCustodyTransactions.description,
      amount: centerCustodyTransactions.amount,
      residentId: centerCustodyTransactions.residentId,
      residentName: residents.name,
    })
    .from(centerCustodyTransactions)
    .innerJoin(
      residents,
      eq(residents.id, centerCustodyTransactions.residentId),
    )
    .where(
      and(
        eq(centerCustodyTransactions.kind, "expense"),
        isNotNull(centerCustodyTransactions.residentId),
      ),
    )
    .orderBy(
      asc(centerCustodyTransactions.transactionDate),
      asc(centerCustodyTransactions.createdAt),
    );

  return rows.flatMap((row) =>
    row.residentId
      ? [
          {
            id: row.id,
            transactionDate: row.transactionDate,
            description: row.description,
            amount: row.amount,
            residentId: row.residentId,
            residentName: row.residentName,
          },
        ]
      : [],
  );
}

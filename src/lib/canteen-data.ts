import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  canteenIssueVouchers,
  canteenProducts,
  canteenStockLedger,
  canteenStockMovementLinks,
  canteenStockVoids,
  userCanteenAccess,
} from "@/db/schema";
import { requireCurrentSession } from "@/lib/auth-session";
import type { CanteenBundle } from "@/lib/canteen-types";

export async function listCanteenForCurrentUser(): Promise<{
  bundle: CanteenBundle;
  hasAccess: boolean;
}> {
  const session = await requireCurrentSession();
  const database = getDatabase();
  if (session.user.role !== "admin" && session.user.canManageCanteen !== true) {
    const [grant] = await database
      .select({ userId: userCanteenAccess.userId })
      .from(userCanteenAccess)
      .where(eq(userCanteenAccess.userId, session.user.id))
      .limit(1);
    if (!grant) {
      return { bundle: { products: [], movements: [] }, hasAccess: false };
    }
  }

  const [products, movements] = await Promise.all([
    database
      .select({
        id: canteenProducts.id,
        name: canteenProducts.name,
        price: canteenProducts.price,
        itemNumber: canteenProducts.itemNumber,
      })
      .from(canteenProducts)
      .orderBy(canteenProducts.itemNumber),
    database
      .select({
        id: canteenStockLedger.id,
        itemNumber: canteenProducts.itemNumber,
        itemName: canteenProducts.name,
        balance: canteenStockLedger.balance,
        incoming: canteenStockLedger.incoming,
        incomingDate: canteenStockLedger.incomingDate,
        outgoing: canteenStockLedger.outgoing,
        outgoingDate: canteenStockLedger.outgoingDate,
        recipient: sql<string>`coalesce(${canteenIssueVouchers.recipient}, '')`,
        voucherId: canteenStockMovementLinks.voucherId,
        voided: sql<boolean>`${canteenStockVoids.movementId} IS NOT NULL`,
        voidReason: sql<string>`coalesce(${canteenStockVoids.reason}, '')`,
      })
      .from(canteenStockLedger)
      .innerJoin(
        canteenProducts,
        eq(canteenProducts.itemNumber, canteenStockLedger.itemNumber),
      )
      .leftJoin(
        canteenStockMovementLinks,
        eq(canteenStockMovementLinks.movementId, canteenStockLedger.id),
      )
      .leftJoin(
        canteenIssueVouchers,
        eq(canteenIssueVouchers.id, canteenStockMovementLinks.voucherId),
      )
      .leftJoin(
        canteenStockVoids,
        eq(canteenStockVoids.movementId, canteenStockLedger.id),
      )
      .orderBy(
        desc(canteenStockLedger.id),
      ),
  ]);
  return { bundle: { products, movements }, hasAccess: true };
}

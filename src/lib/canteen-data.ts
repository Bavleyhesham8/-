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
import { hasScreenAccess } from "@/lib/access-control";
import { requireAnyScreenAccess, requireCurrentSession } from "@/lib/auth-session";
import type { CanteenBundle, CanteenMovement } from "@/lib/canteen-types";

export async function listCanteenForCurrentUser(): Promise<{
  bundle: CanteenBundle;
  hasAccess: boolean;
}> {
  const session = await requireCurrentSession();
  await requireAnyScreenAccess(
    "canteen",
    "sales",
    "canteen-reports",
    "invoice-reports",
    "tracking",
  );
  const database = getDatabase();
  const canManageCanteen =
    session.user.role === "admin" ||
    (session.user.role === "staff" &&
      session.user.canManageCanteen === true);
  let hasFullAccess =
    canManageCanteen ||
    (session.user.role === "viewer" &&
      (["canteen", "canteen-reports", "tracking"] as const).some((screen) =>
        hasScreenAccess("viewer", session.user.allowedScreens, screen),
      ));
  if (!hasFullAccess && session.user.role === "staff") {
    const [grant] = await database
      .select({ userId: userCanteenAccess.userId })
      .from(userCanteenAccess)
      .where(eq(userCanteenAccess.userId, session.user.id))
      .limit(1);
    hasFullAccess = Boolean(grant);
  }
  const canReadSalesStock =
    session.user.role === "viewer" &&
    hasScreenAccess("viewer", session.user.allowedScreens, "sales");
  const canIssueSales =
    session.user.role === "staff" &&
    session.user.canIssueInvoices === true &&
    hasScreenAccess(
      "staff",
      session.user.allowedScreens,
      "sales",
    );

  if (!hasFullAccess && !canIssueSales && !canReadSalesStock) {
    return {
      bundle: { products: [], movements: [] },
      hasAccess: false,
    };
  }

  const productsPromise = database
    .select({
      id: canteenProducts.id,
      name: canteenProducts.name,
      price: canteenProducts.price,
      itemNumber: canteenProducts.itemNumber,
      needsReview: canteenProducts.needsReview,
    })
    .from(canteenProducts)
    .orderBy(canteenProducts.itemNumber);
  const movementsPromise = hasFullAccess
    ? database
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
        issueCategory: sql<string>`coalesce(${canteenIssueVouchers.itemCategory}, '')`,
        voucherId: canteenStockMovementLinks.voucherId,
        voided: sql<boolean>`${canteenStockVoids.movementId} IS NOT NULL`,
        voidReason: sql<string>`coalesce(${canteenStockVoids.reason}, '')`,
        needsReview: canteenStockLedger.needsReview,
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
      )
    : database
        .select({
          id: canteenStockLedger.id,
          itemNumber: canteenProducts.itemNumber,
          itemName: canteenProducts.name,
          balance: canteenStockLedger.balance,
          incoming: canteenStockLedger.incoming,
          outgoing: canteenStockLedger.outgoing,
          voided: sql<boolean>`${canteenStockVoids.movementId} IS NOT NULL`,
          needsReview: canteenStockLedger.needsReview,
        })
        .from(canteenStockLedger)
        .innerJoin(
          canteenProducts,
          eq(canteenProducts.itemNumber, canteenStockLedger.itemNumber),
        )
        .leftJoin(
          canteenStockVoids,
          eq(canteenStockVoids.movementId, canteenStockLedger.id),
        )
        .orderBy(desc(canteenStockLedger.id));
  const [products, movementRows] = await Promise.all([
    productsPromise,
    movementsPromise,
  ]);
  const movements: CanteenMovement[] = movementRows.map((movement) => ({
    id: movement.id,
    itemNumber: movement.itemNumber,
    itemName: movement.itemName,
    balance: movement.balance,
    incoming: movement.incoming,
    incomingDate:
      hasFullAccess &&
      "incomingDate" in movement &&
      typeof movement.incomingDate === "string"
        ? movement.incomingDate
        : null,
    outgoing: movement.outgoing,
    outgoingDate:
      hasFullAccess &&
      "outgoingDate" in movement &&
      typeof movement.outgoingDate === "string"
        ? movement.outgoingDate
        : null,
    recipient:
      hasFullAccess &&
      "recipient" in movement &&
      typeof movement.recipient === "string"
        ? movement.recipient
        : "",
    issueCategory:
      hasFullAccess &&
      "issueCategory" in movement &&
      typeof movement.issueCategory === "string"
        ? movement.issueCategory
        : "",
    voucherId:
      hasFullAccess &&
      "voucherId" in movement &&
      typeof movement.voucherId === "number"
        ? movement.voucherId
        : null,
    voided: movement.voided,
    voidReason:
      hasFullAccess &&
      "voidReason" in movement &&
      typeof movement.voidReason === "string"
        ? movement.voidReason
        : "",
    needsReview: movement.needsReview,
  }));
  return {
    bundle: { products, movements },
    hasAccess: hasFullAccess && session.user.role !== "viewer",
  };
}

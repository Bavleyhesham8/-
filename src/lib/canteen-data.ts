import "server-only";

import { asc, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  canteenIssueVouchers,
  canteenProducts,
  canteenStockLedger,
  canteenStockMovementLinks,
  canteenStockVoids,
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
  const role =
    session.user.role === "admin" || session.user.role === "viewer"
      ? session.user.role
      : "staff";
  // Ù…Ù†Ø­ Ø´Ø§Ø´Ø© Ø§Ù„ÙƒØ§Ù†ØªÙŠÙ† Ø£Ùˆ Ø³Ø¬Ù„ Ø­Ø±ÙƒØ§ØªÙ‡ Ø£Ùˆ Ø§Ù„ØªØªØ¨Ø¹ ÙŠÙ…Ù†Ø­ Ù‚Ø±Ø§Ø¡Ø© ÙƒØ§Ù…Ù„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ÙƒØ§Ù†ØªÙŠÙ†.
  // ØµÙ„Ø§Ø­ÙŠØ© Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„ÙƒØ§Ù†ØªÙŠÙ† ØªØ¸Ù„ Ù…Ù†ÙØµÙ„Ø© ÙˆØªØªØ­ÙƒÙ… ÙÙŠ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„ ÙÙ‚Ø·.
  const canViewCanteenStock =
    role === "admin" ||
    (["canteen", "canteen-reports", "tracking"] as const).some((screen) =>
      hasScreenAccess(role, session.user.allowedScreens, screen),
    );
  const canViewSalesStock =
    role === "admin" ||
    (["sales", "invoice-reports"] as const).some((screen) =>
      hasScreenAccess(role, session.user.allowedScreens, screen),
    );

  if (!canViewCanteenStock && !canViewSalesStock) {
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
  const movementsPromise = canViewCanteenStock
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
        asc(
          sql`coalesce(${canteenStockLedger.incomingDate}, ${canteenStockLedger.outgoingDate})`,
        ),
        asc(canteenStockLedger.id),
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
        .orderBy(asc(canteenStockLedger.id));
  const [products, movementRows, balanceRows] = await Promise.all([
    productsPromise,
    movementsPromise,
    database
      .select({
        itemNumber: canteenProducts.itemNumber,
        balance: sql<string>`coalesce(sum(coalesce(${canteenStockLedger.incoming}, 0) - coalesce(${canteenStockLedger.outgoing}, 0)), 0)`,
      })
      .from(canteenProducts)
      .leftJoin(
        canteenStockLedger,
        eq(canteenStockLedger.itemNumber, canteenProducts.itemNumber),
      )
      .leftJoin(
        canteenStockVoids,
        eq(canteenStockVoids.movementId, canteenStockLedger.id),
      )
      .where(isNull(canteenStockVoids.movementId))
      .groupBy(canteenProducts.itemNumber),
  ]);
  const balanceByItem = new Map(
    balanceRows.map((row) => [row.itemNumber, Number(row.balance)]),
  );
  const movements: CanteenMovement[] = movementRows.map((movement) => ({
    id: movement.id,
    itemNumber: movement.itemNumber,
    itemName: movement.itemName,
    balance: movement.balance,
    incoming: movement.incoming,
    incomingDate:
      canViewCanteenStock &&
      "incomingDate" in movement &&
      typeof movement.incomingDate === "string"
        ? movement.incomingDate
        : null,
    outgoing: movement.outgoing,
    outgoingDate:
      canViewCanteenStock &&
      "outgoingDate" in movement &&
      typeof movement.outgoingDate === "string"
        ? movement.outgoingDate
        : null,
    recipient:
      canViewCanteenStock &&
      "recipient" in movement &&
      typeof movement.recipient === "string"
        ? movement.recipient
        : "",
    issueCategory:
      canViewCanteenStock &&
      "issueCategory" in movement &&
      typeof movement.issueCategory === "string"
        ? movement.issueCategory
        : "",
    voucherId:
      canViewCanteenStock &&
      "voucherId" in movement &&
      typeof movement.voucherId === "number"
        ? movement.voucherId
        : null,
    voided: movement.voided,
    voidReason:
      canViewCanteenStock &&
      "voidReason" in movement &&
      typeof movement.voidReason === "string"
        ? movement.voidReason
        : "",
    needsReview: movement.needsReview,
  }));
  return {
    bundle: {
      products: products.map((product) => ({
        ...product,
        balance: balanceByItem.get(product.itemNumber) ?? 0,
      })),
      movements,
    },
    hasAccess: canViewCanteenStock,
  };
}

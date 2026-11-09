import "server-only";

import {
  and,
  asc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  canteenIssueVouchers,
  canteenProducts,
  canteenStockLedger,
  canteenStockMovementLinks,
  canteenStockVoids,
} from "@/db/schema";
import { requireScreenAccess } from "@/lib/auth-session";
import type {
  CanteenReportData,
  CanteenReportFilters,
} from "@/lib/canteen-report-types";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

const filterSchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    itemNumber: z.number().int().positive().nullable(),
    direction: z.enum(["all", "in", "out"]),
    recipient: z.string().trim().max(160),
    includeVoided: z.boolean(),
  })
  .refine((filters) => filters.startDate <= filters.endDate);

export function parseCanteenReportFilters(
  input: unknown,
): CanteenReportFilters {
  const parsed = filterSchema.safeParse(input);
  if (!parsed.success) throw new Error("The canteen report filters are invalid.");
  return parsed.data;
}

function movementConditions(filters: CanteenReportFilters) {
  const conditions = [
    gte(
      sql<string>`coalesce(${canteenStockLedger.incomingDate}, ${canteenStockLedger.outgoingDate})`,
      filters.startDate,
    ),
    lte(
      sql<string>`coalesce(${canteenStockLedger.incomingDate}, ${canteenStockLedger.outgoingDate})`,
      filters.endDate,
    ),
  ];
  if (filters.itemNumber !== null) {
    conditions.push(eq(canteenProducts.itemNumber, filters.itemNumber));
  }
  if (filters.direction === "in") {
    conditions.push(sql`${canteenStockLedger.incoming} IS NOT NULL`);
  } else if (filters.direction === "out") {
    conditions.push(sql`${canteenStockLedger.outgoing} IS NOT NULL`);
  }
  if (filters.recipient) {
    const pattern = `%${filters.recipient.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    conditions.push(ilike(canteenIssueVouchers.recipient, pattern));
  }
  return conditions;
}

export async function getCanteenReport(
  input: unknown,
): Promise<CanteenReportData> {
  const filters = parseCanteenReportFilters(input);
  await requireScreenAccess("canteen-reports");
  const database = getDatabase();

  const productConditions =
    filters.itemNumber === null
      ? undefined
      : eq(canteenProducts.itemNumber, filters.itemNumber);
  const periodConditions = movementConditions(filters);
  const visibleMovementConditions = [...periodConditions];
  if (!filters.includeVoided) {
    visibleMovementConditions.push(isNull(canteenStockVoids.movementId));
  }

  const [products, balanceRows, periodRows, movementRows] = await Promise.all([
    database
      .select({
        itemNumber: canteenProducts.itemNumber,
        name: canteenProducts.name,
        price: canteenProducts.price,
      })
      .from(canteenProducts)
      .orderBy(asc(canteenProducts.name)),
    database
      .select({
        itemNumber: canteenProducts.itemNumber,
        itemName: canteenProducts.name,
        price: canteenProducts.price,
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
      .where(
        and(
          productConditions,
          isNull(canteenStockVoids.movementId),
        ),
      )
      .groupBy(
        canteenProducts.itemNumber,
        canteenProducts.name,
        canteenProducts.price,
      )
      .orderBy(asc(canteenProducts.name)),
    database
      .select({
        incoming: canteenStockLedger.incoming,
        outgoing: canteenStockLedger.outgoing,
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
      .where(
        and(...periodConditions, isNull(canteenStockVoids.movementId)),
      ),
    database
      .select({
        id: canteenStockLedger.id,
        itemNumber: canteenProducts.itemNumber,
        itemName: canteenProducts.name,
        incoming: canteenStockLedger.incoming,
        incomingDate: canteenStockLedger.incomingDate,
        outgoing: canteenStockLedger.outgoing,
        outgoingDate: canteenStockLedger.outgoingDate,
        balance: canteenStockLedger.balance,
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
      .where(and(...visibleMovementConditions))
      .orderBy(
        asc(
          sql`coalesce(${canteenStockLedger.incomingDate}, ${canteenStockLedger.outgoingDate})`,
        ),
        asc(canteenStockLedger.id),
      ),
  ]);

  return {
    products,
    balances: balanceRows.map((row) => {
      const balance = Number(row.balance);
      return {
        ...row,
        balance,
        value: balance * row.price,
      };
    }),
    totals: {
      incoming: periodRows.reduce(
        (sum, row) => sum + (row.incoming ?? 0),
        0,
      ),
      outgoing: periodRows.reduce(
        (sum, row) => sum + (row.outgoing ?? 0),
        0,
      ),
      remaining: balanceRows.reduce(
        (sum, row) => sum + Number(row.balance),
        0,
      ),
      value: balanceRows.reduce(
        (sum, row) => sum + Number(row.balance) * row.price,
        0,
      ),
    },
    movements: movementRows.map((row) => {
      const direction = row.incoming !== null ? "in" : "out";
      return {
        id: row.id,
        itemNumber: row.itemNumber,
        itemName: row.itemName,
        date:
          (direction === "in" ? row.incomingDate : row.outgoingDate) ?? "",
        direction,
        quantity:
          direction === "in" ? (row.incoming ?? 0) : (row.outgoing ?? 0),
        balanceAfter: row.balance,
        recipient: row.recipient,
        voucherId: row.voucherId,
        voided: row.voided,
        voidReason: row.voidReason,
      };
    }),
  };
}

export function canteenReportFiltersFromParams(
  params: URLSearchParams,
): CanteenReportFilters {
  const itemNumber = params.get("itemNumber");
  const direction = params.get("direction");
  return {
    startDate: params.get("startDate") ?? "",
    endDate: params.get("endDate") ?? "",
    itemNumber:
      itemNumber === null || itemNumber === "" ? null : Number(itemNumber),
    direction:
      direction === "in" || direction === "out" ? direction : "all",
    recipient: params.get("recipient") ?? "",
    includeVoided: params.get("includeVoided") === "true",
  };
}

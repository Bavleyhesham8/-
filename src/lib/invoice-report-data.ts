import "server-only";

import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  invoiceCategories,
  residentInvoiceLines,
  residentInvoiceVoids,
  residentInvoices,
  residents,
  userCanteenAccess,
} from "@/db/schema";
import { requireCurrentSession } from "@/lib/auth-session";
import type {
  InvoiceReportData,
  InvoiceReportFilters,
} from "@/lib/invoice-report-types";

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

const reportFilterSchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    categoryId: z.number().int().positive().nullable(),
  })
  .refine((filters) => filters.startDate <= filters.endDate);

export function parseInvoiceReportFilters(
  input: unknown,
): InvoiceReportFilters {
  const parsed = reportFilterSchema.safeParse(input);
  if (!parsed.success) throw new Error("The invoice report filters are invalid.");
  return parsed.data;
}

export async function getInvoiceReport(
  input: unknown,
): Promise<InvoiceReportData> {
  const filters = parseInvoiceReportFilters(input);

  const session = await requireCurrentSession();
  const database = getDatabase();

  if (session.user.role !== "admin" && session.user.canManageCanteen !== true) {
    const [grant] = await database
      .select({ userId: userCanteenAccess.userId })
      .from(userCanteenAccess)
      .where(eq(userCanteenAccess.userId, session.user.id))
      .limit(1);
    if (!grant) throw new Error("Canteen access is required for this report.");
  }

  const conditions = [
    gte(residentInvoices.invoiceDate, filters.startDate),
    lte(residentInvoices.invoiceDate, filters.endDate),
    isNull(residentInvoiceVoids.invoiceNumber),
  ];
  if (filters.categoryId !== null) {
    conditions.push(eq(residentInvoiceLines.categoryId, filters.categoryId));
  }

  const [categories, rows] = await Promise.all([
    database
      .select({ id: invoiceCategories.id, name: invoiceCategories.name })
      .from(invoiceCategories)
      .orderBy(invoiceCategories.name),
    database
      .select({
        invoiceNumber: residentInvoices.invoiceNumber,
        invoiceDate: residentInvoices.invoiceDate,
        saleType: residentInvoices.saleType,
        residentNumber: residentInvoices.residentNumber,
        residentName: residents.name,
        balance: residentInvoiceLines.balance,
        alternateCategory: residentInvoiceLines.alternateCategory,
        categoryId: residentInvoiceLines.categoryId,
        itemName: residentInvoiceLines.itemName,
        unitPrice: residentInvoiceLines.unitPrice,
        quantity: residentInvoiceLines.quantity,
        categoryName: invoiceCategories.name,
        total: residentInvoiceLines.total,
        lineDate: residentInvoiceLines.invoiceDate,
        dayName: residentInvoiceLines.dayName,
        monthName: residentInvoiceLines.monthName,
      })
      .from(residentInvoiceLines)
      .innerJoin(
        residentInvoices,
        eq(residentInvoices.invoiceNumber, residentInvoiceLines.invoiceNumber),
      )
      .leftJoin(residents, eq(residents.id, residentInvoices.residentId))
      .leftJoin(
        invoiceCategories,
        eq(invoiceCategories.id, residentInvoiceLines.categoryId),
      )
      .leftJoin(
        residentInvoiceVoids,
        eq(
          residentInvoiceVoids.invoiceNumber,
          residentInvoices.invoiceNumber,
        ),
      )
      .where(and(...conditions))
      .orderBy(
        asc(residentInvoices.invoiceDate),
        asc(residentInvoices.invoiceNumber),
        asc(residentInvoiceLines.id),
      ),
  ]);

  return {
    categories,
    rows: rows.map((row) => ({
      invoiceNumber: row.invoiceNumber,
      invoiceDate: row.invoiceDate,
      saleType: row.saleType === "cash" ? "cash" : "resident",
      residentNumber: row.residentNumber,
      residentName: row.residentName ?? "",
      balance: row.balance,
      alternateCategory: row.alternateCategory,
      categoryId: row.categoryId,
      itemName: row.itemName,
      unitPrice: row.unitPrice,
      quantity: row.quantity,
      categoryName:
        (row.categoryName ?? row.alternateCategory.trim()) || "غير مصنف",
      total: row.total,
      lineDate: row.lineDate,
      dayName: row.dayName,
      monthName: row.monthName,
    })),
  };
}

export function invoiceReportFilterFromParams(
  params: URLSearchParams,
): InvoiceReportFilters {
  const category = params.get("categoryId");
  return {
    startDate: params.get("startDate") ?? "",
    endDate: params.get("endDate") ?? "",
    categoryId:
      category === null || category === "" ? null : Number(category),
  };
}

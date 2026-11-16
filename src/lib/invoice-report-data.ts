import "server-only";

import { and, asc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  invoiceCategories,
  legacyResidents,
  residentInvoiceLines,
  residentInvoiceVoids,
  residentInvoices,
  residents,
} from "@/db/schema";
import { requireAnyScreenAccess } from "@/lib/auth-session";
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
    categoryId: z.number().int().refine((value) => value !== 0).nullable(),
    itemName: z.string().trim().max(160).default(""),
    residentName: z.string().trim().max(200).default(""),
    saleType: z.enum(["all", "resident", "cash"]).default("all"),
  })
  .refine((filters) => filters.startDate <= filters.endDate);

export function parseInvoiceReportFilters(
  input: unknown,
): InvoiceReportFilters {
  const parsed = reportFilterSchema.safeParse(input);
  if (!parsed.success) throw new Error("The invoice report filters are invalid.");
  return parsed.data;
}

function legacyCategoryId(name: string, usedIds: Set<number>) {
  let hash = 2166136261;
  for (const character of name) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  }
  let id = -(Math.abs(hash % 2_147_483_646) + 1);
  while (usedIds.has(id)) id = id === -2_147_483_647 ? -1 : id - 1;
  usedIds.add(id);
  return id;
}

export async function getInvoiceReport(
  input: unknown,
): Promise<InvoiceReportData> {
  const filters = parseInvoiceReportFilters(input);

  await requireAnyScreenAccess("sales", "invoice-reports");
  const database = getDatabase();

  const [baseCategories, legacyRows] = await Promise.all([
    database
      .select({ id: invoiceCategories.id, name: invoiceCategories.name })
      .from(invoiceCategories)
      .orderBy(invoiceCategories.name),
    database
      .selectDistinct({ name: residentInvoiceLines.alternateCategory })
      .from(residentInvoiceLines)
      .where(sql`trim(${residentInvoiceLines.alternateCategory}) <> ''`),
  ]);
  const legacyNames = [...new Set(legacyRows.map((row) => row.name.trim().normalize("NFC")).filter(Boolean))]
    .filter((name) => !baseCategories.some((category) => category.name.trim().normalize("NFC") === name));
  const usedCategoryIds = new Set(baseCategories.map((category) => category.id));
  const categories = [
    ...baseCategories,
    ...legacyNames.map((name) => ({ id: legacyCategoryId(name, usedCategoryIds), name })),
  ];
  const conditions = [
    gte(residentInvoices.invoiceDate, filters.startDate),
    lte(residentInvoices.invoiceDate, filters.endDate),
    isNull(residentInvoiceVoids.invoiceNumber),
  ];
  if (filters.categoryId !== null) {
    const selectedCategory = categories.find((category) => category.id === filters.categoryId);
    conditions.push(filters.categoryId < 0 && selectedCategory
      ? sql`lower(trim(${residentInvoiceLines.alternateCategory})) = lower(trim(${selectedCategory.name}))`
      : selectedCategory
      ? or(
          eq(residentInvoiceLines.categoryId, filters.categoryId),
          sql`lower(trim(${residentInvoiceLines.alternateCategory})) = lower(trim(${selectedCategory.name}))`,
        )!
      : eq(residentInvoiceLines.categoryId, filters.categoryId));
  }
  if (filters.itemName) conditions.push(ilike(residentInvoiceLines.itemName, `%${filters.itemName}%`));
  if (filters.residentName) {
    conditions.push(or(
      ilike(residents.name, `%${filters.residentName}%`),
      ilike(legacyResidents.name, `%${filters.residentName}%`),
    )!);
  }
  if (filters.saleType !== "all") conditions.push(eq(residentInvoices.saleType, filters.saleType));

  const rows = await database
      .select({
        invoiceNumber: residentInvoices.invoiceNumber,
        invoiceDate: residentInvoices.invoiceDate,
        saleType: residentInvoices.saleType,
        residentId: residentInvoices.residentId,
        residentNumber: residentInvoices.residentNumber,
        residentName: residents.name,
        legacyResidentName: legacyResidents.name,
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
      .leftJoin(legacyResidents, eq(legacyResidents.id, residentInvoices.residentNumber))
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
      );

  return {
    categories,
    rows: rows.map((row) => ({
      invoiceNumber: row.invoiceNumber,
      invoiceDate: row.invoiceDate,
      saleType: row.saleType === "cash" ? "cash" : "resident",
      residentId: row.residentId,
      residentNumber: row.residentNumber,
      residentName: row.residentName ?? row.legacyResidentName ?? "",
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
    itemName: params.get("itemName") ?? "",
    residentName: params.get("residentName") ?? "",
    saleType: (params.get("saleType") === "cash" || params.get("saleType") === "resident") ? params.get("saleType") as "cash" | "resident" : "all",
  };
}

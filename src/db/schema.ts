import {
  boolean,
  check,
  date,
  index,
  doublePrecision,
  integer,
  jsonb,
  primaryKey,
  pgEnum,
  uniqueIndex,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const inventoryDirection = pgEnum("inventory_direction", ["in", "out"]);
export const invoicePaymentKind = pgEnum("invoice_payment_kind", [
  "payment",
  "refund",
]);
export const refrigeratorMovementDirection = pgEnum(
  "refrigerator_movement_direction",
  ["in", "out"],
);
export const meatSalePaymentKind = pgEnum("meat_sale_payment_kind", [
  "payment",
  "refund",
]);
export const warehouseMovementKind = pgEnum("warehouse_movement_kind", [
  "receipt",
  "custody_issue",
  "custody_return",
  "custody_void",
]);
export const custodyEventKind = pgEnum("custody_event_kind", [
  "return",
  "transfer",
  "void",
]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  role: text("role").notNull().default("staff"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  canEditResidents: boolean("can_edit_residents").notNull().default(false),
  canAccessClinic: boolean("can_access_clinic").notNull().default(false),
  canManageCanteen: boolean("can_manage_canteen").notNull().default(false),
  canIssueInvoices: boolean("can_issue_invoices").notNull().default(false),
  canManageWarehouse: boolean("can_manage_warehouse").notNull().default(false),
  canManageCustody: boolean("can_manage_custody").notNull().default(false),
  canManageMeatSales: boolean("can_manage_meat_sales").notNull().default(false),
  allowedScreens: text("allowed_screens").notNull().default(""),
});

export const importQuarantine = pgTable(
  "import_quarantine",
  {
    id: serial("id").primaryKey(),
    sourceTable: text("source_table").notNull(),
    sourceId: text("source_id").notNull(),
    payload: jsonb("payload"),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("import_quarantine_source_unique").on(
      table.sourceTable,
      table.sourceId,
    ),
    index("import_quarantine_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("import_quarantine_resolved_by_idx").on(table.resolvedBy),
    check(
      "import_quarantine_status_check",
      sql`${table.status} IN ('pending', 'resolved')`,
    ),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const residents = pgTable(
  "residents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileNumber: text("file_number").notNull().unique(),
    name: text("name").notNull(),
    birthDate: date("birth_date", { mode: "string" }),
    phone: text("phone").notNull().default(""),
    address: text("address").notNull().default(""),
    district: text("district").notNull().default(""),
    emergencyContact: text("emergency_contact").notNull().default(""),
    emergencyPhone: text("emergency_phone").notNull().default(""),
    relationship: text("relationship").notNull().default(""),
    church: text("church").notNull().default(""),
    confessor: text("confessor").notNull().default(""),
    governorate: text("governorate").notNull().default(""),
    residentNumber: text("resident_number").notNull().default(""),
    incompleteStay: boolean("incomplete_stay").notNull().default(false),
    followUp: boolean("follow_up").notNull().default(false),
    graduated: boolean("graduated").notNull().default(false),
    nationalId: text("national_id").notNull().default(""),
    maritalStatus: text("marital_status").notNull().default(""),
    qualification: text("qualification").notNull().default(""),
    previousExperience: text("previous_experience").notNull().default(""),
    previousWorkplaces: text("previous_workplaces").notNull().default(""),
    residentEntry: text("resident_entry").notNull().default(""),
    relationshipDegree: text("relationship_degree").notNull().default(""),
    entryTime: text("entry_time").notNull().default(""),
    exitMethod: text("exit_method").notNull().default(""),
    treatingDoctorNumber: text("treating_doctor_number").notNull().default(""),
    treatingDoctorAddress: text("treating_doctor_address").notNull().default(""),
    rehabilitationTeam: text("rehabilitation_team").notNull().default(""),
    rehabilitationStage: text("rehabilitation_stage").notNull().default(""),
    trainer: text("trainer").notNull().default(""),
    supervisor: text("supervisor").notNull().default(""),
    lecturer: text("lecturer").notNull().default(""),
    imagePath: text("image_path").notNull().default(""),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("residents_archived_idx").on(table.archived),
    index("residents_name_idx").on(table.name),
    index("residents_created_by_idx").on(table.createdBy),
  ],
);

export const legacyResidents = pgTable("nam", {
  id: integer("ID").primaryKey(),
  fileNumber: text("num"),
  name: text("nam"),
  birthDate: timestamp("Dat_Brth", { mode: "date" }),
  address: text("Adrres"),
  phone: text("tal"),
  alternatePhone: text("num_A"),
  contact: text("Con"),
  maritalStatus: text("mar"),
  entryDate: timestamp("Dat_Ent", { mode: "date" }),
  sak: text("sak"),
  khn: boolean("khn"),
  noA: boolean("no_A"),
  mot: boolean("Mot"),
  alt: text("Alt"),
  alf: text("ALF"),
  nonAl: text("N-AL"),
  aoDate: timestamp("Dat_AO", { mode: "date" }),
  alm: text("ALm"),
  photo: text("Phot"),
  roomNumber: text("Num_ROm"),
  mon: text("Mon"),
  imagePath: text("ImagePath"),
  mmon: text("mmon"),
  firstName: text("F_N"),
  nom: text("Nom"),
  acheshe: text("Achesh"),
  father: text("Fathr"),
  qualification: text("المؤهل الدراسى"),
  previousExperience: text("الخبرات السابقة"),
  previousWorkplaces: text("اماكن العمل السابقة"),
  residentEntry: text("دخول النزيل"),
  relationship: text("صلة القرابة"),
  fromDegree: text("من االدرجة"),
  entryTime: text("ساعة الدخول"),
  exitMethod: text("طريقة الخروج"),
  treatingDoctorNumber: text("رقم الطبيب المعالج"),
  treatingDoctorAddress: text("عنوان الطبيب المعالج"),
  rehabilitationTeam: text("فريق التأهل والارشاد"),
  rehabilitationStage: text("مرحلة التأهيل والتعافى"),
  trainer: text("المدرب"),
  supervisor: text("المشرف"),
  lecturer: text("المحاضر"),
});

export const residentLegacyLinks = pgTable(
  "resident_legacy_links",
  {
    residentId: uuid("resident_id")
      .primaryKey()
      .references(() => residents.id, { onDelete: "restrict" }),
    legacyResidentId: integer("legacy_resident_id")
      .notNull()
      .unique()
      .references(() => legacyResidents.id, { onDelete: "restrict" }),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    linkedBy: text("linked_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("resident_legacy_links_linked_by_idx").on(table.linkedBy),
  ],
);

export const legacyResidentHeaders = pgTable(
  "راس النزيل",
  {
    id: integer("ID"),
    residentNumber: integer("رقم النزيل").primaryKey(),
    residentName: text("اسم النزيل"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("legacy_resident_headers_created_by_idx").on(table.createdBy),
  ],
);

export const legacyResidentDetails = pgTable(
  "اطراف النزيل",
  {
    id: integer("ID").generatedByDefaultAsIdentity().primaryKey(),
    amount: doublePrecision("المبلغ"),
    transactionDate: timestamp("التاريخ", { mode: "date" }),
    returnDate: timestamp("تاريخ العودة", { mode: "date" }),
    residentNumber: integer("رقم")
      .references(() => legacyResidentHeaders.residentNumber, {
        onDelete: "restrict",
      }),
    voided: boolean("voided").notNull().default(false),
    voidReason: text("void_reason").notNull().default(""),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: text("voided_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("resident_finance_details_resident_number_idx").on(
      table.residentNumber,
    ),
    index("resident_finance_details_voided_by_idx").on(table.voidedBy),
    index("resident_finance_details_created_by_idx").on(table.createdBy),
    check(
      "resident_finance_details_void_audit_check",
      sql`(${table.voided} = false AND ${table.voidedAt} IS NULL AND ${table.voidedBy} IS NULL) OR (${table.voided} = true AND ${table.voidedAt} IS NOT NULL AND ${table.voidedBy} IS NOT NULL)`,
    ),
  ],
);

export const legacyTreatmentHeaders = pgTable(
  "راس العلاج",
  {
    id: integer("ID"),
    residentNumber: integer("رقم النزيل").primaryKey(),
    residentName: text("اسم النزيل"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("legacy_treatment_headers_created_by_idx").on(table.createdBy),
  ],
);

export const legacyTreatmentDetails = pgTable(
  "اطراف العلاج",
  {
    id: integer("ID").generatedByDefaultAsIdentity().primaryKey(),
    medicationName: text("اسم الدواء").notNull(),
    amount: doublePrecision("المبلغ").notNull(),
    quantity: doublePrecision("الكمية").notNull().default(1),
    discount: doublePrecision("الخصم").notNull().default(0),
    treatmentDate: timestamp("التاريخ", { mode: "date" }),
    total: doublePrecision("الاجمالى"),
    residentNumber: integer("رقم")
      .references(() => legacyTreatmentHeaders.residentNumber, {
        onDelete: "restrict",
      }),
    voided: boolean("voided").notNull().default(false),
    voidReason: text("void_reason").notNull().default(""),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: text("voided_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("treatment_details_resident_number_idx").on(table.residentNumber),
    index("treatment_details_voided_by_idx").on(table.voidedBy),
    index("treatment_details_created_by_idx").on(table.createdBy),
    check(
      "treatment_details_void_audit_check",
      sql`(${table.voided} = false AND ${table.voidedAt} IS NULL AND ${table.voidedBy} IS NULL) OR (${table.voided} = true AND ${table.voidedAt} IS NOT NULL AND ${table.voidedBy} IS NOT NULL)`,
    ),
  ],
);

export const villaNumbers = pgTable(
  "رقم الفيلا",
  {
    id: integer("ID").generatedByDefaultAsIdentity().primaryKey(),
    villaNumber: text("N_V"),
  },
  (table) => [
    uniqueIndex("villa_numbers_value_unique").on(table.villaNumber),
  ],
);

export const residentStays = pgTable(
  "resident_stays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    residentId: uuid("resident_id")
      .notNull()
      .references(() => residents.id, { onDelete: "cascade" }),
    admissionDate: date("admission_date", { mode: "string" }).notNull(),
    exitDate: date("exit_date", { mode: "string" }),
    villa: text("villa").notNull().default(""),
    room: text("room").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("resident_stays_resident_id_idx").on(table.residentId),
    index("resident_stays_created_by_idx").on(table.createdBy),
    uniqueIndex("resident_stays_one_current_idx")
      .on(table.residentId)
      .where(sql`${table.exitDate} IS NULL`),
    check(
      "resident_stays_exit_date_check",
      sql`${table.exitDate} IS NULL OR ${table.exitDate} >= ${table.admissionDate}`,
    ),
  ],
);

export const inventoryCategories = pgTable(
  "inventory_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("inventory_categories_active_idx").on(table.active)],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => inventoryCategories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    unit: text("unit").notNull().default("وحدة"),
    unitPrice: doublePrecision("unit_price").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inventory_items_category_id_idx").on(table.categoryId),
    uniqueIndex("inventory_items_category_name_unique").on(
      table.categoryId,
      table.name,
    ),
    index("inventory_items_active_idx").on(table.active),
    check("inventory_items_unit_price_check", sql`${table.unitPrice} >= 0`),
  ],
);

export const inventoryPriceHistory = pgTable(
  "inventory_price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => inventoryItems.id, { onDelete: "restrict" }),
    oldPrice: doublePrecision("old_price").notNull(),
    newPrice: doublePrecision("new_price").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    changedBy: text("changed_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [index("inventory_price_history_item_date_idx").on(table.itemId, table.changedAt)],
);

export const warehouseCatalog = pgTable(
  "الاصناف",
  {
    id: integer("ID").generatedByDefaultAsIdentity().primaryKey(),
    itemName: text("الاصناف").notNull(),
  },
  (table) => [
    uniqueIndex("warehouse_catalog_item_name_unique").on(table.itemName),
  ],
);

export const warehouseHeaders = pgTable(
  "راس المخزن",
  {
    id: integer("ID"),
    number: integer("رقم").generatedByDefaultAsIdentity().primaryKey(),
    itemName: text("الصنف").notNull(),
    price: doublePrecision("السعر").default(0),
    responsible: text("المسئول").notNull(),
    catalogId: integer("catalog_id")
      .notNull()
      .references(() => warehouseCatalog.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("warehouse_headers_catalog_id_unique").on(table.catalogId),
    check("warehouse_headers_price_check", sql`${table.price} >= 0`),
  ],
);

export const custodyHeaders = pgTable(
  "راس العهدة",
  {
    id: integer("ID"),
    custodyNumber: integer("رقم العهدة")
      .generatedByDefaultAsIdentity()
      .primaryKey(),
    custodyDate: timestamp("التاريخ", { mode: "date" }),
    custody: text("العهدة").notNull(),
    recipientEmployeeNumber: integer("recipient_employee_number")
      .references(() => staffEmployees.employeeNumber, { onDelete: "restrict" }),
    needsReview: boolean("needs_review").notNull().default(false),
    voided: boolean("voided").notNull().default(false),
    voidReason: text("void_reason").notNull().default(""),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: text("voided_by").references(() => user.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("custody_headers_recipient_idx").on(table.recipientEmployeeNumber),
    index("custody_headers_date_idx").on(table.custodyDate),
    index("custody_headers_needs_review_idx").on(table.needsReview),
    index("custody_headers_voided_by_idx").on(table.voidedBy),
    index("custody_headers_created_by_idx").on(table.createdBy),
    check(
      "custody_headers_void_audit_check",
      sql`(${table.voided} = false AND ${table.voidedAt} IS NULL AND ${table.voidedBy} IS NULL) OR (${table.voided} = true AND ${table.voidedAt} IS NOT NULL AND ${table.voidedBy} IS NOT NULL)`,
    ),
  ],
);

export const custodyDetails = pgTable(
  "العهدة",
  {
    id: integer("ID"),
    webId: uuid("web_id").primaryKey().defaultRandom(),
    itemCategory: text("الاصناف / الفئة").notNull(),
    unit: text("unit").notNull().default(""),
    notes: text("notes").notNull().default(""),
    quantity: doublePrecision("الكمية"),
    price: doublePrecision("السعر").notNull(),
    total: doublePrecision("الإجمالى").notNull(),
    transactionDate: timestamp("التاريخ", { mode: "date" }),
    custodyNumber: integer("رقم")
      .notNull()
      .references(() => custodyHeaders.custodyNumber, { onDelete: "restrict" }),
    warehouseNumber: integer("warehouse_number")
      .references(() => warehouseHeaders.number, { onDelete: "restrict" }),
    currentEmployeeNumber: integer("current_employee_number").references(
      () => staffEmployees.employeeNumber,
      { onDelete: "restrict" },
    ),
    needsReview: boolean("needs_review").notNull().default(false),
  },
  (table) => [
    index("custody_details_header_idx").on(table.custodyNumber),
    index("custody_details_warehouse_number_idx").on(table.warehouseNumber),
    index("custody_details_current_employee_idx").on(
      table.currentEmployeeNumber,
    ),
    index("custody_details_needs_review_idx").on(table.needsReview),
    check("custody_details_quantity_check", sql`${table.quantity} > 0`),
    check("custody_details_price_check", sql`${table.price} >= 0`),
    check("custody_details_total_check", sql`${table.total} >= 0`),
  ],
);

export const centerCustodyTransactions = pgTable(
  "center_custody_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    description: text("description").notNull().default(""),
    unit: text("unit").notNull().default(""),
    quantity: doublePrecision("quantity").notNull().default(0),
    unitPrice: doublePrecision("unit_price").notNull().default(0),
    amount: doublePrecision("amount").notNull(),
    targetBalance: doublePrecision("target_balance").notNull().default(15000),
    balanceAfter: doublePrecision("balance_after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("center_custody_transactions_date_idx").on(table.transactionDate),
    check("center_custody_transactions_kind_check", sql`${table.kind} IN ('expense', 'replenishment')`),
    check("center_custody_transactions_amount_check", sql`${table.amount} > 0`),
  ],
);

export const warehouseDetails = pgTable(
  "اطراف المخزن",
  {
    id: integer("ID").generatedByDefaultAsIdentity().primaryKey(),
    balance: doublePrecision("الرصيد"),
    incoming: doublePrecision("الوارد").default(0),
    incomingDate: timestamp("تاريخ الوارد", { mode: "date" }),
    outgoing: doublePrecision("المنصرف").default(0),
    outgoingDate: timestamp("تاريخ الصرف", { mode: "date" }),
    remaining: doublePrecision("المتبقى"),
    deleted: boolean("حذف").notNull().default(false),
    number: integer("رقم")
      .notNull()
      .references(() => warehouseHeaders.number, { onDelete: "restrict" }),
    movementKind: warehouseMovementKind("movement_kind").notNull(),
    custodyDetailId: uuid("custody_detail_id").references(
      () => custodyDetails.webId,
      { onDelete: "restrict" },
    ),
    needsReview: boolean("needs_review").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("warehouse_details_number_idx").on(table.number),
    index("warehouse_details_incoming_date_idx").on(table.incomingDate),
    index("warehouse_details_outgoing_date_idx").on(table.outgoingDate),
    index("warehouse_details_needs_review_idx").on(table.needsReview),
    index("warehouse_details_custody_detail_id_idx").on(table.custodyDetailId),
    index("warehouse_details_created_by_idx").on(table.createdBy),
    check("warehouse_details_balance_check", sql`${table.balance} >= 0`),
    check("warehouse_details_incoming_check", sql`${table.incoming} >= 0`),
    check("warehouse_details_outgoing_check", sql`${table.outgoing} >= 0`),
    check("warehouse_details_remaining_check", sql`${table.remaining} >= 0`),
  ],
);

export const custodyEvents = pgTable(
  "custody_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    detailId: uuid("detail_id")
      .notNull()
      .references(() => custodyDetails.webId, { onDelete: "restrict" }),
    kind: custodyEventKind("kind").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    eventDate: timestamp("event_date", { mode: "date" }).notNull(),
    fromEmployeeNumber: integer("from_employee_number").references(
      () => staffEmployees.employeeNumber,
      { onDelete: "restrict" },
    ),
    toEmployeeNumber: integer("to_employee_number").references(
      () => staffEmployees.employeeNumber,
      { onDelete: "restrict" },
    ),
    reason: text("reason").notNull().default(""),
    warehouseMovementId: integer("warehouse_movement_id").references(
      () => warehouseDetails.id,
      { onDelete: "restrict" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("custody_events_detail_idx").on(table.detailId),
    index("custody_events_from_employee_idx").on(table.fromEmployeeNumber),
    index("custody_events_to_employee_idx").on(table.toEmployeeNumber),
    index("custody_events_warehouse_movement_id_idx").on(
      table.warehouseMovementId,
    ),
    index("custody_events_created_by_idx").on(table.createdBy),
    check("custody_events_quantity_check", sql`${table.quantity} > 0`),
    check(
      "custody_events_transfer_target_check",
      sql`${table.kind} <> 'transfer' OR (${table.fromEmployeeNumber} IS NOT NULL AND ${table.toEmployeeNumber} IS NOT NULL AND ${table.fromEmployeeNumber} <> ${table.toEmployeeNumber})`,
    ),
    check(
      "custody_events_non_transfer_target_check",
      sql`${table.kind} = 'transfer' OR ${table.toEmployeeNumber} IS NULL`,
    ),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    direction: inventoryDirection("direction").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    unitPrice: doublePrecision("unit_price").notNull().default(0),
    movementDate: date("movement_date", { mode: "string" }).notNull(),
    destination: text("destination").notNull().default(""),
    recipient: text("recipient").notNull().default(""),
    note: text("note").notNull().default(""),
    voided: boolean("voided").notNull().default(false),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    voidedBy: text("voided_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("inventory_movements_item_id_idx").on(table.itemId),
    index("inventory_movements_date_idx").on(table.movementDate),
    index("inventory_movements_created_by_idx").on(table.createdBy),
    index("inventory_movements_voided_by_idx").on(table.voidedBy),
    check("inventory_movements_quantity_check", sql`${table.quantity} > 0`),
    check("inventory_movements_unit_price_check", sql`${table.unitPrice} >= 0`),
  ],
);

export const userInventoryCategories = pgTable(
  "user_inventory_categories",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => inventoryCategories.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    grantedBy: text("granted_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    primaryKey({
      name: "user_inventory_categories_pk",
      columns: [table.userId, table.categoryId],
    }),
    index("user_inventory_categories_category_id_idx").on(table.categoryId),
    index("user_inventory_categories_granted_by_idx").on(table.grantedBy),
  ],
);

export const canteenProducts = pgTable(
  "كانتين",
  {
    id: serial("ID").notNull().unique(),
    name: text("اسم الصنف").notNull(),
    price: doublePrecision("السعر").notNull().default(0),
    itemNumber: serial("رقم الصنف").primaryKey(),
    needsReview: boolean("needs_review").notNull().default(false),
  },
  (table) => [
    index("canteen_products_needs_review_idx").on(table.needsReview),
  ],
);

export const canteenStockLedger = pgTable(
  "طرف الكانين",
  {
    id: serial("ID1").primaryKey(),
    balance: doublePrecision("الرصيد").notNull(),
    incoming: doublePrecision("الوارد"),
    incomingDate: date("تاريخ الوارد", { mode: "string" }),
    outgoing: doublePrecision("المنصرف"),
    outgoingDate: date("تاريخ المنصرف", { mode: "string" }),
    itemNumber: integer("رقم")
      .notNull()
      .references(() => canteenProducts.itemNumber, { onDelete: "restrict" }),
    needsReview: boolean("needs_review").notNull().default(false),
  },
  (table) => [
    index("canteen_stock_ledger_item_number_idx").on(table.itemNumber),
    index("canteen_stock_ledger_needs_review_idx").on(table.needsReview),
    check("canteen_stock_ledger_balance_check", sql`${table.balance} >= 0`),
    check(
      "canteen_stock_ledger_direction_check",
      sql`(${table.incoming} > 0 AND ${table.incomingDate} IS NOT NULL AND ${table.outgoing} IS NULL AND ${table.outgoingDate} IS NULL) OR (${table.outgoing} > 0 AND ${table.outgoingDate} IS NOT NULL AND ${table.incoming} IS NULL AND ${table.incomingDate} IS NULL)`,
    ),
  ],
);

export const canteenIssueVouchers = pgTable(
  "راس الكانتين",
  {
    id: serial("ID").primaryKey(),
    itemNumber: integer("رقم الصنف")
      .notNull()
      .references(() => canteenProducts.itemNumber, { onDelete: "restrict" }),
    recipient: text("المستلم").notNull(),
    itemCategory: text("الصنف / الفئة").notNull().default(""),
    needsReview: boolean("needs_review").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("canteen_issue_vouchers_item_number_idx").on(table.itemNumber),
    index("canteen_issue_vouchers_needs_review_idx").on(table.needsReview),
    index("canteen_issue_vouchers_created_by_idx").on(table.createdBy),
  ],
);

export const canteenIssueLines = pgTable(
  "اطراف الكانتين",
  {
    id: serial("ID").primaryKey(),
    itemName: text("اسم الصنف").notNull(),
    balance: doublePrecision("الرصيد").notNull(),
    incoming: doublePrecision("الوارد"),
    incomingDate: date("تاريخ", { mode: "string" }),
    outgoing: doublePrecision("المنصرف"),
    outgoingDate: date("تاريخ المنصرف", { mode: "string" }),
    itemNumber: integer("رقم الصنف")
      .notNull()
      .references(() => canteenProducts.itemNumber, { onDelete: "restrict" }),
    voucherId: integer("رقم المستند")
      .notNull()
      .references(() => canteenIssueVouchers.id, { onDelete: "restrict" }),
    needsReview: boolean("needs_review").notNull().default(false),
  },
  (table) => [
    index("canteen_issue_lines_item_number_idx").on(table.itemNumber),
    index("canteen_issue_lines_voucher_id_idx").on(table.voucherId),
    index("canteen_issue_lines_needs_review_idx").on(table.needsReview),
    check("canteen_issue_lines_balance_check", sql`${table.balance} >= 0`),
    check(
      "canteen_issue_lines_outgoing_check",
      sql`${table.outgoing} > 0 AND ${table.outgoingDate} IS NOT NULL AND ${table.incoming} IS NULL AND ${table.incomingDate} IS NULL`,
    ),
  ],
);

export const canteenStockVoids = pgTable(
  "canteen_stock_voids",
  {
    movementId: integer("movement_id")
      .primaryKey()
      .references(() => canteenStockLedger.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    voidedBy: text("voided_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [index("canteen_stock_voids_voided_by_idx").on(table.voidedBy)],
);

export const canteenStockMovementLinks = pgTable(
  "canteen_stock_movement_links",
  {
    movementId: integer("movement_id")
      .primaryKey()
      .references(() => canteenStockLedger.id, { onDelete: "restrict" }),
    voucherId: integer("voucher_id")
      .notNull()
      .references(() => canteenIssueVouchers.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("canteen_stock_movement_links_voucher_id_idx").on(table.voucherId),
  ],
);

export const userCanteenAccess = pgTable(
  "user_canteen_access",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    grantedBy: text("granted_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [index("user_canteen_access_granted_by_idx").on(table.grantedBy)],
);

export const invoiceCategories = pgTable(
  "الفئة",
  {
    id: serial("ID").primaryKey(),
    name: text("الفئة").notNull().unique(),
  },
);

export const alternateInvoiceCategories = pgTable("الفئه", {
  id: serial("ID").primaryKey(),
  name: text("الفئة"),
});

export const churchLookup = pgTable("الكنيسة التابع لها", {
  id: serial("ID").primaryKey(),
  number: text("num"),
  name: text("nam"),
  acheshe: text("Achesh"),
  father: text("Fathr"),
});

export const governorateLookup = pgTable("المحافظة", {
  id: serial("ID").primaryKey(),
  governorate: text("Cont"),
  district: text("Cet"),
});

export const dayLookup = pgTable("اليوم", {
  id: serial("ID").primaryKey(),
  day: text("اليوم"),
});

export const residentPurchases = pgTable(
  "مشتريات النزلاء",
  {
    id: serial("ID").primaryKey(),
    itemName: text("الصنف").notNull(),
    price: doublePrecision("السعر").notNull(),
    addToResidentAccount: boolean("اضافة").notNull().default(false),
    canteenItemNumber: integer("canteen_item_number").references(
      () => canteenProducts.itemNumber,
      { onDelete: "restrict" },
    ),
    needsReview: boolean("needs_review").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("resident_purchases_canteen_item_number_idx").on(
      table.canteenItemNumber,
    ),
    index("resident_purchases_needs_review_idx").on(table.needsReview),
    index("resident_purchases_created_by_idx").on(table.createdBy),
    check("resident_purchases_price_check", sql`${table.price} >= 0`),
  ],
);

export const residentInvoices = pgTable(
  "راس الفاتورة",
  {
    id: serial("ID").notNull().unique(),
    invoiceNumber: serial("رقم الفاتورة").primaryKey(),
    invoiceDate: date("تاريخ الفاتورة", { mode: "string" }).notNull(),
    residentNumber: integer("اسم النزيل").references(() => legacyResidents.id, {
      onDelete: "restrict",
    }),
    residentId: uuid("resident_id").references(() => residents.id, {
      onDelete: "restrict",
    }),
    saleType: text("sale_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("resident_invoices_resident_id_idx").on(table.residentId),
    index("resident_invoices_invoice_date_idx").on(table.invoiceDate),
    index("resident_invoices_resident_number_idx").on(table.residentNumber),
    index("resident_invoices_created_by_idx").on(table.createdBy),
    check(
      "resident_invoices_sale_type_check",
      sql`${table.saleType} IN ('resident', 'cash')`,
    ),
    check(
      "resident_invoices_sale_resident_check",
      sql`(${table.saleType} = 'resident' AND ${table.residentId} IS NOT NULL) OR (${table.saleType} = 'cash' AND ${table.residentId} IS NULL)`,
    ),
  ],
);

export const residentInvoiceLines = pgTable(
  "اطراف الفاتورة",
  {
    id: serial("ID").primaryKey(),
    balance: integer("الرصيد").notNull().default(0),
    alternateCategory: text("الفئه").notNull().default(""),
    categoryId: integer("الفئة").references(() => invoiceCategories.id, {
      onDelete: "restrict",
    }),
    itemName: text("الصنف").notNull(),
    unitPrice: text("السعر").notNull(),
    quantity: text("الكمية").notNull(),
    total: integer("الاجمالى").notNull(),
    invoiceDate: date("التاريخ", { mode: "string" }).notNull(),
    dayName: text("اليوم").notNull(),
    monthName: text("الشهر").notNull(),
    invoiceNumber: integer("رقم")
      .notNull()
      .references(() => residentInvoices.invoiceNumber, { onDelete: "restrict" }),
    purchaseId: integer("purchase_id").references(
      () => residentPurchases.id,
      { onDelete: "restrict" },
    ),
  },
  (table) => [
    index("resident_invoice_lines_invoice_number_idx").on(table.invoiceNumber),
    index("resident_invoice_lines_category_id_idx").on(table.categoryId),
    index("resident_invoice_lines_purchase_id_idx").on(table.purchaseId),
    check("resident_invoice_lines_total_check", sql`${table.total} > 0`),
  ],
);

export const residentInvoicePayments = pgTable(
  "resident_invoice_payments",
  {
    id: serial("id").primaryKey(),
    invoiceNumber: integer("invoice_number")
      .notNull()
      .references(() => residentInvoices.invoiceNumber, {
        onDelete: "restrict",
      }),
    kind: invoicePaymentKind("kind").notNull().default("payment"),
    amount: integer("amount").notNull(),
    paymentDate: date("payment_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("resident_invoice_payments_invoice_number_idx").on(
      table.invoiceNumber,
    ),
    index("resident_invoice_payments_created_by_idx").on(table.createdBy),
    check("resident_invoice_payments_amount_check", sql`${table.amount} > 0`),
  ],
);

export const residentInvoiceVoids = pgTable(
  "resident_invoice_voids",
  {
    invoiceNumber: integer("invoice_number")
      .primaryKey()
      .references(() => residentInvoices.invoiceNumber, {
        onDelete: "restrict",
      }),
    reason: text("reason").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    voidedBy: text("voided_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [index("resident_invoice_voids_voided_by_idx").on(table.voidedBy)],
);

export const invoiceStockMovementLinks = pgTable(
  "invoice_stock_movement_links",
  {
    invoiceLineId: integer("invoice_line_id")
      .primaryKey()
      .references(() => residentInvoiceLines.id, { onDelete: "restrict" }),
    movementId: integer("movement_id")
      .notNull()
      .unique()
      .references(() => canteenStockLedger.id, { onDelete: "restrict" }),
  },
);

export const refrigeratorItemCatalog = pgTable(
  "الاصناف / الفئة",
  {
    id: serial("ID").primaryKey(),
    itemCategory: text("الصنف / الفئة").notNull(),
    price: doublePrecision("السعر").notNull(),
    quantity: doublePrecision("الكمية").notNull().default(0),
  },
  (table) => [
    check("refrigerator_item_catalog_price_check", sql`${table.price} >= 0`),
    check(
      "refrigerator_item_catalog_quantity_check",
      sql`${table.quantity} >= 0`,
    ),
  ],
);

export const refrigeratorItems = pgTable(
  "راس الثلاجة",
  {
    id: serial("ID").notNull().unique(),
    itemNumber: serial("رقم الصنف").primaryKey(),
    voucherNumber: doublePrecision("رقم سند الصرف"),
    beneficiary: text("اسم المستفيد"),
    itemCategory: text("الصنف / الفئة").notNull(),
    catalogId: integer("catalog_id")
      .notNull()
      .unique()
      .references(() => refrigeratorItemCatalog.id, { onDelete: "restrict" }),
  },
);

export const refrigeratorStockLedger = pgTable(
  "اطراف الثلاجة",
  {
    id: serial("ID").primaryKey(),
    itemCategory: text("الصنف / الفئة").notNull(),
    quantity: doublePrecision("الكمية"),
    price: doublePrecision("السعر"),
    total: doublePrecision("الاجمالى"),
    outgoing: doublePrecision("المنصرف"),
    outgoingDate: date("تاريخ الصرف", { mode: "string" }),
    issuePermitNumber: doublePrecision("رقم اذن الصرف"),
    recipient: text("جهة الصرف"),
    itemNumber: integer("رقم الصنف")
      .notNull()
      .references(() => refrigeratorItems.itemNumber, { onDelete: "restrict" }),
    direction: refrigeratorMovementDirection("movement_direction").notNull(),
    receivedDate: date("received_date", { mode: "string" }),
    needsReview: boolean("needs_review").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("refrigerator_stock_ledger_item_number_idx").on(table.itemNumber),
    index("refrigerator_stock_ledger_received_date_idx").on(table.receivedDate),
    index("refrigerator_stock_ledger_outgoing_date_idx").on(table.outgoingDate),
    index("refrigerator_stock_ledger_needs_review_idx").on(table.needsReview),
    index("refrigerator_stock_ledger_created_by_idx").on(table.createdBy),
    check("refrigerator_stock_ledger_price_check", sql`${table.price} >= 0`),
    check("refrigerator_stock_ledger_total_check", sql`${table.total} >= 0`),
    check(
      "refrigerator_stock_ledger_direction_check",
      sql`(${table.direction} = 'in' AND ${table.quantity} > 0 AND (${table.receivedDate} IS NOT NULL OR ${table.needsReview} = true) AND ${table.outgoing} IS NULL AND ${table.outgoingDate} IS NULL) OR (${table.direction} = 'out' AND ${table.outgoing} > 0 AND ${table.outgoingDate} IS NOT NULL AND ${table.quantity} IS NULL AND ${table.receivedDate} IS NULL)`,
    ),
  ],
);

export const meatSalesInvoices = pgTable(
  "فواتير بيع اللحوم",
  {
    id: serial("ID").notNull().unique(),
    invoiceNumber: serial("رقم الفاتورة").primaryKey(),
    saleDate: date("تاريخ البيع", { mode: "string" }).notNull(),
    issuePermitNumber: doublePrecision("رقم اذن الصرف"),
    beneficiary: text("اسم المستفيد").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("meat_sales_invoice_date_idx").on(table.saleDate),
    index("meat_sales_invoices_created_by_idx").on(table.createdBy),
  ],
);

export const meatSalesInvoiceLines = pgTable(
  "اطراف فواتير البيع",
  {
    id: serial("ID").primaryKey(),
    itemCategory: text("الصنف / الفئة").notNull(),
    price: doublePrecision("السعر").notNull(),
    quantity: doublePrecision("الكمية").notNull(),
    total: doublePrecision("الاجمالى"),
    saleDate: date("تاريخ البيع", { mode: "string" }).notNull(),
    invoiceNumber: integer("رقم")
      .notNull()
      .references(() => meatSalesInvoices.invoiceNumber, {
        onDelete: "restrict",
      }),
    refrigeratorItemNumber: integer("refrigerator_item_number")
      .notNull()
      .references(() => refrigeratorItems.itemNumber, {
        onDelete: "restrict",
      }),
  },
  (table) => [
    index("meat_sales_invoice_lines_invoice_number_idx").on(
      table.invoiceNumber,
    ),
    index("meat_sales_invoice_lines_item_number_idx").on(
      table.refrigeratorItemNumber,
    ),
    check("meat_sales_invoice_lines_price_check", sql`${table.price} >= 0`),
    check("meat_sales_invoice_lines_quantity_check", sql`${table.quantity} > 0`),
    check("meat_sales_invoice_lines_total_check", sql`${table.total} >= 0`),
  ],
);

export const refrigeratorStockVoids = pgTable(
  "refrigerator_stock_voids",
  {
    movementId: integer("movement_id")
      .primaryKey()
      .references(() => refrigeratorStockLedger.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    voidedBy: text("voided_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("refrigerator_stock_voids_voided_by_idx").on(table.voidedBy),
  ],
);

export const meatSaleStockMovementLinks = pgTable(
  "meat_sale_stock_movement_links",
  {
    invoiceLineId: integer("invoice_line_id")
      .primaryKey()
      .references(() => meatSalesInvoiceLines.id, { onDelete: "restrict" }),
    movementId: integer("movement_id")
      .notNull()
      .unique()
      .references(() => refrigeratorStockLedger.id, { onDelete: "restrict" }),
  },
);

export const meatSalePayments = pgTable(
  "meat_sale_payments",
  {
    id: serial("id").primaryKey(),
    invoiceNumber: integer("invoice_number")
      .notNull()
      .references(() => meatSalesInvoices.invoiceNumber, {
        onDelete: "restrict",
      }),
    kind: meatSalePaymentKind("kind").notNull().default("payment"),
    amount: doublePrecision("amount").notNull(),
    paymentDate: date("payment_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("meat_sale_payments_invoice_number_idx").on(table.invoiceNumber),
    index("meat_sale_payments_created_by_idx").on(table.createdBy),
    check("meat_sale_payments_amount_check", sql`${table.amount} > 0`),
  ],
);

export const meatSaleVoids = pgTable(
  "meat_sale_voids",
  {
    invoiceNumber: integer("invoice_number")
      .primaryKey()
      .references(() => meatSalesInvoices.invoiceNumber, {
        onDelete: "restrict",
      }),
    reason: text("reason").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    voidedBy: text("voided_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [index("meat_sale_voids_voided_by_idx").on(table.voidedBy)],
);

export const staffProfiles = pgTable(
  "تحديث البيانات",
  {
    profileNumber: serial("ID1").primaryKey(),
    employeeId: text("ID"),
    firstName: text("الاسم الاول"),
    thirdName: text("الاسم الثالث"),
    nationalId: text("الرقم القومى"),
    address: text("العنوان"),
    governorate: text("المحافظة"),
    district: text("المركز / الحى"),
    birthDate: date("تاريخ الميلاد", { mode: "string" }),
    maritalStatus: text("الحالة الاجتماعية"),
    qualification: text("الموهل الدراسى"),
    employmentStartDate: date("تاريخ الالتحاق بالعمل", { mode: "string" }),
    mobile: text("الموبايل"),
    church: text("الكنيسة التابع لها"),
    confessor: text("أب الاعتراف"),
    confessorPhone: text("رقم اب الاعتراف"),
    denomination: text("الطائفة"),
    previousWorkplaces: text("اماكن العمل السابقة"),
    computerPrograms: text("برامج الكمبيوتر"),
    jobSpecialty: text("تخصص العمل"),
    employmentOffice: text("مكتب التوظيف"),
    photo: text("صورة"),
    notes: text("ملاحظات"),
    imagePath: text("ImagePath"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("staff_profiles_employee_id_idx").on(table.employeeId),
    index("staff_profiles_name_idx").on(table.firstName, table.thirdName),
    index("staff_profiles_created_by_idx").on(table.createdBy),
  ],
);

export const staffEmployees = pgTable("الموظفين", {
  id: integer("ID"),
  employeeNumber: integer("رقم الموظف").primaryKey(),
  employeeName: text("اسم الموظف / العامل").notNull(),
});

export const staffLeaveEntries = pgTable(
  "اطراف الموظفين",
  {
    id: serial("ID").primaryKey(),
    leaveDate: date("تاريخ النزول", { mode: "string" }).notNull(),
    returnDate: date("تاريخ العودة", { mode: "string" }).notNull(),
    leaveType: text("نوع الاجازة").notNull(),
    notes: text("ملاحظات"),
    employeeNumber: integer("رقم")
      .notNull()
      .references(() => staffEmployees.employeeNumber, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("staff_leave_employee_number_idx").on(table.employeeNumber),
    index("staff_leave_date_idx").on(table.leaveDate),
    index("staff_leave_created_by_idx").on(table.createdBy),
    check(
      "staff_leave_dates_check",
      sql`${table.returnDate} >= ${table.leaveDate}`,
    ),
  ],
);

export const staffAccountLinks = pgTable(
  "staff_account_links",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    profileNumber: integer("profile_number")
      .notNull()
      .unique()
      .references(() => staffProfiles.profileNumber, { onDelete: "restrict" }),
    employeeNumber: integer("employee_number")
      .notNull()
      .unique()
      .references(() => staffEmployees.employeeNumber, { onDelete: "restrict" }),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    linkedBy: text("linked_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [index("staff_account_links_linked_by_idx").on(table.linkedBy)],
);

export const staffAttendance = pgTable(
  "staff_attendance",
  {
    id: serial("id").primaryKey(),
    employeeNumber: integer("employee_number")
      .notNull()
      .references(() => staffEmployees.employeeNumber, { onDelete: "restrict" }),
    clockInAt: timestamp("clock_in_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    clockOutAt: timestamp("clock_out_at", { withTimezone: true }),
    clockInBy: text("clock_in_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    clockOutBy: text("clock_out_by").references(() => user.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    index("staff_attendance_clock_in_by_idx").on(table.clockInBy),
    index("staff_attendance_clock_out_by_idx").on(table.clockOutBy),
    index("staff_attendance_employee_clock_in_idx").on(
      table.employeeNumber,
      table.clockInAt,
    ),
    uniqueIndex("staff_attendance_one_open_per_employee_idx")
      .on(table.employeeNumber)
      .where(sql`${table.clockOutAt} is null`),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, string>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_actor_occurred_idx").on(
      table.actorUserId,
      table.occurredAt,
    ),
    index("audit_logs_entity_occurred_idx").on(
      table.entity,
      table.occurredAt,
    ),
  ],
);

export const authSchema = {
  user,
  session,
  account,
  verification,
};

import fs from "node:fs";
import path from "node:path";

export async function applyDerivations({ plan, client, tables, norm, group }) {
  const problems = [];
  const N = (row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [norm(key), value]));
  const g = (row, name) => row[norm(name)];
  const rk = (row, name) => Object.keys(row).find((key) => norm(key) === norm(name));
  const blank = (value) =>
    value === undefined || value === null || String(value).trim() === "";
  const num = (value) => {
    if (blank(value)) return 0;
    const parsed = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const exactNumber = (value) => {
    if (blank(value)) return null;
    const parsed = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const key = (value) => norm(String(value ?? ""));
  const productKey = (value) => key(value);
  const ent = (table) => plan.find((entry) => entry.table === table);
  const ids = (rows, indexes) =>
    indexes
      .slice(0, 15)
      .map((index) => g(rows[index], "ID") ?? `#${index + 2}`)
      .join(", ") + (indexes.length > 15 ? " ..." : "");
  const sourceIds = (rows, indexes) =>
    indexes.map((index) => String(g(rows[index], "ID") ?? `row:${index + 2}`));

  async function rowsOf(table) {
    const entry = ent(table);
    if (entry) return entry.rows.map(N);
    const { rows } = await client.query(`SELECT * FROM public."${table.replace(/"/g, '""')}"`);
    return rows.map(N);
  }

  function addCol(entry, columnName, values) {
    const column = tables.get(entry.table)?.find((item) => item.column_name === columnName);
    if (!column) throw new Error(`العمود ${columnName} مش موجود في ${entry.table}`);

    const header = `__d_${columnName}`;
    entry.rows.forEach((row, index) => {
      row[header] = values[index];
      row[columnName] = values[index];
    });
    entry.mapping = entry.mapping.filter(
      (mapping) => mapping.col.column_name !== columnName
    );
    entry.mapping.push({ header, col: column });
  }

  function resolve({
    label,
    e,
    outCol,
    parents,
    childKey,
    parentKey,
    parentVal,
    fallback,
  }) {
    const rows = e.rows.map(N);
    const index = new Map();
    for (const parent of parents) {
      const parentName = parentKey(parent);
      if (!parentName) continue;
      if (!index.has(parentName)) index.set(parentName, []);
      index.get(parentName).push(parentVal(parent));
    }

    const values = [];
    const missing = [];
    const ambiguous = [];
    rows.forEach((row, rowIndex) => {
      let matches = index.get(childKey(row));
      if ((!matches || !matches.length) && fallback) {
        matches = index.get(fallback(row));
      }

      if (matches?.length === 1 && !blank(matches[0])) {
        values.push(matches[0]);
      } else if (matches?.length > 1) {
        values.push(null);
        ambiguous.push(rowIndex);
      } else {
        values.push(null);
        missing.push(rowIndex);
      }
    });

    const matched = rows.length - missing.length - ambiguous.length;
    e.matchStats = {
      matched,
      missingIds: sourceIds(rows, missing),
      ambiguousIds: sourceIds(rows, ambiguous),
    };
    console.log(
      `${missing.length || ambiguous.length ? "✖" : "✔"} ${label}: ${matched}/${rows.length} اتطابقوا (الأب فيه ${parents.length} صف)`
    );
    if (missing.length) {
      problems.push(
        `${label}: ${missing.length} صف مفيش ليهم أب مطابق (ID: ${ids(rows, missing)})`
      );
    }
    if (ambiguous.length) {
      problems.push(
        `${label}: ${ambiguous.length} صف ملتبسين، أكتر من أب بنفس الاسم (ID: ${ids(rows, ambiguous)})`
      );
    }
    addCol(e, outCol, values);
  }

  const refrigeratorCatalog = await rowsOf("الاصناف / الفئة");
  const refrigeratorCatalogEntry = ent("الاصناف / الفئة");
  for (const raw of refrigeratorCatalogEntry?.rows ?? []) {
    const row = N(raw);
    const itemName = key(g(row, "الصنف / الفئة"));
    const hasPrice = !blank(g(row, "السعر"));
    const hasQuantity = !blank(g(row, "الكمية"));
    if (
      [key("السعر القديم"), key("السعر الجديد")].includes(itemName) &&
      !hasPrice &&
      !hasQuantity
    ) {
      raw.__quarantineReason = "source_section_label_not_catalog_item";
    }
  }
  const catalogById = new Map();
  for (const row of refrigeratorCatalog) {
    const id = key(g(row, "ID"));
    if (!catalogById.has(id)) catalogById.set(id, []);
    catalogById.get(id).push(row);
  }

  let   e = ent("راس الثلاجة");
  if (e) {
    const rows = e.rows.map(N);
    const catalogById = new Map();
    for (const catalogRow of refrigeratorCatalog) {
      const id = key(g(catalogRow, "ID"));
      if (!catalogById.has(id)) catalogById.set(id, []);
      catalogById.get(id).push(catalogRow);
    }
    const catalogIds = [];
    const invalid = [];
    rows.forEach((row, index) => {
      const headerId = Number(g(row, "ID"));
      const expectedCatalogId =
        Number.isInteger(headerId) && headerId >= 1 && headerId <= 14
          ? headerId <= 7
            ? headerId + 1
            : headerId + 2
          : null;
      const matches = expectedCatalogId
        ? catalogById.get(key(expectedCatalogId)) ?? []
        : [];
      if (
        matches.length !== 1 ||
        key(g(matches[0] ?? {}, "الصنف / الفئة")) !==
          key(g(row, "الصنف / الفئة"))
      ) {
        catalogIds.push(null);
        invalid.push(index);
      } else {
        catalogIds.push(g(matches[0], "ID"));
      }
    });
    console.log(
      `${invalid.length ? "✖" : "✔"} راس الثلاجة.catalog_id: ${rows.length - invalid.length}/${rows.length} validated source-ID and exact-name matches`
    );
    if (invalid.length) {
      problems.push(
        `راس الثلاجة.catalog_id: ${invalid.length} صفوف لا تطابق ربط مجموعتي الكتالوج المعتمد (ID: ${ids(rows, invalid)})`
      );
    }
    addCol(e, "catalog_id", catalogIds);
  }

  e = ent("راس المخزن");
  if (e) {
    const warehouseCatalog = ent("الاصناف");
    if (!warehouseCatalog) throw new Error("WAREHOUSE_CATALOG_CSV_MISSING");
    const sourceCatalogRows = warehouseCatalog.rows.map(N);
    const existingCatalog = await client.query(
      'SELECT "ID", "الاصناف" FROM public."الاصناف"',
    );
    const catalogRowsById = new Map();
    const conflictingCatalogIds = new Set();
    for (const row of [...sourceCatalogRows, ...existingCatalog.rows.map(N)]) {
      const id = key(g(row, "ID"));
      const previous = catalogRowsById.get(id);
      if (!previous) {
        catalogRowsById.set(id, row);
      } else if (key(g(previous, "الاصناف")) !== key(g(row, "الاصناف"))) {
        conflictingCatalogIds.add(id);
      }
    }
    const knownCatalogRows = [...catalogRowsById]
      .filter(([id]) => !conflictingCatalogIds.has(id))
      .map(([, row]) => row);
    let nextCatalogId = Math.max(
      0,
      ...knownCatalogRows.map((row) => Number(g(row, "ID")) || 0),
    );
    const catalogByName = new Map();
    for (const row of knownCatalogRows) {
      const name = key(g(row, "الاصناف"));
      if (name) {
        const ids = catalogByName.get(name) ?? new Set();
        ids.add(g(row, "ID"));
        catalogByName.set(name, ids);
      }
    }
    const addedIds = [];
    const sourceHeaders = e.rows.map(N);
    for (const row of sourceHeaders) {
      const sourceId = Number(g(row, "ID"));
      if (!Number.isInteger(sourceId) || sourceId < 73 || sourceId > 80) continue;
      const itemName = String(g(row, "الصنف") ?? "");
      const nameKey = key(itemName);
      if (!nameKey) continue;
      const matchingCatalogIds = catalogByName.get(nameKey);
      let catalogId = matchingCatalogIds?.size === 1
        ? [...matchingCatalogIds][0]
        : undefined;
      if (!matchingCatalogIds) {
        catalogId = ++nextCatalogId;
        const rawRow = {};
        const idHeader = Object.keys(warehouseCatalog.rows[0] ?? {}).find(
          (header) => norm(header) === norm("ID"),
        ) ?? "ID";
        const nameHeader = Object.keys(warehouseCatalog.rows[0] ?? {}).find(
          (header) => norm(header) === norm("الاصناف"),
        ) ?? "الاصناف";
        rawRow[idHeader] = String(catalogId);
        rawRow[nameHeader] = itemName;
        warehouseCatalog.rows.push(rawRow);
        catalogByName.set(nameKey, new Set([catalogId]));
        addedIds.push(catalogId);
      }
    }
    if (addedIds.length) {
      console.log(`WAREHOUSE_CATALOG_ADDED_COUNT=${addedIds.length} IDS=${addedIds.join(",")}`);
    }
    resolve({
      label: "راس المخزن.catalog_id",
      e,
      outCol: "catalog_id",
      parents: [...knownCatalogRows, ...warehouseCatalog.rows.slice(sourceCatalogRows.length).map(N)],
      childKey: (child) => key(g(child, "الصنف")),
      parentKey: (parent) => key(g(parent, "الاصناف")),
      parentVal: (parent) => g(parent, "ID"),
    });
  }

  e = ent("كانتين");
  if (e) {
    const rows = e.rows.map(N);
    addCol(
      e,
      "needs_review",
      rows.map((row) => blank(g(row, "السعر"))),
    );
  }

  e = ent("طرف الكانين");
  if (e) {
    const rows = e.rows.map(N);
    const balances = [];
    const needsReview = [];
    rows.forEach((row) => {
      const balance = exactNumber(g(row, "الرصيد"));
      balances.push(balance === null ? 0 : balance);
      needsReview.push(balance === null);
    });
    addCol(e, "الرصيد", balances);
    addCol(e, "needs_review", needsReview);
  }

  e = ent("راس الكانتين");
  if (e) {
    const rows = e.rows.map(N);
    addCol(
      e,
      "needs_review",
      rows.map((row) => blank(g(row, "المستلم"))),
    );
  }

  e = ent("مشتريات النزلاء");
  if (e) {
    const rows = e.rows.map(N);
    const prices = [];
    const needsReview = [];
    rows.forEach((row) => {
      const price = exactNumber(g(row, "السعر"));
      prices.push(price === null ? 0 : price);
      needsReview.push(price === null);
    });
    addCol(e, "السعر", prices);
    addCol(e, "needs_review", needsReview);
  }

  e = ent("راس العهدة");
  if (e) {
    resolve({
      label: "راس العهدة.recipient_employee_number",
      e,
      outCol: "recipient_employee_number",
      parents: await rowsOf("الموظفين"),
      childKey: (child) => key(g(child, "العهدة")),
      parentKey: (parent) => key(g(parent, "اسم الموظف / العامل")),
      parentVal: (parent) => g(parent, "رقم الموظف"),
    });
  }

  e = ent("العهدة");
  if (e) {
    resolve({
      label: "العهدة.warehouse_number",
      e,
      outCol: "warehouse_number",
      parents: await rowsOf("راس المخزن"),
      childKey: (child) => key(g(child, "الاصناف / الفئة")),
      parentKey: (parent) => key(g(parent, "الصنف")),
      parentVal: (parent) => g(parent, "رقم"),
    });
  }

  e = ent("راس العهدة");
  if (e) {
    const rows = e.rows.map(N);
    addCol(
      e,
      "needs_review",
      rows.map(
        (row) =>
          blank(g(row, "التاريخ")) ||
          blank(g(row, "recipient_employee_number")),
      ),
    );
  }

  e = ent("العهدة");
  if (e) {
    const rows = e.rows.map(N);
    const prices = [];
    const totals = [];
    const needsReview = [];
    rows.forEach((row) => {
      const quantity = exactNumber(g(row, "الكمية"));
      const price = exactNumber(g(row, "السعر"));
      prices.push(price === null ? 0 : price);
      totals.push(quantity !== null && price !== null ? quantity * price : 0);
      needsReview.push(
        blank(g(row, "الاصناف / الفئة")) ||
          quantity === null ||
          price === null ||
          blank(g(row, "التاريخ")) ||
          blank(g(row, "warehouse_number")),
      );
    });
    addCol(e, "السعر", prices);
    addCol(e, "الإجمالى", totals);
    addCol(e, "needs_review", needsReview);
  }

  const custodyHeaders = ent("راس العهدة");
  const custodyDetails = ent("العهدة");
  if (group === "C" && (custodyHeaders || custodyDetails)) {
    const headerToEmployeeNumber = {};
    const detailToWarehouseNumber = {};
    for (const [index, raw] of (custodyHeaders?.rows ?? []).entries()) {
      const row = N(raw);
      const employeeNumber = g(row, "recipient_employee_number");
      if (!blank(employeeNumber)) {
        headerToEmployeeNumber[String(g(row, "ID") ?? `row:${index + 2}`)] =
          String(employeeNumber);
      }
    }
    for (const [index, raw] of (custodyDetails?.rows ?? []).entries()) {
      const row = N(raw);
      const warehouseNumber = g(row, "warehouse_number");
      if (!blank(warehouseNumber)) {
        detailToWarehouseNumber[String(g(row, "ID") ?? `row:${index + 2}`)] =
          String(warehouseNumber);
      }
    }
    const directory = path.resolve("mappings");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, "custody.json"),
      `${JSON.stringify({ headerToEmployeeNumber, detailToWarehouseNumber }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    const rawBase = (value) => String(value ?? "").normalize("NFKC").toLowerCase();
    const withoutSpaces = (value) => rawBase(value).replace(/\s/gu, "");
    const hamzaNormalized = (value) =>
      rawBase(value).replace(/[أإآٱ]/gu, "ا").replace(/[ؤئء]/gu, "");
    const withoutCommonPrefix = (value) =>
      key(value).replace(/^(?:ال|ابو|اب|الشيخ|الاب)/u, "");
    const sortedWords = (value) =>
      rawBase(value)
        .split(/[^\p{L}\p{N}]+/u)
        .map(key)
        .filter(Boolean)
        .sort()
        .join("");
    const slashParts = (value) =>
      String(value ?? "").split("/").map(key).filter(Boolean).sort().join("");
    const patternCounts = {
      whitespace: 0,
      hamza: 0,
      prefix: 0,
      word_order: 0,
      slash: 0,
    };
    const inspectPatterns = (entry, childField, parentRows, parentField) => {
      if (!entry) return;
      const sourceRows = entry.rows.map(N);
      const childTransforms = [
        withoutSpaces, hamzaNormalized, withoutCommonPrefix, sortedWords, slashParts,
      ];
      const parentIndexes = childTransforms.map(() => new Set());
      const exactParents = new Set(parentRows.map((row) => key(g(row, parentField))));
      sourceRows.forEach((row, rowIndex) => {
        const childName = g(row, childField);
        if (exactParents.has(key(childName))) return;
        const transforms = childTransforms.map((transform) => transform(childName));
        parentRows.forEach((parent) => {
          const parentName = g(parent, parentField);
          childTransforms.forEach((transform, transformIndex) => {
            if (transforms[transformIndex] &&
              transforms[transformIndex] === transform(parentName)) {
              parentIndexes[transformIndex].add(rowIndex);
            }
          });
        });
      });
      Object.keys(patternCounts).forEach((name, index) => {
        patternCounts[name] += parentIndexes[index].size;
      });
    };
    inspectPatterns(
      custodyHeaders,
      "العهدة",
      (await rowsOf("الموظفين")).map(N),
      "اسم الموظف / العامل",
    );
    inspectPatterns(
      custodyDetails,
      "الاصناف / الفئة",
      (await rowsOf("راس المخزن")).map(N),
      "الصنف",
    );
    const report = {
      headerToEmployeeNumber: custodyHeaders?.matchStats ?? null,
      detailToWarehouseNumber: custodyDetails?.matchStats ?? null,
      patternCandidateCounts: patternCounts,
    };
    const reportsDirectory = path.resolve("reports");
    fs.mkdirSync(reportsDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(reportsDirectory, "custody-review.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    console.log(
      `CUSTODY_EXACT_MAPPINGS headers=${Object.keys(headerToEmployeeNumber).length} details=${Object.keys(detailToWarehouseNumber).length}`,
    );
    console.log(`CUSTODY_PATTERN_CANDIDATES=${JSON.stringify(patternCounts)}`);
  }

  e = ent("اطراف فواتير البيع");
  if (e) {
    const refrigeratorHeaders = await rowsOf("راس الثلاجة");
    const headerByNumber = new Map(
      refrigeratorHeaders.map((row) => [key(g(row, "رقم الصنف")), row])
    );
    const catalogItemsByNamePrice = new Map();
    for (const header of refrigeratorHeaders) {
      const catalogRows = catalogById.get(key(g(header, "catalog_id"))) ?? [];
      if (catalogRows.length !== 1) continue;
      const price = exactNumber(g(catalogRows[0], "السعر"));
      if (price === null) continue;
      const matchKey = `${productKey(g(header, "الصنف / الفئة"))}|${price}`;
      if (!catalogItemsByNamePrice.has(matchKey)) {
        catalogItemsByNamePrice.set(matchKey, new Set());
      }
      catalogItemsByNamePrice.get(matchKey).add(key(g(header, "رقم الصنف")));
    }

    const invoicePermits = new Map();
    for (const invoice of await rowsOf("فواتير بيع اللحوم")) {
      const invoiceNumber = key(g(invoice, "رقم الفاتورة"));
      if (invoiceNumber) {
        invoicePermits.set(invoiceNumber, key(g(invoice, "رقم اذن الصرف")));
      }
    }

    const issuesByPermit = new Map();
    for (const movement of await rowsOf("اطراف الثلاجة")) {
      const permit = key(g(movement, "رقم اذن الصرف"));
      const itemNumber = key(g(movement, "رقم الصنف"));
      const outgoing = num(g(movement, "المنصرف"));
      const incoming = num(g(movement, "الكمية"));
      if (!permit || !itemNumber || incoming !== 0 || outgoing === null || outgoing <= 0) {
        continue;
      }
      if (!issuesByPermit.has(permit)) issuesByPermit.set(permit, []);
      issuesByPermit.get(permit).push({
        itemNumber,
        itemName: productKey(
          g(headerByNumber.get(itemNumber) ?? {}, "الصنف / الفئة")
        ),
        quantity: outgoing,
        price: exactNumber(g(movement, "السعر")),
      });
    }

    const rows = e.rows.map(N);
    const values = [];
    const missing = [];
    const ambiguous = [];
    rows.forEach((row, index) => {
      const invoiceNumber = key(g(row, "رقم"));
      const permit = invoicePermits.get(invoiceNumber);
      const issues = permit ? issuesByPermit.get(permit) ?? [] : [];
      const permitItems = new Set(
        issues.map((issue) => issue.itemNumber).filter((number) => headerByNumber.has(number))
      );
      let candidates = [];

      if (permitItems.size === 1) {
        candidates = [...permitItems];
      } else if (permitItems.size > 1) {
        const price = exactNumber(g(row, "السعر"));
        const quantity = exactNumber(g(row, "الكمية"));
        const name = productKey(g(row, "الصنف / الفئة"));
        const evidence = [
          new Set(
            issues
              .filter((issue) => issue.itemName === name)
              .map((issue) => issue.itemNumber)
          ),
          new Set(
            issues
              .filter((issue) => quantity !== null && issue.quantity === quantity)
              .map((issue) => issue.itemNumber)
          ),
          new Set(
            issues
              .filter((issue) => price !== null && issue.price === price)
              .map((issue) => issue.itemNumber)
          ),
          catalogItemsByNamePrice.get(`${name}|${price}`) ?? new Set(),
        ].filter((matches) => matches.size > 0);

        candidates = [...permitItems].filter((itemNumber) =>
          evidence.every((matches) => matches.has(itemNumber))
        );
      } else {
        const price = exactNumber(g(row, "السعر"));
        const name = productKey(g(row, "الصنف / الفئة"));
        candidates = [
          ...(catalogItemsByNamePrice.get(`${name}|${price}`) ?? new Set()),
        ].filter((itemNumber) => headerByNumber.has(itemNumber));
      }

      if (candidates.length === 1) {
        values.push(g(headerByNumber.get(candidates[0]), "رقم الصنف"));
      } else {
        values.push(null);
        (candidates.length > 1 || permitItems.size > 1 ? ambiguous : missing).push(index);
      }
    });
    const matched = rows.length - missing.length - ambiguous.length;
    console.log(
      `${missing.length || ambiguous.length ? "✖" : "✔"} اطراف فواتير البيع.refrigerator_item_number: ${matched}/${rows.length} اتطابقوا بأذن الصرف أو الاسم والسعر الدقيق`
    );
    if (missing.length) {
      problems.push(
        `اطراف فواتير البيع.refrigerator_item_number: ${missing.length} صف مفيش له حركة ثلاجة أو كتالوج مطابق (ID: ${ids(rows, missing)})`
      );
    }
    if (ambiguous.length) {
      problems.push(
        `اطراف فواتير البيع.refrigerator_item_number: ${ambiguous.length} صف ملتبس بعد فحص أذن الصرف والاسم والكمية والسعر (ID: ${ids(rows, ambiguous)})`
      );
    }
    addCol(e, "refrigerator_item_number", values);
  }

  e = ent("اطراف الكانتين");
  if (e) {
    resolve({
      label: "اطراف الكانتين.رقم المستند",
      e,
      outCol: "رقم المستند",
      parents: await rowsOf("راس الكانتين"),
      childKey: (child) => key(g(child, "رقم الصنف")),
      parentKey: (parent) => key(g(parent, "رقم الصنف")),
      parentVal: (parent) => g(parent, "ID"),
    });
  }

  e = ent("اطراف الكانتين");
  if (e) {
    const products = await rowsOf("كانتين");
    const productNameByItem = new Map();
    for (const product of products) {
      const itemNumber = key(g(product, "رقم الصنف"));
      const name = String(g(product, "اسم الصنف") ?? "");
      if (itemNumber && !productNameByItem.has(itemNumber)) {
        productNameByItem.set(itemNumber, name);
      }
    }
    const rows = e.rows.map(N);
    const itemNames = [];
    const balances = [];
    const needsReview = [];
    rows.forEach((row) => {
      const itemNumber = key(g(row, "رقم الصنف"));
      const name = productNameByItem.get(itemNumber);
      const balance = exactNumber(g(row, "الرصيد"));
      itemNames.push(name ?? "");
      balances.push(balance === null ? 0 : balance);
      needsReview.push(!name || balance === null);
    });
    addCol(e, "اسم الصنف", itemNames);
    addCol(e, "الرصيد", balances);
    addCol(e, "needs_review", needsReview);
  }

  e = ent("اطراف الثلاجة");
  if (e) {
    const rows = e.rows.map(N);
    const refrigeratorHeaders = await rowsOf("راس الثلاجة");
    const validItemNumbers = new Set(
      refrigeratorHeaders.map((row) => key(g(row, "رقم الصنف"))).filter(Boolean)
    );
    const directions = [];
    const receivedDates = [];
    const needsReview = [];
    const invalid = [];
    const missingItemNumbers = [];
    rows.forEach((row, index) => {
      const raw = e.rows[index];
      const incoming = num(g(row, "الكمية"));
      const outgoing = num(g(row, "المنصرف"));
      const itemNumber = key(g(row, "رقم الصنف"));
      const incomingKey = rk(raw, "الكمية");
      const outgoingKey = rk(raw, "المنصرف");
      const issueDateKey = rk(raw, "تاريخ الصرف");
      const empty = Object.entries(raw).every(
        ([column, value]) => norm(column) === norm("ID") || blank(value),
      );
      if (empty) raw.__quarantineReason = "empty_source_record";
      if (!itemNumber || !validItemNumbers.has(itemNumber)) {
        missingItemNumbers.push(index);
      }

      if (outgoing !== null && outgoing > 0 && incoming === 0) {
        directions.push("out");
        receivedDates.push(null);
        needsReview.push(false);
        if (incomingKey) raw[incomingKey] = "";
      } else if (incoming !== null && incoming > 0 && outgoing === 0) {
        directions.push("in");
        receivedDates.push(null);
        needsReview.push(true);
        if (outgoingKey) raw[outgoingKey] = "";
        if (issueDateKey) raw[issueDateKey] = "";
      } else {
        directions.push(null);
        receivedDates.push(null);
        needsReview.push(false);
        invalid.push(index);
      }
    });

    console.log(
      `REFRIGERATOR_MOVEMENTS incoming=${directions.filter((value) => value === "in").length} outgoing=${directions.filter((value) => value === "out").length} needs_review=${needsReview.filter(Boolean).length} invalid=${invalid.length}`
    );
    if (missingItemNumbers.length) {
      problems.push(
        `اطراف الثلاجة: ${missingItemNumbers.length} صف مفيش له رقم صنف مرتبط برأس ثلاجة (ID: ${ids(rows, missingItemNumbers)})`
      );
    }
    if (invalid.length) {
      problems.push(
        `اطراف الثلاجة: ${invalid.length} صف مش واضح وارد ولا منصرف (الاتنين فاضيين أو الاتنين فيهم قيمة/قيمة غير رقمية) (ID: ${ids(rows, invalid)})`
      );
    }
    addCol(e, "movement_direction", directions);
    addCol(e, "received_date", receivedDates);
    addCol(e, "needs_review", needsReview);
  }

  e = ent("اطراف المخزن");
  if (e) {
    const rows = e.rows.map(N);
    const kinds = [];
    const needsReview = [];
    const invalid = [];
    rows.forEach((row, index) => {
      const incoming = num(g(row, "الوارد"));
      const outgoing = num(g(row, "المنصرف"));
      if (incoming !== null && outgoing !== null && incoming > 0 && outgoing > 0) {
        kinds.push("receipt");
        needsReview.push(true);
      } else if (incoming === null || outgoing === null) {
        kinds.push(null);
        needsReview.push(false);
        invalid.push(index);
      } else {
        kinds.push(outgoing > 0 ? "custody_issue" : "receipt");
        needsReview.push(false);
      }
    });
    console.log(
      `WAREHOUSE_MOVEMENTS receipt=${kinds.filter((value) => value === "receipt").length} custody_issue=${kinds.filter((value) => value === "custody_issue").length} needs_review=${needsReview.filter(Boolean).length}`
    );
    if (invalid.length) {
      problems.push(
        `اطراف المخزن: ${invalid.length} صف فيه وارد ومنصرف مع بعض أو قيمة غير رقمية (ID: ${ids(rows, invalid)})`
      );
    }
    addCol(e, "movement_kind", kinds);
    addCol(e, "needs_review", needsReview);
  }

  e = ent("راس الفاتورة");
  if (e) {
    const rows = e.rows.map(N);
    const saleTypes = rows.map((row) =>
      blank(g(row, "اسم النزيل")) ? "cash" : "resident"
    );
    const residentCount = saleTypes.filter((value) => value === "resident").length;
    console.log(
      `ℹ راس الفاتورة: ${saleTypes.length - residentCount} نقدي، ${residentCount} لنزيل`
    );
    addCol(e, "sale_type", saleTypes);
    if (residentCount) {
      problems.push(
        `راس الفاتورة: ${residentCount} فاتورة لنزيل محتاجة resident_id، وجدول residents لازم يتملّي الأول. استخدم --skip="راس الفاتورة,اطراف الفاتورة" مؤقتًا.`
      );
    }
  }

  return problems;
}

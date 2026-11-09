export async function applyDerivations({ plan, client, tables, norm }) {
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
  const productKey = (value) => {
    let normalized = key(value);
    const poultrySuffix = "\u0641\u0631\u0627\u062e";
    if (normalized.length > poultrySuffix.length && normalized.endsWith(poultrySuffix)) {
      normalized = normalized.slice(0, -poultrySuffix.length);
    }
    return normalized.replace(/\u0629/g, "\u0647");
  };
  const first = (value) => key(String(value ?? "").split("/")[0]);
  const ent = (table) => plan.find((entry) => entry.table === table);
  const ids = (rows, indexes) =>
    indexes
      .slice(0, 15)
      .map((index) => g(rows[index], "ID") ?? `#${index + 2}`)
      .join(", ") + (indexes.length > 15 ? " ..." : "");

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
    childText,
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
    console.log(
      `${missing.length || ambiguous.length ? "✖" : "✔"} ${label}: ${matched}/${rows.length} اتطابقوا (الأب فيه ${parents.length} صف)`
    );
    if (missing.length) {
      let extra = "";
      if (childText) {
        const values = [
          ...new Set(missing.map((rowIndex) => String(childText(rows[rowIndex]) ?? ""))),
        ].slice(0, 10);
        extra = ` | القيم: ${values.join(" | ")}`;
      }
      problems.push(
        `${label}: ${missing.length} صف مفيش ليهم أب مطابق (ID: ${ids(rows, missing)})${extra}`
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
  const catalogById = new Map();
  for (const row of refrigeratorCatalog) {
    const id = key(g(row, "ID"));
    if (!catalogById.has(id)) catalogById.set(id, []);
    catalogById.get(id).push(row);
  }

  let e = ent("راس الثلاجة");
  if (e) {
    const rows = e.rows.map(N);
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
        key(g(matches[0] ?? {}, "الصنف / الفئة")) !== key(g(row, "الصنف / الفئة"))
      ) {
        catalogIds.push(null);
        invalid.push(index);
      } else {
        catalogIds.push(g(matches[0], "ID"));
      }
    });
    console.log(
      `${invalid.length ? "✖" : "✔"} راس الثلاجة.catalog_id: ${rows.length - invalid.length}/${rows.length} اتربطوا حسب ترتيب مجموعتي السعر القديم والجديد`
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
    resolve({
      label: "راس المخزن.catalog_id",
      e,
      outCol: "catalog_id",
      parents: await rowsOf("الاصناف"),
      childKey: (child) => key(g(child, "الصنف")),
      parentKey: (parent) => key(g(parent, "الاصناف")),
      parentVal: (parent) => g(parent, "ID"),
      fallback: (child) => first(g(child, "الصنف")),
      childText: (child) => g(child, "الصنف"),
    });
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
      fallback: (child) => first(g(child, "الاصناف / الفئة")),
    });
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

  e = ent("اطراف الثلاجة");
  if (e) {
    const originalRowCount = e.rows.length;
    e.rows = e.rows.filter((row) =>
      Object.entries(row).some(
        ([column, value]) => norm(column) !== norm("ID") && !blank(value)
      )
    );
    const emptyRowCount = originalRowCount - e.rows.length;
    if (emptyRowCount) {
      console.log(
        `ℹ اطراف الثلاجة: اتخطّى ${emptyRowCount} صف فارغ لا يحتوي بيانات حركة`
      );
    }
    const rows = e.rows.map(N);
    const refrigeratorHeaders = await rowsOf("راس الثلاجة");
    const validItemNumbers = new Set(
      refrigeratorHeaders.map((row) => key(g(row, "رقم الصنف"))).filter(Boolean)
    );
    const firstIssueDateByItem = new Map();
    const firstIssueDateByName = new Map();
    rows.forEach((row) => {
      const incoming = num(g(row, "الكمية"));
      const outgoing = num(g(row, "المنصرف"));
      const itemNumber = key(g(row, "رقم الصنف"));
      const itemName = key(g(row, "الصنف / الفئة"));
      const issueDate = g(row, "تاريخ الصرف");
      if (
        incoming !== 0 ||
        outgoing === null ||
        outgoing <= 0 ||
        (!itemNumber && !itemName) ||
        blank(issueDate)
      ) {
        return;
      }

      const timestamp = Date.parse(String(issueDate));
      if (Number.isNaN(timestamp)) return;
      if (itemNumber) {
        const previous = firstIssueDateByItem.get(itemNumber);
        if (!previous || timestamp < previous.timestamp) {
          firstIssueDateByItem.set(itemNumber, { timestamp, value: issueDate });
        }
      }
      if (itemName) {
        const previous = firstIssueDateByName.get(itemName);
        if (!previous || timestamp < previous.timestamp) {
          firstIssueDateByName.set(itemName, { timestamp, value: issueDate });
        }
      }
    });

    const directions = [];
    const receivedDates = [];
    const invalid = [];
    const missingReceivedDates = [];
    const missingItemNumbers = [];
    rows.forEach((row, index) => {
      const raw = e.rows[index];
      const incoming = num(g(row, "الكمية"));
      const outgoing = num(g(row, "المنصرف"));
      const itemNumber = key(g(row, "رقم الصنف"));
      const itemName = key(g(row, "الصنف / الفئة"));
      const firstIssueDate =
        firstIssueDateByItem.get(itemNumber) ?? firstIssueDateByName.get(itemName);
      const incomingKey = rk(raw, "الكمية");
      const outgoingKey = rk(raw, "المنصرف");
      const issueDateKey = rk(raw, "تاريخ الصرف");
      if (!itemNumber || !validItemNumbers.has(itemNumber)) {
        missingItemNumbers.push(index);
      }

      if (outgoing !== null && outgoing > 0 && incoming === 0) {
        directions.push("out");
        receivedDates.push(null);
        if (incomingKey) raw[incomingKey] = "";
      } else if (incoming !== null && incoming > 0 && outgoing === 0) {
        directions.push("in");
        receivedDates.push(firstIssueDate?.value ?? null);
        if (outgoingKey) raw[outgoingKey] = "";
        if (issueDateKey) raw[issueDateKey] = "";
        if (!firstIssueDate) missingReceivedDates.push(index);
      } else {
        directions.push(null);
        receivedDates.push(null);
        invalid.push(index);
      }
    });

    console.log(
      `ℹ اطراف الثلاجة: ${directions.filter((value) => value === "in").length} وارد، ${directions.filter((value) => value === "out").length} منصرف، ${invalid.length} غير محدد`
    );
    console.log(
      `ℹ اطراف الثلاجة: ${receivedDates.filter((value) => value !== null).length} تاريخ استلام مشتق من أول صرف مسجل لنفس الصنف`
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
    if (missingReceivedDates.length) {
      problems.push(
        `اطراف الثلاجة: ${missingReceivedDates.length} حركة واردة مفيش لها تاريخ أول صرف مسجل لنفس الصنف (ID: ${ids(rows, missingReceivedDates)})`
      );
    }
    addCol(e, "movement_direction", directions);
    addCol(e, "received_date", receivedDates);
  }

  e = ent("اطراف المخزن");
  if (e) {
    const rows = e.rows.map(N);
    const kinds = [];
    const invalid = [];
    rows.forEach((row, index) => {
      const incoming = num(g(row, "الوارد"));
      const outgoing = num(g(row, "المنصرف"));
      if (incoming === null || outgoing === null || (incoming > 0 && outgoing > 0)) {
        kinds.push(null);
        invalid.push(index);
      } else {
        kinds.push(outgoing > 0 ? "custody_issue" : "receipt");
      }
    });
    console.log(
      `ℹ اطراف المخزن: ${kinds.filter((value) => value === "receipt").length} receipt، ${kinds.filter((value) => value === "custody_issue").length} custody_issue (افتراض)`
    );
    if (invalid.length) {
      problems.push(
        `اطراف المخزن: ${invalid.length} صف فيه وارد ومنصرف مع بعض أو قيمة غير رقمية (ID: ${ids(rows, invalid)})`
      );
    }
    addCol(e, "movement_kind", kinds);
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

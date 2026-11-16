export type PrintMode = "view" | "document" | "single";

export type PrintSection = "both" | "summary" | "detail";

export type PrintOptions = {
  section?: PrintSection;
  title?: string;
};

let activePrintFrame: HTMLIFrameElement | null = null;

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function copyFormValues(source: HTMLElement, clone: HTMLElement) {
  const sourceFields = source.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("input, select, textarea");
  const cloneFields = clone.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("input, select, textarea");

  sourceFields.forEach((field, index) => {
    const cloneField = cloneFields[index];
    if (!cloneField) return;

    if (field instanceof HTMLInputElement) {
      const clonedInput = cloneField as HTMLInputElement;
      clonedInput.setAttribute("value", field.value);
      if (field.checked) clonedInput.setAttribute("checked", "checked");
      else clonedInput.removeAttribute("checked");
    } else if (field instanceof HTMLTextAreaElement) {
      cloneField.textContent = field.value;
    } else if (field instanceof HTMLSelectElement) {
      const clonedSelect = cloneField as HTMLSelectElement;
      Array.from(clonedSelect.options).forEach((option, optionIndex) => {
        if (optionIndex === field.selectedIndex) {
          option.setAttribute("selected", "selected");
        } else {
          option.removeAttribute("selected");
        }
      });
    }
  });
}

function stripInteractiveContent(clone: HTMLElement) {
  clone
    .querySelectorAll(
      ".no-print, .print-toolbar, button, script, [data-print-hidden='true']",
    )
    .forEach((element) => element.remove());
}

function applyPrintPreferences(clone: HTMLElement, options: PrintOptions) {
  const bodyClasses = document.body.classList;

  if (bodyClasses.contains("print-hide-brand")) {
    clone.querySelectorAll(".print-brand").forEach((brand) => brand.remove());
  }

  const section =
    options.section ??
    (bodyClasses.contains("print-only-summary")
      ? "summary"
      : bodyClasses.contains("print-only-detail")
        ? "detail"
        : "both");

  if (section === "summary") {
    clone.querySelectorAll(".report-detail").forEach((element) => element.remove());
  } else if (section === "detail") {
    clone
      .querySelectorAll(".report-summary")
      .forEach((element) => element.remove());
  }
}

function keepOneBrand(clone: HTMLElement) {
  const globalBrand = clone.querySelector(".dashboard-global-print-brand");
  if (globalBrand) {
    clone.querySelectorAll(".print-brand").forEach((brand) => {
      if (!globalBrand.contains(brand)) brand.remove();
    });
    return;
  }

  const brands = Array.from(clone.querySelectorAll(".print-brand"));
  brands.slice(1).forEach((brand) => brand.remove());
}

function buildSingleRecordClone(source: HTMLElement) {
  if (source.tagName === "TR") {
    const sourceTable = source.closest("table");
    const wrapper = document.createElement("table");
    wrapper.className = `${sourceTable?.className ?? "resident-table"} print-single-row-table`;
    if (sourceTable?.tHead) {
      wrapper.appendChild(sourceTable.tHead.cloneNode(true));
    }
    const body = document.createElement("tbody");
    body.appendChild(source.cloneNode(true));
    wrapper.appendChild(body);
    return wrapper;
  }

  return source.cloneNode(true) as HTMLElement;
}

function findPrintableDocument() {
  const documents = Array.from(
    document.querySelectorAll<HTMLElement>(".printable-document-content"),
  );
  return (
    documents.find((element) => {
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    }) ??
    documents[documents.length - 1] ??
    null
  );
}

function copyStyles(targetDocument: Document) {
  const head = targetDocument.head;

  document
    .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    .forEach((link) => {
      const clone = link.cloneNode(true) as HTMLLinkElement;
      head.appendChild(clone);
    });

  document.querySelectorAll<HTMLStyleElement>("style").forEach((style) => {
    head.appendChild(style.cloneNode(true));
  });

  const reset = targetDocument.createElement("style");
  reset.textContent = `
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .dashboard-print-area {
        position: static !important;
        inset: auto !important;
        width: auto !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .dashboard-print-area button,
      .dashboard-print-area .no-print,
      .dashboard-print-area .print-toolbar {
        display: none !important;
      }
      .printable-document-content {
        position: static !important;
        inset: auto !important;
        width: auto !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        box-shadow: none !important;
        border-radius: 0 !important;
      }
      .modal-backdrop,
      .resident-profile-print-backdrop {
        position: static !important;
        inset: auto !important;
        display: block !important;
        padding: 0 !important;
        overflow: visible !important;
        background: transparent !important;
        backdrop-filter: none !important;
      }
      .modal-container,
      .resident-profile-print-backdrop .modal-container {
        width: 100% !important;
        max-width: none !important;
        max-height: none !important;
        overflow: visible !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }
      .print-single-target {
        position: static !important;
        inset: auto !important;
        width: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }
      .print-brand {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .print-brand-logo img {
        max-width: 82px;
        max-height: 82px;
      }
      table {
        max-width: 100% !important;
      }
      thead {
        display: table-header-group;
      }
      tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      img, svg {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .report-detail,
      .report-summary {
        break-inside: auto;
      }
    }
  `;
  head.appendChild(reset);
}

async function waitForFrameAssets(frameDocument: Document) {
  const waits: Promise<unknown>[] = [];

  frameDocument
    .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    .forEach((link) => {
      if (link.sheet) return;
      waits.push(
        new Promise<void>((resolve) => {
          link.addEventListener("load", () => resolve(), { once: true });
          link.addEventListener("error", () => resolve(), { once: true });
        }),
      );
    });

  Array.from(frameDocument.images).forEach((image) => {
    if (image.complete) return;
    waits.push(
      new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      }),
    );
  });

  if (frameDocument.fonts) {
    waits.push(frameDocument.fonts.ready);
  }

  await Promise.race([Promise.all(waits), delay(1800)]);
}

function cleanupFrame(frame: HTMLIFrameElement) {
  frame.remove();
  if (activePrintFrame === frame) activePrintFrame = null;
}

async function printClone(
  clone: HTMLElement,
  mode: PrintMode,
  options: PrintOptions,
) {
  if (activePrintFrame) {
    cleanupFrame(activePrintFrame);
  }

  stripInteractiveContent(clone);
  applyPrintPreferences(clone, options);
  if (mode === "view" || mode === "document") keepOneBrand(clone);

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", options.title ?? "طباعة");
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:900px;height:700px;border:0;opacity:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(frame);
  activePrintFrame = frame;

  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;
  if (!frameDocument || !frameWindow) {
    cleanupFrame(frame);
    return;
  }

  frameDocument.open();
  frameDocument.write(
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" /></head><body></body></html>',
  );
  frameDocument.close();
  frameDocument.title = options.title ?? document.title;

  copyStyles(frameDocument);

  const wrapper = frameDocument.createElement("div");
  wrapper.className =
    mode === "view" ? "dashboard-print-area print-view-document" : "dashboard-print-area";
  if (mode === "document") wrapper.classList.add("print-single-document");
  if (mode === "single") wrapper.classList.add("print-single-record-document");

  wrapper.appendChild(clone);
  frameDocument.body.className = Array.from(document.body.classList)
    .filter((className) => !className.startsWith("print-current-view"))
    .filter((className) => !className.startsWith("print-document-only"))
    .filter((className) => !className.startsWith("print-single-record"))
    .filter((className) => !className.startsWith("print-only-summary"))
    .filter((className) => !className.startsWith("print-only-detail"))
    .join(" ");
  frameDocument.body.setAttribute("dir", "rtl");
  frameDocument.body.appendChild(wrapper);

  await waitForFrameAssets(frameDocument);
  await delay(60);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.setTimeout(() => cleanupFrame(frame), 120);
  };

  frameWindow.addEventListener("afterprint", finish, { once: true });
  window.setTimeout(finish, 60_000);

  try {
    frameWindow.focus();
    frameWindow.print();
  } catch {
    cleanupFrame(frame);
  }
}

/**
 * يستقبل إعدادات الطباعة أو حدث النقر القادم من onClick ويتجاهل الحدث.
 * بهذا يمكن استخدام الدالة مباشرة كمعالج onClick دون أغلفة إضافية.
 */
function resolvePrintOptions(
  value?: PrintOptions | { nativeEvent?: unknown } | null,
): PrintOptions {
  if (!value || typeof value !== "object") return {};
  if ("section" in value || "title" in value) return value as PrintOptions;
  return {};
}

/**
 * يطبع لوحة الشاشة الحالية داخل إطار مستقل، مع تطبيق تفضيلات الطباعة
 * (الشعار / عوامل التصفية / الملخص فقط / التفاصيل فقط) دون المساس بالصفحة.
 */
export function printCurrentView(
  options?: PrintOptions | { nativeEvent?: unknown } | null,
) {
  const source =
    document.querySelector<HTMLElement>(".dashboard-print-area") ??
    document.querySelector<HTMLElement>("main");
  if (!source) return;

  const clone = source.cloneNode(true) as HTMLElement;
  copyFormValues(source, clone);
  void printClone(clone, "view", resolvePrintOptions(options));
}

/**
 * يطبع وثيقة داخل نافذة منبثقة فقط (ملف النزيل / كشف الحساب).
 */
export function printDocument(
  element?: HTMLElement | null,
  options: PrintOptions = {},
) {
  const source = element ?? findPrintableDocument();
  if (!source) {
    printCurrentView(options);
    return;
  }

  const clone = source.cloneNode(true) as HTMLElement;
  copyFormValues(source, clone);
  void printClone(clone, "document", options);
}

export function printSingleRecord(
  element: HTMLElement,
  options: PrintOptions = {},
) {
  if (!element) return;
  const clone = buildSingleRecordClone(element);
  copyFormValues(element, clone);
  void printClone(clone, "single", options);
}

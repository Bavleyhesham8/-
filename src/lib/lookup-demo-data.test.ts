import assert from "node:assert/strict";
import test from "node:test";
import { demoLookupData } from "@/lib/lookup-demo-data";

test("demo lookup lists do not contain placeholder values", () => {
  const values = [
    ...demoLookupData.churches.map((entry) => entry.name),
    ...demoLookupData.governorates.flatMap((entry) => [
      entry.governorate,
      entry.district,
    ]),
    ...demoLookupData.days.map((entry) => entry.day),
    ...demoLookupData.alternateCategories.map((entry) => entry.name),
  ];

  assert.equal(
    values.some((value) => value?.includes("تجريبي")),
    false,
  );
});

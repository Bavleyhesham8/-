import assert from "node:assert/strict";
import test from "node:test";
import { mergeStaffProfileLookups } from "@/lib/staff-lookup-utils";
import type { LookupData } from "@/lib/lookup-types";

const baseLookups: LookupData = {
  churches: [
    { id: 3, number: null, name: "كنيسة العذراء مريم", acheshe: null },
  ],
  governorates: [
    { id: 7, governorate: "القاهرة", district: "المعادي" },
  ],
  days: [],
  alternateCategories: [],
  villas: [],
  rooms: [],
};

test("adds a new church and a new governorate pair with fresh ids", () => {
  const result = mergeStaffProfileLookups(baseLookups, {
    church: "كنيسة مار جرجس",
    governorate: "الجيزة",
    district: "الدقي",
  });

  assert.deepEqual(result.churches[1], {
    id: 4,
    number: null,
    name: "كنيسة مار جرجس",
    acheshe: null,
  });
  assert.deepEqual(result.governorates[1], {
    id: 8,
    governorate: "الجيزة",
    district: "الدقي",
  });
});

test("does not duplicate existing values and ignores surrounding spaces", () => {
  const result = mergeStaffProfileLookups(baseLookups, {
    church: "  كنيسة العذراء مريم  ",
    governorate: "القاهرة ",
    district: " المعادي",
  });

  assert.equal(result, baseLookups);
  assert.equal(result.churches.length, 1);
  assert.equal(result.governorates.length, 1);
});

test("does not add an incomplete governorate or district", () => {
  const result = mergeStaffProfileLookups(baseLookups, {
    church: "",
    governorate: "الإسكندرية",
    district: "",
  });

  assert.equal(result, baseLookups);
});

test("adds only the value that is missing", () => {
  const result = mergeStaffProfileLookups(baseLookups, {
    church: "كنيسة مار جرجس",
    governorate: "القاهرة",
    district: "المعادي",
  });

  assert.equal(result.churches.length, 2);
  assert.equal(result.governorates, baseLookups.governorates);
});

test("treats empty location and church fields as no-op", () => {
  const result = mergeStaffProfileLookups(baseLookups, {
    church: "",
    governorate: "",
    district: "",
  });

  assert.equal(result, baseLookups);
});

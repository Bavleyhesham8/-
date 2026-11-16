import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalVilla,
  formatVilla,
  normalizeVillaFilter,
} from "./stay-location";

test("قيم الفيلا القديمة والجديدة لها مفتاح واحد", () => {
  assert.equal(canonicalVilla("فيلا A"), "A");
  assert.equal(canonicalVilla(" A "), "A");
  assert.equal(normalizeVillaFilter("فيلا A"), normalizeVillaFilter("A"));
  assert.equal(formatVilla("فيلا  a"), "فيلا A");
});

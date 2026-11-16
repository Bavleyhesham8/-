import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findRecordForResident,
  findResidentByName,
  normalizeArabicName,
  residentNameScore,
} from "./resident-matching";

const residents = [
  { id: "1", name: "سامح بخيت شجيع بسطا", residentNumber: "11", fileNumber: "F-11" },
  { id: "2", name: "مينا سعيد خليل إبراهيم", residentNumber: "20", fileNumber: "F-20" },
  { id: "3", name: "جورج عماد", residentNumber: "16", fileNumber: "F-16" },
  { id: "4", name: "مجدى عبدالله مسعد مخائيل", residentNumber: "41", fileNumber: "F-41" },
  { id: "5", name: "إيهاب هانى فاروق", residentNumber: "33", fileNumber: "F-33" },
];

test("تطبيع الحروف العربية والتشكيل", () => {
  assert.equal(normalizeArabicName("إيهاب هانِى  فاروق"), "ايهاب هاني فاروق");
  assert.equal(normalizeArabicName("مُتَّى"), "متي");
});

test("مطابقة اسم مختصر أو مكتوب بخطأ إملائي", () => {
  assert.equal(
    findResidentByName("سامح بخيت شجع", residents)?.resident.id,
    "1",
  );
  assert.equal(
    findResidentByName("مجدى غبدالله", residents)?.resident.id,
    "4",
  );
  assert.equal(
    findResidentByName("ايهاب هاني", residents)?.resident.id,
    "5",
  );
});

test("لا يطابق اسمًا غير موجود بمجرد تشابه اسم أول", () => {
  assert.equal(findResidentByName("كريم هلال", residents), null);
  assert.equal(findResidentByName("جورج حنا", residents), null);
  assert.equal(findResidentByName("هانى جرجس", residents), null);
});

test("الرقم يرجح عند تطابق الاسم", () => {
  const candidates = [
    { id: "a", name: "مينا سعيد خليل", residentNumber: "20" },
    { id: "b", name: "مينا سعيد مسعد", residentNumber: "99" },
  ];
  assert.equal(
    findResidentByName("مينا سعيد", candidates, 20)?.resident.id,
    "a",
  );
});

test("إيجاد السجل القديم لنزيل عبر المعرف أو الاسم", () => {
  const records = [
    { residentId: "1", residentName: "سامح بخيت شجع", residentNumber: 11 },
    { residentId: null, residentName: "جورج عماد", residentNumber: 9 },
  ];
  assert.equal(
    findRecordForResident(
      { id: "1", name: "سامح بخيت شجيع بسطا", residentNumber: "11" },
      records,
    )?.residentNumber,
    11,
  );
  assert.equal(
    findRecordForResident({ name: "جورج عماد", residentNumber: "16" }, records)
      ?.residentNumber,
    9,
  );
});

test("درجة التطابق الكاملة تساوي واحدًا", () => {
  assert.equal(residentNameScore("جورج عماد", "جورج عماد"), 1);
});

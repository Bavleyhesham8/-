import { eq } from "drizzle-orm";
import dotenv from "dotenv";
import { getDatabase } from "../src/db";
import { residents, residentStays } from "../src/db/schema";
import { demoResidents } from "../src/lib/demo-data";

dotenv.config({ path: ".env.local" });
dotenv.config();

if (process.env.SEED_DEMO_DATA !== "true") {
  throw new Error(
    "Set SEED_DEMO_DATA=true to insert fictional sample records. No records were written.",
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL before seeding demo records.");
}

const database = getDatabase();

for (const resident of demoResidents) {
  await database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: residents.id })
      .from(residents)
      .where(eq(residents.fileNumber, resident.fileNumber))
      .limit(1);

    if (existing) return;

    const [created] = await transaction
      .insert(residents)
      .values({
        fileNumber: resident.fileNumber,
        name: resident.name,
        birthDate: resident.birthDate || null,
        phone: resident.phone,
        address: resident.address,
        district: resident.district,
        emergencyContact: resident.emergencyContact,
        emergencyPhone: resident.emergencyPhone,
        relationship: resident.relationship,
        church: resident.church,
        confessor: resident.confessor,
        archived: resident.archived,
      })
      .onConflictDoNothing({ target: residents.fileNumber })
      .returning({ id: residents.id });

    if (!created) return;

    await transaction.insert(residentStays).values({
      residentId: created.id,
      admissionDate: resident.admissionDate,
      exitDate: resident.exitDate || null,
      villa: resident.villa,
      room: resident.room,
    });
  });
}

console.info("Fictional demo records are ready.");

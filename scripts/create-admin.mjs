import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getAuth } from "@/lib/auth";

async function main() {
  const auth = getAuth();
  
  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: "admin@demo.qithara",
        password: "demo-admin",
        name: "System Administrator",
      },
      headers: {},
    });
    console.log("Admin created:", result);
  } catch (e) {
    console.error("Error:", e.message);
    // If signup is disabled, try admin plugin
    try {
      const adminResult = await auth.admin.user.createUser({
        body: {
          email: "admin@demo.qithara",
          password: "demo-admin",
          name: "System Administrator",
          role: "admin",
        },
        headers: {},
      });
      console.log("Admin created via admin plugin:", adminResult);
    } catch (e2) {
      console.error("Admin plugin error:", e2.message);
    }
  }
}

main();
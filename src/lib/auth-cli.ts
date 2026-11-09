import dotenv from "dotenv";
import { getAuth } from "./auth";

dotenv.config({ path: ".env.local" });

export const auth = getAuth();

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { readConfig } from "./config";
export const config = readConfig(import.meta.env);
export const db = createClient<Database>(config.url, config.key);

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { readConfig } from "./config";
export const config = readConfig(import.meta.env, import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(location.hostname));
export const db = createClient<Database>(config.url, config.key);

import {handleDrive} from "../_shared/drive-download.ts";
Deno.serve(req=>handleDrive(req));

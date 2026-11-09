import {handleDrive} from "../_shared/drive-list.ts";
Deno.serve(req=>handleDrive(req));

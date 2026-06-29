import { tableFromIPC } from "apache-arrow";
import { arrowTableToColumnar } from "./arrow.js";
import type { ColumnarTable } from "./types.js";

export function arrowIpcToColumnar(data: ArrayBuffer | Uint8Array, name = "arrow_ipc"): ColumnarTable {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return arrowTableToColumnar(tableFromIPC(bytes), name);
}

import { WebSocket } from "ws";

export const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

/** A slow client recovers from a snapshot instead of accumulating an unbounded queue. */
export function sendEncoded(ws: Pick<WebSocket, "readyState" | "bufferedAmount" | "send" | "close">, encoded: string): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
    ws.close(1013, "Client too slow; reconnect to reload history");
    return false;
  }
  try { ws.send(encoded); return true; }
  catch { ws.close(1013, "Transport unavailable"); return false; }
}

import { EventEmitter } from "node:events";
import type { FeedMessage, MessageStatusEvent } from "./wa-feed";

/**
 * Bus event in-process untuk pesan WhatsApp baru.
 * Webhook (POST /api/wa/webhook) emit setelah pesan tersimpan;
 * SSE (/api/wa/messages/stream) broadcast ke browser yang subscribe.
 * HMR-safe via globalThis. BATASAN: single-instance (tanpa Redis);
 * deployment multi-instance butuh pub/sub eksternal (di luar scope Step 6).
 */

const KEY = "__wa_message_bus__";
const globalStore = globalThis as unknown as { [KEY]?: EventEmitter };

export const MESSAGE_EVENT = "wa:message";
export const STATUS_EVENT = "wa:message_status";

function bus(): EventEmitter {
  if (!globalStore[KEY]) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100);
    globalStore[KEY] = emitter;
  }
  return globalStore[KEY]!;
}

export function emitFeedMessage(msg: FeedMessage): void {
  bus().emit(MESSAGE_EVENT, msg);
}

export function onFeedMessage(listener: (msg: FeedMessage) => void): () => void {
  const b = bus();
  b.on(MESSAGE_EVENT, listener);
  return () => {
    b.off(MESSAGE_EVENT, listener);
  };
}

/** Event ringan: TANPA phone/content/token — cukup untuk update bubble. */
export function emitStatusEvent(ev: MessageStatusEvent): void {
  bus().emit(STATUS_EVENT, ev);
}

export function onStatusEvent(listener: (ev: MessageStatusEvent) => void): () => void {
  const b = bus();
  b.on(STATUS_EVENT, listener);
  return () => {
    b.off(STATUS_EVENT, listener);
  };
}

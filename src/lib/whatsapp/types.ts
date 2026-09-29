/** Tipe payload WhatsApp Cloud API (Meta) — Step 3, webhook inbound saja. */

export interface WaTextMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
  image?: { caption?: string; mime_type?: string };
  audio?: { mime_type?: string };
  video?: { caption?: string; mime_type?: string };
  document?: { caption?: string; filename?: string; mime_type?: string };
  sticker?: { mime_type?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: { name?: { formatted_name?: string } }[];
  [key: string]: unknown;
}

export interface WaContact {
  profile?: { name?: string };
  wa_id?: string;
}

export interface WaStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: unknown;
  [key: string]: unknown;
}

export interface WaValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: WaContact[];
  messages?: WaTextMessage[];
  statuses?: WaStatus[];
}

export interface WaChange {
  value?: WaValue;
  field?: string;
}

export interface WaEntry {
  id?: string;
  changes?: WaChange[];
}

export interface WaWebhookPayload {
  object?: string;
  entry?: WaEntry[];
}

/** Pesan inbound yang sudah dinormalisasi, siap diproses service. */
export interface InboundMessage {
  messageId: string;
  phone: string;
  profileName: string | null;
  messageType: string;
  content: string;
  timestamp: Date;
}

/** Status update dari webhook (statuses[]), sebelum mapping ke enum. */
export interface StatusUpdate {
  messageId: string;
  status: string;
  timestamp: Date;
  errorCode: number | null;
  errorMessage: string | null;
}

/**
 * Standard API envelope. Every Fastify handler returns `{ data: T }` on
 * success and `{ error, code }` on failure — the web client narrows on the
 * `error` field. Keep these in sync with the api response serializers.
 */

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: string;
  code: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

export function isApiError<T>(result: ApiResult<T>): result is ApiError {
  return "error" in result;
}

/** Returned immediately when an endpoint enqueues background work. */
export interface JobAccepted {
  jobId: string;
}

/** Cursor-free pagination payload for list endpoints. */
export interface Paginated<T> {
  items: T[];
  total: number;
}

/**
 * Keyset (cursor) pagination payload. `nextCursor` is an opaque token the
 * client passes back to fetch the following page; null means the last page.
 */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Query params accepted by cursor-paginated, searchable list endpoints. */
export interface ListQuery {
  cursor?: string;
  limit?: number;
  q?: string;
}

/**
 * The three inputs behind a conversation, surfaced together so the UI can show
 * the prospect, offering, and prompt that produced the opening message. Any may
 * be null when the source record was deleted (generations keep nullable FKs).
 */
export interface ConversationProspectSummary {
  id: string;
  name: string;
  jobTitle: string | null;
  companyName: string | null;
  email: string | null;
  notes: string | null;
}

export interface ConversationOfferingSummary {
  id: string;
  name: string;
  description: string | null;
  summary: string | null;
  targetAudience: string | null;
  problemSolved: string | null;
  uniqueValueProp: string | null;
}

export interface ConversationPromptSummary {
  id: string;
  name: string;
  systemPrompt: string;
  isDefault: boolean;
}

export interface ConversationParticipants {
  prospect: ConversationProspectSummary | null;
  offering: ConversationOfferingSummary | null;
  prompt: ConversationPromptSummary | null;
}

/**
 * A generated message eligible to seed a new conversation: completed, not yet
 * attached to a thread. Carries enough context (prospect, offering) for the
 * picker to disambiguate across prospects.
 */
export interface StartConversationCandidate {
  messageId: string;
  content: string;
  isFavorite: boolean;
  createdAt: string;
  prospectId: string;
  prospectName: string;
  offeringName: string | null;
  model: string;
}

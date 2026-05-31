import type { LanguageModel } from "ai";
import {
  DEFAULT_GENERATION_MODEL,
  isFreeModel,
} from "@bespoke/shared";
import { config } from "../config";
import { modelFor, modelForUser } from "./ai";
import { getUserOpenRouterKey } from "./user-key";

export interface ResolvedModel {
  model: LanguageModel;
  slug: string;
  usingUserKey: boolean;
}

/**
 * Pick the chat model and API key given an already-resolved user key. Pure (no
 * DB read) so callers that have already loaded the user's settings row can pass
 * the decrypted key straight in instead of re-querying it. When a user key is
 * present all calls run on it; otherwise the platform key is used and non-free
 * slugs are downgraded to the free default so paid models never hit the
 * platform key.
 */
export function resolveModel(
  slug: string | null | undefined,
  userKey: string | null,
): ResolvedModel {
  const stored = slug || config.OPENROUTER_MODEL;
  const resolvedSlug =
    !isFreeModel(stored) && !userKey ? DEFAULT_GENERATION_MODEL : stored;

  return {
    model: userKey
      ? modelForUser(resolvedSlug, userKey)
      : modelFor(resolvedSlug),
    slug: resolvedSlug,
    usingUserKey: userKey != null,
  };
}

/**
 * Convenience wrapper for callers that hold only a user id: fetch the stored
 * key (one DB read) then resolve. Callers that already have the settings row
 * should call {@link resolveModel} directly to avoid a redundant read.
 */
export async function resolveModelForUser(
  userId: string,
  slug?: string | null,
): Promise<ResolvedModel> {
  return resolveModel(slug, await getUserOpenRouterKey(userId));
}

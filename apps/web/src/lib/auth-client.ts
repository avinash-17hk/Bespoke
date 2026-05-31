import { createAuthClient } from "better-auth/react";

/**
 * Better Auth browser client. Points at the separate Fastify API; the client
 * appends `/api/auth` to this base. Session access goes through this client —
 * component code never parses cookies directly.
 */
// In production, auth requests proxy through Next.js (/api/auth/*) so the
// session cookie lands on the web domain. Set NEXT_PUBLIC_AUTH_URL to the web
// origin in prod and to the api URL in local dev.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL,
});

export const { signIn, signUp, signOut, useSession } = authClient;

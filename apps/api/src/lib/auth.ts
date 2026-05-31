import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { config } from "../config";
import { db } from "../context";

/**
 * Better Auth instance — owns the auth tables (user, session, account,
 * verification). Our domain tables reference `user.id` by foreign key; we
 * never define the user table ourselves.
 *
 * This module is the source the Better Auth CLI reads to generate the Drizzle
 * schema, and the same instance the Fastify auth plugin mounts at runtime.
 */
export const auth = betterAuth({
  appName: "Bespoke",
  baseURL: config.BETTER_AUTH_URL,
  secret: config.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  trustedOrigins: [config.WEB_ORIGIN],
});

export type Auth = typeof auth;

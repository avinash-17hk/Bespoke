import { type NextRequest, NextResponse } from "next/server";

// Server-only — points directly at the Fastify API. Never use NEXT_PUBLIC_API_URL
// here; in prod that resolves to the web origin which would cause a proxy loop.
const API_URL = process.env.API_INTERNAL_URL!;

async function handler(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname;
  const search = req.nextUrl.search;
  const target = `${API_URL}${path}${search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    // @ts-expect-error -- Node 18+ fetch supports duplex
    duplex: "half",
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;

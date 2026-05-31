import { type NextRequest, NextResponse } from "next/server";

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

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });

  return response;
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;

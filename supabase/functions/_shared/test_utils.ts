// Shared helpers for edge-function tests.
export const RUN_AI = Boolean(Deno.env.get("RUN_AI_TESTS"));

export function makeReq(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function callHandler(
  handler: (req: Request) => Promise<Response> | Response,
  body: unknown,
): Promise<{ status: number; data: any }> {
  const res = await handler(makeReq(body));
  let data: any = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

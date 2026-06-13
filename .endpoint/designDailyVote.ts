export default async function (req: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "https://manik22bansal.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: cors });

  let body: any;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400, headers: cors }); }
  const { editionDate, itemId, vote, source, lane } = body ?? {};
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(editionDate ?? "") ||
    !/^[\d-]{1,16}$/.test(itemId ?? "") ||
    !["less", "star", "unstar"].includes(vote)
  ) return new Response("invalid payload", { status: 400, headers: cors });

  const b64 = (str: string) => {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (const byte of bytes) bin += String.fromCharCode(byte);
    return btoa(bin);
  };

  const ts = Date.now();
  const path = `taste/votes/${editionDate}-${itemId}-${ts}.json`;
  const payload = {
    editionDate,
    itemId,
    vote,
    source: String(source ?? "").slice(0, 120),
    lane: String(lane ?? "").slice(0, 20),
    reason: String(body?.reason ?? "").slice(0, 500),
    ts,
  };
  const res = await fetch(
    `https://api.github.com/repos/manik22bansal/design-daily/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${Deno.env.get("GITHUB_TOKEN")}`,
        "Content-Type": "application/json",
        "User-Agent": "design-daily-votes",
      },
      body: JSON.stringify({
        message: `vote: ${vote} on ${itemId}`,
        content: b64(JSON.stringify(payload, null, 2)),
      }),
    },
  );
  if (!res.ok) return new Response("github error", { status: 502, headers: cors });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

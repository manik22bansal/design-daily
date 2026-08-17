// Design Daily — private per-reader state store (stars, notes, read/unread).
// Deploy as a Val.town HTTP val. Backup / source of truth for the deployed code.
//
// Why this exists: stars/notes/read need to sync across Manik's devices and be
// durable, but the site is public with no login. So state lives here (in Val.town
// blob storage, private to this val), gated by a shared secret the reader pastes
// once per device. Not real auth — a soft gate matching the actual risk (an
// obscure public URL, personal annotations, not a targeted attacker).
//
// Requires ONE env var: STATE_KEY = the secret phrase you'll paste on each device.
// No GitHub token needed (unlike the vote endpoint) — storage is Val.town-native.
//
// API (key sent in the X-Key header, never the URL, so it can't leak into logs):
//   GET            -> returns the whole state doc { version, updatedAt, items: {…} }
//   POST {id,patch} -> merges one item's fields, returns { ok, doc }
//   POST {items:{…}} -> bulk merge (used once to migrate a device's existing stars)
// An item entry: { starred?, note?, readAt?, editionDate?, item? }  (item = cached
// copy so the Starred view needs no fetch, mirroring today's localStorage stars).

import { blob } from "https://esm.town/v/std/blob";

const BLOB_KEY = "design-daily-state-v1";

export default async function (req: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "https://manik22bansal.github.io",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Key",
  };
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  // Soft gate: constant-ish comparison against the secret. Key comes in the header only.
  const secret = Deno.env.get("STATE_KEY") ?? "";
  const provided = req.headers.get("X-Key") ?? "";
  if (!secret || provided !== secret) return json({ error: "unauthorized" }, 401);

  const load = async (): Promise<{ version: number; updatedAt?: string; items: Record<string, any> }> => {
    try {
      const doc = await blob.getJSON(BLOB_KEY);
      if (doc && typeof doc === "object" && doc.items) return doc as any;
    } catch { /* first run: no blob yet */ }
    return { version: 1, items: {} };
  };

  if (req.method === "GET") return json(await load());

  if (req.method === "POST") {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

    const doc = await load();
    doc.items ??= {};

    const applyPatch = (id: string, patch: any) => {
      if (typeof id !== "string" || !/^[\w:-]{1,40}$/.test(id) || !patch || typeof patch !== "object") return;
      const next = { ...(doc.items[id] ?? {}) };
      if ("starred" in patch) next.starred = !!patch.starred;
      if ("readAt" in patch) next.readAt = patch.readAt ? String(patch.readAt).slice(0, 40) : null;
      if ("note" in patch) next.note = String(patch.note ?? "").slice(0, 2000);
      if ("editionDate" in patch && /^\d{4}-\d{2}-\d{2}$/.test(patch.editionDate ?? "")) next.editionDate = patch.editionDate;
      if ("item" in patch && patch.item && typeof patch.item === "object") next.item = patch.item;
      // Drop entries that carry no signal, so the doc doesn't grow with dead keys.
      if (!next.starred && !next.note && !next.readAt) delete doc.items[id];
      else doc.items[id] = next;
    };

    if (body?.id && body?.patch) applyPatch(String(body.id), body.patch);
    else if (body?.items && typeof body.items === "object") {
      for (const [id, patch] of Object.entries(body.items)) applyPatch(id, patch);
    } else return json({ error: "invalid payload" }, 400);

    doc.version = 1;
    doc.updatedAt = new Date().toISOString();
    await blob.setJSON(BLOB_KEY, doc);
    return json({ ok: true, doc });
  }

  return json({ error: "method not allowed" }, 405);
}

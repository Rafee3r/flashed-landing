const crypto = require("crypto");

const PIXEL_ID = process.env.META_PIXEL_ID || "1786609452598334";
const TOKEN = process.env.META_CAPI_TOKEN || "";
const API_VERSION = process.env.META_API_VERSION || "v21.0";
const TEST_CODE = process.env.META_TEST_EVENT_CODE || "";

function sha256(v) {
  if (!v) return undefined;
  return crypto.createHash("sha256").update(String(v).trim().toLowerCase()).digest("hex");
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket && req.socket.remoteAddress;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  if (!TOKEN) {
    res.status(200).json({ ok: false, skipped: "missing_token" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (!body || typeof body !== "object") body = {};

  const name = String(body.event_name || body.event || "").slice(0, 60);
  if (!name) {
    res.status(400).json({ ok: false, error: "missing_event_name" });
    return;
  }

  const params = body.params && typeof body.params === "object" ? body.params : {};

  const user_data = {
    client_ip_address: clientIp(req),
    client_user_agent: body.client_user_agent || req.headers["user-agent"] || "",
  };
  if (body.fbp) user_data.fbp = String(body.fbp).slice(0, 200);
  if (body.fbc) user_data.fbc = String(body.fbc).slice(0, 400);
  const em = sha256(body.email);
  if (em) user_data.em = [em];
  const ph = sha256((body.phone || "").replace(/\D/g, ""));
  if (ph) user_data.ph = [ph];

  const payload = {
    data: [
      {
        event_name: name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: body.event_id ? String(body.event_id).slice(0, 100) : undefined,
        event_source_url: body.event_source_url || undefined,
        action_source: "website",
        user_data,
        custom_data: params,
      },
    ],
  };
  if (TEST_CODE) payload.test_event_code = TEST_CODE;

  const url =
    `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events` +
    `?access_token=${encodeURIComponent(TOKEN)}`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}

    if (!r.ok) {
      res.status(200).json({ ok: false, status: r.status, error: json || text.slice(0, 300) });
      return;
    }
    res.status(200).json({ ok: true, received: json && json.events_received });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message).slice(0, 200) });
  }
};

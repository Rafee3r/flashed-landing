/* FlashEd — Meta tracking layer
   Eventos: PageView, ViewContent (15s), VideoView/75%, InitiateCheckout (CTA),
   Purchase (return from checkout). CAPI server-side via /api/capi. */
(function () {
  var PIXEL = "1786609452598334";
  var VIDEO_15S = 15;      // umbral de video view
  var VIDEO_75 = 0.75;     // umbral de "completó"
  var STORE = "fx_ev";     // dedupe local

  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getCookie(n) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  function sent(key) {
    try {
      var d = JSON.parse(localStorage.getItem(STORE) || "{}");
      return !!d[key];
    } catch (e) { return false; }
  }

  function mark(key) {
    try {
      var d = JSON.parse(localStorage.getItem(STORE) || "{}");
      d[key] = 1;
      localStorage.setItem(STORE, JSON.stringify(d));
    } catch (e) {}
  }

  function send(event, params, eventId) {
    try {
      window.fbq && window.fbq("track", event, params || {}, { eventID: eventId });
    } catch (e) {}

    // Server-side CAPI mirror (same eventID -> Meta deduplicates)
    try {
      var body = JSON.stringify({
        event: event,
        event_id: eventId,
        event_name: event,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: location.href,
        action_source: "website",
        params: params || {},
        fbp: getCookie("_fbp"),
        fbc: getCookie("_fbc"),
        client_user_agent: navigator.userAgent
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/capi", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/capi", { method: "POST", body: body, keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }

  function once(key, event, params) {
    if (sent(key)) return;
    mark(key);
    send(event, params, key);
  }

  /* ---------- 1. PageView ---------- */
  function waitForPixel(tries) {
    tries = tries || 0;
    if (window.fbq && window.fbq.loaded) {
      send("PageView", {}, "pv-" + uuid());
      return;
    }
    if (tries > 40) return;
    setTimeout(function () { waitForPixel(tries + 1); }, 125);
  }

  /* ---------- 2 & 3. Video ---------- */
  function hookVideo() {
    var v = document.querySelector("video");
    if (!v || v.dataset.fxHooked) return !!v;
    v.dataset.fxHooked = "1";

    v.addEventListener("play", function () {
      once("fx_view_content", "ViewContent", {
        content_name: "CODE ART",
        content_type: "product",
        content_ids: ["codeart"]
      });
    });

    v.addEventListener("timeupdate", function () {
      var t = v.currentTime;
      var d = v.duration;

      if (t >= VIDEO_15S) {
        once("fx_video_15", "Video15s", {
          content_name: "CODE ART",
          content_type: "video",
          video_time: Math.round(t),
          percent: d ? Math.round((t / d) * 100) : null
        });
      }

      if (d && t / d >= VIDEO_75) {
        once("fx_video_75", "Video75", {
          content_name: "CODE ART",
          content_type: "video",
          video_time: Math.round(t),
          percent: Math.round((t / d) * 100)
        });
      }
    });

    return true;
  }

  /* ---------- 4. CTA click ---------- */
  function hookCTA() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href*="whop.com/checkout"]');
      if (!a) return;
      var id = "ic-" + uuid();
      send("InitiateCheckout", {
        content_name: "CODE ART",
        content_type: "product",
        content_ids: ["codeart"],
        currency: "USD",
        num_items: 1
      }, id);
      try { sessionStorage.setItem("fx_checkout", id); } catch (err) {}
    }, true);
  }

  /* ---------- 5. Purchase (retorno de Whop) ---------- */
  function hookPurchase() {
    var q = new URLSearchParams(location.search);
    var paid = q.get("paid") || q.get("success") || q.get("status");
    var isThanks = /gracias|thank|obrigado/i.test(location.pathname) ||
                   (paid && /true|1|success|complete|paid/i.test(paid));
    if (!isThanks) return;

    var amount = parseFloat(q.get("amount") || q.get("valor") || q.get("price") || "0");
    var value = isFinite(amount) && amount > 0 ? amount : 19.0;

    once("fx_purchase_" + (q.get("payment_id") || q.get("session_id") || "generic"),
      "Purchase", {
        content_name: "CODE ART",
        content_type: "product",
        content_ids: ["codeart"],
        currency: "USD",
        value: value,
        num_items: 1
      });
  }

  function boot() {
    waitForPixel();
    hookCTA();
    hookPurchase();
    if (!hookVideo()) {
      var i = 0;
      var t = setInterval(function () {
        if (hookVideo() || ++i > 60) clearInterval(t);
      }, 250);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

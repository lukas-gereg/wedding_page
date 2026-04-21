const RESPONSES_SHEET_ID = "1ocvRmfbARLpR6kfwQ1bU6FHIaooiClMARshWzkIBjfo";
const RESPONSES_TAB = "Responses";

const GALLERY_PRO_FOLDER_ID = "";
const GALLERY_GUESTS_FOLDER_ID = "";

function authorizeNow() {
  DriveApp.getRootFolder().getName();
  Drive.Files.list({ pageSize: 1 });
  MailApp.getRemainingDailyQuota();
  SpreadsheetApp.getActiveSpreadsheet();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok(meta) {
  return json({ ok: true, meta: meta || {} });
}

function fail(code, meta, debugMessage) {
  return json({
    ok: false,
    code: code || "UNKNOWN",
    meta: meta || {},
    error: debugMessage || ""
  });
}

function throwCoded(code, meta, debugMessage) {
  const e = new Error(debugMessage || code);
  e._coded = true;
  e.code = code;
  e.meta = meta || {};
  throw e;
}

function asFail(err) {
  if (err && err._coded) {
    return fail(err.code, err.meta, err.message);
  }
  return fail("UNKNOWN", {}, String(err && err.message ? err.message : err));
}

// ========= ROUTER =========
function doGet(e) {
  const action = (e.parameter && e.parameter.action) ? String(e.parameter.action) : "";
  if (action === "gallery") return getGalleryPage(e);
  return fail("UNKNOWN_ACTION", {}, "Unknown action");
}

function doPost(e) {
  try {
    const data = JSON.parse(e?.postData?.contents || "{}");

    try {
      saveResponse(data);
      sendConfirmationEmail_(data);
    } catch (err) {
      return asFail(err);
    }

    return ok();
  } catch (err) {
    return asFail(err);
  }
}

function getGalleryPage(e) {
  try {
    const which = String((e?.parameter && e?.parameter?.gallery) || "pro").toLowerCase();
    const folderId = (which === "guests") ? GALLERY_GUESTS_FOLDER_ID : GALLERY_PRO_FOLDER_ID;

    const pageSizeRaw = Number((e?.parameter && e?.parameter.pageSize) || 48);
    const pageSize = Math.max(12, Math.min(96, pageSizeRaw));
    const pageToken = String((e?.parameter && e?.parameter?.pageToken) || "").trim();

    if (!folderId) {
      const payloadObj = {
      ok: true,
      gallery: which,
      pageSize,
      nextPageToken: "",
      items: []
    };

    const payload = JSON.stringify(payloadObj);

    return ContentService.createTextOutput(payload)
      .setMimeType(ContentService.MimeType.JSON);
    }

    const cache = CacheService.getScriptCache();

    const token = pageToken || "FIRST";
    const cacheKey = makeCacheKey_("gal", which, folderId, pageSize, token);

    const cached = cache.get(cacheKey);
    if (cached) {
      return ContentService.createTextOutput(cached)
        .setMimeType(ContentService.MimeType.JSON);
    }

    const q = [
      `'${folderId}' in parents`,
      `trashed = false`,
      `(mimeType contains 'image/')`
    ].join(" and ");

    const resp = Drive.Files.list({
      q,
      pageSize: pageSize,
      pageToken: pageToken || undefined,
      orderBy: "modifiedTime desc",
      fields: "nextPageToken, files(id,name,mimeType,modifiedTime,thumbnailLink,webViewLink)"
    });

    const items = (resp.files || []).map(f => ({
      id: f.id,
      name: f.name || "",
      download: `https://drive.google.com/uc?export=download&id=${f.id}`,
    }));

    const payloadObj = {
      ok: true,
      gallery: which,
      pageSize,
      nextPageToken: resp.nextPageToken || "",
      items
    };

    const payload = JSON.stringify(payloadObj);

    if (payload.length < 90000) {
      cache.put(cacheKey, payload, 300);
    }

    return ContentService.createTextOutput(payload)
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return asFail(err);
  }
}

function makeCacheKey_(prefix, which, folderId, pageSize, token) {
  const raw = `${prefix}|${which}|${folderId}|ps=${pageSize}|t=${token}`;

  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  const hex = digest.map(b => {
    const v = (b < 0) ? b + 256 : b;
    return ("0" + v.toString(16)).slice(-2);
  }).join("");

  return `${prefix}:${which}:ps${pageSize}:${hex}`;
}

function saveResponse(data) {
  const ss = SpreadsheetApp.openById(RESPONSES_SHEET_ID);
  const sheet = ss.getSheetByName(RESPONSES_TAB) || ss.insertSheet(RESPONSES_TAB);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "timestamp","attendance","bring","bring_other","help","help_other","arrival",
      "car_free_seats","car_route","diet","diet_other","allergy_acknowledgement",
      "official_name","email","phone","consent_feedback_30d","consent_gdpr_media","lang"
    ]);
  }

  sheet.appendRow([
    new Date(),
    data.attendance || "",
    Array.isArray(data.bring) ? data.bring.join(", ") : (data.bring || ""),
    data.bring_other || "",
    Array.isArray(data.help) ? data.help.join(", ") : (data.help || ""),
    data.help_other || "",
    data.arrival || "",
    data.car_free_seats || "",
    data.car_route || "",
    data.diet || "",
    data.diet_other || "",
    data.allergy_ack || "",
    data.official_name || "",
    data.email || "",
    data.phone || "",
    data.consent_feedback_30d || "",
    data.consent_gdpr_media || "",
    data.lang || ""
  ]);
}

function sendConfirmationEmail_(payload) {
  const to = payload.email;
  if (!to) return;

  const lang = payload.lang || "sk";

  const subject = (lang === "hu")
    ? "Anna & Lukáš • Visszajelzés megérkezett (RSVP)"
    : "Anna & Lukáš • RSVP potvrdenie";

  const yourContact = "";

  const lines = [];
  lines.push(lang === "hu" ? "Szia!" : "Ahoj!");
  lines.push("");
  lines.push(lang === "hu"
    ? "Köszönjük! Megkaptuk a válaszodat az esküvői RSVP űrlapon."
    : "Ďakujeme! Dostali sme tvoju odpoveď cez RSVP formulár.");
  lines.push("");
  lines.push(lang === "hu" ? "Összefoglaló:" : "Zhrnutie:");
  lines.push(`- attendance: ${payload.attendance || ""}`);
  lines.push(`- arrival: ${payload.arrival || ""}`);
  lines.push(`- diet: ${payload.diet || ""}${payload.diet_other ? " (" + payload.diet_other + ")" : ""}`);
  lines.push(`- phone: ${payload.phone || ""}`);
  lines.push("");
  lines.push(lang === "hu" ? "Kapcsolat:" : "Kontakt:");
  lines.push(yourContact);
  lines.push("");
  lines.push(lang === "hu" ? "Szép napot!" : "Pekný deň!");
  lines.push("Anna & Lukáš");

  MailApp.sendEmail({
    to,
    subject,
    body: lines.join("\n")
  });
}

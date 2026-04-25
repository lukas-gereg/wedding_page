const RESPONSES_SHEET_ID = "";
const RESPONSES_TAB = "";

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
      "timestamp", "attendance", "register_people_count", "bring", "bring_other", "help", "help_other",
      "arrival", "accommodation_people_count", "accommodation_extra", "car_free_seats", "car_route", "diet", "diet_other",
      "allergy_acknowledgement", "official_name", "email", "phone", "consent_feedback_30d", "consent_gdpr_media", "lang"
    ]);
  }

  sheet.appendRow([
    new Date(),
    data.attendance || "",
    data.register_people_count || "",
    Array.isArray(data.bring) ? data.bring.join(", ") : (data.bring || ""),
    data.bring_other || "",
    Array.isArray(data.help) ? data.help.join(", ") : (data.help || ""),
    data.help_other || "",
    data.arrival || "",
    data.accommodation_people_count || "",
    data.accommodation_extra,
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

function buildEmailBody_sk(translated, yourContactBlock = []) {
  const safe = (v) => (v && String(v).trim() ? String(v).trim() : null);
  const joinList = (arr) =>
    Array.isArray(arr) && arr.length ? arr.join(", ") : null;

  const lines = [];

  lines.push(`Ahoj ${safe(translated.official_name) || ""},`);
  lines.push("");
  lines.push("ďakujeme za tvoju spätnú väzbu! Tvoja odpoveď sa k nám dostala, a veľmi sa tešíme, ak ťa na svadbe uvidíme!");
  lines.push("");
  lines.push("Zhrnutie tvojej odpovede:");
  lines.push("");
  lines.push("────────────────────────────");
  lines.push("");

  // ÚČASŤ
  lines.push("ÚČASŤ");
  if (safe(translated.attendance))
    lines.push(`• Prídem na: ${translated.attendance}`);
  if (safe(translated.register_people_count))
    lines.push(`• Koľkých ľudí registrujem: ${translated.register_people_count}`);
  lines.push("");

  // PRÍCHOD
  lines.push("PRÍCHOD & UBYTOVANIE");
  if (safe(translated.arrival))
    lines.push(`• Ubytovanie na: ${translated.arrival}`);
  if (safe(translated.accommodation_people_count))
    lines.push(`• Pre koľko ľudí potrebujem ubytovanie: ${translated.accommodation_people_count}`);
  if (safe(translated.accommodation_extra))
    lines.push(`• Špeciálna požiadavka: ${translated.accommodation_extra}`);
  lines.push("");

  // PRÍSPEVOK
  lines.push("ČO BY SOM VEDEL PRINIESŤ");
  const bringList = joinList(translated.bring);
  if (bringList)
    lines.push(`• Prinesiem: ${bringList}`);
  if (safe(translated.bring_other))
    lines.push(`• Iné: ${translated.bring_other}`);
  lines.push("");

  // POMOC
  lines.push("S ČÍM BY SOM VEDEL POMÔCŤ");
  const helpList = joinList(translated.help);
  if (helpList)
    lines.push(`• Pomôžem s: ${helpList}`);
  if (safe(translated.help_other))
    lines.push(`• Iné: ${translated.help_other}`);
  lines.push("");

  // ODVOZ
  lines.push("CESTOVANIE / POMOC S PREPRAVOU");
  if (safe(translated.car_free_seats))
    lines.push(`• Voľné miesta v mojom aute: ${translated.car_free_seats}`);
  if (safe(translated.car_route))
    lines.push(`• Trasa / smer z ktorého idem: ${translated.car_route}`);
  lines.push("");

  // STRAVA
  lines.push("DIETNE OBMEDZENIA");
  if (safe(translated.diet))
    lines.push(`• Dietne obmedzenie: ${translated.diet}`);
  if (safe(translated.diet_other))
    lines.push(`• Detail: ${translated.diet_other}`);
  if (safe(translated.allergy_ack))
    lines.push(`• ${translated.allergy_ack}`);
  lines.push("");

  // KONTAKT
  lines.push("KONTAKT");
  if (safe(translated.email))
    lines.push(`• Email: ${translated.email}`);
  if (safe(translated.phone))
    lines.push(`• Telefónne číslo: ${translated.phone}`);
  lines.push("");

  // SÚHLASY
  lines.push("SÚHLASY");
  if (safe(translated.consent_feedback_30d))
    lines.push(`• ${translated.consent_feedback_30d}`);
  if (safe(translated.consent_gdpr_media))
    lines.push(`• ${translated.consent_gdpr_media}`);
  lines.push("");

  lines.push("────────────────────────────");
  lines.push("");
  lines.push("Ak by si potreboval čokoľvek zmeniť, pokojne nám daj vedieť.");
  lines.push("");
  lines.push("Tešíme sa na teba!");
  lines.push("");
  lines.push("Kontakt:");
  for (const line of yourContactBlock) {
    if (safe(line)) lines.push(line);
  }
  lines.push("");
  lines.push("S pozdravom,");
  lines.push("Anna & Lukáš");

  return lines.join("\n");
}

function buildEmailBody_hu(translated, yourContactBlock = []) {
  const safe = (v) => (v && String(v).trim() ? String(v).trim() : null);
  const joinList = (arr) =>
    Array.isArray(arr) && arr.length ? arr.join(", ") : null;

  const lines = [];

  lines.push(`Szia ${safe(translated.official_name) || ""},`);
  lines.push("");
  lines.push("köszönjük az RSVP visszajelzésedet! Sikeresen megkaptuk 💛");
  lines.push("");
  lines.push("A válaszod összefoglalója:");
  lines.push("");
  lines.push("────────────────────────────");
  lines.push("");

  // RÉSZVÉTEL
  lines.push("RÉSZVÉTEL");
  if (safe(translated.attendance))
    lines.push(`• Részvétel: ${translated.attendance}`);
  if (safe(translated.register_people_count))
    lines.push(`• Személyek száma: ${translated.register_people_count}`);
  lines.push("");

  // ÉRKEZÉS
  lines.push("ÉRKEZÉS ÉS SZÁLLÁS");
  if (safe(translated.arrival))
    lines.push(`• Érkezés: ${translated.arrival}`);
  if (safe(translated.accommodation_people_count))
    lines.push(`• Szállás: ${translated.accommodation_people_count} fő részére`);
  if (safe(translated.accommodation_extra))
    lines.push(`• Megjegyzés: ${translated.accommodation_extra}`);
  lines.push("");

  // HOZZÁJÁRULÁS
  lines.push("HOZZÁJÁRULÁS");
  const bringList = joinList(translated.bring);
  if (bringList)
    lines.push(`• Amit hozol: ${bringList}`);
  if (safe(translated.bring_other))
    lines.push(`• Egyéb: ${translated.bring_other}`);
  lines.push("");

  // SEGÍTSÉG
  lines.push("SEGÍTSÉG");
  const helpList = joinList(translated.help);
  if (helpList)
    lines.push(`• Segítesz ebben: ${helpList}`);
  if (safe(translated.help_other))
    lines.push(`• Egyéb: ${translated.help_other}`);
  lines.push("");

  // TELEKOCSI
  lines.push("TELEKOCSI");
  if (safe(translated.car_free_seats))
    lines.push(`• Szabad helyek: ${translated.car_free_seats}`);
  if (safe(translated.car_route))
    lines.push(`• Útvonal: ${translated.car_route}`);
  lines.push("");

  // ÉTKEZÉS
  lines.push("ÉTKEZÉS");
  if (safe(translated.diet))
    lines.push(`• Diéta: ${translated.diet}`);
  if (safe(translated.diet_other))
    lines.push(`• Részletek: ${translated.diet_other}`);
  if (safe(translated.allergy_ack))
    lines.push(`• Allergia nyilatkozat: ${translated.allergy_ack}`);
  lines.push("");

  // KAPCSOLAT
  lines.push("KAPCSOLAT");
  if (safe(translated.email))
    lines.push(`• Email: ${translated.email}`);
  if (safe(translated.phone))
    lines.push(`• Telefonszám: ${translated.phone}`);
  lines.push("");

  // HOZZÁJÁRULÁSOK
  lines.push("HOZZÁJÁRULÁSOK");
  if (safe(translated.consent_feedback_30d))
    lines.push(`• Emlékeztető: ${translated.consent_feedback_30d}`);
  if (safe(translated.consent_gdpr_media))
    lines.push(`• Média hozzájárulás (GDPR): ${translated.consent_gdpr_media}`);
  lines.push("");

  lines.push("────────────────────────────");
  lines.push("");
  lines.push("Ha bármit módosítanál, nyugodtan vedd fel velünk a kapcsolatot.");
  lines.push("");
  lines.push("Nagyon várjuk, hogy együtt ünnepeljünk! 😊");
  lines.push("");
  lines.push("Kapcsolat:");
  for (const line of yourContactBlock) {
    if (safe(line)) lines.push(line);
  }
  lines.push("");
  lines.push("Üdvözlettel,");
  lines.push("Anna & Lukáš");

  return lines.join("\n");
}

function sendConfirmationEmail_(payload) {
  const to = payload.email;
  if (!to) return;

  const lang = payload.lang || "sk";

  let body;
  let subject;
  const contact = [];

  if (lang === "hu") {
    subject = "";
    body = buildEmailBody_hu(payload.translated, contact);
  } else {
    subject = "Anna & Lukáš • Potvrdenie prihlásenia";
    body = buildEmailBody_sk(payload.translated, contact);
  }

  MailApp.sendEmail({
    to,
    subject,
    body: body
  });
}

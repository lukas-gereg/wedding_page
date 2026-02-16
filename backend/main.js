const RESPONSES_SHEET_ID = "";
const RESPONSES_TAB = "";

const WISHLIST_SHEET_ID = "";
const WISHLIST_TAB = "";
const PLEDGES_TAB = "";

const GALLERY_PRO_FOLDER_ID = "";
const GALLERY_GUESTS_FOLDER_ID = "";

const FX_EUR_HUF = 385;

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
  if (action === "wishlist") return getWishlistItems();
  if (action === "gallery") return getGalleryPage(e);
  return fail("UNKNOWN_ACTION", {}, "Unknown action");
}

function doPost(e) {
  try {
    const data = JSON.parse(e?.postData?.contents || "{}");
    console.log(data);
    if (String(data.gift || "") === "Contribute to our home wishlist") {
      const itemId = String(data.wishlist_item_id || "").trim();
      const type = String(data.wishlist_type || "").trim(); // FULL | PLEDGE

      if (!itemId) return fail("WISHLIST_ITEM_REQUIRED");
      if (!type) return fail("WISHLIST_TYPE_REQUIRED");

      if (type === "PLEDGE") {
        const amt = Number(data.wishlist_amount_huf || 0);
        if (!Number.isFinite(amt) || amt <= 0) return fail("WISHLIST_AMOUNT_REQUIRED");
      }

      try {
        updateWishlistFromPledge(data);
      } catch (err) {
        return asFail(err);
      }
    }

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

    const pageSizeRaw = Number((e?.parameter && e?.parameter.pageSize) || 48);
    const pageSize = Math.max(12, Math.min(96, pageSizeRaw));
    const pageToken = String((e?.parameter && e?.parameter?.pageToken) || "").trim();

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

function getWishlistItems() {
  try {
    const ss = SpreadsheetApp.openById(WISHLIST_SHEET_ID);
    const sheet = ss.getSheetByName(WISHLIST_TAB);
    if (!sheet) return fail("WISHLIST_TAB_MISSING");

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return json({ ok: true, items: [] });

    const header = values[0];
    const idx = indexMap(header, [
      "item_id", "item_name", "link", "total_price", "pledged_total", "remaining", "status"
    ]);

    const items = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const status = String(row[idx.status] || "").toUpperCase();
      const remaining = Number(row[idx.remaining] || 0);

      if (status === "OPEN" && remaining > 0) {
        items.push({
          item_id: String(row[idx.item_id]),
          item_name: String(row[idx.item_name]),
          link: String(row[idx.link] || ""),
          total_price: Number(row[idx.total_price] || 0),
          remaining: remaining
        });
      }
    }

    return json({ ok: true, items });
  } catch (err) {
    return asFail(err);
  }
}

function saveResponse(data) {
  const ss = SpreadsheetApp.openById(RESPONSES_SHEET_ID);
  const sheet = ss.getSheetByName(RESPONSES_TAB) || ss.insertSheet(RESPONSES_TAB);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "timestamp","attendance","bring","bring_other","help","help_other","arrival",
      "car_free_seats","car_route","diet","diet_other","allergy_acknowledgement","gift",
      "wishlist_item_id","wishlist_type","wishlist_currency","wishlist_amount_huf","wishlist_note",
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
    data.gift || "",
    data.wishlist_item_id || "",
    data.wishlist_type || "",
    data.wishlist_currency || "",
    data.wishlist_amount_huf || "",
    data.wishlist_note || "",
    data.official_name || "",
    data.email || "",
    data.phone || "",
    data.consent_feedback_30d || "",
    data.consent_gdpr_media || "",
    data.lang || ""
  ]);
}

function updateWishlistFromPledge(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const itemId = String(data.wishlist_item_id || "").trim();
    const type = String(data.wishlist_type || "").trim();
    const currency = String(data.wishlist_currency || "HUF").trim();
    const requestedAmountHuf = Number(data.wishlist_amount_huf || 0);

    if (!itemId) throwCoded("WISHLIST_ITEM_REQUIRED");
    if (!type) throwCoded("WISHLIST_TYPE_REQUIRED");

    const ss = SpreadsheetApp.openById(WISHLIST_SHEET_ID);
    const wishlist = ss.getSheetByName(WISHLIST_TAB);
    if (!wishlist) throwCoded("WISHLIST_TAB_MISSING");

    let pledges = ss.getSheetByName(PLEDGES_TAB);
    if (!pledges) pledges = ss.insertSheet(PLEDGES_TAB);

    if (pledges.getLastRow() === 0) {
      pledges.appendRow(["timestamp","item_id","amount_huf","amount_eur","currency","guest_name","email","note"]);
    }

    // Read wishlist
    const wishlistData = wishlist.getDataRange().getValues();
    if (wishlistData.length < 2) throwCoded("WISHLIST_EMPTY");

    const wHeader = wishlistData[0];
    const wIdx = indexMap(wHeader, [
      "item_id","item_name","total_price","pledged_total","remaining","status"
    ]);

    let rowIndex = -1; // 1-based row index
    for (let i = 1; i < wishlistData.length; i++) {
      if (String(wishlistData[i][wIdx.item_id]).trim() === itemId) {
        rowIndex = i + 1;
        break;
      }
    }
    if (rowIndex === -1) throwCoded("WISHLIST_ITEM_NOT_FOUND");

    const totalPriceHuf = Number(wishlist.getRange(rowIndex, wIdx.total_price + 1).getValue() || 0);

    const pledgeData = pledges.getDataRange().getValues();
    if (pledgeData.length < 1) throwCoded("PLEDGES_SHEET_BROKEN");

    const pHeader = pledgeData[0];
    const pIdx = indexMap(pHeader, [
      "timestamp","item_id","amount_huf","amount_eur","currency","guest_name","email","note"
    ]);

    const currentPledgedHuf = pledgeData
      .slice(1)
      .filter(r => String(r[pIdx.item_id]).trim() === itemId)
      .reduce((sum, r) => sum + Number(r[pIdx.amount_huf] || 0), 0);

    const remainingHuf = totalPriceHuf - currentPledgedHuf;

    if (remainingHuf <= 0) {
      throwCoded("ITEM_NOT_AVAILABLE", { remaining_huf: 0 });
    }

    let finalAmountHuf = 0;

    if (type === "FULL") {
      finalAmountHuf = remainingHuf;

    } else if (type === "PLEDGE") {
      if (!Number.isFinite(requestedAmountHuf) || requestedAmountHuf <= 0) {
        throwCoded("INVALID_AMOUNT");
      }
      if (requestedAmountHuf > remainingHuf) {
        throwCoded("OVERFILL", { remaining_huf: remainingHuf });
      }
      finalAmountHuf = requestedAmountHuf;
    } else {
      throwCoded("WISHLIST_TYPE_REQUIRED");
    }

    const amountEur = Number((finalAmountHuf / FX_EUR_HUF).toFixed(2));

    // Append pledge event
    pledges.appendRow([
      new Date(),
      itemId,
      finalAmountHuf,
      amountEur,
      currency,
      data.official_name || "",
      data.email || "",
      data.wishlist_note || ""
    ]);

    // Update derived totals on wishlist row
    const newTotalHuf = currentPledgedHuf + finalAmountHuf;

    wishlist.getRange(rowIndex, wIdx.pledged_total + 1).setValue(newTotalHuf);

  } finally {
    lock.releaseLock();
  }
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


function indexMap(headerRow, requiredCols) {
  const map = {};
  headerRow.forEach((h, i) => {
    map[String(h).trim()] = i;
  });

  (requiredCols || []).forEach(col => {
    if (map[col] === undefined) {
      throwCoded("SHEET_MISSING_COLUMN", { col: col }, "Missing sheet header column: " + col);
    }
  });

  return map;
}

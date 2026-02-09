const I18N = {
  sk: {
    nav_home: "Domov",
    nav_rsvp: "RSVP",
    nav_story: "Náš príbeh",
    nav_gallery: "Galéria",
    nav_wherewhen: "Kde & Kedy",
    lang_label: "Jazyk",

    home_kicker: "Pozývame Vás na svadbu",
    home_title: "Anna & Lukáš",
    home_sub: "Sobota • 15. august 2026 • 14:00 • Budapešť, Fő utca 17.",
    home_btn_rsvp: "Potvrdiť účasť (RSVP)",
    home_btn_details: "Kde & Kedy",

    rsvp_title: "RSVP",
    rsvp_sub: "Prosíme, dajte nám vedieť do: (doplňte dátum)",
    rsvp_note: "Tu vložte váš Google Form alebo vlastný formulár.",

    story_title: "Náš príbeh",
    story_p1: "Sem príde váš príbeh. Krátke odseky vyzerajú na tomto štýle najkrajšie.",
    story_p2: "Môžete doplniť aj časovú os, fotky, alebo malé citáty.",

    gallery_title: "Galéria",
    gallery_sub: "Fotky pridáme čoskoro.",

    ww_title: "Kde & Kedy",
    ww_ceremony: "Obrad",
    ww_reception: "Hostina",
    ww_date: "Dátum",
    ww_time: "Čas",
    ww_place: "Miesto",
    ww_map: "Mapa"
  },

  hu: {
    nav_home: "Kezdőlap",
    nav_rsvp: "RSVP",
    nav_story: "Történetünk",
    nav_gallery: "Galéria",
    nav_wherewhen: "Hol & Mikor",
    lang_label: "Nyelv",

    home_kicker: "Szeretettel meghívunk az esküvőnkre",
    home_title: "Anna & Lukáš",
    home_sub: "Szombat • 2026. augusztus 15. • 14:00 • Budapest, Fő utca 17.",
    home_btn_rsvp: "Részvétel visszajelzés (RSVP)",
    home_btn_details: "Hol & Mikor",

    rsvp_title: "RSVP",
    rsvp_sub: "Kérjük jelezzetek vissza eddig: (írjátok be a dátumot)",
    rsvp_note: "Ide illesszétek be a Google Űrlapot vagy saját űrlapot.",

    story_title: "Történetünk",
    story_p1: "Ide jön a történetetek. Rövid bekezdések ehhez a stílushoz passzolnak a legjobban.",
    story_p2: "Később lehet idővonal, képek vagy idézetek is.",

    gallery_title: "Galéria",
    gallery_sub: "Hamarosan jövünk a fotókkal.",

    ww_title: "Hol & Mikor",
    ww_ceremony: "Szertartás",
    ww_reception: "Lakodalom",
    ww_date: "Dátum",
    ww_time: "Időpont",
    ww_place: "Helyszín",
    ww_map: "Térkép"
  }
};

function getLang() {
  return localStorage.getItem("lang") || "sk";
}

function setLang(lang) {
  localStorage.setItem("lang", lang);
}

function applyI18n(lang) {
  const dict = I18N[lang] || I18N.sk;

  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });

  // Update dropdown if present
  const sel = document.querySelector("#langSelect");
  if (sel) sel.value = lang;
}

function initI18n() {
  const lang = getLang();
  applyI18n(lang);

  const sel = document.querySelector("#langSelect");
  if (sel) {
    sel.addEventListener("change", (e) => {
      const newLang = e.target.value;
      setLang(newLang);
      applyI18n(newLang);
    });
  }
}

document.addEventListener("DOMContentLoaded", initI18n);


/* Kanal-Radio Amels – zentrale Seitenauswahl und HTML-Includes */
(async function () {
  "use strict";
  const root = new URL("../", document.currentScript?.src || document.baseURI);
  const status = document.getElementById("app-status");
  const DAILY_ID = "PLUu1efwCKMCM";
  const params = new URLSearchParams(window.location.search);
  const hasList = params.has("list");
  const requestedId = hasList ? (params.get("list") || "").trim() : DAILY_ID;
  const playlistIdPattern = /^[A-Za-z0-9_-]{5,100}$/;

  async function readText(filename) {
    const response = await fetch(new URL(filename, root), {cache: "no-store"});
    if (!response.ok) throw new Error(filename + ": HTTP " + response.status);
    return response.text();
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = new URL(src, root).href;
      script.onload = resolve;
      script.onerror = () => reject(new Error("JavaScript konnte nicht geladen werden: " + src));
      document.body.appendChild(script);
    });
  }
  try {
    if (!playlistIdPattern.test(requestedId)) {
      throw new Error("Ungültiger Playlist-Link.");
    }
    const [metadataText, header, menu, footer] = await Promise.all([
      readText("json/playlist-metadata.json"),
      readText("index-header.html"),
      readText("index-menu.html"),
      readText("index-footer.html")
    ]);
    const catalog = JSON.parse(metadataText).playlists;
    if (!catalog || !catalog[requestedId]) {
      throw new Error("Playlist nicht in playlist-metadata.json gefunden: " + requestedId);
    }
    const entry = catalog[requestedId];
    const isDaily = !hasList;
    window.radioIsDaily = isDaily;
    window.radioCatalog = catalog;
    window.radioConfig = {
      kanal: isDaily ? "Daily" : entry.name,
      playlist: requestedId
    };
    document.getElementById("index-header").innerHTML = header;
    document.getElementById("index-footer").innerHTML = footer;
    // Menü wird von menu.js in denselben Container geladen.
    // 'menu' ist vorab geladen, damit fehlende Includes früh auffallen.
    if (!menu.includes('menu-dropdown')) throw new Error("Menüvorlage ungültig.");
    const coverName = isDaily ? "radiocover_daily.png" : "radiocover_" + entry.name + ".png";
    const cover = document.getElementById("radio-cover");
    cover.src = new URL("img/" + coverName, root).href;
    cover.alt = "Kanal-Radio Amels " + (isDaily ? "Daily" : entry.name) + " Titelbild";
    cover.onerror = function () { console.warn("Coverbild fehlt:", coverName); };
    document.getElementById("youtube-playlist-link").href =
      "https://www.youtube.com/playlist?list=" + encodeURIComponent(requestedId);
    document.title = "Kanal-Radio Amels " + (isDaily ? "Daily" : entry.name);
    document.getElementById("radio-main").hidden = false;
    status.hidden = true;
    // Das Menüscript wird nach dem DOM-Aufbau geladen. Es benötigt
    // DOMContentLoaded; dieser ist wegen defer bereits eingetreten.
    await loadScript("javascript/menu.js");
    await loadScript("javascript/radio.js");
    await loadScript("https://www.youtube.com/iframe_api");
  } catch (error) {
    console.error("Kanal-Radio: Seitenaufbau fehlgeschlagen:", error);
    status.textContent = "⚠️ " + error.message;
    status.hidden = false;
  }
})();

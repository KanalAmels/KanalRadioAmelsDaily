
/* Kanal-Radio Amels – Zentrale Menüsteuerung */

(async function () {

  const menuContainer = document.getElementById("menu-container");

  if (!menuContainer) {
    return;
  }

  try {

    // Projekt-Stammverzeichnis automatisch ermitteln
    // Funktioniert in Daily, Devel und auf anderen Servern

    const menuScript = Array.from(document.scripts).find(function (script) {
      return script.src &&
        new URL(script.src).pathname.endsWith("/menu.js");
    });

    if (!menuScript) {
      throw new Error("Pfad zur menu.js konnte nicht ermittelt werden");
    }

    const projectRoot = new URL("../", menuScript.src);

    // Zentrales Menü aus dem eigenen Projekt laden

    const menuURL = new URL("index-menu.html", projectRoot);
    const response = await fetch(menuURL);

    if (!response.ok) {
      throw new Error("Menü konnte nicht geladen werden");
    }

    const menuHTML = await response.text();

    menuContainer.innerHTML = `
      <button
        class="menu"
        id="menu-button"
        type="button"
        aria-expanded="false"
        aria-controls="menu-dropdown">
        Menü ☰
      </button>
      ${menuHTML}
    `;

    const menuButton = document.getElementById("menu-button");
    const menuDropdown = document.getElementById("menu-dropdown");

    // Menüziele ausschließlich aus playlist-metadata.json ableiten.
    const metadata = window.radioCatalog || {};
    const selectedId = window.radioConfig.playlist;
    const dailyMode = window.radioIsDaily;
    let activeDecade = null;

    const dailyLink = menuDropdown.querySelector("nav > a") ||
      menuDropdown.querySelector(":scope > a");
    if (dailyLink) {
      dailyLink.href = projectRoot.href;
      if (dailyMode) dailyLink.setAttribute("aria-current", "page");
    }

    const byName = new Map();
    Object.entries(metadata).forEach(function ([id, entry]) {
      if (entry && typeof entry.name === "string") {
        byName.set(entry.name.toLowerCase(), id);
      }
    });

    menuDropdown.querySelectorAll("a[data-playlist]").forEach(function (link) {
      const id = byName.get(link.dataset.playlist.toLowerCase());
      if (!id) {
        // Eintrag aus Menü entfernen, wenn nicht in JSON vorhanden.
        link.remove();
        return;
      }
      link.href = new URL("?list=" + encodeURIComponent(id), projectRoot).href;
      if (!dailyMode && id === selectedId) {
        link.setAttribute("aria-current", "page");
        activeDecade = link.closest(".menu-decade");
        if (activeDecade) activeDecade.classList.add("menu-active-decade");
      }
    });

    // Neue Playlists in der JSON automatisch im Menü ergänzen.
    // Einträge ohne passendes Jahrzehnt kommen unter "Weitere Sender".
    const knownNames = new Set(
      Array.from(menuDropdown.querySelectorAll("a[data-playlist]"))
        .map(link => link.dataset.playlist.toLowerCase())
    );
    let otherDecade = null;
    Object.entries(metadata).forEach(function ([id, entry]) {
      if (!entry || !entry.name || entry.name.toLowerCase() === "daily" ||
          knownNames.has(entry.name.toLowerCase())) return;
      const match = entry.name.match(/^(\d{4})th_(radio|dance)$/i);
      let group = null;
      if (match) {
        const decade = match[1].slice(0, 3) + "0";
        group = Array.from(menuDropdown.querySelectorAll(".menu-decade"))
          .find(el => el.querySelector("summary")?.textContent.includes(decade + " -"));
        if (group && group.hasAttribute("data-coming-soon")) {
          group.removeAttribute("data-coming-soon");
          const arrow = document.createElement("span");
          arrow.className = "menu-arrow";
          arrow.setAttribute("aria-hidden", "true");
          group.querySelector("summary").appendChild(arrow);
        }
      }
      if (!group) {
        if (!otherDecade) {
          otherDecade = document.createElement("details");
          otherDecade.className = "menu-decade";
          otherDecade.innerHTML = '<summary><span>♫</span> <span>Weitere Sender</span><span class="menu-arrow" aria-hidden="true"></span></summary><div class="menu-submenu"></div>';
          menuDropdown.appendChild(otherDecade);
        }
        group = otherDecade;
      }
      let submenu = group.querySelector(".menu-submenu");
      if (!submenu) {
        submenu = document.createElement("div");
        submenu.className = "menu-submenu";
        group.appendChild(submenu);
      }
      const link = document.createElement("a");
      link.href = new URL("?list=" + encodeURIComponent(id), projectRoot).href;
      link.dataset.playlist = entry.name;
      const symbol = document.createElement("span");
      symbol.textContent = "♫";
      const label = document.createElement("span");
      label.className = "menu-playlist-name";
      label.textContent = entry.name.replace(/^\d{4}th_/, "").replace(/_/g, "-");
      const count = document.createElement("span");
      count.className = "menu-song-count";
      link.append(symbol, label, count);
      submenu.appendChild(link);
      if (!dailyMode && id === selectedId) {
        link.setAttribute("aria-current", "page");
        group.classList.add("menu-active-decade");
        activeDecade = group;
      }
    });

    // Formatierung für den aktiven Sender
    // und das zugehörige Jahrzehnt dauerhaft sicherstellen

    if (!document.getElementById("kanalradio-menu-active-style")) {

      const activeStyle = document.createElement("style");

      activeStyle.id = "kanalradio-menu-active-style";

      activeStyle.textContent = `
        #menu-dropdown a[aria-current="page"] {
          font-weight: bold !important;
          color: #facc15 !important;
        }

        #menu-dropdown .menu-active-decade > summary {
          font-weight: bold !important;
          color: #facc15 !important;
        }

        #menu-dropdown .menu-decade[open] > summary {
          font-weight: bold !important;
          color: #facc15 !important;
        }
      `;

      document.head.appendChild(activeStyle);

    }

    // Immer nur ein Jahrzehnt gleichzeitig aufklappen

    const decades = menuDropdown.querySelectorAll(".menu-decade");

    decades.forEach(function (decade) {

      decade.addEventListener("toggle", function () {

        if (!decade.open) {
          return;
        }

        decades.forEach(function (other) {

          if (other !== decade) {
            other.open = false;
          }

        });

      });

    });

    // Noch nicht verfügbare Jahrzehnte:
    // Statt Aufklappen eine zweisprachige Meldung anzeigen

    menuDropdown
      .querySelectorAll(".menu-decade[data-coming-soon] > summary")
      .forEach(function (summary) {

        summary.addEventListener("click", function (event) {

          event.preventDefault();

          window.alert(
            "Coming soon.\n\n(Kommen bald...)"
          );

        });

      });

    // Aktuelles Jahrzehnt automatisch aufklappen
    // Dadurch wird beim Öffnen des Menüs auch der
    // aktive Radio-Mix oder Dance-Mix sofort sichtbar

    if (activeDecade) {
      activeDecade.open = true;
    }

    // Songzahlen aus zentraler JSON-Datei laden
    //
    // Erwartetes Format:
    //
    // {
    //   "1990th_radio": 247,
    //   "1990th_dance": 183
    // }
    //
    // Die tatsächlichen Zahlen werden später
    // automatisch über GitHub Actions ermittelt.

    async function loadPlaylistCounts() {

      const countsURL = new URL(
        "json/playlist-counts.json",
        projectRoot
      );

      try {

        // Beim Seitenaufruf die veröffentlichte
        // JSON-Datei neu abrufen

        const countsResponse = await fetch(countsURL, {
          cache: "no-store"
        });

        if (!countsResponse.ok) {
          throw new Error(
            "Songzahlen nicht verfügbar: " +
            countsResponse.status
          );
        }

        const counts = await countsResponse.json();

        // Jede Playlist anhand ihres data-playlist-Wertes
        // mit der passenden Songanzahl verbinden

        menuDropdown
          .querySelectorAll("[data-playlist]")
          .forEach(function (link) {

            const playlistKey = link.dataset.playlist;

            const countElement = link.querySelector(
              ".menu-song-count"
            );

            if (!countElement) {
              return;
            }

            const count = counts[playlistKey];

            // Nur gültige, nichtnegative Ganzzahlen anzeigen
            // Keine erfundenen Werte und keine Fehlertexte

            if (
              typeof count === "number" &&
              Number.isSafeInteger(count) &&
              count >= 0
            ) {

              countElement.textContent =
                "(" + count.toLocaleString("de-DE") + " Songs)";

            } else {

              countElement.textContent = "";

            }

          });

      } catch (error) {

        // Das Menü muss auch ohne Songzahlen
        // vollständig funktionsfähig bleiben

        console.info(
          "Kanal-Radio: Songzahlen noch nicht verfügbar.",
          error.message
        );

      }

    }

    // Songzahlen laden, ohne das Menü zu blockieren

    loadPlaylistCounts();

    // Menü öffnen und schließen

    function closeMenu() {

      menuDropdown.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");

    }

    menuButton.addEventListener("click", function () {

      const isOpen = menuDropdown.classList.toggle("open");

      menuButton.setAttribute("aria-expanded", String(isOpen));

    });

    // Schließen beim Klick außerhalb

    document.addEventListener("click", function (event) {

      if (!menuContainer.contains(event.target)) {
        closeMenu();
      }

    });

    // Schließen mit Escape

    document.addEventListener("keydown", function (event) {

      if (
        event.key === "Escape" &&
        menuDropdown.classList.contains("open")
      ) {

        closeMenu();
        menuButton.focus();

      }

    });

  } catch (error) {

    console.error("Kanal-Radio Menüfehler:", error);
    menuContainer.textContent = "Menü nicht verfügbar";

  }

})();

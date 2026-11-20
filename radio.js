
/* Kanal-Radio Amels | radio.js | Modulare Version 19.11.2026 */

/*
 * Kanal-Radio Amels – zentraler Einstiegspunkt.
 * Die fünf Funktionsdateien werden automatisch aus demselben Ordner geladen.
 * Vorhandene HTML-Verweise auf radio.js bleiben unverändert.
 * Klassische Scripts (keine ES-Module), damit die bestehenden globalen
 * Zustände und die YouTube-IFrame-API kompatibel bleiben.
 */
(function () {
    "use strict";

    const script = document.currentScript || Array.from(
        document.querySelectorAll("script[src]")
    ).find(function (item) {
        return /(?:^|\/)radio\.js(?:[?#]|$)/.test(item.src);
    });
    const base = script ? new URL(".", script.src) : new URL("../", document.baseURI);
    const parts = [
        "radio-playlists.js",
        "radio-titles.js",
        "radio-ui.js",
        "radio-tracking.js",
        "radio-player.js"
    ];
    let scriptsReady = false;
    let youtubeReady = !!(window.YT && window.YT.Player);
    let playerInitialized = false;

    // Callback sofort registrieren, auch wenn YouTube schneller lädt.
    window.onYouTubeIframeAPIReady = function () {
        youtubeReady = true;
        maybeInitialize();
    };

    function maybeInitialize() {
        if (!scriptsReady || !youtubeReady || playerInitialized) return;
        playerInitialized = true;
        initializeYouTubePlayer();
    }

    function loadPart(name) {
        return new Promise(function (resolve, reject) {
            const element = document.createElement("script");
            element.src = new URL(name, base).href;
            element.async = false;
            element.onload = resolve;
            element.onerror = function () {
                reject(new Error("KanalRadio: " + name + " konnte nicht geladen werden."));
            };
            document.head.appendChild(element);
        });
    }

    (async function () {
        try {
            for (const name of parts) {
                await loadPart(name);
            }
            scriptsReady = true;
            youtubeReady = youtubeReady || !!(window.YT && window.YT.Player);
            maybeInitialize();
        } catch (error) {
            console.error(error);
        }
    })();
})();


/*
 * Kanal-Radio Amels
 * radio.js – Zentrale Modulsteuerung
 * 20.11.2026
 *
 * Lädt alle fünf Module in festgelegter Reihenfolge.
 * Initialisiert den YouTube-Player genau einmal.
 * Die bestehende HTML-Einbindung bleibt unverändert.
 */

(function () {
    "use strict";

    const currentScript =
        document.currentScript ||
        Array.from(
            document.querySelectorAll("script[src]")
        ).find(function (script) {
            return /(?:^|\/)radio\.js(?:[?#]|$)/
                .test(script.src);
        });

    const radioBase = currentScript
        ? new URL(".", currentScript.src)
        : new URL("../", document.baseURI);

    const modules = [
        "radio-playlists.js",
        "radio-titles.js",
        "radio-ui.js",
        "radio-tracking.js",
        "radio-player.js"
    ];

    let modulesLoaded = false;
    let youtubeLoaded = !!(
        window.YT &&
        typeof window.YT.Player === "function"
    );
    let initializationStarted = false;

    // Bereits vorhandenen Callback nicht verlieren.
    const previousYouTubeCallback =
        window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = function () {
        youtubeLoaded = true;

        if (
            typeof previousYouTubeCallback === "function"
        ) {
            try {
                previousYouTubeCallback();
            } catch (error) {
                console.warn(
                    "KanalRadio: Vorheriger YouTube-Callback:",
                    error
                );
            }
        }

        startRadioWhenReady();
    };

    function startRadioWhenReady() {
        if (
            !modulesLoaded ||
            !youtubeLoaded ||
            initializationStarted
        ) {
            return;
        }

        if (
            !window.YT ||
            typeof window.YT.Player !== "function"
        ) {
            return;
        }

        initializationStarted = true;

        try {
            initializeYouTubePlayer();
        } catch (error) {
            initializationStarted = false;

            console.error(
                "KanalRadio: Playerstart fehlgeschlagen:",
                error
            );
        }
    }

    function loadModule(filename) {
        return new Promise(function (resolve, reject) {
            const script = document.createElement("script");

            const url = new URL(filename, radioBase);

            // Alle Module eines Seitenaufrufs frisch laden.
            // Verhindert gemischte alte/neue Modulstände.
            url.searchParams.set(
                "krv",
                "20261120-2"
            );

            script.src = url.href;
            script.async = false;

            script.onload = function () {
                resolve();
            };

            script.onerror = function () {
                reject(
                    new Error(
                        "Modul konnte nicht geladen werden: " +
                        filename
                    )
                );
            };

            document.head.appendChild(script);
        });
    }

    async function loadAllModules() {
        try {
            for (const filename of modules) {
                await loadModule(filename);
            }

            modulesLoaded = true;

            youtubeLoaded = !!(
                window.YT &&
                typeof window.YT.Player === "function"
            );

            console.log(
                "KanalRadio: Alle Module geladen."
            );

            startRadioWhenReady();

        } catch (error) {
            console.error(
                "KanalRadio: Modulfehler:",
                error
            );
        }
    }

    loadAllModules();
})();

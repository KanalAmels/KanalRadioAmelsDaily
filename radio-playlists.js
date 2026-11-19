/* Kanal-Radio Amels | radio-playlists.js | Modulare Version 19.11.2026 */

let player;
let playerReady = false;
let lastTrackedVideoId = null;
let hasPlaybackStarted = false;

// Werbesteuerung
let adPausedByUs = false;
let adPlaybackStartedByUs = false;
let initialStartRequested = false;

// Neue Metadaten- und Daily-Steuerung
let playlistMetadata = null;
let dailyStartIndex = 0;
let initialPlaylistPrepared = false;
let pendingSongIndex = null;
let dailyStartLoaded = false;

const radioConfig = window.radioConfig || {};
const isDaily = radioConfig.kanal === "Daily";

// Pfad der zentralen radio.js ermitteln
const radioScript = Array.from(
    document.querySelectorAll("script[src]")
).find(function (script) {
    return /(?:^|\/)radio\.js(?:[?#]|$)/.test(script.src);
});

const radioBaseUrl = radioScript
    ? new URL(".", radioScript.src)
    : new URL("../", document.baseURI);

const songCorrectionsUrl = new URL(
    "song-corrections.json",
    radioBaseUrl
).href;

const metadataUrl = new URL(
    "playlist-metadata.json",
    radioBaseUrl
).href;

const dailyStartUrl = new URL(
    "daily-start.json",
    document.baseURI
).href;

// Neue Playlist-Metadaten laden
const metadataPromise = fetch(metadataUrl, {
    cache: "no-store"
})
    .then(function (response) {
        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }
        return response.json();
    })
    .then(function (data) {
        playlistMetadata =
            data &&
            data.playlists &&
            data.playlists[radioConfig.playlist]
                ? data.playlists[radioConfig.playlist]
                : null;

        if (playlistMetadata) {
            console.log(
                "KanalRadio: Metadaten geladen:",
                radioConfig.kanal
            );
        } else {
            console.warn(
                "KanalRadio: Keine Metadaten für Playlist:",
                radioConfig.playlist
            );
        }

        updateVideoTitle();
    })
    .catch(function (error) {
        console.warn(
            "KanalRadio: playlist-metadata.json nicht geladen:",
            error.message
        );
    });

// Daily-Startsong aus JSON lesen
async function readDailyStartIndex() {
    if (!isDaily) {
        dailyStartLoaded = true;
        return 0;
    }

    try {
        const response = await fetch(dailyStartUrl, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const data = await response.json();

        if (
            !Number.isSafeInteger(data.startSong) ||
            data.startSong < 1
        ) {
            throw new Error(
                "startSong muss eine positive ganze Zahl sein."
            );
        }

        // YouTube zählt ab Index 0
        let index = data.startSong - 1;

        // Falls die Metadaten bereits geladen sind:
        // Ungültige Songnummer abfangen
        const songs = playlistMetadata &&
            playlistMetadata.songs;

        if (
            Array.isArray(songs) &&
            index >= songs.length
        ) {
            console.warn(
                "KanalRadio Daily: Startsong liegt außerhalb " +
                "der Playlist. Verwende Song 1."
            );
            index = 0;
        }

        console.log(
            "KanalRadio Daily: Startsong:",
            index + 1
        );

        return index;

    } catch (error) {
        console.warn(
            "KanalRadio Daily: Startsong nicht geladen. " +
            "Verwende Song 1.",
            error.message
        );
        return 0;
    }
}

// Daily-Konfiguration bereits beim Seitenaufruf laden
const dailyStartPromise = readDailyStartIndex()
    .then(function (index) {
        dailyStartIndex = index;
        dailyStartLoaded = true;
        updateVideoTitle();
        return index;
    });

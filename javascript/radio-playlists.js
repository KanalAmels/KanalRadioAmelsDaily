
/*
 * Kanal-Radio Amels
 * radio-playlists.js – Playlistverwaltung
 * 26.11.2026
 *
 * Gemeinsamer Zustand und Datenbeschaffung.
 * Der Player wird ausschließlich in
 * radio-player.js initialisiert.
 *
 * Daily:
 * startSong = gewünschter Startsong
 * max       = Anzahl freigegebener Songs
 *
 * Alle Jahrzehntsender bleiben unverändert.
 */

// Gemeinsamer Playerzustand
let player = null;
let playerReady = false;
let lastTrackedVideoId = null;
let hasPlaybackStarted = false;

// Bestehende Werbesteuerung
let adPausedByUs = false;
let adPlaybackStartedByUs = false;
let initialStartRequested = false;

// Playlistdaten
let playlistMetadata = null;
let dailyStartIndex = 0;
let dailyMaxSongs = null;
let initialPlaylistPrepared = false;
let pendingSongIndex = null;
let dailyStartLoaded = false;

const radioConfig = window.radioConfig || {};
const isDaily = radioConfig.kanal === "Daily";

// Basisverzeichnis bestimmen
const radioScript = Array.from(
    document.querySelectorAll("script[src]")
).find(function (script) {
    return /(?:^|\/)radio\.js(?:[?#]|$)/
        .test(script.src);
});

const radioBaseUrl = radioScript
    ? new URL(".", radioScript.src)
    : new URL("../", document.baseURI);

// Korrekturen und Metadaten liegen neben radio.js
const songCorrectionsUrl = new URL(
    "../json/song-corrections.json",
    radioBaseUrl
).href;

const metadataUrl = new URL(
    "../json/playlist-metadata.json",
    radioBaseUrl
).href;

// Daily-Konfiguration
const dailyStartUrl = new URL(
    "../json/daily-start.json",
    radioBaseUrl
).href;

// Metadaten laden
const metadataPromise = fetch(metadataUrl, {
    cache: "no-store"
})
    .then(function (response) {
        if (!response.ok) {
            throw new Error(
                "HTTP " + response.status
            );
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
                "KanalRadio: Keine Metadaten für:",
                radioConfig.playlist
            );
        }

        if (
            typeof updateVideoTitle === "function"
        ) {
            updateVideoTitle();
        }

        return playlistMetadata;
    })
    .catch(function (error) {
        console.warn(
            "KanalRadio: Metadaten nicht geladen:",
            error.message
        );

        playlistMetadata = null;
        return null;
    });

// Daily-Konfiguration lesen
async function readDailySettings() {
    if (!isDaily) {
        return {
            index: 0,
            max: null
        };
    }

    try {
        const response = await fetch(dailyStartUrl, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                "HTTP " + response.status
            );
        }

        const data = await response.json();

        if (
            !Number.isSafeInteger(data.startSong) ||
            data.startSong < 1
        ) {
            throw new Error(
                "startSong muss eine positive " +
                "ganze Zahl sein."
            );
        }

        if (
            !Number.isSafeInteger(data.max) ||
            data.max < 1
        ) {
            throw new Error(
                "max muss eine positive " +
                "ganze Zahl sein."
            );
        }

        if (data.startSong > data.max) {
            throw new Error(
                "startSong darf nicht größer " +
                "als max sein."
            );
        }

        console.log(
            "KanalRadio Daily: Startsong:",
            data.startSong
        );

        console.log(
            "KanalRadio Daily: Freigabe bis Song:",
            data.max
        );

        return {
            index: data.startSong - 1,
            max: data.max
        };

    } catch (error) {
        console.warn(
            "KanalRadio Daily: Konfiguration " +
            "nicht geladen. Verwende Song 1 " +
            "und begrenze auf einen Song.",
            error.message
        );

        return {
            index: 0,
            max: 1
        };
    }
}

const dailyStartPromise = readDailySettings()
    .then(function (settings) {
        dailyStartIndex = settings.index;
        dailyMaxSongs = settings.max;
        dailyStartLoaded = true;

        if (
            typeof updateVideoTitle === "function"
        ) {
            updateVideoTitle();
        }

        return dailyStartIndex;
    });

// Einheitliche Vorbereitung der Startdaten
async function prepareRadioStartData() {
    await Promise.all([
        metadataPromise,
        dailyStartPromise
    ]);

    let index = isDaily ? dailyStartIndex : 0;

    if (
        !Number.isSafeInteger(index) ||
        index < 0
    ) {
        index = 0;
    }

    const songs =
        playlistMetadata &&
        Array.isArray(playlistMetadata.songs)
            ? playlistMetadata.songs
            : null;

    if (isDaily && songs) {
        if (songs.length === 0) {
            throw new Error(
                "Die Daily-Playlist enthält " +
                "keine Songs."
            );
        }

        dailyMaxSongs = Math.min(
            dailyMaxSongs,
            songs.length
        );

        if (index >= dailyMaxSongs) {
            console.warn(
                "KanalRadio Daily: Startposition " +
                "außerhalb der freigegebenen Songs. " +
                "Verwende Song 1."
            );

            index = 0;
        }

        console.log(
            "KanalRadio Daily: Freigegebene Songs:",
            dailyMaxSongs,
            "von",
            songs.length
        );
    }

    if (
        songs &&
        !isDaily &&
        index >= songs.length
    ) {
        console.warn(
            "KanalRadio: Startposition außerhalb " +
            "der Metadaten. Verwende Song 1."
        );

        index = 0;
    }

    dailyStartIndex = index;
    pendingSongIndex = index;

    return index;
}

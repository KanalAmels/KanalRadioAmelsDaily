
/*
 * Kanal-Radio Amels
 * radio-playlists.js – Playlistverwaltung
 * 20.11.2026
 *
 * Gemeinsamer Zustand und Datenbeschaffung.
 * Der Player wird ausschließlich in
 * radio-player.js initialisiert.
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
    "song-corrections.json",
    radioBaseUrl
).href;

const metadataUrl = new URL(
    "playlist-metadata.json",
    radioBaseUrl
).href;

// Daily-Start liegt weiterhin beim aufrufenden Sender
const dailyStartUrl = new URL(
    "daily-start.json",
    document.baseURI
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

// Daily-Startposition lesen
async function readDailyStartIndex() {
    if (!isDaily) {
        return 0;
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

        const index = data.startSong - 1;

        console.log(
            "KanalRadio Daily: Startsong:",
            data.startSong
        );

        return index;

    } catch (error) {
        console.warn(
            "KanalRadio Daily: Startposition " +
            "nicht geladen. Verwende Song 1.",
            error.message
        );

        return 0;
    }
}

const dailyStartPromise = readDailyStartIndex()
    .then(function (index) {
        dailyStartIndex = index;
        dailyStartLoaded = true;

        if (
            typeof updateVideoTitle === "function"
        ) {
            updateVideoTitle();
        }

        return index;
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

    if (songs && index >= songs.length) {
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

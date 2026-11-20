
/* Kanal-Radio Amels | radio-player.js | Start-Fix 20.11.2026 */

/*
 * Ablauf:
 * 1. YouTube-Player erstellen
 * 2. Daily-Startposition und Metadaten abwarten
 * 3. Playlist laden
 * 4. Playlistposition und Video-ID überprüfen
 * 5. Bei Abweichung Playlist erneut korrekt vorbereiten
 * 6. Erst danach LAST, START/PAUSE und NEXT freigeben
 *
 * Keine vorgemerkten Tastendrücke.
 * Kein automatisches Abspielen beim Seitenaufruf.
 */

const RADIO_READY_INTERVAL = 200;
const RADIO_READY_TIMEOUT = 20000;
const RADIO_POSITION_RETRY_DELAY = 1200;
const RADIO_MAX_POSITION_RETRIES = 3;

let radioControlsReady = false;
let radioInitializationFinished = false;
let radioInitializationFailed = false;
let radioExpectedStartIndex = 0;
let radioReadyTimer = null;
let radioReadyTimeout = null;
let radioPositionTimer = null;
let radioPositionCorrectionPending = false;
let radioPositionRetryCount = 0;
let radioPlaylistRequested = false;

const previousButton =
    document.getElementById("previous");

const nextButton =
    document.getElementById("next");

let radioLoadingStatus = null;

// --------------------------------------------------
// Ladestatus
// --------------------------------------------------

function createRadioLoadingStatus() {
    if (radioLoadingStatus) return;

    if (!startButton || !startButton.parentElement) {
        return;
    }

    radioLoadingStatus = document.createElement("div");
    radioLoadingStatus.id = "radio-loading-status";
    radioLoadingStatus.setAttribute("role", "status");
    radioLoadingStatus.setAttribute("aria-live", "polite");

    radioLoadingStatus.style.fontSize = "13px";
    radioLoadingStatus.style.textAlign = "center";
    radioLoadingStatus.style.marginTop = "5px";
    radioLoadingStatus.style.color = "#facc15";

    startButton.parentElement.insertAdjacentElement(
        "afterend",
        radioLoadingStatus
    );
}

function setRadioLoadingStatus(message) {
    createRadioLoadingStatus();

    if (radioLoadingStatus) {
        radioLoadingStatus.textContent = message;
    }
}

// --------------------------------------------------
// Buttons sperren / freigeben
// --------------------------------------------------

function setRadioControlsEnabled(enabled) {
    radioControlsReady = enabled;

    [
        previousButton,
        startButton,
        nextButton
    ].forEach(function (button) {
        if (!button) return;

        button.disabled = !enabled;
        button.style.opacity = enabled ? "" : "0.55";
        button.style.cursor = enabled ? "" : "wait";
    });

    if (!startButton) return;

    if (!enabled) {
        startButton.textContent = "⏳ Lädt …";
        startButton.setAttribute(
            "aria-label",
            "Radio wird geladen"
        );
        startButton.title = "Radio wird geladen";
    } else {
        updateStartButton(player.getPlayerState());
    }
}

// --------------------------------------------------
// YouTube-API prüfen
// --------------------------------------------------

function isRadioPlayerAvailable() {
    return !!(
        player &&
        typeof player.getPlayerState === "function" &&
        typeof player.playVideo === "function" &&
        typeof player.pauseVideo === "function" &&
        typeof player.getPlaylist === "function" &&
        typeof player.getPlaylistIndex === "function" &&
        typeof player.playVideoAt === "function" &&
        typeof player.cuePlaylist === "function"
    );
}

function getRadioPlaylist() {
    if (!isRadioPlayerAvailable()) {
        return null;
    }

    try {
        const playlist = player.getPlaylist();

        if (
            !Array.isArray(playlist) ||
            playlist.length === 0
        ) {
            return null;
        }

        return playlist;
    } catch (error) {
        return null;
    }
}

// --------------------------------------------------
// Initialisierungstimer
// --------------------------------------------------

function clearRadioInitializationTimers() {
    clearInterval(radioReadyTimer);
    clearTimeout(radioReadyTimeout);
    clearTimeout(radioPositionTimer);

    radioReadyTimer = null;
    radioReadyTimeout = null;
    radioPositionTimer = null;
    radioPositionCorrectionPending = false;
}

// --------------------------------------------------
// Fehlerbehandlung
// --------------------------------------------------

function failRadioInitialization(message) {
    if (radioInitializationFinished) return;

    radioInitializationFailed = true;
    radioInitializationFinished = true;

    clearRadioInitializationTimers();

    playerReady = false;
    setRadioControlsEnabled(false);

    setRadioLoadingStatus(
        "⚠️ Radio konnte nicht geladen werden."
    );

    if (startButton) {
        startButton.textContent = "⚠️ Nicht bereit";
        startButton.title = message;
        startButton.style.cursor = "not-allowed";
    }

    if (previousButton) {
        previousButton.style.cursor = "not-allowed";
    }

    if (nextButton) {
        nextButton.style.cursor = "not-allowed";
    }

    console.error(
        "KanalRadio: Initialisierung fehlgeschlagen:",
        message
    );
}

// --------------------------------------------------
// Erfolgreiche Initialisierung
// --------------------------------------------------

function finishRadioInitialization() {
    if (
        radioInitializationFinished ||
        radioInitializationFailed
    ) {
        return;
    }

    const playlist = getRadioPlaylist();

    if (!playlist) return;

    const actualIndex = player.getPlaylistIndex();

    if (actualIndex !== radioExpectedStartIndex) {
        return;
    }

    radioInitializationFinished = true;

    clearRadioInitializationTimers();

    playerReady = true;
    initialPlaylistPrepared = true;

    pendingSongIndex = actualIndex;
    displayedPlaylistIndex = actualIndex;
    expectedVideoId = playlist[actualIndex];

    setRadioControlsEnabled(true);
    setRadioLoadingStatus("");

    updateVideoTitle();

    console.log(
        "KanalRadio: Radio vollständig bereit.",
        "Startposition:",
        actualIndex + 1,
        "Playlistlänge:",
        playlist.length
    );
}

// --------------------------------------------------
// Playlist und tatsächliches Video prüfen
// --------------------------------------------------

function checkRadioInitialization() {
    if (
        radioInitializationFinished ||
        radioInitializationFailed ||
        !radioPlaylistRequested
    ) {
        return;
    }

    const playlist = getRadioPlaylist();

    if (!playlist) return;

    if (
        radioExpectedStartIndex < 0 ||
        radioExpectedStartIndex >= playlist.length
    ) {
        failRadioInitialization(
            "Ungültige Startposition " +
            (radioExpectedStartIndex + 1) +
            " bei " +
            playlist.length +
            " Songs."
        );
        return;
    }

    let actualIndex;

    try {
        actualIndex = player.getPlaylistIndex();
    } catch (error) {
        return;
    }

    const expectedId =
        playlist[radioExpectedStartIndex];

    let actualId = null;

    try {
        if (typeof player.getVideoData === "function") {
            const videoData = player.getVideoData();

            actualId =
                videoData && videoData.video_id
                    ? videoData.video_id
                    : null;
        }
    } catch (error) {
        return;
    }

    // Die Playlistposition muss stimmen.
    if (actualIndex !== radioExpectedStartIndex) {
        requestRadioPositionCorrection();
        return;
    }

    // Wenn YouTube bereits eine Video-ID meldet,
    // muss auch diese zur Playlistposition passen.
    if (
        actualId &&
        expectedId &&
        actualId !== expectedId
    ) {
        requestRadioPositionCorrection();
        return;
    }

    // Keine Freigabe während einer laufenden Korrektur.
    if (radioPositionCorrectionPending) {
        return;
    }

    // Eine noch fehlende Video-ID kann bedeuten,
    // dass YouTube das Video noch vorbereitet.
    // Bei Startposition 0 ist der bestätigte
    // Playlistindex bereits ein wichtiges Signal.
    // Bei Daily-Startpositionen > 0 warten wir
    // zusätzlich auf die passende Video-ID.
    if (
        radioExpectedStartIndex > 0 &&
        expectedId &&
        !actualId
    ) {
        return;
    }

    finishRadioInitialization();
}

// --------------------------------------------------
// Startposition korrigieren
// --------------------------------------------------

function requestRadioPositionCorrection() {
    if (
        radioPositionCorrectionPending ||
        radioInitializationFinished ||
        radioInitializationFailed
    ) {
        return;
    }

    if (
        radioPositionRetryCount >=
        RADIO_MAX_POSITION_RETRIES
    ) {
        return;
    }

    radioPositionCorrectionPending = true;
    radioPositionRetryCount++;

    console.warn(
        "KanalRadio: Startposition stimmt nicht.",
        "Erwartet:",
        radioExpectedStartIndex + 1,
        "Korrekturversuch:",
        radioPositionRetryCount
    );

    radioPositionTimer = setTimeout(function () {
        if (
            radioInitializationFinished ||
            radioInitializationFailed
        ) {
            radioPositionCorrectionPending = false;
            return;
        }

        const playlist = getRadioPlaylist();

        if (
            !playlist ||
            radioExpectedStartIndex >= playlist.length
        ) {
            radioPositionCorrectionPending = false;
            return;
        }

        try {
            /*
             * WICHTIG:
             * cueVideoAt() existiert nicht in der
             * YouTube-IFrame-API.
             *
             * Stattdessen wird die Playlist mit dem
             * gewünschten Index erneut vorbereitet.
             * cuePlaylist() startet keine Wiedergabe.
             */
            player.cuePlaylist({
                listType: "playlist",
                list: window.radioConfig.playlist,
                index: radioExpectedStartIndex
            });

            console.log(
                "KanalRadio: Playlistposition erneut angefordert:",
                radioExpectedStartIndex + 1
            );

        } catch (error) {
            console.error(
                "KanalRadio: Positionskorrektur fehlgeschlagen:",
                error
            );
        } finally {
            radioPositionCorrectionPending = false;
        }

    }, RADIO_POSITION_RETRY_DELAY);
}

// --------------------------------------------------
// YouTube-Player initialisieren
// --------------------------------------------------

function initializeYouTubePlayer() {
    const config = window.radioConfig;

    if (
        !config ||
        !config.kanal ||
        !config.playlist
    ) {
        console.error(
            "KanalRadio: Konfiguration fehlt."
        );
        return;
    }

    radioControlsReady = false;
    radioInitializationFinished = false;
    radioInitializationFailed = false;
    radioExpectedStartIndex = 0;
    radioPositionRetryCount = 0;
    radioPositionCorrectionPending = false;
    radioPlaylistRequested = false;

    playerReady = false;
    initialPlaylistPrepared = false;

    clearRadioInitializationTimers();

    setRadioControlsEnabled(false);
    setRadioLoadingStatus("Playlist wird geladen …");

    player = new YT.Player("radio", {
        width: "100%",
        height: "100%",

        playerVars: {
            playsinline: 1,
            rel: 0
        },

        events: {
            onReady: async function () {
                console.log(
                    "KanalRadio: YouTube-Player bereit."
                );

                try {
                    await Promise.all([
                        dailyStartPromise,
                        metadataPromise
                    ]);

                    if (radioInitializationFailed) return;

                    radioExpectedStartIndex =
                        isDaily ? dailyStartIndex : 0;

                    if (
                        !Number.isInteger(radioExpectedStartIndex) ||
                        radioExpectedStartIndex < 0
                    ) {
                        radioExpectedStartIndex = 0;
                    }

                    if (
                        isDaily &&
                        playlistMetadata &&
                        Array.isArray(playlistMetadata.songs) &&
                        radioExpectedStartIndex >=
                            playlistMetadata.songs.length
                    ) {
                        console.warn(
                            "KanalRadio Daily: Ungültiger Startsong. " +
                            "Verwende Song 1."
                        );

                        radioExpectedStartIndex = 0;
                        dailyStartIndex = 0;
                    }

                    pendingSongIndex =
                        radioExpectedStartIndex;

                    console.log(
                        "KanalRadio: Playlist vorbereiten.",
                        "Startsong:",
                        radioExpectedStartIndex + 1
                    );

                    player.cuePlaylist({
                        listType: "playlist",
                        list: config.playlist,
                        index: radioExpectedStartIndex
                    });

                    radioPlaylistRequested = true;
                    initialPlaylistPrepared = true;

                    radioReadyTimer = setInterval(
                        checkRadioInitialization,
                        RADIO_READY_INTERVAL
                    );

                    radioReadyTimeout = setTimeout(
                        function () {
                            if (!radioInitializationFinished) {
                                failRadioInitialization(
                                    "YouTube hat Playlist und " +
                                    "Startposition nicht innerhalb " +
                                    "von 20 Sekunden bestätigt."
                                );
                            }
                        },
                        RADIO_READY_TIMEOUT
                    );

                    checkRadioInitialization();

                } catch (error) {
                    failRadioInitialization(
                        error.message || String(error)
                    );
                }
            },

            onStateChange: function (event) {
                console.log(
                    "[KanalRadio] Statuswechsel:",
                    describePlayerState(event.data),
                    "(",
                    event.data,
                    ")"
                );

                if (!radioControlsReady) {
                    checkRadioInitialization();
                }

                if (
                    event.data === YT.PlayerState.PLAYING
                ) {
                    hasPlaybackStarted = true;
                    initialStartRequested = true;

                    adPausedByUs = false;
                    adPlaybackStartedByUs = false;
                }

                if (
                    event.data === YT.PlayerState.ENDED
                ) {
                    adPausedByUs = false;
                    adPlaybackStartedByUs = false;
                    initialStartRequested = false;
                }

                if (radioControlsReady) {
                    updateStartButton(event.data);
                }

                updateVideoTitle();
                trackSongState(event, config);
            },

            onError: function (event) {
                console.warn(
                    "KanalRadio: YouTube-Fehler:",
                    event.data
                );
            }
        }
    });
}

// --------------------------------------------------
// YouTube-Status
// --------------------------------------------------

function describePlayerState(state) {
    const names = {
        [-1]: "UNSTARTED",
        [YT.PlayerState.ENDED]: "ENDED",
        [YT.PlayerState.PLAYING]: "PLAYING",
        [YT.PlayerState.PAUSED]: "PAUSED",
        [YT.PlayerState.BUFFERING]: "BUFFERING",
        [YT.PlayerState.CUED]: "CUED"
    };

    return names[state] || "UNKNOWN";
}

// --------------------------------------------------
// Start / Pause
// --------------------------------------------------

function togglePlayback() {
    if (
        !radioControlsReady ||
        !isRadioPlayerAvailable()
    ) {
        return;
    }

    const before = player.getPlayerState();
    let action;

    console.group(
        "[KanalRadio Diagnose 5] Taste gedrückt"
    );

    console.log(
        "Status vorher:",
        describePlayerState(before),
        "(",
        before,
        ")"
    );

    console.log(
        "Werbung pausiert:",
        adPausedByUs,
        "| Werbung gestartet:",
        adPlaybackStartedByUs,
        "| Start angefordert:",
        initialStartRequested
    );

    if (before === -1) {
        if (adPausedByUs) {
            action = "playVideo";
            player.playVideo();

            adPausedByUs = false;
            adPlaybackStartedByUs = true;
            initialStartRequested = true;

        } else {
            action = "pauseVideo";
            player.pauseVideo();

            adPausedByUs = true;
            adPlaybackStartedByUs = false;
        }

    } else if (
        before === YT.PlayerState.PLAYING
    ) {
        action = "pauseVideo";

        adPausedByUs = false;
        adPlaybackStartedByUs = false;

        player.pauseVideo();

    } else {
        action = "playVideo";

        adPausedByUs = false;
        adPlaybackStartedByUs = false;
        initialStartRequested = true;

        player.playVideo();
    }

    const immediately = player.getPlayerState();

    updateStartButton(immediately);

    console.log(
        "Ausgeführter Befehl:",
        action
    );

    console.log(
        "Status direkt danach:",
        describePlayerState(immediately),
        "(",
        immediately,
        ")"
    );

    console.groupEnd();

    setTimeout(function () {
        if (!radioControlsReady) return;

        const later = player.getPlayerState();

        console.log(
            "[KanalRadio Diagnose 5] 1 Sekunde nach",
            action + ":",
            describePlayerState(later),
            "(",
            later,
            ")"
        );
    }, 1000);
}

// --------------------------------------------------
// Vorheriger / nächster Song
// --------------------------------------------------

function jumpSongs(offset) {
    if (
        !radioControlsReady ||
        !isRadioPlayerAvailable()
    ) {
        return;
    }

    const playlist = getRadioPlaylist();

    if (!playlist) {
        console.warn(
            "KanalRadio: Playlist nicht verfügbar."
        );
        return;
    }

    const currentIndex = player.getPlaylistIndex();

    if (
        !Number.isInteger(currentIndex) ||
        currentIndex < 0 ||
        currentIndex >= playlist.length
    ) {
        console.warn(
            "KanalRadio: Ungültige Playlistposition:",
            currentIndex
        );
        return;
    }

    const targetIndex = Math.max(
        0,
        Math.min(
            playlist.length - 1,
            currentIndex + offset
        )
    );

    if (targetIndex === currentIndex) {
        return;
    }

    adPausedByUs = false;
    adPlaybackStartedByUs = false;
    initialStartRequested = true;

    displayedPlaylistIndex = targetIndex;
    expectedVideoId = playlist[targetIndex];
    pendingSongIndex = targetIndex;

    if (videoTitleElement) {
        const artistElement =
            videoTitleElement.querySelector(
                ".radio-song-artist"
            );

        const songElement =
            videoTitleElement.querySelector(
                ".radio-song-title"
            );

        const positionElement =
            videoTitleElement.querySelector(
                ".radio-song-position"
            );

        if (artistElement) {
            artistElement.textContent = "";
        }

        if (songElement) {
            songElement.textContent = "";
        }

        if (positionElement) {
            positionElement.textContent = "";
        }
    }

    player.playVideoAt(targetIndex);
}

// --------------------------------------------------
// Buttons verbinden
// --------------------------------------------------

if (startButton) {
    startButton.addEventListener(
        "click",
        togglePlayback
    );
}

if (previousButton) {
    previousButton.addEventListener(
        "click",
        function () {
            jumpSongs(-1);
        }
    );
}

if (nextButton) {
    nextButton.addEventListener(
        "click",
        function () {
            jumpSongs(1);
        }
    );
}

// Bis zur bestätigten Initialisierung gesperrt
setRadioControlsEnabled(false);

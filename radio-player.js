
/* Kanal-Radio Amels | radio-player.js | Start-Fix 20.11.2026 */

/*
 * Ablauf:
 * 1. YouTube-Player erstellen
 * 2. Daily-Startposition und Metadaten abwarten
 * 3. Playlist einmalig laden
 * 4. Tatsächliche Playlistposition kontrollieren
 * 5. Erst danach LAST, START/PAUSE und NEXT freigeben
 *
 * Keine vorgemerkten Tastendrücke.
 * Kein automatisches Abspielen beim Seitenaufruf.
 */

const RADIO_READY_INTERVAL = 200;
const RADIO_READY_TIMEOUT = 15000;
const RADIO_POSITION_RETRY_DELAY = 1200;

let radioControlsReady = false;
let radioInitializationFinished = false;
let radioExpectedStartIndex = 0;
let radioReadyTimer = null;
let radioReadyTimeout = null;
let radioPositionTimer = null;
let radioPositionCorrectionRequested = false;
let radioInitializationFailed = false;

// Buttons ermitteln
const previousButton =
    document.getElementById("previous");

const nextButton =
    document.getElementById("next");

// Ladestatus für den Benutzer
let radioLoadingStatus = null;

function createRadioLoadingStatus() {
    if (radioLoadingStatus) {
        return;
    }

    if (!startButton || !startButton.parentElement) {
        return;
    }

    radioLoadingStatus = document.createElement("div");
    radioLoadingStatus.id = "radio-loading-status";

    radioLoadingStatus.setAttribute(
        "role",
        "status"
    );

    radioLoadingStatus.setAttribute(
        "aria-live",
        "polite"
    );

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

// Alle drei Buttons gemeinsam sperren oder freigeben
function setRadioControlsEnabled(enabled) {
    radioControlsReady = enabled;

    const buttons = [
        previousButton,
        startButton,
        nextButton
    ];

    buttons.forEach(function (button) {
        if (!button) {
            return;
        }

        button.disabled = !enabled;

        button.style.opacity =
            enabled ? "" : "0.55";

        button.style.cursor =
            enabled ? "" : "wait";
    });

    if (startButton) {
        if (!enabled) {
            startButton.textContent = "⏳ Lädt …";
            startButton.setAttribute(
                "aria-label",
                "Radio wird geladen"
            );
            startButton.title = "Radio wird geladen";
        } else {
            updateStartButton(
                player.getPlayerState()
            );
        }
    }
}

// Player-API verfügbar?
function isRadioPlayerAvailable() {
    return !!(
        player &&
        typeof player.getPlayerState === "function" &&
        typeof player.playVideo === "function" &&
        typeof player.pauseVideo === "function" &&
        typeof player.getPlaylist === "function" &&
        typeof player.getPlaylistIndex === "function" &&
        typeof player.playVideoAt === "function" &&
        typeof player.cuePlaylist === "function" &&
        typeof player.cueVideoAt === "function"
    );
}

// Tatsächliche Playlist auslesen
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

// Timer der Initialisierung stoppen
function clearRadioInitializationTimers() {
    clearInterval(radioReadyTimer);
    clearTimeout(radioReadyTimeout);
    clearTimeout(radioPositionTimer);

    radioReadyTimer = null;
    radioReadyTimeout = null;
    radioPositionTimer = null;
}

// Fehler beim Laden anzeigen
function failRadioInitialization(message) {
    if (radioInitializationFinished) {
        return;
    }

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

// Initialisierung erfolgreich abschließen
function finishRadioInitialization() {
    if (
        radioInitializationFinished ||
        radioInitializationFailed
    ) {
        return;
    }

    radioInitializationFinished = true;

    clearRadioInitializationTimers();

    playerReady = true;
    initialPlaylistPrepared = true;

    const playlist = getRadioPlaylist();
    const actualIndex = player.getPlaylistIndex();

    pendingSongIndex = actualIndex;

    if (playlist && actualIndex >= 0) {
        displayedPlaylistIndex = actualIndex;
        expectedVideoId = playlist[actualIndex];
    }

    setRadioControlsEnabled(true);
    setRadioLoadingStatus("");

    updateVideoTitle();

    console.log(
        "KanalRadio: Radio vollständig bereit.",
        "Startposition:",
        actualIndex + 1,
        "Playlistlänge:",
        playlist ? playlist.length : 0
    );
}

// Prüfen, ob Playlist und Startposition stimmen
function checkRadioInitialization() {
    if (
        radioInitializationFinished ||
        radioInitializationFailed
    ) {
        return;
    }

    const playlist = getRadioPlaylist();

    if (!playlist) {
        return;
    }

    if (
        radioExpectedStartIndex < 0 ||
        radioExpectedStartIndex >= playlist.length
    ) {
        failRadioInitialization(
            "Ungültige Startposition: " +
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

    // Playlist ist vorhanden und YouTube bestätigt
    // genau die gewünschte Startposition.
    if (actualIndex === radioExpectedStartIndex) {
        // Falls Metadaten vorhanden sind, zusätzlich
        // prüfen, ob das ausgewählte Video stimmt.
        const expectedVideoId =
            playlist[radioExpectedStartIndex];

        let videoData = null;

        try {
            videoData = player.getVideoData();
        } catch (error) {
            // Die Playlistposition ist bereits bekannt.
        }

        const actualVideoId =
            videoData && videoData.video_id
                ? videoData.video_id
                : null;

        // Ein abweichendes Video darf nicht als
        // vollständig initialisiert gelten.
        if (
            actualVideoId &&
            expectedVideoId &&
            actualVideoId !== expectedVideoId
        ) {
            requestRadioPositionCorrection();
            return;
        }

        finishRadioInitialization();
        return;
    }

    // YouTube hat eine andere Position ausgewählt.
    // Einmalig die korrekte Position anfordern.
    requestRadioPositionCorrection();
}

// Startposition ohne Autoplay korrigieren
function requestRadioPositionCorrection() {
    if (
        radioPositionCorrectionRequested ||
        radioInitializationFinished ||
        radioInitializationFailed
    ) {
        return;
    }

    radioPositionCorrectionRequested = true;

    console.warn(
        "KanalRadio: YouTube-Startposition weicht ab.",
        "Erwartet:",
        radioExpectedStartIndex + 1
    );

    radioPositionTimer = setTimeout(function () {
        if (
            radioInitializationFinished ||
            radioInitializationFailed
        ) {
            return;
        }

        const playlist = getRadioPlaylist();

        if (
            !playlist ||
            radioExpectedStartIndex >= playlist.length
        ) {
            return;
        }

        try {
            // cueVideoAt wählt das Video aus,
            // ohne die Wiedergabe automatisch zu starten.
            player.cueVideoAt(radioExpectedStartIndex);

            console.log(
                "KanalRadio: Startposition erneut gesetzt:",
                radioExpectedStartIndex + 1
            );

        } catch (error) {
            console.error(
                "KanalRadio: Positionskorrektur fehlgeschlagen:",
                error
            );
        }
    }, RADIO_POSITION_RETRY_DELAY);
}

// YouTube-Player initialisieren
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
    radioPositionCorrectionRequested = false;
    radioExpectedStartIndex = 0;

    playerReady = false;
    initialPlaylistPrepared = false;

    clearRadioInitializationTimers();

    setRadioControlsEnabled(false);
    setRadioLoadingStatus("Playlist wird geladen …");

    player = new YT.Player("radio", {
        width: "100%",
        height: "100%",

        playerVars: {
            // Playlist NICHT bereits hier laden.
            // Sie wird erst nach den Startdaten gesetzt.
            playsinline: 1,
            rel: 0
        },

        events: {
            onReady: async function () {
                console.log(
                    "KanalRadio: YouTube-Player bereit."
                );

                try {
                    // Zuerst alle benötigten Daten laden
                    await Promise.all([
                        dailyStartPromise,
                        metadataPromise
                    ]);

                    if (radioInitializationFailed) {
                        return;
                    }

                    radioExpectedStartIndex =
                        isDaily ? dailyStartIndex : 0;

                    // Startposition anhand der Metadaten prüfen
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
                        "KanalRadio: Playlist laden.",
                        "Startsong:",
                        radioExpectedStartIndex + 1
                    );

                    // Playlist genau einmal vorbereiten
                    player.cuePlaylist({
                        listType: "playlist",
                        list: config.playlist,
                        index: radioExpectedStartIndex
                    });

                    initialPlaylistPrepared = true;

                    // Ab jetzt prüfen, ob YouTube die
                    // Playlist und Startposition übernommen hat.
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
                                    "von 15 Sekunden bestätigt."
                                );
                            }
                        },
                        RADIO_READY_TIMEOUT
                    );

                    // Auch unmittelbar einmal prüfen
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

                // Statuswechsel können während der
                // Initialisierung auftreten.
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

// YouTube-Status lesbar darstellen
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

// Start / Pause
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
        if (!radioControlsReady) {
            return;
        }

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

// Vorheriger / nächster Song
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

    // Titelinhalte leeren, DOM-Elemente erhalten
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

// Buttons verbinden
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

// Bereits beim Laden sperren.
// Die Freigabe erfolgt ausschließlich nach
// erfolgreicher Playlist-Initialisierung.
setRadioControlsEnabled(false);


/*
 * Kanal-Radio Amels
 * radio-player.js – YouTube-Player
 * 20.11.2026
 *
 * Player und Playlist gehören zusammen.
 * Die Startposition wird nach dem Laden
 * der Daily-Konfiguration eingestellt.
 *
 * LAST, START/PAUSE und NEXT werden
 * erst nach erfolgreicher Initialisierung
 * freigegeben.
 */

const RADIO_READY_TIMEOUT = 20000;
const RADIO_READY_INTERVAL = 250;
const RADIO_RETRY_INTERVAL = 4000;
const RADIO_MAX_RETRIES = 2;

let radioControlsReady = false;
let radioInitializationFinished = false;
let radioInitializationFailed = false;
let radioExpectedStartIndex = 0;
let radioReadyTimer = null;
let radioTimeoutTimer = null;
let radioRetryTimer = null;
let radioRetryCount = 0;
let radioPlaylistRequested = false;

// --------------------------------------------------
// YouTube-Player-API
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

        return (
            Array.isArray(playlist) &&
            playlist.length > 0
        ) ? playlist : null;

    } catch (error) {
        return null;
    }
}

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
// Initialisierung
// --------------------------------------------------

function clearRadioReadyTimers() {
    clearInterval(radioReadyTimer);
    clearTimeout(radioTimeoutTimer);
    clearInterval(radioRetryTimer);

    radioReadyTimer = null;
    radioTimeoutTimer = null;
    radioRetryTimer = null;
}

function failRadioInitialization(message) {
    if (radioInitializationFinished) {
        return;
    }

    radioInitializationFailed = true;
    radioInitializationFinished = true;

    clearRadioReadyTimers();

    playerReady = false;
    radioControlsReady = false;

    setRadioControlsEnabled(false);

    setRadioLoadingStatus(
        "⚠️ Radio konnte nicht geladen werden."
    );

    if (startButton) {
        startButton.textContent = "⚠️ Nicht bereit";
        startButton.title = message;
        startButton.style.cursor = "not-allowed";
    }

    console.error(
        "KanalRadio: Playerstart fehlgeschlagen:",
        message
    );
}

function finishRadioInitialization() {
    if (
        radioInitializationFinished ||
        radioInitializationFailed
    ) {
        return;
    }

    const playlist = getRadioPlaylist();

    if (!playlist) return;

    const index = player.getPlaylistIndex();

    if (index !== radioExpectedStartIndex) {
        return;
    }

    radioInitializationFinished = true;

    clearRadioReadyTimers();

    pendingSongIndex = index;
    displayedPlaylistIndex = index;
    expectedVideoId = playlist[index];

    initialPlaylistPrepared = true;
    playerReady = true;
    radioControlsReady = true;

    setRadioControlsEnabled(true);
    setRadioLoadingStatus("");

    updateVideoTitle();

    console.log(
        "KanalRadio: Player vollständig bereit.",
        "Song:",
        index + 1,
        "von",
        playlist.length
    );
}

// Prüft Playlistposition und ausgewähltes Video.
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
            "Startposition außerhalb der Playlist."
        );
        return;
    }

    let index;
    let videoData;
    let state;

    try {
        index = player.getPlaylistIndex();
        videoData = player.getVideoData();
        state = player.getPlayerState();
    } catch (error) {
        return;
    }

    if (index !== radioExpectedStartIndex) {
        return;
    }

    const expectedId =
        playlist[radioExpectedStartIndex];

    const actualId =
        videoData && videoData.video_id
            ? videoData.video_id
            : null;

    // Eine fremde Video-ID bedeutet:
    // Die Playlistposition ist noch nicht synchron.
    if (
        actualId &&
        expectedId &&
        actualId !== expectedId
    ) {
        return;
    }

    // YouTube muss das gewünschte Video bestätigen.
    // Die reine Positionszahl reicht nicht aus.
    if (!actualId || actualId !== expectedId) {
        return;
    }

    // Die API muss einen gültigen Playerstatus liefern.
    if (
        typeof state !== "number"
    ) {
        return;
    }

    finishRadioInitialization();
}

// Playlist mit gewünschter Startposition vorbereiten
function requestRadioPlaylist() {
    if (
        radioInitializationFinished ||
        radioInitializationFailed ||
        !isRadioPlayerAvailable()
    ) {
        return;
    }

    radioPlaylistRequested = true;

    try {
        player.cuePlaylist({
            listType: "playlist",
            list: radioConfig.playlist,
            index: radioExpectedStartIndex
        });

        initialPlaylistPrepared = true;

        console.log(
            "KanalRadio: Playlist vorbereitet, Song:",
            radioExpectedStartIndex + 1
        );

    } catch (error) {
        console.warn(
            "KanalRadio: Playlistvorbereitung:",
            error
        );
    }
}

function beginRadioReadinessCheck() {
    clearRadioReadyTimers();

    radioReadyTimer = setInterval(
        checkRadioInitialization,
        RADIO_READY_INTERVAL
    );

    // Falls YouTube den ersten Cue-Aufruf
    // nicht vollständig übernommen hat,
    // die Playlist begrenzt erneut vorbereiten.
    radioRetryTimer = setInterval(function () {
        if (
            radioInitializationFinished ||
            radioInitializationFailed
        ) {
            return;
        }

        if (
            radioRetryCount >= RADIO_MAX_RETRIES
        ) {
            return;
        }

        radioRetryCount++;

        console.warn(
            "KanalRadio: Playlist erneut vorbereiten.",
            "Versuch:",
            radioRetryCount
        );

        requestRadioPlaylist();
    }, RADIO_RETRY_INTERVAL);

    radioTimeoutTimer = setTimeout(function () {
        if (!radioInitializationFinished) {
            failRadioInitialization(
                "YouTube hat die gewünschte Playlist " +
                "nicht innerhalb von 20 Sekunden bestätigt."
            );
        }
    }, RADIO_READY_TIMEOUT);

    checkRadioInitialization();
}

// --------------------------------------------------
// YouTube-Player erstellen
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
    radioPlaylistRequested = false;
    radioRetryCount = 0;

    playerReady = false;
    initialPlaylistPrepared = false;

    setRadioControlsEnabled(false);
    setRadioLoadingStatus("Playlist wird geladen …");

    // Wie in der ursprünglichen funktionierenden
    // radio.js wird die Playlist bereits beim
    // Erzeugen des YouTube-Players übergeben.
    player = new YT.Player("radio", {
        width: "100%",
        height: "100%",

        playerVars: {
            listType: "playlist",
            list: config.playlist,
            playsinline: 1,
            rel: 0
        },

        events: {
            onReady: async function () {
                console.log(
                    "KanalRadio: YouTube-API bereit."
                );

                try {
                    // Daily-Start und Metadaten
                    // müssen zuerst bekannt sein.
                    radioExpectedStartIndex =
                        await prepareRadioStartData();

                    if (
                        radioInitializationFailed
                    ) {
                        return;
                    }

                    console.log(
                        "KanalRadio: Gewünschter Startsong:",
                        radioExpectedStartIndex + 1
                    );

                    // Playlist ohne Autoplay
                    // auf die Startposition setzen.
                    requestRadioPlaylist();

                    // Erst anschließend tatsächliche
                    // Bereitschaft prüfen.
                    beginRadioReadinessCheck();

                } catch (error) {
                    failRadioInitialization(
                        error.message || String(error)
                    );
                }
            },

            onStateChange: function (event) {
                console.log(
                    "[KanalRadio] Status:",
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

                // Bestehendes Umami-Tracking
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
// START / PAUSE
// Bestehende Werbesteuerung beibehalten
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
        "[KanalRadio] Start/Pause"
    );

    console.log(
        "Status vorher:",
        describePlayerState(before)
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

    const immediately =
        player.getPlayerState();

    updateStartButton(immediately);

    console.log(
        "Befehl:",
        action,
        "Status danach:",
        describePlayerState(immediately)
    );

    console.groupEnd();

    setTimeout(function () {
        if (
            !radioControlsReady ||
            !isRadioPlayerAvailable()
        ) {
            return;
        }

        console.log(
            "[KanalRadio] Status nach 1 Sekunde:",
            describePlayerState(
                player.getPlayerState()
            )
        );
    }, 1000);
}

// --------------------------------------------------
// LAST / NEXT
// --------------------------------------------------

function jumpSongs(offset) {
    if (
        !radioControlsReady ||
        !isRadioPlayerAvailable()
    ) {
        return;
    }

    if (
        !Number.isInteger(offset) ||
        offset === 0
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

    const currentIndex =
        player.getPlaylistIndex();

    if (
        !Number.isInteger(currentIndex) ||
        currentIndex < 0 ||
        currentIndex >= playlist.length
    ) {
        console.warn(
            "KanalRadio: Ungültige Position:",
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

    // Alten Titel entfernen, bis YouTube
    // das neue Video bestätigt hat.
    clearRadioVideoTitle();

    console.log(
        "KanalRadio: Songwechsel",
        currentIndex + 1,
        "→",
        targetIndex + 1
    );

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

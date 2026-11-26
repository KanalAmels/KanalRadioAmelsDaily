
/*
 * Kanal-Radio Amels
 * radio-player.js – YouTube-Player
 * 26.11.2026
 *
 * Player und Playlist gehören zusammen.
 * Die Startposition wird nach dem Laden
 * der Daily-Konfiguration eingestellt.
 *
 * LAST, START/PAUSE und NEXT werden
 * erst nach erfolgreicher Initialisierung
 * freigegeben.
 *
 * LAST/NEXT: Zyklische Playlist-Navigation.
 *
 * Daily:
 * Nur die ersten "max" Songs werden geladen.
 * Die Wiedergabe startet bei "startSong".
 * Nicht freigegebene Songs werden nicht geladen.
 *
 * Untertitel:
 * Standardmäßig nicht anfordern.
 * Persönliche YouTube-Einstellungen können
 * das Verhalten weiterhin beeinflussen.
 *
 * Jahrzehntsender bleiben unverändert.
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

// Die tatsächlich freigegebene Daily-Playlist
let radioDailyVideoIds = null;

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
// Daily-Playlist vorbereiten
// --------------------------------------------------

function prepareDailyVideoIds() {
    if (!isDaily) {
        radioDailyVideoIds = null;
        return;
    }

    if (
        !playlistMetadata ||
        !Array.isArray(playlistMetadata.songs)
    ) {
        throw new Error(
            "Daily-Metadaten fehlen. " +
            "Bitte Update Playlist Counts ausführen."
        );
    }

    if (
        !Number.isSafeInteger(dailyMaxSongs) ||
        dailyMaxSongs < 1
    ) {
        throw new Error(
            "Daily: Ungültiger max-Wert."
        );
    }

    const songs = playlistMetadata.songs.slice(
        0,
        dailyMaxSongs
    );

    if (songs.length === 0) {
        throw new Error(
            "Daily: Keine freigegebenen Songs vorhanden."
        );
    }

    const videoIds = songs.map(function (song) {
        return song && song.videoId;
    });

    const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

    if (
        videoIds.some(function (id) {
            return (
                typeof id !== "string" ||
                !videoIdPattern.test(id)
            );
        })
    ) {
        throw new Error(
            "Daily: Mindestens eine Video-ID fehlt " +
            "oder ist ungültig."
        );
    }

    radioDailyVideoIds = videoIds;

    if (
        radioExpectedStartIndex < 0 ||
        radioExpectedStartIndex >= radioDailyVideoIds.length
    ) {
        throw new Error(
            "Daily: Startsong liegt außerhalb " +
            "der freigegebenen Playlist."
        );
    }

    console.log(
        "KanalRadio Daily:",
        radioDailyVideoIds.length,
        "Songs freigegeben."
    );

    console.log(
        "KanalRadio Daily: Start mit Song",
        radioExpectedStartIndex + 1
    );
}

function isExpectedDailyPlaylist(playlist) {
    if (!isDaily) {
        return true;
    }

    if (
        !Array.isArray(radioDailyVideoIds) ||
        !Array.isArray(playlist)
    ) {
        return false;
    }

    if (
        playlist.length !== radioDailyVideoIds.length
    ) {
        return false;
    }

    return playlist.every(function (videoId, index) {
        return videoId === radioDailyVideoIds[index];
    });
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

    if (!isExpectedDailyPlaylist(playlist)) {
        return;
    }

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

    // Daily soll innerhalb der freigegebenen
    // Songs automatisch wieder von vorne beginnen.
    if (
        isDaily &&
        typeof player.setLoop === "function"
    ) {
        player.setLoop(true);
    }

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

    // Bei Daily muss die tatsächlich geladene
    // Playlist exakt der Freigabeliste entsprechen.
    if (!isExpectedDailyPlaylist(playlist)) {
        return;
    }

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

    if (
        actualId &&
        expectedId &&
        actualId !== expectedId
    ) {
        return;
    }

    if (!actualId || actualId !== expectedId) {
        return;
    }

    if (typeof state !== "number") {
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
        if (isDaily) {
            // Daily: Nur freigegebene Video-IDs
            // an YouTube übergeben.
            player.cuePlaylist({
                playlist: radioDailyVideoIds,
                index: radioExpectedStartIndex,
                startSeconds: 0
            });

        } else {
            // Jahrzehntsender: Bisherige
            // Playliststeuerung unverändert.
            player.cuePlaylist({
                listType: "playlist",
                list: radioConfig.playlist,
                index: radioExpectedStartIndex
            });
        }

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
    radioDailyVideoIds = null;

    setRadioControlsEnabled(false);
    setRadioLoadingStatus("Playlist wird geladen …");

    // Bei Daily wird zunächst keine vollständige
    // YouTube-Playlist geladen. Die freigegebene
    // Playlist folgt erst nach dem Lesen der JSON.
    //
    // Untertitel:
    // cc_load_policy = 0 fordert keine Untertitel an.
    // Dies entspricht dem YouTube-Standard.
    // Nutzereinstellungen können Untertitel
    // weiterhin automatisch einschalten.
    const playerVars = {
        playsinline: 1,
        rel: 0,
        cc_load_policy: 0
    };

    if (!isDaily) {
        playerVars.listType = "playlist";
        playerVars.list = config.playlist;
    }

    player = new YT.Player("radio", {
        width: "100%",
        height: "100%",

        playerVars: playerVars,

        events: {
            onReady: async function () {
                console.log(
                    "KanalRadio: YouTube-API bereit."
                );

                try {
                    radioExpectedStartIndex =
                        await prepareRadioStartData();

                    if (radioInitializationFailed) {
                        return;
                    }

                    // Nur Daily:
                    // Freigegebene Songs zusammenstellen.
                    prepareDailyVideoIds();

                    console.log(
                        "KanalRadio: Gewünschter Startsong:",
                        radioExpectedStartIndex + 1
                    );

                    requestRadioPlaylist();
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

    console.group("[KanalRadio] Start/Pause");

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

    const immediately = player.getPlayerState();

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
// LAST / NEXT – ZYKLISCHE NAVIGATION
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

    // Bei Daily nur Navigation innerhalb
    // der freigegebenen Songs erlauben.
    if (
        isDaily &&
        !isExpectedDailyPlaylist(playlist)
    ) {
        console.warn(
            "KanalRadio Daily: Playlist stimmt " +
            "nicht mit der Freigabeliste überein."
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
            "KanalRadio: Ungültige Position:",
            currentIndex
        );
        return;
    }

    // Zyklischer Übergang
    // 12/12 + NEXT -> 1/12
    // 1/12 + LAST -> 12/12
    const targetIndex =
        (
            (
                currentIndex + offset
            ) % playlist.length +
            playlist.length
        ) % playlist.length;

    if (targetIndex === currentIndex) {
        return;
    }

    adPausedByUs = false;
    adPlaybackStartedByUs = false;
    initialStartRequested = true;

    displayedPlaylistIndex = targetIndex;
    expectedVideoId = playlist[targetIndex];
    pendingSongIndex = targetIndex;

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

/* Kanal-Radio Amels | radio-player.js | Modulare Version 19.11.2026 */

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
                // Erst Startposition und Metadaten laden.
                // So können wir auch prüfen, ob die
                // gewünschte Daily-Songnummer existiert.
                await Promise.all([
                    dailyStartPromise,
                    metadataPromise
                ]);

                if (
                    isDaily &&
                    playlistMetadata &&
                    Array.isArray(playlistMetadata.songs) &&
                    dailyStartIndex >= playlistMetadata.songs.length
                ) {
                    console.warn(
                        "KanalRadio Daily: Ungültiger Startsong. " +
                        "Verwende Song 1."
                    );

                    dailyStartIndex = 0;
                }

                pendingSongIndex = dailyStartIndex;

                // Playlist ohne Autoplay vorbereiten
                player.cuePlaylist({
                    listType: "playlist",
                    list: config.playlist,
                    index: dailyStartIndex
                });

                initialPlaylistPrepared = true;
                playerReady = true;

                updateStartButton(
                    player.getPlayerState()
                );

                updateVideoTitle();
            },

            onStateChange: function (event) {
                console.log(
                    "[KanalRadio Diagnose 5] Statuswechsel:",
                    describePlayerState(event.data),
                    "(",
                    event.data,
                    ")"
                );

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

                updateStartButton(event.data);
                updateVideoTitle();

                trackSongState(event, config);

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
    if (!playerReady) {
        alert(
            "Der Player lädt noch. Bitte erneut versuchen."
        );
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
        if (!playerReady) return;

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
    if (!playerReady) {
        alert(
            "Der Player lädt noch. Bitte erneut versuchen."
        );
        return;
    }

    const playlist = player.getPlaylist();
    const currentIndex = player.getPlaylistIndex();

    if (
        !playlist ||
        playlist.length === 0 ||
        currentIndex < 0
    ) {
        alert(
            "Die Playlist ist noch nicht bereit."
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
        const artistElement = videoTitleElement.querySelector(
            ".radio-song-artist"
        );
        const songElement = videoTitleElement.querySelector(
            ".radio-song-title"
        );
        const positionElement = videoTitleElement.querySelector(
            ".radio-song-position"
        );

        if (artistElement) artistElement.textContent = "";
        if (songElement) songElement.textContent = "";
        if (positionElement) positionElement.textContent = "";
    }

    player.playVideoAt(targetIndex);
}

// Buttons verbinden
if (startButton) {
    startButton.addEventListener(
        "click",
        togglePlayback
    );

    startButton.textContent = "⏯️ Start";
    startButton.setAttribute(
        "aria-label",
        "Start"
    );
    startButton.title = "Start";
}

const previousButton =
    document.getElementById("previous");

const nextButton =
    document.getElementById("next");

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

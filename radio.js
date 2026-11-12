
/*
 * Kanal-Radio Amels
 * Zentrale Radiosteuerung und Songstatistik
 *
 * Experiment 3:
 * Werbung über unseren Start-/Pause-Button
 * pausieren UND wieder starten.
 */

let player;
let playerReady = false;
let lastTrackedVideoId = null;
let hasPlaybackStarted = false;

// Merkt sich, ob wir die Werbung pausiert haben.
let adPausedByUs = false;

const startButton = document.getElementById("start");

// Start-/Pause-Button aktualisieren
function updateStartButton(state) {
    if (!startButton) return;

    if (state === YT.PlayerState.PLAYING) {
        startButton.textContent = "⏸️ Pause";
        startButton.setAttribute("aria-label", "Pause");
        startButton.title = "Pause";

    } else if (
        state === YT.PlayerState.PAUSED ||
        state === YT.PlayerState.ENDED
    ) {
        startButton.textContent = "▶️ Start";
        startButton.setAttribute("aria-label", "Start");
        startButton.title = "Start";

    } else if (state === -1 && adPausedByUs) {
        // Werbung wurde über unseren Button pausiert.
        startButton.textContent = "▶️ Start";
        startButton.setAttribute("aria-label", "Start");
        startButton.title = "Start";

    } else if (!hasPlaybackStarted) {
        startButton.textContent = "⏯️ Start";
        startButton.setAttribute("aria-label", "Start");
        startButton.title = "Start";
    }
}

// YouTube-Player initialisieren
function onYouTubeIframeAPIReady() {
    const config = window.radioConfig;

    if (!config || !config.kanal || !config.playlist) {
        console.error("KanalRadio: Konfiguration fehlt.");
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
            onReady: function () {
                playerReady = true;
                updateStartButton(player.getPlayerState());
            },

            onStateChange: function (event) {
                console.log(
                    "[KanalRadio Diagnose] Statuswechsel:",
                    describePlayerState(event.data),
                    "(", event.data, ")"
                );

                if (event.data === YT.PlayerState.PLAYING) {
                    hasPlaybackStarted = true;

                    // Normale Wiedergabe läuft.
                    // Die Werbe-Pausenmarkierung zurücksetzen.
                    adPausedByUs = false;
                }

                if (event.data === YT.PlayerState.ENDED) {
                    adPausedByUs = false;
                }

                updateStartButton(event.data);

                // Songstart an Umami melden
                if (event.data === YT.PlayerState.PLAYING) {
                    const video = event.target.getVideoData();

                    if (
                        video.video_id &&
                        video.video_id !== lastTrackedVideoId
                    ) {
                        lastTrackedVideoId = video.video_id;

                        if (typeof window.umami !== "undefined") {
                            window.umami.track("song_start", {
                                kanal: config.kanal,
                                video_id: video.video_id,
                                titel: video.title
                            });
                        }
                    }
                }

                // Nach vollständigem Songende darf
                // derselbe Song erneut gezählt werden.
                if (event.data === YT.PlayerState.ENDED) {
                    lastTrackedVideoId = null;
                }
            }
        }
    });
}

// Numerischen YouTube-Status lesbar darstellen
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
        alert("Der Player lädt noch. Bitte erneut versuchen.");
        return;
    }

    const before = player.getPlayerState();
    let action;

    console.group(
        "[KanalRadio Diagnose 3] Taste gedrückt"
    );

    console.log(
        "Status vorher:",
        describePlayerState(before),
        "(", before, ")"
    );

    console.log(
        "Werbung von uns pausiert:",
        adPausedByUs
    );

    if (before === -1) {
        // EXPERIMENT 3:
        // YouTube meldet UNSTARTED während Werbung.
        // Wir wechseln mit unserer booleschen Variable
        // zwischen Pause und Start.

        if (adPausedByUs) {
            action = "playVideo";

            console.log(
                "TEST: Werbung über eigenen Button fortsetzen"
            );

            player.playVideo();
            adPausedByUs = false;

        } else {
            action = "pauseVideo";

            console.log(
                "TEST: Werbung über eigenen Button pausieren"
            );

            player.pauseVideo();
            adPausedByUs = true;
        }

    } else if (before === YT.PlayerState.PLAYING) {
        // Normales Video pausieren
        action = "pauseVideo";
        adPausedByUs = false;
        player.pauseVideo();

    } else {
        // Normales Video starten oder fortsetzen
        action = "playVideo";
        adPausedByUs = false;
        player.playVideo();
    }

    // Button nach unserer Aktion aktualisieren
    updateStartButton(player.getPlayerState());

    const immediately = player.getPlayerState();

    console.log("Ausgeführter Befehl:", action);

    console.log(
        "Status direkt danach:",
        describePlayerState(immediately),
        "(", immediately, ")"
    );

    console.log(
        "Werbung von uns pausiert:",
        adPausedByUs
    );

    console.groupEnd();

    // Kontrollmessung nach einer Sekunde
    setTimeout(function () {
        if (!playerReady) return;

        const later = player.getPlayerState();

        console.log(
            "[KanalRadio Diagnose 3] 1 Sekunde nach",
            action + ":",
            describePlayerState(later),
            "(", later, ")",
            "| adPausedByUs:",
            adPausedByUs
        );
    }, 1000);
}

// Einen Song vor oder zurück
function jumpSongs(offset) {
    if (!playerReady) {
        alert("Der Player lädt noch. Bitte erneut versuchen.");
        return;
    }

    const playlist = player.getPlaylist();
    const currentIndex = player.getPlaylistIndex();

    if (
        !playlist ||
        playlist.length === 0 ||
        currentIndex < 0
    ) {
        alert("Die Playlist ist noch nicht bereit.");
        return;
    }

    const targetIndex = Math.max(
        0,
        Math.min(playlist.length - 1, currentIndex + offset)
    );

    if (targetIndex === currentIndex) {
        return;
    }

    // Beim Songwechsel Werbemarkierung zurücksetzen
    adPausedByUs = false;

    player.playVideoAt(targetIndex);
}

// Drei Buttons verbinden
if (startButton) {
    startButton.addEventListener("click", togglePlayback);

    startButton.textContent = "⏯️ Start";
    startButton.setAttribute("aria-label", "Start");
    startButton.title = "Start";
}

const previousButton = document.getElementById("previous");
const nextButton = document.getElementById("next");

if (previousButton) {
    previousButton.addEventListener("click", function () {
        jumpSongs(-1);
    });
}

if (nextButton) {
    nextButton.addEventListener("click", function () {
        jumpSongs(1);
    });
}

// Coverbild bei jedem Seitenaufruf frisch laden
const cover = document.querySelector(".cover");

if (cover) {
    const coverUrl = cover.getAttribute("src");

    if (coverUrl) {
        cover.src = coverUrl.split("?")[0] + "?t=" + Date.now();
    }
}

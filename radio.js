/*
 * Kanal-Radio Amels
 * Zentrale Radiosteuerung und Songstatistik
 * Experiment 2: pauseVideo() auch bei UNSTARTED testen.
 */

let player;
let playerReady = false;
let lastTrackedVideoId = null;
let hasPlaybackStarted = false;

const startButton = document.getElementById("start");

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
    } else if (!hasPlaybackStarted) {
        startButton.textContent = "⏯️ Start";
        startButton.setAttribute("aria-label", "Start");
        startButton.title = "Start";
    }
}

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
                }

                updateStartButton(event.data);

                if (event.data === YT.PlayerState.PLAYING) {
                    const video = event.target.getVideoData();

                    if (video.video_id && video.video_id !== lastTrackedVideoId) {
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

                if (event.data === YT.PlayerState.ENDED) {
                    lastTrackedVideoId = null;
                }
            }
        }
    });
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

function togglePlayback() {
    if (!playerReady) {
        alert("Der Player lädt noch. Bitte erneut versuchen.");
        return;
    }

    const before = player.getPlayerState();
    const shouldPause =
        before === YT.PlayerState.PLAYING ||
        before === YT.PlayerState.UNSTARTED;
    const action = shouldPause ? "pauseVideo" : "playVideo";

    console.group("[KanalRadio Diagnose 2] Taste gedrückt:", action);
    console.log("Vorher:", describePlayerState(before), "(", before, ")");

    if (before === YT.PlayerState.UNSTARTED) {
        console.log("TEST: Pausenbefehl trotz UNSTARTED");
    }

    if (shouldPause) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }

    const immediately = player.getPlayerState();
    console.log(
        "Direkt danach:",
        describePlayerState(immediately),
        "(", immediately, ")"
    );
    console.groupEnd();

    setTimeout(function () {
        if (!playerReady) return;
        const later = player.getPlayerState();
        console.log(
            "[KanalRadio Diagnose 2] 1 Sekunde nach", action + ":",
            describePlayerState(later), "(", later, ")"
        );
    }, 1000);
}

function jumpSongs(offset) {
    if (!playerReady) {
        alert("Der Player lädt noch. Bitte erneut versuchen.");
        return;
    }

    const playlist = player.getPlaylist();
    const currentIndex = player.getPlaylistIndex();

    if (!playlist || playlist.length === 0 || currentIndex < 0) {
        alert("Die Playlist ist noch nicht bereit.");
        return;
    }

    const targetIndex = Math.max(
        0,
        Math.min(playlist.length - 1, currentIndex + offset)
    );

    if (targetIndex === currentIndex) return;
    player.playVideoAt(targetIndex);
}

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

const cover = document.querySelector(".cover");
if (cover) {
    const coverUrl = cover.getAttribute("src");
    if (coverUrl) {
        cover.src = coverUrl.split("?")[0] + "?t=" + Date.now();
    }
}


/*
 * Kanal-Radio Amels
 * Zentrale Radiosteuerung und Songstatistik
 *
 * Version 5:
 * - Werbung pausieren und fortsetzen
 * - Buttonanzeige passend umschalten
 * - Beim ersten Startklick sofort "Pause" anzeigen
 */

let player;
let playerReady = false;
let lastTrackedVideoId = null;
let hasPlaybackStarted = false;

// Zustand unserer Werbesteuerung
let adPausedByUs = false;
let adPlaybackStartedByUs = false;

// Merkt sich den ersten Startklick
let initialStartRequested = false;

// Songtitel und Künstlernamen für alle Sender zentral aufbereiten
const radioPlayerContainer = document.querySelector(".player");
let videoTitleElement = null;

if (radioPlayerContainer) {
    videoTitleElement = document.createElement("div");
    videoTitleElement.id = "radio-video-title";
    videoTitleElement.setAttribute("aria-live", "polite");
    videoTitleElement.style.cssText =
        "text-align:center;max-width:100%;margin:12px auto 16px;" +
        "padding:0 12px;color:inherit;font-weight:600;" +
        "overflow-wrap:anywhere;";
    radioPlayerContainer.insertAdjacentElement("afterend", videoTitleElement);
}

// Die Datei ist optional: Ohne artists.json bleiben die YouTube-Namen erhalten.
let artistCorrections = {};
fetch("artists.json")
    .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
    })
    .then(function (data) {
        if (data && typeof data === "object" && !Array.isArray(data)) {
            artistCorrections = data;
            updateVideoTitle();
        }
    })
    .catch(function () {
        // Keine Korrekturliste vorhanden: Das Radio funktioniert trotzdem.
    });

function cleanArtistName(author) {
    if (!author) return "";
    return author.trim()
        .replace(/\s*[-–—]\s*(Topic|Topik|Thema)\s*$/i, "")
        .trim();
}

function normalizeArtistName(value) {
    return value.normalize("NFKC").toLocaleLowerCase()
        .replace(/\s+/g, " ").trim();
}

function correctArtistName(author) {
    const cleaned = cleanArtistName(author);
    const key = Object.keys(artistCorrections).find(function (name) {
        return normalizeArtistName(name) === normalizeArtistName(cleaned);
    });
    return key && typeof artistCorrections[key] === "string"
        ? artistCorrections[key].trim() || cleaned
        : cleaned;
}

// Klammerzusätze nur behalten, wenn "Mix" oder "Live" als Wort vorkommt.
function cleanSongTitle(title) {
    return title
        .replace(/\([^()]*\)|\[[^\[\]]*\]/g, function (part) {
            return /\b(mix|live)\b/i.test(part) ? part : " ";
        })
        .replace(/\s{2,}/g, " ")
        .trim();
}

function formatVideoTitle(video) {
    if (!video || !video.title) return "";

    const title = cleanSongTitle(video.title.trim());
    const artist = correctArtistName(video.author);
    if (!artist) return title;

    // Künstler steht bereits im Titel: keine doppelte Nennung.
    const normalizedTitle = normalizeArtistName(title);
    const normalizedArtist = normalizeArtistName(artist);
    const position = normalizedTitle.indexOf(normalizedArtist);
    if (position !== -1) {
        const before = normalizedTitle.slice(0, position);
        const after = normalizedTitle.slice(position + normalizedArtist.length);
        const beforeBoundary = before === "" || !/[\p{L}\p{N}]$/u.test(before);
        const afterBoundary = after === "" || !/^[\p{L}\p{N}]/u.test(after);
        if (beforeBoundary && afterBoundary) return title;
    }

    return artist + " – " + title;
}

// Bei einem Songwechsel den alten Titel nicht erneut anzeigen.
let displayedPlaylistIndex = null;
let expectedVideoId = null;

function updateVideoTitle() {
    if (!videoTitleElement || !playerReady || !player) return;

    const playlist = player.getPlaylist();
    const playlistIndex = player.getPlaylistIndex();
    const video = player.getVideoData();

    if (playlist && playlistIndex >= 0 && playlistIndex < playlist.length) {
        if (playlistIndex !== displayedPlaylistIndex) {
            displayedPlaylistIndex = playlistIndex;
            expectedVideoId = playlist[playlistIndex];
            videoTitleElement.textContent = "";
        }
    }

    if (!video || !video.title || !video.video_id) return;
    if (expectedVideoId && video.video_id !== expectedVideoId) return;

    const formatted = formatVideoTitle(video);
    if (videoTitleElement.textContent !== formatted) {
        videoTitleElement.textContent = formatted;
    }
}

// Auch bei UNSTARTED/BUFFERING und während der Werbung nachsehen.
// YouTube liefert den Musiktitel nicht in jeder Werbephase zuverlässig.
const videoTitleCheck = setInterval(updateVideoTitle, 1000);

const startButton = document.getElementById("start");

// Start-/Pause-Button aktualisieren
function updateStartButton(state) {
    if (!startButton) return;

    let label;
    let symbol;

    if (state === -1) {
        // YouTube meldet UNSTARTED.
        // Unsere eigenen Aktionen bestimmen die Anzeige.
        if (adPausedByUs) {
            label = "Start";
            symbol = "▶️";
        } else if (
            adPlaybackStartedByUs ||
            initialStartRequested
        ) {
            label = "Pause";
            symbol = "⏸️";
        } else {
            label = "Start";
            symbol = "⏯️";
        }

    } else if (state === YT.PlayerState.PLAYING) {
        label = "Pause";
        symbol = "⏸️";

    } else if (
        state === YT.PlayerState.PAUSED ||
        state === YT.PlayerState.ENDED
    ) {
        label = "Start";
        symbol = "▶️";

    } else if (!hasPlaybackStarted && initialStartRequested) {
        // Auch während CUED oder BUFFERING
        // nach dem Startklick Pause anzeigen.
        label = "Pause";
        symbol = "⏸️";

    } else if (!hasPlaybackStarted) {
        label = "Start";
        symbol = "⏯️";

    } else {
        return;
    }

    startButton.textContent = symbol + " " + label;
    startButton.setAttribute("aria-label", label);
    startButton.title = label;
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
                updateVideoTitle();
            },

            onStateChange: function (event) {
                console.log(
                    "[KanalRadio Diagnose 5] Statuswechsel:",
                    describePlayerState(event.data),
                    "(", event.data, ")"
                );

                if (event.data === YT.PlayerState.PLAYING) {
                    hasPlaybackStarted = true;
                    initialStartRequested = true;

                    adPausedByUs = false;
                    adPlaybackStartedByUs = false;
                }

                if (event.data === YT.PlayerState.ENDED) {
                    adPausedByUs = false;
                    adPlaybackStartedByUs = false;
                    initialStartRequested = false;
                }

                updateStartButton(event.data);

                // Titelanzeige bei jedem Statuswechsel prüfen, auch bei Werbung.
                updateVideoTitle();

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
        "[KanalRadio Diagnose 5] Taste gedrückt"
    );

    console.log(
        "Status vorher:",
        describePlayerState(before),
        "(", before, ")"
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
            // Werbung fortsetzen
            action = "playVideo";

            player.playVideo();

            adPausedByUs = false;
            adPlaybackStartedByUs = true;
            initialStartRequested = true;

        } else {
            // Werbung pausieren
            action = "pauseVideo";

            player.pauseVideo();

            adPausedByUs = true;
            adPlaybackStartedByUs = false;
        }

    } else if (before === YT.PlayerState.PLAYING) {
        // Normales Video pausieren
        action = "pauseVideo";

        adPausedByUs = false;
        adPlaybackStartedByUs = false;

        player.pauseVideo();

    } else {
        // Normales Video starten oder fortsetzen
        action = "playVideo";

        adPausedByUs = false;
        adPlaybackStartedByUs = false;
        initialStartRequested = true;

        player.playVideo();
    }

    const immediately = player.getPlayerState();

    // Anzeige sofort nach dem Tastendruck aktualisieren
    updateStartButton(immediately);

    console.log("Ausgeführter Befehl:", action);

    console.log(
        "Status direkt danach:",
        describePlayerState(immediately),
        "(", immediately, ")"
    );

    console.groupEnd();

    setTimeout(function () {
        if (!playerReady) return;

        const later = player.getPlayerState();

        console.log(
            "[KanalRadio Diagnose 5] 1 Sekunde nach",
            action + ":",
            describePlayerState(later),
            "(", later, ")"
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

    adPausedByUs = false;
    adPlaybackStartedByUs = false;
    initialStartRequested = true;

    // Erst den Titel des gewählten Videos anzeigen, nicht den alten.
    displayedPlaylistIndex = targetIndex;
    expectedVideoId = playlist[targetIndex];
    if (videoTitleElement) videoTitleElement.textContent = "";

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

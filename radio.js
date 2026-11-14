
/*
 * Kanal-Radio Amels
 * Zentrale Radiosteuerung und Songstatistik
 *
 * Version 5:
 * - Werbung pausieren und fortsetzen
 * - Buttonanzeige passend umschalten
 * - Beim ersten Startklick sofort "Pause" anzeigen
 *
 * Erweiterung Titelanzeige:
 * - Original-YouTube-Titel unter dem Player
 * - Titelprüfung auch während der Werbung
 * - Playlist-Wechsel automatisch erkennen
 * - Veraltete Songtitel vermeiden
 * - YouTube-Kanalname als Interpret ergänzen
 * - Topic / Topik / Thema entfernen
 * - Doppelte Interpretennamen vermeiden
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

// --------------------------------------------------
// TITELANZEIGE
// --------------------------------------------------

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

    radioPlayerContainer.insertAdjacentElement(
        "afterend",
        videoTitleElement
    );
}

// Zuletzt erkannte Playlist-Position und Video-ID
let displayedPlaylistIndex = null;
let displayedVideoId = null;

// Nach einem Wechsel auf diese Video-ID warten
let expectedVideoId = null;

// --------------------------------------------------
// INTERPRET UND TITEL AUFBEREITEN
// --------------------------------------------------

function cleanArtistName(author) {
    if (!author) {
        return "";
    }

    let artist = author.trim();

    // Zusätze offizieller YouTube-Musikkanäle entfernen
    artist = artist.replace(
        /\s*[-–—]\s*(Topic|Topik|Thema)\s*$/i,
        ""
    );

    return artist.trim();
}

function normalizeArtistName(value) {
    return value
        .normalize("NFKC")
        .toLocaleLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function formatVideoTitle(video) {
    if (!video || !video.title) {
        return "";
    }

    const title = video.title.trim();
    const artist = cleanArtistName(video.author);

    // Kein Kanalname verfügbar:
    // Originaltitel unverändert anzeigen
    if (!artist) {
        return title;
    }

    const normalizedTitle = normalizeArtistName(title);
    const normalizedArtist = normalizeArtistName(artist);

    // Interpret steht bereits im Videotitel.
    // Wir prüfen auf einen vollständigen Namen,
    // nicht nur auf einen zufälligen Wortbestandteil.
    const artistPosition = normalizedTitle.indexOf(
        normalizedArtist
    );

    if (artistPosition !== -1) {
        const before = normalizedTitle.slice(
            0,
            artistPosition
        );

        const after = normalizedTitle.slice(
            artistPosition + normalizedArtist.length
        );

        const beforeIsBoundary =
            before === "" ||
            !/[\p{L}\p{N}]$/u.test(before);

        const afterIsBoundary =
            after === "" ||
            !/^[\p{L}\p{N}]/u.test(after);

        if (beforeIsBoundary && afterIsBoundary) {
            return title;
        }
    }

    // Interpret fehlt im Titel:
    // Kanalname voranstellen
    return artist + " – " + title;
}

// --------------------------------------------------
// TITELANZEIGE AKTUALISIEREN
// --------------------------------------------------

function clearVideoTitle() {
    if (videoTitleElement) {
        videoTitleElement.textContent = "";
    }

    displayedVideoId = null;
}

function updateVideoTitle() {
    if (!videoTitleElement || !playerReady || !player) {
        return;
    }

    const playlist = player.getPlaylist();
    const playlistIndex = player.getPlaylistIndex();

    const video = player.getVideoData();

    // Automatischen Playlist-Wechsel erkennen
    if (
        playlistIndex >= 0 &&
        displayedPlaylistIndex !== null &&
        playlistIndex !== displayedPlaylistIndex
    ) {
        clearVideoTitle();

        if (
            playlist &&
            playlistIndex < playlist.length
        ) {
            expectedVideoId = playlist[playlistIndex];
        }
    }

    if (playlistIndex >= 0) {
        displayedPlaylistIndex = playlistIndex;
    }

    // Bei bekanntem Playlist-Eintrag prüfen,
    // ob YouTube bereits die passenden Videodaten liefert.
    if (
        playlist &&
        playlistIndex >= 0 &&
        playlistIndex < playlist.length
    ) {
        const playlistVideoId = playlist[playlistIndex];

        if (
            expectedVideoId === null &&
            displayedVideoId !== playlistVideoId
        ) {
            expectedVideoId = playlistVideoId;
        }
    }

    if (!video || !video.title || !video.video_id) {
        return;
    }

    // Keine alten Videodaten anzeigen
    if (
        expectedVideoId !== null &&
        video.video_id !== expectedVideoId
    ) {
        return;
    }

    // Titel erst anzeigen, wenn Video-ID passt
    expectedVideoId = null;
    displayedVideoId = video.video_id;

    // Interpret und Titel zusammensetzen
    const formattedTitle = formatVideoTitle(video);

    if (
        videoTitleElement.textContent !== formattedTitle
    ) {
        videoTitleElement.textContent = formattedTitle;
    }
}

// Auch während UNSTARTED, BUFFERING und Werbung prüfen
setInterval(updateVideoTitle, 1000);

const startButton = document.getElementById("start");

// --------------------------------------------------
// START-/PAUSE-BUTTON
// --------------------------------------------------

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

// --------------------------------------------------
// YOUTUBE-PLAYER
// --------------------------------------------------

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

                // Titel bei jedem Statuswechsel prüfen
                updateVideoTitle();

                // Songstart an Umami melden
                // Bestehende Tracking-Logik unverändert
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

// --------------------------------------------------
// START / PAUSE
// --------------------------------------------------

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

// --------------------------------------------------
// LAST / NEXT
// --------------------------------------------------

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

    // Neuen Song vormerken und alten Titel ausblenden
    expectedVideoId = playlist[targetIndex];
    displayedPlaylistIndex = targetIndex;

    clearVideoTitle();

    player.playVideoAt(targetIndex);
}

// --------------------------------------------------
// BUTTONS VERBINDEN
// --------------------------------------------------

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

// --------------------------------------------------
// COVERBILD
// --------------------------------------------------

// Coverbild bei jedem Seitenaufruf frisch laden
const cover = document.querySelector(".cover");

if (cover) {
    const coverUrl = cover.getAttribute("src");

    if (coverUrl) {
        cover.src = coverUrl.split("?")[0] + "?t=" + Date.now();
    }
}

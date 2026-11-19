/* Kanal-Radio Amels | radio-ui.js | Modulare Version 19.11.2026 */

// Titelanzeige
const radioPlayerContainer = document.querySelector(".player");
let videoTitleElement = null;

if (radioPlayerContainer) {
    videoTitleElement = document.createElement("div");
    videoTitleElement.id = "radio-video-title";
    videoTitleElement.setAttribute("aria-live", "polite");
    // Die Darstellung übernimmt vollständig die style.css.
    const artistElement = document.createElement("div");
    artistElement.className = "radio-song-artist";

    const songElement = document.createElement("div");
    songElement.className = "radio-song-title";

    const positionElement = document.createElement("div");
    positionElement.className = "radio-song-position";

    videoTitleElement.append(artistElement, songElement, positionElement);

    radioPlayerContainer.insertAdjacentElement(
        "afterend",
        videoTitleElement
    );
}

// Titelwechsel überwachen
let displayedPlaylistIndex = null;
let expectedVideoId = null;

// Metadaten für eine Songposition ermitteln
function getMetadataSong(index) {
    if (
        !playlistMetadata ||
        !Array.isArray(playlistMetadata.songs)
    ) {
        return null;
    }

    return playlistMetadata.songs[index] || null;
}

// Interpret und Songtitel aktualisieren
function updateVideoTitle() {
    if (!videoTitleElement) return;

    // Vor Playerbereitschaft:
    // Daily verwendet seinen konfigurierten Startsong,
    // alle anderen Sender verwenden Song 1.
    if (isDaily && !dailyStartLoaded) {
        return;
    }

    let index = isDaily ? dailyStartIndex : 0;
    let currentVideoId = null;
    let liveVideo = null;

    if (
        playerReady &&
        player &&
        initialPlaylistPrepared
    ) {
        const playlist = player.getPlaylist();
        const playerIndex = player.getPlaylistIndex();

        if (
            Array.isArray(playlist) &&
            playerIndex >= 0 &&
            playerIndex < playlist.length
        ) {
            index = playerIndex;
            currentVideoId = playlist[index];

        } else if (pendingSongIndex !== null) {
            index = pendingSongIndex;
        }

        liveVideo = player.getVideoData();
    }

    const metadataSong = getMetadataSong(index);

    const metadataMatches =
        metadataSong &&
        metadataSong.title &&
        (
            !currentVideoId ||
            metadataSong.videoId === currentVideoId
        
        );

    let source = metadataMatches

        ? metadataSong
        : null;

    // Originaldaten aus GitHub bevorzugen:
    // Sie enthalten neben dem Titel auch den Kanalnamen.
    // Die YouTube-Playerdaten sind unser Fallback.
    if (
        !source &&
        liveVideo &&
        liveVideo.title &&
        liveVideo.video_id &&
        (
            !currentVideoId ||
            liveVideo.video_id === currentVideoId
        )
    ) {
        source = liveVideo;
    }

    if (!source) {
        return;
    }

    const formatted = formatVideoTitle(source);

    // Positionsanzeige nur im sichtbaren Titelbereich ergänzen.
    // Die Originaldaten für Umami bleiben unverändert.
    const playlistLength = (
        playerReady && player && initialPlaylistPrepared &&
        Array.isArray(player.getPlaylist()) &&
        player.getPlaylist().length > 0
    )
        ? player.getPlaylist().length
        : (playlistMetadata && Array.isArray(playlistMetadata.songs)
            ? playlistMetadata.songs.length
            : 0);

    if (formatted) {
        const lines = formatted.split("\n");
        const positionText = playlistLength > 0 &&
            index >= 0 && index < playlistLength
            ? "(" + (index + 1) + "/" + playlistLength + ")"
            : "";

        const artistElement = videoTitleElement.querySelector(
            ".radio-song-artist"
        );
        const songElement = videoTitleElement.querySelector(
            ".radio-song-title"
        );
        const positionElement = videoTitleElement.querySelector(
            ".radio-song-position"
        );

        if (artistElement && songElement && positionElement) {
            const artistText = lines.length > 1 ? lines[0].trim() : "";
            const songText = lines.length > 1
                ? lines.slice(1).join(" ").trim()
                : lines[0].trim();

            if (artistElement.textContent !== artistText) {
                artistElement.textContent = artistText;
            }
            if (songElement.textContent !== songText) {
                songElement.textContent = songText;
            }
            if (positionElement.textContent !== positionText) {
                positionElement.textContent = positionText;
            }
        }
    }

    displayedPlaylistIndex = index;

    expectedVideoId =
        currentVideoId ||
        source.videoId ||
        source.video_id ||
        null;
}

// Titel regelmäßig aktualisieren
setInterval(updateVideoTitle, 1000);

// Startbutton
const startButton = document.getElementById("start");

function updateStartButton(state) {
    if (!startButton) return;

    let label;
    let symbol;

    if (state === -1) {
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

    } else if (
        state === YT.PlayerState.PLAYING
    ) {
        label = "Pause";
        symbol = "⏸️";

    } else if (
        state === YT.PlayerState.PAUSED ||
        state === YT.PlayerState.ENDED
    ) {
        label = "Start";
        symbol = "▶️";

    } else if (
        !hasPlaybackStarted &&
        initialStartRequested
    ) {
        label = "Pause";
        symbol = "⏸️";

    } else if (!hasPlaybackStarted) {
        label = "Start";
        symbol = "⏯️";

    } else {
        return;
    }

    startButton.textContent =
        symbol + " " + label;

    startButton.setAttribute(
        "aria-label",
        label
    );

    startButton.title = label;
}

// Coverbild frisch laden
const cover = document.querySelector(".cover");

if (cover) {
    const coverUrl = cover.getAttribute("src");

    if (coverUrl) {
        cover.src =
            coverUrl.split("?")[0] +
            "?t=" +
            Date.now();
    }
}

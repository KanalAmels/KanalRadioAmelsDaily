
/*
 * Kanal-Radio Amels
 * radio-ui.js – Anzeige und Bedienelemente
 * 20.11.2026
 */

// Titelanzeige erzeugen
const radioPlayerContainer =
    document.querySelector(".player");

let videoTitleElement = null;

if (radioPlayerContainer) {
    videoTitleElement =
        document.createElement("div");

    videoTitleElement.id = "radio-video-title";
    videoTitleElement.setAttribute(
        "aria-live",
        "polite"
    );

    const artistElement =
        document.createElement("div");

    artistElement.className =
        "radio-song-artist";

    const songElement =
        document.createElement("div");

    songElement.className =
        "radio-song-title";

    const positionElement =
        document.createElement("div");

    positionElement.className =
        "radio-song-position";

    videoTitleElement.append(
        artistElement,
        songElement,
        positionElement
    );

    radioPlayerContainer.insertAdjacentElement(
        "afterend",
        videoTitleElement
    );
}

// Bestehende gemeinsame Anzeigevariablen
let displayedPlaylistIndex = null;
let expectedVideoId = null;

// Buttons
const startButton =
    document.getElementById("start");

const previousButton =
    document.getElementById("previous");

const nextButton =
    document.getElementById("next");

// Ladestatus
let radioLoadingStatus = null;

function createRadioLoadingStatus() {
    if (radioLoadingStatus || !startButton) {
        return;
    }

    const parent = startButton.parentElement;

    if (!parent) return;

    radioLoadingStatus =
        document.createElement("div");

    radioLoadingStatus.id =
        "radio-loading-status";

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

    parent.insertAdjacentElement(
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

// Gemeinsame Bedienfreigabe
function setRadioControlsEnabled(enabled) {
    [
        previousButton,
        startButton,
        nextButton
    ].forEach(function (button) {
        if (!button) return;

        button.disabled = !enabled;
        button.style.opacity =
            enabled ? "" : "0.55";

        button.style.cursor =
            enabled ? "" : "wait";
    });

    if (!startButton) return;

    if (!enabled) {
        startButton.textContent = "⏳ Lädt …";

        startButton.setAttribute(
            "aria-label",
            "Radio wird geladen"
        );

        startButton.title = "Radio wird geladen";
    } else if (player) {
        updateStartButton(
            player.getPlayerState()
        );
    }
}

// Metadatensatz für eine Position
function getMetadataSong(index) {
    if (
        !playlistMetadata ||
        !Array.isArray(playlistMetadata.songs)
    ) {
        return null;
    }

    return playlistMetadata.songs[index] || null;
}

// Titelanzeige leeren
function clearRadioVideoTitle() {
    if (!videoTitleElement) return;

    [
        ".radio-song-artist",
        ".radio-song-title",
        ".radio-song-position"
    ].forEach(function (selector) {
        const element =
            videoTitleElement.querySelector(selector);

        if (element) {
            element.textContent = "";
        }
    });
}

// Titelanzeige aktualisieren
function updateVideoTitle() {
    if (!videoTitleElement) return;

    // Vor bestätigter Initialisierung keine
    // möglicherweise falschen Songdaten anzeigen.
    if (
        !playerReady ||
        !player ||
        !initialPlaylistPrepared
    ) {
        clearRadioVideoTitle();
        return;
    }

    let playlist;
    let index;
    let liveVideo;

    try {
        playlist = player.getPlaylist();
        index = player.getPlaylistIndex();
        liveVideo = player.getVideoData();
    } catch (error) {
        return;
    }

    if (
        !Array.isArray(playlist) ||
        playlist.length === 0 ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= playlist.length
    ) {
        return;
    }

    const videoId = playlist[index];

    // Bei einem laufenden Songwechsel darf nicht
    // vorzeitig der alte Titel erscheinen.
    if (
        liveVideo &&
        liveVideo.video_id &&
        liveVideo.video_id !== videoId
    ) {
        clearRadioVideoTitle();
        return;
    }

    const metadataSong = getMetadataSong(index);

    let source = null;

    if (
        metadataSong &&
        metadataSong.title &&
        metadataSong.videoId === videoId
    ) {
        source = metadataSong;
    } else if (
        liveVideo &&
        liveVideo.title &&
        liveVideo.video_id === videoId
    ) {
        source = liveVideo;
    }

    if (!source) {
        clearRadioVideoTitle();
        return;
    }

    const formatted = formatVideoTitle(source);

    if (!formatted) {
        clearRadioVideoTitle();
        return;
    }

    const lines = formatted.split("\n");

    const artistText =
        lines.length > 1
            ? lines[0].trim()
            : "";

    const songText =
        lines.length > 1
            ? lines.slice(1).join(" ").trim()
            : lines[0].trim();

    const positionText =
        "(" + (index + 1) +
        "/" + playlist.length + ")";

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
        artistElement.textContent = artistText;
    }

    if (songElement) {
        songElement.textContent = songText;
    }

    if (positionElement) {
        positionElement.textContent = positionText;
    }

    displayedPlaylistIndex = index;
    expectedVideoId = videoId;
}

// Titel regelmäßig synchronisieren
setInterval(updateVideoTitle, 1000);

// Startbutton beschriften
function updateStartButton(state) {
    if (!startButton || !playerReady) {
        return;
    }

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

// Coverbild wie bisher frisch laden
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

// Bedienelemente zunächst sperren
setRadioControlsEnabled(false);

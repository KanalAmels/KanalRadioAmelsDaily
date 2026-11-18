
/*
 * Kanal-Radio Amels
 * Zentrale Radiosteuerung und Songstatistik
 *
 * - Interpret und Songtitel zweizeilig in Goldgelb (#facc15)
 * - Interpret- und Songkorrekturen aus song-corrections.json
 * - VEVO / Topic / Topik / Thema entfernen
 * - Titelinformationen vor dem Start aus playlist-metadata.json
 * - Daily-Startsong aus daily/daily-start.json
 * - Bestehende Player- und Werbesteuerung
 * - Umami-Songstatistik mit Originaltitel
 */

let player;
let playerReady = false;
let lastTrackedVideoId = null;
let hasPlaybackStarted = false;

// Werbesteuerung
let adPausedByUs = false;
let adPlaybackStartedByUs = false;
let initialStartRequested = false;

// Neue Metadaten- und Daily-Steuerung
let playlistMetadata = null;
let dailyStartIndex = 0;
let initialPlaylistPrepared = false;
let pendingSongIndex = null;
let dailyStartLoaded = false;

const radioConfig = window.radioConfig || {};
const isDaily = radioConfig.kanal === "Daily";

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

// Zentrale Korrekturen für Interpreten und Songtitel
let songCorrections = {};

// Pfad der zentralen radio.js ermitteln
const radioScript = Array.from(
    document.querySelectorAll("script[src]")
).find(function (script) {
    return /(?:^|\/)radio\.js(?:[?#]|$)/.test(script.src);
});

const radioBaseUrl = radioScript
    ? new URL(".", radioScript.src)
    : new URL("../", document.baseURI);

const songCorrectionsUrl = new URL(
    "song-corrections.json",
    radioBaseUrl
).href;

const metadataUrl = new URL(
    "playlist-metadata.json",
    radioBaseUrl
).href;

const dailyStartUrl = new URL(
    "daily-start.json",
    document.baseURI
).href;

// Interpret- und Songkorrekturen laden
fetch(songCorrectionsUrl)
    .then(function (response) {
        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }
        return response.json();
    })
    .then(function (data) {
        if (
            data &&
            typeof data === "object" &&
            !Array.isArray(data)
        ) {
            songCorrections = data;
            updateVideoTitle();
        }
    })
    .catch(function (error) {
        console.warn(
            "KanalRadio: song-corrections.json nicht geladen:",
            error.message
        );
    });

// Neue Playlist-Metadaten laden
const metadataPromise = fetch(metadataUrl, {
    cache: "no-store"
})
    .then(function (response) {
        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }
        return response.json();
    })
    .then(function (data) {
        playlistMetadata =
            data &&
            data.playlists &&
            data.playlists[radioConfig.playlist]
                ? data.playlists[radioConfig.playlist]
                : null;

        if (playlistMetadata) {
            console.log(
                "KanalRadio: Metadaten geladen:",
                radioConfig.kanal
            );
        } else {
            console.warn(
                "KanalRadio: Keine Metadaten für Playlist:",
                radioConfig.playlist
            );
        }

        updateVideoTitle();
    })
    .catch(function (error) {
        console.warn(
            "KanalRadio: playlist-metadata.json nicht geladen:",
            error.message
        );
    });

// Daily-Startsong aus JSON lesen
async function readDailyStartIndex() {
    if (!isDaily) {
        dailyStartLoaded = true;
        return 0;
    }

    try {
        const response = await fetch(dailyStartUrl, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const data = await response.json();

        if (
            !Number.isSafeInteger(data.startSong) ||
            data.startSong < 1
        ) {
            throw new Error(
                "startSong muss eine positive ganze Zahl sein."
            );
        }

        // YouTube zählt ab Index 0
        let index = data.startSong - 1;

        // Falls die Metadaten bereits geladen sind:
        // Ungültige Songnummer abfangen
        const songs = playlistMetadata &&
            playlistMetadata.songs;

        if (
            Array.isArray(songs) &&
            index >= songs.length
        ) {
            console.warn(
                "KanalRadio Daily: Startsong liegt außerhalb " +
                "der Playlist. Verwende Song 1."
            );
            index = 0;
        }

        console.log(
            "KanalRadio Daily: Startsong:",
            index + 1
        );

        return index;

    } catch (error) {
        console.warn(
            "KanalRadio Daily: Startsong nicht geladen. " +
            "Verwende Song 1.",
            error.message
        );
        return 0;
    }
}

// Daily-Konfiguration bereits beim Seitenaufruf laden
const dailyStartPromise = readDailyStartIndex()
    .then(function (index) {
        dailyStartIndex = index;
        dailyStartLoaded = true;
        updateVideoTitle();
        return index;
    });

// YouTube-Kanalnamen bereinigen
function cleanArtistName(author) {
    if (!author) return "";

    return author.trim()
        .replace(
            /\s*[-–—]\s*(Topic|Topik|Thema)\s*$/i,
            ""
        )
        .replace(
            /(?:Official)?VEVO\s*$/i,
            ""
        )
        .replace(
            /\s*[-–—]\s*$/i,
            ""
        )
        .trim();
}

function normalizeArtistName(value) {
    return value
        .normalize("NFKC")
        .toLocaleLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

// Künstlernamen aus song-corrections.json korrigieren
function correctArtistName(author) {
    const cleaned = cleanArtistName(author);
    if (!cleaned) return "";

    const key = Object.keys(songCorrections).find(function (name) {
        return normalizeArtistName(name) === normalizeArtistName(cleaned);
    });

    if (key) {
        const correction = songCorrections[key];
        if (
            correction &&
            typeof correction === "object" &&
            !Array.isArray(correction) &&
            typeof correction.artist === "string"
        ) {
            return correction.artist.trim() || cleaned;
        }
    }

    return cleaned;
}

// Bekannte Eigenschreibweisen erhalten
const protectedCapitalization = {
    "ABBA": "ABBA",
    "AC/DC": "AC/DC",
    "R.E.M.": "R.E.M.",
    "DJ": "DJ",
    "USA": "USA",
    "UK": "UK",
    "U2": "U2",
    "UB40": "UB40",
    "BAP": "BAP",
    "NENA": "Nena"
};

// Prüfen, ob ein Text vollständig großgeschrieben ist
function isAllUppercase(value) {
    const letters = value.match(/\p{L}/gu);

    if (!letters || letters.length === 0) {
        return false;
    }

    return value === value.toLocaleUpperCase("de-DE");
}

// Einzelne Wörter lesbar formatieren
function capitalizeWord(word) {
    const protectedWord =
        protectedCapitalization[
            word.toLocaleUpperCase("de-DE")
        ];

    if (protectedWord) {
        return protectedWord;
    }

    const lower = word.toLocaleLowerCase("de-DE");

    return lower.replace(
        /(^|[-'’])(\p{L})/gu,
        function (match, separator, letter) {
            return separator +
                letter.toLocaleUpperCase("de-DE");
        }
    );
}

// Groß-/Kleinschreibung korrigieren
function normalizeCapitalization(value) {
    if (!value || !isAllUppercase(value)) {
        return value;
    }

    return value
        .split(/(\s+)/)
        .map(function (part) {
            if (/^\s+$/.test(part)) {
                return part;
            }
            return capitalizeWord(part);
        })
        .join("");
}

// Klammerzusätze entfernen, außer Mix oder Live
function cleanSongTitle(title) {
    if (!title) return "";

    return title
        .replace(
            /\([^()]*\)|\[[^\[\]]*\]/g,
            function (part) {
                return /\b(mix|live)\b/i.test(part)
                    ? part
                    : " ";
            }
        )
        .replace(/\s{2,}/g, " ")
        .trim();
}

// Interpret und Song aus Videotitel erkennen
function splitArtistAndSong(title) {
    const match = title.match(
        /^(.+?)(?:\s*-\s+|\s+–\s+|\s+\|\s+)(.+)$/
    );

    if (!match) return null;

    const artist = match[1].trim();
    const song = match[2].trim();

    if (!artist || !song) return null;

    return {
        artist: artist,
        song: song
    };
}

// Fertigen Anzeigetitel erzeugen
function formatVideoTitle(video) {
    if (!video || !video.title) return "";

    const title = cleanSongTitle(video.title.trim());

    // Songkorrekturen anhand des originalen oder bereinigten Videotitels.
    // Exakter Treffer hat Vorrang vor Teiltreffern.
    const normalizeTitleKey = function (value) {
        return value.normalize("NFKC").toLocaleLowerCase()
            .replace(/\s+/g, " ").trim();
    };

    const rawKey = normalizeTitleKey(video.title.trim());
    const cleanedKey = normalizeTitleKey(title);
    const keys = Object.keys(songCorrections).filter(function (key) {
        const correction = songCorrections[key];
        return correction && typeof correction === "object" &&
            !Array.isArray(correction) &&
            typeof correction.title === "string";
    });

    const correctionKey = keys.find(function (key) {
        const normalized = normalizeTitleKey(key);
        return normalized === rawKey || normalized === cleanedKey;
    }) || keys.sort(function (a, b) {
        return b.length - a.length;
    }).find(function (key) {
        const normalized = normalizeTitleKey(key);
        return rawKey.includes(normalized) || cleanedKey.includes(normalized);
    });

    if (correctionKey) {
        const correction = songCorrections[correctionKey];
        const artist = normalizeCapitalization(
            (typeof correction.artist === "string" && correction.artist.trim())
                ? correction.artist.trim()
                : correctArtistName(video.author)
        );
        const song = normalizeCapitalization(correction.title.trim());
        if (song) return artist ? artist + "\n" + song : song;
    }

    const channelArtist = correctArtistName(video.author);

    // Interpret steht bereits im Videotitel
    const parsed = splitArtistAndSong(title);

    if (parsed) {
        const titleArtist = normalizeCapitalization(
            correctArtistName(parsed.artist)
        );

        const songTitle = normalizeCapitalization(
            parsed.song
        );

        return titleArtist + "\n" + songTitle;
    }

    // Kein Interpret im Titel erkennbar
    const songTitle = normalizeCapitalization(title);

    if (!channelArtist) {
        return songTitle;
    }

    const formattedArtist = normalizeCapitalization(
        channelArtist
    );

    // Doppelte Künstlernennung verhindern
    const normalizedTitle =
        normalizeArtistName(songTitle);

    const normalizedArtist =
        normalizeArtistName(formattedArtist);

    const position = normalizedTitle.indexOf(
        normalizedArtist
    );

    if (position !== -1) {
        const before = normalizedTitle.slice(
            0,
            position
        );

        const after = normalizedTitle.slice(
            position + normalizedArtist.length
        );

        const beforeBoundary =
            before === "" ||
            !/[\p{L}\p{N}]$/u.test(before);

        const afterBoundary =
            after === "" ||
            !/^[\p{L}\p{N}]/u.test(after);

        if (beforeBoundary && afterBoundary) {
            return songTitle;
        }
    }

    return formattedArtist + "\n" + songTitle;
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

// YouTube-Player initialisieren
function onYouTubeIframeAPIReady() {
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

                // Umami-Songstatistik
                if (
                    event.data === YT.PlayerState.PLAYING
                ) {
                    const video =
                        event.target.getVideoData();

                    if (

                        video.video_id &&
                        video.video_id !== lastTrackedVideoId
                    ) {
                        lastTrackedVideoId =
                            video.video_id;

                        if (
                            typeof window.umami !== "undefined"
                        ) {
                            window.umami.track(
                                "song_start",
                                {
                                    kanal: config.kanal,
                                    video_id: video.video_id,
                                    titel: video.title
                                }
                            );
                        }
                    }
                }

                if (
                    event.data === YT.PlayerState.ENDED
                ) {
                    lastTrackedVideoId = null;
                }
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

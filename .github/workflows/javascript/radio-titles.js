/* Kanal-Radio Amels | radio-titles.js | Modulare Version 19.11.2026 */

let songCorrections = {};

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

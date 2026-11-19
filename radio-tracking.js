/* Kanal-Radio Amels | radio-tracking.js | Modulare Version 19.11.2026 */

// Umami-Ereignisse bleiben identisch zur bisherigen radio.js.
function trackSongState(event, config) {
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

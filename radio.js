
function togglePlayback() {

  if (!playerReady) {
    alert("Der Player lädt noch. Bitte erneut versuchen.");
    return;
  }

  const before = player.getPlayerState();

  // TEST 2:
  // Auch bei UNSTARTED (-1) versuchen wir zu pausieren.
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
    "(",
    immediately,
    ")"
  );

  console.groupEnd();

  setTimeout(function () {
    if (!playerReady) return;

    const later = player.getPlayerState();

    console.log(
      "[KanalRadio Diagnose 2] 1 Sekunde nach",
      action + ":",
      describePlayerState(later),
      "(",
      later,
      ")"
    );
  }, 1000);
}

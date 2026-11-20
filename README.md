# Kanal-Radio Amels – Devel 2.0

Eine zentrale `index.html` für Daily und alle weiteren Sender.

- `index.html` → Daily (ohne `list`)
- `index.html?list=PLPzm8oQAlWx0` → 1960th Radio
- `json/playlist-metadata.json` → Playlist-IDs und vollständige Songmetadaten
- `json/daily-start.json` → Daily-Startsong (`startSong`, 1-basiert)
- `json/song-corrections.json` → Interpret-/Titelkorrekturen
- `img/radiocover_<name>.png` → Cover, wobei `<name>` dem `name` aus der Metadaten-JSON entspricht
- `javascript/` → Player, Anzeige, Menü und Initialisierung
- `css/` → Stylesheets

`index-header.html`, `index-menu.html` und `index-footer.html` werden beim Start geladen. GitHub Pages bzw. ein HTTP-Server ist nötig (nicht direkt per `file://` öffnen).

Die GitHub Action `update-playlist-counts.yml` enthält weiterhin eine feste Liste der von der YouTube-API aktualisierten Playlists. Neue Playlist-IDs dort ergänzen, damit Songzahlen und Songmetadaten automatisch aktualisiert werden. Manuelle JSON-Einträge bleiben bis zum nächsten Workflow-Lauf erhalten; beim Workflow-Lauf wird die Metadaten-JSON aus den dort definierten Playlists neu erstellt.

**Wichtig:** Erst in Devel testen; Daily nicht synchronisieren, bevor alle Tests bestanden sind. Der Player benötigt die echte YouTube-API und kann nicht allein mit einem lokalen Syntaxcheck getestet werden.

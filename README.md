# Schach – v4 als Progressive Web App (PWA)

Das Schachspiel ist jetzt **installierbar** und läuft nach dem ersten vollständigen
Laden **offline**. Es enthält keine externen Bibliotheken und benötigt keine
Anmeldung. Alle bestehenden Spielmodi, Computergegner und lokalen Spielstände
bleiben erhalten.

## Lokal starten und testen

1. Dieses ZIP entpacken.
2. Im entpackten Ordner ein Terminal öffnen und einen lokalen Webserver starten:

   ```bash
   python3 -m http.server 8000
   ```

3. Auf demselben Computer `http://localhost:8000` öffnen.
4. Nach dem Laden kann man die Verbindung unterbrechen und das Spiel erneut öffnen.

**Wichtig:** Die PWA-Installation und der Service Worker funktionieren nur über
**HTTPS** oder **localhost** (sicherer Browserkontext), **nicht über** `file://`
(Doppelklick auf `index.html`). Zum Testen auf einem Smartphone die Dateien
auf einen HTTPS-Webserver laden (z. B. einen statischen Webhost).

## Als App installieren

- **Android / Chrome und Desktop / Chrome oder Edge:** Über die Schaltfläche
  **Installieren** im Kopfbereich oder den Installationspunkt im Browsermenü.
  Der Browser zeigt die Schaltfläche an, sobald die Installation angeboten wird.
- **iPhone / iPad (Safari):** Auf **Installieren** tippen, dann in Safari
  **Teilen → Zum Home-Bildschirm** wählen. Falls kein Button angezeigt wird,
  kann man denselben Weg direkt über das Safari-Menü nutzen.
- Danach startet das Spiel in einem eigenen App-Fenster ohne Browserleisten.

Beim ersten Besuch müssen alle Dateien einmal erfolgreich geladen worden sein.
Danach kommen HTML, CSS, JavaScript, Icons und Computergegner aus dem Offline-Cache.
Spielstände werden weiterhin im Browser-Speicher (`localStorage`) gespeichert und
bleiben zwischen Besuchen am **gleichen Ursprung** erhalten. Eine vorher über
`file://` gespeicherte Partie wird aus Sicherheitsgründen nicht automatisch zum
neuen `https://`-Ursprung übertragen.

## Updates

Die App hält ihre eigenen Dateien unter `schach-pwa-v1` im Cache. Wenn der
Service Worker in `sw.js` geändert und die Cache-Version erhöht wird, kann die
neue Fassung installiert werden. Im Spiel erscheint dann die Schaltfläche
**Aktualisieren**; erst durch Antippen wird die neue Fassung aktiviert.

Für spätere Code-Updates die Cache-Konstante `CACHE_NAME` in `sw.js` erhöhen,
zum Beispiel auf `schach-pwa-v2`. Den Cache-Inhalt beim Hinzufügen von Dateien
in `APP_FILES` ergänzen.

## Spielmodi

Weiß und Schwarz sind unabhängig als Spieler, Computer Leicht, Computer Mittel
oder Computer Schwer konfigurierbar (16 Kombinationen). Unterstützt werden
Rochade, en passant, Bauernumwandlung, Schach/Matt/Patt, Remisregeln,
Zughistorie, Rücknahme, Brett drehen, Sound und Computer-gegen-Computer mit
Pause und Einzelschritt. Die Computerberechnung läuft vollständig lokal.

## Projektdateien

```text
index.html                 App-Oberfläche und PWA-Metadaten
styles.css                 Responsives Design und PWA-Hinweise
game.js                    Spiellogik, Speicherung und Steuerung
chess-engine.js            Schachregeln
cpu-easy.js                Computer Leicht
cpu-medium.js              Computer Mittel
cpu-hard.js                Computer Schwer
pwa.js                     Installieren, Update-Anzeige, SW-Registrierung
sw.js                      Offline-Cache und Service Worker
manifest.webmanifest       Installations-Metadaten und App-Icons
icons/                     Icons in 192, 512, maskable und Apple-Touch-Größe
README.md                  Anleitung
```

**Version:** Spiel v4.0 / PWA-Ausgabe 1

# Schach – v4

Ein lokal spielbares Schachspiel für den Browser mit dunkler Oberfläche, Animationen,
Sounds, vollständigen Schachregeln, eigenem Startmenü und **drei getrennten
Computergegnern**. Keine Bibliotheken, Anmeldung oder Internetverbindung nötig.

## Starten

1. `Schach-v4.zip` entpacken.
2. `schach-v4/index.html` per Doppelklick im Browser öffnen.
3. Im Startmenü **Spieler 1 (Weiß)** und **Spieler 2 (Schwarz)** jeweils konfigurieren.
4. **Partie starten** anklicken. Weiß zieht zuerst.

Die Dateien `.html`, `.css` und `.js` müssen zusammen im Ordner bleiben.
Die Internetverbindung kann ausgeschaltet sein.

## Spieler konfigurieren

Weiß und Schwarz lassen sich **unabhängig voneinander** einstellen:

- **Spieler:** Ein Mensch zieht per Maus, Tastatur oder Touch.
- **Computer Leicht:** Einsteigergegner mit einfacher Zugbewertung und Zufallsanteil (`cpu-easy.js`).
- **Computer Mittel:** Alpha-Beta-Suche bis drei Halbzüge mit Ruhesuche (`cpu-medium.js`).
- **Computer Schwer (NEU):** Iterative Vertiefung bis sechs Halbzüge,
  Alpha-Beta/Principal-Variation-Suche, Transpositionstabelle, Zugordnung,
  Ruhesuche sowie erweiterte Bewertung von Material, Bauernstruktur,
  Freibauern und Königssicherheit (`cpu-hard.js`). Die erreichte Suchtiefe
  hängt von Stellung und Rechenzeit ab. Pro Zug gilt ein Budget von ungefähr
  1,35 Sekunden und 70.000 untersuchten Knoten.

Damit sind **16 Kombinationen** möglich, darunter Mensch gegen Schwer,
Schwer gegen Mittel und **Schwer gegen Schwer**. Es ist keine Internet-KI:
Der Computer berechnet alles lokal im Browser.

### Computer gegen Computer

Sobald beide Seiten einen Computer haben, läuft die Partie automatisch.
Im Spielfeld erscheinen **Pause / Fortsetzen** und bei Pause **Ein Zug**.

- **Pause:** Zuschauer-Automatik stoppen.
- **Ein Zug:** Genau einen Computerzug berechnen und anzeigen.
- **Fortsetzen:** Die automatische Partie weiterlaufen lassen.
- **Zurück:** Einen Halbzug zurücknehmen und automatisch pausieren.

Die Züge sind zeitlich versetzt und animiert. Die Partie stoppt bei Matt
oder automatischem Remis. Die Computerstufe „Schwer“ rechnet pro Zug
länger als „Leicht“ oder „Mittel“; der Browser kann dabei kurz beschäftigt
sein. Ein Server wird nicht benötigt.

## Spielfunktionen

- Legale Züge nach Schachregeln mit Rochade, en passant und Bauernumwandlung.
- Schach, Matt, Patt und Remisregeln: unzureichendes Material, 75 Züge,
  fünffache Stellungswiederholung und beanspruchbare Remisregeln.
- Zugliste in algebraischer Notation, letzter Zug, mögliche Zielfelder.
- **Neu** startet mit derselben Spielerzuordnung eine neue Partie.
- **Zurück** nimmt in der Regel einen Halbzug bzw. im Mensch-Computer-Spiel
  nach Möglichkeit Zug und Antwort zurück.
- **Startmenü** wechselt zur Auswahl ohne Verlust der laufenden Partie;
  **Vorherige Partie fortsetzen** bringt sie zurück.
- Brett drehen; Sound ein-/ausschalten; animierte Figuren.
- Responsives Design und Unterstützung für reduzierte Bewegung.
- Automatische Speicherung von Partie und Einstellungen, soweit Browser-
  Speicher verfügbar ist. v4 verwendet eigene Speicherschlüssel;
  bestehende v3-, v2- und v1-Partien werden bei passendem Browser-Speicher
  als Fortsetzungsangebot übernommen, ohne alte Speicherschlüssel zu ändern.

## Projektdateien

```text
schach-v4/
├── index.html       Startmenü und Spielfläche
├── styles.css       Dunkles responsives Design und Animationen
├── game.js          Spielerwahl, Steuerung, CPU-Automatik, Sound, Speicherung
├── chess-engine.js  Zugregeln, FEN, Notation und Remisprüfung
├── cpu-easy.js      Computer Leicht
├── cpu-medium.js    Computer Mittel
├── cpu-hard.js      Computer Schwer (neu)
└── README.md        Anleitung
```

Jedes KI-Modul verfügt über die Schnittstelle:

```js
CPUEasy.chooseMove({ state, legalMoves, engine });
CPUMedium.chooseMove({ state, legalMoves, engine });
CPUHard.chooseMove({ state, legalMoves, engine, history });
```

Die Engine gibt die legalen Züge vor. Die Computerdateien wählen ausschließlich
aus diesen Zügen aus. `history` ist für `CPUHard` optional und unterstützt die
Erkennung von Stellungswiederholungen während der Suche.

## Änderungen gegenüber v3

1. Neues eigenständiges Modul **`cpu-hard.js`** mit größerer Suchtiefe und
   taktischen/strategischen Bewertungsheuristiken.
2. **Computer Schwer** für Weiß und Schwarz im Startmenü.
3. Statusanzeige, Partiebeschriftung, Konfigurationsspeicherung und
   Zuschauermodus für die neue Stufe erweitert.
4. 16 statt 9 möglichen Spielerkombinationen, inklusive Schwer gegen Schwer.
5. Separater v4-Speicherbereich mit Übernahme früherer Partien, wenn verfügbar.

**Version: 4.0**

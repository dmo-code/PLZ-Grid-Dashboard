# AGENTS.md

## Projektregeln
- UI-Texte bleiben auf Deutsch, außer der Nutzer bittet ausdrücklich um eine andere Sprache.
- Nach Codeänderungen immer `npm run build` ausführen und berichten, ob der Build erfolgreich war.
- Keine neuen Abhängigkeiten hinzufügen, ohne dass es einen klaren Grund gibt und dieser genannt wird.
- Bestehende React-, TypeScript-, Storage-, API- und CSS-Muster bevorzugen, statt neue Abstraktionen einzuführen.
- Änderungen eng auf das angefragte Feature oder den angefragten Bugfix begrenzen.
- Änderungen des Nutzers nicht entfernen oder zurücksetzen, außer es wird ausdrücklich verlangt.
- Bei Updates müssen bereits beim Nutzer liegende lokale Daten migriert werden; bestehende `localStorage`-Daten dürfen nicht stillschweigend verworfen werden.
- Neue oder geänderte gespeicherte Datenstrukturen brauchen Normalisierung, Fallbacks und bei Bedarf eine Migration für ältere Versionen.
- Bei sichtbaren Feature-, Bedienungs-, Widget-, Datenquellen- oder Einstellungsänderungen immer prüfen, ob `README.md` und die In-App-Hilfe aktualisiert werden müssen.
- Wenn Nutzerfunktionen geändert oder ergänzt werden, `README.md` und die In-App-Hilfe im selben Arbeitsgang aktuell halten, sofern die Änderung dort relevant ist.
- Die In-App-Hilfe soll einen Abschnitt `Letzte Änderungen` als Liste enthalten.
- Bei relevanten Nutzeränderungen die Liste `Letzte Änderungen` in der In-App-Hilfe aktualisieren, damit die jüngsten Änderungen dort nachvollziehbar bleiben.
- Bei einem relevanten Update den Help-Seen-/Versionsmechanismus so aktualisieren, dass der Hilfe-Drawer jedem Nutzer nach dem Update einmal automatisch angezeigt wird.

## Widget-Arbeit
- Immer kleine, mittlere und große Widgetgrößen berücksichtigen.
- Überlappungen beim Vergrößern oder Verkleinern von Widgets vermeiden; Elemente mit festem Format brauchen stabile Maße oder klare Maximalgrößen.
- Diagramme müssen in ihren Cards bleiben und dürfen Labels, Marker oder Linien nicht verzerren.
- Interaktive Controls innerhalb von Widgets müssen bei Bedarf Drag-/Pointer-Konflikte verhindern.
- Widget-spezifische Einstellungen über `src/storage.ts` in `localStorage` speichern.
- Persistierte Einstellungen normalisieren, damit alte oder ungültige Werte das Dashboard nicht beschädigen.

## Daten Und Prognosen
- Externe Daten grundsätzlich als potenziell nicht verfügbar oder unvollständig behandeln; Widgets sollen dann einen kurzen Leer-/Fehlerzustand zeigen, statt das Dashboard zu beschädigen.
- Wetter- und Prognoseberechnungen explizit und gut nachvollziehbar halten.
- Zahlen für Nutzer nach deutschen Konventionen formatieren.
- Prognose- oder Modelldaten klar kennzeichnen, wenn sie keine Live-Messung sind.

## Frontend-Stil
- Den bestehenden Dashboard-Stil treffen: kompakt, nützlich, ruhig und informationsdicht.
- Keine Landingpage-, Marketing- oder rein dekorativen Layouts hinzufügen.
- Vorhandene Cards, Metriken, Segment-Controls und Diagrammstile verwenden, wo es passt.
- Kurze Labels bevorzugen und erklärenden Text in der App vermeiden, außer er verhindert Missverständnisse.

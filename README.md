# NetworkPlanner – digitaler Infrastruktur-Baukasten

Server aus Einzelteilen grafisch zusammenbauen, ins Rack einsetzen und im Netzwerk verbinden –
alles auf **einem gemeinsamen Objektmodell**. Ein Server, der im Hardware Builder entsteht, ist
exakt dasselbe Objekt, das im Rack steckt und im Netzwerk-Designer mit seinen echten Ports erscheint.

![Hardware Builder](docs/screenshots/hardware-builder.png)

## Schnellstart

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Unit-Tests (Vitest)
npm run build      # Typecheck + Produktions-Build
```

Beim ersten Start kann das **Demo-Homelab** geladen werden (3 selbst gebaute Server, 24U-Rack,
VLAN-segmentiertes Netzwerk, Docker-Dienste) – oder man startet leer mit dem ersten Server.
Projekte werden automatisch lokal im Browser (IndexedDB) gespeichert.

## Die drei Ebenen

| Ebene | Editor | Was passiert dort |
| --- | --- | --- |
| A – Bauteil | **Hardware Builder** | CPU, RAM, SSD/HDD/NVMe/U.2, NICs, GPUs, HBA/RAID, Netzteile, Lüfter, Mainboards |
| B – Gerät | **Hardware Builder / Rack Builder** | Server, NAS, Workstation, PC, Router, Firewall, Switch entstehen aus Bauteilen oder Vorlagen |
| C – Infrastruktur | **Rack Builder / Netzwerk-Designer / VLAN & IP** | Racks, Verkabelung, VLANs, Subnetze, Firewall, Dienste |

Von jedem Objekt aus kann man in die anderen Ebenen springen (Inspector: *Hardware*, *Rack*, *Netzwerk*).

## Hardware Builder

- Gehäuse wählen: **Tower, 1U, 2U, 2U NVMe, 4U** oder **Custom** (Schächte, Lüfter, Netzteile, Formfaktoren frei definierbar).
- Bauteile per **Drag & Drop** aus der Bibliothek ins Gehäuse ziehen. Beim Ziehen leuchten passende Steckplätze
  grün, bedingt passende gelb, unpassende rot; der Slot unter dem Mauszeiger wird erkannt
  (*„✓ P1-A1“*, *„✕ Diese CPU benötigt Sockel AM5 …“*).
- Das **Mainboard ist selbst ein grafisches Bauteil** mit anklickbaren Slots (CPU-Sockel, DIMM, PCIe, M.2).
  Ein Klick auf einen freien Slot zeigt passende Teile zum direkten Einsetzen.
- Frei platzieren, **verschieben, drehen (15°-Raster, Shift = frei), skalieren** (generische Karten / eigene Teile),
  duplizieren, löschen, gruppieren, **Mehrfachauswahl** (Shift-Klick, Auswahlrahmen), **Raster/Snap** und
  **intelligente Hilfslinien**, Ausrichten & gleich verteilen, **Ablage** für lose Teile.
- Doppelklick in der Bibliothek baut ein Teil automatisch in den nächsten passenden Steckplatz ein.
- Interne Verbindungen: Laufwerke werden automatisch an SATA/HBA/RAID/NVMe-Backplane angeschlossen;
  mit dem **Kabel-Werkzeug (C)** lassen sich eigene Verbindungen ziehen (z. B. HDD → HBA).
- Ansichten: **Innenansicht, Explosionsansicht (isometrisch, Explosionsgrad einstellbar), Front, Rückseite,
  Blockdiagramm** (CPU → Mainboard → RAM/NVMe/NIC, HBA → HDDs, NIC-Ports → verbundene Switch-Ports).
- **Kompatibilitätsprüfung** in Echtzeit: Sockel, DDR-Generation, RDIMM/UDIMM, ECC, Speichertakt,
  CPU-Zuordnung von DIMM/PCIe bei Dual-Socket, PCIe-Länge/Lanes/Generation, Low-Profile & Kartenlänge,
  Mehrslot-GPUs, M.2-Länge/Protokoll, 2.5"/3.5"/U.2-Schächte, Controller-Anschlüsse, Netzteil-Budget &
  Redundanz, Lüfter, fehlende Komponenten.

![Explosionsansicht](docs/screenshots/exploded-view.png)

## Rack Builder

- Beliebig viele Racks (6–48 HE), Vorder- und Rückansicht mit gezeichneten Frontblenden
  (Server mit echten Laufwerksschächten aus dem Build, Switches mit Ports, Patchpanel, PDU, USV, Einlegeboden,
  Kabelmanagement, Blindblenden).
- Geräte per Drag & Drop einsetzen, verschieben (auch zwischen Racks), mit ↑/↓ um eine HE bewegen,
  aus dem Rack ziehen zum Entfernen. Kollisionen und Rack-Grenzen werden geprüft.
- **Rack-Analyse**: Höhe, belegt/frei, größter freier Block, Leistung (typisch/max) aus den Komponenten,
  Gewicht, Abwärme (BTU/h), geschätzter Temperaturanstieg, Energiekosten, **USV-Last und Laufzeit**, PDU-Kapazität,
  Warnungen (Traglast, Leistung, Tiefe, USV-Position).

![Rack Builder](docs/screenshots/rack-builder.png)

## Netzwerk-Designer

- Freie Arbeitsfläche (React Flow) mit Bibliothek: Router, Firewall, Switches, Access Point, Modem, Gateway,
  Server/NAS/Mini-PC, Clients, Dienste (DNS, DHCP, Reverse Proxy, VPN, Docker, VM, Kubernetes, Cloud, Internet).
- **Jeder Port ist ein Anschlusspunkt.** Die Ports eines selbst gebauten Servers stammen direkt aus seinen
  Netzwerkkarten/Onboard-LAN (NIC 1, NIC 2, IPMI …). Port auf Port ziehen erzeugt eine Verbindung.
- Verbindungen sind Objekte: Typ, Medium, Geschwindigkeit (automatisch = langsamster Port), Kabelkategorie,
  Länge, Kabelnummer, VLANs. Verbindungen sind am Server **und** am Switch sichtbar (Port-Übersicht:
  *„NIC 1 · 10G SFP+ → Core Switch SFP+ 10“*).
- Ansichten: **Physisch** (Kabel/Medien), **Logisch** (VLAN-Zonen und -Farben), **Services**
  (Dienste, Container, „läuft auf“-Beziehungen). IP/VLAN/Ports/Speed einzeln ein-/ausblendbar.
- Mehrfachauswahl, Kopieren/Einfügen/Duplizieren, Gruppen, Ausrichten/Verteilen, Snap, Mini-Map,
  **Auto-Layout**, Kontextmenü.

![Netzwerk logisch](docs/screenshots/network-logical.png)

## VLAN & IP

- VLANs mit Subnetz, Gateway, DHCP-Bereich, DNS, Domain – Änderungen wirken überall
  (Ports referenzieren VLANs per ID).
- IP-Adressplan aller Interfaces mit Konflikterkennung (doppelt, außerhalb des Subnetzes, im DHCP-Bereich,
  Netz/Broadcast), „nächste freie IP“, Subnetzrechner.
- Firewall-Regeln (erste passende Regel gilt) mit **Zugriffsmatrix**, statische Routen, DHCP-Übersicht,
  automatisch erzeugte DNS-Einträge.

![VLAN & Firewall](docs/screenshots/vlan-ip-firewall.png)

## Weitere Funktionen

- **Erklärungen** (ⓘ *Was ist das? · Warum brauche ich das? · Womit verbinden? · Was beachten?*) für alle
  Bauteil- und Gerätetypen – in Bibliothek und Inspector.
- **Eigene Komponenten**: Bauteile, Mainboards (Slots werden aus Sockel/RAM/PCIe/M.2 generiert) und
  Geräte (Höhe, Maße, Portgruppen) – erscheinen danach in den Bibliotheken.
- **Undo/Redo** für alle Änderungen, Autosave in IndexedDB, mehrere Projekte.
- Import/Export: Projekt als JSON, Stückliste, Kabelliste und IP-Plan als CSV, Dokumentation als Markdown.
- Hell/Dunkel-Design.

### Tastaturkürzel

| Kürzel | Funktion |
| --- | --- |
| Strg+Z / Strg+Shift+Z | Rückgängig / Wiederholen |
| Strg+S | Speichern |
| Strg+C / Strg+V / Strg+D | Kopieren / Einfügen / Duplizieren |
| Entf | Löschen (Rack Builder: aus dem Rack nehmen, Shift+Entf löscht) |
| Strg+G / Strg+Shift+G | Gruppieren / Gruppierung aufheben |
| R, I, U | Drehen, Einbauen, Ausbauen (Hardware) |
| V, H, C | Auswahl-, Hand-, Kabel-Werkzeug (Hardware) |
| Leertaste + Ziehen, Mausrad | Verschieben, Zoomen |

## Architektur

```
src/
├── models/        Objektmodell: Device, HardwareComponent (+Slots/Mounts), Chassis, Rack,
│                  NetworkInterface, Vlan, Connection, Project
├── data/          Bauteil-, Gehäuse- und Gerätekataloge, Erklärungen, Demo-Projekt
├── utils/         reine Logik: Layout-Generatoren, Geometrie, Kompatibilität, Build-Operationen,
│                  Port-Ableitung, Rack-Analyse, IP-Werkzeuge, Auto-Layout, Import/Export
├── store/         Zustand-Store (Projekt + Undo/Redo-Historie), UI-Store, Aktionen, IndexedDB-Autosave
├── editors/       hardware/ (SVG-Canvas & Ansichten), rack/, network/ (React Flow)
├── components/    ui/ (shadcn-Stil), hardware/ & rack/ (Illustrationen), inspector/, layout/
├── pages/         Übersicht, VLAN & IP
└── tests/         Vitest-Tests
```

**Ein Datenmodell für alle Editoren.** `Device` ist das zentrale Objekt:

```ts
interface Device {
  id: string
  name: string
  kind: DeviceKind                  // server, nas, switch, firewall, docker, …
  build?: HardwareBuild             // Hardware Builder: Gehäuse + Bauteile + interne Verbindungen
  ports: NetworkInterface[]         // feste Ports (Switch, Router, Clients)
  rackPlacement?: RackPlacement     // Rack Builder: Rack + unterste HE
  layout: { network?: Point; service?: Point; groupId?: string } // Netzwerk-Designer
  hostDeviceId?: string             // Dienste/VMs: läuft auf …
}
```

Die Netzwerkports eines Geräts werden abgeleitet (`getDevicePorts`): feste Ports + Ports aller
Bauteile (`HardwareComponent.ports`, z. B. NIC-Ports, Onboard-LAN, IPMI). Verbindungen referenzieren
`deviceId` + `portId`; wird eine Netzwerkkarte entfernt oder ihre Portzahl reduziert, werden die
betroffenen Verbindungen im selben Undo-Schritt entfernt. VLANs werden an Ports per ID referenziert,
IP-Adressen liegen am Port.

Bauteile hängen entweder frei auf der Arbeitsfläche (`placement`) oder stecken in einem Steckplatz
(`mount: { parentId: 'chassis' | componentId, slotId }`). Mainboard- und Gehäuse-Slots werden aus
Parametern **generiert** (`utils/generators.ts`) – dadurch funktionieren eigene Mainboards und Custom-Gehäuse
ohne handgezeichnete Layouts. Neue Hardware lässt sich einfach als Katalogeintrag in
`data/componentCatalog.ts` ergänzen; neue Prüfregeln in `utils/compatibility.ts`.

## Tests

```bash
npm test
```

Abgedeckt sind u. a. Layout-Generatoren, Kompatibilitätsregeln, Einbau/Tausch/Ausbau inkl.
Mainboard-Wechsel, Port-Synchronisation Hardware ↔ Netzwerk, VLAN-Propagation, Rack-Platzierung
und -Analyse, IP-Planung, Undo/Redo sowie Import/Export.

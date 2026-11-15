# ARES-WALK

Suit-calibrated Mars EVA traverse planner for the Altadena boxwork unit at the base of Aeolis Mons, Gale Crater.

## Run

The app is a dependency-free static site. Serve the project folder (do not open `index.html` directly, because browser security rules block image pixel analysis on `file://` URLs):

```sh
cd ares-walk
python -m http.server 4173
```

Then open <http://127.0.0.1:4173/>.

## What it does

- Fuses a real HiRISE ortho basemap with rendered orbital-data layers: TPI relief, THEMIS-style thermal inertia, and CRISM D2300 mineral signatures.
- Applies a suit-calibrated routing narrative with an asymmetric 0.38 g metabolic model, a 22° stability ceiling, a 25% PLSS walkback reserve, and a UHF line-of-sight viewshed.
- Provides interactive layer and flight-rule toggles, a pan/zoom traverse map, W1–W4 geological briefings, flight-rule explainers, a Curiosity ground-truth track, and a simulated Solar Particle Event abort.
- Includes a full mission brief modal, visor HUD, exploration statistics, and PLSS energy ledger.

## Controls

- Drag the map to pan; scroll or use the zoom controls to zoom.
- Click any waypoint marker or row to open its briefing.
- Use `TRIGGER SPE SOLAR FLARE` to enter minimum-time abort mode; trigger again to cancel the drill.
- Use `? MISSION BRIEF` for the mission overview.

## Data and attribution

The basemap is a colorized crop of NASA/JPL-Caltech/University of Arizona HiRISE image **PIA26306**, “HiRISE Views Mount Sharp's Boxwork.” It is public domain. The local image is included at `assets/altadena-hirise.jpg`.

The THEMIS and CRISM display rasters are demo visualizations derived from that basemap to support the interface narrative. They are not calibrated PDS science products. Production deployments should replace them with co-registered PDS THEMIS nighttime IR and CRISM `MTRDR` products.

Mission sources, transparency, and attribution are also disclosed in the site footer.

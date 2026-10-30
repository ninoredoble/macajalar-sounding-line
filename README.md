# Sound Macajalar Bay

An interactive browser study in nautical chart conventions. Drag the two ends of a sounding line across a hand-drawn chart of Macajalar Bay (Cagayan de Oro, Northern Mindanao) and read the seabed profile beneath it.

This is a design and engineering study, not a production system. There is no backend, no sensor or satellite feed, and no survey data. **Do not use it to navigate.**

## What you can do

- Drag handle **A** or **B** (mouse, touch, or the arrow keys when a handle has focus; Shift moves it further). Tapping open water moves the nearer end there.
- Read the seabed profile along the line, with the same depth tints as the chart behind it.
- Drag along the profile to lower the "lead" to any point on the line. A magenta dot follows on the chart and the readout shows the depth under it.
- Switch soundings between metres and fathoms (1 fathom = 1.8288 m).
- Raise or lower the tide and see the depth of water over every sounding change. Pick a row of the sample tide table to set it.
- Read the whole line as a table, for screen readers and for copying.
- Three example lines are one click away.

The chart is drawn the way a paper chart is: soundings as numbers, depth tints and contours, a graticule in degrees and minutes, a scale bar in nautical miles and kilometres, and a compass rose pointing to true north.

## What is real, and what is not

Real, and computed live in the browser:

- The line geometry, distances in nautical miles and kilometres, and interpolation along the line.
- Depth tints and contours generated from the depth grid.
- Unit conversion and the tide arithmetic (water depth = charted depth + height of tide).

Made up:

- **The coastline** is a rough hand-drawn outline of the bay with a little added roughness. Town positions are approximate.
- **The depths** come from one formula in `app.js` (`depthFn`): depth grows with distance from the shore, plus one shoal bank and one canyon that were placed by hand, plus a gentle undulation. Nothing was measured.
- **The tide table** is generated from two sine waves. It is not a prediction for any date or place.
- Camiguin Island is mentioned only as a pointer off the top of the chart; it is not drawn.

A real version would replace the depth grid with a licensed bathymetric dataset (for example GEBCO) or an official chart's soundings, and the tide table with predictions from a hydrographic office.

## Stack

Static HTML, CSS and one JavaScript file. No build step, no dependencies, no runtime libraries. Two web fonts (Spectral and Barlow Semi Condensed) load from Google Fonts and fall back to system fonts.

Honours `prefers-reduced-motion`: the opening sweep of the lead, the entrance fades and the easing of the example lines are skipped. Works at phone width without horizontal scrolling.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

It deploys to GitHub Pages as plain files from the repository root.

## Name

The repository is called `archipelago-marine-cadence`, which promises an archipelago-wide marine product. This study covers one bay. A more honest name would be `macajalar-sounding-line`.

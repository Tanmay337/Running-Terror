# AgriFlow

AgriFlow is a browser-based precision irrigation dashboard demo. It models a farm as four equal field quadrants and combines simulated soil-moisture and weather conditions to help determine irrigation timing and water allocation.

## Features

- **Four-quadrant field view:** Visualizes the farm as four equal zones and presents zone-level conditions.
- **Soil-aware irrigation planning:** Uses soil profiles and moisture values to estimate water needs.
- **Weather-aware dispatch decisions:** Considers forecast precipitation and humidity when recommending whether to irrigate now or wait.
- **Water and reservoir optimization:** Displays water deficit, allocation, and irrigation dispatch information.
- **Interactive simulation:** Run an irrigation cycle and randomize simulated inputs to explore different conditions.
- **Decision telemetry:** Shows key metrics, system status, and explanations for irrigation recommendations.

## Built with

- HTML5
- CSS
- Vanilla JavaScript (ES6+)

## Run locally

This is a static front-end demo. Download or clone the repository and open `index.html` in a modern browser. If your browser restricts local scripts, serve the folder with any basic static HTTP server and visit the local address it provides.

## Project files

- `index.html` — dashboard structure and interface
- `style.css` — dashboard styling
- `app.jss` — JavaScript application logic

> **Note:** The current `index.html` references `app.js`, while the repository file is named `app.jss`. For the interactive controls to load, make those names match (for example, rename `app.jss` to `app.js` or update the script reference).

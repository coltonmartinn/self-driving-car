# Self-Driving City

Search any real place (a city, address or zip code) and watch 100 neural-network cars learn to drive its streets by trial and error, among traffic that already knows the rules of the road. Plain JavaScript and canvas, no libraries. It builds on Radu Mariescu-Istodor's freeCodeCamp course [Build a Virtual World Filled with Self-Driving Cars](https://www.youtube.com/watch?v=5iHejdqYIa8).

## Running it

You need [Node.js](https://nodejs.org). Then either double-click `start.bat` (Windows) or run:

```
node server.js
```

and open http://localhost:8080.

The small server is needed because some OpenStreetMap servers refuse map requests that come straight from a browser. It forwards them with a proper User-Agent, and it caches every area you load in `cache/`, so loading the same place again is instant. Opening `index.html` directly also works, but downloading maps may fail.

## How it works

- **Real places** (`index.html`): the search bar finds the place with [Nominatim](https://nominatim.org) and downloads roads, building footprints, traffic signals, stop and yield signs and crosswalks from [Overpass](https://overpass-api.de). One-way streets are kept one-way.
- **Learning cars**: each car sees with 5 sensor rays and decides with a small neural network. A car is out when it crashes or makes no progress for 5 seconds. When every car is out, the best one's brain is copied and slightly mutated for the next generation (auto-evolve). The score is how far the car got from the start.
- **Traffic**: 30 cars that follow their lane, turn at intersections, keep their distance, stop at red lights and stop signs, and slow for yield signs.
- **Build your own city** (`editor.html`): draw roads, place markings, generate a random city 🎲, or start from a real place and edit it.

## Layout

| Path | Contents |
| --- | --- |
| `server.js` | local server and map proxy |
| `js/places.js`, `js/placeSearch.js` | place search and map download |
| `js/math/osm.js` | turns OpenStreetMap data into roads, buildings and markings |
| `js/math/worldGenerator.js` | random city generator |
| `js/math/spatialGrid.js` | spatial index that keeps big cities fast |
| `js/primitives` | Point, Segment, Polygon, Envelope |
| `js/items` | buildings and trees (fake 3D) |
| `js/markings` | road markings |
| `js/editors` | city builder tools |
| `js/car` | learning car, traffic car, sensor, neural network, visualizer |

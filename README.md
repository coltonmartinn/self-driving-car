# Virtual World + Self-Driving Cars

A world editor and a self-driving car simulator in plain JavaScript and canvas (no libraries), built following Radu Mariescu-Istodor's freeCodeCamp course [Build a Virtual World Filled with Self-Driving Cars](https://www.youtube.com/watch?v=5iHejdqYIa8).

## Running it

Open `index.html` in a browser. No build step or server is needed.

- **World Editor** (`index.html`): draw roads, then place stop/yield signs, crossings, parking spots, traffic lights, a start position and a target. 🎲 generates a random world, and 🗺️ imports real roads from OpenStreetMap.
- **Simulator** (`simulator.html`): press ▶️ Drive in the editor. 100 cars with small neural networks try to drive; press ⏭️ to keep the best brain and evolve the next generation.

## Layout

| Folder | Contents |
| --- | --- |
| `js/primitives` | Point, Segment, Polygon, Envelope |
| `js/math` | utils, Graph, OpenStreetMap parser, random world generator |
| `js/items` | buildings and trees (fake 3D) |
| `js/markings` | road markings |
| `js/editors` | graph editor and marking editors |
| `js/car` | car, sensor, neural network, controls, network visualizer |

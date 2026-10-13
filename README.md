# Self-Driving City

[![tests](https://github.com/coltonmartinn/self-driving-car/actions/workflows/test.yml/badge.svg)](https://github.com/coltonmartinn/self-driving-car/actions/workflows/test.yml)
[![live demo](https://img.shields.io/badge/demo-live-2457f5)](https://coltonmartinn.github.io/self-driving-car/)

**Learn the rules of the road on real streets, then watch an AI learn them too.**

Self-Driving City is a driving simulator built on real OpenStreetMap data. In **Driving School**, new drivers practice stop signs, traffic lights, turn signals and following distance among rule-following traffic. A coach grades every drive like a road test. In the **AI Lab**, a hundred neural-network cars teach themselves to drive the same streets by evolution.

**▶ [Try it live](https://coltonmartinn.github.io/self-driving-car/)**. It runs in the browser and works on phones.

![A student signals, comes to a full stop at a stop sign, gets praise from the coach, and turns right](docs/driving-school-demo.gif)

Plain JavaScript and HTML canvas, with **no libraries and no build step**. It started from Radu Mariescu-Istodor's freeCodeCamp course [Build a Virtual World Filled with Self-Driving Cars](https://www.youtube.com/watch?v=5iHejdqYIa8) and grew well beyond it.

## 🚦 Driving School

| Pick a lesson and a place | Graded like a road test |
| --- | --- |
| ![Lesson picker](docs/screenshots/lessons.png) | ![Report card](docs/screenshots/report-card.png) |

Ten lessons, from your first drive to a final road test, in five real cities, your own town (search any place), or a city you built yourself:

| Lesson | What the coach checks |
| --- | --- |
| 🚗 First drive | Staying in your lane, speed, not hitting anything |
| 🛑 Stop signs | A full stop behind the line (rolling stops cost points; driving through fails) |
| 🚦 Traffic lights | Never crossing the stop line on red |
| ↪️ Turn signals | Signaling before each turn, and in the right direction |
| ↔️ Following distance | The 2-second rule, measured from your speed and the gap to the car ahead |
| 🚶 Crosswalks | Stopping for people on foot, and waiting until they've crossed |
| 🅿️ Pulling over | Signaling, then stopping inside a marked space at the curb, parallel to it |
| ⚠️ Hazards | Surprises with no warning: the car ahead brakes hard, someone runs into the road. Measures your reaction time |
| 🌙 Night & rain | Only headlights and streetlights to see by, wet brakes, and a 3-second following distance |
| 🎓 Road test | Everything at once. Score 80+ with no critical mistakes to pass |

**How the coach works** ([`js/school/coach.js`](js/school/coach.js)). Every frame it compares the car with the world, the way an examiner would:

- **Stop signs and lights.** It tracks the distance from the car's front bumper to each stop line ahead in its lane, records the slowest speed on approach, and judges the moment the bumper crosses the line: was the car fully stopped, and was the light red?
- **Following distance.** It finds the nearest car ahead in the same lane, going the same way, and divides the gap by your speed. Under 2 seconds for 1.5 s straight counts as tailgating.
- **Lane position.** It projects the car onto the nearest road and checks which side of the center line it's on, outside junctions and when driving along the road (so turning across a lane isn't flagged).
- **Turn signals.** It detects a turn as a big heading change while passing through a junction, then checks which signal was on during the approach. Like a real car, the signal clicks off after the turn.
- **Crosswalks.** Pedestrians wait at the curb for a safe gap, then walk across. Driving into a crosswalk while someone is on the road fails the drive, as on a real test. Traffic stops for them too.
- **Crashes.** It tells apart hitting the curb, a car, or a pedestrian, and being hit while stopped (not your fault, no penalty).

Mistakes are *minor* (−3), *major* (−10) or *critical* (fails the drive), and each comes with a tip written for new drivers. The coach is plain logic with no drawing, so all of it is unit-tested in Node.

**For parents and teachers.** These need no accounts and no server:

- **Progress report.** Lessons passed, practice time, recent drives, and the mistakes that keep coming up, each with a tip. It prints cleanly, and a student can send it as a link that carries the whole report.
- **Class view** ([`class.html`](class.html)). A teacher pastes the students' links to see the class in one table, plus the mistakes most students make, to teach next. Nothing is uploaded.
- **Permit test practice** ([`quiz.html`](quiz.html)). 40 rules-of-the-road questions (signs, signals, right-of-way, lane markings, safe driving), each with an explanation.
- **Supervised practice log** ([`log.html`](log.html)). Logs real drives with a parent toward the hours most states require, including night hours and conditions. It suggests what to practice next, based on the student's simulator mistakes, and exports to CSV or print.
- **Certificate and badges.** Passing the road test unlocks a printable practice certificate, and 12 badges reward milestones such as a clean drive, Night & rain, a 90%+ permit quiz, or 5 logged real drives.
- **Installable app.** It installs to a phone, tablet or Chromebook home screen and works offline, thanks to a service worker that saves every page and city.

**Built for learning to drive.** Directions are turn-by-turn and reroute after a missed turn. The view turns with the car, so ahead is always up. US-style signs, speed limits in mph, keyboard or on-screen pedals. Progress is saved per lesson.

> Practice, not a substitute: this helps you learn the rules, but it doesn't replace a licensed instructor, your state's driver's manual, or supervised hours behind the wheel.

## 🧠 AI Lab

![AI cars learning to follow a GPS route near the Louvre, with the best car's neural network on the right](docs/screenshots/ai-lab.png)

Each AI car sees through 5 sensor rays and gets its speed plus 2 GPS signals ("the route bends left / right"). A small neural network (8 → 8 → 4) chooses gas, steering and brake. After each generation, the best brains are bred, through crossover and mutation, into the next 100 cars. The best brain is drawn live, and a chart tracks progress.

**Measured, not eyeballed.** A headless trainer runs the same simulation without drawing, with seeded randomness so runs repeat exactly. [The experiments](docs/experiments/README.md) compare four setups over 3 seeds each, scored on held-out trips:

- **GPS inputs are essential.** Without them, cars arrive on 2% of trips.
- **My crossover idea alone didn't beat the course's mutate-the-best approach.**
- **What did help: scoring each brain on 3 trips per generation instead of 1.** This more than doubled best-checkpoint arrivals (49% vs 22%), because single-trip scores mostly reward getting an easy route.
- **The shipped pre-trained brain completes about 40% of trips it has never seen** (36–46% on two fresh sets of 50), and drives 67–76% of the route on average.

## 🏗️ City Builder

![City builder with a randomly generated town](docs/screenshots/city-builder.png)

Draw roads, place signs, lights and crosswalks, generate a random town, or start from a real place and edit it. Then practice driving there, or train the AI on it.

## Run it locally

Requires [Node.js](https://nodejs.org) 22 or newer. There are no dependencies to run it.

```
node server.js        # or double-click start.bat on Windows
```

Open http://localhost:8080. The local server proxies map downloads, which makes searching for new places more reliable than the live demo, where some map servers refuse browser requests.

| Command | What it does |
| --- | --- |
| `npm test` | 82 tests (`node:test`): geometry, map import, routing, traffic, pedestrians, learning, the driving coach, progress reports, the quiz, and offline caching |
| `npm run typecheck` | TypeScript checks the plain JavaScript (`checkJs`), with no build step |
| `npm run lint` | ESLint |
| `node scripts/train.js --generations 150 --trips-per-gen 3 --out brain.json` | Train a brain headless (see [experiments](docs/experiments/README.md)) |
| `node scripts/evaluate.js brain.json` | Score a brain on 50 fresh trips |
| `node scripts/bundle-cities.js` | Re-download the five bundled cities |

CI runs the tests, type check and lint on Node 22 and 24.

## How it works

```mermaid
flowchart LR
    A[Search box] -->|place name| B[Nominatim<br/>geocoding]
    B -->|lat, lon| C[Overpass API<br/>via server.js proxy]
    C -->|map JSON| E[Web Worker]
    E -->|project lat/lon, roads,<br/>buildings, signals| F[World]
    F --> G[Simulation]
    G --> I[Traffic cars<br/>lanes + rules]
    G --> S[Student car<br/>keyboard / touch]
    S --> K[Coach<br/>rules → report card]
    G --> H[AI cars<br/>sensors + GPS → neural net]
    H --> J[Genetic algorithm]
    J --> H
```

| Piece | Where | Notes |
| --- | --- | --- |
| Driving School | `drive.html`, `js/school/` | Coach, lessons, sign and crosswalk placement, route picking, turn-by-turn directions, touch controls |
| Reports and quiz | `js/school/progress.js`, `js/school/quiz.js`, `class.html`, `quiz.html` | Drive history summaries, share links encoded in the URL, class roll-ups, permit questions |
| Offline app | `sw.js`, `manifest.webmanifest`, `js/pwa.js` | Service worker that saves every page and city; a test checks that every file the pages load is on its list |
| Pedestrians | `js/pedestrians.js` | People who wait for a gap at crosswalks and walk across; traffic and the coach both respect them |
| Simulation | `js/simulation.js` | One frame of cars and traffic with no drawing, shared by the browser pages and the headless trainer |
| Geometry | `js/primitives`, `js/math/utils.js` | Segments, polygons, a crossing-number point-in-polygon test, polygon union for road outlines |
| Spatial index | `js/math/spatialGrid.js` | Uniform grid that makes the road union, collisions, the coach and rendering scale to large cities |
| Map import | `js/math/osm.js`, `js/places.js` | Local tangent-plane projection (10 units per meter), roads, buildings with real heights, signals |
| Background build | `js/worldWorker.js` | Cities are built off the main thread, so the page stays responsive |
| Route finding | `js/math/pathfinding.js` | A* with a binary heap that respects one-way streets; routes measure progress and give GPS hints |
| Learning | `js/car/network.js`, `js/car/genetics.js` | Feed-forward network, elitism plus uniform crossover or mutation-only evolution |
| Traffic | `js/car/trafficCar.js` | Pure-pursuit steering, car following, lights, stop and yield signs, deadlock recovery |
| Training tools | `scripts/` | Seeded headless trainer, fair evaluator, experiment analysis and charts |

## Engineering notes

- **Signs where real maps have none.** OpenStreetMap rarely tags every stop sign, so the school adds lights or stop signs to unmarked intersections. Real streets are split into many short pieces (a median of 10 m at Times Square), too short to hold a sign. So the placer walks back along each street through those pieces to find room, and it picks the same signs for the same intersection every time.
- **Traffic that's safe around a person.** Rule-based traffic used to settle standoffs by briefly ignoring other cars, which would have meant driving through the student. Traffic now never ignores the student, keeps a wider safety cone around them, and if it waits behind a stopped student too long, it leaves the road instead.
- **Honest evaluation.** Picking the best checkpoint on the evaluation trips inflated the shipped brain's score from about 40% to 73%. The experiments report both numbers, plus a separate evaluator on fresh trips.
- **Scaling the geometry.** Merging road shapes into one outline compared every road with every other, so the work grew quadratically. Bucketing shapes in a spatial grid means each road is only compared with its neighbours. Moving the build to a Web Worker keeps the page responsive while it runs.
- **A bug the tests caught.** The original point-in-polygon check miscounted when its ray passed exactly through a corner. It was replaced with the crossing-number rule.
- **Map servers refuse browsers.** Some Overpass servers reject requests that identify as a web browser. The local server forwards requests with a descriptive User-Agent and caches each area. Without it, the browser asks every mirror at once and keeps the first good answer.

## Project layout

```
index.html           landing page
drive.html           Driving School (lessons, progress report, certificate)
quiz.html            permit test practice
log.html             supervised practice hours log
class.html           class view for teachers
sw.js                offline support (service worker)
lab.html             AI Lab: training, GPS trips, network view
editor.html          City Builder
server.js            local server and map proxy
js/
  school/            coach, lessons, sign placement and routes, player controls
  car/               AI car, traffic car, sensor, neural network, genetics, visualizer
  math/              utils, graph, spatial grid, A*, OSM parser, random city generator
  primitives/        Point, Segment, Polygon, Envelope
  items/             buildings and trees (fake 3D)
  markings/          stop, yield, crossing, parking, light, start, target
  editors/           city builder tools
  simulation.js      cars + traffic + pedestrians, no drawing (browser and Node)
  pedestrians.js     people at crosswalks
  places.js          place search and map download
  worldWorker.js     background city building
data/                bundled cities, pre-trained brain
scripts/             trainer, evaluator, experiment analysis, city bundler
docs/experiments/    training experiments: logs, chart, write-up
tests/               node:test suite
```

## License

[MIT](LICENSE).

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. The course that started it: [Radu Mariescu-Istodor](https://www.youtube.com/@Radu) on freeCodeCamp.

# Engineering notes

The problems that took the most thought, how each one showed up, and what
fixed it. Everything here is plain JavaScript with no libraries, and the
simulation code runs unchanged in the browser and in Node, which is what
makes most of the testing below possible.

## 1. Real maps into a drivable world

OpenStreetMap gives roads as lists of latitude/longitude points. The importer
([`js/math/osm.js`](../js/math/osm.js)) projects them onto a flat local plane
(10 units per meter), joins them into a graph, and gives each road a width.
Drawing and collisions need one outline for all the roads together, which
means merging every road's shape into a single polygon.

The first version compared every road shape with every other one, so a city
of a few thousand road pieces took minutes. Bucketing shapes in a uniform
grid ([`js/math/spatialGrid.js`](../js/math/spatialGrid.js)) means each one is
only compared with its neighbours. The same grid now serves collisions, the
coach and rendering. The build runs in a Web Worker so the page stays
responsive while a city loads.

## 2. Signs where the map has none

Map data rarely tags every stop sign, and many suburbs have no crosswalks at
all, so the Driving School adds them. Two things made that harder than it
sounds:

- Real streets are split into many short pieces (a median of 10 m in Times
  Square), often too short to hold a sign. The placer walks back along each
  street through those pieces to find room, and sets the stop line back
  behind any crosswalk at the corner.
- Junctions a few meters apart can both claim the same street, which put two
  traffic lights on one approach, out of sync. A traffic car would stop for
  the red one just past a green one. Placement now skips a sign when there's
  already one facing the same way nearby, and traffic obeys only the nearest
  light ahead.

Placement depends only on each intersection's position, so a city always gets
the same signs.

## 3. Grading driving like an examiner

The coach ([`js/school/coach.js`](../js/school/coach.js)) runs every frame and
keeps a small state machine for each thing it judges:

- **Stop lines.** For each sign or light ahead in the car's lane, it tracks the
  distance from the front bumper to the line and the slowest speed on the
  approach. The judgment happens at the frame the bumper crosses the line: a
  full stop, a rolling stop, or no stop; a red light or not.
- **Turns.** A turn is a large heading change while passing through a
  junction, and the coach checks which signal was on around it. The first
  version took the difference between the heading going in and coming out,
  wrapped to ±180°. Two right turns in quick succession add up to almost
  180°, which wrapped around to look like a left turn, so a correct right
  signal was marked wrong. It now adds up the change frame by frame, which
  can't wrap.
- **Fairness.** Several calls were technically right but felt wrong to a
  student, and were changed: a person on the far curb doesn't count as
  "didn't yield"; being hit while stopped isn't your crash; passing a
  double-parked truck isn't "driving on the wrong side"; stopping at an
  intersection counts as yielding to an ambulance, because you can't pull
  over in the middle of one.

## 4. Traffic that's safe around a person

The traffic cars ([`js/car/trafficCar.js`](../js/car/trafficCar.js)) follow
their lane with pure-pursuit steering, keep their distance, and obey lights
and signs. Rule-based traffic gets into standoffs at junctions, and the
original fix was to let a stuck car ignore other cars for a moment. That's
fine between traffic cars, but it meant driving through a student. Now:

- Traffic never ignores the student or pedestrians, and gives the student a
  wider berth.
- If a traffic car waits behind a stopped student for 4 seconds, it leaves
  the road instead of pushing through.
- As a last line of defense, each traffic car checks where it will be a few
  frames ahead, with a margin around the student's car. If that would
  overlap, it brakes hard. This came from an ambulance cutting a corner into
  a waiting student, a case none of the other rules covered.

## 5. A demo driver that doubles as a test

Every lesson has a **Show me first** button: a careful driver
([`js/school/autopilot.js`](../js/school/autopilot.js)) drives the lesson and
explains each move. Because the simulation runs in Node, the same driver is
an end-to-end test: [`tests/helpers/lessonRunner.js`](../tests/helpers/lessonRunner.js)
sets up a lesson the way the page does, on a real city map with traffic and
pedestrians, and the demo has to finish with a perfect score.

Running it through every lesson in all five cities, on two different trips
each (now 190 drives, all perfect), found bugs that unit tests hadn't:

- **Pedestrians walked into stopped cars.** The demo stopped at a crosswalk;
  the pedestrian kept walking and hit its side, which the coach scored as
  "hit a pedestrian". The same would have happened to a student. People now
  wait when a car is in their way, and only a car driving into someone
  counts as hitting them.
- **NaN at the end of the route.** Near the destination, the demo's look-ahead
  point ran past the end of the route, so its direction became NaN and it
  stopped steering.
- **Circling a point it couldn't reach.** At a sharp turn, the look-ahead
  point fell inside the car's tightest turning circle, so the car orbited it.
  The demo now looks further ahead until the point is outside that circle.
- **Parking spaces on bends.** On short or winding routes, the pull-over
  space could land on a curve or next to a traffic light. Spaces now go on
  the straightest stretch available.

Each of these is now a regular test. The demo drives are the slowest part
of the suite, at about half a minute.

## 6. Parallel parking by search

The demo parks the textbook way: stop beside the car ahead of the space,
back up with the wheel turned toward the curb, straighten at about 45°, keep
backing, then turn the other way to swing in. With this car's physics (its
tightest turn is a 4 m radius), the first attempts clipped the parked car's
corner. Rather than tune by hand, a short script ran the maneuver with the
real car physics for 180 combinations of where to stop, how far out, the
angle, and when to straighten. It kept the one with the most clearance.
Lengthening the space from 1.75 to 1.9 car lengths (still within the range
real tests use) nearly doubled that clearance, to about 0.7 m.

## 7. Instant replay

Replays record plain snapshots of every car and person (every second frame,
capped at 10 minutes), not references to the live objects, which keep
changing. Traffic lights aren't recorded at all: their state is a function
of the frame count, so the replay just sets the frame count back. Each coach
event already carries the frame it happened in, which places it on the
timeline, and "watch this mistake" starts two seconds before it.

## 8. Teaching an AI to drive, measured honestly

The AI Lab evolves neural-network drivers. A headless trainer runs the same
simulation without drawing and with seeded randomness, so every run can be
repeated exactly. [The experiments](experiments/README.md) compare setups over
several seeds. The biggest lesson was about measurement: choosing the best
checkpoint on the evaluation trips made the shipped brain look like it
finished 73% of trips. On fresh trips it finishes about 40%, and both
numbers are reported.

## 9. Offline, and kept that way

The app installs and works offline through a service worker that saves every
page, script and bundled city. A list like that goes stale the moment a new
file is added, so a test reads every page's script and stylesheet tags and
fails if any file is missing from the list.

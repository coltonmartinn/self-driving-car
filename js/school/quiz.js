// Permit test practice: rules-of-the-road questions found in US driver's
// manuals. Rules differ a little between states, so questions stick to
// what is common everywhere and say "most states" where they vary.
// Pure logic plus the question bank (tested in Node).

// Road signs drawn as small SVGs, so students learn the shapes
const SIGNS = {
   stop:
      "<svg viewBox='0 0 100 100'><polygon points='30,4 70,4 96,30 96,70 70,96 30,96 4,70 4,30' fill='#c8102e' stroke='#fff' stroke-width='4'/>" +
      "<text x='50' y='59' font-size='25' font-weight='800' fill='#fff' text-anchor='middle' font-family='Arial'>STOP</text></svg>",
   yield:
      "<svg viewBox='0 0 100 100'><polygon points='4,10 96,10 50,94' fill='#c8102e'/><polygon points='22,21 78,21 50,72' fill='#fff'/>" +
      "<text x='50' y='40' font-size='12' font-weight='800' fill='#c8102e' text-anchor='middle' font-family='Arial'>YIELD</text></svg>",
   school:
      "<svg viewBox='0 0 100 100'><polygon points='50,4 94,40 94,96 6,96 6,40' fill='#c6e52b' stroke='#111' stroke-width='4'/>" +
      "<circle cx='38' cy='44' r='7' fill='#111'/><circle cx='62' cy='44' r='7' fill='#111'/>" +
      "<path d='M30 56h16v26h-6V68h-4v14h-6zM54 56h16v26h-6V68h-4v14h-6z' fill='#111'/></svg>",
   warning:
      "<svg viewBox='0 0 100 100'><polygon points='50,3 97,50 50,97 3,50' fill='#ffcc00' stroke='#111' stroke-width='4'/>" +
      "<path d='M50 74V30M38 42l12-12 12 12' stroke='#111' stroke-width='7' fill='none' stroke-linecap='round'/></svg>",
   railroad:
      "<svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='46' fill='#ffcc00' stroke='#111' stroke-width='4'/>" +
      "<path d='M22 22L78 78M78 22L22 78' stroke='#111' stroke-width='6'/>" +
      "<text x='26' y='58' font-size='20' font-weight='800' font-family='Arial'>R</text><text x='62' y='58' font-size='20' font-weight='800' font-family='Arial'>R</text></svg>",
   crossbuck:
      "<svg viewBox='0 0 100 100'><g transform='rotate(40 50 50)'><rect x='4' y='40' width='92' height='20' fill='#fff' stroke='#111' stroke-width='3'/></g>" +
      "<g transform='rotate(-40 50 50)'><rect x='4' y='40' width='92' height='20' fill='#fff' stroke='#111' stroke-width='3'/></g></svg>",
   wrongway:
      "<svg viewBox='0 0 100 100'><rect x='4' y='22' width='92' height='56' fill='#c8102e' stroke='#fff' stroke-width='4'/>" +
      "<text x='50' y='46' font-size='17' font-weight='800' fill='#fff' text-anchor='middle' font-family='Arial'>WRONG</text>" +
      "<text x='50' y='68' font-size='17' font-weight='800' fill='#fff' text-anchor='middle' font-family='Arial'>WAY</text></svg>",
   oneway:
      "<svg viewBox='0 0 100 100'><rect x='4' y='30' width='92' height='40' fill='#111'/><polygon points='12,42 70,42 70,36 90,50 70,64 70,58 12,58' fill='#fff'/>" +
      "<text x='40' y='55' font-size='12' font-weight='800' fill='#111' text-anchor='middle' font-family='Arial'>ONE WAY</text></svg>",
};

const QUIZ_BANK = [
   // ---------- signs ----------
   { id: "stop-sign", topic: "Signs", sign: "stop", q: "What must you do at this sign?",
      options: ["Come to a complete stop, then go when it's safe", "Slow down and go if no one is coming", "Stop only if other cars are present", "Honk and continue"],
      why: "A stop sign always means a full stop: at the stop line, or before the crosswalk or intersection if there is no line." },
   { id: "yield-sign", topic: "Signs", sign: "yield", q: "What does this sign tell you to do?",
      options: ["Slow down and give the right-of-way to traffic and pedestrians, stopping if needed", "Stop completely every time", "Speed up to merge ahead of traffic", "Nothing unless a police officer is present"],
      why: "Yield means let others go first. You only have to stop if traffic or pedestrians are in the way." },
   { id: "school-sign", topic: "Signs", sign: "school", q: "A five-sided (pentagon) sign like this one means:",
      options: ["A school zone or school crossing is ahead", "A railroad crossing is ahead", "A hospital is nearby", "The road ends"],
      why: "The pentagon shape is used only for school zones and school crossings. Slow down and watch for children." },
   { id: "diamond-sign", topic: "Signs", sign: "warning", q: "Yellow diamond-shaped signs are used to:",
      options: ["Warn you about a hazard or change in the road ahead", "Show the speed limit", "Mark a place to park", "Give directions to a city"],
      why: "Diamond signs are warnings: curves, merging lanes, slippery roads, deer crossings and so on." },
   { id: "railroad-sign", topic: "Signs", sign: "railroad", q: "A round yellow sign with an X and two R's means:",
      options: ["A railroad crossing is ahead", "Rest area ahead", "Road repairs ahead", "Right turns are not allowed"],
      why: "This advance warning sign tells you to slow down, look and listen for trains before the crossing." },
   { id: "crossbuck", topic: "Signs", sign: "crossbuck", q: "This white X-shaped sign at a railroad crossing means:",
      options: ["Yield to trains: look, listen, and stop if one is coming", "The crossing is closed", "Trains must stop for cars", "You may not cross at night"],
      why: "The crossbuck marks the crossing itself. Trains always have the right-of-way." },
   { id: "wrong-way", topic: "Signs", sign: "wrongway", q: "You see this sign facing you as you turn onto a ramp. What should you do?",
      options: ["You're going against traffic: stop and turn around safely", "Continue carefully", "Speed up to get through quickly", "Turn on your hazard lights and keep going"],
      why: "A WRONG WAY sign means you are entering a road or ramp against the flow of traffic." },
   { id: "one-way", topic: "Signs", sign: "oneway", q: "What does this sign mean?",
      options: ["Traffic on this street moves only in the direction of the arrow", "Turn only in the direction of the arrow at the next corner", "The lane ends ahead", "Passing is allowed"],
      why: "On a one-way street every vehicle travels in the arrow's direction." },

   // ---------- signals ----------
   { id: "yellow-light", topic: "Signals", q: "A steady yellow traffic light means:",
      options: ["The light is about to turn red: stop if you can do so safely", "Speed up to get through before it turns red", "Go, the way is clear", "Stop only if a police car is present"],
      why: "Yellow is a warning that red is coming. If you can stop safely, stop. If you're too close to stop safely, continue through carefully." },
   { id: "flashing-red", topic: "Signals", q: "A flashing red traffic light means:",
      options: ["Treat it like a stop sign: stop completely, then go when it's safe", "Slow down and proceed with caution", "The light is broken, ignore it", "Wait until it turns green"],
      why: "A flashing red light has the same meaning as a stop sign." },
   { id: "flashing-yellow", topic: "Signals", q: "A flashing yellow traffic light means:",
      options: ["Slow down and proceed with caution", "Stop completely", "The light will turn green soon", "You must turn right"],
      why: "Flashing yellow is a caution signal. You don't have to stop, but be ready to." },
   { id: "green-left", topic: "Signals", q: "You're turning left on a solid green light (no arrow). Who goes first?",
      options: ["Oncoming traffic and pedestrians: wait for a safe gap", "You do, because your light is green", "Whoever is bigger", "Whoever honks first"],
      why: "A green ball lets you turn left, but you must yield to oncoming vehicles and pedestrians in the crosswalk." },
   { id: "green-arrow", topic: "Signals", q: "A green left-turn arrow means:",
      options: ["You may turn left; oncoming traffic is stopped", "You must wait for oncoming traffic", "Left turns are not allowed", "Turn left only if you're in a bus"],
      why: "A green arrow is a protected turn: traffic that would conflict with you has a red light. Still check for anyone running the light." },
   { id: "right-on-red", topic: "Signals", q: "In most states, can you turn right at a red light?",
      options: ["Yes, after a complete stop and yielding, unless a sign says No Turn on Red", "Yes, without stopping", "Never", "Only between midnight and 6 a.m."],
      why: "Most states allow right on red after a full stop, yielding to pedestrians and traffic, unless a sign forbids it." },

   // ---------- right-of-way ----------
   { id: "four-way", topic: "Right-of-way", q: "At a four-way stop, two cars arrive at the same time. Who goes first?",
      options: ["The car on the right", "The car on the left", "The faster car", "The car going straight, always"],
      why: "First to stop goes first. If two arrive at the same time, the driver on the left yields to the driver on the right." },
   { id: "crosswalk", topic: "Right-of-way", q: "A pedestrian is crossing in a crosswalk ahead of you. You should:",
      options: ["Stop and wait until they have crossed safely", "Honk so they hurry", "Drive around them", "Keep going if they're not in your lane yet"],
      why: "Pedestrians in a crosswalk have the right-of-way. Stop before the crosswalk and wait." },
   { id: "emergency", topic: "Right-of-way", q: "An ambulance with flashing lights and a siren is coming up behind you. You should:",
      options: ["Pull over to the right edge of the road and stop", "Speed up to stay ahead of it", "Stop immediately in your lane", "Keep driving normally"],
      why: "Pull to the right and stop (not in an intersection), and wait until it has passed." },
   { id: "school-bus", topic: "Right-of-way", q: "The school bus ahead of you stops, flashes red lights and extends its stop arm. You must:",
      options: ["Stop and stay stopped until the lights stop flashing", "Pass slowly on the left", "Honk to warn the children", "Stop only if you see children"],
      why: "Children may cross in front of the bus. Stop and wait until the red lights stop and the arm is pulled in." },
   { id: "roundabout", topic: "Right-of-way", q: "When entering a roundabout, you should:",
      options: ["Yield to traffic already in the roundabout", "Expect traffic in the roundabout to yield to you", "Stop in the middle if you miss your exit", "Drive clockwise"],
      why: "Traffic in the circle has the right-of-way. In the US, roundabouts go counterclockwise. If you miss your exit, go around again." },
   { id: "merging", topic: "Right-of-way", q: "When merging onto a highway from an on-ramp, you should:",
      options: ["Use the ramp to match the speed of traffic and merge into a gap", "Stop at the end of the ramp and wait", "Merge slowly so others see you", "Expect highway traffic to let you in"],
      why: "Get up to the speed of traffic in the acceleration lane, signal, check your blind spot, and merge into a safe gap." },

   // ---------- lanes ----------
   { id: "solid-yellow", topic: "Lanes", q: "A solid yellow line on your side of the center line means:",
      options: ["Do not pass", "Passing is allowed when safe", "The lane is for buses", "The road is one-way"],
      why: "A solid line on your side means passing is not allowed there." },
   { id: "broken-yellow", topic: "Lanes", q: "A broken (dashed) yellow center line means:",
      options: ["You may pass when it's safe", "Passing is never allowed", "The lane is ending", "Traffic moves in the same direction on both sides"],
      why: "Broken yellow lines allow passing if the way is clear. Yellow lines separate traffic going in opposite directions." },
   { id: "white-lines", topic: "Lanes", q: "White lane lines separate:",
      options: ["Lanes of traffic going in the same direction", "Traffic going in opposite directions", "Parking spaces only", "Bike lanes only"],
      why: "White lines separate lanes going the same way. Yellow lines separate opposite directions." },
   { id: "center-turn", topic: "Lanes", q: "A center lane marked with turn arrows in both directions is for:",
      options: ["Starting or finishing a left turn", "Passing slower cars", "Driving in heavy traffic", "Parking"],
      why: "A two-way left-turn lane is only for left turns. Don't use it to pass or as a travel lane." },
   { id: "blind-spot", topic: "Lanes", q: "Before changing lanes, you should:",
      options: ["Signal, check your mirrors, and look over your shoulder", "Check only your rearview mirror", "Change lanes quickly so no one can get in the way", "Honk"],
      why: "Mirrors leave blind spots. A quick look over your shoulder shows cars your mirrors miss." },
   { id: "signal-distance", topic: "Lanes", q: "In most states, how far before a turn should you start signaling?",
      options: ["At least 100 feet", "10 feet", "Right as you turn", "Signaling is optional"],
      why: "Most states require signaling at least 100 feet before turning, so others know what you're about to do." },

   // ---------- safe driving ----------
   { id: "following", topic: "Safe driving", q: "In good conditions, how much following distance should you keep behind the car ahead?",
      options: ["At least 2 to 3 seconds", "Half a second", "One car length at any speed", "As close as possible to keep traffic moving"],
      why: "Count the seconds after the car ahead passes a fixed point. Many manuals recommend 3 seconds or more, and more in bad weather." },
   { id: "bad-weather", topic: "Safe driving", q: "In rain, fog, or at night you should:",
      options: ["Slow down and increase your following distance", "Keep the same speed as usual", "Drive with your high beams in fog", "Follow the car ahead closely to see its lights"],
      why: "It takes longer to see hazards and to stop. Slow down and leave more room." },
   { id: "hydroplane", topic: "Safe driving", q: "Your car starts to hydroplane (slide on water). You should:",
      options: ["Ease off the gas and steer straight; don't slam the brakes", "Brake hard right away", "Speed up to get through the water", "Turn the wheel sharply"],
      why: "Let the car slow down on its own until the tires grip the road again." },
   { id: "skid", topic: "Safe driving", q: "If your car skids, you should steer:",
      options: ["In the direction you want the front of the car to go", "The opposite way from where you want to go", "Hard left, then hard right", "Not at all"],
      why: "Look and steer where you want to go, and avoid hard braking." },
   { id: "texting", topic: "Safe driving", q: "When is it OK to text while driving?",
      options: ["Never: pull over and park first", "At red lights", "On empty roads", "If you keep one hand on the wheel"],
      why: "Texting takes your eyes, hands and mind off driving. It's illegal in most states, and for new drivers in nearly all of them." },
   { id: "zero-tolerance", topic: "Safe driving", q: "Every state has a zero tolerance law for drivers under 21. It means:",
      options: ["Driving with even a small amount of alcohol is illegal", "You can drink one drink before driving", "Only drunk driving at night is illegal", "It applies only to passengers"],
      why: "For drivers under 21, almost any detectable alcohol can lose you your license." },
   { id: "drowsy", topic: "Safe driving", q: "You feel sleepy while driving. The safest thing to do is:",
      options: ["Pull over somewhere safe and rest", "Turn up the radio", "Open the window and keep going", "Drive faster to get home sooner"],
      why: "Drowsy driving is as dangerous as drunk driving. Radio and fresh air don't fix it; only rest does." },
   { id: "seat-belts", topic: "Safe driving", q: "Who should wear a seat belt?",
      options: ["Everyone in the car, on every trip", "Only the driver", "Only on highways", "Only passengers in the front"],
      why: "Seat belts are the best protection in a crash. Many states require them for everyone, and especially in a teen driver's car." },
   { id: "being-passed", topic: "Safe driving", q: "Another car is passing you. You should:",
      options: ["Stay in your lane and keep a steady speed (or slow slightly)", "Speed up so they can't pass", "Move toward the center line", "Brake hard"],
      why: "Help the other driver pass safely. Never speed up while being passed." },
   { id: "high-beams", topic: "Safe driving", q: "When should you switch from high beams to low beams?",
      options: ["Within about 500 feet of an oncoming car, or when following another car", "Only in the city", "Never at night", "Only when it rains"],
      why: "High beams blind other drivers. Dim them for oncoming traffic (about 500 feet in most states) and when following someone." },
   { id: "headlights", topic: "Safe driving", q: "When must you use your headlights?",
      options: ["From sunset to sunrise, and whenever it's hard to see", "Only after midnight", "Only on highways", "Only when other cars have them on"],
      why: "Headlights help you see and help others see you. Many states also require them whenever your wipers are on." },
   { id: "brake-failure", topic: "Safe driving", q: "Your brakes suddenly stop working. What should you do?",
      options: ["Pump the brake pedal, shift to a lower gear, and use the parking brake gently", "Turn off the engine right away", "Jump out of the car", "Steer into oncoming traffic"],
      why: "Pumping may restore pressure. A lower gear and a gentle parking brake help slow the car down." },

   // ---------- parking ----------
   { id: "uphill-curb", topic: "Parking", q: "Parking uphill next to a curb, you should turn your front wheels:",
      options: ["Away from the curb", "Toward the curb", "Straight ahead", "It doesn't matter"],
      why: "If the car rolls back, the tires catch the curb. Downhill, turn the wheels toward the curb." },
   { id: "hydrant", topic: "Parking", q: "In most states, how close may you park to a fire hydrant?",
      options: ["No closer than 15 feet", "1 foot", "Any distance if you stay in the car", "Right in front of it is fine at night"],
      why: "Firefighters need room to reach hydrants. Most states set the limit at 15 feet." },
];

const Quiz = {
   PASS_PERCENT: 80,

   // A practice test: `count` questions, in random order, answers shuffled
   create(bank, count, random = Math.random) {
      const shuffle = (list) => {
         const a = [...list];
         for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
         }
         return a;
      };
      return shuffle(bank).slice(0, count).map((item) => {
         // options[0] is the right answer in the bank
         const order = shuffle(item.options.map((_, i) => i));
         return {
            ...item,
            options: order.map((i) => item.options[i]),
            answer: order.indexOf(0),
         };
      });
   },

   // answers: chosen option index per question
   grade(questions, answers) {
      const correct = questions.filter((q, i) => answers[i] == q.answer).length;
      const percent = Math.round((correct / questions.length) * 100);
      const missedTopics = {};
      questions.forEach((q, i) => {
         if (answers[i] != q.answer) {
            missedTopics[q.topic] = (missedTopics[q.topic] || 0) + 1;
         }
      });
      return { correct, total: questions.length, percent, passed: percent >= Quiz.PASS_PERCENT, missedTopics };
   },
};

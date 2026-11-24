// Built-in catalog, gyms, slots and routines. Catalog format: name | es aliases | muscle | equipment | type
// type: wr = weight+reps, bw = bodyweight (+/- extra kg), rr = reps only, t = time
import { slug } from './logic/csv.js';
import { akey } from './logic/substitution.js';

export const EQUIPMENT = [
  ['cable', 'Dual cable station'], ['pullupbar', 'Pull-up bar'], ['shoulderpress', 'Shoulder press machine'],
  ['lat', 'Vertical traction (lat pulldown)'], ['row', 'Seated row machine'], ['legext', 'Leg extension'],
  ['legcurl', 'Leg curl machine'], ['legpress', 'Leg press'], ['hack', 'Hack squat'], ['chestmachine', 'Chest press / pec deck'],
  ['bench', 'Adjustable bench'], ['barbell', 'Barbell & rack'], ['dumbbell', 'Dumbbells'], ['dumbbell-screw', 'Screw-on dumbbells'],
  ['kettlebell', 'Kettlebells'], ['medball', 'Medicine balls'], ['fitball', 'Stability ball'], ['wallbars', 'Wall bars'],
  ['dip', 'Dip station'], ['calf', 'Calf raise machine'], ['smith', 'Smith machine'], ['trapbar', 'Trap bar'], ['glute', 'Glute machine'],
];

const RAW = `
Cable External Shoulder Rotation|rotacion externa hombro polea|Rotator cuff|cable|wr
Cable Internal Shoulder Rotation|rotacion interna hombro polea|Rotator cuff|cable|wr
Cable Chest Press|press de pecho polea|Chest|cable|wr
Standing Cable Chest Fly (Lower Position)|aperturas polea baja|Chest|cable|wr
Standing Cable Chest Fly|aperturas polea cruce|Chest|cable|wr
Cable Crossover|cruce de poleas|Chest|cable|wr
Bench Press|press banca barra|Chest|barbell,bench|wr
Incline Bench Press|press banca inclinado|Chest|barbell,bench|wr
Dumbbell Chest Press|press pecho mancuernas|Chest|dumbbell,bench|wr
Incline Dumbbell Press|press inclinado mancuernas|Chest|dumbbell,bench|wr
Dumbbell Fly|aperturas mancuernas|Chest|dumbbell,bench|wr
Machine Chest Press|press pecho maquina|Chest|chestmachine|wr
Machine Chest Fly|aperturas maquina|Chest|chestmachine|wr
Pec Deck|contractora pectoral|Chest|chestmachine|wr
Push-Up|flexiones|Chest|bodyweight|bw
Bar Dip|fondos paralelas|Chest|dip|bw
Machine Shoulder Press|press hombro maquina|Shoulders|shoulderpress|wr
Dumbbell Shoulder Press|press militar mancuernas|Shoulders|dumbbell|wr
Overhead Press|press militar barra|Shoulders|barbell|wr
Cable Lateral Raise|elevaciones laterales polea|Shoulders|cable|wr
Dumbbell Lateral Raise|elevaciones laterales mancuernas|Shoulders|dumbbell|wr
Machine Lateral Raise|elevaciones laterales maquina|Shoulders|machine|wr
Reverse Machine Fly|pajaros maquina deltoide posterior|Rear delts|chestmachine|wr
Face Pull|face pull tiron a la cara|Rear delts|cable|wr
Dumbbell Rear Delt Fly|pajaros mancuernas|Rear delts|dumbbell|wr
Upright Row|remo al menton|Shoulders|barbell|wr
Triceps Pushdown With Bar|extension triceps polea barra|Triceps|cable|wr
Triceps Pushdown With Rope|extension triceps polea cuerda|Triceps|cable|wr
Cable Overhead Triceps Extension|extension triceps sobre la cabeza polea|Triceps|cable|wr
Overhead Cable Triceps Extension from Upper Position|extension triceps polea alta|Triceps|cable|wr
Crossbody Cable Triceps Extension|extension triceps cruzada|Triceps|cable|wr
Skull Crusher|press frances rompecraneos|Triceps|barbell,bench|wr
Dumbbell Overhead Triceps Extension|press frances mancuerna|Triceps|dumbbell|wr
Pull-Up|dominadas|Back|pullupbar|bw
Chin-Up|dominadas supinas|Back|pullupbar|bw
Lat Pulldown|jalon al pecho|Back|lat|wr
Machine Lat Pulldown|jalon vertical technogym traccion vertical|Back|lat|wr
Seated Machine Row|remo sentado maquina|Back|row|wr
Seated Cable Row|remo sentado polea|Back|cable|wr
Barbell Row|remo con barra|Back|barbell|wr
Dumbbell Row|remo con mancuerna|Back|dumbbell,bench|wr
One-Arm Cable Row|remo una mano polea|Back|cable|wr
Straight Arm Lat Pulldown|pullover polea brazos rectos|Back|cable|wr
Bar Hang|colgarse de la barra|Back|pullupbar|t
Barbell Curl|curl con barra|Biceps|barbell|wr
Cable Curl With Bar|curl polea barra|Biceps|cable|wr
Dumbbell Curl|curl mancuernas|Biceps|dumbbell|wr
Hammer Curl|curl martillo|Biceps|dumbbell|wr
Dumbbell Hammer Curl|curl martillo mancuernas|Biceps|dumbbell|wr
Incline Dumbbell Curl|curl inclinado|Biceps|dumbbell,bench|wr
Preacher Curl|curl predicador|Biceps|machine|wr
Goblet Squat|sentadilla goblet|Quads|dumbbell|wr
Squat|sentadilla barra|Quads|barbell|wr
Front Squat|sentadilla frontal|Quads|barbell|wr
Hack Squat Machine|sentadilla hack|Quads|hack|wr
Leg Press|prensa|Quads|legpress|wr
Seated Leg Press|prensa sentado|Quads|legpress|wr
Calf Raise in Leg Press|gemelos en prensa|Calves|legpress|wr
Leg Extension|extension de cuadriceps|Quads|legext|wr
Bulgarian Split Squat|sentadilla bulgara|Quads|bench,dumbbell|wr
Walking Lunge|zancadas|Quads|dumbbell|wr
Romanian Deadlift|peso muerto rumano|Hamstrings|barbell|wr
Dumbbell Romanian Deadlift|peso muerto rumano mancuernas|Hamstrings|dumbbell|wr
Kettlebell Romanian Deadlift|peso muerto rumano kettlebell|Hamstrings|kettlebell|wr
Trap Bar Deadlift With Low Handles|peso muerto barra hexagonal|Hamstrings|trapbar|wr
Deadlift|peso muerto|Back|barbell|wr
Seated Leg Curl|curl femoral sentado|Hamstrings|legcurl|wr
Lying Leg Curl|curl femoral tumbado|Hamstrings|legcurl|wr
Stability Ball Leg Curl|curl femoral fitball|Hamstrings|fitball|rr
Hip Thrust|empuje de cadera|Glutes|barbell,bench|wr
Machine Glute Kickback|patada de gluteo maquina|Glutes|glute|wr
Dumbbell Standing Calf Raise|gemelos de pie mancuerna|Calves|dumbbell|wr
Standing Calf Raise|gemelos de pie|Calves|calf|wr
Seated Calf Raise|gemelos sentado|Calves|calf|wr
Cable Crunch|crunch en polea|Abs|cable|wr
Hanging Leg Raise|elevacion de piernas colgado|Abs|pullupbar|rr
Pallof Press|press pallof|Abs|cable|wr
Stability Ball Rollout|rollout fitball|Abs|fitball|rr
Dead Bug|bicho muerto|Abs|bodyweight|rr
Plank|plancha|Abs|bodyweight|t
Side Plank|plancha lateral|Abs|bodyweight|t
Crunch|crunch abdominal|Abs|bodyweight|rr
Sit-Up|abdominales|Abs|bodyweight|rr
Decline Bench Sit-Up|abdominales banco declinado|Abs|bench|rr
Farmer's Walk|paseo del granjero|Full body|kettlebell|t
Kettlebell Swing|swing kettlebell|Full body|kettlebell|wr
Cat-Cow|gato-vaca|Mobility|bodyweight|rr
90/90 Hip Switch|90/90 cadera|Mobility|bodyweight|rr
Lunge With Thoracic Rotation|zancada con rotacion toracica|Mobility|bodyweight|rr
Open Book|libro abierto|Mobility|bodyweight|rr
Hip Flexor Stretch|estiramiento flexores cadera|Mobility|bodyweight|t
Hamstring Stretch|estiramiento isquios|Mobility|bodyweight|t
`.trim();

export const CATALOG = RAW.split('\n').map((l) => {
  const [name, al, muscle, eq, type] = l.split('|');
  return { id: slug(name), name, aliases: al.split(';').filter(Boolean), muscle, equipment: eq.split(',').filter((x) => x !== 'bodyweight' && x !== 'machine'), type, builtin: true };
});

export const SLOTS = [
  ['ext-rot', 'Shoulder external rotation'], ['chest-press', 'Chest press'], ['chest-fly', 'Chest fly'],
  ['shoulder-press', 'Shoulder press'], ['lateral', 'Lateral raise'], ['pushdown', 'Triceps pushdown'], ['overhead-tri', 'Overhead triceps'],
  ['face-pull', 'Rear delts / face pull'], ['vert-pull', 'Vertical pull'], ['row', 'Row'], ['straight-arm', 'Straight-arm pulldown'],
  ['bi-curl', 'Biceps curl'], ['hammer', 'Hammer curl'],
  ['squat', 'Squat pattern'], ['leg-curl', 'Leg curl'], ['split-squat', 'Split squat'], ['calf', 'Calf raise'], ['rdl', 'Hip hinge'], ['leg-ext', 'Leg extension'],
].map(([id, name]) => ({ id, name }));

const warm = (id, slotId, sets, r) => ({ id, label: 'Warm-up', kind: 'warmup', rounds: sets, restSec: 45, items: [{ slotId, repMin: r, repMax: r }] });
const blk = (id, label, rounds, items) => ({ id, label, kind: 'superset', rounds, restSec: null, items: items.map(([slotId, repMin, repMax]) => ({ slotId, repMin, repMax })) });

export const ROUTINES = [
  { id: 'push', name: 'Push', blocks: [warm('w', 'ext-rot', 2, 12),
    blk('a', 'A', 4, [['chest-press', 10, 12], ['chest-fly', 12, 15]]),
    blk('b', 'B', 4, [['shoulder-press', 8, 12], ['lateral', 12, 15]]),
    blk('c', 'C', 3, [['pushdown', 12, 12], ['overhead-tri', 12, 12]])] },
  { id: 'pull', name: 'Pull', blocks: [warm('w', 'face-pull', 2, 15),
    blk('a', 'A', 4, [['vert-pull', 8, 12], ['row', 10, 12]]),
    blk('b', 'B', 4, [['face-pull', 15, 20], ['straight-arm', 12, 12]]),
    blk('c', 'C', 3, [['bi-curl', 10, 12], ['hammer', 12, 12]])] },
  { id: 'leg', name: 'Leg', blocks: [warm('w', 'squat', 1, 10),
    blk('a', 'A', 4, [['squat', 10, 15], ['leg-curl', 10, 15]]),
    blk('b', 'B', 3, [['split-squat', 8, 10], ['calf', 15, 15]]),
    blk('c', 'C', 3, [['rdl', 10, 12], ['leg-ext', 12, 15]])] },
];

const OFFICE_EQ = ['cable', 'pullupbar', 'shoulderpress', 'lat', 'row', 'legext', 'bench', 'dumbbell-screw', 'kettlebell', 'medball', 'fitball', 'wallbars'];

export function seedGyms() {
  const mk = (id, name, on, extra) => ({ id, name, increment: 2.5, maxDumbbell: null, equipment: EQUIPMENT.map(([key, label]) => ({ key, label, on: on(key) })), ...extra });
  return [
    mk('office', 'Office', (k) => OFFICE_EQ.includes(k), { note: 'Screw-on dumbbells: avoid when there is an alternative.' }),
    mk('big', 'Big gym', (k) => k !== 'dumbbell-screw', { maxDumbbell: null }),
  ];
}

const A = {
  office: { 'ext-rot': 'cable-external-shoulder-rotation', 'chest-press': 'cable-chest-press', 'chest-fly': 'standing-cable-chest-fly-lower-position',
    'shoulder-press': 'machine-shoulder-press', lateral: 'cable-lateral-raise', pushdown: 'triceps-pushdown-with-bar', 'overhead-tri': 'cable-overhead-triceps-extension',
    'face-pull': 'face-pull', 'vert-pull': 'pull-up', row: 'seated-machine-row', 'straight-arm': 'straight-arm-lat-pulldown', 'bi-curl': 'cable-curl-with-bar',
    hammer: 'dumbbell-hammer-curl', squat: 'goblet-squat', 'leg-curl': 'stability-ball-leg-curl', 'split-squat': 'bulgarian-split-squat',
    calf: 'dumbbell-standing-calf-raise', rdl: 'kettlebell-romanian-deadlift', 'leg-ext': 'leg-extension' },
  big: { 'ext-rot': 'cable-external-shoulder-rotation', 'chest-press': 'bench-press', 'chest-fly': 'pec-deck', 'shoulder-press': 'machine-shoulder-press',
    lateral: 'machine-lateral-raise', pushdown: 'triceps-pushdown-with-bar', 'overhead-tri': 'overhead-cable-triceps-extension-from-upper-position',
    'face-pull': 'reverse-machine-fly', 'vert-pull': 'pull-up', row: 'seated-machine-row', 'straight-arm': 'straight-arm-lat-pulldown', 'bi-curl': 'barbell-curl',
    hammer: 'hammer-curl', squat: 'seated-leg-press', 'leg-curl': 'seated-leg-curl', 'split-squat': 'bulgarian-split-squat', calf: 'seated-calf-raise',
    rdl: 'romanian-deadlift', 'leg-ext': 'leg-extension' },
};
export function seedAssignments() {
  return Object.entries(A).flatMap(([g, m]) => Object.entries(m).map(([s, e]) => ({ id: akey(s, g), slotId: s, gymId: g, exerciseId: e })));
}

export const SETTINGS_DEFAULT = { restSec: 90, lastGymId: 'big' };

// Circuits do not log weight. "steps" = checklist (optionally timed); "interval" = work/rest timer.
export const CIRCUITS = [
  { id: 'mobility', name: 'Mobility', kind: 'steps', blurb: '7 moves, about 8 minutes', steps: [
    { name: 'Cat-Cow', reps: 10 },
    { name: '90/90 Hip Switch', reps: 8, perSide: true },
    { name: 'Lunge With Thoracic Rotation', reps: 6, perSide: true },
    { name: 'Open Book', reps: 8, perSide: true },
    { name: 'Hip Flexor Stretch', seconds: 45, perSide: true },
    { name: 'Hamstring Stretch', seconds: 45, perSide: true },
    { name: 'Bar Hang', seconds: 30 },
  ] },
  { id: 'abs', name: 'Abs', kind: 'interval', blurb: '3 rounds · 7 exercises · 40 s work / 20 s rest', work: 40, rest: 20, rounds: 3,
    items: ['Cable Crunch', 'Hanging Leg Raise', 'Pallof Press', 'Stability Ball Rollout', 'Dead Bug', 'Plank', 'Side Plank'] },
  { id: 'farmer', name: "Farmer's walk", kind: 'steps', blurb: '3 × 30 m with kettlebells', steps: [
    { name: "Farmer's Walk", meters: 30 }, { name: "Farmer's Walk", meters: 30 }, { name: "Farmer's Walk", meters: 30 },
  ] },
];

// Big gym routines, built from the last 6 months of history (24 May to 24 Nov 2026): exercises done in
// at least ~30% of sessions of that type, in the order they were usually done, with the usual set count.
// Rep ranges start at the 10 reps you consistently did and top out at what you have hit. [exerciseId, sets, repMin, repMax]
export const BIG_PLAN = {
  push: [['cable-external-shoulder-rotation', 4, 10, 12], ['bench-press', 4, 10, 12], ['bar-dip', 4, 10, 12], ['triceps-pushdown-with-bar', 4, 10, 12]],
  pull: [['pull-up', 4, 8, 10], ['bar-hang', 3, null, null], ['hammer-curl', 4, 10, 12], ['seated-machine-row', 4, 10, 12], ['reverse-machine-fly', 4, 10, 12], ['barbell-curl', 4, 8, 10]],
  leg: [['leg-extension', 4, 10, 12], ['seated-calf-raise', 4, 10, 12], ['trap-bar-deadlift-with-low-handles', 4, 10, 12]],
};
export const bigSlotId = (exerciseId) => `x-${exerciseId}`;
export function bigVariant(routineId) {
  return (BIG_PLAN[routineId] || []).map(([ex, sets, repMin, repMax], i) => ({ id: `b${i + 1}`, label: String(i + 1), kind: 'superset', rounds: sets, restSec: null, items: [{ slotId: bigSlotId(ex), repMin, repMax }] }));
}
export function bigSlots() {
  const ids = [...new Set(Object.values(BIG_PLAN).flat().map((x) => x[0]))];
  return ids.map((id) => ({ id: bigSlotId(id), name: CATALOG.find((e) => e.id === id).name }));
}
export function bigAssignments() {
  const ids = [...new Set(Object.values(BIG_PLAN).flat().map((x) => x[0]))];
  return ids.map((id) => ({ id: akey(bigSlotId(id), 'big'), slotId: bigSlotId(id), gymId: 'big', exerciseId: id }));
}

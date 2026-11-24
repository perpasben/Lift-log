// Natural swaps: exercises that train the same movement, free weight <-> machine <-> cable.
import { slug } from './logic/csv.js';
import { availableAt } from './logic/substitution.js';

// Within a family, order matters: closest alternatives first.
const NAMES = [
  ['Bench Press', 'Dumbbell Chest Press', 'Machine Chest Press', 'Cable Chest Press', 'Push-Up', 'Incline Bench Press', 'Incline Dumbbell Press', 'Bar Dip'],
  ['Pec Deck', 'Machine Chest Fly', 'Standing Cable Chest Fly', 'Standing Cable Chest Fly (Lower Position)', 'Cable Crossover', 'Dumbbell Fly'],
  ['Machine Shoulder Press', 'Dumbbell Shoulder Press', 'Overhead Press'],
  ['Machine Lateral Raise', 'Cable Lateral Raise', 'Dumbbell Lateral Raise'],
  ['Reverse Machine Fly', 'Face Pull', 'Dumbbell Rear Delt Fly'],
  ['Triceps Pushdown With Bar', 'Triceps Pushdown With Rope', 'Cable Overhead Triceps Extension', 'Overhead Cable Triceps Extension from Upper Position', 'Crossbody Cable Triceps Extension', 'Dumbbell Overhead Triceps Extension', 'Skull Crusher', 'Bar Dip'],
  ['Pull-Up', 'Chin-Up', 'Lat Pulldown', 'Machine Lat Pulldown'],
  ['Seated Machine Row', 'Seated Cable Row', 'Dumbbell Row', 'Barbell Row', 'One-Arm Cable Row'],
  ['Barbell Curl', 'Dumbbell Curl', 'Cable Curl With Bar', 'Preacher Curl', 'Incline Dumbbell Curl'],
  ['Hammer Curl', 'Dumbbell Hammer Curl', 'Dumbbell Curl', 'Cable Curl With Bar'],
  ['Squat', 'Front Squat', 'Hack Squat Machine', 'Leg Press', 'Seated Leg Press', 'Goblet Squat', 'Bulgarian Split Squat', 'Walking Lunge'],
  ['Romanian Deadlift', 'Dumbbell Romanian Deadlift', 'Kettlebell Romanian Deadlift', 'Trap Bar Deadlift With Low Handles', 'Deadlift'],
  ['Seated Leg Curl', 'Lying Leg Curl', 'Stability Ball Leg Curl'],
  ['Standing Calf Raise', 'Seated Calf Raise', 'Calf Raise in Leg Press', 'Dumbbell Standing Calf Raise'],
  ['Hip Thrust', 'Machine Glute Kickback'],
  ['Cable Crunch', 'Hanging Leg Raise', 'Crunch', 'Sit-Up', 'Decline Bench Sit-Up', 'Stability Ball Rollout'],
  ['Cable External Shoulder Rotation', 'Cable Internal Shoulder Rotation'],
];
export const FAMILIES = NAMES.map((f) => f.map(slug));

const MACHINE = new Set(['chestmachine', 'shoulderpress', 'lat', 'row', 'legext', 'legcurl', 'legpress', 'hack', 'calf', 'glute', 'smith']);
const FREE = new Set(['barbell', 'dumbbell', 'dumbbell-screw', 'kettlebell', 'trapbar']);
export const KIND_LABEL = { free: 'Free weight', machine: 'Machine', cable: 'Cable', body: 'Bodyweight' };

export function kindOf(ex) {
  const eq = ex.equipment || [];
  if (/machine|deck/i.test(ex.name) || eq.some((k) => MACHINE.has(k))) return 'machine';
  if (eq.some((k) => FREE.has(k))) return 'free';
  if (eq.includes('cable')) return 'cable';
  return 'body';
}

const PREFER = { free: ['machine', 'cable', 'body', 'free'], machine: ['free', 'cable', 'body', 'machine'], cable: ['free', 'machine', 'body', 'cable'], body: ['free', 'machine', 'cable', 'body'] };

/** Up to `limit` swaps for an exercise at a gym: one of each kind first (opposite kind leading), then the rest. */
export function alternativesFor(exerciseId, exercises, gym, limit = 5) {
  const me = exercises[exerciseId];
  if (!me) return [];
  const ids = [...new Set(FAMILIES.filter((f) => f.includes(exerciseId)).flat())]
    .filter((id) => id !== exerciseId && exercises[id] && (!gym || availableAt(exercises[id], gym)));
  const order = PREFER[kindOf(me)];
  const out = [], used = new Set();
  for (const k of order) {
    const hit = ids.find((id) => !used.has(id) && kindOf(exercises[id]) === k);
    if (hit) { out.push(hit); used.add(hit); }
  }
  for (const id of ids) if (!used.has(id)) { out.push(id); used.add(id); }
  return out.slice(0, limit).map((id) => ({ id, kind: kindOf(exercises[id]) }));
}

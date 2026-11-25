// How much each exercise works each muscle. One working set of an exercise adds `weight` sets to every muscle listed:
//   1    = the main driver of the movement
//   0.75 = a big contributor
//   0.5  = a clear synergist (assists most of the way)
//   0.25 = a minor contributor / stabiliser
// The muscle keys are the ones on the body map (see MUSCLE_LABEL in stats.js). Warm-up sets are not counted.
// Exercises that are not listed (your own, or imported) fall back to their single "muscle" field with weight 1.
import { slug } from './csv.js';

const BY_NAME = {
  // chest
  'Cable Chest Press': { chest: 1, triceps: 0.5, shoulders: 0.5 },
  'Bench Press': { chest: 1, triceps: 0.5, shoulders: 0.5 },
  'Dumbbell Chest Press': { chest: 1, triceps: 0.5, shoulders: 0.5 },
  'Machine Chest Press': { chest: 1, triceps: 0.5, shoulders: 0.5 },
  'Incline Bench Press': { chest: 1, shoulders: 0.75, triceps: 0.5 },
  'Incline Dumbbell Press': { chest: 1, shoulders: 0.75, triceps: 0.5 },
  'Push-Up': { chest: 1, triceps: 0.5, shoulders: 0.5, abs: 0.25 },
  'Bar Dip': { chest: 1, triceps: 0.75, shoulders: 0.5 },
  'Standing Cable Chest Fly (Lower Position)': { chest: 1, shoulders: 0.25 },
  'Standing Cable Chest Fly': { chest: 1, shoulders: 0.25 },
  'Cable Crossover': { chest: 1, shoulders: 0.25 },
  'Dumbbell Fly': { chest: 1, shoulders: 0.25 },
  'Machine Chest Fly': { chest: 1, shoulders: 0.25 },
  'Pec Deck': { chest: 1, shoulders: 0.25 },
  // shoulders
  'Machine Shoulder Press': { shoulders: 1, triceps: 0.5, chest: 0.25 },
  'Dumbbell Shoulder Press': { shoulders: 1, triceps: 0.5, chest: 0.25 },
  'Overhead Press': { shoulders: 1, triceps: 0.5, chest: 0.25, upperBack: 0.25 },
  'Cable Lateral Raise': { shoulders: 1, upperBack: 0.25 },
  'Dumbbell Lateral Raise': { shoulders: 1, upperBack: 0.25 },
  'Machine Lateral Raise': { shoulders: 1, upperBack: 0.25 },
  'Upright Row': { shoulders: 1, upperBack: 0.5, biceps: 0.25 },
  // rear delts and rotator cuff (the map groups the rotator cuff with the rear delts)
  'Cable External Shoulder Rotation': { rearDelts: 1 },
  'Cable Internal Shoulder Rotation': { shoulders: 1, chest: 0.25 },
  'Reverse Machine Fly': { rearDelts: 1, upperBack: 0.5 },
  'Dumbbell Rear Delt Fly': { rearDelts: 1, upperBack: 0.5 },
  'Face Pull': { rearDelts: 1, upperBack: 0.5 },
  // triceps
  'Triceps Pushdown With Bar': { triceps: 1 },
  'Triceps Pushdown With Rope': { triceps: 1 },
  'Cable Overhead Triceps Extension': { triceps: 1 },
  'Overhead Cable Triceps Extension from Upper Position': { triceps: 1 },
  'Crossbody Cable Triceps Extension': { triceps: 1 },
  'Skull Crusher': { triceps: 1 },
  'Dumbbell Overhead Triceps Extension': { triceps: 1 },
  // back
  'Pull-Up': { lats: 1, upperBack: 0.5, biceps: 0.5, rearDelts: 0.25, forearms: 0.25 },
  'Chin-Up': { lats: 1, biceps: 0.75, upperBack: 0.5, forearms: 0.25 },
  'Lat Pulldown': { lats: 1, upperBack: 0.5, biceps: 0.5, rearDelts: 0.25 },
  'Machine Lat Pulldown': { lats: 1, upperBack: 0.5, biceps: 0.5, rearDelts: 0.25 },
  'Straight Arm Lat Pulldown': { lats: 1, triceps: 0.25 },
  'Seated Machine Row': { upperBack: 1, lats: 0.75, biceps: 0.5, rearDelts: 0.5 },
  'Seated Cable Row': { upperBack: 1, lats: 0.75, biceps: 0.5, rearDelts: 0.5 },
  'Barbell Row': { upperBack: 1, lats: 0.75, biceps: 0.5, rearDelts: 0.5, lowerBack: 0.5 },
  'Dumbbell Row': { upperBack: 1, lats: 0.75, biceps: 0.5, rearDelts: 0.5 },
  'One-Arm Cable Row': { upperBack: 1, lats: 0.75, biceps: 0.5, rearDelts: 0.5 },
  'Bar Hang': { forearms: 1, lats: 0.5, abs: 0.25 },
  'Deadlift': { glutes: 1, hamstrings: 1, lowerBack: 1, upperBack: 0.75, quads: 0.5, forearms: 0.5 },
  // biceps and forearms
  'Barbell Curl': { biceps: 1, forearms: 0.25 },
  'Cable Curl With Bar': { biceps: 1, forearms: 0.25 },
  'Dumbbell Curl': { biceps: 1, forearms: 0.25 },
  'Incline Dumbbell Curl': { biceps: 1, forearms: 0.25 },
  'Preacher Curl': { biceps: 1, forearms: 0.25 },
  'Hammer Curl': { biceps: 1, forearms: 0.5 },
  'Dumbbell Hammer Curl': { biceps: 1, forearms: 0.5 },
  'Wrist Curl': { forearms: 1 },
  'Reverse Wrist Curl': { forearms: 1 },
  'Cable Reverse Curl': { forearms: 1, biceps: 0.5 },
  // quads and squats
  'Squat': { quads: 1, glutes: 1, adductors: 0.5, lowerBack: 0.5, hamstrings: 0.25, abs: 0.25 },
  'Front Squat': { quads: 1, glutes: 0.75, adductors: 0.5, abs: 0.5, lowerBack: 0.25 },
  'Goblet Squat': { quads: 1, glutes: 0.75, adductors: 0.5, abs: 0.25 },
  'Hack Squat Machine': { quads: 1, glutes: 0.5, adductors: 0.25 },
  'Leg Press': { quads: 1, glutes: 0.5, adductors: 0.5, hamstrings: 0.25 },
  'Seated Leg Press': { quads: 1, glutes: 0.5, adductors: 0.5, hamstrings: 0.25 },
  'Leg Extension': { quads: 1 },
  'Bulgarian Split Squat': { quads: 1, glutes: 1, hamstrings: 0.25, adductors: 0.25 },
  'Walking Lunge': { quads: 1, glutes: 1, hamstrings: 0.5, adductors: 0.5 },
  // hinge, hamstrings and glutes
  'Romanian Deadlift': { hamstrings: 1, glutes: 0.75, lowerBack: 0.5, forearms: 0.25 },
  'Dumbbell Romanian Deadlift': { hamstrings: 1, glutes: 0.75, lowerBack: 0.5, forearms: 0.25 },
  'Kettlebell Romanian Deadlift': { hamstrings: 1, glutes: 0.75, lowerBack: 0.5, forearms: 0.25 },
  'Trap Bar Deadlift With Low Handles': { quads: 1, glutes: 1, hamstrings: 0.75, lowerBack: 0.75, upperBack: 0.75, forearms: 0.5 },
  'Seated Leg Curl': { hamstrings: 1, calves: 0.25 },
  'Lying Leg Curl': { hamstrings: 1, calves: 0.25 },
  'Stability Ball Leg Curl': { hamstrings: 1, glutes: 0.5, abs: 0.25, lowerBack: 0.25 },
  'Hip Thrust': { glutes: 1, hamstrings: 0.5, adductors: 0.25 },
  'Machine Glute Kickback': { glutes: 1, hamstrings: 0.25 },
  'Kettlebell Swing': { glutes: 1, hamstrings: 1, lowerBack: 0.5, abs: 0.5, quads: 0.25, forearms: 0.25 },
  // calves, shins, hips, adductors, neck
  'Calf Raise in Leg Press': { calves: 1 },
  'Dumbbell Standing Calf Raise': { calves: 1 },
  'Standing Calf Raise': { calves: 1 },
  'Seated Calf Raise': { calves: 1 },
  'Tibialis Raise': { shins: 1 },
  'Cable Hip Adduction': { adductors: 1 },
  'Cable Hip Flexion': { hips: 1, abs: 0.25 },
  'Neck Curl': { neck: 1 },
  // abs and core
  'Cable Crunch': { abs: 1 },
  'Hanging Leg Raise': { abs: 1, hips: 0.75, forearms: 0.5 },
  'Pallof Press': { abs: 1 },
  'Stability Ball Rollout': { abs: 1, shoulders: 0.5, lats: 0.5 },
  'Dead Bug': { abs: 1, hips: 0.25 },
  'Plank': { abs: 1, shoulders: 0.25, glutes: 0.25 },
  'Side Plank': { abs: 1, glutes: 0.5, shoulders: 0.25 },
  'Crunch': { abs: 1 },
  'Sit-Up': { abs: 1, hips: 0.5 },
  'Decline Bench Sit-Up': { abs: 1, hips: 0.5 },
  "Farmer's Walk": { forearms: 1, upperBack: 0.75, abs: 0.5, glutes: 0.5, quads: 0.25, calves: 0.25 },
};

export const MUSCLE_WEIGHTS = Object.fromEntries(Object.entries(BY_NAME).map(([name, w]) => [slug(name), w]));

/** Weights for an exercise, or null when it is not in the table. */
export const weightsFor = (ex) => (ex ? MUSCLE_WEIGHTS[ex.id] || null : null);

# Overtraining: what the research says and how the app uses it

The home card can say **"Overtraining risk · rest up"**. This note explains where the rules come from and, just as important, what they cannot do.

## What the research says

| Finding | Source |
|---|---|
| Overtraining *syndrome* is a long, serious state; it cannot be told apart from non-functional overreaching at the time and is usually confirmed only afterwards. The common thread is **too much load with too little recovery**; symptoms are fatigue, worse performance and mood changes. | [Meeusen et al. 2013, ECSS/ACSM consensus statement](https://www.sportgeneeskunde.com/wp-content/uploads/Meeusen-et-al-2013-Overtraining-Consensus-ECSS-ACSM.pdf) |
| In lifters, **a sustained drop in performance is the only marker established as reliable**; the most reported symptom is general fatigue; most reported dips lasted 1 week to 1 month. | [Bell et al., international survey of resistance-trained people](https://www.researchgate.net/publication/343025650_Symptoms_of_Overtraining_in_Resistance_Exercise_International_Cross-Sectional_Survey) |
| Coaches consider true overtraining syndrome **rare in strength sports**; training hard is often mistaken for it. Methods to diagnose it in lifting are not standardised. | [Coaches' perceptions, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8227793/) |
| More weekly sets build more muscle up to a point (clearest gain around 10 sets per muscle per week); beyond that returns shrink, and the benefit of very high volumes is limited by how much you can recover from. | [Schoenfeld, Ogborn & Krieger 2017](https://www.researchgate.net/publication/305455324_Dose-response_relationship_between_weekly_resistance_training_volume_and_increases_in_muscle_mass_A_systematic_review_and_meta-analysis), [Pelland et al. meta-regression](https://www.researchgate.net/publication/384628335_The_Resistance_Training_Dose-Response_Meta-Regressions_Exploring_the_Eﬀects_of_Weekly_Volume_and_Frequency_on_Muscle_Hypertrophy_and_Strength_Gain) |
| Guidelines suggest 2-3 resistance sessions a week about 48-72 h apart *for the same muscles*. A small 12-week trial found training on consecutive days did not cost strength or lean mass, so a streak alone is a weak signal. | [Frontiers in Physiology 2018](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.00725/full) |
| Poor load management, especially **sudden jumps in load**, is a major injury risk factor. The popular "acute:chronic ratio above 1.5" rule is **disputed**: critics find no sound evidence that it predicts injury. We use it only as a soft signal. | [IOC consensus on load and injury, 2016](https://pubmed.ncbi.nlm.nih.gov/27535989/), [Impellizzeri et al. 2020](https://www.researchgate.net/publication/341936245_AcuteChronic_Workload_Ratio_Conceptual_Issues_and_Fundamental_Pitfalls) |
| High load with little variation (the same hard training every day) was linked to illness in athletes in one early study. Observational and small. | [Foster 1998](https://pubmed.ncbi.nlm.nih.gov/9662690/) |
| Lifters who plan lighter weeks do about 6 days every 5-6 weeks (survey of 246 competitive athletes). A practice, not a requirement. | [Deloading survey, Sports Medicine - Open](https://link.springer.com/article/10.1186/s40798-024-00691-y) |

I could read the abstracts and summaries but not the full text of every paper (some hosts were unreachable from the build environment), so numbers above are the ones quoted in those summaries.

## What the app can and cannot see

It sees: the days you trained, your sets, your weights and reps. It does **not** see sleep, stress, food, soreness, mood or how hard each set felt. So it cannot diagnose overtraining. It raises a flag when the pattern of load looks like the one that tends to come before overreaching. A flag is advice to ease off, not a medical statement.

## The rules (`js/logic/load.js`, numbers in `LIMITS`)

Points are added from these signals, looked at only if you trained today or yesterday (if you have already rested, nothing is flagged):

| Signal | Points |
|---|---|
| Days in a row without a rest day: 5 / 7 / 9 | 1 / 2 / 3 |
| Days trained in the last 7: 6 / 7 (counted only if more than the streak) | 1 / 2 |
| Sets this week vs your usual week (the 4 weeks before): 1.5x / 2x. Ignored when this week is under 25 sets or your usual under 10 | 1 / 2 |
| Weighted sets for one muscle in 7 days: 25 / 35 (small muscles excluded) | 1 / 2 |
| Your lifts 5% or more below their best of a month ago (median of 3+ lifts). Counts double when the load signals above are also on, because a dip alone can be sleep or stress | 1 or 2 |

- **3 points or more** → the card says **Overtraining risk · rest up** and offers "Train anyway".
- **2 points** → a small "Heavy week" note on the card.
- Below 2 → nothing.

These thresholds are judgement calls anchored in the research above, not published cut-offs. Change them in `LIMITS` if they feel too jumpy or too quiet.

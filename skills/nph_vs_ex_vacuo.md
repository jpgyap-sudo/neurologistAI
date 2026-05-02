# Skill: Determining NPH vs Hydrocephalus Ex Vacuo

## Purpose
Differentiate **Normal Pressure Hydrocephalus (NPH)** from **hydrocephalus ex vacuo** using clinical context, CT/MRI morphology, CSF testing, and response to CSF drainage.

This skill is especially designed for patients with prior intracerebral hemorrhage, basal ganglia injury, encephalomalacia, infarcts, craniotomy, or minimally conscious state, where NPH diagnosis is difficult.

---

## 1. Definitions

### Normal Pressure Hydrocephalus
NPH is usually a **communicating hydrocephalus** caused by impaired CSF absorption and altered intracranial compliance. It is not usually a focal blockage.

Typical features:
- Ventriculomegaly
- Tight high-convexity sulci
- Enlarged Sylvian fissures
- DESH pattern
- Possible improvement after CSF tap test or external lumbar drainage

### Hydrocephalus Ex Vacuo
Hydrocephalus ex vacuo is passive ventricular and CSF-space enlargement due to brain tissue loss.

Typical causes:
- Intracerebral hemorrhage
- Infarction
- Traumatic brain injury
- Craniotomy or surgical tissue loss
- Neurodegenerative atrophy

Core concept:
- CSF fills space left by lost brain tissue.
- It is not caused by excess CSF accumulation.
- Shunting generally does not restore lost tissue and may risk overdrainage.

---

## 2. Diagnostic Weighting

Use pattern consistency, not a single sign.

| Domain | Weight | NPH Signal | Ex Vacuo Signal |
|---|---|---|---|
| Structural injury history | Very high | No major lesion | Large hemorrhage/infarct/encephalomalacia |
| Ventricular symmetry | High | Symmetric dilation | Asymmetric dilation matching lesion |
| Sulci pattern | Very high | Tight high-convexity sulci | Widened sulci due to atrophy |
| Sylvian fissures | High | Disproportionately enlarged with tight vertex | Proportionally enlarged with global atrophy |
| DESH | Very high | Present | Absent |
| LP/tap response | Very high | Improvement after 30–50 ml removal | No improvement |
| Opening pressure | Low | Often normal | Often normal |
| Clinical triad | Moderate/low in stroke/MCS | Gait/cognition/urinary triad | Deficits explained by structural injury |

---

## 3. Imaging Skill

### A. Look for high-convexity sulci
- **Tight/narrow/effaced vertex sulci** → supports NPH.
- **Widened sulci** → supports atrophy/ex vacuo.

### B. Look for Sylvian fissures
- NPH/DESH: Sylvian fissures enlarged while high-convexity sulci are tight.
- Ex vacuo: Sylvian fissures and cortical sulci enlarge proportionally.

### C. Look for ventricular asymmetry
- NPH: usually relatively symmetric ventriculomegaly.
- Ex vacuo: ventricle expands toward damaged/atrophic tissue, often asymmetric.

### D. Look for lesion-matched ventricular expansion
If the enlarged ventricle borders encephalomalacia, basal ganglia hemorrhagic cavity, infarct, or postoperative tissue loss, this strongly supports ex vacuo.

### E. Look for periventricular signal
- NPH may show transependymal CSF/interstitial edema.
- Chronic stroke injury may show gliosis, leukomalacia, or old damage.
- FLAIR interpretation should be cautious.

---

## 4. CSF Test Interpretation

### Lumbar puncture / tap test
Positive test:
- Objective improvement after 30–50 ml CSF removal.
- Improvement in gait, arousal, interaction, cognition, or functional responsiveness.

Negative test:
- No measurable improvement.
- In a post-stroke/MCS patient, repeated negative LP is a strong argument against clinically significant shunt-responsive NPH.

### CSF infusion test / Rout
Most objective if available.
- High Rout supports impaired CSF absorption.
- Normal Rout argues against shunt-responsive hydrocephalus.

---

## 5. Decision Algorithm

### High-confidence ex vacuo pattern
Classify as ex vacuo dominant when most of these are present:
- Large prior structural brain injury
- Asymmetric ventricles matching lesion side
- Widened sulci / brain atrophy
- No DESH
- Negative tap test or repeated LP without improvement
- Normal opening pressure

Expected shunt benefit: low.
Overdrainage risk: clinically important, especially with atrophy.

### High-confidence NPH pattern
Classify as NPH likely when most of these are present:
- No major destructive lesion explaining ventriculomegaly
- Symmetric ventriculomegaly
- Tight high-convexity sulci
- Enlarged Sylvian fissures
- DESH present
- Positive tap test or external lumbar drainage response
- Symptoms fit NPH triad and are not fully explained by another lesion

Expected shunt benefit: potentially meaningful if surgical risk acceptable.

---

## 6. Probability Framework

Use the scoring schema in `data/nph_ex_vacuo_scoring_schema.json`.

Suggested interpretation:
- Ex vacuo score ≥ 7 and NPH score ≤ 3 → ex vacuo dominant.
- NPH score ≥ 7 and ex vacuo score ≤ 3 → NPH likely.
- Both high → mixed pathology; require Rout, ELD, or expert hydrocephalus consultation.
- Both intermediate → indeterminate; avoid high-risk irreversible decisions without better data.

---

## 7. Shunt Decision Logic

Do not use ventriculomegaly alone to justify shunt.

Before shunt, require:
- Clear imaging pattern supporting NPH, or
- Positive tap test/ELD, or
- Abnormal CSF outflow resistance, or
- Strong specialist consensus that expected benefit exceeds risk.

In suspected ex vacuo:
- Use extreme caution with VP shunt.
- If shunt is done despite uncertainty, prefer programmable valve with high initial setting plus anti-siphon/gravitational protection.

---

## 8. One-Line Expert Rule

**If ventricular enlargement follows tissue loss and CSF removal produces no improvement, think hydrocephalus ex vacuo rather than shunt-responsive NPH.**

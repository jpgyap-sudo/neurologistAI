# Skill: Callosal Angle Measurement

## Overview
The callosal angle (CA) is a quantitative imaging biomarker used to differentiate **normal pressure hydrocephalus (NPH)** from **hydrocephalus ex vacuo** (ventriculomegaly due to brain atrophy). It is measured on a true coronal MRI slice at the level of the posterior commissure (PC).

---

## Input
- MRI DICOM folder (T1-weighted or FLAIR preferred)

---

## Process
1. **Load volume** in a DICOM viewer (e.g., 3D Slicer, Horos, or this CT Scan Analyzer viewer).
2. **Align the AC–PC plane** (anterior commissure to posterior commissure) to ensure anatomical standardization.
3. **Generate a true coronal slice** at the level of the **posterior commissure (PC)**.
4. **Identify the lateral ventricles** on the coronal slice — specifically the superior/medial borders of the frontal horns.
5. **Measure the angle using the 3-point method**:
   - Vertex at the superior-most point of the corpus callosum (genu/splenium junction or highest point).
   - Two arms extending along the superior/medial borders of the lateral ventricles.

---

## Output
- **Callosal Angle** (degrees)
- **Confidence Level**: high / moderate / low

---

## Validation Checklist
- [ ] Check symmetry of ventricles
- [ ] Confirm AC–PC alignment is correct
- [ ] Confirm the slice is at the true PC level
- [ ] Verify the angle vertex is placed at the correct superior callosal point
- [ ] Repeat measurement on adjacent slices to confirm consistency

---

## Clinical Interpretation
| Callosal Angle | Interpretation |
|----------------|----------------|
| **< 90°** | Suggests **NPH (normal pressure hydrocephalus)** — tight, acute angle due to upward bowing of corpus callosum from ventricular pressure |
| **> 100°** | Suggests **ex vacuo hydrocephalus** — wide, obtuse angle due to loss of parenchymal volume without increased pressure |
| **90° – 100°** | Gray zone; consider additional features (DESH, periventricular edema, clinical presentation) |

### Important Caveats
- In **asymmetric brains** or post-surgical cases, reliability is reduced.
- Always correlate with:
  - **DESH pattern** (disproportionately enlarged subarachnoid space hydrocephalus)
  - **Periventricular signal changes** (transependymal CSF resorption)
  - **Clinical triad** (gait apraxia, incontinence, dementia)
  - **CSF tap test / ELD response**
- The callosal angle is **not** a standalone diagnostic test; it is an adjunctive imaging marker.

---

## References
- Ishii K, et al. "Callosal angle measured on MRI as a predictor of outcome in idiopathic normal-pressure hydrocephalus." *J Neurosurg.* 2008.
- Virhammar J, et al. "The callosal angle measured on MRI as a predictor of shunt response in idiopathic normal pressure hydrocephalus." *J Neurosurg.* 2014.

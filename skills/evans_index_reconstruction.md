# Skill: Evans Index Reconstruction and Measurement

## Objective
Measure the Evans index ratio reliably on axial imaging.

## Clinical principle
The index depends on a true axial plane; obliquity overestimates or underestimates the ratio. The frontal horn level must be consistent.

## Manual workflow in 3D Slicer
1. Load DICOM volume into 3D Slicer.
2. Navigate to the axial slice view.
3. Scroll to the level of the frontal horns.
4. Use the Ruler or Markups → Line tool to draw the maximal frontal horn width (FH) from outer margin to outer margin.
5. At the same axial level, draw the maximal intracranial diameter (ID) from inner table to inner table.
6. Record both measurements and calculate the ratio FH / ID.
7. Document plane, level, and any quality issues.

## Interpretation
| Evans Index | Meaning |
|---|---|
| < 0.30 | Normal / no significant ventriculomegaly |
| 0.30 – 0.39 | Mild ventriculomegaly (non-specific; correlate clinically) |
| ≥ 0.40 | Significant ventriculomegaly (supports hydrocephalus but does not distinguish NPH from ex-vacuo) |

## Dad-specific caveat
Post-craniectomy or skull defects can distort the intracranial diameter measurement; use an alternative reference level or adjust interpretation if needed.

## Quality control checklist
- Plane verified as true axial?
- Level verified through the frontal horns?
- Calipers placed on inner table for ID and outer margins for FH?
- Measurement repeated for consistency?
- Skull defects or asymmetry noted?

## Output schema
```json
{
  "evans_index": null,
  "frontal_horn_width_mm": null,
  "intracranial_diameter_mm": null,
  "measurement_method": "manual_in_3d_slicer",
  "plane": "axial_at_frontal_horns",
  "confidence": "high|moderate|low",
  "limitations": []
}
```

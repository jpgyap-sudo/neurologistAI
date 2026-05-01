# Skill: Callosal Angle Reconstruction and Measurement

## Objective
Measure callosal angle on a true coronal plane reconstructed from MRI/CT volume.

## Clinical principle
Callosal angle is only valid when measured:
- on a true coronal plane
- perpendicular to the AC-PC line
- at or near the posterior commissure level

Wrong plane = invalid angle.

## Manual workflow in 3D Slicer
1. Load DICOM volume.
2. Identify AC and PC landmarks in sagittal view.
3. Align volume/slice plane to AC-PC axis.
4. Use reconstructed coronal view.
5. Scroll to posterior commissure level.
6. Use Markups → Angle.
7. Place three points:
   - left lateral ventricle inner wall
   - midline apex/roof between ventricles
   - right lateral ventricle inner wall
8. Record angle and confidence.

## Interpretation
| Callosal angle | Meaning |
|---|---|
| < 90° | supports NPH pattern |
| 90–100° | borderline |
| > 100° | supports atrophy/ex-vacuo pattern |

## Dad-specific caveat
In a patient with asymmetric basal ganglia hemorrhage and unilateral encephalomalacia, CA can be distorted and less reliable. Weight it as a supporting metric, not the deciding metric.

## Quality control checklist
- AC-PC line confirmed?
- Coronal plane perpendicular to AC-PC?
- Posterior commissure level documented?
- Both lateral ventricles visible?
- Significant asymmetry noted?
- Slice thickness acceptable?
- Motion artifact acceptable?

## Output schema
```json
{
  "callosal_angle_degrees": null,
  "measurement_method": "manual_in_3d_slicer",
  "plane": "coronal_perpendicular_to_acpc",
  "level": "posterior_commissure",
  "confidence": "high|moderate|low",
  "limitations": []
}
```

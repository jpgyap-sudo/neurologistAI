# Skill: DESH Assessment

## Objective
Identify DESH pattern on axial/coronal imaging to support NPH evaluation.

## Clinical principle
DESH is valid when ventriculomegaly is out of proportion to cortical atrophy, Sylvian fissures are enlarged, and high-convexity sulci are tight/effaced.

## Manual workflow in 3D Slicer
1. Load axial CT/MRI.
2. Measure Evans index at frontal horn level.
3. Inspect Sylvian fissure width.
4. Inspect high-convexity sulcal width.
5. Assess symmetry.
6. Record presence/absence.

## Interpretation
| DESH | Meaning |
|---|---|
| Present | supports NPH pattern |
| Absent | inconclusive / consider other causes |

## Dad-specific caveat
Asymmetric post-hemorrhagic ventricular distortion reduces reliability. Weight DESH as supporting, not decisive.

## Quality control checklist
- Evans index measured?
- Correct axial plane confirmed?
- Sylvian fissures assessed?
- High-convexity sulci assessed?
- Symmetry noted?
- Callosal angle available?

## Output schema
```json
{
  "desh_pattern": null,
  "evans_index": null,
  "confidence": "high|moderate|low",
  "limitations": []
}
```

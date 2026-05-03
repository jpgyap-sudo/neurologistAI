window.AppSkills = [
  {
    name: 'Callosal Angle Reconstruction',
    keywords: ['callosal angle', 'ca measurement', 'ac-pc', 'ac pc', 'posterior commissure'],
    summary: 'Guides manual callosal angle measurement on a true coronal plane perpendicular to the AC-PC line at the posterior commissure level.',
    limits: 'Requires correct plane, correct slice level, visible lateral ventricles, and clinician confirmation. Asymmetry lowers reliability.',
    output: 'Callosal angle in degrees plus confidence level and limitations.'
  },
  {
    name: 'DESH Assessment',
    keywords: ['desh', 'nph', 'normal pressure hydrocephalus', 'tight convexity', 'sylvian', 'desh pattern'],
    summary: 'Guides assessment of the DESH (disproportionately enlarged subarachnoid-space hydrocephalus) pattern on axial or coronal imaging.',
    limits: 'The browser viewer does not automatically segment sulci or ventricles. Requires manual review by a radiologist or clinician. Asymmetric post-hemorrhagic distortion reduces reliability.',
    output: 'DESH pattern present/absent, confidence level, and structured evidence list for clinician review.'
  },
  {
    name: 'Hydrocephalus Ex Vacuo Rules',
    keywords: ['ex vacuo', 'atrophy', 'ventriculomegaly', 'hydrocephalus'],
    summary: 'Compares ventriculomegaly from tissue loss/atrophy against active communicating or NPH-like hydrocephalus.',
    limits: 'Needs radiology correlation and serial imaging; one sign alone is not enough.',
    output: 'Pattern support: ex vacuo, NPH-like, mixed, or indeterminate.'
  },
  {
    name: 'Lumbar Puncture Response',
    keywords: ['lumbar puncture', 'lp', 'tap test', '40 ml', 'csf drainage'],
    summary: 'Weights objective response after large-volume LP or drainage when considering shunt-responsive NPH.',
    limits: 'In MCS, gait/cognition endpoints may be unavailable, so objective arousal and CRS-R markers matter more.',
    output: 'LP response interpretation and limitations.'
  },
  {
    name: 'VP Shunt Decision Matrix',
    keywords: ['shunt', 'vp shunt', 'programmable valve', 'overdrainage', 'subdural'],
    summary: 'Combines imaging evidence, LP response, risks, and uncertainty into shunt-support categories.',
    limits: 'Decision support only; does not recommend surgery as a directive.',
    output: 'Favors shunt-responsive hydrocephalus, mixed/uncertain, favors ex vacuo, or unsafe to conclude.'
  },
  {
    name: 'Hydrocephalus Red Flags',
    keywords: ['red flags', 'urgent', 'papilledema', 'transependymal', 'acute hydrocephalus'],
    summary: 'Flags findings that should prompt urgent clinician review, especially signs of active pressure or deterioration.',
    limits: 'Must be interpreted by qualified clinicians.',
    output: 'Doctor-facing escalation questions.'
  },
  {
    name: 'MCS / Rehab Tracking',
    keywords: ['mcs', 'minimally conscious', 'rehab', 'crs-r', 'arousal', 'command following'],
    summary: 'Tracks consciousness and rehab markers such as arousal duration, fixation, command following, motor response, swallowing, and CRS-R style observations.',
    limits: 'Requires repeated objective bedside observations.',
    output: 'Longitudinal recovery trend notes.'
  },
  {
    name: 'Medication Neurorecovery Review',
    keywords: ['medication', 'sedation', 'amantadine', 'baclofen', 'benzodiazepine', 'neurorecovery'],
    summary: 'Reviews medications that may support or interfere with arousal, cognition, tone, sleep, seizure control, and recovery tracking.',
    limits: 'Medication changes require physician oversight.',
    output: 'Medication questions and neurorecovery risk notes.'
  },
  {
    name: 'Report Templates',
    keywords: ['report', 'template', 'findings', 'impression', 'doctor questions'],
    summary: 'Provides structured imaging, LP response, shunt decision, radiology, and neurology report sections.',
    limits: 'Templates organize observations; they do not replace radiology interpretation.',
    output: 'Doctor-facing report language.'
  },
  {
    name: 'Evans Index Measurement',
    keywords: ['evans index', 'evans ratio', 'frontal horn', 'ventriculomegaly'],
    summary: 'Guides manual measurement of the Evans index (frontal horn ratio) on axial imaging.',
    limits: 'Requires true axial plane, correct level through frontal horns, and clear calvarial margins.',
    output: 'Evans index ratio plus confidence level and limitations.'
  },
  {
    name: 'NPH vs Hydrocephalus Ex Vacuo',
    keywords: ['nph vs ex vacuo', 'nph versus ex vacuo', 'shunt responsive', 'hydrocephalus ex vacuo differentiation', 'desh vs atrophy', 'tap test nph', 'csf drainage response', 'normal pressure hydrocephalus vs atrophy'],
    summary: 'Structured differentiation of Normal Pressure Hydrocephalus from hydrocephalus ex vacuo using imaging morphology, CSF tests, and clinical context. Includes scoring schema, doctor checklists, and shunt decision support.',
    limits: 'Requires accurate imaging interpretation, objective LP/ELD assessment, and specialist input. Does not replace neurosurgical judgment.',
    output: 'Pattern classification (NPH likely, ex vacuo dominant, mixed/indeterminate), evidence table, missing data list, shunt benefit estimate, risk concerns, and doctor-facing questions.'
  },
  {
    name: 'MRI Sequence Analysis',
    keywords: ['mri', 'mr', 't1', 't2', 'flair', 'sequence', 'modality', 'dicom'],
    summary: 'Interprets MRI-specific ventricular metrics and sequence-based segmentation candidates generated by the Slicer pipeline.',
    limits: 'Automated thresholds are sequence-dependent (FLAIR dark, T2 bright, T1 dark). Intensities are arbitrary; manual confirmation is required.',
    output: 'Inferred modality, sequence name, preprocessing status, and ventricular candidate confidence.'
  },
  {
    name: 'MRI Quality Check',
    keywords: ['mri quality', 'artifact', 'motion', 'ghosting', 'signal dropout', 'entropy', 'cv'],
    summary: 'Reviews slice-level coefficient-of-variation, intensity range stability, and entropy to flag motion, ghosting, or poor contrast.',
    limits: 'Heuristic proxy only; cannot replace radiologist visual QC. May miss subtle artifacts.',
    output: 'Pass/fail with flagged issues and affected slice proportion.'
  },
  {
    name: 'FLAIR Transependymal Assessment',
    keywords: ['flair', 'transependymal', 'periventricular', 'hyperintensity', 'csf edema'],
    summary: 'Flags the need to review periventricular FLAIR hyperintensity as a sign of active pressure or transependymal CSF migration.',
    limits: 'Requires true FLAIR sequence and visual review; automated pipeline does not segment FLAIR signal.',
    output: 'Reminder to check periventricular signal and correlate with clinical urgency.'
  },
  {
    name: 'MRI Brain Specialist',
    keywords: ['mri brain specialist', 'mri brain evans', 'mri desh', 'mri callosal', 'mri ventriculomegaly', 'mri nph', 'mri hydrocephalus'],
    summary: 'Dedicated MRI brain specialist that interprets ventricular metrics on MRI: Evans index, DESH pattern, and callosal angle guidance with sequence-specific caveats.',
    limits: 'Automated segmentation is less validated on MRI than CT. Intensities are sequence-dependent and arbitrary. Manual confirmation is always required.',
    output: 'Structured MRI findings, quantitative metrics, pattern analysis, impression, and missing data list.'
  }
];

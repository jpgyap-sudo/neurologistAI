/**
 * Neurologist / Neurosurgeon Knowledge Base
 * Embedded expert system for client-side AI chat.
 */

const KnowledgeBase = {
  // ==================== HYDROCEPHALUS ====================
  hydrocephalus: {
    overview: `Hydrocephalus is an abnormal accumulation of cerebrospinal fluid (CSF) within the ventricular system, leading to ventricular enlargement and increased intracranial pressure (ICP). It can be congenital or acquired.`,

    types: [
      {
        name: "Communicating Hydrocephalus",
        description: `CSF flows freely between ventricles and subarachnoid space, but absorption at arachnoid granulations is impaired. Causes include subarachnoid hemorrhage (SAH), meningitis, head trauma, and idiopathic normal pressure hydrocephalus (iNPH). On CT/MRI: all ventricles are enlarged (lateral, third, fourth). No obstruction at foramen of Monro, aqueduct, or fourth ventricle outlets.`,
        imaging: `Symmetric enlargement of all four ventricles. Periventricular hypodensity (transependymal CSF resorption) on CT. No obstructing lesion.`,
        management: `VP shunt, lumbar drain (if safe), ETV (endoscopic third ventriculostomy) less effective than in obstructive cases.`
      },
      {
        name: "Non-communicating (Obstructive) Hydrocephalus",
        description: `Obstruction within the ventricular system preventing CSF flow. Common sites: foramen of Monro (colloid cyst, tumor), cerebral aqueduct (stenosis, tumor, tectal glioma), fourth ventricle outlets (Dandy-Walker malformation, posterior fossa tumors).`,
        imaging: `Enlarged lateral and/or third ventricles proximal to obstruction; fourth ventricle may be normal or compressed. No periventricular changes if acute.`,
        management: `ETV if aqueductal obstruction, tumor resection if mass lesion, temporary EVD (external ventricular drain) for acute decompression.`
      },
      {
        name: "Normal Pressure Hydrocephalus (NPH)",
        description: `A form of communicating hydrocephalus typically seen in elderly patients with normal opening pressure on LP. Classic triad: gait apraxia, urinary incontinence, dementia ("wet, wacky, wobbly").`,
        imaging: `Ventricular enlargement out of proportion to sulcal atrophy. CSF flow void at aqueduct on MRI. DESH (disproportionately enlarged subarachnoid space hydrocephalus) with tight high convexity and midline sulci but wide Sylvian fissures.`,
        management: `High-volume lumbar puncture (tap test) or external lumbar drainage trial. VP shunt if positive response. Programmable valves preferred.`
      },
      {
        name: "Ex Vacuo Hydrocephalus (Hydrocephalus ex Vacuo)",
        description: `NOT true hydrocephalus. It is passive compensatory enlargement of ventricles due to brain parenchymal loss (atrophy). No increased ICP. CSF dynamics are normal. Common in aging, Alzheimer's, advanced HIV dementia, chronic alcoholism, Pick disease.`,
        imaging: `Ventricular enlargement with proportional enlargement of cortical sulci. No periventricular transependymal edema. No rounding of frontal horns or ballooning of third ventricle. Brain volume is globally reduced.`,
        keyDistinguishers: [
          "Sulci are proportionately enlarged (not tight as in NPH/DESH)",
          "No periventricular hypodensity/edema on CT",
          "No clinical signs of increased ICP (headache, papilledema, vomiting)",
          "No improvement with CSF diversion",
          "Often associated with diffuse cortical atrophy"
        ],
        management: `No neurosurgical intervention needed. Treat underlying cause of atrophy (e.g., dementia management).`
      },
      {
        name: "Congenital Hydrocephalus",
        description: `Present at birth. Causes: aqueductal stenosis, Dandy-Walker malformation, Chiari malformation, myelomeningocele, vein of Galen aneurysmal malformation.`,
        imaging: `Large head circumference, bulging fontanelles, split sutures. Ventriculomegaly on prenatal ultrasound/MRI.`,
        management: `VP shunt, ETV (depending on age and anatomy), treat underlying anomaly.`
      },
      {
        name: "Acquired Hydrocephalus",
        description: `Develops after birth. Causes: intraventricular hemorrhage (IVH), meningitis, brain tumor, head trauma, cyst.`,
        imaging: `Depends on cause. Post-hemorrhagic may show blood products in ventricles. Tumor may show obstructing mass.`,
        management: `Address underlying cause; EVD, VP shunt, or ETV as indicated.`
      }
    ],

    exVacuoDistinguish: `To distinguish hydrocephalus ex vacuo from true hydrocephalus:
1. Look at the SULCI: In ex vacuo, sulci are wide and proportional to ventricles. In true hydrocephalus (especially NPH), sulci over the convexity may be tight (DESH pattern).
2. Periventricular changes: Transependymal edema (periventricular hypodensity on CT, hyperintensity on T2/FLAIR MRI) suggests true hydrocephalus with increased pressure. Ex vacuo does NOT show this.
3. Frontal horns: In true hydrocephalus, frontal horns may appear rounded/ballooned. In ex vacuo, they enlarge but maintain shape relative to overall brain shrinkage.
4. Third ventricle: Ballooning of the third ventricle with bowing of the lamina terminalis suggests true hydrocephalus.
5. Clinical: Ex vacuo patients have symptoms of dementia/atrophy without ICP signs. True hydrocephalus may have headache, papilledema, altered consciousness.
6. Response to LP/drainage: Ex vacuo does not improve with CSF removal.`,

    keywords: ["hydrocephalus", "ventriculomegaly", "csf", "nph", "normal pressure", "ex vacuo", "obstructive", "communicating", "shunt", "etv", "aqueduct", "monro", "desh"]
  },

  // ==================== BASAL GANGLIA HEMORRHAGE ====================
  basalGangliaHemorrhage: {
    overview: `Basal ganglia hemorrhage is the most common site for spontaneous intracerebral hemorrhage (ICH), accounting for ~50-60% of all spontaneous ICH. It is strongly associated with chronic hypertension.`,

    anatomy: `The basal ganglia include the caudate nucleus, putamen, globus pallidus, subthalamic nucleus, and substantia nigra. Hemorrhages most commonly involve the PUTAMEN (external capsule/internal capsule region), followed by the CAUDATE and THALAMUS.`,

    etiology: [
      "Chronic hypertension (most common) — lipohyalinosis of small penetrating arteries (Charcot-Bouchard aneurysms)",
      "Cerebral amyloid angiopathy (usually lobar, but can overlap)",
      "Arteriovenous malformation (AVM)",
      "Cavernous malformation (cavernoma)",
      "Coagulopathy / anticoagulation",
      "Cocaine/amphetamine use (acute hypertension)",
      "Moyamoya disease",
      "Tumor hemorrhage"
    ],

    imaging: {
      ct: `Acute: Hyperdense (60-80 HU) well-defined or irregular collection in putamen/caudate/thalamus. May extend into ventricles (intraventricular hemorrhage). Mass effect on adjacent structures. Surrounding hypodensity develops within 24-48 hours (edema). Look for hydrocephalus if blood fills third/fourth ventricles.`,
      mri: `Signal varies with age of blood (follows evolution of hemoglobin). GRE/SWI very sensitive for microbleeds. May identify underlying AVM, cavernoma, or tumor.`,
      cta: `Recommended to look for spot sign (contrast extravasation = active bleeding, predicts hematoma expansion). Also rules out underlying aneurysm or AVM in atypical cases or young patients.`
    },

    clinical: `Sudden onset headache, nausea/vomiting, decreased consciousness. Contralateral hemiparesis/hemiplegia (internal capsule involvement). Contralateral sensory loss (thalamic involvement). Aphasia if dominant hemisphere. Neglect if non-dominant. Eye deviation "toward" the lesion.`,

    grading: [
      { name: "ICH Score", criteria: "GCS (3-4=2pts, 5-12=1pt, 13-15=0), Age ≥80 (1pt), Infratentorial origin (1pt), IVH (1pt), Volume ≥30cc (1pt). Higher score = worse prognosis." },
      { name: "Modified Rankin Scale", criteria: "Used for functional outcome assessment post-treatment." }
    ],

    management: {
      medical: [
        "Blood pressure control (SBP <140-160 mmHg if elevated; avoid excessive drop)",
        "Reverse anticoagulation (vitamin K, PCC, idarucizumab, andexanet alfa)",
        "Mannitol or hypertonic saline for elevated ICP",
        "Seizure prophylaxis if indicated (controversial; treat if seizure occurs)",
        "Airway protection, ICU monitoring",
        "Avoid fever, maintain normoglycemia"
      ],
      surgical: [
        "Craniotomy with hematoma evacuation: controversial for putaminal ICH. May benefit if superficial, lobar, cerebellar >3cm, or brainstem compression.",
        "Minimally invasive aspiration (stereotactic/endoscopic) with or without thrombolysis — investigational but promising.",
        "EVD if hydrocephalus from IVH.",
        "Decompressive craniectomy if malignant edema/ICP refractory to medical therapy."
      ]
    },

    prognosis: `30-day mortality for basal ganglia ICH is approximately 30-50%, depending on size, GCS, IVH, and age. Poor prognostic factors: large volume, low GCS, intraventricular extension, infratentorial extension, age >80, spot sign on CTA.`,

    keywords: ["basal ganglia", "putaminal", "putamen", "caudate", "thalamic", "ich", "hemorrhage", "hematoma", "intracerebral", "hypertension", "stroke", "blood", "hyperdense", "spot sign"]
  },

  // ==================== GENERAL NEUROLOGY / NEUROSURGERY ====================
  general: {
    strokeOverview: `Stroke = acute focal neurological deficit due to vascular cause. Ischemic (85%) vs Hemorrhagic (15%). Time is brain. For ischemic: thrombolysis (tPA) within 4.5h, thrombectomy within 24h for large vessel occlusion (LVO) with favorable perfusion imaging. For hemorrhagic: BP control, reverse coagulopathy, manage ICP, consider surgery if indicated.`,

    icpManagement: `Intracranial pressure management ladder: head of bed 30°, normocapnia, sedation, osmotherapy (mannitol 20% 0.25-1g/kg or 3% hypertonic saline), CSF drainage (EVD), decompressive craniectomy. Maintain CPP 60-70 mmHg.`,

    gsc: `Glasgow Coma Scale (GCS): Eye (1-4), Verbal (1-5), Motor (1-6). Severe = ≤8 (intubate), Moderate = 9-12, Mild = 13-15.`,

    herniation: `Types: uncal (ipsilateral dilated pupil, contralateral hemiparesis), central/downward (coma, small pupils, posturing), subfalcine (cingulate under falx), tonsillar (Cushing triad: hypertension, bradycardia, irregular respiration). Emergency: Mannitol + hyperventilation (temporizing) + definitive treatment (evacuation, EVD, craniectomy).`,

    keywords: ["stroke", "ischemic", "hemorrhagic", "tpa", "thrombectomy", "icp", "gcs", "herniation", "coma", "evd", "craniectomy", "mannitol", "seizure", "epilepsy", "meningitis", "sah", "subarachnoid"]
  }
};

// Simple keyword-based intent matching
function findBestMatch(userMessage) {
  const msg = userMessage.toLowerCase();
  let bestTopic = null;
  let bestScore = 0;

  const topics = [
    { key: 'hydrocephalus', keywords: KnowledgeBase.hydrocephalus.keywords },
    { key: 'basalGangliaHemorrhage', keywords: KnowledgeBase.basalGangliaHemorrhage.keywords },
    { key: 'general', keywords: KnowledgeBase.general.keywords }
  ];

  for (const topic of topics) {
    let score = 0;
    for (const kw of topic.keywords) {
      if (msg.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic.key;
    }
  }

  return { topic: bestTopic, score: bestScore };
}

function generateResponse(userMessage) {
  const msg = userMessage.toLowerCase();
  const match = findBestMatch(userMessage);

  // Greetings
  if (/^(hi|hello|hey|greetings)/.test(msg)) {
    return `Hello. I am your neurology and neurosurgery assistant. I can help with:
- Hydrocephalus types, imaging, and management
- Distinguishing hydrocephalus ex vacuo from true hydrocephalus
- Basal ganglia hemorrhage (putaminal, caudate, thalamic)
- General neurocritical care (ICP, GCS, stroke, herniation)

How can I assist you today?`;
  }

  // Hydrocephalus types overview
  if (match.topic === 'hydrocephalus') {
    if (msg.includes('type') || msg.includes('kind') || msg.includes('classification')) {
      let resp = `Hydrocephalus can be classified as follows:\n\n`;
      KnowledgeBase.hydrocephalus.types.forEach((t, i) => {
        resp += `${i+1}. **${t.name}**\n${t.description}\n\n`;
      });
      return resp;
    }

    if (msg.includes('ex vacuo') || (msg.includes('distinguish') && msg.includes('atrophy'))) {
      return `**Hydrocephalus ex vacuo** is NOT true hydrocephalus. It is compensatory ventricular enlargement due to brain atrophy.\n\nKey distinguishing features from true hydrocephalus:\n${KnowledgeBase.hydrocephalus.exVacuoDistinguish}`;
    }

    if (msg.includes('nph') || msg.includes('normal pressure')) {
      const nph = KnowledgeBase.hydrocephalus.types.find(t => t.name.includes('Normal Pressure'));
      return `**${nph.name}**\n\n${nph.description}\n\n**Imaging:**\n${nph.imaging}\n\n**Management:**\n${nph.management}`;
    }

    if (msg.includes('obstructive') || msg.includes('non-communicating')) {
      const obs = KnowledgeBase.hydrocephalus.types.find(t => t.name.includes('Obstructive'));
      return `**${obs.name}**\n\n${obs.description}\n\n**Imaging:**\n${obs.imaging}\n\n**Management:**\n${obs.management}`;
    }

    if (msg.includes('communicating')) {
      const com = KnowledgeBase.hydrocephalus.types.find(t => t.name.includes('Communicating'));
      return `**${com.name}**\n\n${com.description}\n\n**Imaging:**\n${com.imaging}\n\n**Management:**\n${com.management}`;
    }

    if (msg.includes('imaging') || msg.includes('ct') || msg.includes('mri')) {
      return `**Hydrocephalus Imaging Clues:**\n- True hydrocephalus: Enlarged ventricles with possible periventricular transependymal edema (hypodense on CT, hyperintense on T2/FLAIR MRI). Rounding of frontal horns, ballooning of third ventricle.\n- NPH: DESH pattern (disproportionately enlarged Sylvian fissures with tight high convexity sulci). Aqueductal CSF flow void on MRI.\n- Ex vacuo: Proportionate sulcal enlargement, NO periventricular edema, no ballooning.`;
    }

    if (msg.includes('treatment') || msg.includes('management') || msg.includes('shunt') || msg.includes('etv')) {
      return `**Hydrocephalus Management Overview:**\n- **VP Shunt:** Standard for most communicating and many obstructive cases. Programmable valves preferred.\n- **ETV (Endoscopic Third Ventriculostomy):** Best for obstructive hydrocephalus (aqueductal stenosis) in patients >2 years. Not effective for communicating/NPH in most cases.\n- **EVD:** Temporary external drain for acute decompression or post-SAH/IVH.\n- **Lumbar drain / serial LP:** For iNPH trial or post-SAH communicating hydrocephalus.\n- Ex vacuo: No surgery needed; treat underlying atrophy/dementia.`;
    }

    return `**Hydrocephalus Overview:**\n${KnowledgeBase.hydrocephalus.overview}\n\nWould you like to know about specific types (communicating, obstructive, NPH, ex vacuo, congenital, acquired), imaging features, or management?`;
  }

  // Basal ganglia hemorrhage
  if (match.topic === 'basalGangliaHemorrhage') {
    if (msg.includes('imaging') || msg.includes('ct') || msg.includes('mri') || msg.includes('cta')) {
      return `**Basal Ganglia Hemorrhage Imaging:**\n\n**CT (initial study of choice):**\n${KnowledgeBase.basalGangliaHemorrhage.imaging.ct}\n\n**MRI:**\n${KnowledgeBase.basalGangliaHemorrhage.imaging.mri}\n\n**CTA:**\n${KnowledgeBase.basalGangliaHemorrhage.imaging.cta}`;
    }

    if (msg.includes('management') || msg.includes('treatment') || msg.includes('surgery')) {
      let resp = `**Medical Management:**\n`;
      KnowledgeBase.basalGangliaHemorrhage.management.medical.forEach(m => resp += `- ${m}\n`);
      resp += `\n**Surgical Management:**\n`;
      KnowledgeBase.basalGangliaHemorrhage.management.surgical.forEach(s => resp += `- ${s}\n`);
      return resp;
    }

    if (msg.includes('cause') || msg.includes('etiology') || msg.includes('why')) {
      let resp = `**Common Causes of Basal Ganglia Hemorrhage:**\n`;
      KnowledgeBase.basalGangliaHemorrhage.etiology.forEach(e => resp += `- ${e}\n`);
      return resp;
    }

    if (msg.includes('prognosis') || msg.includes('outcome') || msg.includes('mortality') || msg.includes('survive')) {
      return KnowledgeBase.basalGangliaHemorrhage.prognosis;
    }

    if (msg.includes('putamen') || msg.includes('putaminal')) {
      return `**Putaminal Hemorrhage** is the most common spontaneous ICH. It typically results from rupture of lenticulostriate arteries due to chronic hypertension. Clinically causes contralateral hemiparesis, sensory loss, and gaze deviation. It can extend into the internal capsule, thalamus, or ventricles. Management depends on size, GCS, and IVH extension.`;
    }

    if (msg.includes('thalamic')) {
      return `**Thalamic Hemorrhage** arises from rupture of thalamoperforating arteries. Presents with contralateral sensory loss > motor deficits, downward gaze palsy, pupillary abnormalities, and altered consciousness. May extend into third ventricle causing hydrocephalus. Poorer prognosis if bilateral or with IVH.`;
    }

    if (msg.includes('caudate')) {
      return `**Caudate Hemorrhage** is less common. Often presents with headache, nausea, altered mental status, and contralateral hemiparesis. High rate of intraventricular extension because the caudate head borders the lateral ventricle. Look for underlying AVM in younger patients.`;
    }

    return `**Basal Ganglia Hemorrhage Overview:**\n${KnowledgeBase.basalGangliaHemorrhage.overview}\n\n**Anatomy:**\n${KnowledgeBase.basalGangliaHemorrhage.anatomy}\n\nWould you like details on causes, imaging, management, or prognosis?`;
  }

  // General neurology / neurosurgery
  if (match.topic === 'general') {
    if (msg.includes('stroke')) {
      return KnowledgeBase.general.strokeOverview;
    }
    if (msg.includes('icp') || msg.includes('intracranial pressure')) {
      return KnowledgeBase.general.icpManagement;
    }
    if (msg.includes('gcs') || msg.includes('glasgow')) {
      return KnowledgeBase.general.gsc;
    }
    if (msg.includes('herniation')) {
      return KnowledgeBase.general.herniation;
    }
    return `I can help with stroke management, ICP management, GCS scoring, herniation syndromes, and other neurocritical care topics. What would you like to know?`;
  }

  // Fallback
  return `I'm your neurology and neurosurgery assistant. I specialize in:
- Hydrocephalus (all types, including how to distinguish ex vacuo)
- Basal ganglia hemorrhage (putaminal, thalamic, caudate)
- Neurocritical care (ICP, GCS, stroke, herniation)

Could you rephrase your question or ask about one of these topics?`;
}

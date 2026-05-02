import json
import os
import sys

import slicer
from DICOMLib import DICOMUtils


input_dir = os.path.abspath(sys.argv[-1])
log = {"input_dir": input_dir, "series": [], "load_result": None, "nodes": [], "dicomutils": []}
log["dicomutils"] = [name for name in dir(DICOMUtils) if "load" in name.lower() or "series" in name.lower()]
slicer.mrmlScene.Clear(0)

with DICOMUtils.TemporaryDICOMDatabase() as db:
    DICOMUtils.importDicom(input_dir, db)
    print("patients", db.patients())
    for patient_uid in db.patients():
        for study_uid in db.studiesForPatient(patient_uid):
            for series_uid in db.seriesForStudy(study_uid):
                files = db.filesForSeries(series_uid)
                print("series", series_uid, "files", len(files))
                log["series"].append({"series_uid": series_uid, "file_count": len(files), "first_file": files[0] if files else None})
    for patient_uid in db.patients():
        result = DICOMUtils.loadPatientByUID(patient_uid)
        print("loadPatientByUID result", type(result), result)
        log["load_result"] = str(result)

nodes = slicer.util.getNodesByClass("vtkMRMLScalarVolumeNode")
print("scalar volume nodes", len(nodes))
for node in nodes:
    image_data = node.GetImageData()
    dims = image_data.GetDimensions() if image_data else None
    print("node", node.GetID(), node.GetName(), "dims", dims, "spacing", node.GetSpacing())
    log["nodes"].append({"id": node.GetID(), "name": node.GetName(), "dims": dims, "spacing": node.GetSpacing()})

with open(r"C:\tmp\slicer-inspect.json", "w", encoding="utf-8") as f:
    json.dump(log, f, indent=2)

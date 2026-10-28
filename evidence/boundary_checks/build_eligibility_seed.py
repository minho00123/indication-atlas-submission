#!/usr/bin/env python3
"""Build the frozen eligibility seed set from real ClinicalTrials.gov records (fetched 2026-10-28).

Labels are PROVISIONAL_RESEARCHER_LABEL by a single annotator (Claude). They are NOT expert gold.
Two separate labels per item:
  concept_id_match      : best MONDO class for the sponsor's condition text (or NONE / HOLD)
  eligibility_equivalence: is "patients with <bare concept>" the same population as the excerpt?
       EQUIVALENT | NARROWER (excerpt restricts) | BROADER (excerpt admits more) | DIFFERENT | NOT_DISEASE | UNKNOWN
This file must not be used to write rules; it is a TEST candidate and is frozen by sha256 below.
"""
import csv, hashlib, json
from pathlib import Path
HERE = Path(__file__).resolve().parent
raw = json.loads((HERE / "ctgov_items_raw_20261028.json").read_text(encoding="utf8"))
# (raw_index, condition_text, concept MONDO or NONE/HOLD, concept_relation of best available class, eligibility label, qualifiers, hazard note)
L = [
 (0, "Acute Myeloid Leukemia (AML)", "MONDO:0018874", "EXACT", "NARROWER", "relapsed/refractory; CAR-T candidate", "bare AML loses R/R status"),
 (1, "Metastatic Castration-resistant Prostate Cancer", "MONDO:0850353", "BROADER", "NARROWER", "metastatic; testosterone <50 ng/dL", "MONDO has no mCRPC class; candidate is broader"),
 (2, "Triple Negative Breast Cancer", "MONDO:0005494", "EXACT", "BROADER", "eligibility admits ER-low positive", "condition label narrower than eligibility"),
 (2, "HER2-negative Breast Cancer", "MONDO:0000618", "EXACT", "NARROWER", "HR-negative or HR-low", ""),
 (3, "NSCLC Stage IV", "MONDO:0005233", "BROADER", "NARROWER", "non-squamous; stage IIIB-IV; EGFR-mutant; post EGFR-TKI", "stage folded into condition string"),
 (3, "EGFR Gene Mutation", "NONE", "NOT_APPLICABLE", "NOT_DISEASE", "biomarker listed as condition", "must route to biomarker field"),
 (4, "Adult Patients With Adverse Risk Acute Myeloblastic Leukemia", "MONDO:0018874", "BROADER", "DIFFERENT", "first-line intermediate/adverse ELN2022 OR relapsed any risk; age>=60", "title narrower than eligibility"),
 (5, "MASLD/MASH ... NAFLD (Nonalcoholic Fatty Liver Disease)", "MONDO:0013209", "EXACT", "DIFFERENT", "population = major liver surgery", "sponsor condition list is not eligibility"),
 (6, "Fatty Liver", "MONDO:0004790", "EXACT", "BROADER", "ultrasound fatty liver; no alcohol exclusion in excerpt", "title says NAFLD; NAFLD!=MASLD criteria"),
 (7, "Chronic Spontaneous Urticaria (CSU)", "HOLD", "UNKNOWN", "UNKNOWN", "excerpt uninformative", "no exact MONDO class; nearest MONDO:0044212 (CIU)"),
 (8, "Menopausal Symptoms", "NONE", "NOT_APPLICABLE", "NOT_DISEASE", "women 40-70, prevalence study", ""),
 (9, "Obesity", "MONDO:0011122", "EXACT", "NARROWER", "prescribed GLP-1 class AOM, then discontinuation", "treatment history"),
 (12, "T-cell Lymphoma", "MONDO:0015760", "EXACT", "NARROWER", "advanced malignancy basket", ""),
 (13, "Chronic Lymphocytic Leukemia (CLL) / Small Lymphocytic Lymphoma (SLL)", "MONDO:0003864", "EXACT", "EQUIVALENT", "", "MONDO places this under ALL via MONDO:0004948 (rollup hazard)"),
 (14, "Active Non-radiographic Axial Spondyloarthritis", "MONDO:0005095", "BROADER", "NARROWER", "active disease", "no nr-axSpA class in MONDO"),
 (15, "CPPD - Calcium Pyrophosphate Deposition Disease", "MONDO:0001314", "EXACT", "DIFFERENT", "population = Gitelman syndrome; CPPD is an outcome", "condition list includes outcomes"),
 (16, "Onychomycosis", "MONDO:0001628", "EXACT", "NARROWER", "KOH+ and culture+; 20-60% great toenail", "MONDO class sits under dermatophytosis"),
 (18, "Diabetic Kidney Disease", "MONDO:0005016", "EXACT", "NARROWER", "type 2 diabetes, HbA1c<10.5%", ""),
 (19, "Perianal Fistula Due to Crohn's Disease", "MONDO:0005011", "BROADER", "NARROWER", "perianal fistulizing; CD >=6 months", "phenotype qualifier"),
 (20, "Celiac Disease", "MONDO:0005130", "EXACT", "NARROWER", "active disease; gluten exposure protocol", ""),
 (21, "Chronic Hand Eczema", "HOLD", "UNKNOWN", "NARROWER", "moderate-to-severe CHE", "no exact MONDO class"),
 (22, "Smoldering Plasma Cell Myeloma", "MONDO:0005235", "EXACT", "NARROWER", "high-risk; diagnosed within 12 months", "must not merge with multiple myeloma"),
 (23, "Multiple Myeloma | MGUS | Smoldering Multiple Myeloma", "MONDO:0009693+MONDO:0004225+MONDO:0005235", "SPLIT", "DIFFERENT", "OR of three entities", ""),
 (24, "Heart Failure, Diastolic", "MONDO:0006727", "RELATED", "NARROWER", "LVEF>=50%; NT-proBNP>220", "HFpEF is not identical to diastolic dysfunction"),
 (25, "Triple Negative Breast Cancer (basket)", "MONDO:0005494", "EXACT", "NARROWER", ">=2 prior therapies; advanced", ""),
 (26, "Hemophilia A With Inhibitor | Hemophilia B With Inhibitor", "MONDO:0010602+MONDO:0010604", "SPLIT", "NARROWER", "inhibitor-positive", "inhibitor status lost on mapping"),
 (27, "Post-Acute COVID-19 Vaccination Syndrome", "NONE", "UNKNOWN", "DIFFERENT", "", "must NOT map to long COVID MONDO:0100233"),
 (28, "Latent Tuberculosis | Tuberculosis", "MONDO:0040753+MONDO:0018076", "SPLIT", "DIFFERENT", "infection state vs disease", ""),
 (29, "Clostridioides Difficile Infection", "MONDO:0000705", "EXACT", "UNKNOWN", "documented CDI; FMT study", "MONDO label says colitis"),
 (31, "Giant Cell Arteritis | Temporal Arteritis", "MONDO:0008538", "EXACT", "NARROWER", "SONIC-GCA participants", "two strings, one concept"),
 (32, "Alzheimer's Disease", "MONDO:0004975", "BROADER", "DIFFERENT", "MCI (Petersen 2004), CDR 0.5", "stage; AD pathology not required in excerpt"),
 (33, "Type I Diabetes", "MONDO:0005147", "EXACT", "UNKNOWN", "excerpt uninformative", ""),
 (34, "Lupus Nephritis - WHO Class III / IV", "MONDO:0005556", "BROADER", "NARROWER", "class III/IV; SLE by EULAR/ACR 2019", "SLE listed is parent, not separate population"),
 (35, "Chronic Hepatitis B Virus (HBV) Infection", "MONDO:0005366", "EXACT", "EQUIVALENT", "HBsAg+ >6 months", "parent MONDO:0005344 would be broader"),
 (36, "Circadian Variation in Anti-Factor Xa Activity", "NONE", "NOT_APPLICABLE", "NOT_DISEASE", "trauma inpatients on VTE prophylaxis", "at-risk population"),
 (37, "Seasonal Allergic Rhinitis | Grass Pollen Allergy", "MONDO:0005324", "EXACT", "DIFFERENT", "SAR adults; grass sensitisation not required", "allergen-specific concept not supported by eligibility"),
 (38, "Locally Advanced Basal Cell Carcinoma", "MONDO:0005341", "BROADER", "NARROWER", "locally advanced, non-metastatic, cutaneous", ""),
 (39, "BCG-Unresponsive Bladder Cancer (NMIBC)", "MONDO:0004986", "BROADER", "NARROWER", "BCG-unresponsive; non-muscle-invasive urothelial", ""),
 (40, "Ph+ ALL", "MONDO:0035940", "EXACT", "NARROWER", "newly diagnosed; BCR::ABL1+; age>=14", "same MONDO class lists 'Philadelphia chromosome-like B-ALL' (BCR-ABL1-negative) as EXACT"),
 (42, "Ankylosing Spondylitis", "MONDO:0005306", "EXACT", "BROADER", "axial SpA by ASAS criteria", "condition label narrower than eligibility"),
 (43, "Pulmonary Embolism", "MONDO:0005279", "EXACT", "NARROWER", "RV/LV>0.9 on CTA", "risk stratum"),
 (44, "Dermatomyositis | Panniculitis", "MONDO:0016367", "EXACT", "DIFFERENT", "dermatomyositis any; panniculitis is the studied feature", ""),
]
items = []
for n, (ri, cond, cid, rel, elig, qual, note) in enumerate(L, 1):
    r = raw[ri]
    items.append(dict(item_id=f"E{n:02d}", nct=r["nct"], url=f"https://clinicaltrials.gov/study/{r['nct']}", category=r["category"],
                      title=r["title"], condition_text=cond, eligibility_excerpt=" / ".join(r["inclusion_excerpt"]),
                      concept_id_match=cid, concept_relation=rel, eligibility_equivalence=elig, qualifiers=qual,
                      hazard_note=note, label_status="PROVISIONAL_RESEARCHER_LABEL", annotators=["claude-single"],
                      needs_independent_second_annotation=True))
body = json.dumps(items, ensure_ascii=False, indent=1, sort_keys=True)
frozen = dict(_about=__doc__, frozen_sha256_of_items=hashlib.sha256(body.encode()).hexdigest(), n=len(items), items=items)
(HERE / "eligibility_seed_v1.json").write_text(json.dumps(frozen, ensure_ascii=False, indent=1), encoding="utf8")
with (HERE / "eligibility_seed_v1.csv").open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=[k for k in items[0] if k != "annotators"], extrasaction="ignore")
    w.writeheader(); w.writerows(items)
from collections import Counter
print(len(items), frozen["frozen_sha256_of_items"][:16], Counter(i["eligibility_equivalence"] for i in items), Counter(i["category"] for i in items))

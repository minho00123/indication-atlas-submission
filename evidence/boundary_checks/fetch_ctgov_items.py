import json,urllib.parse,urllib.request,re,sys,time
Q=[("treatment_history","relapsed refractory acute myeloid leukemia"),("treatment_history","metastatic castration-resistant prostate cancer"),("biomarker","HER2-low breast cancer"),("biomarker","EGFR mutation non-small cell lung cancer"),("or_condition","myelodysplastic syndrome OR acute myeloid leukemia"),("renamed_definition","MASH fibrosis"),("renamed_definition","nonalcoholic fatty liver disease"),("subtype","chronic spontaneous urticaria"),("symptom_vs_disease","vasomotor symptoms menopause"),("symptom_vs_disease","overweight obesity weight management"),("state_vs_disease","renal impairment pharmacokinetics"),("subtype","primary adrenal insufficiency"),("hierarchy","peripheral T-cell lymphoma"),("hierarchy","small lymphocytic lymphoma"),("subtype","non-radiographic axial spondyloarthritis"),("hierarchy","calcium pyrophosphate deposition disease"),("hierarchy","onychomycosis"),("definition","metabolic syndrome"),("definition","diabetic kidney disease"),("phenotype_qualifier","perianal fistulizing Crohn's disease"),("subtype","celiac disease"),("subtype","chronic hand eczema"),("precursor_vs_disease","smoldering multiple myeloma"),("precursor_vs_disease","monoclonal gammopathy of undetermined significance"),("biomarker","heart failure with preserved ejection fraction"),("biomarker","triple negative breast cancer"),("phenotype_qualifier","hemophilia A with inhibitors"),("definition","post COVID-19 condition"),("precursor_vs_disease","latent tuberculosis infection"),("treatment_history","recurrent Clostridioides difficile infection"),("precursor_vs_disease","prediabetes"),("subtype","giant cell arteritis"),("stage","early Alzheimer's disease"),("stage","stage 2 type 1 diabetes"),("subtype","lupus nephritis class III IV"),("chronicity","chronic hepatitis B"),("hierarchy","venous thromboembolism"),("allergen","grass pollen allergic rhinitis"),("stage","locally advanced basal cell carcinoma"),("treatment_history","BCG-unresponsive non-muscle invasive bladder cancer"),("biomarker","Philadelphia chromosome positive acute lymphoblastic leukemia"),("abbreviation","CSU"),("abbreviation","AS ankylosing spondylitis"),("abbreviation","PE pulmonary embolism"),("abbreviation","DM dermatomyositis")]
out=[]
for cat,q in Q:
    url="https://clinicaltrials.gov/api/v2/studies?"+urllib.parse.urlencode({"query.cond":q,"pageSize":1,"filter.overallStatus":"RECRUITING","fields":"NCTId,BriefTitle,Condition,EligibilityCriteria"})
    try:
        d=json.load(urllib.request.urlopen(url,timeout=40))
    except Exception as e:
        print('ERR',q,e,file=sys.stderr); continue
    for s in d.get('studies',[]):
        p=s['protocolSection']; el=p.get('eligibilityModule',{}).get('eligibilityCriteria','')
        inc=el.split('Exclusion')[0]
        lines=[re.sub(r'\s+',' ',l.strip(' *-\\')) for l in inc.split('\n') if len(l.strip())>15][:4]
        out.append(dict(category=cat,query=q,nct=p['identificationModule']['nctId'],title=p['identificationModule'].get('briefTitle',''),conditions=p.get('conditionsModule',{}).get('conditions',[]),inclusion_excerpt=lines))
    time.sleep(0.3)
json.dump(out,open('ctgov_items_raw_new.json','w'),ensure_ascii=False,indent=1)  # frozen copy: ctgov_items_raw_20261028.json
print(len(out))

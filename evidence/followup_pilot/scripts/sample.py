import json,random,sys,re
d=json.load(open(sys.argv[1]))
rng=random.Random(20261029)
S=d['studies'];idx=sorted(rng.sample(range(len(S)),400))
rows=[]
for i in idx:
    ps=S[i]['protocolSection'];nct=ps['identificationModule']['nctId']
    conds=ps.get('conditionsModule',{}).get('conditions',[])
    elig=ps.get('eligibilityModule',{}).get('eligibilityCriteria','') or ''
    m=re.split(r'(?i)exclusion criteria',elig,maxsplit=1);incl=m[0][:10000]
    for c in conds: rows.append({'nct':nct,'title':ps['identificationModule'].get('briefTitle',''),'type':ps.get('designModule',{}).get('studyType',''),'condition':c[:200],'text':incl})
json.dump({'seed':20261029,'population':len(S),'sampled_studies':len(idx),'rows':rows},open(sys.argv[2],'w'))
print('studies',len(idx),'study-condition rows',len(rows),'no-condition studies',sum(1 for i in idx if not S[i]['protocolSection'].get('conditionsModule',{}).get('conditions')))

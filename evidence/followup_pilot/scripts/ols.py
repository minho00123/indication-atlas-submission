import json,sys,random,urllib.request,urllib.parse,time,collections as C
R=json.load(open(sys.argv[1]))
norm=lambda s:' '.join(s.lower().split())
u=sorted({norm(r['condition']):r['condition'] for r in R if r.get('decision')=='UNREGISTERED'}.items())
rng=random.Random(7);pick=rng.sample(u,60);out=[]
for k,c in pick:
    q=urllib.parse.urlencode({'q':c,'ontology':'mondo','exact':'true','queryFields':'label,synonym','rows':'3'})
    try:
        with urllib.request.urlopen('https://www.ebi.ac.uk/ols4/api/search?'+q,timeout=30) as r: d=json.load(r)
        docs=[(x.get('obo_id'),x.get('label')) for x in d['response']['docs']]
    except Exception as e: docs='ERR '+str(e)[:40]
    out.append((c,docs));time.sleep(0.3)
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,indent=0)
hit=[o for o in out if isinstance(o[1],list) and o[1]];miss=[o for o in out if isinstance(o[1],list) and not o[1]]
print('exact MONDO hit',len(hit),'/ 60  miss',len(miss),'err',60-len(hit)-len(miss))
print('HIT:',[(c,d[0][1]) for c,d in hit])
print('MISS:',[c for c,_ in miss])

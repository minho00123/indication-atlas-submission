import json,sys,collections as C,urllib.request,urllib.parse,time
V,REPO=sys.argv[1],sys.argv[2]
A={x['item']:x for x in json.load(open(V+'/judge/annotator_A.json'))};B={x['item']:x for x in json.load(open(V+'/judge/annotator_B.json'))}
items={x['item']:x for x in json.load(open(V+'/judge/items.json'))}
keys=sorted(items);n=len(keys)
def kappa(a,b):
    po=sum(x==y for x,y in zip(a,b))/len(a);ca,cb=C.Counter(a),C.Counter(b)
    pe=sum(ca[k]*cb[k] for k in set(ca)|set(cb))/len(a)**2
    return po,(po-pe)/(1-pe) if pe<1 else 1.0
da=[A[k]['research_decision'] for k in keys];db=[B[k]['research_decision'] for k in keys]
po,k=kappa(da,db);print(f'decision agreement {po:.0%} kappa {k:.2f}')
ea=[A[k]['entity_type'] for k in keys];eb=[B[k]['entity_type'] for k in keys];po2,k2=kappa(ea,eb);print(f'entity_type agreement {po2:.0%} kappa {k2:.2f}')
print('A',C.Counter(da));print('B',C.Counter(db))
def norm(i): 
    if not i: return None
    i=i.replace('NCIt:','NCIT:').replace('ncit:','NCIT:');return i
same_sel=0;compat=0;rows=[]
for kk in keys:
    a,b=A[kk],B[kk];sa,sb=norm(a.get('selected_id')),norm(b.get('selected_id'))
    exa={norm(r['id']) for r in a.get('candidate_relations',[]) if r.get('relation')=='EXACT'}|({sa} if sa else set())
    exb={norm(r['id']) for r in b.get('candidate_relations',[]) if r.get('relation')=='EXACT'}|({sb} if sb else set())
    s=sa==sb; c=s or bool(sa and sb and (sa in exb or sb in exa))
    same_sel+=s;compat+=c
    rows.append((kk,items[kk]['condition'],a['research_decision'],sa,b['research_decision'],sb,'=' if a['research_decision']==b['research_decision'] else 'X','same' if s else ('compat' if c else 'diff')))
print(f'selected id identical {same_sel}/{n}, identical-or-cross-EXACT {compat}/{n}')
for r in rows: print(' | '.join(str(x) for x in r))
# gaps & confidence
print('gap flags A',sum(A[k]['guideline_gap']['flag'] for k in keys),'B',sum(B[k]['guideline_gap']['flag'] for k in keys))
print('confidence A',C.Counter(A[k]['confidence'] for k in keys),'B',C.Counter(B[k]['confidence'] for k in keys))
json.dump(rows,open(V+'/judge/compare_rows.json','w'),ensure_ascii=False)
# ID existence check
ids=set()
for X in (A,B):
    for k in keys:
        x=X[k];[ids.add(norm(i)) for i in [x.get('selected_id')]+[r['id'] for r in x.get('candidate_relations',[])] if i]
def exists(i):
    try:
        if i.startswith('MONDO:'):
            u='https://www.ebi.ac.uk/ols4/api/ontologies/mondo/terms/'+urllib.parse.quote(urllib.parse.quote('http://purl.obolibrary.org/obo/'+i.replace(':','_'),safe=''),safe='')
            with urllib.request.urlopen(u,timeout=30) as r: d=json.load(r);return d.get('label')
        if i.startswith('HP:'):
            u='https://www.ebi.ac.uk/ols4/api/ontologies/hp/terms/'+urllib.parse.quote(urllib.parse.quote('http://purl.obolibrary.org/obo/'+i.replace(':','_'),safe=''),safe='')
            with urllib.request.urlopen(u,timeout=30) as r: return json.load(r).get('label')
        if i.startswith('NCIT:'):
            with urllib.request.urlopen('https://api-evsrest.nci.nih.gov/api/v1/concept/ncit/'+i[5:],timeout=30) as r: return json.load(r).get('name')
        if i.upper().startswith('MESH:'):
            with urllib.request.urlopen('https://id.nlm.nih.gov/mesh/lookup/label?resource='+i.split(':')[1],timeout=30) as r: d=json.load(r);return str(d.get('label',d))[:60]
        return '?unknown-prefix'
    except Exception as e: return None
missing=[]
for i in sorted(ids):
    l=exists(i);time.sleep(0.2)
    if not l: missing.append(i)
print('IDs cited',len(ids),'not found',missing)

import json,sys,re,urllib.request,urllib.parse,time
V=sys.argv[1];items=json.load(open(V+'/judge/items.json'))
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'indication-atlas-validation/0.1'}),timeout=40) as r: return json.load(r)
def mondo(q):
    d=get('https://www.ebi.ac.uk/ols4/api/search?'+urllib.parse.urlencode({'q':q,'ontology':'mondo','rows':'8','fieldList':'obo_id,label,description,synonym,exact_synonyms'}))
    return [{'id':x.get('obo_id'),'label':x.get('label'),'definition':(x.get('description') or [''])[0][:600],'synonyms':(x.get('exact_synonyms') or x.get('synonym') or [])[:6]} for x in d['response']['docs'] if x.get('obo_id','').startswith('MONDO:')]
def ncit(q):
    cs=[];seen=set()
    for typ,n in (('match','5'),('startsWith','5'),('contains','6')):
        d=get('https://api-evsrest.nci.nih.gov/api/v1/concept/ncit/search?'+urllib.parse.urlencode({'term':q,'type':typ,'include':'definitions,synonyms','pageSize':n}))
        for c in d.get('concepts',[]):
            if c['code'] not in seen: seen.add(c['code']);cs.append(c)
    out=[]
    for c in cs[:8]:
        defs=[x['definition'][:600] for x in c.get('definitions',[]) if x.get('source') in ('NCI',None)][:1] or [x['definition'][:600] for x in c.get('definitions',[])][:1]
        syn=sorted({s['name'] for s in c.get('synonyms',[])})[:6]
        out.append({'id':'NCIT:'+c['code'],'label':c['name'],'definition':defs[0] if defs else '','synonyms':syn,'active':c.get('active')})
    return out
for it in items:
    qs=[it['condition']];m=re.match(r'^(.*?)\s*\(([^)]+)\)\s*$',it['condition'])
    if m: qs=[m.group(1),it['condition']]
    q=qs[0];it['candidate_query']=q
    try: it['mondo_candidates']=mondo(q)
    except Exception as e: it['mondo_candidates']=[];it['mondo_error']=str(e)[:80]
    try: it['ncit_candidates']=ncit(q)
    except Exception as e: it['ncit_candidates']=[];it['ncit_error']=str(e)[:80]
    print(it['item'],q,len(it['mondo_candidates']),len(it['ncit_candidates']),it.get('mondo_error',''),it.get('ncit_error',''),flush=True);time.sleep(0.3)
pack=[{k:v for k,v in it.items() if not k.startswith('engine_')} for it in items]
json.dump(pack,open(V+'/judge/pack.json','w'),ensure_ascii=False,indent=1)

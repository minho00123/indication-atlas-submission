import json,sys,urllib.request,urllib.parse,time
out=sys.argv[1]
base='https://clinicaltrials.gov/api/v2/studies'
params={'filter.advanced':'AREA[StudyFirstPostDate]RANGE[2026-09-01,2026-09-30]','fields':'NCTId,BriefTitle,Condition,EligibilityCriteria,StudyType','pageSize':'1000','countTotal':'true','format':'json'}
studies=[];tok=None;total=None
while True:
    p=dict(params)
    if tok:p['pageToken']=tok
    url=base+'?'+urllib.parse.urlencode(p)
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'indication-atlas-validation/0.1'}),timeout=60) as r: d=json.load(r)
    total=d.get('totalCount',total);studies+=d.get('studies',[]);tok=d.get('nextPageToken')
    print(len(studies),'/',total,flush=True)
    if not tok:break
    time.sleep(1)
json.dump({'query':params,'fetched_at':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'total':total,'studies':studies},open(out,'w'))

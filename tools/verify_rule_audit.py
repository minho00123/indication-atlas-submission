"""Verify saved JS audit provenance and aggregates without requiring Node at build time."""
import hashlib
import json
from collections import Counter
from pathlib import Path
from dataset import ROOT,load,normalize

DEPENDENCIES={'app/analyzer.mjs','app/rule-audit.mjs','app/search.js','data/dictionary.json','data/records.json','data/comparisons.json','data/rule_support.json','data/rule_audit.json'}

def verify():
    manifest=load('rule_audit_manifest.json')
    if set(manifest['files'])!=DEPENDENCIES:raise ValueError('Audit dependency set differs')
    for name,digest in manifest['files'].items():
        if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=digest:raise ValueError('Stale rule audit: '+name)
    audit=load('rule_audit.json');records=load('records.json');core=load('dictionary.json');pairs=load('comparisons.json')
    if audit['engine_version']!=manifest['engine_version'] or load('rule_support.json')['engine_version']!=audit['engine_version']:raise ValueError('Audit engine version differs')
    if len(audit['rows'])!=len(records) or [r['source_id'] for r in audit['rows']]!=[r['source_id'] for r in records]:raise ValueError('Audit input coverage differs')
    if audit['lookup']['total']!=len(core['aliases']) or audit['lookup']['statuses']!=dict(Counter(r['status'] for r in audit['lookup']['checks'])):raise ValueError('Lookup denominator differs')
    expected_aliases=[(a['source_id'],a['term'],a['concept_key']) for a in core['aliases']]
    if [(a['source_id'],a['term'],a['concept_key']) for a in audit['lookup']['checks']]!=expected_aliases:raise ValueError('Lookup input differs')
    for source,row in zip(records,audit['rows']):
        if any(row[k]!=source[k] for k in ['source_id','keyword','raw_context']):raise ValueError('Audit source was changed')
        if row['expected']!={'decision':source['research_decision'],'concept_key':source['concept_key'],'expression':source.get('expression')}:raise ValueError('Audit expected verdict differs')
        removed=row['B']['removed']
        if removed!={'aliases':sum(a['source_id']==source['source_id'] for a in core['aliases']),
                     'comparisons':sum(source['source_id'] in [p['left_source_id'],p['right_source_id']] for p in pairs),'expression':int(bool(source.get('expression')))}:raise ValueError('Ablation removal count differs')
        for mode in ['A','B']:
            if row[mode]['result']['eligibility_status']!='NOT_EVALUATED':raise ValueError('Eligibility was inferred')
    for mode in ['A','B']:
        summary=audit['summary'][mode]
        if summary['total']!=len(records) or summary['categories']!=dict(Counter(r[mode]['category'] for r in audit['rows'])):raise ValueError('Audit row denominator differs')
        checks=[c for r in audit['rows'] for c in r[mode]['checks']]
        if summary['check_total']!=len(checks):raise ValueError('Audit check denominator differs')
        for rule in summary['rules']:
            subset=[c for c in checks if c['rule']==rule['rule']]
            if rule['applications']!=len(subset) or rule['statuses']!=dict(Counter(c['status'] for c in subset)) or rule['rows']!=sum(any(c['rule']==rule['rule'] for c in r[mode]['checks']) for r in audit['rows']):raise ValueError('Rule aggregate differs')
    for filename in ['runtime_after.json','reverify_after.json']:
        after=json.loads((ROOT/'evidence/review_process'/filename).read_text())
        if after['engine_version']!=audit['engine_version']:raise ValueError('Reviewed input engine differs')
        for name,digest in after['dependencies'].items():
            if name not in DEPENDENCIES|{'app/analyzer-checks.mjs','data/analyzer_cases.json','evidence/review_process/runtime_before.json','evidence/review_process/reverify_before.json'}:raise ValueError('Unexpected runtime-review dependency')
            if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=digest:raise ValueError('Stale reviewed input result: '+name)
    review_manifest=json.loads((ROOT/'evidence/review_process/manifest.json').read_text())
    for name,digest in review_manifest['files'].items():
        if Path(name).name!=name:raise ValueError('Unsafe review evidence path')
        payload=(ROOT/'evidence/review_process'/name).read_bytes()
        if hashlib.sha256(payload).hexdigest()!=digest:raise ValueError('Review evidence hash differs')
        if b'/Users/' in payload:raise ValueError('Private path in public review evidence')
    return {'engine_version':audit['engine_version'],'rows':len(records),'aliases':len(core['aliases']),'A':audit['summary']['A']['categories'],'B':audit['summary']['B']['categories']}

if __name__=='__main__':print(json.dumps(verify(),ensure_ascii=False))

"""Validate the standalone snapshot and build a static site. No network calls."""
import csv
import hashlib
import json
import re
from pathlib import Path
import shutil
import zipfile
from dataset import ROOT, validate, summary, load
from markdown_render import render
from score_legacy import score as score_legacy
from case_review import prepare_stories
from verify_supplement import verify as verify_supplement
from verify_rule_audit import verify as verify_rule_audit

DIST = ROOT / 'dist'
DOCS = {'guidelines':'GUIDELINES.md','research':'SERVICE_RESEARCH.md',
        'methodology':'METHODOLOGY.md','run':'RUN.md','audit-method':'RULE_AUDIT.md'}


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')


def export_csv(path, rows, fields):
    with path.open('w',encoding='utf-8-sig',newline='') as file:
        writer=csv.DictWriter(file,fieldnames=fields);writer.writeheader()
        for row in rows:
            writer.writerow({k:json.dumps(row.get(k),ensure_ascii=False) if isinstance(row.get(k),(dict,list)) else row.get(k) for k in fields})


def source_files():
    names=[]
    for folder in ('app','data','evidence','docs','tools','tests','.github'):
        for path in sorted((ROOT/folder).rglob('*')):
            if path.is_file() and '__pycache__' not in path.parts and path.suffix!='.pyc':
                if path.is_symlink():raise ValueError('Source package cannot contain symlinks')
                names.append(path)
    names.extend(ROOT/name for name in ('README.md','START_HERE.md','netlify.toml','.gitignore','.gitattributes'))
    return sorted(names)


def build():
    records, core, sources, manifest = validate()
    score_legacy()
    verify_supplement()
    verify_rule_audit()
    for name in DOCS.values():
        if not (ROOT/'docs'/name).is_file():raise ValueError('Missing submission document: '+name)
    for folder in ('data/records','content','downloads'):(DIST/folder).mkdir(parents=True,exist_ok=True)
    # Remove pages retired by menu consolidation, including stale local build output.
    for name in ('review','analyzer','boundaries'):(DIST/'content'/f'{name}.html').unlink(missing_ok=True)
    for path in (ROOT/'app').iterdir():
        if path.is_file():shutil.copyfile(path,DIST/path.name)
    stats=summary(records,core,manifest)
    brief=[{k:v for k,v in r.items() if k!='reviewed_candidates'} for r in records]
    stories=prepare_stories(load('stories.json'),records,sources)
    known={r['source_id'] for r in records}
    for story in stories:
        if not set(story['source_ids']).issubset(known):raise ValueError('Case references missing row')
    # Identifies the exact rule engine and knowledge snapshot behind every runtime result.
    sha=lambda path:hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
    engine_version=re.search(r"ENGINE_VERSION = '([^']+)'",(ROOT/'app/analyzer.mjs').read_text(encoding='utf8'))[1]
    snapshot=dict(engine_version=engine_version,engine_sha256=sha('app/analyzer.mjs'),dictionary_sha256=sha('data/dictionary.json'),
        records_sha256=sha('data/records.json'),comparisons_sha256=sha('data/comparisons.json'))
    dump(DIST/'data/catalog.json',dict(metadata=dict(stats,snapshot=snapshot),**core,records=brief,sources=sources,stories=stories,comparisons=load('comparisons.json')))
    for row in records:dump(DIST/'data/records'/f"{row['source_id']}.json",row)
    dump(DIST/'data/analyzer-cases.json',load('analyzer_cases.json'))
    dump(DIST/'data/rule-support.json',load('rule_support.json'))
    audit=load('rule_audit.json')
    dump(DIST/'downloads/rule-audit.json',audit)
    for mode in ('A','B'):
        dump(DIST/'downloads'/f'rule-audit-{mode}.json',dict(engine_version=audit['engine_version'],purpose=audit['purpose'],limitations=audit['limitations'],summary=audit['summary'][mode],rows=[dict(source_id=r['source_id'],keyword=r['keyword'],raw_context=r['raw_context'],expected=r['expected'],**r[mode]) for r in audit['rows']]))
    dump(DIST/'downloads/rule-audit-C.json',dict(engine_version=audit['engine_version'],purpose=audit['purpose'],limitations=audit['limitations'],summary=audit['summary'],rows=[dict(source_id=r['source_id'],A=r['A']['checks'],B=r['B']['checks']) for r in audit['rows']]))
    dump(DIST/'downloads/rule-audit-lookup.json',audit['lookup'])
    for key, filename in DOCS.items():
        content=render((ROOT/'docs'/filename).read_text(encoding='utf8'))
        if key=='methodology':
            content=content.replace('<h2>6.', '<h2 id="method-counterexamples" tabindex="-1">6.').replace('<h2>7.', '<h2 id="method-future" tabindex="-1">7.')
            supplement=render((ROOT/'docs/LEGACY_EXPERIMENT.md').read_text(encoding='utf8'))
            content+='<details class="legacy-experiment"><summary>초기 탐색 실험(구 정책 기준)</summary><div class="legacy-content">'+supplement+'</div></details>'
        if key=='audit-method':
            content=re.sub(r'<h([1-5])>(.*?)</h\1>',lambda m:f'<h{int(m[1])+1}>'+('대조 방법' if m[1]=='1' else m[2])+f'</h{int(m[1])+1}>',content)
        if key=='methodology':
            for filename,title in [('EXTERNAL_BASELINES.md','보조 자료 1 · 외부 코퍼스 문자열 매칭 기준선(과거 탐색)'),('EXTERNAL_TRIALS.md','보조 자료 2 · 실제 임상시험 문구 비교(잠정 라벨)')]:
                supplement=render((ROOT/'docs'/filename).read_text(encoding='utf8'))
                content+='<details class="legacy-experiment external-supplement"><summary>'+title+'</summary><div class="legacy-content">'+supplement+'</div></details>'
        (DIST/'content'/f'{key}.html').write_text(content,encoding='utf8')
    shutil.copytree(ROOT/'evidence/review_process',DIST/'evidence/review_process',dirs_exist_ok=True)
    shutil.copytree(ROOT/'evidence/boundary_checks',DIST/'evidence/boundary_checks',dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    fields=['source_id','keyword','raw_context','input_normalized_condition','standard_name','concept_key','entity_type',
            'research_decision','selected_standard_id','rationale_ko','context_required','evidence_refs',
            'clinical_attributes','concept_name_components','scope_assumptions','definition_warnings']
    export_csv(DIST/'downloads/judgments.csv',records,fields)
    export_csv(DIST/'downloads/aliases.csv',core['aliases'],['term','concept_key','source_id','kind','context_required','evidence_refs'])
    shutil.copyfile(ROOT/'data/records.json',DIST/'downloads/records.json')
    archive_path=DIST/'downloads/indication-atlas-submission.zip'
    with zipfile.ZipFile(archive_path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for path in source_files():
            info=zipfile.ZipInfo('indication-atlas-submission/'+path.relative_to(ROOT).as_posix(),date_time=(2026,10,28,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
            archive.writestr(info,path.read_bytes())
    (DIST/'robots.txt').write_text('User-agent: *\nDisallow: /\n')
    dump(DIST/'data/build.json',dict(dataset_version=stats['dataset_version'],records=stats['records'],
        concepts=stats['concepts'],aliases=stats['aliases'],source_package_sha256=hashlib.sha256(archive_path.read_bytes()).hexdigest()))
    print(json.dumps(dict(status='BUILT',publish_directory='dist',records=stats['records'],
        concepts=stats['concepts'],aliases=stats['aliases'],catalog_bytes=(DIST/'data/catalog.json').stat().st_size,
        source_package_bytes=archive_path.stat().st_size),ensure_ascii=False))


if __name__ == '__main__':build()

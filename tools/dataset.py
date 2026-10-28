"""Validate and query the frozen research judgments; never re-adjudicates input."""
import hashlib
import json
from pathlib import Path
import re
import unicodedata
import zipfile
from collections import Counter
from read_xlsx import read_xlsx

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    return json.loads((ROOT / 'data' / name).read_text(encoding='utf8'))


def normalize(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', text).casefold().replace('’', "'")).strip()


def validate():
    manifest = load('manifest.json')
    for name, digest in manifest['files'].items():
        if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest:
            raise ValueError('Frozen dataset checksum mismatch: ' + name)
    records = load('records.json')
    core = load('dictionary.json')
    sources = load('sources.json')
    raw = read_xlsx(ROOT / 'data/input/indication_keywords_300.xlsx')
    if len(raw) != len(records) or len(records) != manifest['records']:
        raise ValueError('Input row count mismatch')
    originals = {r['source_id']: r for r in raw}
    by_id = {r['source_id']: r for r in records}
    if len(by_id) != len(records) or set(originals) != set(by_id):
        raise ValueError('Input IDs are not unique or preserved')
    for r in records:
        original = originals[r['source_id']]
        for key in ('keyword', 'raw_context'):
            if r[key] != original[key]:
                raise ValueError('Source text changed: ' + r['source_id'])
        if r['input_normalized_condition'] != original['normalized_condition']:
            raise ValueError('Provided normalization changed')
        if not r['rationale_ko'] or not set(r['evidence_refs']).issubset(sources):
            raise ValueError('Missing judgment or evidence')
        for atom in r['clinical_attributes'] + r['concept_name_components']:
            if r[atom['source_field']][atom['start']:atom['end']] != atom['source_span']:
                raise ValueError('Invalid source span')
        if r['selected_standard_id']:
            selected = next(c for c in r['reviewed_candidates'] if c['candidate_key'] == r['selected_standard_id'])
            if selected['relation'] != 'EXACT' or selected.get('active') is False:
                raise ValueError('Selected target is not reviewed exact/active')
    concepts = {c['concept_key']: c for c in core['concepts']}
    if len(concepts) != manifest['concepts'] or len(core['aliases']) != manifest['alias_connections']:
        raise ValueError('Dictionary counts differ')
    for c in concepts.values():
        if any(by_id[sid]['concept_key'] != c['concept_key'] or by_id[sid]['entity_type'] != c['entity_type'] for sid in c['source_ids']):
            raise ValueError('Concept grouping differs from judgments')
    for a in core['aliases']:
        if a['concept_key'] not in concepts or by_id[a['source_id']]['concept_key'] != a['concept_key']:
            raise ValueError('Alias targets the wrong concept')
        if a['normalized_term'] != normalize(a['term']) or not set(a['evidence_refs']).issubset(sources):
            raise ValueError('Alias normalization or evidence differs')
    for pair in load('comparisons.json'):
        left, right = (by_id[pair[k]]['concept_key'] for k in ('left_source_id','right_source_id'))
        if pair['relation'].startswith('SAME_BASE_CONCEPT'):
            if not left or left != right:
                raise ValueError('Same-concept comparison is inconsistent')
        elif left and left == right:
            raise ValueError('Distinct comparison has been merged')
    api = json.loads((ROOT / 'evidence/api-manifest.json').read_text())
    with zipfile.ZipFile(ROOT / 'evidence/official-api-responses.zip') as archive:
        if len(api) != manifest['source_api_snapshots']:
            raise ValueError('Source response count differs')
        for snapshot in api.values():
            if hashlib.sha256(archive.read(snapshot['archive_member'])).hexdigest() != snapshot['sha256']:
                raise ValueError('Official response digest differs')
    return records, core, sources, manifest


def summary(records, core, manifest):
    return {'dataset_version':manifest['dataset_version'], 'as_of':manifest['as_of'],
        'records':len(records), 'concepts':len(core['concepts']), 'aliases':len(core['aliases']),
        'unique_alias_spellings':len({a['normalized_term'] for a in core['aliases']}),
        'holds':sum(r['research_decision'].startswith('HOLD_') for r in records),
        'comparison_pairs':manifest['comparison_pairs'], 'source_api_snapshots':manifest['source_api_snapshots'],
        'decisions':dict(Counter(r['research_decision'] for r in records)),
        'name_component_records':sum(bool(r['concept_name_components']) for r in records),
        'name_component_spans':sum(len(r['concept_name_components']) for r in records)}


def lookup(term, core=None, records=None):
    core = core or load('dictionary.json')
    records = records or load('records.json')
    matches = [a for a in core['aliases'] if a['normalized_term'] == normalize(term)]
    keys = sorted({a['concept_key'] for a in matches})
    related = [link for c in core['concepts'] if c['concept_key'] in keys for link in c.get('related_concepts', []) if link['concept_key'] not in keys]
    return {'term':term, 'concept_keys':keys, 'matches':matches, 'related':related,
        'requires_context':len(keys)>1 or any(a['context_required'] for a in matches),
        'holds':[r['source_id'] for r in records if not r['concept_key'] and r['research_decision'].startswith('HOLD_') and normalize(r['keyword'])==normalize(term)],
        'patient_attributes_inferred':[], 'automatic_source_resolution':False}


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--term')
    args = parser.parse_args()
    records, core, sources, manifest = validate()
    print(json.dumps(lookup(args.term, core, records) if args.term else summary(records, core, manifest),ensure_ascii=False,indent=2))

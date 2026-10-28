"""Check archived supplementary evidence offline, without rerunning experiments."""
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / 'evidence/boundary_checks'


def read(name):
    return json.loads((FOLDER / name).read_text(encoding='utf8'))


def validate_summary(summary, n, precision_field):
    counts = summary['outcomes']
    if summary['n'] != n or sum(counts.values()) != n:
        raise ValueError('Supplementary outcome totals differ')
    correct, wrong = counts['CORRECT'], counts['WRONG']
    if summary[precision_field] != f'{correct}/{correct + wrong}':
        raise ValueError('Supplementary precision denominator differs')
    if summary['false_auto_merge'] != f'{wrong}/{n}':
        raise ValueError('Archived xref mismatch field differs')
    if 'coverage' in summary and summary['coverage'] != round((n - counts['ABSTAIN']) / n, 3):
        raise ValueError('Supplementary coverage differs')


def verify():
    manifest = read('manifest.json')
    for name, digest in manifest['files'].items():
        path = FOLDER / name
        if path.parent != FOLDER or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError('Supplementary evidence hash mismatch: ' + name)
    results = read('results_concept_baselines.json')
    if results['corpus_sha256'] != manifest['corpus']['input_txt_sha256'] or results['obo_sha256'] != manifest['mondo']['sha256']:
        raise ValueError('Benchmark input hashes differ')
    if results['n_docs'] != 100 or results['n_mentions'] != 960:
        raise ValueError('Archived run size differs')
    for method in results['methods'].values():
        validate_summary(method['mention_level'], 960, 'precision_scorable')
        validate_summary(method['doc_level'], 531, 'precision_scorable')
    prototype = read('results_abbrev_resolution.json')['summary']
    validate_summary(prototype, 960, 'precision')
    validate_summary(prototype['doc_level'], 531, 'precision')
    with (FOLDER / 'wrong_case_adjudication.csv').open(encoding='utf-8-sig', newline='') as f:
        adjudication = list(csv.DictReader(f))
    m2_categories = Counter()
    for row in adjudication:
        if row['method'] == 'M2':
            m2_categories[row['category']] += int(row['mentions'])
    if sum(m2_categories.values()) != results['methods']['M2_ontology_exact']['mention_level']['outcomes']['WRONG']:
        raise ValueError('Provisional adjudication totals differ')
    seed = read('eligibility_seed_v1.json')
    items = seed['items']
    body = json.dumps(items, ensure_ascii=False, indent=1, sort_keys=True)
    if hashlib.sha256(body.encode()).hexdigest() != seed['frozen_sha256_of_items']:
        raise ValueError('Clinical-trial seed digest differs')
    unique_trials = len({item['nct'] for item in items})
    if len(items) != 42 or unique_trials != 40:
        raise ValueError('Clinical-trial item and trial units differ')
    raw = read('ctgov_items_raw_20261028.json')
    for item in items:
        if item['label_status'] != 'PROVISIONAL_RESEARCHER_LABEL' or item['annotators'] != ['claude-single']:
            raise ValueError('Clinical-trial annotation provenance differs')
        if not any(row['nct'] == item['nct'] and ' / '.join(row['inclusion_excerpt']) == item['eligibility_excerpt'] for row in raw):
            raise ValueError('Clinical-trial excerpt differs from archived collection')
    excerpt = read('mondo_hierarchy_excerpt.json')
    terms = excerpt['terms']
    if excerpt['source_obo_sha256'] != manifest['mondo']['sha256'] or not any(line.startswith('is_a: MONDO:0004967 ') for line in terms['MONDO:0004948']['parent_lines']):
        raise ValueError('Pinned ontology statement differs')
    return dict(status='VERIFIED_ARCHIVE', baseline_mentions=960, baseline_documents=100,
        deduplicated_units=531, trial_comparison_items=len(items), unique_trials=unique_trials,
        provisional_m2_categories=dict(m2_categories),
        clinical_trial_labels=dict(Counter(i['eligibility_equivalence'] for i in items)),
        note='Output integrity checks; no new benchmark or current-dictionary accuracy evaluation.')


if __name__ == '__main__':
    print(json.dumps(verify(), ensure_ascii=False, indent=2))

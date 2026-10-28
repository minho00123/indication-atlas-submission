"""Re-score archived predictions with the historical rubric, without model calls.

This lexical rubric is deliberately separate from the current dictionary policy.
It does not establish clinical equivalence or current dictionary accuracy.
"""
import hashlib
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / 'data/experiments/legacy'


def read(name):
    return json.loads((ARCHIVE / name).read_text(encoding='utf8'))


def historical_key(value):
    value = re.sub(r'\s*\([^)]*\)', '', value)
    value = unicodedata.normalize('NFKD', value)
    value = ''.join(c for c in value if not unicodedata.combining(c)).lower()
    value = re.sub(r"[’']s\b", '', value)
    value = re.sub(r'[-_‐–—,]', ' ', value)
    return re.sub(r'\s+', '', value)


def judge(gold, prediction):
    if prediction is None:
        return False
    decision = prediction.get('decision', '')
    if gold['decision'] in ('ambiguous', 'not_disease'):
        return decision == gold['decision']
    if gold['decision'] in ('mapped', 'remapped') and decision not in ('mapped', 'remapped'):
        return False
    if gold['decision'] == 'split' and decision != 'split':
        return False
    names = [historical_key(x) for x in prediction.get('conditions') or []]
    groups = [{historical_key(a) for a in group} for group in gold['accept']]
    return (len(names) == len(groups)
            and all(any(n in group for n in names) for group in groups)
            and all(any(n in group for group in groups) for n in names))


def score():
    manifest = read('manifest.json')
    for name, digest in manifest['files'].items():
        if hashlib.sha256((ARCHIVE / name).read_bytes()).hexdigest() != digest:
            raise ValueError('Archived experiment hash mismatch: ' + name)
    items = read('items.json')
    ids = {item['source_id'] for item in items}
    per_run = {c: [] for c in 'ABCD'}
    hits = {c: dict.fromkeys(sorted(ids), 0) for c in 'ABCD'}
    seen = set()
    for run in read('predictions.json'):
        condition = run['condition']
        key = (run['run'], condition)
        if key in seen:
            raise ValueError('Duplicate experiment run')
        seen.add(key)
        predictions = {p['id']: p for p in run['predictions']}
        if set(predictions) != ids or len(run['predictions']) != len(ids):
            raise ValueError('Missing or duplicate experiment predictions')
        results = {g['source_id']: int(judge(g, predictions[g['source_id']])) for g in items}
        per_run[condition].append(sum(results.values()))
        for sid, hit in results.items():
            hits[condition][sid] += hit
    if any(len(v) != manifest['repetitions'] for v in per_run.values()):
        raise ValueError('Incomplete experiment repetitions')
    result = dict(per_run=per_run, hits=hits)
    if result != read('reference-scores.json'):
        raise ValueError('Historical score reproduction failed')
    return result


if __name__ == '__main__':
    result = score()
    print(json.dumps(dict(status='REPRODUCED', rubric='historical, not current dictionary accuracy',
                          per_run=result['per_run']), ensure_ascii=False, indent=2))

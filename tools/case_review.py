"""Validate presentation evidence against frozen judgments; never infer new labels."""
from copy import deepcopy

STATUSES = {'EXPLICIT', 'NOT_STATED', 'NOT_APPLICABLE', 'NOT_VERIFIED'}
CRITERIA = {'added_restriction', 'information_preservation', 'uncertainty'}


def prepare_stories(stories, records, sources):
    rows = {r['source_id']: r for r in records}
    output = deepcopy(stories)
    for story in output:
        ids = set(story['source_ids'])
        if not ids or not ids.issubset(rows):
            raise ValueError('Case references missing row')
        allowed_refs = {ref for sid in ids for ref in rows[sid]['evidence_refs']}

        def refs(item):
            if not item.get('evidence_refs') or not set(item['evidence_refs']).issubset(allowed_refs & sources.keys()):
                raise ValueError('Case evidence reference is not grounded')

        if not story.get('comparison_axes') or not story.get('decision_criteria'):
            raise ValueError('Case is missing structured reasoning')
        for axis in story['comparison_axes']:
            refs(axis)
            if not axis.get('axis') or not axis.get('impact_ko') or not axis.get('source_items'):
                raise ValueError('Case comparison axis is incomplete')
            for item in axis['source_items']:
                if item['source_id'] not in ids or item['status'] not in STATUSES:
                    raise ValueError('Case source or evidence status is invalid')
                row = rows[item['source_id']]
                if item['field'] not in ('keyword', 'raw_context', 'input_normalized_condition'):
                    raise ValueError('Case must cite an original input field')
                quote = item.get('quote', '')
                if quote and quote not in row[item['field']]:
                    raise ValueError('Case source quote differs from input')
                if item['status'] == 'EXPLICIT' and not quote:
                    raise ValueError('Explicit observation requires a source quote')
                if item['status'] != 'EXPLICIT' and not item.get('note'):
                    raise ValueError('Missing information needs an explanation')
            for item in axis['candidate_items']:
                if item['source_id'] not in ids:
                    raise ValueError('Candidate belongs to another case')
                row = rows[item['source_id']]
                candidate = next((c for c in row['reviewed_candidates'] if c['candidate_key'] == item['candidate_key']), None)
                if candidate is None:
                    raise ValueError('Case candidate was not in the frozen review')
                if 'quote' in item:
                    index = item['definition_index']
                    if not 0 <= index < len(candidate['definitions']) or item['quote'] not in candidate['definitions'][index]['text']:
                        raise ValueError('Case definition quote differs from evidence')
                    item['definition_source'] = candidate['definitions'][index]['source']
                item.update(label=candidate['label'], relation=candidate['relation'], source_url=candidate['source_url'])
            if not axis['candidate_items'] and not axis.get('comparison_note'):
                raise ValueError('A comparison without candidates needs a stated basis')
        if {item['kind'] for item in story['decision_criteria']} != CRITERIA or len(story['decision_criteria']) != 3:
            raise ValueError('Decision criteria must distinguish added scope, preservation and uncertainty')
        for item in story['decision_criteria']:
            refs(item)
            if not item.get('text_ko') or not set(item['source_ids']).issubset(ids):
                raise ValueError('Decision criterion has invalid sources')
        story['candidate_reviews'] = [dict(source_id=sid, candidate_key=c['candidate_key'],
            label=c['label'], relation=c['relation'], source_url=c['source_url'],
            selected=c['candidate_key'] == rows[sid]['selected_standard_id'])
            for sid in story['source_ids'] for c in rows[sid]['reviewed_candidates']]
    return output

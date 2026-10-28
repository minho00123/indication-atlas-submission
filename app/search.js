// Query the reviewed dictionary. Substrings are exploration, never exact mappings.
export function normalize(text) {
  return String(text ?? '').normalize('NFKC').toLowerCase().replaceAll('ß','ss')
    .replaceAll('ς','σ').replaceAll('’',"'").replace(/\s+/gu,' ').trim();
}

export function searchCatalog(catalog, query) {
  const q = normalize(query);
  const exactAliases = q ? catalog.aliases.filter(a => a.normalized_term === q) : [];
  const exactKeys = [...new Set(exactAliases.map(a => a.concept_key))];
  const source = catalog.records.find(r => normalize(r.source_id) === q);
  if (source?.concept_key && !exactKeys.includes(source.concept_key)) exactKeys.push(source.concept_key);
  const partialAliases = q ? catalog.aliases.filter(a => a.normalized_term.includes(q) && !exactKeys.includes(a.concept_key)) : [];
  const partialKeys = [...new Set(partialAliases.map(a => a.concept_key))];
  const related = [];
  for (const c of catalog.concepts.filter(c => exactKeys.includes(c.concept_key))) {
    for (const link of c.related_concepts ?? []) {
      if (!exactKeys.includes(link.concept_key) && !related.some(r => r.concept_key === link.concept_key)) related.push(link);
    }
  }
  const holds = catalog.records.filter(r => !r.concept_key && r.research_decision.startsWith('HOLD_') && (normalize(r.keyword) === q || r === source));
  const expressions = source && !source.concept_key && !source.research_decision.startsWith('HOLD_') ? [source] : [];
  return {exactKeys, exactAliases, partialKeys:partialKeys.filter(k => !related.some(r => r.concept_key === k)), related, holds, expressions, source};
}

export function filterRecords(records, {query='', decision='', entity=''} = {}) {
  const q = normalize(query);
  return records.filter(r => (!decision || (decision === 'HOLD' ? r.research_decision.startsWith('HOLD_') : r.research_decision === decision))
    && (!entity || r.entity_type === entity)
    && (!q || [r.source_id,r.keyword,r.standard_name,r.raw_context,r.selected_standard_id ?? ''].some(v => normalize(v).includes(q))));
}

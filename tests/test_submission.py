import hashlib
import json
from pathlib import Path
import sys
import unittest
import zipfile
from copy import deepcopy

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from dataset import validate,lookup,normalize,load
from markdown_render import render
from build import build
from score_legacy import score as score_legacy, judge
from case_review import prepare_stories
from verify_supplement import verify as verify_supplement, validate_summary


class SubmissionDataset(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records,cls.core,cls.sources,cls.manifest=validate()
        cls.rows={r['source_id']:r for r in cls.records}

    def test_source_and_frozen_evidence_are_valid(self):
        self.assertEqual(len(self.records),300)
        self.assertEqual(self.manifest['source_api_snapshots'],676)
        self.assertFalse(self.manifest['independent_expert_approvals'])

    def test_polysemous_abbreviations_do_not_auto_resolve(self):
        for term in ('CD','AML'):
            result=lookup(term,self.core,self.records)
            self.assertEqual(len(result['concept_keys']),2)
            self.assertTrue(result['requires_context'])
            self.assertFalse(result['automatic_source_resolution'])
            self.assertEqual(result['patient_attributes_inferred'],[])
        self.assertEqual(lookup('CD',self.core,self.records)['holds'],['K009'])

    def test_related_renaming_does_not_merge_scope(self):
        for term,own,other in [('NAFLD','K116','K117'),('MASLD','K117','K116')]:
            result=lookup(term,self.core,self.records)
            self.assertEqual(result['concept_keys'],[self.rows[own]['concept_key']])
            self.assertEqual([r['concept_key'] for r in result['related']],[self.rows[other]['concept_key']])
            self.assertTrue(all(not r['use_for_synonym_union'] for r in result['related']))

    def test_cited_aliases_work(self):
        for term,sid in [('T2DM','K004'),('PASC','K260'),('Polycystic ovarian syndrome','K204'),('NTM infection','K262')]:
            self.assertEqual(lookup(term,self.core,self.records)['concept_keys'],[self.rows[sid]['concept_key']])

    def test_hold_and_or_inputs_have_no_synonym_aliases(self):
        aliases={a['source_id'] for a in self.core['aliases']}
        self.assertTrue({'K009','K018','K024'}.isdisjoint(aliases))
        self.assertEqual(self.rows['K018']['expression']['operator'],'OR')
        self.assertIn('plaque psoriasis',self.rows['K024']['raw_context'])

    def test_patient_context_does_not_transfer_to_other_mentions(self):
        self.assertEqual(self.rows['K010']['concept_key'],self.rows['K131']['concept_key'])
        self.assertTrue(self.rows['K010']['clinical_attributes'])
        self.assertEqual(self.rows['K131']['clinical_attributes'],[])
        self.assertFalse(any('clinical_attributes' in a for a in self.core['aliases']))

    def test_name_qualifiers_and_actual_context_are_distinct(self):
        for sid in ('K138','K247','K266','K014','K015'):
            self.assertTrue(self.rows[sid]['concept_name_components'])
            self.assertEqual(self.rows[sid]['clinical_attributes'],[])
        self.assertEqual([a['source_span'] for a in self.rows['K011']['clinical_attributes']],['Relapsed'])
        self.assertTrue(any(a['type']=='duration' for a in self.rows['K017']['clinical_attributes']))
        self.assertEqual(self.rows['K004']['clinical_attributes'],[])

    def test_marker_signs_remain_distinct(self):
        self.assertNotEqual(normalize('HER2+'),normalize('HER2-'))
        self.assertNotEqual(self.rows['K014']['concept_key'],self.rows['K015']['concept_key'])

    def test_source_conflict_is_not_hidden_by_new_candidate(self):
        row=self.rows['K262']
        self.assertTrue(row['concept_key'].startswith('LOCAL:'))
        mesh=next(c for c in row['reviewed_candidates'] if c['candidate_key']=='MeSH:M0014288')
        self.assertEqual(mesh['relation'],'UNKNOWN')
        self.assertTrue(row['definition_warnings'])

    def test_excerpt_sources_are_locally_checkable(self):
        entries=[s for s in self.sources.values() if 'excerpt_snapshot' in s]
        self.assertGreaterEqual(len(entries),3)
        for s in entries:
            ref=s['excerpt_snapshot']
            self.assertEqual(hashlib.sha256((ROOT/ref['path']).read_bytes()).hexdigest(),ref['sha256'])


class SubmissionBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):build()

    def test_site_matches_snapshot_and_all_records_have_detail(self):
        catalog=json.loads((ROOT/'dist/data/catalog.json').read_text())
        self.assertEqual(catalog['metadata']['records'],len(catalog['records']))
        self.assertEqual(catalog['metadata']['aliases'],len(catalog['aliases']))
        for r in catalog['records']:
            detail=json.loads((ROOT/'dist/data/records'/f"{r['source_id']}.json").read_text())
            self.assertEqual(detail['concept_key'],r['concept_key'])
            self.assertEqual(detail['rationale_ko'],r['rationale_ko'])

    def test_download_package_contains_only_portable_submission_sources(self):
        with zipfile.ZipFile(ROOT/'dist/downloads/indication-atlas-submission.zip') as archive:
            names=archive.namelist()
            self.assertTrue(any(n.endswith('/README.md') for n in names))
            self.assertTrue(any(n.endswith('/netlify.toml') for n in names))
            self.assertFalse(any('/dist/' in n or '/.git/' in n or '__pycache__' in n or 'collaboration/' in n for n in names))
            self.assertEqual(archive.read('indication-atlas-submission/data/records.json'),(ROOT/'data/records.json').read_bytes())

    def test_markdown_is_built_without_executing_raw_html(self):
        output=render('# Test\n\n<script>alert(1)</script>\n\n[bad](javascript:alert)\n\n```\n<strong>code</strong>\n```')
        self.assertNotIn('<script>',output)
        self.assertNotIn('href="javascript:',output)
        self.assertIn('&lt;strong&gt;code&lt;/strong&gt;',output)
        for name in ('guidelines','research','methodology','run','audit-method'):
            self.assertTrue((ROOT/'dist/content'/f'{name}.html').is_file())

    def test_retired_pages_are_removed_and_review_execution_evidence_remains(self):
        for name in ['review','analyzer','boundaries']:
            (ROOT/'dist/content'/f'{name}.html').write_text('obsolete page')
        build()
        for name in ['review','analyzer','boundaries']:
            self.assertFalse((ROOT/'dist/content'/f'{name}.html').exists())
        for name in ['runtime_before.json','runtime_after.json','reverify_before.json','reverify_after.json','ablation_discovery.json']:
            self.assertEqual((ROOT/'dist/evidence/review_process'/name).read_bytes(),(ROOT/'evidence/review_process'/name).read_bytes())

    def test_runtime_module_and_development_inputs_are_published_in_source_package(self):
        cases=load('analyzer_cases.json')
        self.assertEqual(json.loads((ROOT/'dist/data/analyzer-cases.json').read_text()),cases)
        with zipfile.ZipFile(ROOT/'dist/downloads/indication-atlas-submission.zip') as archive:
            for name in ('app/analyzer.mjs','app/analyzer-checks.mjs','data/analyzer_cases.json','tests/test_analyzer.mjs'):
                self.assertEqual(archive.read('indication-atlas-submission/'+name),(ROOT/name).read_bytes())

    def test_supplements_are_published_and_packaged_without_full_corpus(self):
        manifest=json.loads((ROOT/'evidence/boundary_checks/manifest.json').read_text())
        for name,digest in manifest['files'].items():
            self.assertEqual(hashlib.sha256((ROOT/'dist/evidence/boundary_checks'/name).read_bytes()).hexdigest(),digest)
        with zipfile.ZipFile(ROOT/'dist/downloads/indication-atlas-submission.zip') as archive:
            self.assertFalse(any(n.endswith(('.obo','NCBItestset_corpus.txt')) for n in archive.namelist()))
            self.assertEqual(archive.read('indication-atlas-submission/evidence/boundary_checks/manifest.json'),(ROOT/'evidence/boundary_checks/manifest.json').read_bytes())


class StructuredCaseEvidence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records,cls.core,cls.sources,cls.manifest=validate()
        cls.stories=load('stories.json')

    def test_all_cases_keep_relations_separate_from_final_decisions(self):
        stories=prepare_stories(self.stories,self.records,self.sources)
        self.assertEqual(len(stories),10)
        eczema=next(s for s in stories if s['id']=='eczema')
        selected=[c for c in eczema['candidate_reviews'] if c['source_id']=='K001' and c['selected']]
        self.assertEqual([c['candidate_key'] for c in selected],['NCIT:C3001'])
        mondo=next(c for c in eczema['candidate_reviews'] if c['source_id']=='K001' and c['candidate_key']=='MONDO:0004980')
        self.assertEqual(mondo['relation'],'BROADER')
        self.assertFalse(mondo['selected'])
        conflict=next(s for s in stories if s['id']=='conflict')
        self.assertEqual(conflict['candidate_reviews'],[])
        self.assertFalse(any('candidate_reviews' in s for s in self.stories))

    def test_invented_source_quote_is_rejected(self):
        stories=deepcopy(self.stories)
        stories[0]['comparison_axes'][0]['source_items'][0]['quote']='a condition that is not in the source'
        with self.assertRaisesRegex(ValueError,'source quote'):prepare_stories(stories,self.records,self.sources)

    def test_unreviewed_candidate_and_unverified_definition_are_rejected(self):
        stories=deepcopy(self.stories)
        stories[0]['comparison_axes'][0]['candidate_items'][0]['candidate_key']='NCIT:UNKNOWN'
        with self.assertRaisesRegex(ValueError,'candidate was not'):prepare_stories(stories,self.records,self.sources)
        stories=deepcopy(self.stories)
        ref=stories[0]['comparison_axes'][0]['candidate_items'][0]
        ref.update(definition_index=0,quote='invented definition')
        with self.assertRaisesRegex(ValueError,'definition quote'):prepare_stories(stories,self.records,self.sources)

    def test_unrelated_evidence_and_unexplained_missingness_are_rejected(self):
        stories=deepcopy(self.stories)
        stories[0]['comparison_axes'][0]['evidence_refs']=['NOT_A_SOURCE']
        with self.assertRaisesRegex(ValueError,'not grounded'):prepare_stories(stories,self.records,self.sources)
        stories=deepcopy(self.stories)
        item=stories[0]['comparison_axes'][1]['source_items'][0]
        item['note']=''
        with self.assertRaisesRegex(ValueError,'needs an explanation'):prepare_stories(stories,self.records,self.sources)


class SupplementaryEvidence(unittest.TestCase):
    def test_archive_counts_and_clinical_trial_provenance(self):
        result=verify_supplement()
        self.assertEqual((result['baseline_documents'],result['deduplicated_units']),(100,531))
        self.assertEqual((result['trial_comparison_items'],result['unique_trials']),(42,40))
        self.assertEqual(result['provisional_m2_categories']['CROSSWALK_ARTIFACT'],28)

    def test_scoreable_precision_is_not_all_input_accuracy(self):
        summary=json.loads((ROOT/'evidence/boundary_checks/results_concept_baselines.json').read_text())['methods']['M2_ontology_exact']['mention_level']
        validate_summary(summary,960,'precision_scorable')
        wrong=deepcopy(summary);wrong['precision_scorable']='280/960'
        with self.assertRaisesRegex(ValueError,'denominator'):validate_summary(wrong,960,'precision_scorable')


class ArchivedExperiment(unittest.TestCase):
    def test_predictions_reproduce_archived_scores_and_abbreviation_observations(self):
        result=score_legacy()
        self.assertEqual(result['per_run']['A'],[12,12,12])
        self.assertEqual(result['per_run']['B'],[22,22,22])
        manifest=load('experiments/legacy/manifest.json')
        runs=load('experiments/legacy/predictions.json')
        for sid in manifest['post_hoc_context_subset']:
            keyword_only=[p for run in runs if run['condition']=='A' for p in run['predictions'] if p['id']==sid]
            self.assertEqual(len(keyword_only),3)
            self.assertTrue(all(p['decision']=='ambiguous' and p['conditions']==[] for p in keyword_only))
            self.assertEqual(result['hits']['A'][sid],0)
            self.assertEqual(result['hits']['B'][sid],3)

    def test_legacy_judge_checks_decision_and_each_split_operand(self):
        gold={'decision':'split','accept':[['MDS','Myelodysplastic syndrome'],['AML']]}
        self.assertTrue(judge(gold,{'decision':'split','conditions':['AML','MDS']}))
        self.assertFalse(judge(gold,{'decision':'split','conditions':['AML','AML']}))
        self.assertFalse(judge(gold,{'decision':'mapped','conditions':['AML','MDS']}))
        self.assertFalse(judge({'decision':'ambiguous'}, {'decision':'mapped','conditions':['Diabetes']}))



class RuntimeAuditArtifacts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):build()

    def test_audit_provenance_coverage_and_recalculated_aggregates(self):
        from verify_rule_audit import verify
        summary=verify()
        self.assertEqual(summary['rows'],300)
        self.assertEqual(summary['aliases'],419)

    def test_all_audit_downloads_include_all_input_rows(self):
        for mode in ['A','B','C']:
            result=json.loads((ROOT/'dist/downloads'/f'rule-audit-{mode}.json').read_text())
            self.assertEqual(len(result['rows']),300)
            self.assertEqual(len({r['source_id'] for r in result['rows']}),300)
        support=json.loads((ROOT/'dist/data/rule-support.json').read_text())
        self.assertEqual([r['rule'] for r in support['rules']],[f'G{i:02d}' for i in range(1,13)])

if __name__=='__main__':unittest.main()

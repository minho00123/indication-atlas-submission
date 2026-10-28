import hashlib
import json
from pathlib import Path
import sys
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from dataset import validate,lookup,normalize,load
from markdown_render import render
from build import build
from score_legacy import score as score_legacy, judge


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
        for name in ('guidelines','research','methodology','run'):
            self.assertTrue((ROOT/'dist/content'/f'{name}.html').is_file())


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


if __name__=='__main__':unittest.main()

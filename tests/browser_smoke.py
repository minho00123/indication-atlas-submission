"""Optional browser QA. Requires Playwright; not needed to build or serve."""
import argparse
import json
from pathlib import Path
import re
import tempfile
import zipfile
from playwright.sync_api import sync_playwright,expect


def run(base_url,browser_executable=None,output=None):
    results=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,**({'executable_path':browser_executable} if browser_executable else {}))
        page=browser.new_page(viewport={'width':1440,'height':1050})
        errors=[];console_errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console_errors.append(m.text) if m.type=='error' else None)
        page.goto(base_url,wait_until='networkidle')
        expect(page.get_by_role('heading',name='등록된 표현 검색')).to_be_visible()
        results.append('Desktop entry and snapshot counts')
        expect(page.locator('#hero-title')).to_have_text('질환 동의어 사전')
        assert page.locator('.stats .stat-value').evaluate_all('(els)=>els.map(e=>e.textContent.replace(/[^0-9]/g,""))')==['300','287','419','2']
        assert page.locator('#dictionary-search').bounding_box()['y']+page.locator('#dictionary-search').bounding_box()['height']<1000
        expect(page.locator('.search-heading-row')).not_to_contain_text('질환군')
        expect(page.locator('.catalog-scope')).not_to_have_attribute('open','')
        page.locator('.catalog-scope summary').click()
        expect(page.locator('.catalog-scope p')).to_be_visible()
        expect(page.locator('.catalog-scope p')).to_contain_text('질환군·소견·상태')
        page.locator('.catalog-scope summary').click()
        expect(page.locator('.direct-input-note').get_by_role('link',name='직접 입력해 보기 ↗')).to_have_attribute('href','#analyze')
        expect(page.locator('.key-point')).to_have_count(0)
        expect(page.locator('.featured-section')).to_have_count(0)
        assert page.locator('.example-chip').all_text_contents()==['CD','NSCLC','eczema','NAFLD']
        # First screen: the CD case shows each context, the decision and its reason, with the held row.
        expect(page.locator('#dictionary-detail')).to_contain_text('대표 사례 표시 중')
        expect(page.locator('#dictionary-detail .ambiguity-title')).to_contain_text('CD')
        expect(page.locator('#dictionary-detail .ambiguity-row')).to_have_count(3)
        expect(page.locator('#dictionary-detail .ambiguity-row.held')).to_contain_text('K009')
        expect(page.locator('#dictionary-detail .ambiguity-row.held')).to_contain_text('문맥 부족')
        assert page.locator('#dictionary-detail .ambiguity-row').nth(2).bounding_box()['y']+page.locator('#dictionary-detail .ambiguity-row').nth(2).bounding_box()['height']<1050
        page.locator('#dictionary-detail .ambiguity-row').first.get_by_role('button',name='전체 근거 ↗').click()
        expect(page.locator('#dictionary-detail h2')).to_have_text('Crohn disease')
        expect(page.locator('#dictionary-detail .rationale-strong')).to_contain_text('회결장')
        page.goto(base_url,wait_until='networkidle')  # fresh focus for the keyboard check below
        # Second representative tab: two expressions merged into one concept, conditions kept per input.
        page.get_by_role('tab',name='묶은 사례: NSCLC').click()
        expect(page.get_by_role('tab',name='묶은 사례: NSCLC')).to_have_attribute('aria-selected','true')
        expect(page.locator('#dictionary-detail .ambiguity-row')).to_have_count(2)
        expect(page.locator('#dictionary-detail .ambiguity-row').nth(0)).to_contain_text('K010')
        expect(page.locator('#dictionary-detail .ambiguity-row').nth(0)).to_contain_text('Metastatic')
        expect(page.locator('#dictionary-detail .ambiguity-row').nth(1)).to_contain_text('원문에 명시되지 않음')
        expect(page.locator('#dictionary-detail')).to_contain_text('MONDO:0005233')
        expect(page.locator('#dictionary-detail .featured-links a')).to_have_count(4)
        page.get_by_role('tab',name='나눈 사례: CD').click()
        expect(page.locator('#dictionary-detail .ambiguity-row')).to_have_count(3)
        page.goto(base_url,wait_until='networkidle')
        counts=page.locator('#results .result-meta').all_text_contents()
        assert all('제공 항목 2건' in text or '제공 항목 6건' in text for text in counts[:6])
        assert all('제공 항목 1건' in text for text in counts[6:])
        results.append('Result headline, split/merge representative tabs, case links and all six multi-source groups first')
        page.keyboard.press('Tab')
        expect(page.locator('.skip-link')).to_be_focused()
        page.keyboard.press('Enter')
        expect(page.locator('#main-content')).to_be_focused()
        results.append('Keyboard skip navigation stays on the intended route')
        page.locator('.stat[href="#records"]').click()
        expect(page.locator('#record-count')).to_have_text('300 / 300건')
        page.get_by_role('link',name='동의어 사전',exact=True).click()
        page.locator('.stat[href="#records?decision=HOLD"]').click()
        expect(page.locator('#record-count')).to_have_text('2 / 300건')
        expect(page.locator('#record-table tbody tr')).to_have_count(2)
        page.get_by_role('button',name='K009 판단 상세 보기').click()
        expect(page.locator('.detail')).to_contain_text('문맥 부족')
        page.get_by_role('button',name='← 분류 결과 목록').click()
        expect(page.locator('#record-count')).to_have_text('2 / 300건')
        page.get_by_role('link',name='동의어 사전',exact=True).click()
        page.locator('[data-concept-list]').click()
        expect(page.locator('#search-heading')).to_be_focused()
        assert 80 <= page.locator('#search-heading').bounding_box()['y'] <= 180
        page.locator('[data-concept-list]').click()
        expect(page.locator('#search-heading')).to_be_focused()
        page.locator('.stat[href="#aliases"]').click()
        expect(page.locator('#alias-count')).to_have_text('419 / 419건')
        expect(page.locator('#alias-table tbody tr')).to_have_count(25)
        first_row=page.locator('#alias-table tbody tr').first.inner_text()
        page.get_by_role('button',name='다음 별칭 목록').click()
        assert page.locator('#alias-table tbody tr').first.inner_text()!=first_row
        page.locator('#alias-search').fill('T2DM')
        expect(page.locator('#alias-count')).to_have_text('1 / 419건')
        page.locator('#alias-table a[href^="#dictionary"]').click()
        expect(page.locator('#dictionary-detail')).to_contain_text('type 2 diabetes mellitus')
        page.go_back(wait_until='networkidle')
        expect(page.locator('#alias-search')).to_have_value('T2DM')
        page.locator('#alias-table a[href^="#records"]').click()
        expect(page.locator('.detail')).to_contain_text('T2DM')
        page.get_by_role('link',name='동의어 사전',exact=True).click()
        results.append('All summary links, two held rows, alias pagination/search and cited detail navigation')
        if output:page.screenshot(path=str(output/'desktop.png'),full_page=True)
        page.locator('#dictionary-search').fill('CD')
        expect(page.locator('#results')).to_contain_text('문맥 확인이 필요합니다')
        expect(page.locator('#results')).to_contain_text('K009')
        expect(page.locator('#dictionary-detail')).to_contain_text('하나의 질환으로 확정하지 않았습니다')
        page.locator('#results [data-concept="MONDO:0005011"]').click()
        expect(page.locator('#dictionary-detail')).to_contain_text('Crohn disease')
        expect(page.locator('#dictionary-detail')).to_contain_text('ileocolonic inflammation')
        page.locator('#dictionary-search').fill('eczema')  # one concept plus a held row with the same keyword
        expect(page.locator('#dictionary-detail .ambiguity-row')).to_have_count(3)
        expect(page.locator('#dictionary-detail .ambiguity-row.held')).to_contain_text('K024')
        expect(page.locator('#dictionary-detail .ambiguity-row.held')).to_contain_text('입력 충돌')
        expect(page.locator('#dictionary-detail .ambiguity-title')).to_contain_text('같은 표기, 항목별 처리')
        expect(page.locator('#dictionary-detail')).not_to_contain_text('하나의 질환으로 확정하지 않았습니다')
        page.locator('#results [data-concept="NCIT:C3001"]').click()
        expect(page.locator('#dictionary-detail h2')).to_have_text('Eczema, unspecified')
        page.locator('#dictionary-search').fill('K024')
        expect(page.locator('#dictionary-detail')).to_contain_text('키워드와 문맥이 충돌해 보류했습니다')
        expect(page.locator('#dictionary-detail')).not_to_contain_text('추가 문맥이 없어')
        results.append('CD disambiguation, hold and cited row selection')
        page.locator('#dictionary-search').fill('K001')
        expect(page.locator('#candidates-K001 summary')).to_have_count(4)
        summaries=page.locator('#candidates-K001 summary').all_text_contents()
        assert any('NCIt' in text and 'C3001' in text for text in summaries),summaries
        assert any('MeSH' in text for text in summaries),summaries
        # Representative choice is marked separately from scope; a non-representative EXACT stays "같은 개념".
        assert sum('대표 ID' in text for text in summaries)==1,summaries
        assert any('MeSH' in text and '같은 개념' in text and '대표 ID' not in text for text in summaries),summaries
        reason_y=page.locator('#dictionary-detail .rationale-strong').bounding_box()['y']
        assert reason_y<page.locator('#candidates-K001').bounding_box()['y']<page.locator('#dictionary-detail .alias-list').bounding_box()['y']
        expect(page.locator('.header-download')).to_contain_text('실행 방법·자료')
        results.append('Candidate provenance visible before expanding definitions')
        page.locator('#dictionary-search').fill('NAFLD')
        expect(page.locator('#results')).to_contain_text('관련 결과 · 동의어 병합 아님')
        expect(page.locator('#dictionary-detail')).to_contain_text('K116')
        results.append('NAFLD/MASLD related results separated')
        page.locator('#dictionary-search').fill('PASC')
        expect(page.locator('#dictionary-detail')).to_contain_text('Long COVID')
        expect(page.locator('#dictionary-detail')).to_contain_text('기간')
        results.append('PASC alias and definition warning')
        page.get_by_role('link',name='분류 결과',exact=True).click()
        page.locator('#decision-filter').select_option('HOLD')
        expect(page.locator('#record-count')).to_have_text('2 / 300건')
        page.get_by_role('button',name='K024 판단 상세 보기').click()
        expect(page.locator('.detail')).to_contain_text('plaque psoriasis')
        expect(page.locator('.detail')).to_contain_text('입력 충돌')
        page.get_by_role('button',name='← 분류 결과 목록').click()
        expect(page.locator('#decision-filter')).to_have_value('HOLD')
        results.append('300-row filters, K024 detail and retained filter')
        page.goto(base_url+'#records?record=K018',wait_until='networkidle')
        expect(page.locator('.detail')).to_contain_text('OR 조건으로 보존')
        page.reload(wait_until='networkidle')
        expect(page.locator('.detail')).to_contain_text('MDS/AML')
        results.append('OR expression, deep link and reload')
        page.goto(base_url+'#cases/nsclc',wait_until='networkidle')
        expect(page.locator('.case-story')).to_contain_text('K010')
        expect(page.locator('.case-story')).to_contain_text('K131')
        page.goto(base_url+'#materials/research',wait_until='networkidle')
        expect(page.locator('#document-content')).to_contain_text('Cortellis')
        expect(page.locator('#document-content')).to_contain_text('Embase')
        page.goto(base_url+'#materials/guidelines',wait_until='networkidle')
        expect(page.locator('#document-content')).to_contain_text('G12')
        results.append('Case studies and rendered research/guidelines')
        page.goto(base_url,wait_until='networkidle')
        expect(page.locator('#dictionary-detail')).to_contain_text('대표 사례 표시 중')
        page.goto(base_url+'#materials/methodology?section=counterexamples',wait_until='networkidle')
        expect(page.locator('#document-content .doc-summary')).to_contain_text('후속 연구')
        expect(page.locator('#method-counterexamples')).to_be_focused()
        expect(page.locator('#document-content>h2')).to_have_count(7)
        expect(page.locator('.external-supplement')).to_have_count(2)
        for supplement in page.locator('.external-supplement').all():
            assert not supplement.evaluate('(el)=>el.open')
        page.locator('.external-supplement>summary').nth(0).click()
        expect(page.locator('.external-supplement').nth(0)).to_contain_text('280/348')
        expect(page.locator('.external-supplement').nth(0)).to_contain_text('미채점')
        page.locator('.external-supplement>summary').nth(1).click()
        expect(page.locator('.external-supplement').nth(1)).to_contain_text('40개 임상시험')
        expect(page.locator('.external-supplement').nth(1)).to_contain_text('단일 AI')
        response=page.request.get(base_url+'evidence/boundary_checks/manifest.json')
        assert response.ok and response.json()['clinical_trials']['unique_trials']==40
        results.append('Compact key points, labeled English example, folded evidence, seven-stage report and separate exploratory appendices')
        for case in ['cd','eczema','nsclc','masld','conflict','or','her2','gca','sense','long-covid']:
            page.goto(base_url+'#cases/'+case,wait_until='networkidle')
            expect(page.locator('.comparison-table')).to_be_visible()
            expect(page.locator('.criteria-table tbody tr')).to_have_count(3)
            expect(page.get_by_role('heading',name='최종 처리와 원문 근거')).to_be_visible()
        page.goto(base_url+'#cases/her2',wait_until='networkidle')
        page.locator('.comparison-table a[href*="candidate=NCIT%3AC53556"]').click()
        target=page.locator('details[data-candidate-key="NCIT:C53556"]')
        expect(target).to_have_attribute('open','')
        expect(target).to_contain_text('lack of expression of estrogen receptor')
        page.reload(wait_until='networkidle')
        expect(page.locator('details[data-candidate-key="NCIT:C53556"]')).to_have_attribute('open','')
        results.append('All ten structured cases and linked original candidate definition')
        page.goto(base_url+'#materials/methodology',wait_until='networkidle')
        expect(page.locator('#document-content>h2')).to_have_count(7)
        expect(page.locator('.legacy-experiment:not(.external-supplement)')).not_to_have_attribute('open','')
        expect(page.locator('.legacy-experiment:not(.external-supplement)')).to_contain_text('94.4%')
        main_text=page.locator('#document-content').evaluate('(el)=>{const copy=el.cloneNode(true);copy.querySelector(".legacy-experiment").remove();return copy.textContent}')
        assert '94%' not in main_text and '94.4%' not in main_text
        page.locator('.legacy-experiment:not(.external-supplement)>summary').click()
        expect(page.locator('.legacy-experiment:not(.external-supplement) .legacy-content')).to_be_visible()
        results.append('Seven-stage method and clearly separated historical experiment')
        page.goto(base_url+'#materials/downloads',wait_until='networkidle')
        expect(page.locator('#document-content')).to_contain_text('Netlify')
        with page.expect_download() as download:
            page.locator('a[href="./downloads/indication-atlas-submission.zip"]').click()
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)/'submission.zip';download.value.save_as(dest)
            with zipfile.ZipFile(dest) as archive:assert any(n.endswith('/tools/build.py') for n in archive.namelist())
        results.append('Working source ZIP download and run instructions')
        normalization_errors=page.evaluate('''async () => {
          const {normalize}=await import('./search.js');
          const catalog=await (await fetch('./data/catalog.json')).json();
          return catalog.aliases.filter(a=>normalize(a.term)!==a.normalized_term).map(a=>a.term);
        }''')
        assert not normalization_errors,normalization_errors
        results.append('Browser normalization equals all reviewed alias keys')
        page.goto(base_url,wait_until='networkidle')
        page.get_by_role('link',name='직접 입력해 보기 ↗',exact=True).click()
        expect(page.locator('#analyzer-decision')).to_have_text('약어 의미 보류')
        page.get_by_role('button',name='크론병으로 정의',exact=True).click()
        expect(page.locator('.runtime-concepts')).to_contain_text('MONDO:0005011')
        page.get_by_role('button',name='셀리악병으로 변경',exact=True).click()
        expect(page.locator('.runtime-concepts')).to_contain_text('MONDO:0005130')
        page.locator('#analyzer-text').fill('Patients with CD and gluten-triggered enteropathy.')
        page.get_by_role('button',name='이 원문 분석하기').click()
        expect(page.locator('#analyzer-decision')).to_have_text('약어 의미 보류')
        page.locator('#analyzer-keyword').fill('T2D')
        page.locator('#analyzer-text').fill('A new paragraph: Type 2 diabetes (T2D) is mentioned for 12 months.')
        page.get_by_role('button',name='이 원문 분석하기').click()
        expect(page.locator('.runtime-concepts')).to_contain_text('MONDO:0005148')
        with page.expect_download() as download:
            page.get_by_role('button',name='분석 JSON 내려받기 ↓').click()
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)/'analysis.json';download.value.save_as(dest);report=json.loads(dest.read_text())
            assert report['input']['keyword']=='T2D'
            assert report['attributes'][0]['quantity']['amount']==12
            for span in report['mentions']+report['attributes']:
                assert report['input']['text'][span['start']:span['end']]==span['text']
        page.locator('#analyzer-text').fill('Patients with T2D.')
        page.get_by_role('button',name='이 원문 분석하기').click()
        expect(page.locator('#analyzer-decision')).to_have_text('미등록 표현 · 검토 필요')
        results.append('Editable runtime inputs, CD meaning changes, no definition leakage and analysis JSON download')
        page.get_by_role('button',name='질환명과 재발·치료',exact=True).click()
        expect(page.locator('.runtime-conditions section').nth(0)).to_contain_text('acute')
        expect(page.locator('.runtime-conditions section').nth(1)).to_contain_text('relapsed')
        expect(page.locator('.runtime-conditions section').nth(1)).to_contain_text('prior_therapy')
        page.get_by_role('button',name='키워드·원문 충돌',exact=True).click()
        expect(page.locator('#analyzer-decision')).to_have_text('개념 차이 · 관계 미검토')
        page.get_by_role('button',name='부정 표현',exact=True).click()
        expect(page.locator('.runtime-concepts')).to_contain_text('MONDO:0005233')
        expect(page.locator('.runtime-mentions')).to_contain_text('직접 부정 표지')
        page.locator('#analyzer-text').fill('<img src=x onerror="window.__injected=true"> No NSCLC is reported.')
        page.get_by_role('button',name='이 원문 분석하기').click()
        assert page.evaluate('window.__injected') is None
        expect(page.locator('.runtime-source img')).to_have_count(0)
        page.get_by_role('button',name='검사 실행',exact=True).click()
        fixtures=page.request.get(base_url+'data/analyzer-cases.json').json()
        total=len(fixtures['cases'])
        expect(page.locator('.runtime-check-count')).to_have_text(f'개발·반례 검사 {total}건 중 {total}건 통과')
        size_checks=page.evaluate('''async()=>{
          const {createAnalyzer}=await import('./analyzer.mjs');
          const a=createAnalyzer(await(await fetch('./data/catalog.json')).json());
          return [{keyword:'',text:'NSCLC'},{keyword:'NSCLC',text:'x'.repeat(10001)}].every(input=>{try{a.analyze(input);return false;}catch{return true;}});
        }''')
        assert size_checks
        results.append('Runtime conditions/name components, conflicts, negation, escaped input and all development cases executed')
        page.locator('#analyzer-keyword').fill('Asthma')
        page.locator('#analyzer-text').fill('Patients with severe asthma.')
        page.get_by_role('button',name='이 원문 분석하기').click()
        expect(page.locator('#analyzer-decision')).to_have_text('기존 개념에 연결')
        expect(page.locator('.runtime-conditions')).to_contain_text('severe')
        expect(page.locator('.runtime-axes')).to_contain_text('부정·추정 표지 없음')
        page.locator('#analyzer-text').fill('Patients with enigmatic asthma.')
        page.get_by_role('button',name='이 원문 분석하기').click()
        expect(page.locator('#analyzer-decision')).to_have_text('수식된 이름 · 범위 검토 필요')
        expect(page.locator('.runtime-reasons')).to_contain_text('이름 구간은 원문에 있으나')
        page.locator('#analyzer-keyword').fill('Psoriasis')
        page.locator('#analyzer-text').fill('Patients who do not have psoriasis.')
        page.get_by_role('button',name='이 원문 분석하기').click()
        expect(page.locator('.runtime-axes')).to_contain_text('직접 부정 표지')
        page.locator('#analyzer-keyword').fill('Colon cancer')
        page.locator('#analyzer-text').fill('Family history of colon cancer.')
        page.get_by_role('button',name='이 원문 분석하기').click()
        expect(page.locator('.runtime-axes')).to_contain_text('원문 주장 범위 미상')
        expect(page.locator('#analyzer-result')).to_contain_text('가족력: 환자 본인의 질환 상태로 해석하지 않습니다')
        results.append('Reverification: default modifier review, reviewed context conditions, honest no-cue label and unsupported family history')
        external=[]
        page.on('request',lambda r:external.append(r.url) if not r.url.startswith(base_url.rstrip('/')) and not r.url.startswith(('data:','blob:')) else None)
        page.get_by_role('button',name='예시 넣기').click()
        page.get_by_role('button',name='여러 줄 분석하기').click()
        rows=page.locator('.batch-table tbody tr')
        expect(rows).to_have_count(8)
        expect(rows.nth(0)).to_contain_text('기존 사전의 이름 연결 · 원문 없음')
        expect(rows.nth(1)).to_contain_text('약어 의미 보류')
        expect(rows.nth(2)).to_contain_text('기존 개념에 연결')
        expect(rows.nth(4)).to_contain_text('수식된 이름')
        expect(rows.nth(5)).to_contain_text('원문 주장: 직접 부정 표지')
        expect(rows.nth(6)).to_contain_text('미등록 표현')
        expect(rows.nth(7)).to_contain_text('입력 오류')
        expect(page.locator('.batch-summary')).to_contain_text('8줄 처리')
        rows.nth(6).locator('summary').click()
        links=rows.nth(6).locator('a[target="_blank"]')
        expect(links).to_have_count(3)
        for i in range(3):
            href=links.nth(i).get_attribute('href');assert 'Fabry%20disease' in href and 'Adults' not in href
            assert links.nth(i).get_attribute('rel')=='noopener noreferrer'
        expect(page.locator('#batch-result .snapshot-note')).to_contain_text('prototype-4')
        with page.expect_download() as download:
            page.get_by_role('button',name='여러 줄 결과 CSV ↓').click()
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)/'batch.csv';download.value.save_as(dest);csv_text=dest.read_bytes().decode('utf-8-sig')
            assert csv_text.startswith('line,keyword,has_text,status') and csv_text.count('\r\n')==9
        with page.expect_download() as download:
            page.get_by_role('button',name='여러 줄 결과 JSON ↓').click()
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)/'batch.json';download.value.save_as(dest);batch=json.loads(dest.read_text())
            assert len(batch['rows'])==8 and batch['snapshot']['engine_sha256'] and batch['format']=='batch-1'
        assert not external,external
        results.append('Multi-line intake: per-row results, next steps, unverified search links, snapshot, CSV/JSON and no automatic external requests')
        saved=json.loads((Path(__file__).parent/'fixtures/candidates/Fabry_disease.json').read_text())
        replies={r['url']:r for r in [*[v for v in saved['responses'].values() if isinstance(v,dict) and 'url' in v],*saved['responses']['mondo_terms'].values(),*saved['responses'].get('ncit_terms',{}).values(),*saved['responses']['mesh_details'].values()]}
        sent=[];outage={'on':True}
        def reply(route):
            sent.append(route.request.url);r=replies.get(route.request.url)
            if outage['on'] or (outage.get('info') and re.search(r'/ontologies/(mondo|ncit)$',route.request.url)):route.fulfill(status=503,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body='{}');return
            route.fulfill(status=200 if r and r['ok'] else 404,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(r['data'] if r and r['ok'] else {}))
        page.route('https://www.ebi.ac.uk/**',reply);page.route('https://id.nlm.nih.gov/**',reply)
        page.get_by_role('button',name='미등록 1줄 모두 MONDO·NCIt·MeSH 후보 비교').click()
        cell=page.locator('.batch-table tbody tr').nth(6).locator('[data-candidate-cell]')
        expect(cell).to_contain_text('조회 실패 · 다시 조회 필요')
        failed_requests=len(sent);outage['on']=False
        cell.get_by_role('button',name='다시 조회').click()
        expect(cell).to_contain_text('이름·교차참조 연결 확인 · 범위 미검토')
        assert len(sent)>failed_requests
        console_errors[:]=[e for e in console_errors if 'status of 503' not in e]  # the simulated outage above
        expect(cell).to_contain_text('MONDO:0010526 · NCIT:C84701 · MESH:D000795')
        expect(page.locator('.batch-table tbody tr').nth(0).locator('[data-candidate-cell]')).to_have_text('—')
        with page.expect_download() as download:
            page.get_by_role('button',name='여러 줄 결과 CSV ↓').click()
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)/'batch2.csv';download.value.save_as(dest);assert 'CROSS_SOURCE_AGREEMENT' in dest.read_bytes().decode('utf-8-sig')
        with page.expect_download() as download:
            page.get_by_role('button',name='여러 줄 결과 JSON ↓').click()
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)/'batch2.json';download.value.save_as(dest);row=json.loads(dest.read_text())['rows'][6]
            assert row['candidate_comparison']['code']=='CROSS_SOURCE_AGREEMENT' and row['candidate_record']['term']=='Fabry disease'
        cell.get_by_role('button',name='근거 자세히 ↑').click()
        expect(page.locator('#analyzer-keyword')).to_have_value('Fabry disease')
        expect(page.locator('#analyzer-result .compare-heading')).to_contain_text('이름·교차참조 연결 확인')
        expect(page.locator('#analyzer-result .compare-proposal')).to_contain_text('MONDO:0010526')
        expect(page.locator('#analyzer-result .compare-proposal')).to_contain_text('사전에 반영하지 않았습니다')
        expect(page.locator('#analyzer-result .candidate-item.agreed')).to_have_count(3)
        assert sent and all('Adults' not in url for url in sent)
        with page.expect_download() as download:
            page.get_by_role('button',name='이 비교의 기록 JSON 내려받기 ↓').click()
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)/'cmp.json';download.value.save_as(dest);cmp=json.loads(dest.read_text())
            assert cmp['comparison']['code']=='CROSS_SOURCE_AGREEMENT' and cmp['record']['term']==cmp['comparison']['term']=='Fabry disease'
        outage['info']=True
        page.reload(wait_until='networkidle')  # fresh session: no cached version lookups
        page.locator('#analyzer-keyword').fill('Fabry disease');page.locator('#analyzer-text').fill('Adults with Fabry disease.')
        page.get_by_role('button',name='이 원문 분석하기').click()
        page.get_by_role('button',name='MONDO·NCIt·MeSH에서 후보 비교하기').click()
        expect(page.locator('#analyzer-result .runtime-note').filter(has_text='출처 버전을 확인하지 못했습니다')).to_be_visible()
        before=len(sent);outage['info']=False
        page.locator('#analyzer-result [data-compare-output]').get_by_role('button',name='다시 조회').click()
        expect(page.locator('#analyzer-result .compare-columns')).to_contain_text('버전 2026-10-06')
        assert len(sent)>before
        console_errors[:]=[e for e in console_errors if 'status of 503' not in e]
        page.unroute('https://www.ebi.ac.uk/**');page.unroute('https://id.nlm.nih.gov/**')
        results.append('On-demand MONDO/NCIt/MeSH comparison: outage shown and retried, target-only requests, exact-match link, not registered, paired record downloads')

        if output:page.screenshot(path=str(output/'analyzer.png'),full_page=True)
        page.goto(base_url+'#materials/audit',wait_until='networkidle')
        expect(page.get_by_role('heading',name='규칙 적용과 남은 검토',exact=True)).to_be_visible()
        expect(page.locator('#audit-row-count')).to_have_text('300 / 300행')
        expect(page.locator('#audit-rows tr')).to_have_count(20)
        page.locator('[data-audit-mode="B"]').click()
        expect(page.locator('#audit-mode-description')).to_contain_text('전역 정책은 남습니다')
        page.locator('[data-audit-category="UNREGISTERED"]').click()
        count=page.locator('#audit-row-count').inner_text()
        assert count.endswith(' / 300행') and count!='300 / 300행'
        page.locator('#audit-reset').click()
        page.locator('#audit-search').fill('K007')
        expect(page.locator('#audit-rows tr')).to_have_count(1)
        expect(page.locator('#audit-rows')).to_contain_text('HOLD_AMBIGUOUS')
        page.locator('#audit-rows summary').click()
        expect(page.locator('#audit-rows')).to_contain_text('제거: 별칭')
        for suffix in ['A','B','C']:
            payload=page.request.get(base_url+'downloads/rule-audit-'+suffix+'.json')
            assert payload.ok and len(payload.json()['rows'])==300
        expect(page.locator('.support-table tbody tr')).to_have_count(12)
        results.append('Audit A/B filtering, row details, 12-rule support table and complete A/B/C downloads')
        page.goto(base_url+'#materials/compare',wait_until='networkidle')
        expect(page.locator('.compare-columns .compare-column')).to_have_count(2)
        expect(page.locator('.compare-column').nth(0).locator('.runtime-note')).not_to_contain_text('현행 MASLD 명칭과 달리')
        expect(page.locator('.compare-column').nth(1).locator('.runtime-note')).to_contain_text('현행 MASLD 명칭과 달리')
        page.get_by_role('button',name='PTCL 질환군 / PTCL-NOS',exact=True).click()
        expect(page.locator('.compare-columns')).to_contain_text('MONDO:0004964')
        expect(page.locator('.compare-note')).to_contain_text('검토 후보')
        page.get_by_role('button',name='GCA / temporal arteritis',exact=True).click()
        expect(page.locator('.compare-columns')).to_contain_text('NCIT:C35065')
        expect(page.locator('.compare-note')).to_contain_text('같은 개념')
        results.append('Optional comparison distinguishes concept groups, narrower candidates and same-concept names')
        page.goto(base_url+'#cases/examples',wait_until='networkidle')
        expect(page.locator('.case-group')).to_have_count(6)
        expect(page.locator('.case-grid .feature-card')).to_have_count(10)
        page.goto(base_url+'#cases',wait_until='networkidle')
        expect(page.locator('#document-content')).to_contain_text('G12')
        assert page.locator('.criteria-tabs a').all_text_contents()==['공통 기준','사례별 검토']
        page.goto(base_url+'#materials',wait_until='networkidle')
        expect(page.locator('.materials-tabs a')).to_have_count(4)
        assert page.locator('.materials-tabs a').all_text_contents()==['구축 과정','유사 서비스 조사','검증과 한계','파일과 실행 방법']
        for legacy,canonical in [('guidelines','cases'),('compare','cases/examples?section=compare'),('boundaries','materials/methodology?section=counterexamples'),('analyzer','materials/methodology'),('audit-method','materials/audit?section=method'),('review','materials/methodology')]:
            page.goto(base_url+'#materials/'+legacy,wait_until='networkidle')
            expect(page).to_have_url(re.compile(re.escape('#'+canonical)+'$'))
            if legacy=='compare':expect(page.locator('#concept-comparison')).to_be_focused()
            if legacy=='audit-method':expect(page.locator('#audit-method-section')).to_be_focused()
            expect(page.locator('a[href="#materials/review"]')).to_have_count(0)
        assert page.request.get(base_url+'content/review.html').status==404
        evidence=page.request.get(base_url+'evidence/review_process/manifest.json')
        assert evidence.ok and len(evidence.json()['files'])>=5
        results.append('Two criteria sections, six groups/ten cases, four report sections, legacy redirects and preserved evidence')
        page.set_viewport_size({'width':390,'height':844})
        page.goto(base_url+'#dictionary',wait_until='networkidle')
        search_box=page.locator('#dictionary-search').bounding_box()
        assert search_box['y']+search_box['height']<844,search_box
        expect(page.locator('#results')).to_be_visible()
        assert page.locator('.ambiguity-title').bounding_box()['y']<page.locator('#results').bounding_box()['y']  # mobile: CD case before the list
        for route in ['#cases/examples','#dictionary','#records','#cases','#cases/cd','#materials/guidelines','#materials/research','#materials/methodology','#materials/downloads','#materials/boundaries','#aliases','#analyze','#materials/analyzer','#materials/audit','#materials/review','#materials/audit-method','#materials/compare']:
            page.goto(base_url+route,wait_until='networkidle')
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),route
        for width in [320,390]:
            page.set_viewport_size({'width':width,'height':844})
            page.goto(base_url+'#materials/methodology',wait_until='networkidle')
            geometry=page.locator('.materials-tabs a').evaluate_all('(els)=>els.map(e=>({top:Math.round(e.getBoundingClientRect().top),overflow:e.scrollWidth>e.clientWidth}))')
            assert len({g['top'] for g in geometry})<=2,(width,geometry)
            assert not any(g['overflow'] for g in geometry),(width,geometry)
        page.set_viewport_size({'width':390,'height':844})
        for case in ['cd','eczema','nsclc','masld','conflict','or','her2','gca','sense','long-covid']:
            page.goto(base_url+'#cases/'+case,wait_until='networkidle')
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),case
        page.goto(base_url+'#dictionary',wait_until='networkidle')
        page.locator('[data-concept-list]').click()
        expect(page.locator('#search-heading')).to_be_focused()
        assert 100 <= page.locator('#search-heading').bounding_box()['y'] <= 190
        page.locator('#dictionary-search').fill('CD')
        page.locator('#results [data-concept="MONDO:0005011"]').click()
        expect(page.locator('#dictionary-detail')).to_contain_text('Crohn disease')
        page.get_by_role('button',name='← 검색 결과 목록').click()
        expect(page.locator('#results')).to_be_visible()
        page.locator('#dictionary-search').fill('PASC')
        page.get_by_role('button',name='← 검색 결과 목록').click()
        expect(page.locator('#results')).to_be_visible()
        expect(page.locator('#dictionary-detail')).not_to_contain_text('K260')
        if output:page.screenshot(path=str(output/'mobile.png'),full_page=True)
        results.append('390px mobile routes, no page overflow and result return')
        page.goto(base_url+'#analyze',wait_until='networkidle')
        page.get_by_role('button',name='크론병으로 정의',exact=True).click()
        expect(page.locator('.runtime-concepts')).to_contain_text('MONDO:0005011')
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        results.append('Mobile runtime input, result interaction and no page overflow')
        assert not errors,errors
        browser.close()
    return {'passed':len(results),'checks':results,'page_errors':errors,'console_errors':list(dict.fromkeys(console_errors))}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8787/')
    parser.add_argument('--browser-executable');parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    if args.output:args.output.mkdir(parents=True,exist_ok=True)
    print(json.dumps(run(args.base_url,args.browser_executable,args.output),ensure_ascii=False,indent=2))

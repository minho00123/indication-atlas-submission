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
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base_url,wait_until='networkidle')
        expect(page.get_by_role('heading',name='딕셔너리 탐색')).to_be_visible()
        results.append('Desktop entry and snapshot counts')
        expect(page.locator('#hero-title')).to_contain_text('300개 입력을 검토해')
        expect(page.locator('#hero-title')).to_contain_text('287개 개념 그룹')
        cards=page.locator('.featured-grid [data-case]')
        assert cards.evaluate_all('(els)=>els.map(e=>e.dataset.case)')==['cd','eczema','nsclc','masld','conflict']
        assert [tag.split(' · ',1)[0] for tag in cards.locator('.feature-kicker').all_text_contents()]==['01','02','03','04','05']
        counts=page.locator('#results .result-meta').all_text_contents()
        assert all('2개 원본' in text or '6개 원본' in text for text in counts[:6])
        assert all('1개 원본' in text for text in counts[6:])
        results.append('Result headline, five cases and all six multi-source groups first')
        page.keyboard.press('Tab')
        expect(page.locator('.skip-link')).to_be_focused()
        page.keyboard.press('Enter')
        expect(page.locator('#main-content')).to_be_focused()
        results.append('Keyboard skip navigation stays on the intended route')
        page.locator('.stat[href="#records"]').click()
        expect(page.locator('#record-count')).to_have_text('300 / 300건')
        page.get_by_role('link',name='딕셔너리',exact=True).click()
        page.locator('.stat[href="#records?decision=HOLD"]').click()
        expect(page.locator('#record-count')).to_have_text('2 / 300건')
        expect(page.locator('#record-table tbody tr')).to_have_count(2)
        page.get_by_role('button',name='K009 판단 상세 보기').click()
        expect(page.locator('.detail')).to_contain_text('문맥 부족')
        page.get_by_role('button',name='← 원본 300건 목록').click()
        expect(page.locator('#record-count')).to_have_text('2 / 300건')
        page.get_by_role('link',name='딕셔너리',exact=True).click()
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
        page.get_by_role('link',name='딕셔너리',exact=True).click()
        results.append('All summary links, two held rows, alias pagination/search and cited detail navigation')
        if output:page.screenshot(path=str(output/'desktop.png'),full_page=True)
        page.locator('#dictionary-search').fill('CD')
        expect(page.locator('#results')).to_contain_text('문맥 확인이 필요합니다')
        expect(page.locator('#results')).to_contain_text('K009')
        expect(page.locator('#dictionary-detail')).to_contain_text('하나의 질환으로 확정하지 않았습니다')
        page.locator('#results [data-concept="MONDO:0005011"]').click()
        expect(page.locator('#dictionary-detail')).to_contain_text('Crohn disease')
        expect(page.locator('#dictionary-detail')).to_contain_text('ileocolonic inflammation')
        results.append('CD disambiguation, hold and cited row selection')
        page.locator('#dictionary-search').fill('K001')
        expect(page.locator('#candidates-K001 summary')).to_have_count(4)
        summaries=page.locator('#candidates-K001 summary').all_text_contents()
        assert any('NCIt' in text and 'C3001' in text for text in summaries),summaries
        assert any('MeSH' in text for text in summaries),summaries
        results.append('Candidate provenance visible before expanding definitions')
        page.locator('#dictionary-search').fill('NAFLD')
        expect(page.locator('#results')).to_contain_text('관련 결과 · 동의어 병합 아님')
        expect(page.locator('#dictionary-detail')).to_contain_text('K116')
        results.append('NAFLD/MASLD related results separated')
        page.locator('#dictionary-search').fill('PASC')
        expect(page.locator('#dictionary-detail')).to_contain_text('Long COVID')
        expect(page.locator('#dictionary-detail')).to_contain_text('기간')
        results.append('PASC alias and definition warning')
        page.get_by_role('link',name='원본 300건',exact=True).click()
        page.locator('#decision-filter').select_option('HOLD')
        expect(page.locator('#record-count')).to_have_text('2 / 300건')
        page.get_by_role('button',name='K024 판단 상세 보기').click()
        expect(page.locator('.detail')).to_contain_text('plaque psoriasis')
        expect(page.locator('.detail')).to_contain_text('입력 충돌')
        page.get_by_role('button',name='← 원본 300건 목록').click()
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
        card=page.locator('.boundary-card')
        expect(card).to_contain_text('분류 기준과 적용 한계')
        assert not re.search(r'\d',card.inner_text())
        card.click()
        expect(page.locator('#document-content>h1')).to_have_text('분류 기준과 적용 한계')
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
        results.append('Boundary card, separated exploratory appendices and published evidence')
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
        expect(page.locator('.legacy-experiment')).not_to_have_attribute('open','')
        expect(page.locator('.legacy-experiment')).to_contain_text('94.4%')
        main_text=page.locator('#document-content').evaluate('(el)=>{const copy=el.cloneNode(true);copy.querySelector(".legacy-experiment").remove();return copy.textContent}')
        assert '94%' not in main_text and '94.4%' not in main_text
        page.locator('.legacy-experiment>summary').click()
        expect(page.locator('.legacy-content')).to_be_visible()
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
        page.get_by_role('link',name='새 문장 분석 열기 ↗').click()
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
        expect(page.locator('#analyzer-decision')).to_have_text('입력 충돌 · 보류')
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
        if output:page.screenshot(path=str(output/'analyzer.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        for route in ['#dictionary','#records','#cases','#cases/cd','#materials/guidelines','#materials/research','#materials/methodology','#materials/downloads','#materials/boundaries','#aliases','#analyze','#materials/analyzer']:
            page.goto(base_url+route,wait_until='networkidle')
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),route
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
    return {'passed':len(results),'checks':results,'page_errors':errors}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8787/')
    parser.add_argument('--browser-executable');parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    if args.output:args.output.mkdir(parents=True,exist_ok=True)
    print(json.dumps(run(args.base_url,args.browser_executable,args.output),ensure_ascii=False,indent=2))

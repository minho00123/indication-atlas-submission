#!/usr/bin/env python3
"""Non-LLM concept-normalization baselines on an EXTERNAL expert gold corpus.

Gold: NCBI Disease Corpus test set (Dogan et al. 2014; 100 PubMed abstracts, expert-annotated
MeSH/OMIM IDs). None of these mentions were used to build the Atlas dictionary, prompts or rules.

Methods (all use the official MONDO OBO only; no project dictionary, no LLM):
  M1 string_exact      casefold(mention) == casefold(MONDO label)
  M2 ontology_exact    punctuation-insensitive match on label + EXACT synonyms;
                       >1 distinct MONDO class -> ABSTAIN
  M3 ontology_greedy   label + synonyms of ANY scope (EXACT/BROAD/NARROW/RELATED); on ties take the
                       lowest MONDO id (simulates a dictionary that ignores synonym scope)

Scoring: the predicted MONDO class is translated to its MESH:/OMIM: xrefs. Outcomes per mention:
  CORRECT     xref set intersects gold ids
  WRONG       has MESH/OMIM xrefs, none in gold          (= silent false auto-merge if auto-accepted)
  UNSCORABLE  predicted class has no MESH/OMIM xref      (cannot be judged against this gold)
  ABSTAIN     no prediction / ambiguous

Usage:
  python3 -I bench/concept_baselines.py --obo mondo.obo --corpus NCBItestset_corpus.txt --out bench/results_concept_baselines.json
"""
import argparse, collections, hashlib, json, math, re, time
from pathlib import Path

SYN = re.compile(r'^"((?:\\.|[^"\\])*)"\s+(EXACT|BROAD|NARROW|RELATED)\b')
ANIMAL = re.compile(r", (non-human animal|dog|cat|horse|cattle|pig|rabbit|macaque|rhesus macaque|domestic cat|sheep|chicken)$")


def norm_loose(s):
    return re.sub(r"\s+", " ", re.sub(r"[^\w ]", " ", s.casefold())).strip()


def load_mondo(path):
    terms, cur = {}, None
    for line in open(path, encoding="utf8"):
        line = line.rstrip("\n")
        if line.startswith("["):
            cur = {} if line == "[Term]" else None
            continue
        if cur is None or ": " not in line:
            continue
        k, _, v = line.partition(": ")
        if k == "id":
            if not v.startswith("MONDO:"):
                cur = None
                continue
            cur.update(id=v, name="", syn=[], xref=set(), obsolete=False)
            terms[v] = cur
        elif k == "name":
            cur["name"] = v
        elif k == "synonym":
            m = SYN.match(v)
            if m:
                cur["syn"].append((m.group(1).replace('\\"', '"'), m.group(2)))
        elif k == "xref":
            x = v.split(" ")[0]
            if x.startswith("MESH:"):
                cur["xref"].add(x[5:])
            elif x.startswith("OMIM:"):
                cur["xref"].add(x)
        elif k == "is_obsolete" and v.strip() == "true":
            cur["obsolete"] = True
    return {i: t for i, t in terms.items() if not t["obsolete"] and not ANIMAL.search(t["name"])}


def build_indexes(T):
    label_exact = collections.defaultdict(set)
    exact = collections.defaultdict(set)
    anyscope = collections.defaultdict(set)
    for i, t in T.items():
        label_exact[t["name"].casefold()].add(i)
        exact[norm_loose(t["name"])].add(i)
        anyscope[norm_loose(t["name"])].add(i)
        for s, sc in t["syn"]:
            anyscope[norm_loose(s)].add(i)
            if sc == "EXACT":
                exact[norm_loose(s)].add(i)
    return label_exact, exact, anyscope


def predict(method, mention, idx):
    label_exact, exact, anyscope = idx
    if method == "M1_string_exact":
        hits = label_exact.get(mention.casefold(), set())
    elif method == "M2_ontology_exact":
        hits = exact.get(norm_loose(mention), set())
    else:
        hits = anyscope.get(norm_loose(mention), set())
        return (sorted(hits)[0] if hits else None), len(hits)
    return (next(iter(hits)) if len(hits) == 1 else None), len(hits)


def wilson(k, n, z=1.96):
    if n == 0:
        return [None, None]
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(c - h, 3), round(c + h, 3)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--obo", required=True, type=Path)
    ap.add_argument("--corpus", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    header = open(a.obo, encoding="utf8").read(400)
    T = load_mondo(a.obo)
    idx = build_indexes(T)
    mentions = []
    for line in open(a.corpus, encoding="utf8"):
        f = line.rstrip("\n").split("\t")
        if len(f) == 6:
            gold = set(x for x in re.split(r"[|+]", f[5]) if x)
            mentions.append(dict(pmid=f[0], text=f[3], type=f[4], gold=sorted(gold)))
    report = dict(
        gold="NCBI Disease Corpus test set (expert annotation; external to this project)",
        corpus_sha256=hashlib.sha256(a.corpus.read_bytes()).hexdigest(),
        obo_header=[l for l in header.splitlines() if l.startswith("data-version")],
        obo_sha256=hashlib.sha256(a.obo.read_bytes()).hexdigest(),
        n_mentions=len(mentions), n_docs=len({m["pmid"] for m in mentions}),
        llm_arms="NOT RUN (see CLAUDE_BENCHMARK_PLAN.md)", methods={})
    for method in ("M1_string_exact", "M2_ontology_exact", "M3_ontology_greedy_anyscope"):
        t0 = time.perf_counter()
        rows = []
        for m in mentions:
            pred, nhits = predict(method, m["text"], idx)
            if pred is None:
                out = "ABSTAIN"
            elif not T[pred]["xref"]:
                out = "UNSCORABLE"
            elif T[pred]["xref"] & set(m["gold"]):
                out = "CORRECT"
            else:
                out = "WRONG"
            rows.append(dict(pmid=m["pmid"], text=m["text"], type=m["type"], gold=m["gold"], pred=pred,
                             pred_label=T[pred]["name"] if pred else "", n_hits=nhits, outcome=out))
        ms = (time.perf_counter() - t0) * 1000
        # doc-level: one vote per (pmid, normalized mention, gold) so repeated mentions in one abstract count once
        seen, doc_rows = set(), []
        for r in rows:
            k = (r["pmid"], norm_loose(r["text"]), tuple(r["gold"]))
            if k not in seen:
                seen.add(k)
                doc_rows.append(r)

        def summarize(rs):
            c = collections.Counter(r["outcome"] for r in rs)
            decided = c["CORRECT"] + c["WRONG"]
            return dict(n=len(rs), outcomes=dict(c),
                        coverage=round((len(rs) - c["ABSTAIN"]) / len(rs), 3),
                        abstention=round(c["ABSTAIN"] / len(rs), 3),
                        precision_scorable=f"{c['CORRECT']}/{decided}",
                        precision_scorable_value=round(c["CORRECT"] / decided, 3) if decided else None,
                        precision_wilson95=wilson(c["CORRECT"], decided),
                        false_auto_merge=f"{c['WRONG']}/{len(rs)}",
                        correct_over_all=f"{c['CORRECT']}/{len(rs)}")
        report["methods"][method] = dict(mention_level=summarize(rows), doc_level=summarize(doc_rows),
                                         latency_ms_total=round(ms, 1), cost_usd=0,
                                         wrong_examples=[r for r in rows if r["outcome"] == "WRONG"][:40])
    a.out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf8")
    for k, v in report["methods"].items():
        print(k, json.dumps(v["mention_level"], ensure_ascii=False), "| doc:", v["doc_level"]["precision_scorable"], v["doc_level"]["false_auto_merge"])


if __name__ == "__main__":
    main()

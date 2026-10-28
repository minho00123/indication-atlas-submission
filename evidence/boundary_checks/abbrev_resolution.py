#!/usr/bin/env python3
"""PROPOSAL P3 prototype: document-level abbreviation resolution before ontology lookup.

Simplified Schwartz & Hearst (2003) definition finder: for every "long form (SF)" in the same abstract, the
short form's characters must appear in order in the long form, the first SF character starting a word.
A mention equal to a defined SF is replaced by its long form; then M2 (official EXACT lookup) is applied.
Mentions that look like abbreviations but have no in-document definition ABSTAIN instead of being looked up.

Usage: python3 -I bench/abbrev_resolution.py --obo mondo.obo --corpus NCBItestset_corpus.txt --out bench/results_abbrev_resolution.json
"""
import argparse, collections, importlib.util, json, re
from pathlib import Path

spec = importlib.util.spec_from_file_location("cb", Path(__file__).with_name("concept_baselines.py"))
cb = importlib.util.module_from_spec(spec); spec.loader.exec_module(cb)

PAREN = re.compile(r"\(([^()]{2,10})\)")
ABBR = re.compile(r"^[A-Za-z0-9-]{2,8}$")


def looks_abbrev(s):
    return bool(ABBR.match(s)) and sum(ch.isupper() for ch in s) >= 2


def long_form(sf, before):
    words = before.split()[-min(len(sf) + 5, 2 * len(sf)):]
    text = " ".join(words)
    s, l = len(sf) - 1, len(text) - 1
    while s >= 0:
        c = sf[s].lower()
        if not c.isalnum():
            s -= 1; continue
        while l >= 0 and (text[l].lower() != c or (s == 0 and l > 0 and text[l - 1].isalnum())):
            l -= 1
        if l < 0:
            return None
        s -= 1; l -= 1
    lf = text[text.rfind(" ", 0, l + 1) + 1:].strip()  # l + 1 is where the first SF character matched
    return lf if len(lf) > len(sf) else None


def definitions(doc_text):
    out = {}
    for m in PAREN.finditer(doc_text):
        sf = m.group(1).strip()
        if not looks_abbrev(sf):
            continue
        lf = long_form(sf, doc_text[:m.start()])
        if lf:
            out.setdefault(sf, lf)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--obo", required=True); ap.add_argument("--corpus", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    T = cb.load_mondo(a.obo); idx = cb.build_indexes(T)
    docs, mentions = collections.defaultdict(str), []
    for line in open(a.corpus, encoding="utf8"):
        line = line.rstrip("\n")
        if "|t|" in line or "|a|" in line:
            pmid, _, text = line.split("|", 2)
            docs[pmid] += text + " "
        else:
            f = line.split("\t")
            if len(f) == 6:
                mentions.append(dict(pmid=f[0], text=f[3], gold=set(x for x in re.split(r"[|+]", f[5]) if x)))
    defs = {p: definitions(t) for p, t in docs.items()}

    def lookup(text):
        hits = idx[1].get(cb.norm_loose(text), set())
        return next(iter(hits)) if len(hits) == 1 else None

    res = collections.Counter(); changed = []; per = []
    for m in mentions:
        text, how = m["text"], "as_is"
        d = defs[m["pmid"]]
        if m["text"] in d:
            text, how = d[m["text"]], "expanded"
        elif looks_abbrev(m["text"]):
            res["ABSTAIN"] += 1; per.append((m, "ABSTAIN")); changed.append(dict(m, gold=sorted(m["gold"]), how="undefined_abbrev_abstain")); continue
        p = lookup(text)
        out = "ABSTAIN" if p is None else "UNSCORABLE" if not T[p]["xref"] else "CORRECT" if T[p]["xref"] & m["gold"] else "WRONG"
        res[out] += 1; per.append((m, out))
        if how == "expanded":
            changed.append(dict(m, gold=sorted(m["gold"]), how=how, long_form=text, pred=p, pred_label=T[p]["name"] if p else "", outcome=out))
    n = len(mentions); dec = res["CORRECT"] + res["WRONG"]
    summary = dict(n=n, outcomes=dict(res), coverage=round((n - res["ABSTAIN"]) / n, 3),
                   precision=f"{res['CORRECT']}/{dec}", precision_wilson95=cb.wilson(res["CORRECT"], dec),
                   false_auto_merge=f"{res['WRONG']}/{n}", defined_abbrevs=sum(len(v) for v in defs.values()))
    seen, dl = set(), collections.Counter()
    for m, o in per:
        k = (m["pmid"], cb.norm_loose(m["text"]), tuple(sorted(m["gold"])))
        if k not in seen:
            seen.add(k); dl[o] += 1
    dn = sum(dl.values()); ddec = dl["CORRECT"] + dl["WRONG"]
    summary["doc_level"] = dict(n=dn, outcomes=dict(dl), precision=f"{dl['CORRECT']}/{ddec}",
                                precision_wilson95=cb.wilson(dl["CORRECT"], ddec), false_auto_merge=f"{dl['WRONG']}/{dn}")
    Path(a.out).write_text(json.dumps(dict(method="M2 + doc-level abbreviation resolution (P3 prototype)", summary=summary,
                                           changed=changed), ensure_ascii=False, indent=1), encoding="utf8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()

# Summarise the 3x3 validation: per-judge stable verdict (majority of 3 runs),
# run-to-run variability, pairwise agreement, majority-of-3 vs the oracle.
import json, os
from itertools import combinations
from collections import Counter
res = json.load(open('work/judge3x3-results.json'))
JUDGES = ['qwen4-max-preview', 'deepseek-flash', 'LongCat-2.5']

per = {}
for j in JUDGES:
    ok = tot = 0; errs = []; de = []; unstable = 0
    for row in res:
        jd = row['judges'].get(j, {})
        sv = jd.get('stable_verdict')
        vs = jd.get('verdicts', [])
        if len(set(vs)) > 1:
            unstable += 1
        for d in jd.get('runs', []):
            e = d.get('estimated_ratio')
            if isinstance(e, (int, float)):
                de.append(abs(e - row['ground_truth_cr']))
        if sv is None:
            continue
        tot += 1
        if bool(sv) == row['gt_aaa']:
            ok += 1
        else:
            errs.append(row['id'])
    per[j] = {'stable_correct': ok, 'total': tot, 'stable_accuracy': round(ok / tot, 3) if tot else None,
              'ratio_mae': round(sum(de) / len(de), 3) if de else None,
              'misjudged': errs, 'runs_disagree': unstable}
pair = {}
for a, b in combinations(JUDGES, 2):
    ag = tot = 0
    for row in res:
        va = row['judges'].get(a, {}).get('stable_verdict')
        vb = row['judges'].get(b, {}).get('stable_verdict')
        if va is None or vb is None: continue
        tot += 1
        if bool(va) == bool(vb): ag += 1
    pair[f'{a}|{b}'] = {'agree': ag, 'total': tot, 'rate': round(ag / tot, 3) if tot else None}
maj = una = unatot = 0
for row in res:
    vs = [row['judges'].get(j, {}).get('stable_verdict') for j in JUDGES]
    vs = [bool(v) for v in vs if v is not None]
    if not vs: continue
    if (sum(vs) > len(vs) / 2) == row['gt_aaa']: maj += 1
    if len(vs) == 3 and len(set(vs)) == 1:
        unatot += 1
        if vs[0] == row['gt_aaa']: una += 1
summary = {'method': '3x3 (3 judges x 3 runs; per-judge majority, then cross-judge majority)',
           'panel': JUDGES, 'conditions': 'pure VLM, image+prompt only, official API, no tools, thinking enabled, generous max_tokens',
           'ground_truth': 'LUMINA deterministic oracle', 'n_stimuli': len(res),
           'per_judge': per, 'pairwise_agreement': pair,
           'majority_of_3_matches_oracle': maj, 'unanimous_3_matches_oracle': una, 'unanimous_3_total': unatot}
os.makedirs('../../docs/paper/data', exist_ok=True)
json.dump(summary, open('../../docs/paper/data/convergence-summary-3x3.json', 'w'), indent=2)
print(json.dumps(summary, indent=2))
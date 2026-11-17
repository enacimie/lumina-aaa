# Summarise the 3-judge VLM validation against the LUMINA oracle ground truth.
import json, os
from itertools import combinations
res = json.load(open('work/judge-results.json'))
JUDGES = ['qwen4-max-preview', 'deepseek-flash', 'LongCat-2.5']
def verdict(j, row):
    d = row['judges'].get(j, {})
    if row['type'] == 'focus':
        return d.get('focus_visible', d.get('aaa_pass'))
    return d.get('aaa_pass')

per = {}
for j in JUDGES:
    ok = tot = 0; errs = []; de = []
    for row in res:
        v = verdict(j, row)
        if v is None: continue
        tot += 1
        if bool(v) == row['gt_aaa']: ok += 1
        else: errs.append(row['id'])
        e = row['judges'].get(j, {}).get('estimated_ratio')
        if isinstance(e, (int, float)): de.append(abs(e - row['ground_truth_cr']))
    per[j] = {'correct': ok, 'total': tot, 'accuracy': round(ok / tot, 3) if tot else None,
              'ratio_mae': round(sum(de) / len(de), 3) if de else None, 'misjudged': errs}
pair = {}
for a, b in combinations(JUDGES, 2):
    ag = tot = 0
    for row in res:
        va, vb = verdict(a, row), verdict(b, row)
        if va is None or vb is None: continue
        tot += 1
        if bool(va) == bool(vb): ag += 1
    pair[f'{a}|{b}'] = {'agree': ag, 'total': tot, 'rate': round(ag / tot, 3) if tot else None}
maj = una = unatot = 0
for row in res:
    vs = [verdict(j, row) for j in JUDGES]; vs = [bool(v) for v in vs if v is not None]
    if not vs: continue
    if (sum(vs) > len(vs) / 2) == row['gt_aaa']: maj += 1
    if len(vs) == 3:
        unatot += 1
        if len(set(vs)) == 1 and vs[0] == row['gt_aaa']: una += 1
summary = {'panel': JUDGES, 'conditions': 'pure VLM, image+prompt only, official API, no tools',
           'ground_truth': 'LUMINA deterministic oracle', 'n_stimuli': len(res),
           'per_judge': per, 'pairwise_agreement': pair,
           'majority_of_3_matches_oracle': maj, 'unanimous_3_matches_oracle': una, 'unanimous_3_total': unatot}
os.makedirs('../../docs/paper/data', exist_ok=True)
json.dump(summary, open('../../docs/paper/data/convergence-summary.json', 'w'), indent=2)
print(json.dumps(summary, indent=2))
# VLM validation layer for LUMINA-AAA: three pure vision-language judges, identical
# conditions (image + prompt only, direct official API, no tools/agent environment).
# Ground truth is the LUMINA deterministic oracle (work/stimuli.json). Keys via env:
#   QWEN_API_KEY (Alibaba token-plan), DEEPSEEK_API_KEY (official), LONGCAT_API_KEY (official).
import os, json, base64, urllib.request, re
from concurrent.futures import ThreadPoolExecutor

stimuli = json.load(open('work/stimuli.json'))
QWEN = os.environ['QWEN_API_KEY']
DS = os.environ['DEEPSEEK_API_KEY']
LC = os.environ['LONGCAT_API_KEY']

PROMPT_TEXT = ('You are a WCAG accessibility expert. This image shows normal-size body text on a background. '
  'Estimate the contrast ratio between the text and its background, then judge compliance. '
  'Respond ONLY with JSON: {"estimated_ratio": <number>, "aa_pass": <bool at 4.5:1>, "aaa_pass": <bool at 7:1>, "reasoning": "<one sentence>"}')
PROMPT_FOCUS = ('You are a WCAG accessibility expert. This image shows a focus ring (outer colour) around a button fill (inner colour). '
  'Judge whether the focus indicator is visible per WCAG 1.4.11/2.4.13 (3:1 between the ring and the adjacent fill). '
  'Estimate the ring-vs-fill contrast ratio. '
  'Respond ONLY with JSON: {"estimated_ratio": <number>, "focus_visible": <bool at 3:1>, "aa_pass": <bool>, "aaa_pass": <bool>, "reasoning": "<one sentence>"}')

def http(url, key, model, b64, prompt, mt, extra=None):
    body = {'model': model, 'messages': [{'role': 'user', 'content': [
        {'type': 'text', 'text': prompt},
        {'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{b64}'}}]}],
        'max_tokens': mt, 'temperature': 0}
    if extra: body.update(extra)
    c = ''
    for _ in range(3):  # retry on empty content (reasoning models can exhaust tokens)
        req = urllib.request.Request(url, data=json.dumps(body).encode(),
            headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
        d = json.load(urllib.request.urlopen(req, timeout=240))
        c = d['choices'][0]['message'].get('content') or ''
        m = re.search(r'\{.*\}', c, re.S)
        if m:
            return json.loads(m.group(0))
    return {'raw': c[:200]}

# (name, url, key, model, max_tokens, extra_body); thinking enabled on all judges
JUDGES = [
    ('qwen4-max-preview', 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions', QWEN, 'qwen4-max-preview', 32768, {'enable_thinking': True}),
    ('deepseek-flash', 'https://api.deepseek.com/v1/chat/completions', DS, 'deepseek-flash', 65536, {'thinking': {'type': 'enabled'}}),
    ('LongCat-2.5', 'https://api.longcat.chat/openai/v1/chat/completions', LC, 'LongCat-2.5', 65536, {'enable_thinking': True}),
]
results = []
for s in stimuli:
    b64 = base64.b64encode(open(f"work/stimuli/{s['id']}.png", 'rb').read()).decode()
    prompt = PROMPT_FOCUS if s['type'] == 'focus' else PROMPT_TEXT
    row = {'id': s['id'], 'type': s['type'], 'ground_truth_cr': s['actualCR'], 'gt_aa': s['aa'], 'gt_aaa': s['aaa'], 'judges': {}}
    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = {ex.submit(http, url, key, model, b64, prompt, mt, extra): name
                for name, url, key, model, mt, extra in JUDGES}
        for f in futs:
            try:
                row['judges'][futs[f]] = f.result()
            except Exception as e:
                row['judges'][futs[f]] = {'error': str(e)[:150]}
    results.append(row)
    print(s['id'], 'done', flush=True)
os.makedirs('../../docs/paper/data', exist_ok=True)
json.dump(results, open('work/judge-results.json', 'w'), indent=2)
json.dump(results, open('../../docs/paper/data/convergence.json', 'w'), indent=2)
print('saved ../../docs/paper/data/convergence.json')
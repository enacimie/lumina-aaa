import os, json, base64, urllib.request, re
cfg = open(os.path.expanduser('~/.config/opencode/opencode.jsonc')).read()
qwen = re.search(r'"apiKey"\s*:\s*"([^"]+)"', cfg).group(1)
auth = json.load(open(os.path.expanduser('~/.local/share/opencode/auth.json')))
ds = auth['deepseek'].get('key') or auth['deepseek'].get('api_key')
lc = open('/tmp/opencode/vlm/longcat_key.txt').read().strip()
b64 = base64.b64encode(open('work/stimuli/text-7.png', 'rb').read()).decode()
prompt = 'Estimate the text/background contrast ratio. JSON only: {"estimated_ratio":number,"aaa_pass":bool}'
def call(name, url, key, model, mt, extra):
    body = {'model': model, 'messages': [{'role': 'user', 'content': [
        {'type': 'text', 'text': prompt},
        {'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{b64}'}}]}],
        'max_tokens': mt, 'temperature': 0}
    if extra: body.update(extra)
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    try:
        d = json.load(urllib.request.urlopen(req, timeout=200))
        m = d['choices'][0]['message']
        rc = m.get('reasoning_content')
        print(f'{name}: keys={list(m.keys())} content={repr(m.get("content"))[:90]} reasoning_len={len(rc) if rc else 0}')
    except Exception as e:
        print(f'{name} ERR', e.read().decode()[:220] if hasattr(e, 'read') else e)
QURL = 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions'
DURL = 'https://api.deepseek.com/v1/chat/completions'
LURL = 'https://api.longcat.chat/openai/v1/chat/completions'
call('Qwen enable_thinking', QURL, qwen, 'qwen4-max-preview', 32768, {'enable_thinking': True})
call('DeepSeek thinking enabled', DURL, ds, 'deepseek-flash', 32768, {'thinking': {'type': 'enabled'}})
call('LongCat enable_thinking', LURL, lc, 'LongCat-2.5', 65536, {'enable_thinking': True})
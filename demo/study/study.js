// Static study runner. No backend: responses stay in the browser and are
// exported as CSV. Reads the stimuli from the paper data directory.
//
// Two cohorts, as the protocol defines:
//   simulation - normal-vision participants judge the simulated pair.
//   clinical   - participants with a diagnosed dichromacy judge the raw pair
//                that matches their own deficiency.
//
// The practice block is the first 10 trials, with feedback. The main block
// follows without feedback.

const STIMULI = '../../docs/paper/data/stimuli.json';
const PRACTICE_TRIALS = 10;

const $ = (id) => document.getElementById(id);
const screens = {
  start: $('screen-start'),
  trial: $('screen-trial'),
  end: $('screen-end'),
};

const state = {
  conditions: [],
  trials: [],
  index: 0,
  responses: [],
  participant: '',
  cohort: 'simulation',
  deficiency: null,
  phase: 'practice',
  shownAt: 0,
};

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTrials(conditions) {
  const trials = [];
  for (const c of conditions) {
    for (let i = 0; i < c.trials; i += 1) {
      trials.push({ ...c, trial: i, practice: false });
    }
  }
  return shuffle(trials);
}

function buildPractice(conditions) {
  const pool = conditions.flatMap((c) => Array.from({ length: c.trials }, () => c));
  return shuffle(pool).slice(0, PRACTICE_TRIALS).map((c, i) => ({ ...c, trial: i, practice: true }));
}

// The simulation cohort sees what a dichromat would see; the clinical cohort
// sees the stimulus directly.
function pairFor(t) {
  return state.cohort === 'clinical'
    ? [t.base_hex, t.variant_hex]
    : [t.base_simulated, t.variant_simulated];
}

function showTrial() {
  const t = state.trials[state.index];
  if (!t) return end();
  const [firstHex, secondHex] = pairFor(t);
  const swap = Math.random() < 0.5;
  const first = swap ? secondHex : firstHex;
  const second = swap ? firstHex : secondHex;
  $('patch-a').style.background = first;
  $('patch-b').style.background = second;
  $('patch-a').dataset.role = swap ? 'variant' : 'base';
  $('patch-b').dataset.role = swap ? 'base' : 'variant';
  $('progress').textContent = `${state.index + 1} / ${state.trials.length}`;
  const cohort = state.cohort === 'clinical' ? `${t.view} (${state.cohort})` : t.view;
  $('condition').textContent = `${t.background} / ${cohort} / ${t.type} / dE ${t.target_deltaE2000}`;
  $('feedback').textContent = '';
  state.shownAt = performance.now();
}

function respond(answer) {
  const t = state.trials[state.index];
  const rt = Math.round(performance.now() - state.shownAt);
  const correct = answer === 'different';
  state.responses.push({
    participant: state.participant,
    cohort: state.cohort,
    deficiency: state.cohort === 'clinical' ? state.deficiency : '',
    phase: state.phase,
    index: state.index,
    background: t.background,
    view: t.view,
    type: t.type,
    target_deltaE2000: t.target_deltaE2000,
    measured_deltaE2000: t.measured_deltaE2000,
    base_hex: t.base_hex,
    variant_hex: t.variant_hex,
    answer,
    correct,
    rt_ms: rt,
  });
  if (t.practice) {
    $('feedback').textContent = correct ? 'Correct.' : 'Not correct: the two patches were different.';
    $('feedback').className = `feedback ${correct ? 'ok' : 'ko'}`;
  }
  state.index += 1;
  if (state.index >= state.trials.length) {
    if (state.phase === 'practice') {
      state.trials = buildTrials(state.conditions);
      state.index = 0;
      state.phase = 'main';
    }
  }
  showTrial();
}

function end() {
  show('end');
  const main = state.responses.filter((r) => r.phase === 'main');
  const correct = main.filter((r) => r.correct).length;
  const total = main.length;
  const meanRt = total ? Math.round(main.reduce((a, r) => a + r.rt_ms, 0) / total) : 0;
  $('summary').textContent = `${correct} of ${total} correct (${Math.round((correct / total) * 100)} %), mean response time ${meanRt} ms.`;
}

function exportCsv() {
  const rows = state.responses.filter((r) => r.phase === 'main');
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(',')].concat(
    rows.map((r) => keys.map((k) => `"${String(r[k]).replaceAll('"', '""')}"`).join(',')),
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lumina-study-${state.participant || 'anon'}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function start() {
  state.participant = $('participant').value.trim();
  state.cohort = $('cohort').value;
  state.deficiency = $('deficiency').value;
  const res = await fetch(STIMULI);
  const data = await res.json();
  state.conditions = state.cohort === 'clinical'
    ? data.conditions.filter((c) => c.view === state.deficiency)
    : data.conditions;
  state.trials = buildPractice(state.conditions);
  state.index = 0;
  state.responses = [];
  state.phase = 'practice';
  show('trial');
  showTrial();
}

$('start').addEventListener('click', start);
$('same').addEventListener('click', () => respond('same'));
$('different').addEventListener('click', () => respond('different'));
$('export').addEventListener('click', exportCsv);
$('restart').addEventListener('click', () => show('start'));
$('cohort').addEventListener('change', (e) => {
  $('deficiency-field').hidden = e.target.value !== 'clinical';
});

document.addEventListener('keydown', (e) => {
  if (screens.trial.hidden) return;
  if (e.key === 's' || e.key === 'S') respond('same');
  if (e.key === 'd' || e.key === 'D') respond('different');
});

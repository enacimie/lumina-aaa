// Emit the pair-matrix appendix (EN/ES) and a replication JSON, faithful to the
// auditor. Shows: the REQUIREMENTS registry (spec strength), the audit policy
// (pair.policy ?? MUST, as lib/audit.js applies it), the effective applicability
// per pair (exempt / exception / reinforced / non-adjacent / theme-exempt /
// scored), and the 15 exclusions with their normative basis. Row number equals
// the pair_id number (theme::NNN uses matrix order). 116 kinds = 111 unique
// colour adjacencies (five pairs appear under two criteria).
import { PAIR_MATRIX, TOKEN_ROLES, POLICY, REQUIREMENTS, REGISTERED_EXCEPTIONS } from '../lib/architecture.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', 'docs', 'paper', 'data', 'pair-matrix.json');
const TEX = join(here, '..', 'envio', 'paper', 'appendix-matrix.tex');
const TEX_ES = join(here, '..', 'envio', 'paper', 'appendix-matrix-es.tex');

const polLabel = (pol) => pol === POLICY.MUST ? 'MUST' : pol === POLICY.SHOULD ? 'SHOULD' : 'MAY';
const auditPolicy = (p) => polLabel(p.policy ?? POLICY.MUST);
const regStrength = (id) => { const r = REQUIREMENTS.find(x => x.id === id); return r ? polLabel(r.strength) : '-'; };
const excSet = new Set(REGISTERED_EXCEPTIONS.filter(e => e.approved).map(e => e.pair));
const applicability = (p) => {
  const key = `${p.foreground}|${p.background}`;
  if (excSet.has(key)) return 'exception';
  if (p.exempt) return 'exempt (n/a)';
  if (p.class === 'non-adjacent') return 'non-adjacent (n/a)';
  if (p.reinforcedBy) return 'reinforced (pass)';
  if (p.exceptThemes?.length) return 'theme-exempt (n/a)';
  return 'scored';
};

const CLASS_SRC = {
  'text': 'SC 1.4.6 (AAA)', 'text-large': 'SC 1.4.6 (AAA)',
  'advisory-text': 'SC 1.4.6 exempt (disabled)', 'non-text': 'SC 1.4.11 (AA)',
  'focus': 'SC 1.4.11 (AA) + 2.4.13 (AAA)', 'non-adjacent': 'LUM-FOC-005 (adjacency)',
  'alias': 'LUM-STA (alias integrity)', 'state-change': 'LUM-STA-002 (design)',
  'distinct': 'LUM-DIS / LUM-IDE (design)', 'cvd': 'LUM-CVD (design)',
};
const ORDER = ['text', 'text-large', 'advisory-text', 'non-text', 'focus', 'non-adjacent', 'alias', 'state-change', 'distinct', 'cvd'];
const counts = {}; for (const p of PAIR_MATRIX) counts[p.class] = (counts[p.class] || 0) + 1;
const uniqAdj = new Set(PAIR_MATRIX.map(p => `${p.foreground}|${p.background}`)).size;

writeFileSync(DATA, JSON.stringify({
  description: 'LUMINA pair matrix, faithful to lib/audit.js. 116 pair kinds = ' + uniqAdj + ' unique colour adjacencies. audit_policy = pair.policy ?? MUST (as the auditor applies it); spec_strength = REQUIREMENTS registry strength; applicability = effective status (exempt/exception/reinforced/non-adjacent/theme-exempt/scored). Thresholds in the class table are WCAG base-profile minimums; the reference palette uses the stricter integral profile.',
  rolesTotal: TOKEN_ROLES.length, pairKinds: PAIR_MATRIX.length, uniqueAdjacencies: uniqAdj,
  requirements: REQUIREMENTS,
  exclusions: { exempt: PAIR_MATRIX.filter(p => p.exempt).map(p => ({ pair: `${p.foreground}|${p.background}`, requirement: p.requirement, note: p.note })),
    themeExempt: PAIR_MATRIX.filter(p => p.exceptThemes?.length).map(p => ({ pair: `${p.foreground}|${p.background}`, themes: p.exceptThemes })),
    nonAdjacent: PAIR_MATRIX.filter(p => p.class === 'non-adjacent').map(p => ({ pair: `${p.foreground}|${p.background}`, note: p.note })),
    registered: REGISTERED_EXCEPTIONS },
  pairs: PAIR_MATRIX.map((p, i) => ({ idx: i + 1, foreground: p.foreground, background: p.background, class: p.class, requirement: p.requirement, audit_policy: auditPolicy(p), spec_strength: regStrength(p.requirement), applicability: applicability(p) })),
}, null, 2));

const esc = (s) => String(s).replace(/_/g, '\\_').replace(/&/g, '\\&').replace(/\./g, '.\\allowbreak ');

function build(lang) {
  const es = lang === 'es';
  const T = es ? {
    sec: 'Matriz de pares y fuentes normativas',
    intro: `El auditor evalúa los ${PAIR_MATRIX.length} tipos de par siguientes sobre los ${TOKEN_ROLES.length} roles obligatorios. Son ${uniqAdj} adyacencias de color únicas: cinco pares aparecen bajo dos criterios. Cada tipo se deriva de un grupo de roles cruzado con el criterio que modela. La Tabla~\\ref{tab:requirements} da el registro de requisitos (fuerza RFC~2119 de la especificación). La Tabla~\\ref{tab:matrix-classes} mapea cada clase a su fuente normativa con los umbrales mínimos WCAG del perfil base; la paleta de referencia usa el perfil integral, más estricto. La Tabla~\\ref{tab:matrix-full} da la política de auditoría (pair.policy ?? MUST, como aplica lib/audit.js), la fuerza de la especificación y la aplicabilidad efectiva por par. La política de auditoría y la fuerza de la especificación son dos capas: p.\\ ej.\\ LUM-STA-003 es SHOULD en la especificación pero se aplica como MUST en la auditoría (integridad del alias). El contraste de texto es AAA (SC~1.4.6); el mínimo no textual y de foco es AA (SC~1.4.11), el mayor nivel aplicable, que la conformidad AAA también exige. El área geométrica de foco de SC~2.4.13 (AAA) es una propiedad CSS fuera del certificado de tokens. Las constantes de diseño (cambio de estado, distinción, DVC) son requisitos LUMINA, no WCAG. El número de fila coincide con el pair\\_id (tema::NNN).`,
    reqcap: 'Registro de requisitos: identificador, área, requisito y fuerza RFC 2119 de la especificación.',
    reqhead: 'ID & Área & Requisito & Fuerza & Perfil',
    clscap: 'Clases de par, fuente normativa y umbral mínimo WCAG (perfil base). La paleta de referencia usa el perfil integral.',
    clshead: 'Clase & Fuente & Umbral mín. & Count',
    fullcap: `Los ${PAIR_MATRIX.length} tipos de par en orden de matriz (el número coincide con el pair\\_id). Política de auditoría, fuerza de especificación y aplicabilidad efectiva.`,
    fullhead: '\\# & Foreground & Background & Clase & Req. & Pol. & Aplic.',
    exccap: 'Siete tipos de par que cubren las 15 exclusiones (12 not applicable + 3 exception), con su base normativa. Sustentan los 0 fallos bloqueantes de la paleta de referencia.',
    exchead: 'Par & Tipo & Base normativa',
    scored: 'scored', exempt: 'exempt (n/a)', nonadj: 'non-adj (n/a)', reinf: 'reinforced', theme: 'theme-exempt', exc: 'exception',
  } : {
    sec: 'Pair Matrix and Normative Sources',
    intro: `The auditor evaluates the ${PAIR_MATRIX.length} pair kinds below over the ${TOKEN_ROLES.length} mandatory roles. They are ${uniqAdj} unique colour adjacencies: five pairs appear under two criteria. Each kind is derived from a role group crossed with the criterion it models. Table~\\ref{tab:requirements} gives the requirements registry (the specification's RFC~2119 strength). Table~\\ref{tab:matrix-classes} maps each class to its normative source with the WCAG base-profile minimum thresholds; the reference palette uses the stricter integral profile. Table~\\ref{tab:matrix-full} gives the audit policy (pair.policy ?? MUST, as lib/audit.js applies it), the specification strength, and the effective applicability per pair. Audit policy and specification strength are two layers: e.g.\\ LUM-STA-003 is SHOULD in the specification but enforced as MUST in the audit (alias integrity). Text contrast is AAA (SC~1.4.6); the non-text and focus minimum is AA (SC~1.4.11), the highest applicable level, which AAA conformance also requires. The geometric focus area of SC~2.4.13 (AAA) is a CSS property outside the token certificate. The design constants (state change, distinctness, CVD) are LUMINA requirements, not WCAG. The row number equals the pair\\_id number (theme::NNN).`,
    reqcap: 'Requirements registry: identifier, area, requirement and specification RFC 2119 strength.',
    reqhead: 'ID & Area & Requirement & Strength & Profile',
    clscap: 'Pair classes, normative source and WCAG minimum threshold (base profile). The reference palette uses the integral profile.',
    clshead: 'Class & Source & Min. threshold & Count',
    fullcap: `The ${PAIR_MATRIX.length} pair kinds in matrix order (the number equals the pair\\_id). Audit policy, specification strength and effective applicability.`,
    fullhead: '\\# & Foreground & Background & Class & Req. & Pol. & Applic.',
    exccap: 'Seven pair kinds covering the 15 exclusions (12 not applicable + 3 exception), with their normative basis. They underpin the reference palette\'s 0 blocking failures.',
    exchead: 'Pair & Type & Normative basis',
    scored: 'scored', exempt: 'exempt (n/a)', nonadj: 'non-adj (n/a)', reinf: 'reinforced', theme: 'theme-exempt', exc: 'exception',
  };
  const appLabel = (p) => { const a = applicability(p); return a === 'scored' ? T.scored : a === 'exempt (n/a)' ? T.exempt : a === 'non-adjacent (n/a)' ? T.nonadj : a === 'reinforced (pass)' ? T.reinf : a === 'theme-exempt (n/a)' ? T.theme : T.exc; };
  let t = (es ? '% Generado por tools/pair-matrix-appendix.mjs. No editar a mano.\n' : '% Auto-generated by tools/pair-matrix-appendix.mjs. Do not edit by hand.\n');
  t += `\\section{${T.sec}}\\label{app:matrix}\n\n${T.intro}\n\n`;

  t += '\\footnotesize\\begin{longtable}{@{}lp{2.3cm}p{5.3cm}cp{2.1cm}@{}}\n\\caption{' + T.reqcap + '}\\label{tab:requirements}\\\\\n';
  t += '\\toprule\n' + T.reqhead + ' \\\\\n\\midrule\n\\endfirsthead\n';
  t += '\\toprule\n' + T.reqhead + ' \\\\\n\\midrule\n\\endhead\n';
  t += '\\bottomrule\n\\endfoot\n';
  for (const r of REQUIREMENTS) t += `${esc(r.id)} & ${esc(r.area)} & ${esc(r.requirement)} & ${polLabel(r.strength)} & ${esc(r.profile)} \\\\\n`;
  t += '\\end{longtable}\n\n';

  t += '\\begin{table}[htbp]\n\\centering\n\\caption{' + T.clscap + '}\n\\label{tab:matrix-classes}\n\\footnotesize\n';
  t += '\\begin{tabular}{@{}lllc@{}}\n\\toprule\n' + T.clshead + ' \\\\\n\\midrule\n';
  const THR = { 'text': 'CR $\\geq$ 7:1', 'text-large': 'CR $\\geq$ 4.5:1', 'advisory-text': 'CR $\\geq$ 3:1', 'non-text': 'CR $\\geq$ 3:1', 'focus': 'CR $\\geq$ 3:1', 'non-adjacent': 'recorded', 'alias': 'equality', 'state-change': '\\dE{} $\\geq$ 5', 'distinct': '\\dE{} $\\geq$ 5', 'cvd': '\\dE{} $\\geq$ 10' };
  for (const c of ORDER) t += `${esc(c)} & ${CLASS_SRC[c]} & ${THR[c]} & ${counts[c] || 0} \\\\\n`;
  t += '\\bottomrule\n\\end{tabular}\n\\end{table}\n\n';

  t += '\\footnotesize\\begin{longtable}{@{}rp{3cm}p{3cm}p{1.7cm}p{2cm}cp{2cm}@{}}\n\\caption{' + T.fullcap + '}\\label{tab:matrix-full}\\\\\n';
  t += '\\toprule\n' + T.fullhead + ' \\\\\n\\midrule\n\\endfirsthead\n';
  t += '\\toprule\n' + T.fullhead + ' \\\\\n\\midrule\n\\endhead\n';
  t += '\\bottomrule\n\\endfoot\n';
  PAIR_MATRIX.forEach((p, i) => { t += `${i + 1} & ${esc(p.foreground)} & ${esc(p.background)} & ${esc(p.class)} & ${esc(p.requirement)} & ${auditPolicy(p)} & ${appLabel(p)} \\\\\n`; });
  t += '\\end{longtable}\n\n';

  t += '\\begin{table}[htbp]\n\\centering\n\\caption{' + T.exccap + '}\n\\label{tab:exclusions}\n\\footnotesize\n';
  t += '\\begin{tabular}{@{}llp{6.3cm}@{}}\n\\toprule\n' + T.exchead + ' \\\\\n\\midrule\n';
  for (const p of PAIR_MATRIX.filter(p => p.exempt)) t += `${esc(p.foreground)} / ${esc(p.background)} & ${T.exempt} & ${esc(p.note).replace('under section 1', 'under specification section 1 (SC 1.4.11 incidental exemption)')} \\\\\n`;
  for (const p of PAIR_MATRIX.filter(p => p.class === 'non-adjacent')) t += `${esc(p.foreground)} / ${esc(p.background)} & ${T.nonadj} & ${esc(p.note)} \\\\\n`;
  for (const p of PAIR_MATRIX.filter(p => p.exceptThemes?.length)) {
    const basis = p.foreground.startsWith('chart.')
      ? (es ? 'jerarquía de superficie de gráfica en el tema contrast (sección 10.4 de la especificación)' : 'chart surface hierarchy in the contrast theme (specification section 10.4)')
      : (es ? 'jerarquía de superficies expresada con bordes en el tema contrast (sección 10.4 de la especificación)' : 'surface hierarchy expressed with borders in the contrast theme (specification section 10.4)');
    t += `${esc(p.foreground)} / ${esc(p.background)} & ${T.theme} & ${basis} \\\\\n`;
  }
  for (const e of REGISTERED_EXCEPTIONS) t += `${esc(e.pair.replace('|', ' / '))} & ${T.exc} & ${esc(e.reason)} \\\\\n`;
  t += '\\bottomrule\n\\end{tabular}\n\\end{table}\n';
  return t;
}

writeFileSync(TEX, build('en'));
writeFileSync(TEX_ES, build('es'));
console.log('appendix written; pair kinds', PAIR_MATRIX.length, 'unique adjacencies', uniqAdj, 'requirements', REQUIREMENTS.length);

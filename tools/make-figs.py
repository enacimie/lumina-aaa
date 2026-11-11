#!/usr/bin/env python3
"""Renders the paper's four figures from docs/paper/data/figs.json (live library data)."""
import json, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(HERE, '..', 'docs', 'paper', 'data', 'figs.json')))
OUT = os.path.join(HERE, '..', 'docs', 'paper', 'figs')
os.makedirs(OUT, exist_ok=True)

THEME_LABELS = [('light', 'Light'), ('dark', 'Dark'), ('contrast', 'Contrast')]


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def fig_palette():
    order = DATA['roleOrder']
    fig, axes = plt.subplots(1, 3, figsize=(5.4, 8.4))
    for ax, (theme, label) in zip(axes, THEME_LABELS):
        vals = DATA['themes'][theme]
        for y, role in enumerate(order):
            ax.add_patch(mpatches.Rectangle((0, len(order) - 1 - y), 1, 1,
                          facecolor=hex_to_rgb(vals[role]), edgecolor='none'))
        ax.set_xlim(0, 1); ax.set_ylim(0, len(order))
        ax.set_title(label, fontsize=9)
        ax.set_xticks([]); ax.set_yticks([])
        for s in ax.spines.values():
            s.set_visible(False)
    axes[0].set_yticks([len(order) - 0.5 - y for y in range(len(order))])
    axes[0].set_yticklabels(order, fontsize=4.6, family='monospace')
    fig.suptitle('Reference palette: %d roles x 3 themes (brand #1E40AF, Integral)' % DATA['roles'], fontsize=9)
    fig.tight_layout(rect=[0.06, 0, 1, 0.97])
    fig.savefig(os.path.join(OUT, 'fig-palette.pdf'), metadata={'CreationDate': None, 'ModDate': None})
    plt.close(fig)


def fig_focus():
    fig, axes = plt.subplots(1, 3, figsize=(7.2, 2.2))
    for ax, (theme, label) in zip(axes, THEME_LABELS):
        d = DATA['focusDemo'][theme]
        ax.set_facecolor(hex_to_rgb(d['page']))
        ax.add_patch(mpatches.Rectangle((0.16, 0.30), 0.68, 0.40, facecolor=hex_to_rgb(d['ring'])))
        ax.add_patch(mpatches.Rectangle((0.20, 0.34), 0.60, 0.32, facecolor=hex_to_rgb(d['inner'])))
        ax.add_patch(mpatches.Rectangle((0.26, 0.38), 0.48, 0.24, facecolor=hex_to_rgb(d['fill'])))
        ax.text(0.5, 0.5, 'Button', ha='center', va='center', fontsize=9, color=hex_to_rgb(d['text']))
        ax.set_title(label + ' theme', fontsize=9)
        ax.set_xticks([]); ax.set_yticks([])
        for s in ax.spines.values():
            s.set_edgecolor(hex_to_rgb(d['page']))
    fig.suptitle('Double-ring focus model: outer ring vs page, inner ring vs fill and outer ring', fontsize=9)
    fig.tight_layout(rect=[0, 0, 1, 0.88])
    fig.savefig(os.path.join(OUT, 'fig-focus.pdf'), metadata={'CreationDate': None, 'ModDate': None})
    plt.close(fig)


def line_chart(ax, series, bg, title):
    ax.set_facecolor(hex_to_rgb(bg))
    markers = ['o', 's', '^', 'D', 'v', 'x']
    for i, c in enumerate(series):
        xs = list(range(len(c)))
        ys = [v + i * 0.35 for v in [2.2 - 0.25 * x for x in xs]]
        ax.plot(xs, ys, color=hex_to_rgb(c), linewidth=2.0,
                marker=markers[i], markersize=4.5,
                markerfacecolor=hex_to_rgb(c), markeredgecolor=hex_to_rgb(c))
    ax.set_title(title, fontsize=9)
    ax.set_xticks([]); ax.set_yticks([])


def fig_cvd():
    titles = [('normal', 'Normal vision'), ('deuteranopia', 'Deuteranopia'),
              ('protanopia', 'Protanopia'), ('tritanopia', 'Tritanopia')]
    fig, axes = plt.subplots(1, 4, figsize=(10.4, 2.5), sharey=True)
    for ax, (view, label) in zip(axes, titles):
        line_chart(ax, DATA['chart']['simulated']['lumina'][view], DATA['chart']['background'], label)
    fig.suptitle('LUMINA chart series under the three CVD simulations (min pairwise DeltaE2000 >= 11.1 in all views)', fontsize=9)
    fig.tight_layout(rect=[0, 0, 1, 0.87])
    fig.savefig(os.path.join(OUT, 'fig-cvd.pdf'), metadata={'CreationDate': None, 'ModDate': None})
    plt.close(fig)


def fig_baseline():
    titles = [('normal', 'Normal'), ('deuteranopia', 'Deuteranopia'),
              ('protanopia', 'Protanopia'), ('tritanopia', 'Tritanopia')]
    fig, axes = plt.subplots(2, 4, figsize=(10.8, 3.0))
    for row, (key, name) in enumerate([('lumina', 'LUMINA solver'), ('golden', 'Golden-angle baseline')]):
        for col, (view, label) in enumerate(titles):
            ax = axes[row][col]
            series = DATA['chart']['simulated'][key][view]
            ax.set_facecolor(hex_to_rgb(DATA['chart']['background']))
            for i, c in enumerate(series):
                ax.add_patch(mpatches.Rectangle((i, 0), 0.9, 1, facecolor=hex_to_rgb(c), edgecolor='none'))
            ax.set_xlim(0, 6); ax.set_ylim(0, 1)
            ax.set_xticks([]); ax.set_yticks([])
            for s in ax.spines.values():
                s.set_visible(False)
            if row == 0:
                ax.set_title(label, fontsize=9)
        fig.text(0.004, 0.62 - row * 0.38, name, fontsize=8, rotation=90, ha='left', va='center')
    fig.suptitle('Same lightness and chroma budget: the golden-angle baseline collapses under deuteranopia (min DeltaE2000 0.72 to 2.12)', fontsize=9)
    fig.tight_layout(rect=[0.025, 0, 1, 0.86])
    fig.savefig(os.path.join(OUT, 'fig-baseline.pdf'), metadata={'CreationDate': None, 'ModDate': None})
    plt.close(fig)


fig_palette()
fig_focus()
fig_cvd()
fig_baseline()
print('figures written to docs/paper/figs/')

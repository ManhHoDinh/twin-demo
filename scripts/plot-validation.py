"""Render local validation figures from exported predictions; never invent observations."""
import argparse
import csv
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

parser = argparse.ArgumentParser()
parser.add_argument('directory', nargs='?', default='artifacts/local-ai')
args = parser.parse_args()
folder = Path(args.directory)
report = json.loads((folder / 'validation.json').read_text(encoding='utf-8'))
with (folder / 'predictions.csv').open(encoding='utf-8', newline='') as source:
    rows = [row for row in csv.DictReader(source) if row['split'] == 'test']
if not rows:
    raise ValueError('No held-out test predictions')
observed = [float(r['observed_m3s']) for r in rows]
predicted = [float(r['predicted_m3s']) for r in rows]
fig, axes = plt.subplots(1, 3, figsize=(14, 4), layout='constrained')
axes[0].plot(observed, label='Observed fixture target')
axes[0].plot(predicted, label='LSTM prediction')
axes[0].set(xlabel='Held-out sample', ylabel='Window mean discharge (m³/s)', title='Test hydrograph')
axes[0].legend(fontsize=8)
axes[1].scatter(observed, predicted, s=12)
bound = max(observed + predicted)
axes[1].plot([0, bound], [0, bound], '--', color='gray')
axes[1].set(xlabel='Observed fixture target (m³/s)', ylabel='Predicted (m³/s)', title='Test agreement')
axes[2].plot(report['history']['train'], label='Train')
axes[2].plot(report['history']['val'], label='Validation')
axes[2].set(xlabel='Epoch', ylabel='Log discharge MSE', title='Optimization history')
axes[2].legend()
provenance = 'SYNTHETIC' if report['metadata'].get('synthetic') else 'USER-SUPPLIED / UNVERIFIED'
fig.suptitle(f'{provenance} — local baseline experiment; no field validation or hydraulic benchmark')
for extension in ['png', 'svg']:
    fig.savefig(folder / f'validation-figures.{extension}', dpi=160)
plt.close(fig)
print(f'Figures written to {folder.resolve()}')

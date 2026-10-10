"""Local inference API. No external services. Optional schema-2 hourly LSTM artifact
via FLOODTWIN_MODEL_PATH; default is an uncalibrated conservative tank ensemble.
"""
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from flask import Flask, jsonify, request
from werkzeug.exceptions import BadRequest, UnsupportedMediaType

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
GAUGES = {
    'aiNghia': {'bd': [6.5, 8.0, 9.0], 'base': 3.2, 'a': .5, 'b': .3},
    'cauLau': {'bd': [2.0, 3.0, 4.0], 'base': .7, 'a': .4, 'b': .35},
    'giaoThuy': {'bd': [6.2, 7.7, 8.8], 'base': 2.6, 'a': .55, 'b': .28},
    'camLe': {'bd': [1.0, 1.7, 2.5], 'base': .4, 'a': .3, 'b': .4},
}


def horizon_value(value):
    if type(value) is not int or not 1 <= value <= 168:
        raise ValueError('horizon must be an integer between 1 and 168 hours')
    return value


def validate_forcing(forcing):
    if not isinstance(forcing, dict):
        raise ValueError('forcing must be an object')
    rain = forcing.get('precipitation')
    if not isinstance(rain, list) or not 1 <= len(rain) <= 8760:
        raise ValueError('precipitation must contain 1..8760 hourly values in mm')
    columns = []
    for name, default in zip(['precipitation', 'temperature', 'humidity', 'radiation', 'wind'], [None, 28, .75, 200, 2]):
        values = forcing.get(name, [default] * len(rain))
        if not isinstance(values, list) or len(values) != len(rain):
            raise ValueError(f'{name} must align with precipitation')
        if any(type(v) not in (int, float) or not math.isfinite(v) for v in values):
            raise ValueError(f'{name} must contain finite numbers')
        columns.append(values)
    if any(v < 0 or v > 1000 for v in rain):
        raise ValueError('precipitation must be between 0 and 1000 mm per hour')
    if any(v < 0 or v > 1 for v in columns[2]):
        raise ValueError('humidity must be a fraction between 0 and 1')
    if any(v < 0 for col in columns[3:] for v in col):
        raise ValueError('radiation and wind must be non-negative')
    if forcing.get('step_hours', 1) != 1:
        raise ValueError('API forcing resolution must be hourly')
    # Tank state must incorporate all supplied history; the LSTM slices its own
    # declared sequence length after validation.
    return np.asarray(columns, dtype=float).T


class FloodPredictor:
    def __init__(self, artifact_path=None):
        self.artifact = None
        self.weights = None
        if artifact_path:
            data = json.loads(Path(artifact_path).read_text(encoding='utf-8'))
            if (data.get('schemaVersion') != 2 or data.get('architecture') != 'lstm-baseline'
                    or data.get('outputTransform') != 'log1p-m3s'
                    or data.get('metadata', {}).get('stepHours') != 1
                    or data.get('metadata', {}).get('targetHorizonSteps') != 1):
                raise ValueError('Expected schema-2 hourly lstm-baseline artifact trained for one-hour targets')
            length = data.get('metadata', {}).get('sequenceLength')
            if type(length) is not int or not 1 <= length <= 168:
                raise ValueError('Artifact sequenceLength must be 1..168 hourly steps')
            config = data.get('config', {})
            size = config.get('hiddenSize')
            if type(size) is not int or not 1 <= size <= 256 or config.get('inputSize') != 5:
                raise ValueError('Invalid model dimensions')
            shapes = {'readout': (size,), 'bias': ()}
            for gate in 'ifgo':
                shapes.update({f'Wx{gate}': (size, 5), f'Wh{gate}': (size, size), f'b{gate}': (size,)})
            weights = {}
            for name, shape in shapes.items():
                v = np.asarray(data.get('weights', {}).get(name), dtype=float)
                if v.shape != shape or not np.isfinite(v).all():
                    raise ValueError(f'Invalid weight: {name}')
                weights[name] = v
            self.weights, self.artifact = weights, data

    @property
    def model_info(self):
        return {'architecture': 'lstm-baseline' if self.weights else 'conservative-tank-ensemble',
                'version': '2.0.0', 'calibrated_intervals': False,
                'provenance': self.artifact.get('metadata', {}) if self.artifact else
                {'source': 'synthetic parameter sensitivity; not calibrated gauge forecasts'},
                'rainfall_forecast': 'hourly persistence with 0.8 decay per hour',
                'stage_relation': 'assumed power law; not a surveyed rating curve'}

    def lstm(self, sequence):
        w = self.weights
        h = np.zeros(len(w['readout']))
        c = np.zeros_like(h)
        for row in sequence:
            x = np.array([np.log1p(max(0, row[0])) / 5, row[1] / 30, row[2], row[3] / 250, row[4] / 5])
            gates = {}
            for g in 'ifgo':
                z = w[f'Wx{g}'] @ x + w[f'Wh{g}'] @ h + w[f'b{g}']
                gates[g] = np.tanh(z) if g == 'g' else 1 / (1 + np.exp(-np.clip(z, -40, 40)))
            c = gates['f'] * c + gates['i'] * gates['g']
            h = gates['o'] * np.tanh(c)
        z = float(w['readout'] @ h + w['bias'])
        log_q = max(z, 0) + math.log1p(math.exp(-abs(z)))
        if log_q > 30:
            raise ValueError('Model output exceeds supported physical range')
        return math.expm1(log_q)

    @staticmethod
    def tank_step(storage, rain, rates):
        before = sum(storage)
        surface, sub, ground = storage
        surface += rain
        evaporation = min(surface, .1)
        surface -= evaporation
        infiltration = surface * .1
        surface -= infiltration
        sub += infiltration
        percolation = sub * .05
        sub -= percolation
        ground += percolation
        flux = np.asarray([surface, sub, ground]) * rates
        after = np.asarray([surface, sub, ground]) - flux
        residual = before + rain - evaporation - float(sum(flux)) - float(sum(after))
        return after, float(sum(flux)) * 5100 * 1000 / 3600, residual

    def predict(self, forcing, horizon=48, gauge_id='aiNghia'):
        horizon = horizon_value(horizon)
        if gauge_id not in GAUGES:
            raise ValueError('Unknown gauge_id')
        if self.artifact and self.artifact.get('metadata', {}).get('gaugeId', gauge_id) != gauge_id:
            raise ValueError('Loaded model was trained for a different gauge')
        sequence = validate_forcing(forcing)
        member_predictions = []
        storage_now, storage_end, residual_max = None, None, 0.
        if self.weights:
            length = self.artifact['metadata']['sequenceLength']
            if len(sequence) < length:
                raise ValueError('Insufficient hourly forcing history for loaded artifact')
            sequence = sequence[-length:]
            values = []
            for t in range(horizon):
                values.append(self.lstm(sequence))
                future = sequence[-1].copy()
                future[0] *= .8
                sequence = np.vstack([sequence[1:], future])
            member_predictions = np.asarray([values])
        else:
            for factor in np.linspace(.8, 1.2, 10):
                rates = np.array([.28, .12, .025]) * factor
                storage = np.zeros(3)
                for rain in sequence[:, 0]:
                    storage, _, residual = self.tank_step(storage, rain, rates)
                    residual_max = max(residual_max, abs(residual))
                if storage_now is None:
                    storage_now = storage.copy()
                values = []
                for t in range(horizon):
                    storage, q, residual = self.tank_step(storage, sequence[-1, 0] * .8 ** (t + 1), rates)
                    residual_max = max(residual_max, abs(residual))
                    values.append(q)
                if storage_end is None:
                    storage_end = storage.copy()
                member_predictions.append(values)
            member_predictions = np.asarray(member_predictions)
        gauge = GAUGES[gauge_id]
        stages = gauge['base'] + gauge['a'] * member_predictions ** gauge['b']
        predictions = []
        for t in range(horizon):
            low, median, high = np.quantile(member_predictions[:, t], [.05, .5, .95])
            predictions.append({'horizon': t + 1, 'discharge': float(median),
                                'q05': float(low), 'q95': float(high),
                                'lower_95': float(low), 'upper_95': float(high),
                                'stage': float(np.median(stages[:, t])),
                                'probability_alert_3': float(np.mean(stages[:, t] >= gauge['bd'][2]))
                                if len(stages) > 1 else None})
        return {'gauge_id': gauge_id, 'predictions': predictions,
                'current_storage': dict(zip(['surface', 'subsurface', 'groundwater'], storage_now.tolist())) if storage_now is not None else None,
                'forecast_end_storage': storage_end.tolist() if storage_end is not None else None,
                'storage_units': 'mm over assumed 5100 km² basin', 'mass_residual_mm': residual_max,
                'interval_semantics': '5th/95th parameter ensemble percentiles; uncalibrated; single model has no uncertainty estimate',
                'member_peak_stages': np.max(stages, axis=1).tolist(), 'model_info': self.model_info}

    def assess_risk(self, gauge_id, forcing, horizon=48):
        result = self.predict(forcing, horizon, gauge_id)
        peaks = np.asarray(result['member_peak_stages'])
        bd = GAUGES[gauge_id]['bd']
        expected = float(np.median(peaks))
        level = sum(expected >= v for v in bd)
        return {'gauge_id': gauge_id, 'risk_level': ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'][level],
                'peak_stage': {**dict(zip(['lower_95', 'expected', 'upper_95'], np.quantile(peaks, [.05, .5, .95]).tolist())),
                               'q05': float(np.quantile(peaks, .05)), 'q95': float(np.quantile(peaks, .95))},
                'interval_semantics': 'q05..q95: central 90% parameter sensitivity; legacy *_95 aliases are not confidence bounds',
                'thresholds': dict(zip(['alert1', 'alert2', 'alert3'], bd)),
                'alert_probabilities': {f'alert{i + 1}': float(np.mean(peaks >= v)) if len(peaks) > 1 else None for i, v in enumerate(bd)},
                'probability_units': 'fraction 0..1; parameter sensitivity, uncalibrated',
                'horizon_hours': horizon, 'model_info': self.model_info}


predictor = FloodPredictor(os.environ.get('FLOODTWIN_MODEL_PATH'))


@app.errorhandler(ValueError)
@app.errorhandler(BadRequest)
@app.errorhandler(UnsupportedMediaType)
def invalid_request(error):
    return jsonify({'error': str(error)}), 400


def body():
    data = request.get_json()
    if not isinstance(data, dict):
        raise ValueError('Expected a JSON object')
    return data


@app.get('/health')
def health():
    return jsonify({'status': 'healthy', 'model_info': predictor.model_info,
                    'timestamp': datetime.now(timezone.utc).isoformat()})


@app.post('/predict')
def predict():
    data = body()
    return jsonify(predictor.predict(data.get('forcing'), data.get('horizon', 48), data.get('gauge_id', 'aiNghia')))


@app.post('/assess-risk')
def assess_risk():
    data = body()
    return jsonify(predictor.assess_risk(data.get('gauge_id'), data.get('forcing'), data.get('horizon', 48)))


@app.post('/batch-predict')
def batch_predict():
    data = body()
    gauges = data.get('gauges')
    if not isinstance(gauges, list) or not 1 <= len(gauges) <= 20 or any(not isinstance(g, dict) for g in gauges):
        raise ValueError('gauges must contain 1..20 objects')
    horizon = horizon_value(data.get('horizon', 48))
    results = [predictor.predict(g.get('forcing'), horizon, g.get('gauge_id')) for g in gauges]
    return jsonify({'predictions': results})


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=False)

"""API contracts, mass balance, and browser/Python model parity (no network)."""
import importlib.util
import json
import math
import subprocess
import tempfile
import unittest
import threading
import urllib.request
from werkzeug.serving import make_server
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('api', ROOT / 'scripts/api_server.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class APITests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()

    def test_invalid_inputs(self):
        invalid = [None, {}, {'forcing': {}}, {'forcing': {'precipitation': []}},
                   {'forcing': {'precipitation': [None]}}, {'forcing': {'precipitation': [-1]}},
                   {'forcing': {'precipitation': [True]}}, {'forcing': {'precipitation': [float('nan')]}},
                   {'forcing': {'precipitation': [1], 'temperature': []}}]
        for body in invalid:
            with self.subTest(body=body):
                self.assertEqual(self.client.post('/predict', json=body).status_code, 400)
        for value in [-1, 0, 169, 1.5, True, '48', None]:
            self.assertEqual(self.client.post('/predict', json={'forcing': {'precipitation': [1]}, 'horizon': value}).status_code, 400)

    def test_intervals_and_mass(self):
        history = api.predictor.predict({'precipitation': [100] + [0] * 168}, 1)
        self.assertGreater(sum(history['current_storage'].values()), 0)
        response = self.client.post('/predict', json={'forcing': {'precipitation': [10] * 168}, 'horizon': 48})
        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertEqual(len(result['predictions']), 48)
        self.assertLess(result['mass_residual_mm'], 1e-9)
        self.assertNotEqual(list(result['current_storage'].values()), result['forecast_end_storage'])
        for row in result['predictions']:
            self.assertTrue(0 <= row['lower_95'] <= row['discharge'] <= row['upper_95'])
            self.assertTrue(all(v is None or math.isfinite(v) for v in row.values()))
        self.assertFalse(result['model_info']['calibrated_intervals'])

    def test_risk_uses_forcing_and_gauge_contract(self):
        for gauge in api.GAUGES:
            response = self.client.post('/assess-risk', json={'gauge_id': gauge, 'forcing': {'precipitation': [0]}})
            self.assertEqual(response.status_code, 200)
            result = response.get_json()
            self.assertEqual(list(result['thresholds'][f'alert{i}'] for i in [1, 2, 3]), api.GAUGES[gauge]['bd'])
            self.assertEqual(result['alert_probabilities']['alert3'], 0)
        dry = api.predictor.assess_risk('aiNghia', {'precipitation': [0]})
        wet = api.predictor.assess_risk('aiNghia', {'precipitation': [100] * 100})
        self.assertGreater(wet['peak_stage']['expected'], dry['peak_stage']['expected'])
        self.assertEqual(self.client.post('/assess-risk', json={'gauge_id': 'bad', 'forcing': {'precipitation': [1]}}).status_code, 400)

    def test_loopback_http_transport(self):
        server = make_server('127.0.0.1', 0, api.app)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            address = f'http://127.0.0.1:{server.server_port}'
            with urllib.request.urlopen(address + '/health', timeout=5) as response:
                self.assertEqual(json.load(response)['status'], 'healthy')
            payload = json.dumps({'forcing': {'precipitation': [1, 2]}, 'horizon': 2}).encode()
            request = urllib.request.Request(address + '/predict', data=payload, headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(request, timeout=5) as response:
                self.assertEqual(len(json.load(response)['predictions']), 2)
        finally:
            server.shutdown(); thread.join(timeout=5); server.server_close()

    def test_batch_atomic_validation(self):
        self.assertEqual(self.client.post('/batch-predict', json={'gauges': []}).status_code, 400)
        good = {'gauge_id': 'camLe', 'forcing': {'precipitation': [1]}}
        self.assertEqual(self.client.post('/batch-predict', json={'gauges': [good], 'horizon': 2}).status_code, 200)
        self.assertEqual(self.client.post('/batch-predict', json={'gauges': [good, {}]}).status_code, 400)

    def test_training_export_and_python_parity(self):
        with tempfile.TemporaryDirectory() as folder:
            run = subprocess.run(['node', str(ROOT / 'scripts/run-phase2.cjs'), '--epochs', '2', '--output', folder],
                                 cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            model = api.FloodPredictor(Path(folder) / 'model.json')
            fixture = json.loads((Path(folder) / 'parity.json').read_text())
            self.assertAlmostEqual(model.lstm(api.np.array(fixture['input'])), fixture['expectedDischarge'], places=8)
            forcing = {name: [row[i] for row in fixture['input']] for i, name in enumerate(['precipitation', 'temperature', 'humidity', 'radiation', 'wind'])}
            served = model.predict(forcing, 2, 'aiNghia')
            self.assertAlmostEqual(served['predictions'][0]['discharge'], fixture['expectedDischarge'], places=8)
            with self.assertRaises(ValueError):
                model.predict({'precipitation': [1]}, 1, 'aiNghia')
            report = json.loads((Path(folder) / 'validation.json').read_text())
            self.assertTrue(report['metadata']['synthetic'])
            self.assertFalse(report['claims']['realDataValidation'])
            self.assertLess(report['metadata']['trainingPeriod'][1], report['metadata']['validationPeriod'][0])
            self.assertLess(report['metadata']['validationPeriod'][1], report['metadata']['testPeriod'][0])


if __name__ == '__main__':
    unittest.main(verbosity=2)

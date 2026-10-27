"""Integrity and Java integration checks for snapshot screening; no network."""
from datetime import date, timedelta
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from screen import compile_engine, find_fastjson, prepare_security, read_results


class EligibilityTests(unittest.TestCase):
    def rows(self, count=25, last_date="2026-10-26"):
        end = date.fromisoformat(last_date)
        return [{"trade_date": str(end - timedelta(days=count-i-1)), "qfq_open": 10, "qfq_close": 10,
                 "qfq_high": 11, "qfq_low": 9, "raw_close": 10, "volume_shares": 100} for i in range(count)]

    def check(self, rows, name="sample", exclude_st=False):
        return prepare_security({"symbol": "sz000001", "name": name, "exchange": "sz"}, rows, "2026-10-26", exclude_st)

    def test_old_bars_cannot_become_a_current_day_buy_point(self):
        request, excluded = self.check(self.rows(last_date="2026-10-23"))
        self.assertIsNone(request)
        self.assertEqual(excluded["reason"], "STALE_OR_MISSING_DATA")

    def test_new_listing_needs_previous_ma20_and_st_filter_is_explicit(self):
        self.assertEqual(self.check(self.rows(count=20))[1]["reason"], "INSUFFICIENT_HISTORY")
        request, excluded = self.check(self.rows(), "*ST样本")
        self.assertIsNone(excluded)
        self.assertTrue(request["isST"])
        self.assertEqual(self.check(self.rows(), "*ST样本", True)[1]["reason"], "ST_FILTER")

    def test_missing_engine_rows_are_fatal(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "output.jsonl"
            path.write_text("", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Missing engine results"):
                read_results(path, {"sz000001"})


class JavaEngineIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.classpath = compile_engine(Path(cls.temporary.name), find_fastjson())

    def request(self, closes, volume):
        first = date(2026, 8, 1)
        return {"symbol": "sz000001", "name": "boundary fixture", "exchange": "sz", "isST": False,
            "rawClose": closes[-1], "bars": [
                {"date": str(first + timedelta(days=i)), "open": close, "high": close, "low": close,
                 "close": close, "volume": volume if i == len(closes)-1 else 10000}
                for i, close in enumerate(closes)]}

    def test_production_builder_volume_boundary_and_flat_trend_gate(self):
        crossing = [10] * 35 + [9] * 5 + [15]
        flat_crossing = [10] * 20 + [15] + [10] * 14 + [9] * 5 + [15]
        inputs = [self.request(crossing, 15000), self.request(crossing, 14999), self.request(flat_crossing, 15000)]
        process = subprocess.run([shutil.which("java"), "-cp", self.classpath, "StockHistoryScreen"],
            input="".join(json.dumps(row) + "\n" for row in inputs), encoding="utf-8", capture_output=True, check=True)
        accepted, weak, flat = [json.loads(line) for line in process.stdout.splitlines()]
        self.assertEqual(accepted["signals"], ["BUY_GOLDEN_CROSS"])
        self.assertEqual(accepted["ma20"], 10.0)
        self.assertEqual(accepted["strategyReport"]["buyPointStep"]["goldenCross"]["status"], "SATISFIED")
        self.assertTrue(accepted["strategyReport"]["buyPointStep"]["items"][0]["evidence"])
        self.assertEqual(weak["signals"], [])
        self.assertEqual(weak["strategyReport"]["buyPointStep"]["goldenCross"]["status"], "NOT_SATISFIED")
        self.assertEqual(flat["strategyReport"]["trendStep"]["conclusion"], "FLAT")
        self.assertEqual(flat["signals"], [])
        self.assertEqual(flat["strategyReport"]["buyPointStep"]["goldenCross"]["status"], "SKIPPED")


if __name__ == "__main__":
    unittest.main()

"""Data integrity tests; no network requests are made."""
from datetime import date
from pathlib import Path
import sqlite3
import tempfile
import unittest

from download import connect, parse_bars, save_security, summary


class HistoryIntegrityTests(unittest.TestCase):
    def payload(self, rows, key="qfqday"):
        return {"code": 0, "data": {"sz000001": {key: rows}}}

    def parse(self, rows, key="qfqday"):
        return parse_bars(self.payload(rows, key), "sz000001", "qfq", date(2025, 10, 27), date(2026, 10, 26))

    def test_filters_ignored_dates_and_converts_fractional_lots_to_shares(self):
        result = self.parse([
            ["2025-10-26", "10", "11", "12", "9", "1"],
            ["2025-10-27", "10", "11", "12", "9", "123.45"],
            ["2026-10-27", "10", "11", "12", "9", "1"],
        ])
        self.assertEqual(result, {"2025-10-27": (10, 12, 9, 11, 12345)})

    def test_day_fallback_for_no_corporate_actions(self):
        self.assertEqual(len(self.parse([["2026-10-26", "10", "11", "12", "9", "2"]], "day")), 1)

    def test_rejects_invalid_prices_volumes_and_conflicting_duplicate_dates(self):
        for values in (("nan", "11", "12", "9", "2"), ("10", "15", "12", "9", "2"),
                       ("10", "11", "12", "9", "-2"), ("10", "11", "12", "9", "0.001")):
            with self.subTest(values=values), self.assertRaises(ValueError):
                self.parse([["2026-10-26", *values]])
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            self.parse([["2026-10-26", "10", "11", "12", "9", "2"],
                        ["2026-10-26", "10", "11", "12", "9", "3"]])

    def test_empty_response_never_counts_as_success(self):
        with self.assertRaisesRegex(ValueError, "No qfq bars"):
            self.parse([])

    def test_storage_is_atomic_and_rerun_does_not_duplicate_bars(self):
        with tempfile.TemporaryDirectory() as temporary:
            db = connect(Path(temporary) / "history.sqlite3")
            self.add_batch(db)
            bars = [("2026-10-26", 10, 12, 9, 11, 9, 11, 8, 10, 12345)]
            save_security(db, "test", "sz000001", bars, {"raw": "raw-hash", "qfq": "qfq-hash"})
            save_security(db, "test", "sz000001", bars, {"raw": "raw-hash", "qfq": "qfq-hash"})
            self.assertEqual(db.execute("SELECT count(*) FROM daily_bars").fetchone()[0], 1)
            self.assertEqual(summary(db, "test")["counts"], {"pending": 0, "complete": 1, "error": 0})
            with self.assertRaises(sqlite3.IntegrityError):
                save_security(db, "test", "sz000001", [bars[0], bars[0]], {"raw": "x", "qfq": "y"})
            self.assertEqual(db.execute("SELECT count(*) FROM daily_bars").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT raw_sha256 FROM securities").fetchone()[0], "raw-hash")
            db.close()

    @staticmethod
    def add_batch(db):
        with db:
            db.execute("INSERT INTO batches VALUES ('test','2025-10-27','2026-10-26','now','now','pending','test',1)")
            db.execute("INSERT INTO securities(batch_id,symbol,code,exchange,name) VALUES ('test','sz000001','000001','sz','sample')")


if __name__ == "__main__":
    unittest.main()

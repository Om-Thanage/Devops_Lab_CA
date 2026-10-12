import unittest
from scripts.resilience_gate import summarize


class GateSummaryTest(unittest.TestCase):
    def test_counts_and_longest_outage(self):
        summary = summarize([(0, True), (1, False), (2, True),
                             (3, False), (4, False), (6, True)])
        self.assertEqual(summary['availability_percent'], 50)
        self.assertEqual(summary['failed'], 3)
        self.assertEqual(summary['recovery_seconds'], 3)

    def test_unrecovered_outage(self):
        self.assertIsNone(summarize([(0, True), (1, False)])['recovery_seconds'])


if __name__ == '__main__':
    unittest.main()

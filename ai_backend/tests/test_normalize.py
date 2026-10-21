import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from normalize import (
    extract_company_from_tab_name,
    normalize_company_name,
    quick_normalize_status,
)


class CompanyExtractionTests(unittest.TestCase):
    def test_tab_noise_and_legal_suffix(self):
        cases = {
            "IPE Production Worker IV": "IPE",
            "PSA IV List 2026": "PSA",
            "EPG Open IV": "EPG",
            "Santak": "Santak",
            "GSP JUL2026": "GSP",
            "Waveplus (JUL2026)": "Waveplus",
            "Copy of GAA 2026": "GAA",
            "ABC Tech Sdn Bhd": "ABC Tech",
        }
        for raw, expected in cases.items():
            self.assertEqual(extract_company_from_tab_name(raw), expected, raw)

    def test_normalize_alias_case(self):
        self.assertEqual(normalize_company_name("gsp"), "GSP")
        self.assertEqual(normalize_company_name("santak"), "Santak")


class InterviewStatusTests(unittest.TestCase):
    def test_plain_attend_is_deterministic(self):
        status, deterministic = quick_normalize_status("Attend")
        self.assertEqual(status, "attended")
        self.assertTrue(deterministic)

    def test_heavy_rain_not_attend_is_not_misclassified(self):
        status, deterministic = quick_normalize_status("Heavy rain not attend")
        self.assertEqual(status, "pending")
        self.assertFalse(deterministic)

    def test_no_show_phrase(self):
        status, deterministic = quick_normalize_status("no show")
        self.assertEqual(status, "no_show")
        self.assertTrue(deterministic)


if __name__ == "__main__":
    unittest.main()

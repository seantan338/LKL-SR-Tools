import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.job_order_sheet import (
    detect_job_order_columns,
    find_existing_job_order,
    job_order_sheet_key,
    map_sheet_rows_to_job_orders,
    normalize_job_order_status,
    parse_sheet_timestamp,
)

# Header row of "Job Order 2026" > Database
HEADERS = ["Company Name", "Status", "Job Title", "Company Background", "Location", "Salary Range", "Working Day",
           "Working Hours", "Preferred Gender", "Race", "Requirement/Skill Set", "Benefit / Allowance",
           "Person In Charge", "Time of Updated", "Commission Range", "content", "finishReason", "index", "companyId", "Country"]


class JobOrderSheetTests(unittest.TestCase):
    def test_detects_columns_without_confusing_company_background(self):
        cols = detect_job_order_columns(HEADERS)
        self.assertEqual(cols["company"], 0)
        self.assertEqual(cols["companyBackground"], 3)
        self.assertEqual(cols["position"], 2)
        self.assertEqual(cols["commission"], 14)
        self.assertIsNone(detect_job_order_columns(["Name", "Phone", "Position"]))

    def test_maps_full_row(self):
        row = ["Benjamin Barker", "Open", "Warehouse & Logistic Driver", "-", "Seri Kembangan", "RM2,000-RM3,000",
               "Mon - Fri", "9am to 6pm", "Male", "Chinese", "GDL Class D licence", "Attendance incentive",
               "LCP Lissa", "2026-10-21 9:54", "-"]
        orders = map_sheet_rows_to_job_orders(HEADERS, [row])["orders"]
        self.assertEqual(len(orders), 1)
        o = orders[0]
        self.assertEqual(o["workHours"], "Mon - Fri · 9am to 6pm")
        self.assertEqual(o["requirements"], "Gender: Male\nRace: Chinese\nGDL Class D licence")
        self.assertEqual(o["sourceUpdatedAt"], "2026-10-21T09:54:00.000Z")
        self.assertEqual(o["sourceRow"], 2)
        self.assertEqual(o["notes"], "")
        self.assertNotIn("headcount", o)

    def test_defaults_and_commission_note(self):
        row = ["PSA", "Open", "Lashing Specialist", "-", "-", "SGD1800", "-", "-", "不限", "-", "-", "-", "Sunrise",
               "2026-10-19 12:09", "RM270 - RM450"]
        o = map_sheet_rows_to_job_orders(HEADERS, [row])["orders"][0]
        self.assertEqual(o["location"], "TBD")
        self.assertEqual(o["workHours"], "TBD")
        self.assertEqual(o["requirements"], "Gender: Open")
        self.assertEqual(o["notes"], "Commission: RM270 - RM450")

    def test_skips_rows_missing_company_or_position(self):
        res = map_sheet_rows_to_job_orders(HEADERS, [["-", "Open", "Technician"], ["GSP", "Open", "-"], ["-", "-", "-"], []])
        self.assertEqual(res["orders"], [])
        self.assertEqual([(s["row"], s["reason"]) for s in res["skipped"]], [(2, "missing_company"), (3, "missing_position")])

    def test_merges_reposted_rows_keeping_latest(self):
        rows = [
            ["PSA", "Open", "Lashing Specialist", "-", "-", "SGD1800", "", "", "", "", "", "", "Sunrise", "2026-10-19 12:09"],
            ["PSA", "Closed", "Lashing Specialist", "-", "-", "SGD1700", "", "", "", "", "", "", "Sunrise", "11/5/2025"],
            ["psa ", "Open", "Lashing  Specialist", "-", "-", "SGD1900", "", "", "", "", "", "", "Sunrise", "2026-10-25 08:00"],
        ]
        res = map_sheet_rows_to_job_orders(HEADERS, rows)
        self.assertEqual(len(res["orders"]), 1)
        self.assertEqual(res["mergedCount"], 2)
        self.assertEqual(res["orders"][0]["salary"], "SGD1900")

    def test_outlets_stay_separate(self):
        rows = [["Sunrise", "Open", "Foodserver", "-", "MID VALLEY"], ["Sunrise", "Open", "Foodserver", "-", "SUBANG"]]
        self.assertEqual(len(map_sheet_rows_to_job_orders(HEADERS, rows)["orders"]), 2)

    def test_status_and_timestamps(self):
        self.assertEqual(normalize_job_order_status("Active"), "open")
        self.assertEqual(normalize_job_order_status("on hold"), "paused")
        self.assertEqual(normalize_job_order_status("Filled"), "filled")
        self.assertEqual(normalize_job_order_status("-"), "open")
        iso = lambda ms: datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.assertEqual(iso(parse_sheet_timestamp("2026-10-20 1:58")), "2026-10-20T01:58:00Z")
        self.assertEqual(iso(parse_sheet_timestamp("1/29/2026")), "2026-01-29T00:00:00Z")
        self.assertEqual(parse_sheet_timestamp("-"), 0)

    def test_find_existing(self):
        existing = [{"id": "a", "company": "PSA", "position": "Lashing Specialist", "location": "TBD"}]
        self.assertEqual(find_existing_job_order(existing, {"company": "psa", "position": "lashing specialist", "location": ""})["id"], "a")
        self.assertIsNone(find_existing_job_order(existing, {"company": "PSA", "position": "Welder", "location": ""}))
        self.assertEqual(job_order_sheet_key({"company": " PSA ", "position": "Lashing  Specialist", "location": "TBD"}), "psa::lashing specialist::")


if __name__ == "__main__":
    unittest.main()

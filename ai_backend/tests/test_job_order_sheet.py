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
    sync_job_order_rows,
    upsert_job_orders,
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


class _FakeDoc:
    def __init__(self, coll, doc_id):
        self.coll, self.id = coll, doc_id

    def collection(self, name):
        return self.coll.db.collection(f"{self.coll.path}/{self.id}/{name}")


class _FakeSnap:
    def __init__(self, doc_id, data):
        self.id, self._data = doc_id, data

    def to_dict(self):
        return dict(self._data)


class _FakeColl:
    def __init__(self, db, path):
        self.db, self.path, self.docs = db, path, {}

    def document(self, doc_id):
        return _FakeDoc(self, doc_id)

    def stream(self):
        return [_FakeSnap(k, v) for k, v in self.docs.items()]

    def where(self, field, op, value):
        assert op == "=="
        self.db.queries += 1
        return _FakeQuery([_FakeSnap(k, v) for k, v in self.docs.items() if v.get(field) == value])


class _FakeQuery:
    def __init__(self, snaps):
        self.snaps = snaps

    def limit(self, n):
        return _FakeQuery(self.snaps[:n])

    def stream(self):
        return list(self.snaps)


class _FakeBatch:
    def __init__(self, db):
        self.db, self.ops = db, []

    def set(self, ref, data):
        self.ops.append(("set", ref, data))

    def update(self, ref, data):
        self.ops.append(("update", ref, data))

    def commit(self):
        self.db.commits.append(len(self.ops))
        for op, ref, data in self.ops:
            if op == "set":
                ref.coll.docs[ref.id] = dict(data)
            else:
                ref.coll.docs[ref.id].update(data)


class _FakeDB:
    def __init__(self):
        self.colls, self.commits, self.queries = {}, [], 0

    def collection(self, path):
        return self.colls.setdefault(path, _FakeColl(self, path))

    def batch(self):
        return _FakeBatch(self)


class _FakeFirestoreTestCase(unittest.TestCase):
    def setUp(self):
        from unittest import mock
        patcher = mock.patch("services.identity_service.get_team_members", return_value=[])
        patcher.start()
        self.addCleanup(patcher.stop)

    def _orders(self, n):
        rows = [["Co", "Open", f"Role {i}", "-", "KL"] for i in range(n)]
        return map_sheet_rows_to_job_orders(HEADERS, rows)["orders"]


class UpsertTests(_FakeFirestoreTestCase):
    def test_dry_run_writes_nothing(self):
        db = _FakeDB()
        res = upsert_job_orders(db, "default_team", self._orders(3), dry_run=True)
        self.assertEqual(len(res["created"]), 3)
        self.assertEqual(db.commits, [])

    def test_batches_and_reimport_updates(self):
        db = _FakeDB()
        res = upsert_job_orders(db, "default_team", self._orders(450), dry_run=False)
        self.assertEqual(len(res["created"]), 450)
        self.assertEqual(db.commits, [400, 50])
        coll = db.collection("teams/default_team/job_orders")
        self.assertEqual(len(coll.docs), 450)

        # Re-importing the same sheet plus one new row writes only the new row
        commits_before = len(db.commits)
        res = upsert_job_orders(db, "default_team", self._orders(451), dry_run=False)
        self.assertEqual((len(res["created"]), len(res["updated"]), res["unchanged"]), (1, 0, 450))
        self.assertEqual(db.commits[commits_before:], [1])
        self.assertEqual(len(coll.docs), 451)

    def test_only_changed_orders_are_updated(self):
        db = _FakeDB()
        upsert_job_orders(db, "default_team", self._orders(3), dry_run=False)
        orders = self._orders(3)
        orders[1]["status"] = "closed"
        orders[2]["salary"] = "RM5000"
        for o in orders:
            o["sourceRow"] += 10  # a row inserted above shifts every sourceRow; not a change
        res = upsert_job_orders(db, "default_team", orders, dry_run=False)
        self.assertEqual((len(res["created"]), res["unchanged"]), (0, 1))
        self.assertEqual([(u["position"], u["changedFields"]) for u in res["updated"]],
                         [("Role 1", ["status"]), ("Role 2", ["salary"])])
        self.assertEqual(res["updated"][0]["statusChange"], ["open", "closed"])
        stored = {d["position"]: d for d in db.collection("teams/default_team/job_orders").docs.values()}
        self.assertEqual(stored["Role 1"]["status"], "closed")
        self.assertEqual(stored["Role 2"]["salary"], "RM5000")


class RealtimeAndOrphanTests(_FakeFirestoreTestCase):
    def _coll(self, db):
        return db.collection("teams/default_team/job_orders")

    def test_edited_row_updates_only_that_order(self):
        db = _FakeDB()
        upsert_job_orders(db, "default_team", self._orders(3), dry_run=False)
        res = sync_job_order_rows(db, "default_team", HEADERS, [["Co", "Closed", "Role 1", "-", "KL"]], first_row_number=3)
        self.assertEqual((len(res["created"]), len(res["updated"])), (0, 1))
        self.assertEqual(res["updated"][0]["statusChange"], ["open", "closed"])
        self.assertEqual(len(self._coll(db).docs), 3)
        self.assertEqual(db.queries, 1)  # sheetKey lookup, no full collection read

    def test_location_typed_after_title_adopts_blank_location_order(self):
        db = _FakeDB()
        res = sync_job_order_rows(db, "default_team", HEADERS, [["Co", "Open", "Driver"]], first_row_number=20)
        self.assertEqual(len(res["created"]), 1)
        res = sync_job_order_rows(db, "default_team", HEADERS, [["Co", "Open", "Driver", "-", "Senai"]], first_row_number=20)
        self.assertEqual((len(res["created"]), len(res["updated"])), (0, 1))
        docs = list(self._coll(db).docs.values())
        self.assertEqual(len(docs), 1)
        self.assertEqual((docs[0]["location"], docs[0]["sheetKey"]), ("Senai", "co::driver::senai"))

    def test_incomplete_row_is_skipped(self):
        db = _FakeDB()
        res = sync_job_order_rows(db, "default_team", HEADERS, [["Co", "Open", ""]], first_row_number=7)
        self.assertEqual(len(res["created"]), 0)
        self.assertEqual([s["row"] for s in res["skipped"]], [7])

    def test_orphans_are_reported_not_deleted(self):
        db = _FakeDB()
        upsert_job_orders(db, "default_team", self._orders(3), dry_run=False)
        res = upsert_job_orders(db, "default_team", self._orders(2), dry_run=False, report_orphans=True)
        self.assertEqual([o["position"] for o in res["orphans"]], ["Role 2"])
        self.assertEqual(len(self._coll(db).docs), 3)


if __name__ == "__main__":
    unittest.main()

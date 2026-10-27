"""
CLI: import Job Orders from a Google Sheet tab straight into Firestore (no AI, no web UI needed).

Requires in ai_backend/:
  - credentials.json (Google service account; share the sheet with its client_email) or GOOGLE_SERVICE_ACCOUNT_FILE
  - Firebase Admin credentials (FIREBASE_SERVICE_ACCOUNT_JSON / firebase-service-account.json)

Examples:
  python import_job_orders_from_sheet.py --list-teams
  python import_job_orders_from_sheet.py --sheet-id 1Fc3_q77r8Eph665aqqmeDqEalRjEFBDhIZ3-F2qxYt8 --tab Database --team-id <teamId>
  python import_job_orders_from_sheet.py --sheet-id ... --tab Database --team-id <teamId> --apply
"""
import argparse
import csv
import json
import sys

from services.job_order_sheet import map_sheet_rows_to_job_orders, upsert_job_orders


def main() -> int:
    ap = argparse.ArgumentParser(description="Import Job Orders from a Google Sheet tab into Firestore")
    ap.add_argument("--sheet-id", help="Spreadsheet ID from the URL")
    ap.add_argument("--tab", default="Database", help="Tab name (default: Database)")
    ap.add_argument("--team-id", help="Firestore teams/{teamId} to write into")
    ap.add_argument("--assigned-to", default="system", help="UID used for orders whose PIC is blank")
    ap.add_argument("--apply", action="store_true", help="Actually write. Default is a dry run")
    ap.add_argument("--list-teams", action="store_true", help="Print team IDs and exit")
    ap.add_argument("--preview-csv", help="Write the mapped orders to this CSV for review")
    args = ap.parse_args()

    from firebase_admin_init import get_firestore_client
    db = get_firestore_client()
    if db is None:
        print("Firebase Admin credentials not found — see firebase_admin_init.py", file=sys.stderr)
        return 2

    if args.list_teams:
        for t in db.collection("teams").stream():
            data = t.to_dict() or {}
            print(f"{t.id}\t{data.get('name') or data.get('teamName') or ''}")
        return 0

    if not args.sheet_id or not args.team_id:
        ap.error("--sheet-id and --team-id are required (or use --list-teams)")

    from sheets_service import get_sheet_values
    values = get_sheet_values(args.sheet_id, args.tab)
    if len(values) < 2:
        print("Sheet tab is empty", file=sys.stderr)
        return 1

    result = map_sheet_rows_to_job_orders(values[0], values[1:])
    if result["columns"] is None:
        print(f"Could not find 'Company Name' and 'Job Title' columns in header: {values[0]}", file=sys.stderr)
        return 1

    print(f"Mapped {len(result['orders'])} job orders ({result['mergedCount']} re-posted rows merged, "
          f"{len(result['skipped'])} rows skipped)")
    for s in result["skipped"]:
        print(f"  skipped row {s['row']}: {s['reason']} ({s['company'] or s['position']})")

    if args.preview_csv:
        cols = ["sourceRow", "company", "position", "status", "location", "salary", "workHours", "requirements",
                "benefits", "notes", "picName", "sourceUpdatedAt"]
        with open(args.preview_csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
            w.writeheader()
            w.writerows(result["orders"])
        print(f"Preview written to {args.preview_csv}")

    res = upsert_job_orders(db, args.team_id, result["orders"], default_assigned_to=args.assigned_to, dry_run=not args.apply)
    mode = "APPLIED" if args.apply else "DRY RUN (add --apply to write)"
    print(f"{mode}: {len(res['created'])} new, {len(res['updated'])} updated in teams/{args.team_id}/job_orders")
    if not args.apply:
        print(json.dumps({"created": res["created"][:5], "updated": res["updated"][:5]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

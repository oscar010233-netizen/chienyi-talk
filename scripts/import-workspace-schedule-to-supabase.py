from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env.local"
SOURCE_JSON = ROOT / "lib" / "workspace" / "workspace-schedule-data.json"


def read_env(path: Path) -> dict[str, str]:
    output: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        output[key.strip()] = value.strip().strip('"').strip("'")
    return output


class Supabase:
    def __init__(self, url: str, service_role_key: str) -> None:
        self.url = url.rstrip("/")
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }

    def request(
        self,
        method: str,
        path: str,
        body: Any | None = None,
        prefer: str | None = None,
    ) -> Any:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        data = None
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            f"{self.url}{path}",
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} failed: {exc.code} {error_body}") from exc

    def get(self, table: str, select: str, **filters: str) -> list[dict[str, Any]]:
        params: dict[str, str] = {"select": select}
        for key, value in filters.items():
            params[key] = f"eq.{value}"
        path = f"/rest/v1/{table}?" + urllib.parse.urlencode(params)
        return self.request("GET", path) or []

    def delete_where(self, table: str, **filters: str) -> None:
        params = {key: f"eq.{value}" for key, value in filters.items()}
        path = f"/rest/v1/{table}?" + urllib.parse.urlencode(params)
        self.request("DELETE", path, prefer="return=minimal")

    def upsert(
        self,
        table: str,
        rows: list[dict[str, Any]],
        on_conflict: str,
        select: str,
        batch_size: int = 500,
    ) -> list[dict[str, Any]]:
        if not rows:
            return []
        output: list[dict[str, Any]] = []
        for index in range(0, len(rows), batch_size):
            batch = rows[index : index + batch_size]
            params = urllib.parse.urlencode(
                {"on_conflict": on_conflict, "select": select}
            )
            result = self.request(
                "POST",
                f"/rest/v1/{table}?{params}",
                body=batch,
                prefer="resolution=merge-duplicates,return=representation",
            )
            output.extend(result or [])
        return output


def source_without_large_children(value: dict[str, Any], *keys: str) -> dict[str, Any]:
    return {key: item for key, item in value.items() if key not in keys}


def main() -> None:
    source_path = Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCE_JSON
    env = read_env(ENV_FILE)
    db = Supabase(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])
    tenant_rows = db.get("tenants", "id,name")
    if not tenant_rows:
        raise RuntimeError("No tenant found in Supabase.")
    tenant_id = tenant_rows[0]["id"]

    data = json.loads(source_path.read_text(encoding="utf-8"))
    workspace_rows = db.upsert(
        "schedule_workspaces",
        [
            {
                "tenant_id": tenant_id,
                "workspace_key": "legacy-workspace-ui",
                "title": "配課表UI",
                "legacy_sheet_name": "配課表UI",
                "source_workbook": data["source"].get("workbook"),
                "generated_at": data["source"].get("generatedAt"),
                "raw_source": data["source"],
            }
        ],
        "tenant_id,workspace_key",
        "id,workspace_key",
    )
    workspace_id = workspace_rows[0]["id"]

    for table in [
        "schedule_assignments",
        "schedule_side_notes",
        "schedule_time_slots",
        "schedule_days",
        "schedule_sections",
    ]:
        db.delete_where(table, workspace_id=workspace_id)

    section_rows = []
    for order, section in enumerate(data["sections"], start=1):
        section_rows.append(
            {
                "tenant_id": tenant_id,
                "workspace_id": workspace_id,
                "section_key": section["id"],
                "label": section["label"],
                "start_col": section.get("startCol"),
                "end_col": section.get("endCol"),
                "tone": section.get("tone"),
                "display_order": order,
                "raw_source": section,
            }
        )
    sections = db.upsert(
        "schedule_sections",
        section_rows,
        "tenant_id,workspace_id,section_key",
        "id,section_key",
    )
    section_map = {row["section_key"]: row["id"] for row in sections}

    day_rows = []
    for order, day in enumerate(data["days"], start=1):
        day_rows.append(
            {
                "tenant_id": tenant_id,
                "workspace_id": workspace_id,
                "day_key": day["id"],
                "label": day["label"],
                "english_label": day.get("englishLabel"),
                "date_serial": day.get("dateSerial"),
                "start_row": day.get("startRow"),
                "end_row": day.get("endRow"),
                "display_order": order,
                "raw_source": source_without_large_children(
                    day, "slots", "sideNotes"
                ),
            }
        )
    days = db.upsert(
        "schedule_days",
        day_rows,
        "tenant_id,workspace_id,day_key",
        "id,day_key",
    )
    day_map = {row["day_key"]: row["id"] for row in days}

    slot_rows = []
    for day in data["days"]:
        day_id = day_map[day["id"]]
        for order, slot in enumerate(day["slots"], start=1):
            slot_rows.append(
                {
                    "tenant_id": tenant_id,
                    "workspace_id": workspace_id,
                    "day_id": day_id,
                    "slot_key": slot["id"],
                    "source_row": slot["row"],
                    "hour_label": slot.get("hourLabel"),
                    "minute_label": slot.get("minuteLabel"),
                    "start_time": slot.get("time"),
                    "display_order": order,
                    "raw_source": source_without_large_children(slot, "items"),
                }
            )
    slots = db.upsert(
        "schedule_time_slots",
        slot_rows,
        "tenant_id,day_id,slot_key",
        "id,slot_key",
    )
    slot_map = {row["slot_key"]: row["id"] for row in slots}

    assignment_rows = []
    for day in data["days"]:
        day_id = day_map[day["id"]]
        for slot in day["slots"]:
            slot_id = slot_map[slot["id"]]
            for item in slot["items"]:
                section_id = section_map[item["sectionId"]]
                assignment_rows.append(
                    {
                        "tenant_id": tenant_id,
                        "workspace_id": workspace_id,
                        "day_id": day_id,
                        "slot_id": slot_id,
                        "section_id": section_id,
                        "assignment_key": item["id"],
                        "source_row": item["row"],
                        "start_col": item.get("startCol"),
                        "end_col": item.get("endCol"),
                        "source_cell": item.get("cell"),
                        "title": item["title"],
                        "subtitle": item.get("subtitle"),
                        "status_marker": item.get("status"),
                        "item_kind": item.get("kind") or "note",
                        "raw_values": item.get("raw") or [],
                        "raw_source": item,
                    }
                )
    assignments = db.upsert(
        "schedule_assignments",
        assignment_rows,
        "tenant_id,workspace_id,assignment_key",
        "id,assignment_key",
    )

    side_note_rows = []
    for day in data["days"]:
        day_id = day_map[day["id"]]
        for note in day["sideNotes"]:
            side_note_rows.append(
                {
                    "tenant_id": tenant_id,
                    "workspace_id": workspace_id,
                    "day_id": day_id,
                    "note_key": note["id"],
                    "source_row": note["row"],
                    "note_type": note.get("type") or "note",
                    "note_index": note.get("index"),
                    "title": note["title"],
                    "detail": note.get("detail"),
                    "amount_text": note.get("amount"),
                    "raw_source": note,
                }
            )
    side_notes = db.upsert(
        "schedule_side_notes",
        side_note_rows,
        "tenant_id,workspace_id,note_key",
        "id,note_key",
    )

    print(
        json.dumps(
            {
                "tenant_id": tenant_id,
                "workspace_id": workspace_id,
                "counts": {
                    "schedule_workspaces": len(workspace_rows),
                    "schedule_sections": len(sections),
                    "schedule_days": len(days),
                    "schedule_time_slots": len(slots),
                    "schedule_assignments": len(assignments),
                    "schedule_side_notes": len(side_notes),
                },
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

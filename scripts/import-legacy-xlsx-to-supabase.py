from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = ROOT.parent / "reference" / "jianyios_google_sheet.xlsx"
ENV_FILE = ROOT / ".env.local"

NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def read_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw or raw.lstrip().startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def col_to_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    value = 0
    for ch in letters.upper():
        value = value * 26 + ord(ch) - 64
    return value


def load_shared_strings(zf: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for item in root.findall("a:si", NS):
        parts = [node.text or "" for node in item.findall(".//a:t", NS)]
        strings.append("".join(parts))
    return strings


def workbook_sheet_map(zf: ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("rel:Relationship", NS)
    }

    sheets: list[tuple[str, str]] = []
    for sheet in workbook.findall("a:sheets/a:sheet", NS):
        rel_id = sheet.attrib[
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        ]
        target = rel_map[rel_id]
        if not target.startswith("worksheets/"):
            target = "worksheets/" + target.split("/")[-1]
        sheets.append((sheet.attrib["name"], "xl/" + target))
    return sheets


def cell_value(cell: ET.Element, shared_strings: list[str]) -> Any:
    cell_type = cell.attrib.get("t")
    if cell_type == "s":
        value = cell.find("a:v", NS)
        if value is None or value.text is None:
            return None
        return shared_strings[int(value.text)]
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//a:t", NS))
    value = cell.find("a:v", NS)
    if value is None or value.text is None:
        return None
    return value.text


def load_workbook_rows(path: Path) -> dict[str, list[list[Any]]]:
    rows_by_sheet: dict[str, list[list[Any]]] = {}
    with ZipFile(path) as zf:
        shared_strings = load_shared_strings(zf)
        for sheet_name, xml_path in workbook_sheet_map(zf):
            root = ET.fromstring(zf.read(xml_path))
            sheet_rows: list[list[Any]] = []
            for row in root.findall("a:sheetData/a:row", NS):
                values: list[Any] = []
                for cell in row.findall("a:c", NS):
                    index = col_to_index(cell.attrib.get("r", "A"))
                    while len(values) < index:
                        values.append(None)
                    values[index - 1] = clean_value(cell_value(cell, shared_strings))
                sheet_rows.append(values)
            rows_by_sheet[sheet_name] = sheet_rows
    return rows_by_sheet


def clean_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped != "" else None
    return value


def as_text(value: Any) -> str | None:
    value = clean_value(value)
    if value is None:
        return None
    text = str(value).strip()
    if re.fullmatch(r"-?\d+\.0", text):
        return text[:-2]
    return text


def as_int(value: Any) -> int | None:
    text = as_text(value)
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def as_num(value: Any) -> float | None:
    text = as_text(value)
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def split_loaded_to(value: Any) -> list[str]:
    text = as_text(value)
    if not text:
        return []
    return [part for part in re.split(r"[\s,;]+", text) if part]


def snake(name: str) -> str:
    name = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    name = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")
    return name.lower()


def row_to_dict(headers: list[Any], row: list[Any]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for index, header in enumerate(headers):
        key = as_text(header)
        if not key:
            continue
        output[key] = clean_value(row[index] if index < len(row) else None)
    return output


class Supabase:
    def __init__(self, url: str, key: str) -> None:
        self.url = url.rstrip("/")
        self.headers = {
            "apikey": key,
            "authorization": "Bearer " + key,
            "content-type": "application/json",
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
            headers["prefer"] = prefer
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(self.url + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                text = res.read().decode("utf-8")
                return json.loads(text) if text else None
        except urllib.error.HTTPError as exc:
            text = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} failed: {exc.code} {text}") from exc

    def get(self, table: str, select: str = "*", query: dict[str, str] | None = None) -> list[dict[str, Any]]:
        params = {"select": select}
        if query:
            params.update(query)
        path = f"/rest/v1/{table}?" + urllib.parse.urlencode(params)
        result = self.request("GET", path)
        return result or []

    def upsert(
        self,
        table: str,
        rows: list[dict[str, Any]],
        on_conflict: str,
        batch_size: int = 500,
    ) -> int:
        if not rows:
            return 0
        count = 0
        conflict = urllib.parse.quote(on_conflict, safe=",")
        for start in range(0, len(rows), batch_size):
            batch = rows[start : start + batch_size]
            self.request(
                "POST",
                f"/rest/v1/{table}?on_conflict={conflict}",
                body=batch,
                prefer="resolution=merge-duplicates,return=minimal",
            )
            count += len(batch)
        return count


def first_cell(row: list[Any], index: int) -> str | None:
    return as_text(row[index]) if index < len(row) else None


def find_sheet_by_meta(rows_by_sheet: dict[str, list[list[Any]]], meta_type: str, source: str | None = None) -> list[tuple[str, list[list[Any]]]]:
    matches: list[tuple[str, list[list[Any]]]] = []
    for sheet_name, rows in rows_by_sheet.items():
        if not rows:
            continue
        row0 = rows[0]
        if first_cell(row0, 0) != meta_type:
            continue
        if source is not None and first_cell(row0, 1) != source:
            continue
        matches.append((sheet_name, rows))
    return matches


def build_students(rows_by_sheet: dict[str, list[list[Any]]], tenant_id: str) -> list[dict[str, Any]]:
    rows = rows_by_sheet.get("StudentRoster", [])
    if len(rows) < 3:
        return []
    headers = rows[1]
    output: list[dict[str, Any]] = []
    for offset, row in enumerate(rows[2:], start=3):
        data = row_to_dict(headers, row)
        student_id = as_text(data.get("studentId"))
        chinese_name = as_text(data.get("chineseName"))
        english_name = as_text(data.get("englishName"))
        if not (student_id or chinese_name or english_name):
            continue
        output.append(
            {
                "tenant_id": tenant_id,
                "legacy_student_id": student_id or f"ROW-{offset}",
                "chinese_name": chinese_name,
                "english_name": english_name,
                "status": as_text(data.get("status")) or "active",
                "school": as_text(data.get("school")),
                "grade": as_text(data.get("grade")),
                "note": as_text(data.get("note")),
                "parent_name": as_text(data.get("parentName")),
                "parent_phone": as_text(data.get("parentPhone")),
                "legacy_row_number": offset,
                "raw_source": data,
            }
        )
    return output


def build_classes(rows_by_sheet: dict[str, list[list[Any]]], tenant_id: str) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    rows = rows_by_sheet.get("ClassConfig", [])
    if len(rows) >= 3:
        headers = rows[1]
        for row in rows[2:]:
            data = row_to_dict(headers, row)
            legacy_class_id = as_text(data.get("classId"))
            class_name = as_text(data.get("className")) or as_text(data.get("sheetName"))
            if not (legacy_class_id or class_name):
                continue
            key = legacy_class_id or f"CLASS-{class_name}"
            seen.add(key)
            output.append(
                {
                    "tenant_id": tenant_id,
                    "legacy_class_id": key,
                    "sheet_name": as_text(data.get("sheetName")),
                    "class_code": as_text(data.get("classCode")),
                    "class_name": class_name,
                    "department": as_text(data.get("department")),
                    "level": as_text(data.get("level")),
                    "class_type": as_text(data.get("classType")),
                    "weekday1": as_int(data.get("weekday1")),
                    "weekday2": as_int(data.get("weekday2")),
                    "system_sessions": as_int(data.get("systemSessions")),
                    "status": as_text(data.get("status")) or "active",
                    "source": "INVOICE",
                    "sheet_type": "CLASS_CONFIG",
                    "raw_source": data,
                }
            )

    for sheet_name, rows in rows_by_sheet.items():
        if not rows or sheet_name.startswith("_"):
            continue
        meta_type = first_cell(rows[0], 0)
        source = first_cell(rows[0], 1)
        if meta_type not in {"ENG_CLASS", "XIAO_CLASS"}:
            continue
        legacy_class_id = first_cell(rows[0], 4) or f"{source}-{sheet_name}"
        if legacy_class_id in seen:
            continue
        seen.add(legacy_class_id)
        output.append(
            {
                "tenant_id": tenant_id,
                "legacy_class_id": legacy_class_id,
                "sheet_name": sheet_name,
                "class_code": None,
                "class_name": sheet_name,
                "department": None,
                "level": None,
                "class_type": None,
                "weekday1": None,
                "weekday2": None,
                "system_sessions": None,
                "status": "active",
                "source": source,
                "sheet_type": meta_type,
                "raw_source": {"sheetName": sheet_name, "meta": rows[0][:8]},
            }
        )
    return output


def build_maps(db: Supabase, tenant_id: str) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    student_rows = db.get("students", "id,legacy_student_id", {"tenant_id": f"eq.{tenant_id}"})
    class_rows = db.get("classes", "id,legacy_class_id,sheet_name", {"tenant_id": f"eq.{tenant_id}"})
    students = {row["legacy_student_id"]: row["id"] for row in student_rows}
    classes_by_legacy = {row["legacy_class_id"]: row["id"] for row in class_rows if row.get("legacy_class_id")}
    classes_by_sheet = {row["sheet_name"]: row["id"] for row in class_rows if row.get("sheet_name")}
    return students, classes_by_legacy, classes_by_sheet


def build_enrollments(
    rows_by_sheet: dict[str, list[list[Any]]],
    tenant_id: str,
    student_map: dict[str, str],
    class_map: dict[str, str],
    class_sheet_map: dict[str, str],
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for sheet_name, rows in rows_by_sheet.items():
        if len(rows) < 4 or sheet_name.startswith("_"):
            continue
        meta_type = first_cell(rows[0], 0)
        source = first_cell(rows[0], 1)
        if meta_type not in {"ENG_CLASS", "XIAO_CLASS"}:
            continue
        legacy_class_id = first_cell(rows[0], 4) or f"{source}-{sheet_name}"
        class_ref = class_map.get(legacy_class_id) or class_sheet_map.get(sheet_name)
        if not class_ref:
            continue
        start_col = 6 if meta_type == "ENG_CLASS" else 3
        block_width = 2 if meta_type == "ENG_CLASS" else 3
        slot = 1
        max_cols = max(len(rows[1]), len(rows[2]), len(rows[3]))
        for col in range(start_col, max_cols, block_width):
            chinese_name = as_text(rows[1][col] if col < len(rows[1]) else None)
            english_name = as_text(rows[2][col] if col < len(rows[2]) else None)
            legacy_student_id = as_text(rows[3][col] if col < len(rows[3]) else None)
            if not (legacy_student_id or chinese_name or english_name):
                slot += 1
                continue
            student_ref = student_map.get(legacy_student_id or "")
            if not student_ref:
                slot += 1
                continue
            key = (class_ref, student_ref)
            if key in seen:
                slot += 1
                continue
            seen.add(key)
            output.append(
                {
                    "tenant_id": tenant_id,
                    "class_id": class_ref,
                    "student_id": student_ref,
                    "legacy_class_id": legacy_class_id,
                    "legacy_student_id": legacy_student_id,
                    "class_name": sheet_name,
                    "slot_index": slot,
                    "source": source,
                    "status": "active",
                    "raw_source": {
                        "sheetName": sheet_name,
                        "sheetType": meta_type,
                        "chineseName": chinese_name,
                        "englishName": english_name,
                    },
                }
            )
            slot += 1
    return output


def build_class_tasks(
    rows_by_sheet: dict[str, list[list[Any]]],
    tenant_id: str,
    class_map: dict[str, str],
    class_sheet_map: dict[str, str],
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for sheet_name, rows in rows_by_sheet.items():
        if len(rows) < 5 or sheet_name.startswith("_"):
            continue
        meta_type = first_cell(rows[0], 0)
        source = first_cell(rows[0], 1)
        if meta_type not in {"ENG_CLASS", "XIAO_CLASS"}:
            continue
        legacy_class_id = first_cell(rows[0], 4) or f"{source}-{sheet_name}"
        class_ref = class_map.get(legacy_class_id) or class_sheet_map.get(sheet_name)
        for row_number, row in enumerate(rows[4:], start=5):
            if meta_type == "ENG_CLASS":
                week = first_cell(row, 0)
                lesson = first_cell(row, 1)
                task_type = first_cell(row, 2)
                raw_task_name = first_cell(row, 3)
                raw_legacy_task_id = first_cell(row, 4)
                threshold = first_cell(row, 5)
                date_key = None
            else:
                week = first_cell(row, 0)
                lesson = None
                task_type = first_cell(row, 1)
                raw_task_name = first_cell(row, 1)
                raw_legacy_task_id = first_cell(row, 2)
                threshold = None
                date_key = week
            if not (week or task_type or raw_task_name or raw_legacy_task_id):
                continue
            legacy_task_id = raw_legacy_task_id or f"{source}-{sheet_name}-ROW-{row_number}"
            key = (source or "", legacy_task_id)
            if key in seen:
                continue
            seen.add(key)
            output.append(
                {
                    "tenant_id": tenant_id,
                    "class_id": class_ref,
                    "legacy_class_id": legacy_class_id,
                    "class_name": sheet_name,
                    "source": source,
                    "sheet_type": meta_type,
                    "legacy_task_id": legacy_task_id,
                    "week": week,
                    "lesson": lesson,
                    "date_key": date_key,
                    "task_type": task_type,
                    "raw_task_name": raw_task_name,
                    "task_name": raw_task_name or task_type or legacy_task_id,
                    "threshold": threshold,
                    "source_row": row_number,
                    "status": "active",
                    "raw_source": {"row": row[:12]},
                }
            )
    return output


def build_buffer_entries(
    rows_by_sheet: dict[str, list[list[Any]]],
    tenant_id: str,
    student_map: dict[str, str],
    class_sheet_map: dict[str, str],
    task_map: dict[tuple[str, str], str],
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for sheet_name, rows in rows_by_sheet.items():
        if sheet_name not in {"EngBuffer", "XiaoBuffer"} or len(rows) < 3:
            continue
        source = first_cell(rows[0], 1) or ("ENG" if sheet_name == "EngBuffer" else "XIAO")
        headers = rows[1]
        for row_number, row in enumerate(rows[2:], start=3):
            data = row_to_dict(headers, row)
            legacy_student_id = as_text(data.get("studentId"))
            task_id = as_text(data.get("taskId"))
            task_name = as_text(data.get("taskName"))
            class_name = as_text(data.get("className"))
            if not (legacy_student_id and (task_id or task_name)):
                continue
            output.append(
                {
                    "tenant_id": tenant_id,
                    "source": source,
                    "student_ref": student_map.get(legacy_student_id),
                    "class_ref": class_sheet_map.get(class_name or ""),
                    "class_task_ref": task_map.get((source, task_id or "")),
                    "student_id": legacy_student_id,
                    "class_name": class_name,
                    "eng_name": as_text(data.get("engName")),
                    "chi_name": as_text(data.get("chiName")),
                    "task_name": task_name or task_id or "",
                    "task_id": task_id,
                    "latest_result": as_text(data.get("latestResult")),
                    "status": as_text(data.get("status")),
                    "history": as_text(data.get("history")),
                    "threshold": as_text(data.get("threshold")),
                    "week": as_text(data.get("week")),
                    "writeback_status": as_text(data.get("writebackStatus")),
                    "last_updated": None,
                    "loaded_to": as_text(data.get("loadedTo")),
                    "loaded_to_keys": split_loaded_to(data.get("loadedTo")),
                    "legacy_row_number": row_number,
                    "raw_source": data,
                }
            )
    return output


def build_task_map(db: Supabase, tenant_id: str) -> dict[tuple[str, str], str]:
    rows = db.get("class_tasks", "id,source,legacy_task_id", {"tenant_id": f"eq.{tenant_id}"})
    return {(row["source"], row["legacy_task_id"]): row["id"] for row in rows if row.get("legacy_task_id")}


def build_appsh_kanban(rows_by_sheet: dict[str, list[list[Any]]], tenant_id: str) -> list[dict[str, Any]]:
    rows = rows_by_sheet.get("AppSh_Kanban", [])
    if len(rows) < 2:
        return []
    headers = rows[0]
    output: list[dict[str, Any]] = []
    text_cols = {
        "mobile_kanban_task_id",
        "source",
        "loaded_to",
        "class_name",
        "student_id",
        "student_name",
        "chi_name",
        "eng_name",
        "task_id",
        "task_name",
        "task_type",
        "current_status",
        "current_lamp",
        "task_display",
        "history",
        "threshold",
        "latest_result",
        "score_input",
        "status_input",
        "comment_input",
        "private_note_input",
        "photo1",
        "photo2",
        "photo3",
        "photo4",
        "photo5",
        "sync_status",
        "sync_message",
    }
    for row in rows[1:]:
        data = row_to_dict(headers, row)
        row_id = as_text(data.get("mobileKanbanTaskId"))
        if not row_id:
            continue
        payload = {"tenant_id": tenant_id, "mobile_kanban_task_id": row_id, "raw_source": data}
        for key, value in data.items():
            column = snake(key)
            if column in text_cols and column != "mobile_kanban_task_id":
                payload[column] = as_text(value)
        payload["last_updated"] = None
        output.append(payload)
    return output


def build_appsh_input(rows_by_sheet: dict[str, list[list[Any]]], tenant_id: str) -> list[dict[str, Any]]:
    rows = rows_by_sheet.get("AppSh_Input", [])
    if len(rows) < 2:
        return []
    headers = rows[0]
    int_cols = {
        "slot_index",
        "content_col",
        "attendance_row",
        "homework_row1",
        "homework_row2",
        "homework_row3",
        "homework_row4",
        "homework_row5",
        "quiz_row1",
        "quiz_row2",
        "quiz_row3",
    }
    output: list[dict[str, Any]] = []
    for row in rows[1:]:
        data = row_to_dict(headers, row)
        row_id = as_text(data.get("dailyRowId"))
        if not row_id:
            continue
        payload = {"tenant_id": tenant_id, "daily_row_id": row_id, "raw_source": data}
        for key, value in data.items():
            column = snake(key)
            if column == "daily_row_id":
                continue
            payload[column] = as_int(value) if column in int_cols else as_text(value)
        payload["last_updated"] = None
        output.append(payload)
    return output


def build_invoice_config(rows_by_sheet: dict[str, list[list[Any]]], tenant_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    sheets = find_sheet_by_meta(rows_by_sheet, "INVOICE_CONFIG", "INVOICE")
    if not sheets:
        return [], [], []
    rows = sheets[0][1]
    tuition: list[dict[str, Any]] = []
    fees: list[dict[str, Any]] = []
    holidays: list[dict[str, Any]] = []
    section = "tuition"
    header: list[Any] | None = None
    for row in rows[1:]:
        first = as_text(row[0] if row else None)
        if not first:
            continue
        if first.startswith("#"):
            marker = first.upper()
            section = "fees" if "FEE" in marker else "holidays" if "HOLIDAY" in marker else section
            header = None
            continue
        if header is None:
            header = row
            continue
        data = row_to_dict(header, row)
        if section == "tuition":
            key = as_text(data.get("key"))
            if key:
                tuition.append(
                    {
                        "tenant_id": tenant_id,
                        "rate_key": key,
                        "label": as_text(data.get("label")) or key,
                        "sessions": as_int(data.get("sessions")),
                        "price": as_num(data.get("price")),
                        "status": "active",
                    }
                )
        elif section == "fees":
            category = as_text(data.get("category"))
            label = as_text(data.get("label"))
            if category and label:
                fees.append(
                    {
                        "tenant_id": tenant_id,
                        "category": category,
                        "label": label,
                        "amount": as_num(data.get("amount")),
                        "status": "active",
                    }
                )
        else:
            season = as_text(data.get("season"))
            raw = as_text(data.get("holidays"))
            if season:
                holidays.append(
                    {
                        "tenant_id": tenant_id,
                        "season": season,
                        "holidays": [part for part in (raw or "").split(",") if part],
                        "raw_holidays": raw,
                    }
                )
    return tuition, fees, holidays


def build_invoice_records(
    rows_by_sheet: dict[str, list[list[Any]]],
    tenant_id: str,
    student_map: dict[str, str],
    class_map: dict[str, str],
) -> list[dict[str, Any]]:
    rows = rows_by_sheet.get("InvoiceData", [])
    if len(rows) < 3:
        return []
    headers = rows[1]
    numeric_cols = {
        "tuition",
        "book_fee",
        "misc_fee",
        "discount",
        "final_amount",
        "paid_amount",
        "carryover",
        "adj1_amount",
        "balance",
    }
    int_cols = {"weekday", "print_count", "system_sessions"}
    output: list[dict[str, Any]] = []
    for row_number, row in enumerate(rows[2:], start=3):
        data = row_to_dict(headers, row)
        record_id = as_text(data.get("recordId"))
        if not record_id:
            continue
        legacy_student_id = as_text(data.get("studentId"))
        legacy_class_id = as_text(data.get("classId"))
        payload: dict[str, Any] = {
            "tenant_id": tenant_id,
            "record_id": record_id,
            "student_ref": student_map.get(legacy_student_id or ""),
            "class_ref": class_map.get(legacy_class_id or ""),
            "legacy_row_number": row_number,
            "raw_source": data,
        }
        for key, value in data.items():
            column = snake(key)
            if column == "record_id":
                continue
            if column in numeric_cols:
                payload[column] = as_num(value)
            elif column in int_cols:
                payload[column] = as_int(value)
            else:
                payload[column] = as_text(value)
        output.append(payload)
    return output


def build_session_credits(
    rows_by_sheet: dict[str, list[list[Any]]],
    tenant_id: str,
    student_map: dict[str, str],
) -> list[dict[str, Any]]:
    rows = rows_by_sheet.get("SessionCredit", [])
    if len(rows) < 3:
        return []
    headers = rows[1]
    output: list[dict[str, Any]] = []
    for row_number, row in enumerate(rows[2:], start=3):
        data = row_to_dict(headers, row)
        legacy_student_id = as_text(data.get("studentId"))
        season = as_text(data.get("season"))
        if not (legacy_student_id and season):
            continue
        output.append(
            {
                "tenant_id": tenant_id,
                "student_ref": student_map.get(legacy_student_id),
                "student_id": legacy_student_id,
                "season": season,
                "date": as_text(data.get("date")),
                "sessions_owed": as_int(data.get("sessionsOwed")),
                "rate_per_session": as_num(data.get("ratePerSession")),
                "discount_amount": as_num(data.get("discountAmount")),
                "reason": as_text(data.get("reason")),
                "status": as_text(data.get("status")) or "pending",
                "legacy_row_number": row_number,
                "raw_source": data,
            }
        )
    return output


def main() -> None:
    xlsx_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    env = read_env(ENV_FILE)
    db = Supabase(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])
    tenant_rows = db.get("tenants", "id,name")
    if not tenant_rows:
        raise RuntimeError("No tenant found in Supabase.")
    tenant_id = tenant_rows[0]["id"]

    rows_by_sheet = load_workbook_rows(xlsx_path)
    counts: dict[str, int] = {}

    students = build_students(rows_by_sheet, tenant_id)
    counts["students"] = db.upsert("students", students, "tenant_id,legacy_student_id")

    classes = build_classes(rows_by_sheet, tenant_id)
    counts["classes"] = db.upsert("classes", classes, "tenant_id,legacy_class_id")

    student_map, class_map, class_sheet_map = build_maps(db, tenant_id)

    enrollments = build_enrollments(rows_by_sheet, tenant_id, student_map, class_map, class_sheet_map)
    counts["class_enrollments"] = db.upsert("class_enrollments", enrollments, "tenant_id,class_id,student_id")

    class_tasks = build_class_tasks(rows_by_sheet, tenant_id, class_map, class_sheet_map)
    counts["class_tasks"] = db.upsert("class_tasks", class_tasks, "tenant_id,source,legacy_task_id")

    task_map = build_task_map(db, tenant_id)

    buffers = build_buffer_entries(rows_by_sheet, tenant_id, student_map, class_sheet_map, task_map)
    counts["task_buffer_entries"] = db.upsert("task_buffer_entries", buffers, "tenant_id,source,student_id,task_id")

    appsh_kanban = build_appsh_kanban(rows_by_sheet, tenant_id)
    counts["appsh_kanban_rows"] = db.upsert("appsh_kanban_rows", appsh_kanban, "tenant_id,mobile_kanban_task_id")

    appsh_input = build_appsh_input(rows_by_sheet, tenant_id)
    counts["appsh_xiao_daily_rows"] = db.upsert("appsh_xiao_daily_rows", appsh_input, "tenant_id,daily_row_id")

    tuition, fees, holidays = build_invoice_config(rows_by_sheet, tenant_id)
    counts["invoice_tuition_rates"] = db.upsert("invoice_tuition_rates", tuition, "tenant_id,rate_key")
    counts["invoice_fee_presets"] = db.upsert("invoice_fee_presets", fees, "tenant_id,category,label")
    counts["invoice_season_holidays"] = db.upsert("invoice_season_holidays", holidays, "tenant_id,season")

    invoice_records = build_invoice_records(rows_by_sheet, tenant_id, student_map, class_map)
    counts["invoice_records"] = db.upsert("invoice_records", invoice_records, "tenant_id,record_id")

    session_credits = build_session_credits(rows_by_sheet, tenant_id, student_map)
    counts["session_credits"] = db.upsert("session_credits", session_credits, "tenant_id,student_id,season,date")

    print(json.dumps({"tenant_id": tenant_id, "counts": counts}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

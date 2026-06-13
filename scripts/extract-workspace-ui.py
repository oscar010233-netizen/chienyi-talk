from __future__ import annotations

import json
import re
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SOURCE_XLSX = ROOT.parent / "reference" / "jianyios_google_sheet.xlsx"
OUTPUT_JSON = ROOT / "lib" / "workspace" / "workspace-schedule-data.json"

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


@dataclass(frozen=True)
class Section:
    id: str
    label: str
    start_col: int
    end_col: int
    tone: str


SECTIONS = [
    Section("public", "Public", 14, 15, "lime"),
    Section("extension", "延伸A", 16, 17, "sky"),
    Section("roomA", "A教室", 18, 19, "rose"),
    Section("roomB", "B教室", 20, 21, "violet"),
    Section("stairs", "階梯教室", 22, 24, "cyan"),
]

DAY_CODES = {
    "MON": ("mon", "一"),
    "TUE": ("tue", "二"),
    "WED": ("wed", "三"),
    "THUR": ("thu", "四"),
    "FRI": ("fri", "五"),
    "SAT": ("sat", "六"),
    "SUN": ("sun", "日"),
}

STATUS_PREFIXES = ("🔴", "🟢", "🟡", "🔵", "⚫", "⚪", "🟣", "⚠️")


def target_path(target: str) -> str:
    target = target.replace("\\", "/")
    if target.startswith("/"):
        return target[1:]
    if target.startswith("xl/"):
        return target
    return f"xl/{target}"


def col_to_number(col: str) -> int:
    number = 0
    for char in col:
        number = number * 26 + ord(char) - 64
    return number


def number_to_col(number: int) -> str:
    value = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        value = chr(65 + remainder) + value
    return value


def cell_ref(ref: str | None) -> tuple[int, int]:
    match = re.match(r"([A-Z]+)(\d+)", ref or "")
    if not match:
        return 0, 0
    return int(match.group(2)), col_to_number(match.group(1))


def read_shared_strings(zip_file: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zip_file.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    output: list[str] = []
    for item in root.findall("main:si", NS):
        output.append(
            "".join(
                text.text or ""
                for text in item.iter(
                    "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"
                )
            )
        )
    return output


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    value = cell.find("main:v", NS)
    inline_string = cell.find("main:is", NS)
    if cell_type == "s" and value is not None:
        return shared_strings[int(value.text or "0")]
    if cell_type == "inlineStr" and inline_string is not None:
        return "".join(
            text.text or ""
            for text in inline_string.iter(
                "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"
            )
        )
    return value.text if value is not None else ""


def load_workspace_sheet(path: Path) -> dict[int, dict[int, str]]:
    with zipfile.ZipFile(path) as zip_file:
        shared_strings = read_shared_strings(zip_file)
        workbook = ET.fromstring(zip_file.read("xl/workbook.xml"))
        relationships = ET.fromstring(zip_file.read("xl/_rels/workbook.xml.rels"))
        rel_to_target = {
            rel.attrib["Id"]: target_path(rel.attrib["Target"]) for rel in relationships
        }
        sheet = workbook.find("main:sheets", NS)[0]
        rel_id = sheet.attrib[
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        ]
        root = ET.fromstring(zip_file.read(rel_to_target[rel_id]))

        rows: dict[int, dict[int, str]] = {}
        for row in root.findall(".//main:sheetData/main:row", NS):
            row_number = int(row.attrib.get("r", "0") or "0")
            row_values: dict[int, str] = {}
            for cell in row.findall("main:c", NS):
                _, col_number = cell_ref(cell.attrib.get("r"))
                value = cell_value(cell, shared_strings)
                if value.strip():
                    row_values[col_number] = value.strip()
            if row_values:
                rows[row_number] = row_values
        return rows


def find_day_ranges(rows: dict[int, dict[int, str]]) -> list[dict[str, Any]]:
    markers: list[tuple[int, str, str, str]] = []
    for row_number, values in sorted(rows.items()):
        raw_day = values.get(2, "")
        if not raw_day.startswith("("):
            continue
        match = re.search(r"(MON|TUE|WED|THUR|FRI|SAT|SUN)", raw_day)
        if not match:
            continue
        code = match.group(1)
        day_id, zh_label = DAY_CODES[code]
        markers.append((row_number, day_id, zh_label, code))

    ranges: list[dict[str, Any]] = []
    for index, (start_row, day_id, zh_label, code) in enumerate(markers):
        end_row = markers[index + 1][0] - 1 if index + 1 < len(markers) else 300
        ranges.append(
            {
                "id": day_id,
                "label": zh_label,
                "englishLabel": code,
                "startRow": start_row,
                "endRow": end_row,
            }
        )
    return ranges


def parse_time(hour_label: str, minute_label: str) -> str:
    hour_match = re.search(r"(\d{1,2})", hour_label)
    if not hour_match:
        return minute_label
    hour = int(hour_match.group(1))
    lower = hour_label.lower()
    if "pm" in lower and hour != 12:
        hour += 12
    if "am" in lower and hour == 12:
        hour = 0
    minute = "00"
    minute_match = re.match(r"(\d{2})~", minute_label)
    if minute_match:
        minute = minute_match.group(1)
    return f"{hour:02d}:{minute}"


def item_kind(parts: list[str]) -> str:
    joined = " ".join(parts)
    if "【" in joined or "｜" in joined:
        return "student"
    if any(joined.startswith(prefix) for prefix in STATUS_PREFIXES):
        return "task"
    if "訂餐" in joined or "晚餐" in joined or "雞腿" in joined or "炒飯" in joined:
        return "meal"
    if "補" in joined or "強化" in joined or "英檢" in joined or "小檢" in joined:
        return "class"
    return "note"


def split_status(parts: list[str]) -> tuple[str | None, str, str | None]:
    status = None
    clean_parts = parts[:]
    if clean_parts and any(clean_parts[0].startswith(prefix) for prefix in STATUS_PREFIXES):
        status = clean_parts.pop(0)
    title = clean_parts[0] if clean_parts else (status or "")
    subtitle = " / ".join(clean_parts[1:]) if len(clean_parts) > 1 else None
    return status, title, subtitle


def build_items(
    day_id: str,
    row_number: int,
    values: dict[int, str],
    section: Section,
) -> list[dict[str, Any]]:
    cells = [
        (col, values[col])
        for col in range(section.start_col, section.end_col + 1)
        if values.get(col, "").strip()
    ]
    if not cells:
        return []

    clusters: list[list[tuple[int, str]]] = []
    current: list[tuple[int, str]] = []
    previous_col = -10
    for col, value in cells:
        if current and col - previous_col > 1:
            clusters.append(current)
            current = []
        current.append((col, value))
        previous_col = col
    if current:
        clusters.append(current)

    output: list[dict[str, Any]] = []
    for index, cluster in enumerate(clusters):
        parts = [value for _, value in cluster]
        status, title, subtitle = split_status(parts)
        start_col = cluster[0][0]
        end_col = cluster[-1][0]
        output.append(
            {
                "id": f"{day_id}-r{row_number}-{section.id}-{index}",
                "sectionId": section.id,
                "row": row_number,
                "startCol": start_col,
                "endCol": end_col,
                "cell": f"{number_to_col(start_col)}{row_number}",
                "title": title,
                "subtitle": subtitle,
                "status": status,
                "kind": item_kind(parts),
                "raw": parts,
            }
        )
    return output


def build_side_notes(
    day_id: str,
    row_number: int,
    values: dict[int, str],
) -> list[dict[str, Any]]:
    first = values.get(2, "")
    second = values.get(3, "")
    third = values.get(4, "")
    amount = values.get(5, "")
    output: list[dict[str, Any]] = []

    pickup_parts = [
        values[col]
        for col in range(10, 14)
        if values.get(col, "").strip()
    ]
    if pickup_parts:
        output.append(
            {
                "id": f"{day_id}-pickup-r{row_number}",
                "row": row_number,
                "type": "pickup",
                "index": "",
                "title": " / ".join(pickup_parts),
                "detail": None,
                "amount": None,
            }
        )

    if first in {"學生訂餐", "老師訂餐", "TO DO", "-", ""}:
        return output

    if first.replace(".", "", 1).isdigit() and (second or third):
        note_type = "todo" if amount in {"0", "1", "1.0", "0.0"} and not third else "meal"
        output.append(
            {
                "id": f"{day_id}-side-r{row_number}",
                "row": row_number,
                "type": note_type,
                "index": first.replace(".0", ""),
                "title": second or third,
                "detail": third if second else None,
                "amount": amount.replace(".0", "") if amount else None,
            }
        )
    elif second or third:
        output.append(
            {
                "id": f"{day_id}-side-r{row_number}",
                "row": row_number,
                "type": "note",
                "index": first,
                "title": second or first,
                "detail": third or None,
                "amount": amount.replace(".0", "") if amount else None,
            }
        )
    return output


def build_schedule(rows: dict[int, dict[int, str]]) -> dict[str, Any]:
    days = []
    day_ranges = find_day_ranges(rows)
    for day in day_ranges:
        current_hour = ""
        slots = []
        side_notes = []
        date_serial = None

        for row_number in range(day["startRow"], day["endRow"] + 1):
            values = rows.get(row_number, {})
            if values.get(2, "").replace(".", "", 1).isdigit() and row_number < day["startRow"] + 8:
                date_serial = values.get(2)
            if values.get(7):
                current_hour = values[7]
            minute_label = values.get(8)
            if not minute_label:
                side_notes.extend(build_side_notes(day["id"], row_number, values))
                continue

            items: list[dict[str, Any]] = []
            for section in SECTIONS:
                items.extend(build_items(day["id"], row_number, values, section))
            side_notes.extend(build_side_notes(day["id"], row_number, values))

            slots.append(
                {
                    "id": f"{day['id']}-r{row_number}",
                    "row": row_number,
                    "hourLabel": current_hour.replace("\n", " "),
                    "minuteLabel": minute_label,
                    "time": parse_time(current_hour, minute_label),
                    "items": items,
                }
            )

        days.append(
            {
                **day,
                "dateSerial": date_serial,
                "slots": slots,
                "sideNotes": side_notes,
                "itemCount": sum(len(slot["items"]) for slot in slots),
            }
        )

    return {
        "source": {
            "sheetName": "配課表UI",
            "workbook": str(SOURCE_XLSX),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "sections": [
            {
                "id": section.id,
                "label": section.label,
                "startCol": section.start_col,
                "endCol": section.end_col,
                "tone": section.tone,
            }
            for section in SECTIONS
        ],
        "days": days,
    }


def main() -> None:
    rows = load_workspace_sheet(SOURCE_XLSX)
    schedule = build_schedule(rows)
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(
        json.dumps(schedule, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(OUTPUT_JSON),
                "days": len(schedule["days"]),
                "slots": sum(len(day["slots"]) for day in schedule["days"]),
                "items": sum(day["itemCount"] for day in schedule["days"]),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

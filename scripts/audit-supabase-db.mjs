import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env.local');
const DEFAULT_OUT = path.join(ROOT, 'docs', 'supabase-live-snapshot.md');

function readEnv(file) {
  const env = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return env;
}

function escapeAscii(value) {
  return String(value ?? '').replace(/[^\x20-\x7e]/g, (char) => {
    const code = char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    return `\\u${code}`;
  });
}

function markdownTable(headers, rows) {
  const line = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(escapeAscii).join(' | ')} |`);
  return [line, sep, ...body].join('\n');
}

class SupabaseReader {
  constructor(url, key) {
    this.url = url.replace(/\/$/, '');
    this.headers = {
      apikey: key,
      authorization: `Bearer ${key}`,
    };
  }

  async openApi() {
    const response = await fetch(`${this.url}/rest/v1/`, {
      headers: {
        ...this.headers,
        accept: 'application/openapi+json',
      },
    });
    if (!response.ok) {
      throw new Error(`OpenAPI request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
  }

  async rows(table, select = '*') {
    const params = new URLSearchParams({ select });
    const response = await fetch(`${this.url}/rest/v1/${encodeURIComponent(table)}?${params}`, {
      headers: this.headers,
    });
    if (!response.ok) {
      throw new Error(`${table} rows request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
  }

  async optionalRows(table, select = '*') {
    try {
      return await this.rows(table, select);
    } catch (error) {
      if (String(error.message).includes('PGRST205')) return [];
      throw error;
    }
  }

  async count(table) {
    const response = await fetch(`${this.url}/rest/v1/${encodeURIComponent(table)}?select=*`, {
      method: 'HEAD',
      headers: {
        ...this.headers,
        prefer: 'count=exact',
        range: '0-0',
      },
    });
    if (!response.ok) {
      return { table, count: null, status: response.status };
    }
    const contentRange = response.headers.get('content-range') ?? '';
    const match = contentRange.match(/\/(\d+|\*)$/);
    return { table, count: match ? match[1] : null, status: response.status };
  }
}

function countBy(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[key] ?? 'null';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

async function buildSnapshot(db) {
  const spec = await db.openApi();
  const tables = Object.keys(spec.definitions ?? {}).sort();
  const counts = [];
  for (const table of tables) {
    counts.push(await db.count(table));
  }

  const definitions = tables.map((table) => {
    const props = spec.definitions[table]?.properties ?? {};
    return {
      table,
      columns: Object.entries(props).map(([name, value]) => ({
        name,
        type: value.format || value.type || 'unknown',
      })),
    };
  });

  const [
    classes,
    classEnrollments,
    classTasks,
    studentTaskRecords,
  ] = await Promise.all([
    db.rows('classes', 'id,class_code,class_name'),
    db.optionalRows('class_enrollments', 'class_id,student_id,status'),
    db.optionalRows('class_tasks', 'id,class_id,status'),
    db.optionalRows('student_task_records', 'class_task_id,status'),
  ]);

  const classEnrollmentsByClass = countBy(classEnrollments.filter((row) => row.status === 'active'), 'class_id');
  const classTasksByClass = countBy(classTasks.filter((row) => row.status === 'active'), 'class_id');
  const taskToClass = new Map(classTasks.map((row) => [row.id, row.class_id]));
  const taskRecordsByClass = new Map();
  for (const row of studentTaskRecords) {
    const classId = taskToClass.get(row.class_task_id);
    if (classId) taskRecordsByClass.set(classId, (taskRecordsByClass.get(classId) ?? 0) + 1);
  }

  const classSummary = classes
    .map((row) => ({
      key: row.class_code || row.id,
      name: row.class_name,
      enrollments: classEnrollmentsByClass.get(row.id) ?? 0,
      classTasks: classTasksByClass.get(row.id) ?? 0,
      taskRecords: taskRecordsByClass.get(row.id) ?? 0,
    }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));

  return { tables, counts, definitions, classSummary };
}

function renderMarkdown(snapshot) {
  const generatedAt = new Date().toISOString();
  const tableRows = snapshot.counts.map((row) => [row.table, row.count ?? 'unknown', `HTTP ${row.status}`]);
  const classRows = snapshot.classSummary.map((row) => [
    row.key,
    row.name,
    row.enrollments,
    row.classTasks,
    row.taskRecords,
  ]);
  const schemaRows = snapshot.definitions.map((definition) => [
    definition.table,
    definition.columns.length,
    definition.columns.map((column) => `${column.name}:${column.type}`).join(', '),
  ]);

  return [
    '# Supabase Live Snapshot',
    '',
    `Generated at: ${generatedAt}`,
    '',
    'This file is generated by `node scripts/audit-supabase-db.mjs`.',
    'It intentionally contains schema metadata, row counts, and class-level aggregate counts only.',
    '',
    '## Row Counts',
    '',
    markdownTable(['Table', 'Rows', 'Status'], tableRows),
    '',
    '## Grade Track Class Summary',
    '',
    markdownTable(
      [
        'Class Key',
        'Class Name',
        'Active Enrollments',
        'Active Class Tasks',
        'Task Records',
      ],
      classRows,
    ),
    '',
    '## Public Schema Columns',
    '',
    markdownTable(['Table', 'Column Count', 'Columns'], schemaRows),
    '',
  ].join('\n');
}

async function main() {
  const outArgIndex = process.argv.indexOf('--out');
  const outFile = outArgIndex >= 0 ? path.resolve(process.argv[outArgIndex + 1]) : DEFAULT_OUT;
  const env = readEnv(ENV_FILE);
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or Supabase API key in .env.local');
  }

  const db = new SupabaseReader(env.NEXT_PUBLIC_SUPABASE_URL, key);
  const snapshot = await buildSnapshot(db);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, renderMarkdown(snapshot), 'utf8');
  console.log(`Wrote ${path.relative(ROOT, outFile)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

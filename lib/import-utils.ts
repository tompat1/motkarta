export function sql(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

export function numericOrNull(value: unknown) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return 'NULL';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "NULL";
}

export function parseCsv(source: string) {
  const records: string[][] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  const text = source.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      cells.push(cell);
      if (cells.some((value) => value.trim())) records.push(cells);
      cells = []; cell = '';
      if (char === '\r' && next === '\n') index += 1;
      continue;
    }
    cell += char;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  cells.push(cell);
  if (cells.some((value) => value.trim())) records.push(cells);
  const headers = records.shift();
  if (!headers) return [];
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV headers');
  return records.map((row) => {
    if (row.length !== headers.length) throw new Error('CSV column count mismatch');
    return Object.fromEntries(headers.map((header, index) => [header, row[index]]));
  });
}

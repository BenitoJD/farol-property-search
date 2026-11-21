/**
 * Small, dependency-free CSV reader/writer. Handles quoted fields, escaped
 * quotes and CRLF. Enough for the source-list import used by the flow.
 */
export function parseCsv(text) {
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

export function csvToObjects(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) =>
    header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  );
  return rows.slice(1).map((cells) => {
    const object = {};
    headers.forEach((header, index) => {
      if (!header) return;
      object[header] = (cells[index] ?? '').trim();
    });
    return object;
  });
}

function escapeCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  // Prevent spreadsheet formula injection from user-controlled text.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(rows, columns) {
  const lines = [columns.map((column) => escapeCell(column.label)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row))).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

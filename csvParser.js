'use strict';
const fs = require('fs');
const { parse } = require('csv-parse/sync');

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((row, i) => ({
    id:          String(row.id || i + 1),
    action:      (row.action || '').toLowerCase().trim(),
    target:      row.target   || '',
    value:       row.value    || '',
    expected:    row.expected || '',
    description: row.description || `Step ${i + 1}`,
  }));
}

module.exports = { parseCSV };

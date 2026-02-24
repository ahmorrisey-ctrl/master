function currency(amount) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '$0.00';
  const sign = num < 0 ? '-' : '';
  return sign + '$' + Math.abs(num).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function percentage(value, total) {
  if (total === 0) return '0.0%';
  return ((value / total) * 100).toFixed(1) + '%';
}

function dateStr(date) {
  if (typeof date === 'string') date = new Date(date);
  return date.toISOString().split('T')[0];
}

function monthKey(date) {
  if (typeof date === 'string') date = new Date(date);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function pad(str, len, align = 'left') {
  str = String(str);
  if (str.length >= len) return str.substring(0, len);
  const diff = len - str.length;
  if (align === 'right') return ' '.repeat(diff) + str;
  if (align === 'center') {
    const left = Math.floor(diff / 2);
    return ' '.repeat(left) + str + ' '.repeat(diff - left);
  }
  return str + ' '.repeat(diff);
}

function colorize(text, color) {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    reset: '\x1b[0m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
  };
  return (colors[color] || '') + text + '\x1b[0m';
}

function progressBar(value, max, width = 30) {
  const ratio = Math.min(value / max, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  let color;
  if (ratio < 0.5) color = '\x1b[32m';
  else if (ratio < 0.8) color = '\x1b[33m';
  else color = '\x1b[31m';
  return color + '█'.repeat(filled) + '\x1b[90m' + '░'.repeat(empty) + '\x1b[0m';
}

function sparkline(values) {
  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map(v => {
    const idx = Math.round(((v - min) / range) * (chars.length - 1));
    return chars[idx];
  }).join('');
}

function table(headers, rows, columnWidths) {
  if (!columnWidths) {
    columnWidths = headers.map((h, i) => {
      const maxRow = rows.reduce((max, r) => Math.max(max, String(r[i] || '').length), 0);
      return Math.max(h.length, maxRow) + 2;
    });
  }

  const sep = colorize('─'.repeat(columnWidths.reduce((a, b) => a + b + 1, 1)), 'gray');
  const lines = [];

  lines.push(sep);
  lines.push(
    colorize('│', 'gray') +
    headers.map((h, i) => colorize(pad(h, columnWidths[i], 'center'), 'bold')).join(colorize('│', 'gray')) +
    colorize('│', 'gray')
  );
  lines.push(sep);

  for (const row of rows) {
    lines.push(
      colorize('│', 'gray') +
      row.map((cell, i) => {
        const str = String(cell || '');
        const align = str.startsWith('$') || str.startsWith('-$') || str.match(/^\d/) ? 'right' : 'left';
        return pad(str, columnWidths[i], align);
      }).join(colorize('│', 'gray')) +
      colorize('│', 'gray')
    );
  }

  lines.push(sep);
  return lines.join('\n');
}

module.exports = { currency, percentage, dateStr, monthKey, pad, colorize, progressBar, sparkline, table };

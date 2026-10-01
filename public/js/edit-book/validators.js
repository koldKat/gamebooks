export function validateIsbn(raw) {
  const s = raw.replace(/[\s\-]/g, '').toUpperCase();
  if (!s) return '';
  if (s.length === 10) {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      const d = parseInt(s[i], 10);
      if (isNaN(d)) return null;
      sum += d * (10 - i);
    }
    const last = s[9] === 'X' ? 10 : parseInt(s[9], 10);
    if (isNaN(last)) return null;
    if ((sum + last) % 11 !== 0) return null;
    return s;
  }
  if (s.length === 13) {
    if (!/^\d{13}$/.test(s)) return null;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(s[i], 10) * (i % 2 === 0 ? 1 : 3);
    const check = (10 - (sum % 10)) % 10;
    if (parseInt(s[12], 10) !== check) return null;
    return s;
  }
  return null;
}

export function validateIssn(raw) {
  const s = raw.replace(/[\s\-]/g, '').toUpperCase();
  if (!s) return '';
  if (s.length !== 8) return null;
  if (!/^\d{7}[\dX]$/.test(s)) return null;
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += parseInt(s[i], 10) * (8 - i);
  const check = (11 - (sum % 11)) % 11;
  const lastChar = check === 10 ? 'X' : String(check);
  if (s[7] !== lastChar) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function validateAsin(raw) {
  const s = raw.replace(/\s/g, '').toUpperCase();
  if (!s) return '';
  if (!/^[A-Z0-9]{10}$/.test(s)) return null;
  return s;
}

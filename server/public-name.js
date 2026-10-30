'use strict';

// Keep public server-rendered name labels aligned with the browser formatter.
function publicName(value) {
  const name = String(value ?? '');
  const email = /^([^\s@<>(),;:"\\\[\]]+)@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.exec(name.trim());
  return email ? email[1] : name;
}

module.exports = { publicName };

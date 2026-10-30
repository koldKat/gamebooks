// Format public name labels without the domain of an email-shaped username.
export function publicName(value) {
  const name = String(value ?? '');
  const email = /^([^\s@<>(),;:"\\\[\]]+)@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.exec(name.trim());
  return email ? email[1] : name;
}

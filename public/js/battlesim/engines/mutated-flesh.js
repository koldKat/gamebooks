export function mutatedFleshWon(d) {
  return d.enemy.life <= (d.rulesVersion === 1 && d.enemyId === 'lenova' ? 8 : 0);
}

export function mutatedFleshRound(d, weapon, defend, roll) {
  if (d.player.life <= 0 || mutatedFleshWon(d)) return [];
  if (weapon.ammoMax != null && d.ammo[weapon.id] <= 0) return [];
  const printed = d.rulesVersion === 1;
  const events = [];
  d.started = true;
  d.weaponId = weapon.id;
  if (!defend || printed) {
    if (weapon.ammoMax != null) d.ammo[weapon.id] -= 1;
    let bonus = weapon.bonus;
    if (printed && d.section99Weapons) {
      if (weapon.id === 'axe') bonus = 6;
      if (weapon.id === 'chainsaw') bonus = 15;
    }
    const die = defend ? 0 : printed && d.averageDamage ? 3 : roll();
    const averageExtra = printed && !defend && d.averageDamage && d.section20Pistol && weapon.id === 'pistol' ? 1 : 0;
    const damage = Math.max(0, die + bonus + d.player[weapon.stat] + averageExtra);
    d.enemy.life = Math.max(0, d.enemy.life - damage);
    events.push({side:'player',damage,die,weapon:weapon.name,life:d.enemy.life});
  }
  if (!mutatedFleshWon(d)) {
    if (printed && d.openingFreeHit) {
      d.openingFreeHit = false;
    } else {
      const reduction = (defend ? Math.max(0,d.player.physique) : 0) + (printed && d.riotArmour ? 2 : 0);
      const damage = Math.max(0,d.enemy.dmg - reduction);
      d.player.life = Math.max(0,d.player.life - damage);
      events.push({side:'enemy',damage,reduction,life:d.player.life});
    }
  }
  return events;
}

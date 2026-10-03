// Shared English strings for the Cretan Chronicles MIGHT/PROTECTION simulators
// (books 400, 401, 402). Each per-book i18n module calls buildCretanStrings with
// its own battlesimNNN prefix so the keys retain their battlesimNNN namespace,
// while the wound-track stage names stay on a shared battlesim.cretan prefix.
export function buildCretanStrings(prefix) {
  const p = `${prefix}.`;
  return {
    // Shared wound-track stage names (identical across every Cretan book).
    'battlesim.cretan.stage_healthy': 'Healthy',
    'battlesim.cretan.stage_wounded': 'Wounded',
    'battlesim.cretan.stage_serious': 'Seriously Wounded',
    'battlesim.cretan.stage_dead':    'Dead',

    [p + 'ui.you']:            'Altheus (you)',
    [p + 'ui.enemy']:          'Opponent',
    [p + 'ui.pick']:           'Pick',
    [p + 'ui.natural_might']:  'Natural MIGHT',
    [p + 'ui.weapon_might']:   'Weapon MIGHT',
    [p + 'ui.natural_prot']:   'Natural PROTECTION',
    [p + 'ui.armour']:         'Armour PROTECTION',
    [p + 'ui.divine_weapon']:  'Divine weapon',
    [p + 'ui.wound']:          'Wound Record',
    [p + 'ui.honour']:         'HONOUR',
    [p + 'ui.honour_to_might']:'HONOUR → MIGHT (next strike)',
    [p + 'ui.honour_to_prot']: 'HONOUR → PROTECTION (next strike)',
    [p + 'ui.honour_reward']:  'HONOUR reward on victory',
    [p + 'ui.might']:          'MIGHT',
    [p + 'ui.protection']:     'PROTECTION',
    [p + 'ui.companions']:     'Surviving companions (+MIGHT)',
    [p + 'ui.needs_divine']:   'Needs divine weapon to hit',
    [p + 'ui.effective']:      'Effective MIGHT {might} · PROTECTION {prot}',
    [p + 'ui.effective_foe']:  'Effective MIGHT {might} · PROTECTION {prot}',

    [p + 'btn.strike']:        'Fight a round',
    [p + 'btn.reset']:         'Reset',

    [p + 'status.pick']:       'Pick an opponent to begin.',
    [p + 'status.pankration']: 'This encounter is the Pankration boxing match (section 355), a separate block-and-target sub-system, not the MIGHT/PROTECTION duel. Play it on paper; it is not simulated here.',
    [p + 'status.fighting']:   'You are {you}. {enemy} is {estate}.',
    [p + 'status.victory']:    'Victory!',
    [p + 'status.defeat']:     'Altheus has fallen.',

    [p + 'log.round']:         '── Round {round} ──',
    [p + 'log.spent_might']:   'You spend {n} HONOUR to boost MIGHT this strike (HONOUR {honour}).',
    [p + 'log.spent_prot']:    'You spend {n} HONOUR to boost PROTECTION this strike (HONOUR {honour}).',
    [p + 'log.one_die']:       'one die',
    [p + 'log.two_dice']:      'two dice',
    [p + 'log.strike_hit']:    '{who} strikes {target}: {dice} ({kind}) = {total} - HIT.',
    [p + 'log.strike_miss']:   '{who} strikes {target}: {dice} ({kind}) = {total} - miss.',
    [p + 'log.auto_hit']:      '{who} strikes {target}: rolled {dice} - automatic HIT (11-12).',
    [p + 'log.auto_miss']:     '{who} strikes {target}: rolled {dice} - automatic miss.',
    [p + 'log.nodivine']:      'Your weapon passes through {enemy} without harm; only a divine weapon can wound it.',
    [p + 'log.foe_wounded']:   "{enemy}'s Wound Record advances to {state}.",
    [p + 'log.you_wounded']:   'Your Wound Record advances to {state}.',
    [p + 'log.victory']:       '{enemy} is slain!',
    [p + 'log.honour_reward']: 'You gain {n} HONOUR for the victory (HONOUR {honour}).',
    [p + 'log.wound_reset']:   'You survive: your Wound Record returns to Healthy.',
    [p + 'log.defeat']:        'Altheus falls in battle.',
    [p + 'log.reset_sep']:     '──────────',
    [p + 'log.reset']:         'Battle reset. Wound Records restored; HONOUR restored to its starting value.',

    [p + 'history.summary']:   'Battle History ({n})',
    [p + 'history.empty']:     'No finished battles yet.',
    [p + 'history.won']:       'won',
    [p + 'history.lost']:      'lost',
  };
}

// English source terminology for the reusable Fatemaster encounter sheet.
const labels={
 encounter:'Encounter',custom:'Custom encounter',variant:'Encounter variant',current_player:'Your current combat stats',
 strength:'Strength',agility:'Agility',power:'Power',strength_score:'Strength score (maximum)',agility_score:'Agility score (maximum)',power_score:'Power score (maximum)',
 damage:'Damage',attack_adjustment:'Attack adjustment',weapon_attack:'Weapon Attack modifier',defence_adjustment:'Defence adjustment',attack_bonus:'Attack Bonus',defence_bonus:'Defence Bonus',
 weapon:'Weapon',manual_gear:'Enter current weapon damage and modifiers',weapon_kind:'Weapon type',normal:'Normal',silver:'Silver',magic:'Magical',
 renewal_ring:'I have a Ring of Renewal',healing_scroll:'I have an unused Healing Scroll',invisibility_scroll:'I have an unused Invisibility Scroll',
 already_invisible:'Already invisible to these opponents',not_seen:'My opponents have not seen me yet',opening_applied:'The printed opening damage has already been applied',opponent_sleeping:'The opponent is still asleep',
 initiative:'First turn',player_first:'Player first',enemy_first:'Opponent first',counter_bolt_dice:'Dice for the bolt after a missed attack',choose_dice:'Choose 1, 2 or 3 dice',
 counter_bolt_note:'This passage does not specify the missed-attack bolt’s dice. Choose the number explicitly. The separate bolt while casting uses its printed dice.',
 setup_note:'Choose an optional book encounter or enter custom opponents. Use your current points and owned equipment. Story choices and consequences remain in the reader.',
 opponent:'Opponent',start:'Start encounter',end:'End encounter',end_confirm:'End this encounter without recording a victory or defeat?',check_values:'Check the entered combat values.',
 threshold_pause:'The printed threshold has been reached. Consult the indicated reader section. This is not a simulator victory.',reader_pause:'Combat is paused. Resolve the printed consequences in the reader before resuming.',resume:'Resume this encounter',
 choose_damage:'Choose which pool loses {amount} points.',allocate:'Select whole opponents within the {budget}-point spell budget. An opponent not fully covered is unchanged.',apply_allocation:'Apply spell allocation',resolve_spell:'Resolve the spell',resolve:'Resolve roll',
 dice:'{count}d6 total (leave blank to roll)',target:'Target',attack:'Attack',finish_helpless:'Defeat helpless opponent',flee:'Attempt to withdraw',disengage:'Leave without attacking',
 spells:'Combat spells',spell:'Spell',spell_source:'Use',scroll:'Owned scroll',bolt_power:'Power spent on Power Bolt',healing_pool:'Pool to heal',footsteps_action:'Unseen Footsteps action',automatic_hit:'Automatic hit',cast:'Cast spell',
 change_weapon:'Replace or change weapon',equip:'Equip current weapon',combatant:'Combatant',combat_log:'Combat log',history:'Encounter history',ready:'Ready for an encounter',
 round:'Round {round}',roll_value:'Roll {value}',score_value:'Score {value}',damage_value:'Points {value}',hit:'Hit',miss:'Miss',resisted:'Resisted',not_resisted:'Not resisted',passed:'Passed',failed:'Failed',broken:'Broken',intact:'Intact',
 'escape.landing':'Escape to the landing (two opponent turns)','escape.bank':'Escape to the bank (one opponent turn)',
 'spell.healing':'Healing','spell.invisibility':'Invisibility','spell.footsteps':'Unseen Footsteps','spell.bolt':'Power Bolt','spell.slumber':'Slumber','spell.repel':'Repel Undead','spell.light':'Light',
 'pending.enemy':'Opponent attack','pending.poison':'Poison check','pending.weapon-break':'Weapon-break check','pending.escape':'Withdrawal check','pending.hostile-save':'Power defence against the hostile spell','pending.hostile-damage':'Hostile spell damage','pending.spell-dice':'Spell dice','pending.spell-save':'Opponent’s Power defence',
 'condition.unconscious':'Unconscious','condition.asleep':'Asleep','condition.helpless':'Helpless','condition.repelled':'Repelled','condition.dormant':'Sleeping',
 'status.fighting':'Encounter in progress','status.win':'Victory','status.loss':'Defeat','status.paused':'Paused for the reader','status.withdrawn':'Withdrawn','status.cancelled':'Encounter ended',
};
const events={
 start:'Encounter started','player-attack':'Your attack','enemy-attack':'Opponent attack','player-damage':'Your points lost',
 'weapon-check':'Weapon checked','poison-check':'Poison checked','escape-check':'Withdrawal checked','hostile-save':'Hostile spell defence','hostile-bolt':'Hostile Power Bolt',
 'escape-attempt':'Withdrawal attempted',disengaged:'Left without attacking','weapon-equipped':'Weapon equipped','helpless-opponent-defeated':'Helpless opponent defeated',cancelled:'Encounter ended',resumed:'Encounter resumed',
 'spell-start':'Casting started','footsteps-escape':'Unseen Footsteps withdrawal','footsteps-hit':'Unseen Footsteps hit','casting-frenzy':'Opponent enraged by casting','opponents-awakened':'Opponent awakened',
 'spell-finish':'Casting completed','spell-failed':'Spell failed or was interrupted',healing:'Points restored','opponents-helpless':'Opponents made helpless','spell-no-combat-effect':'Resolve this spell’s noncombat effect in the reader',
 'spell-dice':'Spell dice rolled','spell-allocation':'Spell targets allocated','opponent-spell-save':'Opponent’s spell defence','spell-effect':'Spell applied',drain:'Points drained',
};
export default {
 'battlesim1476.title':'Treachery in Drakenwood Battle Simulator',
 ...Object.fromEntries(Object.entries(labels).map(([key,value])=>['battlesim.fatemaster.'+key,value])),
 ...Object.fromEntries(Object.entries(events).map(([key,value])=>['battlesim.fatemaster.event.'+key,value])),
};

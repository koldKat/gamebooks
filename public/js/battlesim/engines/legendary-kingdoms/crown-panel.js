import { createLegendaryPanel } from './panel.js';
import { CROWN_PROFILES, newCrownCharacter, newCrownCustomCharacter, legendaryInteger } from './character.js';
import { LEGENDARY_SPELLS, CROWN_STARTING_SPELLS, chooseCrownStartingSpells,
  learnLegendarySpell, learnCrownApprenticeSpell } from './spells.js';
import { CROWN_FIGHTS, startCrownFight } from './crown.js';
import { CROWN_ARMIES, CROWN_NAVAL, startCrownArmy, startCrownNaval } from './crown-strategy.js';
import { mountCrownActions, readCrownRecipient, readCrownArmourAllocation } from './crown-actions.js';
import { mountCrownSetup, readCrownPersonalOptions, readCrownHero, readCrownUnit } from './crown-setup.js';

export function createCrownPanel(dependencies) {
  return createLegendaryPanel(dependencies,{
    bookId:690,allowSkullcracker:false,selectStrategySpell:true,limitArmyCasters:true,
    fights:CROWN_FIGHTS,armies:CROWN_ARMIES,naval:CROWN_NAVAL,
    startFight:startCrownFight,startArmy:startCrownArmy,startNaval:startCrownNaval,
    spells:LEGENDARY_SPELLS,checkBoostSpells:{stealth:'nightcrawler'},
    partySetup:{profiles:CROWN_PROFILES,newCharacter:newCrownCharacter,newCustomCharacter:newCrownCustomCharacter,
      chooseStartingSpells:chooseCrownStartingSpells,startingSpells:CROWN_STARTING_SPELLS,maxSkill:7,
      customSkills:[7,3,3,3,3],casterSkills:[1,3,7,2,2]},
    personalOptions:readCrownPersonalOptions,heroOptions:readCrownHero,unitOptions:readCrownUnit,
    shipOptions:({number}) => ({cargo:legendaryInteger(number('shipCargo'))}),
    readRecipient:readCrownRecipient,assignOptions:readCrownArmourAllocation,
    recipientRows:({fight,rows}) => fight?.status==='active'&&fight.kind==='personal'&&fight.pending&&
      fight.companion&&!fight.companion.injured&&fight.pending.forcedMember===undefined&&
      !fight.pending.unpreventable&&!fight.pending.stunOnly ? [...rows,['companion',fight.companion.name]] : rows,
    learnSpell:(hero,id,{el}) => el('apprenticeBook').checked ? learnCrownApprenticeSpell(hero,id) : learnLegendarySpell(hero,id),
    mount(api) {
      const setup = mountCrownSetup(api),actions = mountCrownActions(api);
      api.el('learnSpell').closest('label').before(api.document.createRange().createContextualFragment(api.check('apprenticeBook')));
      const notice = api.document.createElement('p');
      notice.id = api.ID+'-fleetManual';notice.textContent = api.tk('fleetManual');
      api.el('context').closest('label').after(notice);
      return {render(game) {
        setup.render(game);actions.render(game);
        notice.hidden = api.el('mode').value !== 'naval';
      }};
    },
  });
}

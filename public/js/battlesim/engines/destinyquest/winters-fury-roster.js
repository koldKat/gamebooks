// Source-reviewed encounter data. Nulls are printed dashes, never invented stats.
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
export const WINTER_ROSTER_SOURCE_SHA256 = "282b5d62e581cac059f59f5d73b2b43d6479def833353d40db6cf2cb3bffc00c";
export const WINTER_ENCOUNTERS = freeze([
  {
    "section": "30",
    "label": "Nightmare (§30)",
    "parts": [
      {
        "key": "30-0",
        "name": "Nightmare",
        "sourceValues": {
          "Speed": "0",
          "Magic": "1",
          "Armour": "0",
          "Health": "12"
        },
        "variants": {},
        "speed": 0,
        "magic": 1,
        "damageStat": "magic",
        "armour": 0,
        "health": 12,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "If you manage to overcome this shadowy nemesis, turn to 84 ."
    ]
  },
  {
    "section": "34",
    "label": "Fengle (§34)",
    "parts": [
      {
        "key": "34-0",
        "name": "Fengle",
        "sourceValues": {
          "Speed": "1",
          "Brawn": "0",
          "Armour": "0",
          "Health": "8"
        },
        "variants": {},
        "speed": 1,
        "brawn": 0,
        "damageStat": "brawn",
        "armour": 0,
        "health": 8,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "If you manage to defeat the Fengle, remember to restore your health then turn to 73 ."
    ]
  },
  {
    "section": "37",
    "label": "Alpha (§37)",
    "parts": [
      {
        "key": "37-0",
        "name": "Alpha",
        "sourceValues": {
          "Speed": "0",
          "Brawn": "1",
          "Armour": "0",
          "Health": "15"
        },
        "variants": {},
        "speed": 0,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 0,
        "health": 15,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Pack leader : The alpha rerolls all [1] results, accepting the result of the reroll.",
      "Wounded : At the end of each combat round, the alpha must lose 1 health from the wounds that it has already suffered. If you manage to defeat this powerful predator, turn to 298 ."
    ]
  },
  {
    "section": "41",
    "label": "Drakeling (§41)",
    "parts": [
      {
        "key": "41-0",
        "name": "Drakeling",
        "sourceValues": {
          "Speed": "3",
          "Magic": "2",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {},
        "speed": 3,
        "magic": 2,
        "damageStat": "magic",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "41-1",
        "name": "Drakeling",
        "sourceValues": {
          "Speed": "3",
          "Magic": "2",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {},
        "speed": 3,
        "magic": 2,
        "damageStat": "magic",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "41-2",
        "name": "Drakeling",
        "sourceValues": {
          "Speed": "3",
          "Magic": "2",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {},
        "speed": 3,
        "magic": 2,
        "damageStat": "magic",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Acid spray : The drakelings are covering the tower with their deadly acid, leaving you little room to manoeuvre. At the end of the first combat round, roll a die. If the result is [1] you have been hit and must take 4 damage, ignoring armour . In each subsequent combat round, the chance to be hit increases by 1. In round two, you are hit on a roll of [1] or [2] , on round three, [1] to [3] and so on.",
      "Pyromania !: Segg and his phoenix cause 2 damage, ignoring armour , to each drakeling at the end of every combat round.",
      "If you manage to defeat this monstrous swarm, turn to 520 ."
    ]
  },
  {
    "section": "48",
    "label": "Kraken (§48)",
    "parts": [
      {
        "key": "48-0",
        "name": "Kraken",
        "sourceValues": {
          "Speed": "12",
          "Brawn": "6",
          "Armour": "7",
          "Health": "90(*)"
        },
        "variants": {},
        "speed": 12,
        "brawn": 6,
        "damageStat": "brawn",
        "armour": 7,
        "health": 90,
        "role": "opponent"
      },
      {
        "key": "48-1",
        "name": "Tentacle",
        "sourceValues": {
          "Speed": "13",
          "Brawn": "8",
          "Armour": "4",
          "Health": "30"
        },
        "variants": {},
        "speed": 13,
        "brawn": 8,
        "damageStat": "brawn",
        "armour": 4,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "48-2",
        "name": "Tentacle",
        "sourceValues": {
          "Speed": "13",
          "Brawn": "8",
          "Armour": "4",
          "Health": "30"
        },
        "variants": {},
        "speed": 13,
        "brawn": 8,
        "damageStat": "brawn",
        "armour": 4,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "48-3",
        "name": "Tentacle",
        "sourceValues": {
          "Speed": "13",
          "Brawn": "8",
          "Armour": "4",
          "Health": "30"
        },
        "variants": {},
        "speed": 13,
        "brawn": 8,
        "damageStat": "brawn",
        "armour": 4,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "48-4",
        "name": "Tentacle",
        "sourceValues": {
          "Speed": "13",
          "Brawn": "8",
          "Armour": "4",
          "Health": "30"
        },
        "variants": {},
        "speed": 13,
        "brawn": 8,
        "damageStat": "brawn",
        "armour": 4,
        "health": 30,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Under pressure : If the tentacles are not defeated by the end of the fourth combat round, you are dragged into the jaws of the kraken. This inflicts 4 dice of damage, ignoring armour , and reduces the stability and toughness of your transport by 2. This cycle repeats every four combat rounds until the tentacles are defeated.",
      "Thrash it out : (*) The kraken cannot be harmed until the four tentacles have been defeated.",
      "Fire at will : You may use your nail gun ability in this combat. (Note: If your transport’s stability has been reduced to zero, you can no longer use its associated ability.)",
      "If you manage to overcome the tentacled horror, turn to 238 ."
    ]
  },
  {
    "section": "49",
    "label": "Ice tomb (§49)",
    "parts": [
      {
        "key": "49-0",
        "name": "Ice tomb",
        "sourceValues": {
          "Speed": "14",
          "Brawn": "7",
          "Armour": "16",
          "Health": "30"
        },
        "variants": {},
        "speed": 14,
        "brawn": 7,
        "damageStat": "brawn",
        "armour": 16,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "49-1",
        "name": "Ice tomb",
        "sourceValues": {
          "Speed": "14",
          "Brawn": "7",
          "Armour": "16",
          "Health": "30"
        },
        "variants": {},
        "speed": 14,
        "brawn": 7,
        "damageStat": "brawn",
        "armour": 16,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "49-2",
        "name": "Ice tomb",
        "sourceValues": {
          "Speed": "13",
          "Brawn": "8",
          "Armour": "16",
          "Health": "25"
        },
        "variants": {},
        "speed": 13,
        "brawn": 8,
        "damageStat": "brawn",
        "armour": 16,
        "health": 25,
        "role": "opponent"
      },
      {
        "key": "49-3",
        "name": "Ice tomb",
        "sourceValues": {
          "Speed": "13",
          "Brawn": "8",
          "Armour": "16",
          "Health": "25"
        },
        "variants": {},
        "speed": 13,
        "brawn": 8,
        "damageStat": "brawn",
        "armour": 16,
        "health": 25,
        "role": "opponent"
      },
      {
        "key": "49-4",
        "name": "Ice tomb",
        "sourceValues": {
          "Speed": "13",
          "Brawn": "8",
          "Armour": "16",
          "Health": "25"
        },
        "variants": {},
        "speed": 13,
        "brawn": 8,
        "damageStat": "brawn",
        "armour": 16,
        "health": 25,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Smash it up : If you win a combat round against an ice tomb, instead of rolling for a damage score you can choose to smash the ice, reducing your opponent’s armour score by 4 each time.",
      "Outnumbered : At the end of each combat round, you must take 1 damage from each surviving opponent, ignoring armour . This ability only applies while you are faced with multiple opponents.",
      "If you manage to defeat these tortured souls, turn to 514 . (Special achievement: If you defeat the ice tombs without lowering their armour , turn to 779 .)"
    ]
  },
  {
    "section": "54",
    "label": "Alpha (§54)",
    "parts": [
      {
        "key": "54-0",
        "name": "Alpha",
        "sourceValues": {
          "Speed": "1",
          "Brawn": "1",
          "Armour": "1",
          "Health": "15"
        },
        "variants": {},
        "speed": 1,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 15,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Pack leader : The alpha rerolls all [1] results, accepting the result of the reroll.",
      "Wounded : At the end of each combat round, the alpha must lose 1 health from the wounds that it has already suffered.",
      "If you manage to defeat the alpha wolf, turn to 273 ."
    ]
  },
  {
    "section": "70",
    "label": "Sabre cub (§70)",
    "parts": [
      {
        "key": "70-0",
        "name": "Sabre cub",
        "sourceValues": {
          "Speed": "1",
          "Brawn": "2",
          "Armour": "0",
          "Health": "30(*)"
        },
        "variants": {},
        "speed": 1,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 0,
        "health": 30,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "(*) Once the cub is reduced to 10 health or less, it will bolt into the grass, fleeing the combat. If you are victorious, turn to 364 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "76",
    "label": "Rattle (§76)",
    "parts": [
      {
        "key": "76-0",
        "name": "Rattle",
        "sourceValues": {
          "Speed": "1",
          "Brawn": "1",
          "Armour": "2",
          "Health": "18"
        },
        "variants": {},
        "speed": 1,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 2,
        "health": 18,
        "role": "opponent"
      },
      {
        "key": "76-1",
        "name": "Ruin",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "2",
          "Armour": "1",
          "Health": "15"
        },
        "variants": {},
        "speed": 2,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 1,
        "health": 15,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Blood brothers : When the first undead is defeated, the remaining zombie goes into a fit of rage, increasing its speed and brawn by 1 for the remainder of the combat.",
      "If you manage to defeat the undead guardsmen turn to 448 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "83",
    "label": "Roc (§83)",
    "parts": [
      {
        "key": "83-0",
        "name": "Roc",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "1",
          "Armour": "1",
          "Health": "25"
        },
        "variants": {},
        "speed": 2,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 25,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Perilous plunge : If the roc wins a combat round, roll a die. If the result is [2] or less, instead of rolling for a damage score, the roc picks you up in its talons, flies up into the air, then throws you back to the ground. This attack causes 5 damage, ignoring armour , and lowers your speed by 1 in the next combat round. (You cannot use a dodge ability, such as evade or vanish to avoid this.) If the result is [3] or more, the roc rolls for a damage score instead.",
      "If you manage to overcome this bird of prey, turn to 356 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "85",
    "label": "Sentinel eye (§85)",
    "parts": [
      {
        "key": "85-0",
        "name": "Sentinel eye",
        "sourceValues": {
          "Speed": "13",
          "Magic": "8",
          "Armour": "5",
          "Health": "40(*)"
        },
        "variants": {},
        "speed": 13,
        "magic": 8,
        "damageStat": "magic",
        "armour": 5,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "85-1",
        "name": "Sentinel wings",
        "sourceValues": {
          "Speed": "13",
          "Magic": "6",
          "Armour": "7",
          "Health": "60"
        },
        "variants": {},
        "speed": 13,
        "magic": 6,
        "damageStat": "magic",
        "armour": 7,
        "health": 60,
        "role": "opponent"
      },
      {
        "key": "85-2",
        "name": "Acid proboscis",
        "sourceValues": {
          "Speed": "12",
          "Magic": "5",
          "Armour": "9",
          "Health": "30"
        },
        "variants": {},
        "speed": 12,
        "magic": 5,
        "damageStat": "magic",
        "armour": 9,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "85-3",
        "name": "Oil proboscis",
        "sourceValues": {
          "Speed": "12",
          "Magic": "5",
          "Armour": "9",
          "Health": "30"
        },
        "variants": {},
        "speed": 12,
        "magic": 5,
        "damageStat": "magic",
        "armour": 9,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "85-4",
        "name": "Fire proboscis",
        "sourceValues": {
          "Speed": "12",
          "Magic": "5",
          "Armour": "9",
          "Health": "30"
        },
        "variants": {},
        "speed": 12,
        "magic": 5,
        "damageStat": "magic",
        "armour": 9,
        "health": 30,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Deadly ascent : This combat is played differently to a normal combat. In order to reach the sentinel you must first scale the tower whilst avoiding its gaze. To achieve this, you must take three speed challenges to reach the summit. Any time the result is 19 or less, you have been spotted – and must roll and apply the following damage/effect:",
      "[1] or [2] You are hit by the oil proboscis. This inflicts 1 damage die, ignoring armour , and reduces your speed by 2 for the next challenge test or combat round.",
      "[3] or [4] You are hit by the fire proboscis. This inflicts 1 damage die, ignoring armour . If, in the previous test or combat round, you were hit by oil, this damage is increased to 2 damage dice.",
      "[5] or [6] You are hit by the acid proboscis. This reduces your armour by 2 (each time) for the duration of the combat. Once your armour is reduced to zero, you must take 1 damage die instead.",
      "If a proboscis has already been defeated, you can ignore its effect and move onto the next challenge.",
      "If the result is 20 or more, you pass the challenge test. Once you have completed three challenges (passed or failed), you have reached the top and can attack the sentinel as normal, rolling for attack speed/damage etc.",
      "Blind the eye: (*) To win the combat you must defeat the sentinel eye by reducing its health to zero. However, you can only attack and apply damage to the sentinel eye once the wings and the three proboscises have been defeated. Otherwise, it is immune to all damage effects.",
      "Proboscis strikes: If you take health damage from a proboscis in regular combat, you must also apply its effect (see deadly ascent). For example, if you lost a combat round to the fire proboscis you would take damage from its damage score – and also roll an extra die for its fire effect.",
      "Wing buffet: If the sentinel wings and at least one proboscis are still in play, roll a die at the end of each combat round. If the result is [3] or less you are knocked back to the ground and must start your ascent again (see deadly ascent). [4] or more, there is no effect. (This ability only comes into effect once you are in regular combat with the sentinel.) If you manage to defeat this ocular menace turn to 588 ."
    ]
  },
  {
    "section": "91",
    "label": "The terrorstools (§91)",
    "parts": [
      {
        "key": "91-0",
        "name": "The terrorstools",
        "sourceValues": {
          "Speed": "0",
          "Brawn": "1",
          "Armour": "1",
          "Health": "12"
        },
        "variants": {},
        "speed": 0,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 12,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Spore clouds : You have been temporarily blinded. For the first two combat rounds only, you must lower your speed by 1.",
      "If you manage to defeat these fearsome fungi, remember to restore your health to full, then turn to 185 ."
    ]
  },
  {
    "section": "100",
    "label": "Pack dog (§100)",
    "parts": [
      {
        "key": "100-0",
        "name": "Pack dog",
        "sourceValues": {
          "speed": "2",
          "Brawn": "1",
          "Armour": "1",
          "Health": "12"
        },
        "variants": {},
        "speed": 2,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 12,
        "role": "opponent"
      },
      {
        "key": "100-1",
        "name": "Pack dog",
        "sourceValues": {
          "speed": "1",
          "Brawn": "1",
          "Armour": "1",
          "Health": "10"
        },
        "variants": {},
        "speed": 1,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 10,
        "role": "opponent"
      },
      {
        "key": "100-2",
        "name": "Pack dog",
        "sourceValues": {
          "speed": "0",
          "Brawn": "1",
          "Armour": "1",
          "Health": "10"
        },
        "variants": {},
        "speed": 0,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 10,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Outnumbered : At the end of each combat round, you must take 1 damage from each surviving opponent, ignoring armour . This ability only applies while you are faced with multiple opponents.",
      "If you manage to send these dogs packing, turn to 280 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "101",
    "label": "Sable (§101)",
    "parts": [
      {
        "key": "101-0",
        "name": "Sable",
        "sourceValues": {
          "Speed": "13",
          "Magic": "8",
          "Armour": "7",
          "Health": "80"
        },
        "variants": {},
        "speed": 13,
        "magic": 8,
        "damageStat": "magic",
        "armour": 7,
        "health": 80,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Might of chaos : Each time Sable wins a combat round, roll a die to determine the nature of his attack:",
      "[1] or [2] Sable heals himself instead of rolling for a damage score, restoring 5 health . (This cannot take him above his starting health of 80.)",
      "[3] or [4] Sable rolls for a damage score as normal.",
      "[5] or [6] Sable inflicts a curse on you. This causes three dice of damage to your hero, ignoring armour , and stops you playing any speed or combat abilities in the next combat round.",
      "If you manage to defeat the dark prince, turn to 658 ."
    ]
  },
  {
    "section": "107",
    "label": "Razor queen (§107)",
    "parts": [
      {
        "key": "107-0",
        "name": "Razor queen",
        "sourceValues": {
          "Speed": "13",
          "Brawn": "11",
          "Armour": "7",
          "Health": "40"
        },
        "variants": {},
        "speed": 13,
        "brawn": 11,
        "damageStat": "brawn",
        "armour": 7,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "107-1",
        "name": "Razor swam",
        "sourceValues": {
          "Speed": "12",
          "Brawn": "10",
          "Armour": "5",
          "Health": "60"
        },
        "variants": {},
        "speed": 12,
        "brawn": 10,
        "damageStat": "brawn",
        "armour": 5,
        "health": 60,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Queen in peril : At the end of each combat round, if the queen is still alive the swarm’s health is increased by 10. (Note: this ability can take the razor swarm above their starting health . Once the swarm is defeated, this ability no longer applies.)",
      "R The swarm : At the end of each combat round you must take 2 damage, ignoring armour . Once the swarm is defeated, this ability no longer applies.",
      "Fire at will : You may use your nail gun or dragon fire ability in this combat.",
      "If you manage to defeat the deadly swarm, turn to 754 . (If you are defeated, remember to record your defeat as normal on your hero sheet, then turn to 15 .)"
    ]
  },
  {
    "section": "118",
    "label": "Fire sprite (§118)",
    "parts": [
      {
        "key": "118-0",
        "name": "Fire sprite",
        "sourceValues": {
          "Speed": "2",
          "Magic": "2",
          "Armour": "2",
          "Health": "12"
        },
        "variants": {},
        "speed": 2,
        "magic": 2,
        "damageStat": "magic",
        "armour": 2,
        "health": 12,
        "role": "opponent"
      },
      {
        "key": "118-1",
        "name": "Fire sprite",
        "sourceValues": {
          "Speed": "2",
          "Magic": "2",
          "Armour": "2",
          "Health": "12"
        },
        "variants": {},
        "speed": 2,
        "magic": 2,
        "damageStat": "magic",
        "armour": 2,
        "health": 12,
        "role": "opponent"
      },
      {
        "key": "118-2",
        "name": "Fire sprite",
        "sourceValues": {
          "Speed": "2",
          "Magic": "2",
          "Armour": "2",
          "Health": "12"
        },
        "variants": {},
        "speed": 2,
        "magic": 2,
        "damageStat": "magic",
        "armour": 2,
        "health": 12,
        "role": "opponent"
      },
      {
        "key": "118-3",
        "name": "Candles (*)",
        "sourceValues": {
          "Speed": "–",
          "Magic": "–",
          "Armour": "–",
          "Health": "16"
        },
        "variants": {},
        "speed": null,
        "magic": null,
        "damageStat": "magic",
        "armour": null,
        "health": 16,
        "role": "resource"
      }
    ],
    "printedRules": [
      "Special abilities",
      "After burn : At the end of every combat round, each surviving sprite automatically inflicts 1 damage, ignoring armour .",
      "Black out (*): If you win a round, instead of rolling for a damage score against a fire sprite, you can attempt to snuff out the sixteen candles. Roll two dice to determine how many candles you are able to put out. Once all the candles are put out, the sprites no longer benefit from the after burn ability, and their magic and armour are reduced by 1.",
      "If you are able to defeat Segg’s elementals, then turn to 229 . Otherwise, you may repeat the combat or choose a different trainer (return to 369 to make your choice.)"
    ]
  },
  {
    "section": "135",
    "label": "Geomancer (§135)",
    "parts": [
      {
        "key": "135-0",
        "name": "Geomancer",
        "sourceValues": {
          "Speed": "4",
          "Magic": "3",
          "Armour": "2/5(*)",
          "Health": "35"
        },
        "variants": {
          "armour": [
            2,
            5
          ]
        },
        "speed": 4,
        "magic": 3,
        "damageStat": "magic",
        "armour": 2,
        "health": 35,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Stone shower : At the end of every combat round, the flying shards cause 2 damage to your hero, ignoring armour .",
      "Stone shield : At the start of the third combat round, the geomancer will cast stone shield , hardening its robes into a rock-like armour. This will add 3 to your opponent’s armour but lowers their speed by 1 for the remainder of the combat.",
      "If you manage to defeat this stone-flinging mage, turn to 251 ."
    ]
  },
  {
    "section": "141",
    "label": "Gargax crown (§141)",
    "parts": [
      {
        "key": "141-0",
        "name": "Gargax crown",
        "sourceValues": {
          "Speed": "5/3 (*)",
          "Brawn": "2",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {
          "speed": [
            5,
            3
          ]
        },
        "speed": 5,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "141-1",
        "name": "Gargax thoras",
        "sourceValues": {
          "Speed": "5/3 (*)",
          "Brawn": "2",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {
          "speed": [
            5,
            3
          ]
        },
        "speed": 5,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "141-2",
        "name": "Gargax legs",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "1",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {},
        "speed": 3,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Nip ’n’ tuck : If Gargax’s legs are reduced to zero health , the head and thorax speed are reduced to 3 for the remainder of the combat. If the thorax is destroyed, the acid rain ability no longer applies. If the crown is destroyed, you no longer suffer from mind fumble .",
      "Acid rain : At the end of each combat round, you must take 2 damage, ignoring armour .",
      "Mind fumble : You cannot play any speed or combat abilities while you are inflicted with mind fumble .",
      "If you have any tar barrels recorded on your hero sheet, you can use them at the end of a combat round. Each tar barrel causes 1 damage to all opponents, ignoring armour . You can use up to four barrels per combat round. (Remember to remove any used tar barrels from your hero sheet.)",
      "If you manage to defeat this demon of the underworld, turn to 445 ."
    ]
  },
  {
    "section": "152",
    "label": "Ember wild (§152)",
    "parts": [
      {
        "key": "152-0",
        "name": "Ember wild",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "2",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {},
        "speed": 3,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "152-1",
        "name": "Ember wild",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "2",
          "Armour": "2",
          "Health": "15"
        },
        "variants": {},
        "speed": 3,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 2,
        "health": 15,
        "role": "opponent"
      },
      {
        "key": "152-2",
        "name": "Ember wild",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "2",
          "Armour": "2",
          "Health": "15"
        },
        "variants": {},
        "speed": 3,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 2,
        "health": 15,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Combustion : When an ember wild is defeated it immediately explodes, inflicting 4 damage to your hero, ignoring armour .",
      "If you manage to defeat these hot-blooded horrors, turn to 537 ."
    ]
  },
  {
    "section": "154",
    "label": "Melusine (§154)",
    "parts": [
      {
        "key": "154-0",
        "name": "Melusine",
        "sourceValues": {
          "Speed": "14",
          "Magic": "8",
          "Armour": "10",
          "Health": "100"
        },
        "variants": {},
        "speed": 14,
        "magic": 8,
        "damageStat": "magic",
        "armour": 10,
        "health": 100,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Petrifying gaze : Roll four dice at the end of each combat round. For each [5] or [6] result, you must take damage equal to the roll, ignoring armour . For example, if you rolled two [5] ’s and a [6] you would take 16 damage. All other results are ignored. If you have an ability that lets you reroll dice (such as charm ), you may use this ability to affect the outcome.",
      "Fimbulwinter : If you have the Titan shield, Fimbulwinter, you only take damage from each [1] result you roll for petrifying gaze. For example, if you rolled three [1] ’s, you would take 3 damage. All other results are ignored.",
      "Insulated : If you have the insulated ability, you can reduce Melusine’s damage score by 3 (Note: this does not affect Melusine’s petrifying gaze ).",
      "If you manage to defeat the witch, turn to 706 ."
    ]
  },
  {
    "section": "159",
    "label": "Jogahh (§159)",
    "parts": [
      {
        "key": "159-0",
        "name": "Jogahh",
        "sourceValues": {
          "Speed": "8",
          "Magic": "9",
          "Armour": "10",
          "Health": "80"
        },
        "variants": {},
        "speed": 8,
        "magic": 9,
        "damageStat": "magic",
        "armour": 10,
        "health": 80,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Spit it out! : If you win a combat round, instead of rolling for damage you can dive into one of Jogahh’s mouths and attempt to remove an acorn. Roll a die – on a result of [3] or more, you have successfully removed the acorn, lowering Jogahh’s speed , magic and armour by 1. If the result is [2] or less, you fail – and must automatically take 4 damage (ignoring armour ) from Jogahh’s acidic secretions. You may remove up to three acorns over the course of the combat.",
      "If you manage to defeat this virulent growth, turn to 562 ."
    ]
  },
  {
    "section": "166",
    "label": "Hunter (§166)",
    "parts": [
      {
        "key": "166-0",
        "name": "Hunter",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "2",
          "Armour": "1",
          "Health": "30"
        },
        "variants": {},
        "speed": 2,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 1,
        "health": 30,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Element of surprise : In the first two combat rounds, the hunter’s speed is reduced to zero.",
      "If you manage to best this savage hunter, turn to 317 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "167",
    "label": "Pandora (§167)",
    "parts": [
      {
        "key": "167-0",
        "name": "Pandora",
        "sourceValues": {
          "Speed": "7",
          "Magic": "5",
          "Armour": "5",
          "Health": "50"
        },
        "variants": {},
        "speed": 7,
        "magic": 5,
        "damageStat": "magic",
        "armour": 5,
        "health": 50,
        "role": "opponent"
      },
      {
        "key": "167-1",
        "name": "Helpings hands",
        "sourceValues": {
          "Speed": "5",
          "Magic": "4",
          "Armour": "4",
          "Health": "25"
        },
        "variants": {},
        "speed": 5,
        "magic": 4,
        "damageStat": "magic",
        "armour": 4,
        "health": 25,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Helping hands : You must reduce your speed by 1 for the duration of this combat. Once the helping hands are defeated, this ability no longer applies.",
      "Pandora’s pain : At the end of each combat round you must take 2 damage, ignoring armour . Once Pandora is defeated, this ability no longer applies.",
      "You must defeat both Pandora and the helping hands to win the combat. If you manage to defeat this headstrong horror, turn to 284 ."
    ]
  },
  {
    "section": "174",
    "label": "The Keening (§174)",
    "parts": [
      {
        "key": "174-0",
        "name": "The Keening",
        "sourceValues": {
          "Speed": "4",
          "Magic": "4",
          "Armour": "3",
          "Health": "50"
        },
        "variants": {},
        "speed": 4,
        "magic": 4,
        "damageStat": "magic",
        "armour": 3,
        "health": 50,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Stalactite splinters : At the start of every third combat round, the keening mist showers you with fragments of ice. You must roll six dice. For each [1] or [2] result, you must automatically take 4 damage, ignoring armour . If you wish, you can spend a speed point to avoid any/all damage from the six rolls (your speed is restored at the end of the combat.)",
      "Wind fall : The wind is battering against you, driving you back towards the edge of the ice shelf. If the keening is not defeated by the end of the seventh combat round, you are sent hurtling out into the snow-whipped skies. This automatically loses you the combat.",
      "If you manage to defeat this chilling opponent, turn to 352 . If you are defeated, you are thrown back out of the cave. Record the defeat on your hero sheet, then return to 361 ."
    ]
  },
  {
    "section": "175",
    "label": "Mud snake (§175)",
    "parts": [
      {
        "key": "175-0",
        "name": "Mud snake",
        "sourceValues": {
          "Speed": "0",
          "Brawn": "1",
          "Armour": "0",
          "Health": "14"
        },
        "variants": {},
        "speed": 0,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 0,
        "health": 14,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Mud bath : You must lower your speed by 1 for the duration of this combat.",
      "Weak venom : If you take health damage from the snake, roll a die. On a [1] result you are inflicted with venom and must lose a further 2 health at the end of each combat round for the duration of the combat. If you roll [2] or more, the venom has no effect. Once inflicted with venom, there is no need to roll in future rounds. You can use your charm special ability if you wish, to reroll the venom result (remember, you can only use each charm ability once per combat).",
      "If you manage to defeat the mud snake, remember to restore your health then turn to 140 ."
    ]
  },
  {
    "section": "184",
    "label": "Nisse troll (§184)",
    "parts": [
      {
        "key": "184-0",
        "name": "Nisse troll",
        "sourceValues": {
          "Speed": "4",
          "Brawn": "3",
          "Armour": "3",
          "Health": "20"
        },
        "variants": {},
        "speed": 4,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 3,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "184-1",
        "name": "Nisse warrior",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "2",
          "Armour": "2(*)",
          "Health": "15"
        },
        "variants": {},
        "speed": 3,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 2,
        "health": 15,
        "role": "opponent"
      },
      {
        "key": "184-2",
        "name": "Nisse warrior",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "2",
          "Armour": "2(*)",
          "Health": "15"
        },
        "variants": {},
        "speed": 3,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 2,
        "health": 15,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Petrifying peril : The warriors are coating themselves in stone. At the end of each combat round, their armour is raised by 1 – up to a maximum of 5.",
      "Regeneration : The troll heals 2 health at the end of each combat round. Once the troll is reduced to zero health , this ability no longer applies. (This cannot take the troll above its starting health of 20.)",
      "Outnumbered : At the end of each combat round, you must take 1 damage from each surviving opponent, ignoring armour . This ability only applies while you are faced with multiple opponents.",
      "If you have any tar barrels recorded on your hero sheet, you can use them at the end of a combat round. Each tar barrel causes 1 damage to all opponents, ignoring armour . You can use up to four barrels per combat round. (Remember to remove any used tar barrels from your hero sheet.)",
      "If you manage to defeat your opponents, turn to 427 ."
    ]
  },
  {
    "section": "187",
    "label": "Coven matriarch (§187)",
    "parts": [
      {
        "key": "187-0",
        "name": "Coven matriarch",
        "sourceValues": {
          "Speed": "11",
          "Magic": "7",
          "Armour": "5",
          "Health": "40"
        },
        "variants": {},
        "speed": 11,
        "magic": 7,
        "damageStat": "magic",
        "armour": 5,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "187-1",
        "name": "Coven acolyte",
        "sourceValues": {
          "Speed": "10",
          "Magic": "6",
          "Armour": "4",
          "Health": "30"
        },
        "variants": {},
        "speed": 10,
        "magic": 6,
        "damageStat": "magic",
        "armour": 4,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "187-2",
        "name": "Coven acolyte",
        "sourceValues": {
          "Speed": "10",
          "Magic": "6",
          "Armour": "4",
          "Health": "30"
        },
        "variants": {},
        "speed": 10,
        "magic": 6,
        "damageStat": "magic",
        "armour": 4,
        "health": 30,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Matriarch’s malice : The matriarch has magical wards carved into her skin. While the Matriarch has health , you cannot use modifier abilities during this combat.",
      "Dark mending : At the end of each combat round, each opponent will heal themselves for 2 health . This cannot take them above their starting health and once their health is reduced to zero, this ability no longer applies.",
      "Outnumbered : At the end of each combat round, you must take 1 damage from each surviving opponent, ignoring armour . This ability only applies while you are faced with multiple opponents.",
      "If you manage to defeat these villainous mages, turn to 523 ."
    ]
  },
  {
    "section": "194",
    "label": "Pack dog (§194)",
    "parts": [
      {
        "key": "194-0",
        "name": "Pack dog",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "1",
          "Armour": "1",
          "Health": "12"
        },
        "variants": {},
        "speed": 2,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 12,
        "role": "opponent"
      },
      {
        "key": "194-1",
        "name": "Pack dog",
        "sourceValues": {
          "Speed": "1",
          "Brawn": "1",
          "Armour": "1",
          "Health": "10"
        },
        "variants": {},
        "speed": 1,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 10,
        "role": "opponent"
      },
      {
        "key": "194-2",
        "name": "Pack dog",
        "sourceValues": {
          "Speed": "0",
          "Brawn": "1",
          "Armour": "1",
          "Health": "10"
        },
        "variants": {},
        "speed": 0,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 10,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Outnumbered : At the end of each combat round, you must take 1 damage from each surviving opponent, ignoring armour . This ability only applies while you are faced with multiple opponents.",
      "If you manage to send these dogs packing, turn to 236 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "202",
    "label": "The terrorstools (§202)",
    "parts": [
      {
        "key": "202-0",
        "name": "The terrorstools",
        "sourceValues": {
          "Speed": "0",
          "Brawn": "1",
          "Armour": "1",
          "Health": "12"
        },
        "variants": {},
        "speed": 0,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 12,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Spore cloud : At the end of each combat round, roll a die. If the result is [3] or less, you are caught in a blinding cloud of spores, reducing your speed by 1 for the next combat round only. If you roll [4] or more, you have avoided the spores.",
      "If you manage to defeat these fearsome fungi, remember to restore your health to full, then turn to 185 ."
    ]
  },
  {
    "section": "211",
    "label": "Rook (§211)",
    "parts": [
      {
        "key": "211-0",
        "name": "Rook",
        "sourceValues": {
          "Speed": "4",
          "Brawn": "2",
          "Armour": "2",
          "Health": "35"
        },
        "variants": {},
        "speed": 4,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 2,
        "health": 35,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Rook’s talons : At the start of each combat round, take a speed challenge to avoid Rook’s throwing knives. If the result is 10 or more, you have passed and take no damage. If the result is 9 or less, you have been hit and must lose 4 health .",
      "If you are able to defeat Rook, then turn to 412 . Otherwise, you may repeat the combat or choose a different trainer (return to 369 to make your choice.)"
    ]
  },
  {
    "section": "216",
    "label": "Tarred yeti (§216)",
    "parts": [
      {
        "key": "216-0",
        "name": "Tarred yeti",
        "sourceValues": {
          "Speed": "1",
          "Brawn": "2",
          "Armour": "1",
          "Health": "25"
        },
        "variants": {},
        "speed": 1,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 1,
        "health": 25,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Treacle tar : Each time the yeti wins a combat round and causes health damage to your hero, you must lower your speed by 1 for the next combat round only.",
      "Outnumbered : Your companions add 2 to your damage score for the duration of this combat.",
      "If you manage to overpower this ferocious monster, turn to 350 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "236",
    "label": "Hunter (§236)",
    "parts": [
      {
        "key": "236-0",
        "name": "Hunter",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "2",
          "Armour": "1",
          "Health": "30"
        },
        "variants": {},
        "speed": 2,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 1,
        "health": 30,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "If you manage to best this savage hunter, turn to 317 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "271",
    "label": "Willow (§271)",
    "parts": [
      {
        "key": "271-0",
        "name": "Willow",
        "sourceValues": {
          "Speed": "7",
          "Magic": "5",
          "Armour": "4",
          "Health": "70"
        },
        "variants": {},
        "speed": 7,
        "magic": 5,
        "damageStat": "magic",
        "armour": 4,
        "health": 70,
        "role": "opponent"
      },
      {
        "key": "271-1",
        "name": "Leaf blades",
        "sourceValues": {
          "Speed": "6",
          "Magic": "4",
          "Armour": "2",
          "Health": "25"
        },
        "variants": {},
        "speed": 6,
        "magic": 4,
        "damageStat": "magic",
        "armour": 2,
        "health": 25,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Blade storm : At the end of each combat round, you must automatically take 4 damage, ignoring armour , from the whirling leaf blades. Once the blades are reduced to zero health , this ability no longer applies.",
      "Natural order : The leaf blades are immune to bleed and venom .",
      "Once Willow is defeated, the leaf blades are also automatically defeated (if they still have health ). If you manage to overcome this winged fiend, turn to 235 ."
    ]
  },
  {
    "section": "272",
    "label": "Riftwing (§272)",
    "parts": [
      {
        "key": "272-0",
        "name": "Riftwing",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "1",
          "Armour": "1",
          "Health": "28"
        },
        "variants": {},
        "speed": 2,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 28,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "If you manage to defeat this winged fiend turn to 217 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "275",
    "label": "Doomta (§275)",
    "parts": [
      {
        "key": "275-0",
        "name": "Doomta",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "3",
          "Armour": "3",
          "Health": "60"
        },
        "variants": {},
        "speed": 5,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 3,
        "health": 60,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Blind rage : At the end of the fourth combat round, the bear will go into a berserk rage. This lowers its speed by 1 but raises its brawn by 3 for the remainder of the combat.",
      "Disease : Once you have taken health damage from Doomta’s damage score, you must lose a further 2 health at the end of each combat round, ignoring armour .",
      "If you manage to defeat this corrupted predator, turn to 3 ."
    ]
  },
  {
    "section": "292",
    "label": "Syn Hulda (§292)",
    "parts": [
      {
        "key": "292-0",
        "name": "Syn Hulda",
        "sourceValues": {
          "Speed": "8",
          "Magic": "5",
          "Armour": "10/4(*)",
          "Health": "80"
        },
        "variants": {
          "armour": [
            10,
            4
          ]
        },
        "speed": 8,
        "magic": 5,
        "damageStat": "magic",
        "armour": 10,
        "health": 80,
        "role": "opponent"
      },
      {
        "key": "292-1",
        "name": "Frost hound",
        "sourceValues": {
          "Speed": "7",
          "Magic": "4",
          "Armour": "3",
          "Health": "15"
        },
        "variants": {},
        "speed": 7,
        "magic": 4,
        "damageStat": "magic",
        "armour": 3,
        "health": 15,
        "role": "opponent"
      },
      {
        "key": "292-2",
        "name": "Frost hound",
        "sourceValues": {
          "Speed": "7",
          "Magic": "4",
          "Armour": "3",
          "Health": "15"
        },
        "variants": {},
        "speed": 7,
        "magic": 4,
        "damageStat": "magic",
        "armour": 3,
        "health": 15,
        "role": "opponent"
      },
      {
        "key": "292-3",
        "name": "Frost hound",
        "sourceValues": {
          "Speed": "7",
          "Magic": "4",
          "Armour": "3",
          "Health": "15"
        },
        "variants": {},
        "speed": 7,
        "magic": 4,
        "damageStat": "magic",
        "armour": 3,
        "health": 15,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Sound the charge! : For the first two rounds of combat your speed is increased by 2.",
      "Ice skin : (*) Syn Hulda has an armour of 10. Once her health is reduced to 40 or less, her armour is lowered to 4. (Note: Syn Hulda is immune to any abilities that would ordinarily lower her armour .)",
      "Ice fangs : At the end of every combat round you must take 1 damage, ignoring armour , from each frost hound still in play.",
      "Ice breaker : When a frost hound is reduced to zero health , its body explodes into fragments of jagged ice. Each hound causes 5 damage, ignoring armour . (If you have the insulated ability, this damage is reduced to 2.)",
      "Ice prison : Roll a die at the end of each combat round. Once you have rolled three [6] results, Skoll will have freed himself from his ice prison and will join you in combat. He will immediately heal you, restoring 6 health , and increase your damage score by 2 for the remainder of the combat.",
      "Body of ice : Your opponents are immune to bleed , decay and venom .",
      "You must defeat Syn Hulda and the three frost hounds to win the combat. If you are successful, turn to 568 ."
    ]
  },
  {
    "section": "293",
    "label": "Rutus (§293)",
    "parts": [
      {
        "key": "293-0",
        "name": "Rutus",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "1",
          "Armour": "1",
          "Health": "45"
        },
        "variants": {},
        "speed": 3,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 45,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Training yard : You cannot use any special abilities or backpack items in this combat.",
      "I yield : Once Rutus is reduced to 10 health or less, roll a die at the start of each combat round. On a roll of [4] or more, he yields to you, winning you the combat. Otherwise, the combat continues as normal.",
      "If you manage to defeat this skilled soldier, turn to 147 . If you lose the challenge, turn to 258 ."
    ]
  },
  {
    "section": "300",
    "label": "Igluk (§300)",
    "parts": [
      {
        "key": "300-0",
        "name": "Igluk",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "2",
          "Armour": "1",
          "Health": "40"
        },
        "variants": {},
        "speed": 2,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 1,
        "health": 40,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Hopping mad : Igluk has been wounded by Mitch’s dagger. The Skard automatically loses 1 health at the end of each combat round, ignoring armour .",
      "Watch my back : Henna adds 2 to your damage score for the duration of this combat.",
      "If you manage to defeat this ferocious warrior, turn to 233 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "311",
    "label": "Asynjur (§311)",
    "parts": [
      {
        "key": "311-0",
        "name": "Asynjur",
        "sourceValues": {
          "Speed": "6",
          "Magic (*)": "5",
          "Armour(*)": "5",
          "Health": "20"
        },
        "variants": {},
        "speed": 6,
        "magic": 5,
        "damageStat": "magic",
        "armour": 5,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "311-1",
        "name": "Asynjur",
        "sourceValues": {
          "Speed": "6",
          "Magic (*)": "5",
          "Armour(*)": "5",
          "Health": "20"
        },
        "variants": {},
        "speed": 6,
        "magic": 5,
        "damageStat": "magic",
        "armour": 5,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "311-2",
        "name": "Asynjur",
        "sourceValues": {
          "Speed": "5",
          "Magic (*)": "5",
          "Armour(*)": "5",
          "Health": "15"
        },
        "variants": {},
        "speed": 5,
        "magic": 5,
        "damageStat": "magic",
        "armour": 5,
        "health": 15,
        "role": "opponent"
      },
      {
        "key": "311-3",
        "name": "Asynjur",
        "sourceValues": {
          "Speed": "5",
          "Magic (*)": "5",
          "Armour(*)": "5",
          "Health": "15"
        },
        "variants": {},
        "speed": 5,
        "magic": 5,
        "damageStat": "magic",
        "armour": 5,
        "health": 15,
        "role": "opponent"
      },
      {
        "key": "311-4",
        "name": "Asynjur",
        "sourceValues": {
          "Speed": "5",
          "Magic (*)": "5",
          "Armour(*)": "5",
          "Health": "15"
        },
        "variants": {},
        "speed": 5,
        "magic": 5,
        "damageStat": "magic",
        "armour": 5,
        "health": 15,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Crowd control : For every asynjur that is defeated, the remaining asynjur have their magic and armour lowered by 1 each time.",
      "Shadow thorns : At the end of each combat round, you must take 1 damage (ignoring armour ) from each asynjur that is still alive.",
      "If you manage to defeat these tormented mages, turn to 23 ."
    ]
  },
  {
    "section": "316",
    "label": "Grubnose (§316)",
    "parts": [
      {
        "key": "316-0",
        "name": "Grubnose",
        "sourceValues": {
          "Speed": "3/5(*)",
          "Brawn": "3",
          "Armour": "3",
          "Health": "25"
        },
        "variants": {
          "speed": [
            3,
            5
          ]
        },
        "speed": 3,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 3,
        "health": 25,
        "role": "opponent"
      },
      {
        "key": "316-1",
        "name": "Goblin",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "3",
          "Armour": "2",
          "Health": "16"
        },
        "variants": {},
        "speed": 3,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 2,
        "health": 16,
        "role": "opponent"
      },
      {
        "key": "316-2",
        "name": "Goblin",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "3",
          "Armour": "2",
          "Health": "12"
        },
        "variants": {},
        "speed": 3,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 2,
        "health": 12,
        "role": "opponent"
      },
      {
        "key": "316-3",
        "name": "Goblin",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "2",
          "Armour": "1",
          "Health": "10"
        },
        "variants": {},
        "speed": 3,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 1,
        "health": 10,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Stick ’im! : At the end of each combat round, you must take 1 damage ignoring armour from each surviving goblin (not including Grubnose).",
      "Grr, ’tis ain’t fair : (*) Grubnose has his arm stuck. He will still be able to attack and defend, but will do so with a speed of 3. At the start of the fourth combat round, Grubnose will have freed his arm – raising his speed to 5 for the remainder of the combat.",
      "If you manage to defeat these motley scavengers, turn to 583 ."
    ]
  },
  {
    "section": "318",
    "label": "Handler (§318)",
    "parts": [
      {
        "key": "318-0",
        "name": "Handler",
        "sourceValues": {
          "Speed": "7",
          "Brawn": "6",
          "Armour": "4",
          "Health": "40"
        },
        "variants": {},
        "speed": 7,
        "brawn": 6,
        "damageStat": "brawn",
        "armour": 4,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "318-1",
        "name": "Einherjar",
        "sourceValues": {
          "Speed": "7",
          "Brawn": "5",
          "Armour": "4",
          "Health": "40"
        },
        "variants": {},
        "speed": 7,
        "brawn": 5,
        "damageStat": "brawn",
        "armour": 4,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "318-2",
        "name": "Einherjar",
        "sourceValues": {
          "Speed": "7",
          "Brawn": "6",
          "Armour": "4",
          "Health": "35"
        },
        "variants": {},
        "speed": 7,
        "brawn": 6,
        "damageStat": "brawn",
        "armour": 4,
        "health": 35,
        "role": "opponent"
      },
      {
        "key": "318-3",
        "name": "Einherjar",
        "sourceValues": {
          "Speed": "7",
          "Brawn": "5",
          "Armour": "4",
          "Health": "30"
        },
        "variants": {},
        "speed": 7,
        "brawn": 5,
        "damageStat": "brawn",
        "armour": 4,
        "health": 30,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Bow to your will : Once an einherjar is reduced to 10 or less health , they surrender and kneel – taking no further part in the combat.",
      "Chain of command : You are weakened by the black iron manacle. This reduces your speed by 1 and your brawn and magic by 4 for the duration of the combat. If you defeat the handler (by reducing them to 10 or less health ), you break free of the chain – restoring your attributes.",
      "Outnumbered : At the end of each combat round, you must take 1 damage from each surviving opponent, ignoring armour . This ability only applies if you are faced with multiple opponents.",
      "If you manage to defeat these Skard heroes, turn to 354 . Otherwise, remember to record your defeat on your hero sheet, then turn to 46 ."
    ]
  },
  {
    "section": "325",
    "label": "Death moth (§325)",
    "parts": [
      {
        "key": "325-0",
        "name": "Death moth",
        "sourceValues": {
          "Speed": "2",
          "Magic": "2",
          "Armour": "0",
          "Health": "30"
        },
        "variants": {},
        "speed": 2,
        "magic": 2,
        "damageStat": "magic",
        "armour": 0,
        "health": 30,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Spectral dust : Each time your damage score causes health damage to your opponent, you are blinded by the moth’s dust. This reduces your speed to zero for the next combat round only.",
      "If you manage to overcome this winged horror, turn to 163 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "333",
    "label": "Birdman (§333)",
    "parts": [
      {
        "key": "333-0",
        "name": "Birdman",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "1",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {},
        "speed": 2,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Spitting feathers : If you win a combat round, roll a die. If the result is [3] or less, the birdman swipes you with his feathered wings, knocking you back. This prevents you from rolling for damage. The combat round ends and a new one starts. If the result is [4] or more, you can roll for damage as normal.",
      "If you manage to cull this crazy ex-convict, turn to 421 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "337",
    "label": "Sasquatch (§337)",
    "parts": [
      {
        "key": "337-0",
        "name": "Sasquatch",
        "sourceValues": {
          "Speed": "8",
          "Brawn": "7",
          "Armour": "4",
          "Health": "60"
        },
        "variants": {},
        "speed": 8,
        "brawn": 7,
        "damageStat": "brawn",
        "armour": 4,
        "health": 60,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Swat back : If you lose a combat round, roll a die. On a [1] or [2] result, the Sasquatch attacks as normal. If the result is [3] or more, its mighty paws swat you backwards. This immediately inflicts 2 dice of damage, ignoring armour . It also sets up a ground smash (see below).",
      "Ground smash : If the Sasquatch uses swat back , you must immediately take a speed challenge to dodge its follow-up attack. If the result is 14 or less, you are hit and must take a further 1 dice of damage, ignoring armour . If the result is 15 or more, you dodge the attack.",
      "If you manage to defeat the enraged yeti, turn to 183 ."
    ]
  },
  {
    "section": "340",
    "label": "Igluk (§340)",
    "parts": [
      {
        "key": "340-0",
        "name": "Igluk",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "2",
          "Armour": "1",
          "Health": "40"
        },
        "variants": {},
        "speed": 2,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 1,
        "health": 40,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Watch my back : Henna adds 2 to your damage score for the duration of this combat.",
      "If you manage to defeat this ferocious warrior, turn to 45 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "348",
    "label": "Rutus (§348)",
    "parts": [
      {
        "key": "348-0",
        "name": "Rutus",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "1",
          "Armour": "1",
          "Health": "45"
        },
        "variants": {},
        "speed": 3,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 45,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Training yard : You cannot use any special abilities in this combat.",
      "I yield : Once Rutus is reduced to 10 health or less, roll a die at the start of each combat round. On a roll of [4] or more, he yields to you, winning you the combat. Otherwise, the combat continues as normal.",
      "If you manage to defeat this skilled soldier, turn to 147 . If you lose the challenge, turn to 258 ."
    ]
  },
  {
    "section": "371",
    "label": "Riftwing (§371)",
    "parts": [
      {
        "key": "371-0",
        "name": "Riftwing",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "1",
          "Armour": "1",
          "Health": "28"
        },
        "variants": {},
        "speed": 2,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 28,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "If you manage to defeat this winged fiend, turn to 217 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "372",
    "label": "Rainbow warrior (§372)",
    "parts": [
      {
        "key": "372-0",
        "name": "Rainbow warrior",
        "sourceValues": {
          "Speed": "6",
          "Magic": "4",
          "Armour": "5",
          "Health": "50"
        },
        "variants": {},
        "speed": 6,
        "magic": 4,
        "damageStat": "magic",
        "armour": 5,
        "health": 50,
        "role": "opponent"
      },
      {
        "key": "372-1",
        "name": "Red aspect (*)",
        "sourceValues": {
          "Speed": "5",
          "Magic": "4",
          "Armour": "3",
          "Health": "20"
        },
        "variants": {},
        "speed": 5,
        "magic": 4,
        "damageStat": "magic",
        "armour": 3,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "372-2",
        "name": "Green aspect (*)",
        "sourceValues": {
          "Speed": "6",
          "Magic": "5",
          "Armour": "5",
          "Health": "20"
        },
        "variants": {},
        "speed": 6,
        "magic": 5,
        "damageStat": "magic",
        "armour": 5,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "372-3",
        "name": "Blue aspect (*)",
        "sourceValues": {
          "Speed": "7",
          "Magic": "5",
          "Armour": "6",
          "Health": "15"
        },
        "variants": {},
        "speed": 7,
        "magic": 5,
        "damageStat": "magic",
        "armour": 6,
        "health": 15,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Spectrum of spirits (*): At the start of the third round of combat, the rainbow warrior transforms into his red aspect. You must defeat the red aspect before you can return to attacking the rainbow warrior again. After another two rounds of combat, if the rainbow warrior is still alive, he transforms into his green aspect. Again you must defeat the green aspect before you can return to attacking the rainbow warrior. After a further two rounds of combat, the rainbow warrior (if still alive) transforms into his blue aspect. Once this is defeated, you may return to attacking the rainbow warrior for the remainder of the combat. (Note: aspects can only be damaged if they are in play. While an aspect is in play, the rainbow warrior is immune to all damage.)",
      "Colour of magic : Your opponents are immune to all passive effects, including bleed , barbs , disease and venom .",
      "If you manage to defeat this multi-coloured villain, turn to 423 ."
    ]
  },
  {
    "section": "375",
    "label": "Coven matriarch (§375)",
    "parts": [
      {
        "key": "375-0",
        "name": "Coven matriarch",
        "sourceValues": {
          "Speed": "11",
          "Magic": "7",
          "Armour": "8",
          "Health": "40"
        },
        "variants": {},
        "speed": 11,
        "magic": 7,
        "damageStat": "magic",
        "armour": 8,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "375-1",
        "name": "Coven acolyte",
        "sourceValues": {
          "Speed": "10",
          "Magic": "7",
          "Armour": "4",
          "Health": "30"
        },
        "variants": {},
        "speed": 10,
        "magic": 7,
        "damageStat": "magic",
        "armour": 4,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "375-2",
        "name": "Coven acolyte",
        "sourceValues": {
          "Speed": "10",
          "Magic": "6",
          "Armour": "4",
          "Health": "30"
        },
        "variants": {},
        "speed": 10,
        "magic": 6,
        "damageStat": "magic",
        "armour": 4,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "375-3",
        "name": "Coven acolyte",
        "sourceValues": {
          "Speed": "9",
          "Magic": "6",
          "Armour": "4",
          "Health": "20"
        },
        "variants": {},
        "speed": 9,
        "magic": 6,
        "damageStat": "magic",
        "armour": 4,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "375-4",
        "name": "Coven acolyte",
        "sourceValues": {
          "Speed": "9",
          "Magic": "6",
          "Armour": "4",
          "Health": "20"
        },
        "variants": {},
        "speed": 9,
        "magic": 6,
        "damageStat": "magic",
        "armour": 4,
        "health": 20,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Matriarch’s malice : The matriarch has magical wards carved into her skin. While the Matriarch has health , you cannot use modifier abilities during this combat.",
      "Dark mending : At the end of each combat round, each opponent will heal themselves for 2 health . This cannot take them above their starting health and once their health is reduced to zero, this ability no longer applies.",
      "Outnumbered : At the end of each combat round, you must take 1 damage from each surviving opponent, ignoring armour . This ability only applies while you are faced with multiple opponents.",
      "If you manage to defeat this dark gathering, turn to 230 . If you are defeated, remember to record your defeat on your hero sheet. If you wish, you may return to an earlier point to select a different option (providing you meet the item requirement.) Turn to 627 ."
    ]
  },
  {
    "section": "379",
    "label": "Moulder (§379)",
    "parts": [
      {
        "key": "379-0",
        "name": "Moulder",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "2",
          "Armour": "1",
          "Health": "18"
        },
        "variants": {},
        "speed": 2,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 1,
        "health": 18,
        "role": "opponent"
      },
      {
        "key": "379-1",
        "name": "Skelly",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "1",
          "Armour": "1",
          "Health": "10"
        },
        "variants": {},
        "speed": 2,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 10,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Many mouths of Moulder : At the end of each round that Moulder is still alive, roll a die. If the result is [2] or less, you must lose 1 health from the beast’s deadly tentacles.",
      "Skelly’s grip : You must lower your speed by 1, until Skelly is defeated.",
      "If you manage to defeat this putrid duo, turn to 476 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "387",
    "label": "Terrordactyl (§387)",
    "parts": [
      {
        "key": "387-0",
        "name": "Terrordactyl",
        "sourceValues": {
          "Speed": "12",
          "Brawn": "12",
          "Armour": "9",
          "Health": "35"
        },
        "variants": {},
        "speed": 12,
        "brawn": 12,
        "damageStat": "brawn",
        "armour": 9,
        "health": 35,
        "role": "opponent"
      },
      {
        "key": "387-1",
        "name": "Terrordactyl",
        "sourceValues": {
          "Speed": "12",
          "Brawn": "12",
          "Armour": "9",
          "Health": "35"
        },
        "variants": {},
        "speed": 12,
        "brawn": 12,
        "damageStat": "brawn",
        "armour": 9,
        "health": 35,
        "role": "opponent"
      },
      {
        "key": "387-2",
        "name": "Terrordactyl",
        "sourceValues": {
          "Speed": "12",
          "Brawn": "12",
          "Armour": "9",
          "Health": "35"
        },
        "variants": {},
        "speed": 12,
        "brawn": 12,
        "damageStat": "brawn",
        "armour": 9,
        "health": 35,
        "role": "opponent"
      },
      {
        "key": "387-3",
        "name": "Terrordactyl",
        "sourceValues": {
          "Speed": "12",
          "Brawn": "12",
          "Armour": "9",
          "Health": "35"
        },
        "variants": {},
        "speed": 12,
        "brawn": 12,
        "damageStat": "brawn",
        "armour": 9,
        "health": 35,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Dive bomb : Each time a terrordactyl rolls a double for its attack speed you automatically lose the round, even if your attack speed was higher. For the remainder of the round you cannot use combat or modifier abilities.",
      "Fire at will : You may use your nail gun or dragon fire ability in this combat.",
      "If you manage to survive this aerial assault, turn to 29 . (If you are defeated, remember to record your defeat as normal on your hero sheet, then turn to 506 .)"
    ]
  },
  {
    "section": "402",
    "label": "Hunter (§402)",
    "parts": [
      {
        "key": "402-0",
        "name": "Hunter",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "2",
          "Armour": "1",
          "Health": "35"
        },
        "variants": {},
        "speed": 2,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 1,
        "health": 35,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Tight spot : In the first two combat rounds, the hunter’s speed is reduced to zero.",
      "If you manage to best this savage hunter, turn to 317 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "407",
    "label": "Drokke (§407)",
    "parts": [
      {
        "key": "407-0",
        "name": "Drokke",
        "sourceValues": {
          "Speed": "14",
          "Brawn": "7",
          "Armour": "8",
          "Health": "100"
        },
        "variants": {},
        "speed": 14,
        "brawn": 7,
        "damageStat": "brawn",
        "armour": 8,
        "health": 100,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Northern grit : Skoll is immune to any abilities that reduce his number of speed dice (such as curse , knockdown and webbed ).",
      "Berserker frenzy : Once Skoll’s health is reduced to 50 or less, he goes into a frenzy. This lowers his speed by 1 but increases his brawn by 4 for the remainder of the combat.",
      "If you manage to defeat this ferocious Skard, turn to 558 ."
    ]
  },
  {
    "section": "419",
    "label": "Tekksertok (§419)",
    "parts": [
      {
        "key": "419-0",
        "name": "Tekksertok",
        "sourceValues": {
          "Speed": "9",
          "Brawn": "6",
          "Armour": "4",
          "Health": "70"
        },
        "variants": {},
        "speed": 9,
        "brawn": 6,
        "damageStat": "brawn",
        "armour": 4,
        "health": 70,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Tusk punch : If Tekksertok rolls a [6] for his damage score, he performs a tusk punch. This adds a further two dice to his damage score (3 in total) and reduces your speed by 1 for the next combat round only.",
      "Trunk whack : If you roll a double for your attack speed (before or after a reroll), you are hit by the mammoth’s trunk. This causes 2 dice of damage, ignoring armour , and also lowers your armour by 1 (each time) for the duration of the combat.",
      "If you manage to defeat this monstrous mammoth, turn to 540 ."
    ]
  },
  {
    "section": "435",
    "label": "Insidious (§435)",
    "parts": [
      {
        "key": "435-0",
        "name": "Insidious",
        "sourceValues": {
          "Speed": "10",
          "Magic": "6",
          "Armour": "6",
          "Health": "70"
        },
        "variants": {},
        "speed": 10,
        "magic": 6,
        "damageStat": "magic",
        "armour": 6,
        "health": 70,
        "role": "opponent"
      },
      {
        "key": "435-1",
        "name": "Seeper",
        "sourceValues": {
          "Speed": "10",
          "Magic": "5",
          "Armour": "5",
          "Health": "20"
        },
        "variants": {},
        "speed": 10,
        "magic": 5,
        "damageStat": "magic",
        "armour": 5,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "435-2",
        "name": "Seeper",
        "sourceValues": {
          "Speed": "10",
          "Magic": "5",
          "Armour": "5",
          "Health": "20"
        },
        "variants": {},
        "speed": 10,
        "magic": 5,
        "damageStat": "magic",
        "armour": 5,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "435-3",
        "name": "Parasite",
        "sourceValues": {
          "Speed": "9",
          "Magic": "4",
          "Armour": "3",
          "Health": "8"
        },
        "variants": {},
        "speed": 9,
        "magic": 4,
        "damageStat": "magic",
        "armour": 3,
        "health": 8,
        "role": "opponent"
      },
      {
        "key": "435-4",
        "name": "Parasite",
        "sourceValues": {
          "Speed": "9",
          "Magic": "4",
          "Armour": "3",
          "Health": "8"
        },
        "variants": {},
        "speed": 9,
        "magic": 4,
        "damageStat": "magic",
        "armour": 3,
        "health": 8,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Endless tide : At the start of each combat round after the first, each seeper will produce another parasite, with the same stats as above. If a seeper is reduced to zero health , they can no longer produce parasites – but any parasites already in play will continue to attack.",
      "Sinister arts : Each time you take health damage from Insidious you must sacrifice an unused ability of your choosing or else take an extra 5 damage, ignoring armour . A sacrificed ability cannot be used for the remainder of the combat.",
      "Parasitic pests : At the end of every combat round, you must take 1 damage, ignoring armour , from each parasite currently in play.",
      "To win the combat, you must defeat all opponents (including any parasites currently in play). If you are able to defeat this menacing horde, turn to 771 ."
    ]
  },
  {
    "section": "436",
    "label": "Test rats (§436)",
    "parts": [
      {
        "key": "436-0",
        "name": "Test rats",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "4",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {},
        "speed": 5,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "436-1",
        "name": "Test rats",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "4",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {},
        "speed": 5,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "436-2",
        "name": "Test rats",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "4",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {},
        "speed": 5,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Disease : Once you have taken health damage from a rat’s damage score, you must lose a further 2 health at the end of each combat round, ignoring armour . (You can only be inflicted with disease once.)",
      "Outnumbered : At the end of each combat round, you must take 1 damage from each surviving opponent, ignoring armour . This ability only applies while you are faced with multiple opponents.",
      "If you manage to defeat these vile vermin, turn to 491 ."
    ]
  },
  {
    "section": "447",
    "label": "Water spider (§447)",
    "parts": [
      {
        "key": "447-0",
        "name": "Water spider",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "4",
          "Armour": "3",
          "Health": "20"
        },
        "variants": {},
        "speed": 5,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 3,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "447-1",
        "name": "Water spider",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "3",
          "Armour": "3",
          "Health": "20"
        },
        "variants": {},
        "speed": 5,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 3,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "447-2",
        "name": "Water spider",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "3",
          "Armour": "3",
          "Health": "20"
        },
        "variants": {},
        "speed": 5,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 3,
        "health": 20,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Paralysis : If you suffer health damage from a spider’s damage score, you cannot use special abilities in the next combat round (passive effects that are already in play will continue to do damage).",
      "Outnumbered : At the end of each combat round, you must take 1 damage from each surviving opponent, ignoring armour . This ability only applies while you are faced with multiple opponents.",
      "If you manage to defeat these multi-legged monsters, turn to 390 ."
    ]
  },
  {
    "section": "459",
    "label": "Orrec (§459)",
    "parts": [
      {
        "key": "459-0",
        "name": "Orrec",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "2",
          "Armour": "3",
          "Health": "40"
        },
        "variants": {},
        "speed": 3,
        "brawn": 2,
        "damageStat": "brawn",
        "armour": 3,
        "health": 40,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Swift steps : If Orrec wins a combat round and causes health damage to your hero, your opponent’s speed is raised by 1 for the next combat round only.",
      "Sixth sense : If you play a speed or a combat ability, roll a die. If the result is [2] or less, Orrec has evaded your move and its effects are ignored (the ability is still counted as having been used). If the result is [3] or more, you may play the ability as normal.",
      "If you are able to defeat Orrec, then turn to 32 . Otherwise, you may repeat the combat or choose a different trainer (return to 369 to make your choice.)"
    ]
  },
  {
    "section": "467",
    "label": "Night terror (§467)",
    "parts": [
      {
        "key": "467-0",
        "name": "Night terror",
        "sourceValues": {
          "Speed": "9",
          "Magic": "6",
          "Armour": "4",
          "Health": "40"
        },
        "variants": {},
        "speed": 9,
        "magic": 6,
        "damageStat": "magic",
        "armour": 4,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "467-1",
        "name": "Night terror",
        "sourceValues": {
          "Speed": "9",
          "Magic": "5",
          "Armour": "4",
          "Health": "30"
        },
        "variants": {},
        "speed": 9,
        "magic": 5,
        "damageStat": "magic",
        "armour": 4,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "467-2",
        "name": "Night terror",
        "sourceValues": {
          "Speed": "9",
          "Magic": "5",
          "Armour": "4",
          "Health": "30"
        },
        "variants": {},
        "speed": 9,
        "magic": 5,
        "damageStat": "magic",
        "armour": 4,
        "health": 30,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Shiver strike : If you take health damage from a night terror’s damage score, you must lower your speed by 2 for the next combat round only.",
      "Terror incarnate : At the end of every combat round, you must take 1 damage from each surviving night terror, ignoring armour .",
      "Bear power! : Nanuk adds 2 to your damage score for the duration of this combat.",
      "If you manage to defeat this terrible trio, turn to 501 ."
    ]
  },
  {
    "section": "468",
    "label": "Roots (§468)",
    "parts": [
      {
        "key": "468-0",
        "name": "Roots",
        "sourceValues": {
          "Speed": "7",
          "Magic": "5",
          "Armour": "–",
          "Health": "–"
        },
        "variants": {},
        "speed": 7,
        "magic": 5,
        "damageStat": "magic",
        "armour": null,
        "health": null,
        "role": "indestructible"
      },
      {
        "key": "468-1",
        "name": "Danse macabre (*)",
        "sourceValues": {
          "Speed": "–",
          "Magic": "–",
          "Armour": "4",
          "Health": "100"
        },
        "variants": {},
        "speed": null,
        "magic": null,
        "damageStat": "magic",
        "armour": 4,
        "health": 100,
        "role": "resource"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Danse till you drop! : (*) In this combat you roll against the roots’ speed . If you win a combat round, the roots will drop Danse Macabre, allowing you to strike against the skeleton for two combat rounds (hits are automatic; there is no need to roll for speed). After two rounds, the roots lift the skeleton up once again, meaning you must win another combat round before you can strike twice against the skeleton.",
      "Hip-hop bones : At the end of each combat round you must take 2 damage, ignoring armour , from the flailing roots and bones.",
      "Body of bone : Danse Macabre is immune to all passive effects.",
      "If you manage to defeat this body-popping horror, turn to 331 ."
    ]
  },
  {
    "section": "475",
    "label": "Muttok elder (§475)",
    "parts": [
      {
        "key": "475-0",
        "name": "Muttok elder",
        "sourceValues": {
          "Speed": "6",
          "Brawn": "4",
          "Armour": "4",
          "Health": "50"
        },
        "variants": {},
        "speed": 6,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 4,
        "health": 50,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Head rush : Any round in which you do not play a speed ability, you are automatically caught by the elder’s antlers. These cause 4 damage, ignoring armour . (This is in addition to any further damage the stag may cause, if it wins the combat round.)",
      "If you manage to defeat the lord of the herd, turn to 324 ."
    ]
  },
  {
    "section": "485",
    "label": "Riftwing (§485)",
    "parts": [
      {
        "key": "485-0",
        "name": "Riftwing",
        "sourceValues": {
          "Speed": "2",
          "Brawn": "1",
          "Armour": "1",
          "Health": "28"
        },
        "variants": {},
        "speed": 2,
        "brawn": 1,
        "damageStat": "brawn",
        "armour": 1,
        "health": 28,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "If you manage to defeat this winged fiend, turn to 217 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "516",
    "label": "Coven acolyte (§516)",
    "parts": [
      {
        "key": "516-0",
        "name": "Coven acolyte",
        "sourceValues": {
          "Speed": "10",
          "Magic": "7",
          "Armour": "4",
          "Health": "30"
        },
        "variants": {},
        "speed": 10,
        "magic": 7,
        "damageStat": "magic",
        "armour": 4,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "516-1",
        "name": "Coven acolyte",
        "sourceValues": {
          "Speed": "10",
          "Magic": "6",
          "Armour": "4",
          "Health": "30"
        },
        "variants": {},
        "speed": 10,
        "magic": 6,
        "damageStat": "magic",
        "armour": 4,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "516-2",
        "name": "Coven acolyte",
        "sourceValues": {
          "Speed": "9",
          "Magic": "6",
          "Armour": "4",
          "Health": "20"
        },
        "variants": {},
        "speed": 9,
        "magic": 6,
        "damageStat": "magic",
        "armour": 4,
        "health": 20,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Dark mending : At the end of each combat round, each opponent will heal themselves for 2 health . This cannot take them above their starting health and once their health is reduced to zero, this ability no longer applies.",
      "Outnumbered : At the end of each combat round, you must take 1 damage from each surviving opponent, ignoring armour . This ability only applies while you are faced with multiple opponents.",
      "If you manage to defeat these villainous mages, turn to 523 ."
    ]
  },
  {
    "section": "533",
    "label": "Rinehart (§533)",
    "parts": [
      {
        "key": "533-0",
        "name": "Rinehart",
        "sourceValues": {
          "Speed": "2",
          "Magic": "2",
          "Armour": "2",
          "Health": "35"
        },
        "variants": {},
        "speed": 2,
        "magic": 2,
        "damageStat": "magic",
        "armour": 2,
        "health": 35,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "If you manage to overcome this grief-stricken ghost turn to 505 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "542",
    "label": "Seethe (§542)",
    "parts": [
      {
        "key": "542-0",
        "name": "Seethe",
        "sourceValues": {
          "Speed": "13",
          "Magic": "8",
          "Armour": "9",
          "Health": "100"
        },
        "variants": {},
        "speed": 13,
        "magic": 8,
        "damageStat": "magic",
        "armour": 9,
        "health": 100,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Poison spray : At the start of every combat round, Seethe sprays poison. This inflicts 1 die of damage, ignoring armour , and reduces Nidhogg’s stability and toughness by 2.",
      "Fire at will : You may use your dragon fire ability in this combat.",
      "(Note: If Nidhogg’s stability has been reduced to zero, you can no longer use his associated ability.)",
      "If you manage to defeat this corrupted dragon, turn to 430 ."
    ]
  },
  {
    "section": "548",
    "label": "Mott (§548)",
    "parts": [
      {
        "key": "548-0",
        "name": "Mott",
        "sourceValues": {
          "Speed": "3",
          "Magic": "2",
          "Armour": "1",
          "Health": "25"
        },
        "variants": {},
        "speed": 3,
        "magic": 2,
        "damageStat": "magic",
        "armour": 1,
        "health": 25,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "In dark service : Once Mott is reduced to zero health , roll a die. On a result of [2] or more, he rises from the dead, regaining 10 health . If he is defeated a second time, this ability no longer applies.",
      "If you manage to overcome this accursed knight, turn to 227 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "556",
    "label": "Captain (§556)",
    "parts": [
      {
        "key": "556-0",
        "name": "Captain",
        "sourceValues": {
          "Speed": "11",
          "Magic": "8",
          "Armour": "8",
          "Health": "60"
        },
        "variants": {},
        "speed": 11,
        "magic": 8,
        "damageStat": "magic",
        "armour": 8,
        "health": 60,
        "role": "opponent"
      },
      {
        "key": "556-1",
        "name": "Mako",
        "sourceValues": {
          "Speed": "10",
          "Magic": "6",
          "Armour": "6",
          "Health": "40"
        },
        "variants": {},
        "speed": 10,
        "magic": 6,
        "damageStat": "magic",
        "armour": 6,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "556-2",
        "name": "Sailor",
        "sourceValues": {
          "Speed": "10",
          "Magic": "6",
          "Armour": "6/3(*)",
          "Health": "15"
        },
        "variants": {
          "armour": [
            6,
            3
          ]
        },
        "speed": 10,
        "magic": 6,
        "damageStat": "magic",
        "armour": 6,
        "health": 15,
        "role": "opponent"
      },
      {
        "key": "556-3",
        "name": "Sailor",
        "sourceValues": {
          "Speed": "10",
          "Magic": "6",
          "Armour": "6/3(*)",
          "Health": "15"
        },
        "variants": {
          "armour": [
            6,
            3
          ]
        },
        "speed": 10,
        "magic": 6,
        "damageStat": "magic",
        "armour": 6,
        "health": 15,
        "role": "opponent"
      },
      {
        "key": "556-4",
        "name": "Sailor",
        "sourceValues": {
          "Speed": "10",
          "Magic": "6",
          "Armour": "6/3(*)",
          "Health": "15"
        },
        "variants": {
          "armour": [
            6,
            3
          ]
        },
        "speed": 10,
        "magic": 6,
        "damageStat": "magic",
        "armour": 6,
        "health": 15,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "All hands to the deck : At the start of each combat round after the first, a new sailor (with the same stats as those above) joins the combat.",
      "Aura of command (*): While the Captain is alive, the sailors have an armour of 6. This is reduced to 3 if the Captain is defeated.",
      "Mako’s bite : For each [1] your hero rolls for attack speed (before or after a reroll), you are caught by Mako’s shark axe and must take 4 damage, ignoring armour . If Mako is defeated you can ignore this ability.",
      "Mutiny on the Naglfar : The crew of the ship have a morale of 15. When this is reduced to zero any surviving crew will immediately surrender, winning you the combat. Each sailor you defeat reduces the crew’s morale by 1. Defeating the Captain will reduce morale by 5 and defeating Mako will reduce it by 3. The combat must continue until the crew’s morale is reduced to zero.",
      "Overwhelmed : Skoll and Anise are keeping the crew distracted, but time is against you. If a combat round ends with seven sailors in play (after passive effects have been applied), then you have automatically lost the combat.",
      "If you manage to incite a mutiny and take over the ship, turn to 745 ."
    ]
  },
  {
    "section": "565",
    "label": "Ice wraith (§565)",
    "parts": [
      {
        "key": "565-0",
        "name": "Ice wraith",
        "sourceValues": {
          "Speed": "5",
          "Magic": "3",
          "Armour": "4",
          "Health": "40 (*)"
        },
        "variants": {},
        "speed": 5,
        "magic": 3,
        "damageStat": "magic",
        "armour": 4,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "565-1",
        "name": "Mirror shard",
        "sourceValues": {
          "Speed": "–",
          "Magic": "–",
          "Armour": "2",
          "Health": "14"
        },
        "variants": {},
        "speed": null,
        "magic": null,
        "damageStat": "magic",
        "armour": 2,
        "health": 14,
        "role": "resource"
      },
      {
        "key": "565-2",
        "name": "Mirror shard",
        "sourceValues": {
          "Speed": "–",
          "Magic": "–",
          "Armour": "2",
          "Health": "14"
        },
        "variants": {},
        "speed": null,
        "magic": null,
        "damageStat": "magic",
        "armour": 2,
        "health": 14,
        "role": "resource"
      },
      {
        "key": "565-3",
        "name": "Mirror shard",
        "sourceValues": {
          "Speed": "–",
          "Magic": "–",
          "Armour": "2",
          "Health": "14"
        },
        "variants": {},
        "speed": null,
        "magic": null,
        "damageStat": "magic",
        "armour": 2,
        "health": 14,
        "role": "resource"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Mirror, mirror : The wraith can add 1 to its damage score for each mirror that currently has health . (If you have the insulated ability, you can ignore this damage bonus.)",
      "Fractured spirit : (*) The wraith cannot be harmed until the three mirror shards are destroyed (but can still attack you if you lose a combat round). Once the mirrors are destroyed, the wraith can be attacked and damaged as normal. Caul will also be able to come to your aid, adding 2 to your damage score for the remainder of the combat.",
      "Soul glass : The mirrors are immune to bleed and decay .",
      "In this combat you roll against the ice wraith’s attack speed. If you are successful, then you may strike against a mirror shard – or the wraith, if all three mirrors have been destroyed.",
      "If you manage to defeat this spectral menace, turn to 449 ."
    ]
  },
  {
    "section": "567",
    "label": "Grubnose (§567)",
    "parts": [
      {
        "key": "567-0",
        "name": "Grubnose",
        "sourceValues": {
          "Speed": "3/5(*)",
          "Brawn": "3",
          "Armour": "3",
          "Health": "25"
        },
        "variants": {
          "speed": [
            3,
            5
          ]
        },
        "speed": 3,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 3,
        "health": 25,
        "role": "opponent"
      },
      {
        "key": "567-1",
        "name": "Goblin",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "3",
          "Armour": "2",
          "Health": "16"
        },
        "variants": {},
        "speed": 3,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 2,
        "health": 16,
        "role": "opponent"
      },
      {
        "key": "567-2",
        "name": "Goblin",
        "sourceValues": {
          "Speed": "3",
          "Brawn": "3",
          "Armour": "2",
          "Health": "12"
        },
        "variants": {},
        "speed": 3,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 2,
        "health": 12,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Stick ’im! : At the end of each combat round, you must take 1 damage ignoring armour from each surviving goblin (not including Grubnose).",
      "Grr, ’tis ain’t fair : (*) Grubnose has his arm stuck. He will still be able to attack and defend, but will do so with a speed of 3. At the start of the fourth combat round, Grubnose will have freed his arm – raising his speed to 5 for the remainder of the combat.",
      "If you manage to defeat these motley scavengers, turn to 583 ."
    ]
  },
  {
    "section": "578",
    "label": "Abominable (§578)",
    "parts": [
      {
        "key": "578-0",
        "name": "Abominable",
        "sourceValues": {
          "Speed": "6",
          "Brawn": "4",
          "Armour": "4",
          "Health": "70"
        },
        "variants": {},
        "speed": 6,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 4,
        "health": 70,
        "role": "opponent"
      },
      {
        "key": "578-1",
        "name": "Snowman (*)",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "4",
          "Armour": "3",
          "Health": "15"
        },
        "variants": {},
        "speed": 5,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 3,
        "health": 15,
        "role": "opponent"
      },
      {
        "key": "578-2",
        "name": "Snowman (*)",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "4",
          "Armour": "3",
          "Health": "15"
        },
        "variants": {},
        "speed": 5,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 3,
        "health": 15,
        "role": "opponent"
      },
      {
        "key": "578-3",
        "name": "Snowman (*)",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "3",
          "Armour": "2",
          "Health": "15"
        },
        "variants": {},
        "speed": 5,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 2,
        "health": 15,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "‘I get knocked down, but I get up again . . .’ : (*) For every 20 health the Abominable loses, a snowman rises up from the remains and joins the combat. You must defeat all four opponents to win the combat.",
      "Snow joke : You must take 1 damage at the end of each combat round from each opponent currently in play. (If you have the insulated ability, you can ignore this damage.)",
      "Father’s fury : Desnar adds 2 to your damage score for the duration of this combat.",
      "Made of snow : Your opponents are immune to bleed , decay and venom .",
      "If you manage to overcome the abominable snowman, turn to 347 . If you lose, record your defeat on your hero sheet and turn to 139 ."
    ]
  },
  {
    "section": "580",
    "label": "Necromancer (§580)",
    "parts": [
      {
        "key": "580-0",
        "name": "Necromancer",
        "sourceValues": {
          "Speed": "3",
          "Magic": "2",
          "Armour": "2",
          "Health": "10 (*)"
        },
        "variants": {},
        "speed": 3,
        "magic": 2,
        "damageStat": "magic",
        "armour": 2,
        "health": 10,
        "role": "opponent"
      },
      {
        "key": "580-1",
        "name": "Prismatic prison",
        "sourceValues": {
          "Speed": "0",
          "Magic": "0",
          "Armour": "3",
          "Health": "20"
        },
        "variants": {},
        "speed": 0,
        "magic": 0,
        "damageStat": "magic",
        "armour": 3,
        "health": 20,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Prison break : You cannot attack or deal damage to the necromancer until you have broken out of the prison. Your attacks against the prison automatically hit (the prison has no speed ). Once the prison has been reduced to zero health , it is destroyed and you are freed.",
      "Soul surge : For each combat round you spend in the prison, the necromancer grows in power, gaining 5 health at the end of each round that you are trapped. Once the prison is destroyed, the necromancer no longer gains health – and you can attack him as normal. R Glass walls : The prison is immune to all passive effects, such as barbs and bleed .",
      "Guards, guards! : If you lit the tower’s banner, guards will join you in your fight against the necromancer, raising your damage score by 2 for the remainder of the combat. You only gain this bonus once you have broken out of the prison.",
      "If you manage to send this villain back to the grave, turn to 437 . If you lose the combat, remember to record your defeat on your hero sheet. You may then attempt the combat again or return to the map ."
    ]
  },
  {
    "section": "590",
    "label": "Drake keeper (§590)",
    "parts": [
      {
        "key": "590-0",
        "name": "Drake keeper",
        "sourceValues": {
          "Speed": "5",
          "Brawn/Magic": "5/3",
          "Armour": "5",
          "Health": "70"
        },
        "variants": {},
        "speed": 5,
        "brawn": 5,
        "magic": 3,
        "damageStat": "brawn",
        "armour": 5,
        "health": 70,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Drake fire cannon : At the end of each combat round you must take damage equal to the Drake keeper’s current magic score, ignoring armour . (When rolling for a damage score, the Drake keeper uses his brawn ).",
      "Stalker’s spear : Caul adds 2 to your damage score for the duration of this combat.",
      "If you manage to defeat this hunch-backed horror, turn to 625 ."
    ]
  },
  {
    "section": "594",
    "label": "Gjoll (§594)",
    "parts": [
      {
        "key": "594-0",
        "name": "Gjoll",
        "sourceValues": {
          "Speed": "14",
          "Magic": "15",
          "Armour": "14",
          "Health": "130"
        },
        "variants": {},
        "speed": 14,
        "magic": 15,
        "damageStat": "magic",
        "armour": 14,
        "health": 130,
        "role": "opponent"
      },
      {
        "key": "594-1",
        "name": "Sephix (*)",
        "sourceValues": {
          "Speed": "11",
          "Magic": "6",
          "Armour": "6",
          "Health": "50"
        },
        "variants": {},
        "speed": 11,
        "magic": 6,
        "damageStat": "magic",
        "armour": 6,
        "health": 50,
        "role": "opponent"
      },
      {
        "key": "594-2",
        "name": "Raurg (*)",
        "sourceValues": {
          "Speed": "11",
          "Magic": "6",
          "Armour": "6",
          "Health": "40"
        },
        "variants": {},
        "speed": 11,
        "magic": 6,
        "damageStat": "magic",
        "armour": 6,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "594-3",
        "name": "Anod (*)",
        "sourceValues": {
          "Speed": "10",
          "Magic": "5",
          "Armour": "5",
          "Health": "30"
        },
        "variants": {},
        "speed": 10,
        "magic": 5,
        "damageStat": "magic",
        "armour": 5,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "594-4",
        "name": "Wendigo (*)",
        "sourceValues": {
          "Speed": "10",
          "Magic": "5",
          "Armour": "5",
          "Health": "30"
        },
        "variants": {},
        "speed": 10,
        "magic": 5,
        "damageStat": "magic",
        "armour": 5,
        "health": 30,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Prison guardians : (*) Each prison guardian has an ability. Once a prison guardian is defeated, their ability no longer applies. The abilities are: – Sephix’s pestilence: You must lose 2 health at the end of each combat round. – Raurg’s fires: You must reduce your armour by 1 at the end of each combat round. (You cannot regain lost armour until the combat is over.) – Anod’s reflection: Each time your damage score/damage dice inflicts damage to an opponent, you must take 2 damage in return (per opponent struck). – Wendigo’s chill: You must lower your speed by 1.",
      "Shackle the giant : Each of the prison guardians (Sephix, Anod, Raurg and Wendigo) is guarding one of the manacles holding the dragon prisoner. If you defeat a prison guardian, you gain control of their manacle. This can immediately be used on Gjoll to help you defeat him. The manacle abilities are as follows: – Sephix’s manacle: Gjoll is inflicted with pestilence and must suffer 5 damage, ignoring armour , at the end of every combat round (starting with the round after Sephix is defeated). – Raurg’s manacle: Cruel fires melt through Gjoll’s armour , reducing it to 4 for the remainder of the combat. – Anod’s manacle: Gjoll’s hammer becomes a shadow of its former strength, reducing the giant’s magic to 4 for the remainder of the combat. – Wendigo’s manacle: Ice encases the giant, reducing Gjoll’s speed by 3 for the remainder of the combat.",
      "In it together : Abilities that strike more than one opponent can be used on Gjoll and the prison guardians as normal. All opponents are viable targets for such attacks.",
      "To win the combat you must defeat Gjoll. Once Gjoll is defeated, any remaining prison guardians are also defeated. If you manage to overcome this ferocious giant, turn to 739 ."
    ]
  },
  {
    "section": "597",
    "label": "Ratatosk (§597)",
    "parts": [
      {
        "key": "597-0",
        "name": "Ratatosk",
        "sourceValues": {
          "Speed": "7",
          "Magic": "6",
          "Armour": "5",
          "Health": "80"
        },
        "variants": {},
        "speed": 7,
        "magic": 6,
        "damageStat": "magic",
        "armour": 5,
        "health": 80,
        "role": "opponent"
      },
      {
        "key": "597-1",
        "name": "Shadow sapling",
        "sourceValues": {
          "Speed": "5",
          "Magic": "4",
          "Armour": "1",
          "Health": "5"
        },
        "variants": {},
        "speed": 5,
        "magic": 4,
        "damageStat": "magic",
        "armour": 1,
        "health": 5,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Rat-a-tat-tat : Ratatosk continues to sow more of his dark seeds, summoning minions to his aid. At the start of each combat round, roll a die. On a result of [2] or less, two new shadow saplings enter the combat (with the same attributes as the sapling shown above). If the result is [3] or more, only one new shadow sapling enters the combat.",
      "Thorn fingers : At the end of each combat round, you must take 1 damage (ignoring armour ) from each shadow sapling currently in play.",
      "If Ratatosk is defeated, the rat-a-tat-tat ability no longer applies. You must defeat Ratatosk and all shadow saplings currently in play in order to win the combat.",
      "If you manage to overcome this rascally rodent, turn to 143 ."
    ]
  },
  {
    "section": "599",
    "label": "Quelertang (§599)",
    "parts": [
      {
        "key": "599-0",
        "name": "Quelertang",
        "sourceValues": {
          "Speed": "8",
          "Magic": "4",
          "Armour": "6",
          "Health": "90"
        },
        "variants": {},
        "speed": 8,
        "magic": 4,
        "damageStat": "magic",
        "armour": 6,
        "health": 90,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Hailstorm : At the end of each combat round, the hail bullets automatically inflict 1 damage, ignoring armour, for every 10 health that Quelertang has remaining. (For example, if Quelertang had 65 health , the hailstorm would inflict 6 damage.)",
      "Buffeting gale : If you have the insulated ability you can reduce Quelertang’s damage score by 2.",
      "Body of air : Quelertang is immune to bleed , decay , disease and venom .",
      "If you manage to defeat this chilling maelstrom, turn to 742 ."
    ]
  },
  {
    "section": "600",
    "label": "Guardian (§600)",
    "parts": [
      {
        "key": "600-0",
        "name": "Guardian",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "5",
          "Armour": "7",
          "Health": "150"
        },
        "variants": {},
        "speed": 5,
        "brawn": 5,
        "damageStat": "brawn",
        "armour": 7,
        "health": 150,
        "role": "opponent"
      },
      {
        "key": "600-1",
        "name": "Guardian",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "5",
          "Armour": "7",
          "Health": "150"
        },
        "variants": {},
        "speed": 5,
        "brawn": 5,
        "damageStat": "brawn",
        "armour": 7,
        "health": 150,
        "role": "opponent"
      },
      {
        "key": "600-2",
        "name": "Guardian",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "5",
          "Armour": "7",
          "Health": "150"
        },
        "variants": {},
        "speed": 5,
        "brawn": 5,
        "damageStat": "brawn",
        "armour": 7,
        "health": 150,
        "role": "opponent"
      },
      {
        "key": "600-3",
        "name": "Guardian",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "5",
          "Armour": "7",
          "Health": "150"
        },
        "variants": {},
        "speed": 5,
        "brawn": 5,
        "damageStat": "brawn",
        "armour": 7,
        "health": 150,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "You find in the room three frost orbs , three shadow orbs , two tremor orbs and one lightning orb . You may have collected additional orbs on your travels, which you can also use. Each orb does the following:",
      "Frost orb Slows one guardian, meaning it stays on its current square for an extra round instead of moving to the next.",
      "Shadow orb Inflicts a curse on one guardian, inflicting 10 passive damage at the end of each turn for the duration of the challenge/combat. (Each guardian can only be affected by this once.)",
      "Tremor orb Inflicts damage depending on how many guardians are in the square. (One guardian = 100 damage, two = 50 damage each, three guardians = 30 damage each, four guardians = 20 damage each.)",
      "Lightning orb Reduces one guardian’s armour to 2.",
      "Decide where you want to place your orbs (using a symbol or colour to denote each type). Once placed, orbs cannot be moved. Their magic can only be used once . When the orbs have been placed – the challenge begins! (Remember, you cannot engage the guardians in ordinary combat until they have reached the final arrow.)",
      "If you manage to defeat these powerful guardians, turn to 642 . (Special achievement: If all four guardians are defeated before they reach the final arrow, turn to 513 .)"
    ]
  },
  {
    "section": "601",
    "label": "Bounty hunter (§601)",
    "parts": [
      {
        "key": "601-0",
        "name": "Bounty hunter",
        "sourceValues": {
          "Speed": "7",
          "Brawn": "4",
          "Armour": "3",
          "Health": "60"
        },
        "variants": {},
        "speed": 7,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 3,
        "health": 60,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Daring duellist : If you use a speed or combat ability, roll a die. On a [1] or [2] result, the hunter deflects your attack. This cancels your ability (it can no longer be played during this combat) and inflicts 1 die of damage to your hero, ignoring armour . Passive and modifier abilities can be used as normal.",
      "If you manage to defeat this mean mercenary, turn to 201 ."
    ]
  },
  {
    "section": "603",
    "label": "Maggorath (§603)",
    "parts": [
      {
        "key": "603-0",
        "name": "Maggorath",
        "sourceValues": {
          "Speed": "12",
          "Brawn": "11",
          "Armour": "8",
          "Health": "100"
        },
        "variants": {},
        "speed": 12,
        "brawn": 11,
        "damageStat": "brawn",
        "armour": 8,
        "health": 100,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Infestation : Once you have taken health damage from Maggorath’s damage score, you are immediately inflicted with infestation. You must lose 2 health at the end of the first combat round you are infected. This damage increases by 2 every round for the duration of the combat.",
      "Fire at will : You may use your nail gun or dragon fire ability in this combat.",
      "If you manage to defeat the giant maggot, turn to 748 . (If you are defeated, remember to record your defeat as normal on your hero sheet, then turn to 770 .)"
    ]
  },
  {
    "section": "615",
    "label": "Drake head (§615)",
    "parts": [
      {
        "key": "615-0",
        "name": "Drake head",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "4",
          "Armour": "4",
          "Health": "40"
        },
        "variants": {},
        "speed": 5,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 4,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "615-1",
        "name": "Drake head",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "4",
          "Armour": "4",
          "Health": "40"
        },
        "variants": {},
        "speed": 5,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 4,
        "health": 40,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Frost fire : At the end of each combat round, you must take 2 damage from each surviving opponent, ignoring armour . (If you have the insulated ability, this damage is reduced to 1 per opponent.)",
      "If you manage to defeat this ancient terror, turn to 680 ."
    ]
  },
  {
    "section": "619",
    "label": "Sleet (§619)",
    "parts": [
      {
        "key": "619-0",
        "name": "Sleet",
        "sourceValues": {
          "Speed": "13",
          "Magic": "8",
          "Armour": "6",
          "Health": "80"
        },
        "variants": {},
        "speed": 13,
        "magic": 8,
        "damageStat": "magic",
        "armour": 6,
        "health": 80,
        "role": "opponent"
      },
      {
        "key": "619-1",
        "name": "Shadow warg",
        "sourceValues": {
          "Speed": "12",
          "Magic": "6",
          "Armour": "5",
          "Health": "20"
        },
        "variants": {},
        "speed": 12,
        "magic": 6,
        "damageStat": "magic",
        "armour": 5,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "619-2",
        "name": "Shadow warg",
        "sourceValues": {
          "Speed": "12",
          "Magic": "6",
          "Armour": "5",
          "Health": "20"
        },
        "variants": {},
        "speed": 12,
        "magic": 6,
        "damageStat": "magic",
        "armour": 5,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "619-3",
        "name": "Shadow warg",
        "sourceValues": {
          "Speed": "12",
          "Magic": "6",
          "Armour": "5",
          "Health": "20"
        },
        "variants": {},
        "speed": 12,
        "magic": 6,
        "damageStat": "magic",
        "armour": 5,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "619-4",
        "name": "Shadow warg",
        "sourceValues": {
          "Speed": "12",
          "Magic": "6",
          "Armour": "5",
          "Health": "20"
        },
        "variants": {},
        "speed": 12,
        "magic": 6,
        "damageStat": "magic",
        "armour": 5,
        "health": 20,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Tendon ripper : Each time you take health damage from Sleet’s damage score, you must lower your speed by 1 for the next combat round.",
      "Slashing claws : At the end of each combat round, you must take 1 damage from each opponent remaining in combat.",
      "Bear power! : Nanuk adds 2 to your damage score for the duration of this combat.",
      "If you manage to fend off your savage attackers, turn to 758 ."
    ]
  },
  {
    "section": "626",
    "label": "Abyssal shadows (§626)",
    "parts": [
      {
        "key": "626-0",
        "name": "Abyssal shadows",
        "sourceValues": {
          "Speed": "14",
          "Magic": "7",
          "Armour": "4",
          "Health": "100"
        },
        "variants": {},
        "speed": 14,
        "magic": 7,
        "damageStat": "magic",
        "armour": 4,
        "health": 100,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Tide of darkness : At the end of any round where you do not play a speed or a combat ability, you must immediately take 5 damage, ignoring armour , as the shadows start to surround you.",
      "Fell heat : At the end of each combat round you must suffer 1 damage, ignoring armour , from the molten-blooded tentacle.",
      "If you manage to defeat this shadowy swarm, turn to 154 ."
    ]
  },
  {
    "section": "635",
    "label": "Instructor Barl (§635)",
    "parts": [
      {
        "key": "635-0",
        "name": "Instructor Barl",
        "sourceValues": {
          "Speed": "9",
          "Magic": "7",
          "Armour": "5",
          "Health": "60"
        },
        "variants": {},
        "speed": 9,
        "magic": 7,
        "damageStat": "magic",
        "armour": 5,
        "health": 60,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Enfeeblement : You cannot play any speed abilities for the duration of the combat.",
      "Short temper : At the start of the fifth combat round, if Barl is still alive he will go into a fit of rage. This will raise his speed by 1 and magic by 3 for the duration of the combat.",
      "If you manage to defeat the bullying Barl, turn to 71 ."
    ]
  },
  {
    "section": "655",
    "label": "Sabin (§655)",
    "parts": [
      {
        "key": "655-0",
        "name": "Sabin",
        "sourceValues": {
          "Speed": "7",
          "Brawn": "4",
          "Armour": "2",
          "Health": "40"
        },
        "variants": {},
        "speed": 7,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 2,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "655-1",
        "name": "Ruffian",
        "sourceValues": {
          "Speed": "6",
          "Brawn": "4",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {},
        "speed": 6,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "655-2",
        "name": "Ruffian",
        "sourceValues": {
          "Speed": "6",
          "Brawn": "3",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {},
        "speed": 6,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "655-3",
        "name": "Ruffian",
        "sourceValues": {
          "Speed": "6",
          "Brawn": "3",
          "Armour": "2",
          "Health": "20"
        },
        "variants": {},
        "speed": 6,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 2,
        "health": 20,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Knives in the dark : For every [1] you roll for your hero’s attack speed (before or after a reroll), you must automatically take 2 damage, ignoring armour .",
      "Outnumbered : At the end of each combat round, you must take 1 damage from each surviving opponent, ignoring armour . This ability only applies while you are faced with multiple opponents.",
      "If you manage to defeat these rash hoodlums, turn to 678 . If you are defeated, record the defeat on your hero sheet, then turn to 69 ."
    ]
  },
  {
    "section": "666",
    "label": "Cardinal (§666)",
    "parts": [
      {
        "key": "666-0",
        "name": "Cardinal",
        "sourceValues": {
          "Speed": "10",
          "Magic": "7",
          "Armour": "8",
          "Health": "60"
        },
        "variants": {},
        "speed": 10,
        "magic": 7,
        "damageStat": "magic",
        "armour": 8,
        "health": 60,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Reflect damage : Each time your damage score/damage dice cause health damage to Rile, you must take the half the damage you have inflicted (rounding up) as damage to your own hero, ignoring armour . (If Rile loses 14 health , you would lose 7.)",
      "Dark hate : You must take 2 damage at the end of every combat round, ignoring armour , from the cardinal’s deathly aura.",
      "If you manage to defeat this devilish trickster, turn to 774 . If you are defeated, remember to record your defeat on your hero sheet, then turn to 621 ."
    ]
  },
  {
    "section": "668",
    "label": "Nanuk (§668)",
    "parts": [
      {
        "key": "668-0",
        "name": "Nanuk",
        "sourceValues": {
          "Speed": "13",
          "Magic": "9",
          "Armour": "8",
          "Health": "80"
        },
        "variants": {},
        "speed": 13,
        "magic": 9,
        "damageStat": "magic",
        "armour": 8,
        "health": 80,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Basic instinct : Nanuk rolls two dice to determine his damage score.",
      "Spirit link : At the end of each round, roll a die. If the result is [3] or less, you must lose 4 health and Nanuk gains 4 health . (Note: this cannot take Nanuk past his starting health of 80.)",
      "If you manage to defeat the ancestor spirit, turn to 51 ."
    ]
  },
  {
    "section": "672",
    "label": "Drakaloth (§672)",
    "parts": [
      {
        "key": "672-0",
        "name": "Drakaloth",
        "sourceValues": {
          "Speed": "5",
          "Magic": "4",
          "Armour": "5",
          "Health": "30"
        },
        "variants": {},
        "speed": 5,
        "magic": 4,
        "damageStat": "magic",
        "armour": 5,
        "health": 30,
        "role": "opponent"
      },
      {
        "key": "672-1",
        "name": "Drakaloth",
        "sourceValues": {
          "Speed": "5",
          "Magic": "4",
          "Armour": "5",
          "Health": "25"
        },
        "variants": {},
        "speed": 5,
        "magic": 4,
        "damageStat": "magic",
        "armour": 5,
        "health": 25,
        "role": "opponent"
      },
      {
        "key": "672-2",
        "name": "Drakaloth",
        "sourceValues": {
          "Speed": "5",
          "Magic": "4",
          "Armour": "5",
          "Health": "20"
        },
        "variants": {},
        "speed": 5,
        "magic": 4,
        "damageStat": "magic",
        "armour": 5,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "672-3",
        "name": "Drakaloth",
        "sourceValues": {
          "Speed": "5",
          "Magic": "4",
          "Armour": "5",
          "Health": "20"
        },
        "variants": {},
        "speed": 5,
        "magic": 4,
        "damageStat": "magic",
        "armour": 5,
        "health": 20,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Hive mind : At the end of each combat round, you must take 1 damage from each surviving opponent, ignoring armour .",
      "Stalker’s spear : Caul adds 2 to your damage score for the duration of this combat.",
      "If you manage to defeat this dastardly swarm, turn to 40 ."
    ]
  },
  {
    "section": "681",
    "label": "Hyperbole (§681)",
    "parts": [
      {
        "key": "681-0",
        "name": "Hyperbole",
        "sourceValues": {
          "Speed": "7",
          "Magic": "5",
          "Armour": "4",
          "Health": "60"
        },
        "variants": {},
        "speed": 7,
        "magic": 5,
        "damageStat": "magic",
        "armour": 4,
        "health": 60,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Crown charge : If Hyperbole rolls a double for its attack speed, it automatically charges you with its pronged crown. This does damage equal to its current armour score, ignoring your armour . (Note: This damage is in addition to any further damage Hyperbole might cause by winning the round.)",
      "Thorn tongue : At the end of each combat round, roll a die. On a [1] or [2] result, you are hit by the creature’s tongue and must take 2 damage, ignoring armour . This also lowers your speed by 1 for the next round of combat only. A result of [3] or more means you have dodged the attack.",
      "If you manage to defeat this frenzied thicket, turn to 608 ."
    ]
  },
  {
    "section": "693",
    "label": "Eagle’s head (§693)",
    "parts": [
      {
        "key": "693-0",
        "name": "Eagle’s head",
        "sourceValues": {
          "Speed": "12",
          "Brawn": "9",
          "Armour": "5",
          "Health": "40"
        },
        "variants": {},
        "speed": 12,
        "brawn": 9,
        "damageStat": "brawn",
        "armour": 5,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "693-1",
        "name": "Troll’s arms",
        "sourceValues": {
          "Speed": "13",
          "Brawn": "10",
          "Armour": "7",
          "Health": "50"
        },
        "variants": {},
        "speed": 13,
        "brawn": 10,
        "damageStat": "brawn",
        "armour": 7,
        "health": 50,
        "role": "opponent"
      },
      {
        "key": "693-2",
        "name": "Drake’s tail",
        "sourceValues": {
          "Speed": "13",
          "Brawn": "9",
          "Armour": "9",
          "Health": "40"
        },
        "variants": {},
        "speed": 13,
        "brawn": 9,
        "damageStat": "brawn",
        "armour": 9,
        "health": 40,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Eagle’s cry : At the end of each combat round that the eagle’s head is still alive, you must lower your brawn and magic by 1. This cannot be restored until the end of the combat.",
      "Regeneration : While the troll’s arms are alive, all of your opponents heal 2 health at the end of each combat round. (note: This cannot take an opponent’s health above their starting scores.)",
      "Tail lash : If you roll a double for your attack speed (before or after a reroll) you must automatically take 5 damage, ignoring armour , from the drake’s tail (providing it is still in play).",
      "Blood ’n gore : Your opponent is immune to bleed .",
      "Grit and valour : Maune and Skoll add 2 to your damage score for the duration of this combat. (If you are an einherjar, you can add 3 to your damage score instead.)",
      "If you manage to take apart this vile abomination, turn to 462 ."
    ]
  },
  {
    "section": "698",
    "label": "Fenrir (§698)",
    "parts": [
      {
        "key": "698-0",
        "name": "Fenrir",
        "sourceValues": {
          "Speed": "5",
          "Magic": "3",
          "Armour": "4",
          "Health": "40"
        },
        "variants": {},
        "speed": 5,
        "magic": 3,
        "damageStat": "magic",
        "armour": 4,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "698-1",
        "name": "Jaws of Fenrir",
        "sourceValues": {
          "Speed": "4",
          "Magic": "2",
          "Armour": "3",
          "Health": "40"
        },
        "variants": {},
        "speed": 4,
        "magic": 2,
        "damageStat": "magic",
        "armour": 3,
        "health": 40,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Corrupted claws : Each time you take health damage from Fenrir you must lower your brawn and magic by 1 for the duration of the combat.",
      "Jaws of Fenrir : At the end of each combat round you must take 4 damage, ignoring armour , from the shadowy fangs. Once the jaws are defeated, this ability no longer applies",
      "Baiting the beast : The hunters’ weapons seem ineffective against your ghostly enemies, unlike your own. However, they are able to distract Fenrir and his minion. If you lose a combat round, roll a die. If the result is [3] or less, your enemy is distracted and does not roll for damage. [4] or more and the combat round proceeds as normal.",
      "If you manage to defeat both enemies, restore any affected attributes and turn to 712 ."
    ]
  },
  {
    "section": "702",
    "label": "Desnar (§702)",
    "parts": [
      {
        "key": "702-0",
        "name": "Desnar",
        "sourceValues": {
          "Speed": "6",
          "Brawn": "5",
          "Armour": "4",
          "Health": "60"
        },
        "variants": {},
        "speed": 6,
        "brawn": 5,
        "damageStat": "brawn",
        "armour": 4,
        "health": 60,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "The ice vice : Create a copy of the diagram above. This represents the ice lake. Your hero is represented by the circle on the fifth column. You may wish to use a counter or die to represent your position.",
      "Losing ground : Each time you lose a combat round and take health damage from Desnar, you are forced back one column. If you win a round, you may advance a column (you can’t advance further than the starting column, on the far right.)",
      "Cracking ice : At the start of each combat round, the cracking ice advances one column (so at the start of the first round it would move to the 1 column, at the start of the second round the 2 column, and so on.) If your hero ends a combat round by standing on cracked ice, roll a die. If the result is [3] or less, the ice gives way and you plunge into the lake. This automatically loses you the combat. If the result is [4] or more, you manage to maintain your footing and the combat continues.",
      "Surefooted : Desnar is immune to the cracking ice – he must be defeated in combat for you to win the challenge.",
      "If you manage to defeat Desnar, turn to 714 . If you lose the combat, record your defeat on your hero sheet as normal, then turn to 613 ."
    ]
  },
  {
    "section": "703",
    "label": "Avalanche (§703)",
    "parts": [
      {
        "key": "703-0",
        "name": "Avalanche",
        "sourceValues": {
          "Speed": "9",
          "Magic": "5",
          "Armour": "6",
          "Health": "40 (*)"
        },
        "variants": {},
        "speed": 9,
        "magic": 5,
        "damageStat": "magic",
        "armour": 6,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "703-1",
        "name": "Ice elemental (*)",
        "sourceValues": {
          "Speed": "8",
          "Magic": "4",
          "Armour": "4",
          "Health": "25"
        },
        "variants": {},
        "speed": 8,
        "magic": 4,
        "damageStat": "magic",
        "armour": 4,
        "health": 25,
        "role": "opponent"
      },
      {
        "key": "703-2",
        "name": "Rock elemental (*)",
        "sourceValues": {
          "Speed": "8",
          "Magic": "4",
          "Armour": "5",
          "Health": "20"
        },
        "variants": {},
        "speed": 8,
        "magic": 4,
        "damageStat": "magic",
        "armour": 5,
        "health": 20,
        "role": "opponent"
      },
      {
        "key": "703-3",
        "name": "Rock elemental (*)",
        "sourceValues": {
          "Speed": "8",
          "Magic": "4",
          "Armour": "5",
          "Health": "20"
        },
        "variants": {},
        "speed": 8,
        "magic": 4,
        "damageStat": "magic",
        "armour": 5,
        "health": 20,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Break down : When Avalanche is defeated (reduced to zero health ), its body splits into three elementals (an ice elemental and two rock elementals). You then have three rounds of combat against these elementals. At the beginning of the fourth round, they re-join to form a new Avalanche (with 40 health ). You must defeat Avalanche again, before it will release the elementals (with the health they have remaining) – giving you three rounds to fight them before another Avalanche is formed. This cycle repeats until you have defeated all three elementals.",
      "Enchanted elements : Avalanche and the three elementals are immune to all passive abilities, including the passive damage from frost hound and vital artery .",
      "Skards’ might : Skoll and Anise add 2 to your damage score for the duration of this combat. (If you are an einherjar, you can add 3 to your damage score instead.)",
      "(Note: When fighting Avalanche, the elementals cannot be harmed. You can only attack and apply damage to the elementals once Avalanche has been defeated each time.)",
      "If you manage to defeat this dread behemoth, turn to 757 ."
    ]
  },
  {
    "section": "716",
    "label": "Blue Angel (§716)",
    "parts": [
      {
        "key": "716-0",
        "name": "Blue Angel",
        "sourceValues": {
          "Speed": "7",
          "Brawn": "4",
          "Armour": "3",
          "Health": "70"
        },
        "variants": {},
        "speed": 7,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 3,
        "health": 70,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Eyes on the prize : You cannot use special abilities in this combat.",
      "Competitive spirit : At the end of each combat round you must take 2 damage, ignoring armour , from the girl’s slashing daggers.",
      "If you manage to beat this deadly racer, turn to 700 . If you are defeated, remember to record the defeat on your hero sheet, then turn to 378 ."
    ]
  },
  {
    "section": "729",
    "label": "Tiamort (§729)",
    "parts": [
      {
        "key": "729-0",
        "name": "Tiamort",
        "sourceValues": {
          "Speed": "12",
          "Magic": "7",
          "Armour": "5",
          "Health": "60"
        },
        "variants": {},
        "speed": 12,
        "magic": 7,
        "damageStat": "magic",
        "armour": 5,
        "health": 60,
        "role": "opponent"
      },
      {
        "key": "729-1",
        "name": "Luicris",
        "sourceValues": {
          "Speed": "12",
          "Magic": "6",
          "Armour": "6",
          "Health": "70"
        },
        "variants": {},
        "speed": 12,
        "magic": 6,
        "damageStat": "magic",
        "armour": 6,
        "health": 70,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Aura of enfeeblement : While Tiamort is alive, you cannot use speed abilities.",
      "Choking cloud : You must lose 2 health at the end of the first combat round. This damage increases by 1 each round up to a maximum of 5. Once Luicris is defeated the cloud decreases in damage by 1 in each subsequent round, until it reaches zero.",
      "Rough ride : If you have the keyword frazzled or rocked on your hero sheet, you may lower both opponents’ starting health by 10.",
      "Fire at will : You may use your nail gun or dragon fire ability in this combat. (Note: If your transport’s stability has been reduced to zero, you can no longer use its associated ability.)",
      "If you manage to defeat the two zombie dragons, turn to 651 ."
    ]
  },
  {
    "section": "737",
    "label": "Caul (§737)",
    "parts": [
      {
        "key": "737-0",
        "name": "Caul",
        "sourceValues": {
          "Speed": "6",
          "Brawn": "5",
          "Armour": "4",
          "Health": "40"
        },
        "variants": {},
        "speed": 6,
        "brawn": 5,
        "damageStat": "brawn",
        "armour": 4,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "737-1",
        "name": "Tentacles",
        "sourceValues": {
          "Speed": "5",
          "Brawn": "4",
          "Armour": "2",
          "Health": "25"
        },
        "variants": {},
        "speed": 5,
        "brawn": 4,
        "damageStat": "brawn",
        "armour": 2,
        "health": 25,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Hunter’s guile : If Caul rolls a double for his attack speed, he automatically wins the round, even if your result was higher. You cannot use reroll abilities to alter this outcome.",
      "Fafnir’s embrace : The tentacles are trying to latch onto you and drain your life force. At the end of each combat round roll a die. If the result is [3] or less, the tentacles have latched onto you. This immediately lowers your brawn and magic by 1 each time. If the result is [4] or more, you have managed to avoid them, suffering no penalty. (If the tentacles are reduced to zero health , this ability no longer applies. However, you cannot restore your lowered attributes until the end of the combat)",
      "If you defeat your devious opponents, restore any lowered attributes then turn to 615 ."
    ]
  },
  {
    "section": "741",
    "label": "Mandaleev (§741)",
    "parts": [
      {
        "key": "741-0",
        "name": "Mandaleev",
        "sourceValues": {
          "Speed": "8",
          "Brawn": "6",
          "Armour": "4",
          "Health": "70"
        },
        "variants": {},
        "speed": 8,
        "brawn": 6,
        "damageStat": "brawn",
        "armour": 4,
        "health": 70,
        "role": "opponent"
      },
      {
        "key": "741-1",
        "name": "Tentacle",
        "sourceValues": {
          "Speed": "7",
          "Brawn": "3",
          "Armour": "3",
          "Health": "10"
        },
        "variants": {},
        "speed": 7,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 3,
        "health": 10,
        "role": "opponent"
      },
      {
        "key": "741-2",
        "name": "Tentacle",
        "sourceValues": {
          "Speed": "7",
          "Brawn": "3",
          "Armour": "3",
          "Health": "10"
        },
        "variants": {},
        "speed": 7,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 3,
        "health": 10,
        "role": "opponent"
      },
      {
        "key": "741-3",
        "name": "Tentacle",
        "sourceValues": {
          "Speed": "7",
          "Brawn": "3",
          "Armour": "3",
          "Health": "10"
        },
        "variants": {},
        "speed": 7,
        "brawn": 3,
        "damageStat": "brawn",
        "armour": 3,
        "health": 10,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Miracle grow : At the start of every round (after the first), Mandaleev grows another tentacle, with the same attributes as the previous ones.",
      "We got chemistry : At the end of every round, you must automatically take 1 damage, ignoring armour , from each tentacle currently in play.",
      "Good vibrations : For every double you roll for your attack speed, Talia’s energised blades will cut through one of the tentacles, reducing it to zero health (you may choose which tentacle is defeated).",
      "Once Mandaleev is defeated, any remaining tentacles are also automatically defeated. If you manage to best this mutated horror, turn to 393 ."
    ]
  },
  {
    "section": "751",
    "label": "Sable (§751)",
    "parts": [
      {
        "key": "751-0",
        "name": "Sable",
        "sourceValues": {
          "Speed": "13",
          "Magic": "10",
          "Armour": "7",
          "Health": "100"
        },
        "variants": {},
        "speed": 13,
        "magic": 10,
        "damageStat": "magic",
        "armour": 7,
        "health": 100,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Might of chaos : Each time Sable wins a combat round, roll a die to determine the nature of his attack:",
      "[1] or [2] Sable heals himself instead of rolling for a damage score, restoring 10 health . (This cannot take him above his starting health of 100.)",
      "[3] or [4] Sable rolls for a damage score as normal. [5] or [6] Sable inflicts a curse on you. This causes three dice of damage to your hero, ignoring armour , and stops you playing any speed or combat abilities in the next combat round.",
      "Fang and claw : Roll a die and add 2 to the result. This is the number of combat rounds that it will take Nanuk to defeat Sable’s wolf. (If you rolled a [4] then the wolf would be defeated at the end of the sixth combat round.) Once the wolf is defeated, Sable’s magic is reduced by 2 and he immediately loses 10 health .",
      "If you manage to defeat the dark prince, turn to 658 ."
    ]
  },
  {
    "section": "752",
    "label": "Talia (§752)",
    "parts": [
      {
        "key": "752-0",
        "name": "Talia",
        "sourceValues": {
          "Speed": "7",
          "Brawn": "7",
          "Armour": "4",
          "Health": "60"
        },
        "variants": {},
        "speed": 7,
        "brawn": 7,
        "damageStat": "brawn",
        "armour": 4,
        "health": 60,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Gift of the gab : The bard taunts you throughout the battle, seeking to distract you. All your [6] results when rolling for attack speed must be rerolled.",
      "If you manage to defeat this taunting temptress, turn to 622 . If you are defeated, remember to record the defeat on your hero sheet and turn to 56 ."
    ]
  },
  {
    "section": "767",
    "label": "Nightwing (§767)",
    "parts": [
      {
        "key": "767-0",
        "name": "Nightwing",
        "sourceValues": {
          "Speed": "10",
          "Magic": "5",
          "Armour": "4",
          "Health": "40"
        },
        "variants": {},
        "speed": 10,
        "magic": 5,
        "damageStat": "magic",
        "armour": 4,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "767-1",
        "name": "Nightwing",
        "sourceValues": {
          "Speed": "10",
          "Magic": "5",
          "Armour": "4",
          "Health": "40"
        },
        "variants": {},
        "speed": 10,
        "magic": 5,
        "damageStat": "magic",
        "armour": 4,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "767-2",
        "name": "Nightwing",
        "sourceValues": {
          "Speed": "9",
          "Magic": "4",
          "Armour": "4",
          "Health": "40"
        },
        "variants": {},
        "speed": 9,
        "magic": 4,
        "damageStat": "magic",
        "armour": 4,
        "health": 40,
        "role": "opponent"
      },
      {
        "key": "767-3",
        "name": "Nightwing",
        "sourceValues": {
          "Speed": "9",
          "Magic": "4",
          "Armour": "4",
          "Health": "40"
        },
        "variants": {},
        "speed": 9,
        "magic": 4,
        "damageStat": "magic",
        "armour": 4,
        "health": 40,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Shoot ’em up : You have five combat rounds before the nightwings reach the tower. They cannot attack you during this time, but you are able to fire at them using the magic crossbow. In each round, roll for speed against a chosen opponent as normal. If you are successful, you have hit them with a crossbow bolt. This inflicts 4 dice of damage, ignoring armour . If you lose, the round ends and the next one begins. At the start of the sixth combat round, the remainder of the combat is fought as normal.",
      "Ranged combat : For the first five combat rounds, you cannot apply/use any abilities. Once the sixth combat round starts, abilities can be used as normal.",
      "Outnumbered : Once you are in regular combat, each opponent inflicts 1 damage, ignoring armour , at the end of each combat round. This ability only applies while you are faced with multiple opponents.",
      "If you manage to blast these winged horrors out of the skies, turn to 598 ."
    ]
  },
  {
    "section": "777",
    "label": "Jormungdar (§777)",
    "parts": [
      {
        "key": "777-0",
        "name": "Jormungdar",
        "sourceValues": {
          "Speed": "13",
          "Brawn": "10",
          "Armour": "18/8 (*)",
          "Health": "120"
        },
        "variants": {
          "armour": [
            18,
            8
          ]
        },
        "speed": 13,
        "brawn": 10,
        "damageStat": "brawn",
        "armour": 18,
        "health": 120,
        "role": "opponent"
      },
      {
        "key": "777-1",
        "name": "Black miasma",
        "sourceValues": {
          "Speed": "14",
          "Brawn": "8",
          "Armour": "7",
          "Health": "50"
        },
        "variants": {},
        "speed": 14,
        "brawn": 8,
        "damageStat": "brawn",
        "armour": 7,
        "health": 50,
        "role": "opponent"
      },
      {
        "key": "777-2",
        "name": "Dread rattles",
        "sourceValues": {
          "Speed": "13",
          "Brawn": "6",
          "Armour": "6",
          "Health": "60"
        },
        "variants": {},
        "speed": 13,
        "brawn": 6,
        "damageStat": "brawn",
        "armour": 6,
        "health": 60,
        "role": "opponent"
      },
      {
        "key": "777-3",
        "name": "Spine collar",
        "sourceValues": {
          "Speed": "13",
          "Brawn": "6",
          "Armour": "8",
          "Health": "50"
        },
        "variants": {},
        "speed": 13,
        "brawn": 6,
        "damageStat": "brawn",
        "armour": 8,
        "health": 50,
        "role": "opponent"
      }
    ],
    "printedRules": [
      "Special abilities",
      "Black miasma : At the end of each combat round, Jormungdar heals 5 health (this cannot take him above his starting health of 120). Once the black miasma is defeated (or Jormungdar is reduced to zero health ), this ability no longer applies.",
      "Dread rattles : While the dread rattles have health , you cannot play any speed abilities. Once the dread rattles are defeated, you no longer suffer a penalty and you may use speed abilities as normal.",
      "Spine collar : (*) At the end of each combat round you must take 2 damage, ignoring armour , from the creature’s deadly spines. Once the spine collar is defeated, this ability no longer applies and Jormungdar’s armour is lowered by 10 for the remainder of the combat.",
      "Allies’ abilities",
      "(Each of the following abilities can be used once during this combat.)",
      "Rousing blast (mo) : The einherjar horns boost your spirit and fill you with renewed strength. You may increase your brawn or magic by 4 for one combat round, and restore 4 health .",
      "Habrok’s flock (mo) : The birds’ persistent attacks distract Jormungdar and provide you with a welcome respite. Use this ability to immediately restore one speed or combat ability that you have already played, allowing you to play it again.",
      "Storm of spears (co) : The Skards launch their spears at the beast. Use this ability instead of rolling for a damage score. This inflicts 2 damage dice to each opponent, ignoring armour . Roll separately for each.",
      "Naglfar and Nidhogg : If you have the captain’s conch and/or the dragon’s horn you can summon these allies to aid you in the battle, giving you access to their associated ability ( nail gun and/or dragon’s breath ) once each during the combat.",
      "Once Jormungdar is reduced to zero health , you have won the combat (even if other opponents still have health ).",
      "If you manage to defeat this monstrous demon of the underworld, turn to 722 ."
    ]
  }
]);
const bySection = new Map(WINTER_ENCOUNTERS.map(entry => [entry.section, entry]));
export function winterRosterFor(section) {
  const entry = bySection.get(String(section));
  if (!entry) throw new RangeError('Unknown Winter encounter');
  return structuredClone(entry);
}

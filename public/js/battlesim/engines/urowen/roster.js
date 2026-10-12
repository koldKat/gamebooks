export const UROWEN_SOURCE = {
  "bookId": 550,
  "encounters": [
    {
      "section": 8,
      "rows": [
        {
          "name": "Bandit",
          "attribute": "SK",
          "attributeValue": 1,
          "life": 20,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 0,
          "armorByLocation": [
            0,
            2,
            2,
            2,
            0,
            0
          ]
        }
      ],
      "enemyRules": {
        "retreatAtLife": 8,
        "precombatVolley": {"hitOn": [1, 6], "damage": 2}
      },
      "encounterRules": {}
    },
    {
      "section": 9,
      "rows": [
        {
          "name": "Bandit",
          "attribute": "SK",
          "attributeValue": 0,
          "life": 15,
          "power": 0,
          "damageDice": 1,
          "damageBonus": -4,
          "armorByLocation": [
            0,
            0,
            0,
            0,
            0,
            0
          ]
        }
      ],
      "enemyRules": {
        "retreatAtLife": 10
      },
      "encounterRules": {}
    },
    {
      "section": 25,
      "rows": [
        {
          "name": "Black wolf",
          "attribute": "SK",
          "attributeValue": 1,
          "life": 11,
          "power": 0,
          "damageDice": 1,
          "damageBonus": -1,
          "armorByLocation": [
            0,
            0,
            0,
            0,
            0,
            0
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Extra": 2
      },
      "encounterRules": {}
    },
    {
      "section": 27,
      "rows": [
        {
          "name": "Bandit",
          "attribute": "SK",
          "attributeValue": 0,
          "life": 19,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 0,
          "armorByLocation": [
            1,
            0,
            0,
            0,
            1,
            0
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {}
    },
    {
      "section": 37,
      "rows": [
        {
          "name": "Nocthilius",
          "attribute": "SK",
          "attributeValue": 2,
          "life": 20,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 1,
          "armorByLocation": [
            0,
            0,
            0,
            0,
            0,
            0
          ]
        }
      ],
      "enemyRules": {
        "rawDamage1Venom": 1
      },
      "encounterRules": {}
    },
    {
      "section": 46,
      "rows": [
        {
          "name": "Jealous enemy",
          "attribute": "STR",
          "attributeValue": 1,
          "life": 20,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            0,
            2,
            2,
            2,
            0,
            0
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {
        "playerArmor": false,
        "hunterArrow": false,
        "items": false
      }
    },
    {
      "section": 51,
      "rows": [
        {
          "name": "Hooded enemy",
          "attribute": "SK",
          "attributeValue": 1,
          "life": 20,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 1,
          "armorByLocation": [
            0,
            2,
            2,
            2,
            0,
            0
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {}
    },
    {
      "section": 70,
      "rows": [
        {
          "name": "Ainara (unknown being)",
          "attribute": "SK",
          "attributeValue": 1,
          "life": 20,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 0,
          "armorByLocation": [
            1,
            1,
            1,
            1,
            1,
            1
          ]
        }
      ],
      "enemyRules": {
        "dodgeOn": [
          6
        ]
      },
      "encounterRules": {}
    },
    {
      "section": 77,
      "rows": [
        {
          "name": "Guard of the Cult of the Golden Light",
          "attribute": "SK",
          "attributeValue": 1,
          "life": 19,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 1,
          "armorByLocation": [
            0,
            1,
            1,
            1,
            0,
            0
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {}
    },
    {
      "section": 79,
      "rows": [
        {
          "name": "Drunken opponent",
          "attribute": "SK",
          "attributeValue": 1,
          "life": 17,
          "power": 0,
          "damageDice": 1,
          "damageBonus": -1,
          "armorByLocation": [
            0,
            2,
            2,
            2,
            0,
            0
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {
        "bareHandsBonus": -1,
        "weapons": false,
        "spells": false,
        "items": false,
        "bothRawDamage6Base": 7
      }
    },
    {
      "section": 82,
      "rows": [
        {
          "name": "Soldier of Verinfes",
          "attribute": "SK",
          "attributeValue": 2,
          "life": 21,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 1,
          "armorByLocation": [
            0,
            1,
            1,
            1,
            0,
            0
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {
        "temporaryPossession": true,
        "restoreOriginalAt": 105
      }
    },
    {
      "section": 94,
      "rows": [
        {
          "name": "Second watchman of the Cult of the Golden Light",
          "attribute": "SK",
          "attributeValue": 1,
          "life": 22,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            0,
            2,
            2,
            2,
            0,
            0
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {}
    },
    {
      "section": 101,
      "rows": [
        {
          "name": "First bodyguard of the Cult of the Golden Light",
          "attribute": "SK",
          "attributeValue": 1,
          "life": 20,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 0,
          "armorByLocation": [
            0,
            1,
            1,
            1,
            0,
            0
          ]
        },
        {
          "name": "Second bodyguard of the Cult of the Golden Light",
          "attribute": "SK",
          "attributeValue": 2,
          "life": 21,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 0,
          "armorByLocation": [
            0,
            2,
            2,
            2,
            0,
            2
          ]
        },
        {
          "name": "Dévian",
          "attribute": "SK",
          "attributeValue": 3,
          "life": 20,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            0,
            2,
            2,
            2,
            0,
            0
          ]
        }
      ],
      "enemyRules": {
        "byIndex": {
          "2": {
            "rawDamage6Bleed": 1
          }
        }
      },
      "encounterRules": {
        "temporaryLife": 50,
        "noRestoreBetweenEnemies": true
      }
    },
    {
      "section": 104,
      "rows": [
        {
          "name": "Nédrik-Nigodar",
          "attribute": "STR",
          "attributeValue": 4,
          "life": 30,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            2,
            4,
            4,
            4,
            2,
            3
          ]
        }
      ],
      "enemyRules": {
        "rage": {
          "belowLife": 10,
          "attributeValue": 5
        }
      },
      "encounterRules": {}
    },
    {
      "section": 105,
      "rows": [
        {
          "name": "Korindor",
          "attribute": "MAG",
          "attributeValue": 1,
          "life": 20,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 0,
          "armorByLocation": [
            0,
            0,
            0,
            0,
            0,
            0
          ]
        }
      ],
      "enemyRules": {
        "ignorePlayerArmor": true,
        "headHitOngoing": 1
      },
      "encounterRules": {}
    },
    {
      "section": 110,
      "rows": [
        {
          "name": "Third guard of the Cult of the Golden Light",
          "attribute": "SK",
          "attributeValue": 2,
          "life": 20,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            0,
            2,
            2,
            2,
            0,
            3
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {}
    },
    {
      "section": 111,
      "rows": [
        {
          "name": "Spirit of the Forest",
          "attribute": "STR",
          "attributeValue": 3,
          "life": 20,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            3,
            3,
            3,
            3,
            3,
            3
          ]
        }
      ],
      "enemyRules": {
        "appendages": {
          "count": 2,
          "life": 7,
          "roundEndDamageEach": 1,
          "armor": 0,
          "location": false
        }
      },
      "encounterRules": {
        "mountedPlayerAttackBonus": 1,
        "rerollPlayerLegLocation": true
      }
    },
    {
      "section": 113,
      "rows": [
        {
          "name": "Third painted-face bandit",
          "attribute": "SK",
          "attributeValue": 3,
          "life": 25,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            1,
            3,
            3,
            3,
            1,
            2
          ]
        }
      ],
      "enemyRules": {
        "whip": {
          "rollAtLeast": 5,
          "extraDamage": 1,
          "nextAttackPenalty": 1
        }
      },
      "encounterRules": {}
    },
    {
      "section": 115,
      "rows": [
        {
          "name": "First soldier of Verinfes",
          "attribute": "SK",
          "attributeValue": 1,
          "life": 20,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            0,
            2,
            2,
            2,
            0,
            0
          ]
        },
        {
          "name": "Second soldier of Verinfes",
          "attribute": "SK",
          "attributeValue": 2,
          "life": 22,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            0,
            2,
            2,
            2,
            0,
            2
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {
        "noRestoreBetweenEnemies": true,
        "sourceWording": "two at the same time; first combat and next",
        "reviewRequired": "Represent the printed first/next sequence without inventing support damage."
      }
    },
    {
      "section": 119,
      "rows": [
        {
          "name": "The Golden One",
          "attribute": "STR",
          "attributeValue": 1,
          "life": 21,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 0,
          "armorByLocation": [
            0,
            2,
            2,
            2,
            1,
            0
          ]
        }
      ],
      "enemyRules": {
        "anyRaw6Heal": 1,
        "retreatAtLife": 7
      },
      "encounterRules": {}
    },
    {
      "section": 123,
      "rows": [
        {
          "name": "First painted-face bandit",
          "attribute": "SK",
          "attributeValue": 3,
          "life": 20,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            0,
            2,
            2,
            2,
            0,
            0
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {
        "mountedPlayerAttackBonus": 1,
        "rerollPlayerLegLocation": true
      }
    },
    {
      "section": 126,
      "rows": [
        {
          "name": "Captain of Verinfes",
          "attribute": "SK",
          "attributeValue": 3,
          "life": 25,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            1,
            2,
            2,
            2,
            1,
            2
          ]
        }
      ],
      "enemyRules": {
        "rerollAll": [
          1
        ]
      },
      "encounterRules": {}
    },
    {
      "section": 135,
      "rows": [
        {
          "name": "Wild dog",
          "attribute": "SK",
          "attributeValue": 1,
          "life": 14,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 0,
          "armorByLocation": [
            0,
            0,
            0,
            0,
            0,
            0
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Extra": 2
      },
      "encounterRules": {}
    },
    {
      "section": 137,
      "rows": [
        {
          "name": "Second bandit of the painted face",
          "attribute": "STR",
          "attributeValue": 3,
          "life": 24,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            0,
            3,
            3,
            3,
            0,
            3
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {}
    },
    {
      "section": 144,
      "rows": [
        {
          "name": "Veteran soldier of Verinfes",
          "attribute": "SK",
          "attributeValue": 3,
          "life": 25,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            2,
            3,
            3,
            3,
            2,
            3
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {
        "bothStopAtLife": 5
      }
    },
    {
      "section": 150,
      "rows": [
        {
          "name": "Ardronte",
          "attribute": "SK",
          "attributeValue": 4,
          "life": 28,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            3,
            3,
            3,
            3,
            3,
            3
          ]
        }
      ],
      "enemyRules": {
        "secondHeadRoundEnd": {
          "damage": 1,
          "whileLifeAbove": 18
        },
        "headHitAttackPenalty": 1
      },
      "encounterRules": {}
    },
    {
      "section": 157,
      "rows": [
        {
          "name": "First raedénys",
          "attribute": "STR",
          "attributeValue": 3,
          "life": 25,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            0,
            3,
            3,
            3,
            0,
            2
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {}
    },
    {
      "section": 160,
      "rows": [
        {
          "name": "Rapist",
          "attribute": "STR",
          "attributeValue": 4,
          "life": 21,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            1,
            3,
            3,
            3,
            1,
            0
          ]
        }
      ],
      "enemyRules": {
        "rerollAttackOnly": [
          1
        ]
      },
      "encounterRules": {}
    },
    {
      "section": 163,
      "rows": [
        {
          "name": "Nédrik-Nigodar",
          "attribute": "STR",
          "attributeValue": 6,
          "life": 30,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            2,
            4,
            4,
            4,
            2,
            3
          ]
        }
      ],
      "enemyRules": {
        "rage": {
          "belowLife": 10,
          "attributeValue": 7
        }
      },
      "encounterRules": {
        "curseStage": 2,
        "restoreOriginalAt": [
          174,
          226
        ]
      }
    },
    {
      "section": 173,
      "rows": [
        {
          "name": "Second raedénys",
          "attribute": "STR",
          "attributeValue": 3,
          "life": 24,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            1,
            3,
            3,
            3,
            1,
            2
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {}
    },
    {
      "section": 176,
      "rows": [
        {
          "name": "Stranger from Balkaar",
          "attribute": "SK",
          "attributeValue": 4,
          "life": 25,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            2,
            3,
            3,
            3,
            2,
            0
          ]
        }
      ],
      "enemyRules": {
        "rerollAll": [
          1
        ]
      },
      "encounterRules": {}
    },
    {
      "section": 178,
      "rows": [
        {
          "name": "Mhandara",
          "attribute": "SK",
          "attributeValue": 5,
          "life": 27,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            2,
            3,
            3,
            3,
            2,
            0
          ]
        }
      ],
      "enemyRules": {
        "rerollAll": [
          1
        ],
        "rawDamage6Bleed": 2
      },
      "encounterRules": {
        "curseStage": 2
      }
    },
    {
      "section": 189,
      "rows": [
        {
          "name": "Wild boar",
          "attribute": "SK",
          "attributeValue": 3,
          "life": 28,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            1,
            1,
            1,
            1,
            1,
            1
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Bleed": 2
      },
      "encounterRules": {
        "curseStage": 1,
        "restoreOriginalAt": 198
      }
    },
    {
      "section": 195,
      "rows": [
        {
          "name": "Siiod-Helbérian",
          "attribute": "MAG",
          "attributeValue": 6,
          "life": 30,
          "power": 4,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            2,
            4,
            4,
            4,
            2,
            3
          ]
        }
      ],
      "enemyRules": {
        "invisibility": {
          "belowLife": 8,
          "onWonAttack": true,
          "powerCost": 4,
          "attacks": 2,
          "playerDodgeOn": [
            6
          ]
        }
      },
      "encounterRules": {
        "curseStage": 2,
        "restoreOriginalAt": [
          174,
          226
        ]
      }
    },
    {
      "section": 206,
      "rows": [
        {
          "name": "Pheasant",
          "attribute": "SK",
          "attributeValue": 3,
          "life": 15,
          "power": 0,
          "damageDice": 1,
          "damageBonus": -4,
          "armorByLocation": [
            0,
            0,
            0,
            0,
            0,
            0
          ]
        }
      ],
      "enemyRules": {
        "escapeOnRawDamage": [
          4,
          5,
          6
        ],
        "escapeDestination": 162
      },
      "encounterRules": {
        "curseStage": 1,
        "restoreOriginalAt": 198
      }
    },
    {
      "section": 210,
      "rows": [
        {
          "name": "Tavern opponent",
          "attribute": "SK",
          "attributeValue": 3,
          "life": 26,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 0,
          "armorByLocation": [
            0,
            3,
            3,
            3,
            0,
            0
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {
        "bareHandsBonus": 0,
        "weapons": false,
        "spells": false,
        "items": false,
        "bothRawDamage6Base": 9
      }
    },
    {
      "section": 216,
      "rows": [
        {
          "name": "Black bear",
          "attribute": "STR",
          "attributeValue": 5,
          "life": 33,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            2,
            2,
            2,
            2,
            2,
            2
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Bleed": 2
      },
      "encounterRules": {}
    },
    {
      "section": 223,
      "rows": [
        {
          "name": "Second tavern opponent",
          "attribute": "SK",
          "attributeValue": 4,
          "life": 29,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 0,
          "armorByLocation": [
            2,
            3,
            3,
            3,
            2,
            0
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {
        "bareHandsBonus": 0,
        "weapons": false,
        "spells": false,
        "items": false,
        "bothRawDamage6Base": 9
      }
    },
    {
      "section": 224,
      "rows": [
        {
          "name": "Sistéliums",
          "attribute": "SK",
          "attributeValue": 4,
          "life": 7,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            2,
            2,
            2,
            2,
            2,
            2
          ]
        }
      ],
      "enemyRules": {
        "copies": 5,
        "startRoundSupportDamage": "floor((alive - 1) / 2)"
      },
      "encounterRules": {
        "noRestoreBetweenEnemies": true
      }
    },
    {
      "section": 227,
      "rows": [
        {
          "name": "Bors of Raidyén",
          "attribute": "STR",
          "attributeValue": 6,
          "life": 36,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 5,
          "armorByLocation": [
            2,
            5,
            5,
            5,
            2,
            4
          ]
        }
      ],
      "enemyRules": {
        "blockPlayerRawDamage6": true,
        "rawDamage6CumulativeAttackPenalty": 1
      },
      "encounterRules": {}
    },
    {
      "section": 232,
      "rows": [
        {
          "name": "Arachnid monstrosity",
          "attribute": "SK",
          "attributeValue": 4,
          "life": 25,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            4,
            4,
            4,
            4,
            4,
            4
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Venom": 1,
        "rawDamage6AttackPenalty": 1
      },
      "encounterRules": {}
    },
    {
      "section": 235,
      "rows": [
        {
          "name": "Third mountain lion, leader of the pride",
          "attribute": "SK",
          "attributeValue": 5,
          "life": 31,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            2,
            2,
            2,
            2,
            2,
            2
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Bleed": 2,
        "supportLion": {
          "damageDice": 1,
          "damageBonus": 2,
          "normalLocationAndArmor": true
        }
      },
      "encounterRules": {
        "curseStage": 3,
        "restoreOriginalAt": 250
      }
    },
    {
      "section": 241,
      "rows": [
        {
          "name": "Mountain lion",
          "attribute": "SK",
          "attributeValue": 3,
          "life": 26,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            1,
            1,
            1,
            1,
            1,
            1
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Bleed": 1
      },
      "encounterRules": {}
    },
    {
      "section": 242,
      "rows": [
        {
          "name": "Hireling leader under Krénator’s command",
          "attribute": "STR",
          "attributeValue": 5,
          "life": 29,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 5,
          "armorByLocation": [
            2,
            4,
            4,
            4,
            2,
            3
          ]
        }
      ],
      "enemyRules": {
        "reflectPlayerRawDamage6": 3,
        "reflectionIgnoresArmor": true,
        "stillReceivePlayerHit": true
      },
      "encounterRules": {}
    },
    {
      "section": 244,
      "rows": [
        {
          "name": "Black tiger",
          "attribute": "SK",
          "attributeValue": 5,
          "life": 29,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            3,
            3,
            3,
            3,
            3,
            3
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Bleed": 2
      },
      "encounterRules": {}
    },
    {
      "section": 246,
      "rows": [
        {
          "name": "Krénator deputy",
          "attribute": "STR",
          "attributeValue": 6,
          "life": 40,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 6,
          "armorByLocation": [
            4,
            4,
            4,
            4,
            4,
            0
          ]
        }
      ],
      "enemyRules": {
        "rerollAllBelowLife": {
          "belowLife": 7,
          "values": [
            1,
            2
          ]
        },
        "wonRawAttack6NextPenalty": 1
      },
      "encounterRules": {}
    },
    {
      "section": 255,
      "rows": [
        {
          "name": "Second mountain lion",
          "attribute": "SK",
          "attributeValue": 3,
          "life": 26,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            1,
            1,
            1,
            1,
            1,
            1
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Bleed": 1,
        "supportLion": {
          "damageDice": 1,
          "damageBonus": 2,
          "normalLocationAndArmor": true
        }
      },
      "encounterRules": {}
    },
    {
      "section": 262,
      "rows": [
        {
          "name": "Ciishdor",
          "attribute": "STR",
          "attributeValue": 4,
          "life": 26,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 0,
          "armorByLocation": [
            0,
            3,
            3,
            3,
            0,
            0
          ]
        }
      ],
      "enemyRules": {
        "locationIncrease": 1,
        "maximumLocation": 6
      },
      "encounterRules": {
        "bareHandsBonus": 0,
        "weapons": false,
        "spells": false,
        "items": false,
        "unlimitedWager": true
      }
    },
    {
      "section": 267,
      "rows": [
        {
          "name": "First guard",
          "attribute": "SK",
          "attributeValue": 5,
          "life": 25,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            0,
            3,
            3,
            3,
            0,
            3
          ]
        },
        {
          "name": "Second guard",
          "attribute": "STR",
          "attributeValue": 5,
          "life": 30,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 5,
          "armorByLocation": [
            1,
            3,
            3,
            3,
            1,
            2
          ]
        },
        {
          "name": "Third guard",
          "attribute": "STR",
          "attributeValue": 6,
          "life": 33,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 6,
          "armorByLocation": [
            2,
            4,
            4,
            4,
            2,
            3
          ]
        },
        {
          "name": "Fourth guard",
          "attribute": "STR",
          "attributeValue": 6,
          "life": 38,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 7,
          "armorByLocation": [
            3,
            4,
            4,
            4,
            3,
            3
          ]
        }
      ],
      "enemyRules": {
        "byIndex": {
          "2": {
            "dodgeOn": [
              6
            ]
          },
          "3": {
            "dodgeOn": [
              6
            ],
            "rawDamage6Bleed": 2
          }
        }
      },
      "encounterRules": {
        "missionLife": 100,
        "noRestoreBetweenEnemies": true,
        "potionsPersistAcrossSequence": true
      }
    },
    {
      "section": 271,
      "rows": [
        {
          "name": "Cavern keeper",
          "attribute": "SK",
          "attributeValue": 5,
          "life": 27,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            1,
            3,
            3,
            3,
            1,
            3
          ]
        }
      ],
      "enemyRules": {
        "whip": {
          "rollAtLeast": 5,
          "extraDamage": 1,
          "nextAttackPenalty": 1
        }
      },
      "encounterRules": {}
    },
    {
      "section": 272,
      "rows": [
        {
          "name": "Earth elemental",
          "attribute": "STR",
          "attributeValue": 5,
          "life": 30,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            4,
            4,
            4,
            4,
            4,
            4
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6PermanentChestArmorLoss": 1
      },
      "encounterRules": {}
    },
    {
      "section": 281,
      "rows": [
        {
          "name": "First charmed and trained guard dog",
          "attribute": "SK",
          "attributeValue": 5,
          "life": 24,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 5,
          "armorByLocation": [
            3,
            3,
            3,
            3,
            3,
            3
          ]
        },
        {
          "name": "Second charmed and trained guard dog",
          "attribute": "SK",
          "attributeValue": 6,
          "life": 27,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 6,
          "armorByLocation": [
            4,
            4,
            4,
            4,
            4,
            4
          ]
        },
        {
          "name": "Third charmed and trained guard dog",
          "attribute": "SK",
          "attributeValue": 7,
          "life": 35,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 7,
          "armorByLocation": [
            5,
            5,
            5,
            5,
            5,
            5
          ]
        },
        {
          "name": "Charmed and trained white wolf",
          "attribute": "SK",
          "attributeValue": 7,
          "life": 40,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 8,
          "armorByLocation": [
            5,
            5,
            5,
            5,
            5,
            5
          ]
        }
      ],
      "enemyRules": {
        "byIndex": {
          "0": {
            "rawDamage6Extra": 3
          },
          "1": {
            "rawDamage6Extra": 3
          },
          "2": {
            "rawDamage6Extra": 4
          },
          "3": {
            "rawDamage6Extra": 4,
            "rawDamage1Venom": 2
          }
        }
      },
      "encounterRules": {
        "noRestoreBetweenEnemies": true,
        "missionLifeCarry": true
      }
    },
    {
      "section": 282,
      "rows": [
        {
          "name": "Zodonte",
          "attribute": "SK",
          "attributeValue": 6,
          "life": 23,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            2,
            2,
            2,
            2,
            2,
            2
          ]
        }
      ],
      "enemyRules": {
        "appendages": {
          "count": 3,
          "life": 7,
          "roundEndDamageEach": 1,
          "armor": 0,
          "location": false
        },
        "precombatElixir": {
          "hitOn": [
            2,
            3,
            4,
            5,
            6
          ],
          "attributeValue": 5
        }
      },
      "encounterRules": {}
    },
    {
      "section": 288,
      "rows": [
        {
          "name": "Unknown aquatic creature",
          "attribute": "SK",
          "attributeValue": 3,
          "life": 23,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            2,
            2,
            2,
            2,
            2,
            2
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Extra": 2,
        "extraIgnoresArmor": true
      },
      "encounterRules": {
        "playerAttackPenalty": 1
      }
    },
    {
      "section": 289,
      "rows": [
        {
          "name": "High fire elemental",
          "attribute": "STR",
          "attributeValue": 7,
          "life": 90,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 8,
          "armorByLocation": [
            5,
            5,
            5,
            5,
            5,
            5
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6PermanentChestArmorLoss": 1
      },
      "encounterRules": {
        "missionLifeCarry": true,
        "restoreOnVictory": false
      }
    },
    {
      "section": 298,
      "rows": [
        {
          "name": "Deformed monstrosity",
          "attribute": "SK",
          "attributeValue": 2,
          "life": 22,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 0,
          "armorByLocation": [
            1,
            1,
            1,
            1,
            1,
            1
          ]
        }
      ],
      "enemyRules": {},
      "encounterRules": {}
    },
    {
      "section": 299,
      "rows": [
        {
          "name": "Monstrosity created by Krénator",
          "attribute": "STR",
          "attributeValue": 6,
          "life": 50,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 5,
          "armorByLocation": [
            4,
            4,
            4,
            4,
            4,
            4
          ]
        }
      ],
      "enemyRules": {
        "appendages": {
          "count": 3,
          "life": 9,
          "roundEndDamageEach": 1,
          "armor": 0,
          "location": false
        }
      },
      "encounterRules": {
        "missionLifeCarry": true,
        "restoreOnVictory": false
      }
    },
    {
      "section": 301,
      "rows": [
        {
          "name": "Expert warrior working for Bors of Raidyon",
          "attribute": "STR",
          "attributeValue": 4,
          "life": 32,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            3,
            4,
            4,
            4,
            3,
            3
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Extra": 3,
        "rawDamage6Bleed": 1
      },
      "encounterRules": {}
    },
    {
      "section": 306,
      "rows": [
        {
          "name": "Monstrosity created by Krénator",
          "attribute": "STR",
          "attributeValue": 7,
          "life": 55,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 7,
          "armorByLocation": [
            4,
            4,
            4,
            4,
            4,
            4
          ]
        }
      ],
      "enemyRules": {
        "appendages": {
          "count": 3,
          "life": 10,
          "roundEndDamageEach": 1,
          "armor": 0,
          "location": false
        }
      },
      "encounterRules": {
        "missionLifeCarry": true,
        "restoreOnVictory": false
      }
    },
    {
      "section": 315,
      "rows": [
        {
          "name": "First elite soldier",
          "attribute": "SK",
          "attributeValue": 5,
          "life": 29,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            2,
            4,
            4,
            4,
            2,
            3
          ]
        },
        {
          "name": "Second elite soldier",
          "attribute": "SK",
          "attributeValue": 6,
          "life": 33,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 5,
          "armorByLocation": [
            3,
            5,
            5,
            5,
            3,
            3
          ]
        },
        {
          "name": "Third elite soldier",
          "attribute": "SK",
          "attributeValue": 6,
          "life": 35,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 6,
          "armorByLocation": [
            3,
            5,
            5,
            5,
            3,
            3
          ]
        }
      ],
      "enemyRules": {
        "byIndex": {
          "0": {
            "rerollAll": [
              1
            ],
            "rawDamage6Bleed": 1
          },
          "1": {
            "rerollAll": [
              1
            ],
            "rawDamage6Bleed": 1
          },
          "2": {
            "rerollAll": [
              1,
              2
            ],
            "rawDamage6Bleed": 2
          }
        }
      },
      "encounterRules": {
        "noRestoreBetweenEnemies": true,
        "missionLifeCarry": true
      }
    },
    {
      "section": 319,
      "rows": [
        {
          "name": "Jealous enemy",
          "attribute": "STR",
          "attributeValue": 4,
          "life": 25,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            2,
            3,
            3,
            3,
            2,
            0
          ]
        }
      ],
      "enemyRules": {
        "rerollAll": [
          1
        ]
      },
      "encounterRules": {
        "playerArmor": false,
        "hunterArrow": false,
        "items": false
      }
    },
    {
      "section": 321,
      "rows": [
        {
          "name": "Marok-hai",
          "attribute": "SK",
          "attributeValue": 5,
          "life": 27,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            2,
            4,
            4,
            4,
            2,
            3
          ]
        }
      ],
      "enemyRules": {
        "rerollAll": [
          1
        ],
        "rawDamage6Bleed": 2
      },
      "encounterRules": {}
    },
    {
      "section": 324,
      "rows": [
        {
          "name": "Bors of Raidyén",
          "attribute": "STR",
          "attributeValue": 5,
          "life": 29,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            2,
            4,
            4,
            4,
            2,
            0
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6CumulativeAttackPenalty": 1
      },
      "encounterRules": {}
    },
    {
      "section": 325,
      "rows": [
        {
          "name": "First “winged beast of the caverns",
          "attribute": "SK",
          "attributeValue": 6,
          "life": 20,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            2,
            2,
            2,
            2,
            2,
            2
          ]
        },
        {
          "name": "Second winged beast of the caverns",
          "attribute": "SK",
          "attributeValue": 7,
          "life": 22,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            2,
            2,
            2,
            2,
            2,
            2
          ]
        },
        {
          "name": "Third winged beast of the caverns",
          "attribute": "SK",
          "attributeValue": 8,
          "life": 25,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            3,
            3,
            3,
            3,
            3,
            3
          ]
        },
        {
          "name": "Fourth winged beast of the caverns",
          "attribute": "SK",
          "attributeValue": 8,
          "life": 26,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 5,
          "armorByLocation": [
            3,
            3,
            3,
            3,
            3,
            3
          ]
        }
      ],
      "enemyRules": {
        "wonRawAttack6NextPenalty": 1,
        "byIndex": {
          "3": {
            "rawDamage6Bleed": 2
          }
        }
      },
      "encounterRules": {
        "curseStage": 4,
        "noRestoreBetweenEnemies": true,
        "restoreOriginalAt": 346,
        "playerHeadSpitOncePerEnemy": {
          "damageDice": 1,
          "headBonus": 3,
          "enemyAttackPenalty": 1
        }
      }
    },
    {
      "section": 331,
      "rows": [
        {
          "name": "Man-at-arms at Bors of Raidyén’s service",
          "attribute": "STR",
          "attributeValue": 5,
          "life": 28,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 5,
          "armorByLocation": [
            2,
            4,
            4,
            4,
            2,
            3
          ]
        }
      ],
      "enemyRules": {
        "blockPlayerRawDamage6": true
      },
      "encounterRules": {}
    },
    {
      "section": 333,
      "rows": [
        {
          "name": "Saber-toothed monstrosity",
          "attribute": "SK",
          "attributeValue": 5,
          "life": 30,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 5,
          "armorByLocation": [
            2,
            2,
            2,
            2,
            2,
            2
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Bleed": 3
      },
      "encounterRules": {}
    },
    {
      "section": 336,
      "rows": [
        {
          "name": "Azer",
          "attribute": "MAG",
          "attributeValue": 6,
          "life": 70,
          "power": 4,
          "damageDice": 1,
          "damageBonus": 6,
          "armorByLocation": [
            4,
            4,
            4,
            4,
            4,
            4
          ]
        }
      ],
      "enemyRules": {
        "dodgeOn": [
          6
        ],
        "headHitOngoing": 1,
        "invisibility": {
          "belowLife": 10,
          "onWonAttack": true,
          "powerCost": 4,
          "attacks": 2,
          "playerDodgeOn": [
            6
          ]
        }
      },
      "encounterRules": {
        "missionLifeCarry": true,
        "restoreOnVictory": false
      }
    },
    {
      "section": 340,
      "rows": [
        {
          "name": "Drunk enemy",
          "attribute": "SK",
          "attributeValue": 4,
          "life": 23,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            2,
            3,
            3,
            3,
            2,
            0
          ]
        }
      ],
      "enemyRules": {
        "rerollAll": [
          1,
          2
        ]
      },
      "encounterRules": {}
    },
    {
      "section": 341,
      "rows": [
        {
          "name": "Second amazon",
          "attribute": "SK",
          "attributeValue": 4,
          "life": 27,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            2,
            3,
            3,
            3,
            2,
            0
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Bleed": 1,
        "precombatEnemyArrow": {
          "hitOn": [
            3,
            4,
            5,
            6
          ],
          "damageDice": 1,
          "damageBonus": 1,
          "location": true,
          "armor": true,
          "retryOmitsArrow": true
        }
      },
      "encounterRules": {}
    },
    {
      "section": 345,
      "rows": [
        {
          "name": "Arachnid Monstrosity",
          "attribute": "SK",
          "attributeValue": 4,
          "life": 25,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 2,
          "armorByLocation": [
            0,
            0,
            0,
            0,
            0,
            0
          ]
        }
      ],
      "enemyRules": {
        "rawDamage1Venom": 4
      },
      "encounterRules": {}
    },
    {
      "section": 347,
      "rows": [
        {
          "name": "Hooded stranger",
          "attribute": "SK",
          "attributeValue": 5,
          "life": 30,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            2,
            4,
            4,
            4,
            2,
            0
          ]
        }
      ],
      "enemyRules": {
        "locationDice": 2,
        "chooseHighestLocation": true
      },
      "encounterRules": {}
    },
    {
      "section": 348,
      "rows": [
        {
          "name": "Dip",
          "attribute": "SK",
          "attributeValue": 5,
          "life": 27,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            4,
            4,
            4,
            4,
            4,
            4
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Bleed": 2,
        "headHitAttackPenalty": 1
      },
      "encounterRules": {}
    },
    {
      "section": 350,
      "rows": [
        {
          "name": "Giant sea snake",
          "attribute": "SK",
          "attributeValue": 6,
          "life": 34,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            4,
            4,
            4,
            4,
            4,
            4
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6InstantDefeat": 375
      },
      "encounterRules": {}
    },
    {
      "section": 352,
      "rows": [
        {
          "name": "Skilled warrior, follower of Krénator",
          "attribute": "STR",
          "attributeValue": 5,
          "life": 30,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            3,
            4,
            4,
            4,
            3,
            3
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Extra": 3,
        "rawDamage6Bleed": 1,
        "bleedExplicitlyNonstacking": true
      },
      "encounterRules": {}
    },
    {
      "section": 357,
      "rows": [
        {
          "name": "Dreknar sentinel, Servant of Neucen",
          "attribute": "STR",
          "attributeValue": 7,
          "life": 40,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 6,
          "armorByLocation": [
            0,
            0,
            0,
            0,
            0,
            0
          ]
        }
      ],
      "enemyRules": {
        "anyRaw6Heal": 2,
        "rawHead6AndDamage6InstantDefeat": 344
      },
      "encounterRules": {}
    },
    {
      "section": 359,
      "rows": [
        {
          "name": "First amazon",
          "attribute": "SK",
          "attributeValue": 4,
          "life": 25,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 3,
          "armorByLocation": [
            2,
            3,
            3,
            3,
            2,
            0
          ]
        }
      ],
      "enemyRules": {
        "rerollAll": [
          1
        ]
      },
      "encounterRules": {}
    },
    {
      "section": 360,
      "rows": [
        {
          "name": "Vrélek",
          "attribute": "STR",
          "attributeValue": 6,
          "life": 42,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 5,
          "armorByLocation": [
            5,
            5,
            5,
            5,
            5,
            5
          ]
        }
      ],
      "enemyRules": {
        "openingCharge": {
          "hitOn": [
            5,
            6
          ],
          "playerDodgeOn": [
            6
          ],
          "damageDice": 2,
          "damageBonus": 3,
          "ignoreLocationAndArmor": true
        }
      },
      "encounterRules": {}
    },
    {
      "section": 363,
      "rows": [
        {
          "name": "Hireling at Krénator’s service",
          "attribute": "SK",
          "attributeValue": 5,
          "life": 27,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            2,
            3,
            3,
            3,
            2,
            0
          ]
        }
      ],
      "enemyRules": {
        "rerollAll": [
          1,
          2
        ]
      },
      "encounterRules": {}
    },
    {
      "section": 371,
      "rows": [
        {
          "name": "Jailer, deformed monstrosity",
          "attribute": "SK",
          "attributeValue": 4,
          "life": 27,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 4,
          "armorByLocation": [
            3,
            3,
            3,
            3,
            3,
            3
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Bleed": 2,
        "limbHitNextAttackPenalty": {
          "locations": [
            1,
            5
          ],
          "penalty": 1
        }
      },
      "encounterRules": {}
    },
    {
      "section": 374,
      "rows": [
        {
          "name": "Giant reptile, unknown species",
          "attribute": "STR",
          "attributeValue": 6,
          "life": 34,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 5,
          "armorByLocation": [
            4,
            4,
            4,
            4,
            4,
            4
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6PermanentChestArmorLoss": 1,
        "playerDodgeOn": [
          5,
          6
        ],
        "minstrelDodgeOn": [
          4,
          5,
          6
        ]
      },
      "encounterRules": {}
    },
    {
      "section": 377,
      "rows": [
        {
          "name": "Dujmor, high-ranking officer",
          "attribute": "STR",
          "attributeValue": 5,
          "life": 38,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 6,
          "armorByLocation": [
            3,
            5,
            5,
            5,
            3,
            4
          ]
        }
      ],
      "enemyRules": {
        "anyRaw6Heal": 1,
        "rerollAll": [
          1
        ],
        "rage": {
          "belowLife": 20,
          "attributeValue": 6
        }
      },
      "encounterRules": {}
    },
    {
      "section": 393,
      "rows": [
        {
          "name": "Cave bear",
          "attribute": "STR",
          "attributeValue": 6,
          "life": 36,
          "power": 0,
          "damageDice": 1,
          "damageBonus": 5,
          "armorByLocation": [
            4,
            4,
            4,
            4,
            4,
            4
          ]
        }
      ],
      "enemyRules": {
        "rawDamage6Bleed": 3
      },
      "encounterRules": {}
    }
  ],
  "animals": [
    {
      "name": "Hurg",
      "attribute": "SK",
      "attributeValue": 1,
      "life": 18,
      "power": 0,
      "damageDice": 1,
      "damageBonus": -1,
      "armorByLocation": [
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "section": 56
    },
    {
      "name": "Grinkot",
      "attribute": "SK",
      "attributeValue": 1,
      "life": 20,
      "power": 0,
      "damageDice": 1,
      "damageBonus": 0,
      "armorByLocation": [
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "section": 56
    },
    {
      "name": "Scorpion",
      "attribute": "SK",
      "attributeValue": 1,
      "life": 12,
      "power": 0,
      "damageDice": 1,
      "damageBonus": -2,
      "armorByLocation": [
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "section": 129
    },
    {
      "name": "Tarantula",
      "attribute": "SK",
      "attributeValue": 1,
      "life": 12,
      "power": 0,
      "damageDice": 1,
      "damageBonus": -2,
      "armorByLocation": [
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "section": 129
    }
  ]
};

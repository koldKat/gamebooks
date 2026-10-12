// Printed encounter variants retain their own statistics and opening initiative.
export const WONDERLAND_ENCOUNTERS = [
  { section: 26, initiative: "player", inanimate: true, gardeners: true, enemies: [
    { name: "TWO OF SPADES", combat: 7, endurance: 7 },
    { name: "FIVE OF SPADES", combat: 7, endurance: 6 },
    { name: "SEVEN OF SPADES", combat: 6, endurance: 6 },
  ] },
  { section: 27, initiative: "player", inanimate: true, enemies: [
    { name: "GRANDFATHER CLOCK", combat: 8, endurance: 9 },
  ] },
  { section: 59, initiative: "enemy", enemies: [
    { name: "MOCK TURTLE", combat: 7, endurance: 7 },
  ] },
  { section: 72, initiative: "player", enemies: [
    { name: "VAMPIRESS", combat: 11, endurance: 12 },
  ] },
  { section: 78, initiative: "player", sequential: true, enemies: [
    { name: "First SPINEBACK", combat: 8, endurance: 7 },
    { name: "Second SPINEBACK", combat: 8, endurance: 7 },
  ] },
  { section: 87, initiative: "player", enemies: [
    { name: "SPINEBACK", combat: 8, endurance: 7 },
  ] },
  { section: 97, initiative: "enemy", inanimate: true, stages: [2,2], stageInitiatives: ["enemy","player"], enemies: [
    { name: "First SPINEBACK", combat: 8, endurance: 7 },
    { name: "Second SPINEBACK", combat: 8, endurance: 7 },
    { name: "First PLAYING CARD GUARD", combat: 7, endurance: 6 },
    { name: "Second PLAYING CARD GUARD", combat: 7, endurance: 6 },
  ] },
  { section: 126, initiative: "enemy", enemies: [
    { name: "First SNAP-DRAGON-FLY", combat: 7, endurance: 5 },
    { name: "Second SNAP-DRAGON-FLY", combat: 6, endurance: 5 },
  ] },
  { section: 137, initiative: "enemy", enemies: [
    { name: "BLACK SWINE", combat: 7, endurance: 7 },
  ] },
  { section: 150, initiative: "player", inanimate: true, enemies: [
    { name: "First TICK-TOCK MAN", combat: 7, endurance: 7 },
    { name: "Second TICK-TOCK MAN", combat: 6, endurance: 6 },
    { name: "Third TICK-TOCK MAN", combat: 6, endurance: 6 },
  ] },
  { section: 157, initiative: "enemy", enemies: [
    { name: "STONE SATYR", combat: 9, endurance: 10 },
  ] },
  { section: 171, initiative: "enemy", inanimate: true, enemies: [
    { name: "GRANDFATHER CLOCK", combat: 8, endurance: 9 },
  ] },
  { section: 182, initiative: "player", enemies: [
    { name: "CROCODILE", combat: 7, endurance: 8 },
  ] },
  { section: 190, initiative: "enemy", enemies: [
    { name: "BASILISK", combat: 9, endurance: 9 },
  ] },
  { section: 192, initiative: "enemy", enemies: [
    { name: "OGRE", combat: 10, endurance: 11 },
  ] },
  { section: 193, initiative: null, inanimate: true, enemies: [
    { name: "SIX OF CLUBS", combat: 8, endurance: 9 },
    { name: "SEVEN OF CLUBS", combat: 9, endurance: 8 },
  ] },
  { section: 195, initiative: "enemy", enemies: [
    { name: "ROCK LOBSTER", combat: 9, endurance: 9 },
  ] },
  { section: 199, initiative: "enemy", enemies: [
    { name: "JABBERWOCK", combat: 10, endurance: 12 },
  ] },
  { section: 201, initiative: "player", combatPenalty: 2, enemies: [
    { name: "SLUG", combat: 5, endurance: 6 },
  ] },
  { section: 207, initiative: "enemy", inanimate: true, enemies: [
    { name: "RAVEN WRITING-DESK", combat: 7, endurance: 8 },
  ] },
  { section: 209, initiative: "player", inanimate: true, enemies: [
    { name: "First TICK-TOCK MAN", combat: 7, endurance: 7 },
    { name: "Second TICK-TOCK MAN", combat: 7, endurance: 7 },
  ] },
  { section: 222, initiative: "enemy", combatPenalty: 1, enemies: [
    { name: "BLOODY-BONES", combat: 9, endurance: 8 },
  ] },
  { section: 234, initiative: null, enemies: [
    { name: "BAT", combat: 6, endurance: 5 },
  ] },
  { section: 263, initiative: "enemy", inanimate: true, enemies: [
    { name: "TICK-TOCK MAN", combat: 7, endurance: 7 },
  ] },
  { section: 265, initiative: null, enemies: [
    { name: "First BOROGOVE", combat: 7, endurance: 7 },
    { name: "Second BOROGOVE", combat: 7, endurance: 6 },
  ] },
  { section: 271, initiative: "player", inanimate: true, enemies: [
    { name: "TEA SERVICE", combat: 8, endurance: 7 },
  ] },
  { section: 278, initiative: "enemy", inanimate: true, enemies: [
    { name: "First TICK-TOCK MAN", combat: 7, endurance: 7 },
    { name: "Second TICK-TOCK MAN", combat: 7, endurance: 7 },
  ] },
  { section: 279, initiative: "enemy", enemies: [
    { name: "FROG FOOTMAN", combat: 8, endurance: 8 },
  ] },
  { section: 287, initiative: "player", ironScales: true, enemies: [
    { name: "JABBERWOCK", combat: 11, endurance: 18 },
  ] },
  { section: 292, initiative: "enemy", enemies: [
    { name: "RED KNIGHT", combat: 11, endurance: 12 },
  ] },
  { section: 308, initiative: "player", inanimate: true, enemies: [
    { name: "‘ROSE’", combat: 10, endurance: 10 },
  ] },
  { section: 325, initiative: "enemy", enemies: [
    { name: "BANDERSNATCH", combat: 11, endurance: 10 },
  ] },
  { section: 328, initiative: "player", ironScales: true, enemies: [
    { name: "JABBERWOCK", combat: 10, endurance: 15 },
  ] },
  { section: 358, initiative: "enemy", enemies: [
    { name: "TUMTUM TREE", combat: 8, endurance: 10 },
  ] },
  { section: 363, initiative: "player", ironScales: true, enemies: [
    { name: "JABBERWOCK", combat: 9, endurance: 12 },
  ] },
  { section: 372, initiative: "enemy", inanimate: true, enemies: [
    { name: "ABOMINABLE AUTOMATON", combat: 10, endurance: 10 },
  ] },
  { section: 375, initiative: "player", enemies: [
    { name: "FROG", combat: 7, endurance: 6 },
  ] },
  { section: 377, initiative: "enemy", enemies: [
    { name: "WALRUS", combat: 8, endurance: 8 },
  ] },
  { section: 382, initiative: "player", enemies: [
    { name: "SPIDER", combat: 7, endurance: 6 },
  ] },
  { section: 385, initiative: "player", enemies: [
    { name: "First FROG", combat: 7, endurance: 6 },
    { name: "Second FROG", combat: 6, endurance: 7 },
  ] },
  { section: 404, initiative: null, enemies: [
    { name: "First SNAP-DRAGON-FLY", combat: 7, endurance: 6 },
    { name: "Second SNAP-DRAGON-FLY", combat: 7, endurance: 6 },
  ] },
  { section: 418, initiative: "enemy", ironScales: true, enemies: [
    { name: "JABBERWOCK", combat: 12, endurance: 21 },
  ] },
  { section: 428, initiative: "enemy", inanimate: true, enemies: [
    { name: "UNICORN", combat: 8, endurance: 6 },
    { name: "LION", combat: 9, endurance: 7 },
    { name: "WYVERN", combat: 7, endurance: 6 },
  ] },
  { section: 449, initiative: "enemy", enemies: [
    { name: "First SLITHY TOVE", combat: 6, endurance: 6 },
    { name: "Second SLITHY TOVE", combat: 6, endurance: 5 },
  ] },
  { section: 451, initiative: "enemy", enemies: [
    { name: "JUBJUB BIRD", combat: 10, endurance: 12 },
  ] },
  { section: 471, initiative: "enemy", inanimate: true, enemies: [
    { name: "ACE OF CLUBS", combat: 9, endurance: 9 },
  ] },
  { section: 492, initiative: "player", inanimate: true, enemies: [
    { name: "PAPER TIGER", combat: 8, endurance: 8 },
  ] },
  { section: 496, initiative: "enemy", enemies: [
    { name: "RED QUEEN", combat: 11, endurance: 12 },
  ] },
  { section: 499, initiative: "player", sequential: true, enemies: [
    { name: "First SLITHY TOVE", combat: 6, endurance: 6 },
    { name: "Second SLITHY TOVE", combat: 6, endurance: 5 },
  ] },
  { section: 500, initiative: "enemy", enemies: [
    { name: "GORGON", combat: 12, endurance: 14 },
  ] },
  { section: 508, initiative: "enemy", enemies: [
    { name: "STAG BEETLE", combat: 7, endurance: 6 },
  ] },
  { section: 513, initiative: "player", ironScales: true, enemies: [
    { name: "JABBERWOCK", combat: 8, endurance: 9 },
  ] },
];

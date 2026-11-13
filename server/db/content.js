'use strict';

// Random flavor-string getters shared by feed and admin.

const { db } = require('./connection');

function getRandomTagline() {
  return db.prepare('SELECT text FROM taglines WHERE active = 1 AND length(text) <= 32 ORDER BY RANDOM() LIMIT 1').get()?.text
    || 'Map every path. Track every run.';
}

function getRandomLevelUpTemplate() {
  const row = db.prepare('SELECT template FROM level_up_templates WHERE active = 1 ORDER BY RANDOM() LIMIT 1').get();
  return row?.template || '{name} reached lvl {level} - {title}';
}

function getRandomJoinTemplate() {
  const row = db.prepare('SELECT template FROM join_templates WHERE active = 1 ORDER BY RANDOM() LIMIT 1').get();
  return row?.template || 'A new adventurer enters the fray - welcome, {name}.';
}

function getRandomNotFoundTemplate() {
  return db.prepare('SELECT template FROM not_found_templates WHERE active = 1 ORDER BY RANDOM() LIMIT 1').get()?.template
    || 'The compass spins once, sighs, and points back home.';
}

module.exports = { getRandomTagline, getRandomLevelUpTemplate, getRandomJoinTemplate, getRandomNotFoundTemplate };

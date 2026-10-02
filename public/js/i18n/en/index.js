// Core translations are synchronous; simulator tables are loaded on demand.
import account from './account.js';
import simulatorCommon from './battlesim/common.js';
import books from './books.js';
import common from './common.js';
import community from './community.js';
import covers from './covers.js';
import equipment from './equipment.js';
import mobile from './mobile.js';
import play from './play.js';
import progression from './progression.js';
import stats from './stats.js';

export default {
  ...account,
  ...simulatorCommon,
  ...books,
  ...common,
  ...community,
  ...covers,
  ...equipment,
  ...mobile,
  ...play,
  ...progression,
  ...stats,
};

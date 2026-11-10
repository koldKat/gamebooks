// English copy for the optional Captives of Kaag encounter tool.
import grandmaster from './battlesim333.js';
export default {
  ...Object.fromEntries(Object.entries(grandmaster).map(([key,value])=>[key.replace('battlesim333.','battlesim334.'),value])),
  'battlesim334.title':'The Captives of Kaag',
  'battlesim334.guardianKai':'Possess Kai-surge and hold Kai Grand Guardian rank',
};

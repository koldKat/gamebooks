export const COLORS = {
  current:        { background: '#f5a623', border: '#c47d00' },  // orange: where you are
  visitedRun:     { background: '#3d9be9', border: '#2980b9' },  // blue: visited this run
  death:          { background: '#e74c3c', border: '#c0392b' },  // solid red: confirmed death end
  victory:        { background: '#27ae60', border: '#1e8449' },  // solid green: confirmed victory end
  deathOutline:   { background: '#0f172a', border: '#e74c3c' },  // red outline: has death choice
  victoryOutline: { background: '#0f172a', border: '#27ae60' },  // green outline: has victory choice
  bothOutline:    { background: '#0f172a', border: '#f59e0b' },  // amber outline: has both
  battleOutline:  { background: '#431407', border: '#f97316' },  // dark orange bg + orange border: battle here
  battleDeath:    { background: '#c2410c', border: '#9a3412' },  // solid orange: battle death endpoint
  mapped:         { background: '#8e44ad', border: '#6c3483' },  // purple
  discovered:     { background: '#606060', border: '#404040' },  // grey
  start:          { background: '#fde047', border: '#a16207' },  // bright yellow: section 1 start node
};

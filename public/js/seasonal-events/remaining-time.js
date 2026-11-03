// Calculate activation and expiry countdowns at Europe/Sofia calendar boundaries.
import {seasonalDay} from './schedule.js';
function seasonalMidnight(day){
 if(!Number.isFinite(day))return null;
 let low=day-12*3600000,high=day+12*3600000;
 while(high-low>1){
  const middle=Math.floor((low+high)/2);
  if(seasonalDay(new Date(middle))<day)low=middle;else high=middle;
 }
 return high;
}
export function seasonalStartTime(event){
 return event.window?.start ? seasonalMidnight(Date.parse(event.window.start+'T00:00:00Z')) : null;
}
export function seasonalEndTime(event){
 return event.window?.end ? seasonalMidnight(Date.parse(event.window.end+'T00:00:00Z')+86400000) : null;
}
export function formatSeasonalRemaining(end,now){
 const milliseconds=Math.max(0,end-now);
 if(!milliseconds)return '0m';
 if(milliseconds<60000)return '<1m';
 const minutes=Math.ceil(milliseconds/60000),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60);
 return [days?days+'d':null,hours||days?hours+'h':null,minutes%60+'m'].filter(Boolean).join(' ');
}

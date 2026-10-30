// Calculate event time remaining through the final Europe/Sofia calendar day.
import {seasonalDay} from './schedule.js';
export function seasonalEndTime(event){
 const end=event.window?.end;
 if(!end)return null;
 const nextDay=Date.parse(end+'T00:00:00Z')+86400000;
 if(!Number.isFinite(nextDay))return null;
 let low=nextDay-12*3600000,high=nextDay+12*3600000;
 while(high-low>1){
  const middle=Math.floor((low+high)/2);
  if(seasonalDay(new Date(middle))<nextDay)low=middle;else high=middle;
 }
 return high;
}
export function formatSeasonalRemaining(end,now){
 const milliseconds=Math.max(0,end-now);
 if(!milliseconds)return '0m';
 if(milliseconds<60000)return '<1m';
 const minutes=Math.ceil(milliseconds/60000),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60);
 return [days?days+'d':null,hours||days?hours+'h':null,minutes%60+'m'].filter(Boolean).join(' ');
}

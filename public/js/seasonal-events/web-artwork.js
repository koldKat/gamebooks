// Two static corner webs using the same three-pixel grid and palette as the Halloween set.
import {halloweenDrawing as draw} from './halloween-pixels.js';
function web(name,spiderX,spiderY){return draw(name,4,({line,box})=>{
 const arc=r=>[[r,0],[Math.round(r*.94),Math.round(r*.32)],[Math.round(r*.78),Math.round(r*.62)],[Math.round(r*.62),Math.round(r*.78)],[Math.round(r*.32),Math.round(r*.94)],[0,r]];
 for(const[x,y]of [[15,0],[14,7],[7,14],[0,15]])line(0,0,x,y,'S');
 for(const radius of [7,14]){const points=arc(radius);for(let i=1;i<points.length;i++)line(...points[i-1],...points[i],'S');}
 box(spiderX,spiderY,2,3,'N');box(spiderX,spiderY,2,1,'R');
 for(const dy of [0,2]){line(spiderX,spiderY+dy,spiderX-1,spiderY+dy-1,'D');line(spiderX+1,spiderY+dy,spiderX+2,spiderY+dy-1,'D');}
 });}
export const halloweenWebs=[web('Corner web with spider',10,5),web('Corner web with small spider',5,10)];

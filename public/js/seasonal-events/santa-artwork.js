// Draw Father Christmas with the rounded, outlined style shared by the mouse companions.
export const santaCursorSvg=`
<path d="M11 18Q14 5 27 4c10-1 15 5 14 13l-6-1q1-7-6-7 4 4 4 10Z" fill="#c65440" stroke="#6e3025" stroke-width="1.5"/><path d="M14 16q5-9 12-9m5-1q7 1 8 7" fill="none" stroke="#ed9670" stroke-width="1.1" stroke-linecap="round"/><path d="M28 9q-1 4 3 8" fill="none" stroke="#993b2c" stroke-width="1.1"/>
<circle cx="40" cy="17" r="4" fill="#ede5d3" stroke="#9d9687" stroke-width="1.2"/>
<path d="M11 23q-5 13 4 19l9 4 9-4q9-6 4-19Z" fill="#e4dfcf" stroke="#99958a" stroke-width="1.5"/>
<path d="M12 20q12-7 24 0v10q-1 9-12 9T12 30Z" fill="#dca88e" stroke="#9e725f" stroke-width="1.3"/>
<path d="M11 19q13-4 26 0" fill="none" stroke="#efe8d9" stroke-width="6" stroke-linecap="round"/>
<g class="seasonal-santa__eyes"><path d="M14 26q4-5 8 0-4 4-8 0m12 0q4-5 8 0-4 4-8 0" fill="#fffdf7" stroke="#775341" stroke-width=".9"/><g class="seasonal-santa__pupils" fill="#343239"><ellipse cx="18" cy="26" rx="1.6" ry="2.4"/><ellipse cx="30" cy="26" rx="1.6" ry="2.4"/></g></g>
<path d="M14 21q4-2 7 0m6 0q4-2 7 0" fill="none" stroke="#eee5d4" stroke-width="2" stroke-linecap="round"/>
<ellipse class="seasonal-santa__mouth" cx="24" cy="36" rx="3" ry="1.5" fill="#7e4149"/>
<path d="M24 32q-8-3-11 3 6 4 11-1 5 5 11 1-3-6-11-3" fill="#f1e9d9" stroke="#c5bdac" stroke-width=".8"/>
<ellipse cx="24" cy="31" rx="3.4" ry="2.5" fill="#d08e7b"/>
<path d="M17 39q7 7 14 0m-18-6q-2 6 4 9m18-9q2 6-4 9m-8 0 1 2 2-1" fill="none" stroke="#bcb29a" stroke-width=".9" stroke-linecap="round"/><path d="M12 18q12-4 23 0" fill="none" stroke="#fff0d1" stroke-width="1" stroke-linecap="round"/><path d="m16 32 3 1m10 0 3-1" stroke="#bc7c69" stroke-width=".8"/>
<g class="seasonal-santa__ho" font-family="sans-serif" font-weight="bold" font-size="8" fill="#efd6a0" stroke="#40353a" stroke-width=".6" paint-order="stroke">${Array.from({length:9},(_,i)=>`<text x="${[10,20,16][i%3]}" y="${[18,14,20][i%3]}" style="--ho-delay:${i*.18}s;--ho-x:${[-30,25,6][i%3]}px;--ho-y:${[-22,-24,-40][i%3]}px">Ho!</text>`).join('')}</g>
<g transform="translate(28 20) scale(.45)"><g class="seasonal-santa__bell"><path d="M20 8q4-7 8 0l3 5q6 4 6 17l4 7H7l4-7q0-13 6-17Z" fill="#c6a05f" stroke="#735b3b" stroke-width="2"/><path d="M14 32q10 4 20 0M18 16q-4 6-4 12" fill="none" stroke="#ead39a" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="40" r="3" fill="#8e704a"/></g></g>
<g transform="translate(8 28) scale(.5)"><g class="seasonal-santa__gift"><rect x="7" y="16" width="34" height="25" rx="3" fill="#ae6264" stroke="#70434c" stroke-width="2"/><rect x="5" y="13" width="38" height="9" rx="2" fill="#c87874" stroke="#70434c" stroke-width="2"/><path d="M24 13q-19-2-12-9 7-4 12 9 5-13 12-9 7 7-12 9v28" fill="none" stroke="#e1c18b" stroke-width="5" stroke-linejoin="round"/></g></g>`;

// Build shared themed Fatemaster form controls and validate optional manual dice.
export function field(document, holder, label, input) {
  const row=document.createElement('label'),text=document.createElement('span');
  row.className='inv-edit-row';text.textContent=label;input.className='inv-edit-input';
  row.append(text,input);holder.appendChild(row);return input;
}
export function number(document,holder,label,value,min=0,max=10000) {
  const input=document.createElement('input');input.type='number';input.min=min;input.max=max;input.step=1;input.value=value;
  return field(document,holder,label,input);
}
export function select(document,holder,label,options,value) {
  const input=document.createElement('select');
  for(const item of options){const option=document.createElement('option');option.value=item.value??item;option.textContent=item.label??item;input.appendChild(option);}
  if(value!==undefined)input.value=String(value);return field(document,holder,label,input);
}
export function checkbox(document,holder,label,checked=false) {
  const row=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
  row.className='bsim-checkbox';input.type='checkbox';input.checked=Boolean(checked);text.textContent=label;
  row.append(input,text);holder.appendChild(row);return input;
}
export function button(document,holder,label,action,id) {
  const input=document.createElement('button');input.type='button';input.className='bsim-action-btn';input.textContent=label;
  if(id)input.id=id;input.addEventListener('click',action);holder.appendChild(input);return input;
}
export function text(document,holder,value,tag='p') {
  const node=document.createElement(tag);node.textContent=value;holder.appendChild(node);return node;
}
export function numeric(input) {
  const value=Number(input.value);
  if(input.value.trim()===''||!Number.isSafeInteger(value)||value<Number(input.min)||value>Number(input.max))throw Error('Check '+input.closest('label').querySelector('span').textContent);
  return value;
}
export function dice(input,count) {
  if(input.value.trim()==='')return ()=>Math.floor(Math.random()*6)+1;
  const value=numeric(input);if(value<count||value>6*count)throw Error('Invalid dice total');return {total:value};
}

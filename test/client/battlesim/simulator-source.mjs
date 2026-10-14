// Reconstruct declarations for existing isolated VM rule tests after extraction.
import { readFileSync as read } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
export * from 'node:fs';

let parser;
export function simulatorFunctions(source, selected, excluded=[]) {
  if(!parser){const context={exports:{},module:{}};vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'],context);parser=context.exports;}
  return parser.parse(source,{ecmaVersion:'latest',sourceType:'module'}).body
    .map(node=>node.declaration||node).filter(node=>node.type==='FunctionDeclaration'&&
      (!selected||selected.includes(node.id.name))&&!excluded.includes(node.id.name))
    .map(node=>source.slice(node.start,node.end)).join('\n');
}

export function readFileSync(file, options) {
  const filename=file instanceof URL?fileURLToPath(file):String(file);
  const bytes=read(file,options);
  if(!/[/\\]battlesim\d+\.js$/.test(filename))return bytes;
  const entry=String(bytes),match=entry.match(/export \* from '\.\/books\/(\d+)\/panel\.js'/);
  if(!match)return bytes;
  const directory=path.join(path.dirname(filename),'books',match[1]);
  let panel=read(path.join(directory,'panel.js'),'utf8');
  const modules=[...panel.matchAll(/import \{ [^\n]+ \} from '\.\/(state|combat|effects)\.js';\n/g)].map(m=>m[1]);
  panel=panel.replace(/^import \{ [^\n]+ \} from '\.\/(?:definition|state|combat|effects)\.js';\n/gm,'')
    .replace(/\/\/ BEGIN SIMULATOR WIRING[\s\S]*?\/\/ END SIMULATOR WIRING\n/,'')
    .replace(/\nexport \{ [^\n]+ as init, [^\n]+ as render, [^\n]+ as setVisible \};\n$/,'');
  const definition=read(path.join(directory,'definition.js'),'utf8');
  const constants=definition.slice(definition.indexOf('\n});')+5).replace(/^export /gm,'');
  const functions=modules.map(name=>read(path.join(directory,name+'.js'),'utf8')
    .split('// BEGIN EXTRACTED RULES\n')[1].split('// END EXTRACTED RULES')[0]
    .replace(/^  const \{ [^\n]+ \} = getContext\(\);(?: \/\/ Simulator dependencies\.)?\n/gm,'')).join('\n');
  const result=constants+'\n'+functions+'\n'+panel;
  return options?result:Buffer.from(result);
}

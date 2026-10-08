import { spawn } from 'node:child_process';
export function command(program, args, input, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {stdio:['pipe','pipe','pipe'],env:{...process.env,...environment}});
    const chunks=[]; let size=0,diagnostic='';
    const timer=setTimeout(()=>child.kill('SIGKILL'),120000);
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>64000000)child.kill('SIGKILL');else chunks.push(chunk);});
    child.stderr.on('data',chunk=>{if(diagnostic.length<64000)diagnostic+=chunk;});
    child.stdin.on('error',()=>{});
    child.once('error',()=>{clearTimeout(timer);reject(new Error('command_unavailable'));});
    child.once('close',code=>{clearTimeout(timer);if(code===0)resolve(Buffer.concat(chunks).toString());else {const error=new Error('command_failed');error.code=diagnostic.match(/ERROR:\s+([A-Z0-9]{5})\b/)?.[1];error.sqlLine=diagnostic.match(/psql:<stdin>:(\d+):/)?.[1];reject(error);}});
    child.stdin.end(input);
  });
}
export const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export const sql=(container,database,input)=>command('docker',['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],input);
export const normalizeDump=value=>value.replace(/^\\(?:un)?restrict .*\n/gm,'').replace(/^-- Dumped (?:from database|by pg_dump) version .*\n/gm,'');

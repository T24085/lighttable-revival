'use strict';
const fs=require('fs'),path=require('path');
const string={type:'string'},integer={type:'integer'},boolean={type:'boolean'};
const definition=(name,description,properties={},required=[])=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
const definitions=[
 definition('list_files','List a directory. Skips generated folders; returns paths for targeted reads.',{path:string,depth:integer}),
 definition('search_files','Search text in a directory, returning matching lines and paths.',{query:string,path:string},['query']),
 definition('read_file','Read current unsaved editor content when open, otherwise disk. Read before editing. For truncated results continue with next_read; start_column is a zero-based character offset on start_line.',{path:string,start_line:integer,end_line:integer,start_column:integer},['path']),
 definition('write_file','Create or replace a text file and save it. Existing files must have been read; stale edits are rejected.',{path:string,content:string,expected_sha256:string},['path','content']),
 definition('edit_file','Replace one exact text occurrence and save. Read the file first.',{path:string,old_text:string,new_text:string,expected_sha256:string},['path','old_text','new_text']),
 definition('rename_file','Rename a previously read file without overwriting another file.',{path:string,new_path:string},['path','new_path']),
 definition('delete_file','Delete a previously read file. Its prior state is journaled.',{path:string},['path']),
 definition('create_directory','Create directories, including missing parent directories.',{path:string},['path']),
 definition('create_project','Create an empty project at a new absolute or relative directory and open it in Light Table.',{path:string},['path']),
 definition('open_file','Open a file in the original editor.',{path:string},['path']),
 definition('run_command','Run a PowerShell command with Windows user permissions. Use background=true for development servers. Return actual output and exit status. Write application source with file tools so changes are tracked.',{command:string,cwd:string,background:boolean,purpose:{type:'string',enum:['command','setup','build','test','server']}},['command']),
 definition('command_status','Inspect a command or background server, including output and exit status.',{id:string},['id']),
 definition('stop_command','Stop an assistant-owned command and its child processes.',{id:string},['id']),
 definition('start_preview','Show a captured HTML/JS file or a running assistant background server beside the code. For a server supply its job_id and printed loopback URL.',{path:string,job_id:string,url:string}),
 definition('inspect_preview','Read the running preview URL, DOM text, console and errors.'),
 definition('capture_preview','Capture actual preview pixels for a vision-capable model.'),
 definition('ask_user','Pause when information is required. Ask a concise question in the chat.',{question:string},['question'])
];
function validate(call){const name=call?.function?.name,definition=definitions.find(item=>item.function.name===name);if(!definition)throw Error('Unknown assistant tool: '+name);const args=call.function.arguments;if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Invalid tool arguments');const schema=definition.function.parameters;for(const required of schema.required)if(args[required]===undefined)throw Error('Missing '+required);for(const [key,value]of Object.entries(args)){const type=schema.properties[key];if(!type||typeof value!==(type.type==='integer'?'number':type.type)||type.type==='integer'&&!Number.isInteger(value)||type.enum&&!type.enum.includes(value))throw Error('Invalid '+key);}return {name,args};}
const ignored=new Set(['node_modules','.git','.revival','__pycache__','.venv','venv','dist','build']);
function walk(dir,depth=2,maximum=500){const found=[];function visit(root,remaining){for(const entry of fs.readdirSync(root,{withFileTypes:true})){if(ignored.has(entry.name)||entry.isSymbolicLink())continue;const file=path.join(root,entry.name);if(found.length>=maximum)return;if(entry.isFile())found.push(file);else if(entry.isDirectory()&&remaining>0)visit(file,remaining-1);}}visit(dir,depth);return found;}
function create({files,commands,editor,preview,createProject,notify}){
 async function execute(call,run){const {name,args}=validate(call),session=run.session,resolve=input=>files.resolve(input,session.root),options={signal:run.abort.signal,runId:run.id,expectedHash:args.expected_sha256};if(run.abort.signal.aborted)throw Error('Assistant stopped');
  switch(name){
   case 'list_files':{const root=resolve(args.path||'.'),depth=Math.max(0,Math.min(8,args.depth??2)),found=walk(root,depth);return {root,files:found.map(file=>path.relative(root,file)),truncated:found.length===500};}
   case 'search_files':{const root=resolve(args.path||'.'),found=[],buffers=new Map(((await editor('context',{}))?.buffers||[]).map(b=>[b.path.toLowerCase(),b.source]));for(const file of walk(root,8,10000)){if(run.abort.signal.aborted)throw Error('Assistant stopped');if(fs.statSync(file).size>1024*1024)continue;const content=buffers.get(file.toLowerCase())??fs.readFileSync(file,'utf8');if(content.includes('\0'))continue;const lines=content.split(/\r\n?|\n/);for(let i=0;i<lines.length;i++)if(lines[i].includes(args.query)){found.push({path:file,line:i+1,text:lines[i].slice(0,500)});if(found.length>=100)return {matches:found,truncated:true};}}return {matches:found};}
   case 'read_file':{
    const file=resolve(args.path),state=await files.read(file);if(state.source===null)throw Error('File does not exist');
    const lines=state.source.split(/\r\n?|\n/),from=(args.start_line??1)-1,to=Math.min(lines.length,args.end_line??from+400),column=args.start_column??0;
    if(from<0||from>=lines.length||to<=from||column<0||column>lines[from].length)throw Error('Invalid file range');
    const source=lines.slice(from,to).join('\n').slice(column),content=source.slice(0,run.readLimit||65536),parts=content.split('\n'),end=from+parts.length-1,endColumn=parts.at(-1).length+(parts.length===1?column:0);
    const next=content.length<source.length?(endColumn===lines[end].length?{path:file,start_line:end+2}:{path:file,start_line:end+1,start_column:endColumn}):to<lines.length?{path:file,start_line:to+1}:null;
    return {path:file,sha256:state.hash,disk_sha256:state.disk.hash,unsaved:!!state.buffer&&state.buffer.source.replace(/\r\n?/g,'\n')!==(state.buffer.savedContent||'').replace(/\r\n?/g,'\n'),start_line:from+1,start_column:column,end_line:end+1,end_column:endColumn,total_lines:lines.length,content,truncated:!!next,...(next?{next_read:next}:{})};
   }
   case 'write_file':return files.change(session,resolve(args.path),args.content,options);
   case 'edit_file':{const file=resolve(args.path),previous=files.observed.get(file.toLowerCase());if(!previous?.source)throw Error('Read the file first');const ending=previous.buffer?'\n':previous.source.includes('\r\n')?'\r\n':'\n',normalize=text=>text.replace(/\r\n?|\n/g,ending),oldText=normalize(args.old_text),newText=normalize(args.new_text);if(!oldText||previous.source.split(oldText).length!==2)throw Error('old_text must match exactly once');return files.change(session,file,previous.source.replace(oldText,newText),options);}
   case 'rename_file':return files.rename(session,resolve(args.path),resolve(args.new_path),run.id);
   case 'delete_file':return files.remove(session,resolve(args.path),run.id);
   case 'create_directory':{const folder=resolve(args.path),existed=fs.existsSync(folder);fs.mkdirSync(folder,{recursive:true});return {path:folder,changed:!existed};}
   case 'create_project':{const project=await createProject(resolve(args.path));session.root=project.path;await editor('project',{project});return {path:project.path,name:project.name,empty:true};}
   case 'open_file':return editor('open',{path:resolve(args.path)});
   case 'run_command':return commands.start(run.owner,{...args,cwd:resolve(args.cwd||'.')},run.abort.signal);
   case 'command_status':{const value=commands.status(args.id,run.owner);if(!value)throw Error('Unknown assistant-owned command');return value;}
   case 'stop_command':return {stopped:await commands.stop(run.owner,args.id)};
   case 'start_preview':return preview.start(run,{...args,path:args.path?resolve(args.path):undefined});
   case 'inspect_preview':return preview.inspect(run);
   case 'capture_preview':return preview.capture(run);
   case 'ask_user':run.pauseReason=args.question;notify({type:'question',text:args.question});return {waiting:true,question:args.question};
   default:throw Error('Unsupported tool');
  }
 }
 return {definitions,validate,execute};
}
module.exports={create,definitions,validate};

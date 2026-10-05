/*jshint esversion: 6 */
"use strict";

const {
    app,
    BrowserWindow,
    ipcMain
} = require('electron');
const browserPreview=require('./revival-preview.cjs');


let yargs = require('yargs');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the javascript object is GCed.
const proofPolicy=require('./proof-policy.cjs');
// Restore only previously chosen project folders before original workspace startup.
require('./revival-projects.cjs');
app.setPath('userData',require('path').join(proofPolicy.root,process.env.LT_REVIVAL_TEST==='1'?'test-browser-data':'proof-browser-data'));
ipcMain.on('proof-operation',(event,op,args)=>{
 try {
   const trusted=new URL(event.senderFrame.url);if(trusted.protocol!=='file:'||decodeURIComponent(trusted.pathname).replace(/^\//,'').replace(/\//g,'\\').toLowerCase()!==require('path').join(__dirname,'LightTable.html').toLowerCase()||event.senderFrame!==event.sender.mainFrame)throw Error('Untrusted bridge caller');
   if(!Array.isArray(args)||args.length>8)throw Error('Invalid bridge arguments');
   if(op==='info'){const window=BrowserWindow.fromWebContents(event.sender);if(!window||windows[window.id]!==window)throw Error('Unknown editor window');event.returnValue={value:{...proofPolicy.operation(op,args),windowId:window.id}};return;}
   if(op==='open-targets-take'){
     if(args.length)throw Error('Open targets take accepts no arguments');
     const window=BrowserWindow.fromWebContents(event.sender);if(!window||windows[window.id]!==window)throw Error('Unknown editor window');
     const targets=openTargets.take(event.sender.id);
     for(const target of targets)if(target.kind==='directory'&&!target.add){try{const project=require('./revival-projects.cjs').activate(target.path);target.project={path:project.path,name:project.name,entry:null};}catch(error){target.kind='error';target.message=String(error.message).slice(0,1024);}}
     if(targets.length){if(window.isMinimized())window.restore();window.show();window.focus();}
     event.returnValue={value:targets};return;
   }
   if(op==='fingerprints'){event.returnValue={value:proofPolicy.fingerprints(args[0])};return;}
   if(op==='window') {const w=BrowserWindow.fromWebContents(event.sender);const [action,params]=args;switch(action){case 'size':event.returnValue={value:w.getSize()};return;case 'position':event.returnValue={value:w.getPosition()};return;case 'fullscreen':event.returnValue={value:w.isFullScreen()};return;case 'focus':w.focus();break;case 'minimize':w.minimize();break;case 'maximize':w.maximize();break;case 'set-fullscreen':w.setFullScreen(!!params);break;case 'close':setImmediate(()=>w.close());break;case 'destroy':setImmediate(()=>w.destroy());break;default:throw Error('Window action unavailable');}event.returnValue={value:null};return;}
   if(['dialog-open','dialog-save','menu','clipboard-read','clipboard-write','project-info','project-parent','project-create','project-open','project-reopen','project-file','node-info'].includes(op)){event.returnValue={value:require('./revival-desktop.cjs').operation(event,op,args)};return;}
   event.returnValue={value:proofPolicy.operation(op,args)};
 } catch(e){event.returnValue={error:e.message};}
});
var windows = {};
global.browserOpenFiles = []; // Track files for open-file event
function targetOwner(){const focused=BrowserWindow.getFocusedWindow();if(focused&&windows[focused.id]===focused&&!focused.isDestroyed())return focused.webContents.id;const window=Object.values(windows).find(value=>value&&!value.isDestroyed());return window?.webContents.id??null;}
const openTargets=require('./revival-open-targets.cjs').create({policy:proofPolicy,preferredOwner:targetOwner,notify:owner=>{const window=Object.values(windows).find(value=>value&&!value.isDestroyed()&&value.webContents.id===owner);if(window&&!window.webContents.isDestroyed())window.webContents.send('revival-open-targets-available');}});
const initializedWindows=new WeakSet();

var packageJSON = require(__dirname + '/package.json');

// Returns Window object
function createWindow() {
    let browserWindowOptions = {...packageJSON.browserWindowOptions};
    browserWindowOptions.icon = require('path').resolve(__dirname,browserWindowOptions.icon);
    browserWindowOptions.webPreferences={nodeIntegration:false,contextIsolation:true,sandbox:true,enableRemoteModule:false,preload:__dirname+'/proof-preload.cjs',backgroundThrottling:process.env.LT_REVIVAL_TEST!=='1'};
    let window = new BrowserWindow(browserWindowOptions);
    window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    window.webContents.session.setPermissionCheckHandler(()=>false);
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('data:')}));
    windows[window.id] = window;
    const editorOwner=window.webContents.id;
    openTargets.register(editorOwner);
    window.focus();
    window.webContents.on("will-navigate", function(e) {
        e.preventDefault();
        window.webContents.send("app", "will-navigate");
    });

    if (process.platform == 'win32') {
        window.on("blur", function() {
            if (window.webContents)
                window.webContents.send("app", "blur");
        });
        window.on("focus", function() {
            if (window.webContents)
                window.webContents.send("app", "focus");
        });
    } else {
        window.on("blur", function() {
            window.webContents.send("app", "blur");
        });
        window.on("focus", function() {
            window.webContents.send("app", "focus");
        });
    }
    window.on("devtools-opened", function() {
        window.webContents.send("devtools", "disconnect");
    });
    window.on("devtools-closed", function() {
        window.webContents.send("devtools", "reconnect!");
    });

    // and load the index.html of the app.
    window.loadURL('file://' + __dirname + '/LightTable.html?id=' + window.id);

    // Notify LT that the user requested to close the window/app
    window.on("close", function(evt) {
        window.webContents.send("app", "close!");
        evt.preventDefault();
    });

    // Emitted when the window is closed.
    window.on('closed', function() {
        delete windows[window.id];
        openTargets.closed(editorOwner);
    });

    return window;
}

function onReady() {
    ipcMain.on("createWindow", function(event) {
        const window=BrowserWindow.fromWebContents(event.sender);
        if(proofSender(event)&&window&&windows[window.id]===window)createWindow();
    });

    ipcMain.on("initWindow", function(event) {
        const window=BrowserWindow.fromWebContents(event.sender);
        if(!proofSender(event)||!window||windows[window.id]!==window||initializedWindows.has(window))return;
        initializedWindows.add(window);
        // Bind the original initialization to its trusted sender rather than a
        // caller-provided or hardcoded window id.
        if(window.isFocused())window.webContents.send("app", "focus");
    });

    ipcMain.on("toggleDevTools", function(event, windowId) {
        if (windowId && windows[windowId]) {
            windows[windowId].toggleDevTools();
        }
    });

    createWindow();
}

function parseArgs() {
    yargs.usage("\nLight Table " + app.getVersion() + "\n" +
        // TODO: Use a consistent name for executables or vary executable
        // name per platform. $0 currently gives an unwieldy name
        "Usage: light [options] [path ...]\n\n" +
        "Paths are either a file or a directory.\n" +
        "Files can take a line number e.g. file:line.");
    yargs.alias('h', 'help').boolean('h').describe('h', 'Print help');
    yargs.alias('a', 'add').boolean('a').describe('a', 'Add path(s) to workspace');
    global.browserParsedArgs = yargs.parse(process.argv);

    if (global.browserParsedArgs.help) {
        yargs.showHelp();
        process.exit(0);
    }
    openTargets.seedLaunch(process.argv,{defaultApp:process.defaultApp===true,cwd:process.cwd()});
}

function start() {
    // Revival proof: do not open a remote debugging listener.


    // This method will be called when electron has done everything
    // initialization and ready for creating browser windows.
    app.on('ready', onReady);

    // Quit when all windows are closed.
    app.on('window-all-closed', function() {
        app.quit();
    });

    // Explicit OS targets remain queued until their original editor is ready.
    app.on('open-file', function(event, path) {
        event.preventDefault();
        openTargets.fileManager(path);
    });
    parseArgs();
}

// Set $IPC_DEBUG to debug incoming and outgoing ipcMain messages for the main process
if (process.env["IPC_DEBUG"]) {
    let oldOn = ipcMain.on;
    ipcMain.on = function(channel, cb) {
        oldOn.call(ipcMain, channel, function() {
            console.log("\t\t\t\t\t->MAIN", channel, Array.prototype.slice.call(arguments).join(', '));
            cb.apply(null, arguments);
        });
    };
    let logSend = function(window) {
        let oldSend = window.webContents.send;
        window.webContents.send = function() {
            console.log("\t\t\t\t\tMAIN->", Array.prototype.slice.call(arguments).join(', '));
            oldSend.apply(window.webContents, arguments);
        };
    };
    let oldCreateWindow = createWindow;
    createWindow = function() {
        logSend(oldCreateWindow());
    };
}

start();

// Asynchronous language execution has its own disposable sandboxed renderer.
const proofJS=require('./proof-js.cjs');
const localNode=require('./revival-node.cjs');
const projectNpm=require('./revival-npm.cjs');
function proofSender(event){return event.senderFrame===event.sender.mainFrame&&event.senderFrame.url.startsWith(require('url').pathToFileURL(require('path').join(__dirname,'LightTable.html')).href+'?');}
const watchedEvaluationOwners=new WeakSet();
const executionVersions=new Map();
const npmOwnerVersions=new Map();
const languages=require('./revival-languages.cjs');
function watchOwner(event){if(!proofSender(event))throw Error('Untrusted execution caller');const owner=event.sender.id;if(!watchedEvaluationOwners.has(event.sender)){watchedEvaluationOwners.add(event.sender);event.sender.once('destroyed',()=>{executionVersions.delete(owner);npmOwnerVersions.delete(owner);languages.forget(owner).catch(()=>{});localNode.cancel(owner);proofJS.cancel(owner);browserPreview.stop(owner).catch(()=>{});projectNpm.stop(owner).catch(()=>{});});}return owner;}
function version(event){const owner=watchOwner(event),revision=(executionVersions.get(owner)||0)+1;executionVersions.set(owner,revision);return {owner,revision};}
function current(job){if(executionVersions.get(job.owner)!==job.revision)throw Error('Execution cancelled');}
async function executeNode(event,options,job){const prepared=localNode.prepare(options);await Promise.all([proofJS.cancel(job.owner),localNode.cancel(job.owner)]);current(job);await require('./revival-desktop.cjs').authorizeNode(event,prepared.root);current(job);return localNode.run(job.owner,options,output=>{if(!event.sender.isDestroyed()&&executionVersions.get(job.owner)===job.revision)event.sender.send('local-node-output',output);});}
ipcMain.handle('proof-javascript',async(event,source,options)=>{const job=version(event);try{if(options?.runtime==='node')return await executeNode(event,{...options,source},job);await localNode.cancel(job.owner);current(job);return await proofJS.run(job.owner,source,options);}catch(error){if(error.location||options?.runtime==='node')return {failed:true,error:{message:error.message,location:error.location,logs:error.logs}};throw error;}});
ipcMain.handle('local-node-run',async(event,options)=>{const job=version(event);try{return await executeNode(event,options,job);}catch(error){return {failed:true,error:{message:error.message,location:error.location,logs:error.logs}};}});
ipcMain.on('proof-javascript-cancel',event=>{if(proofSender(event)){version(event);languages.stop(event.sender.id).catch(()=>{});localNode.cancel(event.sender.id);proofJS.cancel(event.sender.id);browserPreview.stop(event.sender.id).catch(()=>{});npmOwnerVersions.set(event.sender.id,(npmOwnerVersions.get(event.sender.id)||0)+1);projectNpm.stop(event.sender.id).catch(()=>{});}});
async function previewCall(event,action){if(!proofSender(event))throw Error('Untrusted browser preview caller');try{return await action();}catch(error){return {failed:true,error:{message:error.message,location:error.location}};}}
ipcMain.handle('language-info',event=>previewCall(event,()=>languages.info()));
ipcMain.handle('language-status',event=>previewCall(event,()=>languages.status(event.sender.id)));
ipcMain.handle('language-connect',(event,options)=>previewCall(event,async()=>{const job=version(event),prepared=languages.prepare(options);await require('./revival-desktop.cjs').authorizeLanguage(event,prepared.root,prepared.language,prepared);current(job);return languages.connect(job.owner,options);}));
ipcMain.handle('language-run',async(event,options)=>{const job=version(event);try{options=languages.runOptions(job.owner,options);const prepared=languages.prepare(options);await Promise.all([proofJS.cancel(job.owner),localNode.cancel(job.owner)]);current(job);await require('./revival-desktop.cjs').authorizeLanguage(event,prepared.root,prepared.language,prepared);current(job);return await languages.run(job.owner,options);}catch(error){return {failed:true,error:{message:error.message,location:error.location,logs:error.logs}};}});
ipcMain.handle('language-kernel-file',event=>previewCall(event,()=>{const {dialog,BrowserWindow}=require('electron');const chosen=dialog.showOpenDialogSync(BrowserWindow.fromWebContents(event.sender),{title:'Choose IPython / Jupyter kernel connection file',properties:['openFile'],filters:[{name:'Kernel connection JSON',extensions:['json']}]});return chosen?.[0]?require('./proof-policy.cjs').grantFile(chosen[0]):null;}));
ipcMain.handle('language-stop',(event,options)=>previewCall(event,()=>languages.stop(watchOwner(event),options?.language)));
ipcMain.handle('browser-preview-start',(event,options)=>previewCall(event,()=>{const owner=watchOwner(event);return browserPreview.start(owner,options,BrowserWindow.fromWebContents(event.sender),message=>{if(!event.sender.isDestroyed())event.sender.send('browser-preview-event',message);});}));
ipcMain.handle('browser-preview-evaluate',(event,source,options)=>previewCall(event,()=>browserPreview.evaluate(event.sender.id,source,options)));
ipcMain.handle('browser-preview-watches',(event,files,requestId)=>previewCall(event,()=>browserPreview.updateWatches(event.sender.id,files,requestId)));
ipcMain.handle('browser-preview-status',event=>previewCall(event,()=>browserPreview.status(event.sender.id)));
ipcMain.handle('browser-preview-stop',event=>previewCall(event,()=>browserPreview.stop(event.sender.id)));
ipcMain.on('browser-preview-bounds',(event,value)=>{if(proofSender(event))try{const window=BrowserWindow.fromWebContents(event.sender),[width,height]=window.getContentSize();if(value?.x+value?.width<=width+1&&value?.y+value?.height<=height+1)browserPreview.bounds(event.sender.id,value);}catch(_){} });
ipcMain.handle('project-npm-start',(event,options)=>previewCall(event,async()=>{const owner=watchOwner(event),revision=(npmOwnerVersions.get(owner)||0)+1;npmOwnerVersions.set(owner,revision);const prepared=projectNpm.prepare(options);await require('./revival-desktop.cjs').authorizeNode(event,prepared.root);if(npmOwnerVersions.get(owner)!==revision)throw Error('npm operation cancelled before project trust completed.');return projectNpm.start(owner,{...options,expectedRoot:prepared.root},message=>{if(!event.sender.isDestroyed()&&npmOwnerVersions.get(owner)===revision)event.sender.send('project-npm-event',message);});}));
ipcMain.handle('project-npm-status',event=>previewCall(event,()=>projectNpm.status(event.sender.id)));
ipcMain.handle('project-npm-wait',(event,id)=>previewCall(event,()=>projectNpm.wait(event.sender.id,id)));
ipcMain.handle('project-npm-stop',event=>previewCall(event,()=>{npmOwnerVersions.set(event.sender.id,(npmOwnerVersions.get(event.sender.id)||0)+1);return projectNpm.stop(event.sender.id);}));
const assistant=require('./revival-assistant-ipc.cjs').install({ipcMain,BrowserWindow,app,dialog:require('electron').dialog,proofSender,preview:browserPreview});
module.exports.assistant=assistant;
let evaluationShutdown=false;
app.on('before-quit',event=>{
    if(evaluationShutdown)return;
    event.preventDefault();evaluationShutdown=true;
    assistant.shutdown().then(()=>languages.shutdown()).then(()=>browserPreview.shutdown()).then(()=>projectNpm.shutdown()).then(()=>localNode.shutdown()).then(()=>proofJS.shutdown()).finally(()=>app.quit());
});

import { createServer, type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createThusoIQ, EngineError, PROTOCOL_VERSION, type Actor, type Command, type ThusoIQPort } from './index.ts';
import { sandboxState } from './fixtures.ts';

/** Loopback development harness, not a production clinical API. No database or real identity. */
export function createSandboxServer() {
 const sessions = new Map<string, { port: ThusoIQPort; actor: Actor; touched: number }>();
 const actors: Record<string, Actor> = { nurse:{id:'N-205',role:'nurse',verified:true},doctor:{id:'D-401',role:'doctor',verified:true},pharmacist:{id:'P-501',role:'pharmacist',verified:true} };
 async function body(req: IncomingMessage) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 64_000) throw new EngineError('invalid','Request exceeds the sandbox size limit.'); }
  try { return JSON.parse(text || '{}') as Record<string, unknown>; } catch { throw new EngineError('invalid','Invalid JSON.'); }
 }
 return createServer(async(req,res) => {
  res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-ThusoIQ-Mode','sandbox');
  const send = (status:number,data:unknown) => { res.writeHead(status);res.end(JSON.stringify(data)); };
  try {
   // Reject browser cross-origin requests. Native clients send no Origin.
   if (req.headers.origin) { send(403,{error:'Cross-origin browser access is not enabled.'});return; }
   if (req.method === 'GET' && req.url === '/health') { send(200,{mode:'sandbox',protocol:PROTOCOL_VERSION,engines:['appointments','consultations','diagnosis-review','dispensary','wearables']});return; }
   const requestedRole=String(req.headers['x-mythuso-demo-role']??'');
   const actor=actors[requestedRole];
   if (!actor) { send(403,{error:'Choose a supported fictional clinical role.'});return; }
   for (const [id,session] of sessions) if(Date.now()-session.touched>30*60_000)sessions.delete(id);
   if (req.method==='POST'&&req.url==='/v1/sessions') {
    if(sessions.size>=32){send(429,{error:'Sandbox session limit reached.'});return;}
    const id=randomUUID(); const session={port:null as unknown as ThusoIQPort,actor,touched:Date.now()};
    session.port=createThusoIQ(sandboxState(),()=>session.actor);sessions.set(id,session);
    send(201,{sessionId:id,protocol:PROTOCOL_VERSION,state:session.port.snapshot()});return;
   }
   const match=req.url?.match(/^\/v1\/sessions\/([a-f0-9-]+)\/(snapshot|commands)$/);
   const session=match&&sessions.get(match[1]);
   if(!match||!session){send(404,{error:'Sandbox session expired. Reconnect to start a new session.'});return;}
   session.actor=actor;session.touched=Date.now();
   if(req.method==='GET'&&match[2]==='snapshot'){send(200,{protocol:PROTOCOL_VERSION,state:session.port.snapshot()});return;}
   if(req.method==='POST'&&match[2]==='commands'){
    const input=await body(req);
    if(!input.command||typeof input.command!=='object')throw new EngineError('invalid','A command is required.');
    // Each request owns its actor, including across awaits and simultaneous role requests.
    session.actor=actor;
    const result=session.port.execute(input.command as Command,{expectedRevision:Number(input.expectedRevision),idempotencyKey:String(input.idempotencyKey??'')});
    send(200,{protocol:PROTOCOL_VERSION,...result});return;
   }
   send(405,{error:'Method not supported.'});
  } catch(error) {
   const status=error instanceof EngineError?(error.code==='forbidden'?403:error.code==='conflict'?409:error.code==='not-found'?404:422):400;
   send(status,{error:error instanceof EngineError?error.message:'The command could not be read.',code:error instanceof EngineError?error.code:'invalid'});
  }
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const port=Number(process.env.THUSOIQ_PORT??8790);
 createSandboxServer().listen(port,'127.0.0.1',()=>process.stdout.write(`ThusoIQ fictional sandbox on http://127.0.0.1:${port}\n`));
}

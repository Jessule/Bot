const {chromium}=require('playwright');const {spawn}=require('child_process');
(async()=>{
 const [file,out,shots]=process.argv.slice(2);
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:540,height:960},deviceScaleFactor:2});
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file://'+file+'?rec');
 await p.waitForFunction(()=>window.__race);await p.waitForTimeout(300);
 const FPS=30;
 const ff=spawn('ffmpeg',['-y','-loglevel','error','-f','image2pipe','-framerate',String(FPS),'-i','-','-c:v','libx264','-pix_fmt','yuv420p','-preset','medium','-crf','19','-movflags','+faststart',out]);
 const stage=p.locator('#stage');let n=0,tail=-1;
 while(true){
  await p.evaluate(dt=>window.__race.tick(dt),1/FPS);
  const buf=await stage.screenshot({type:'jpeg',quality:92});
  if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));
  if(shots&&[150,600,n].includes(n)&&false){}
  n++;
  if(tail<0&&await p.evaluate(()=>window.__race.allDone()))tail=FPS*2.5;
  if(tail>=0&&--tail<=0)break;
  if(n>FPS*120)break;
  if(shots&&(n===300||n===tail))await stage.screenshot({path:shots+'/f'+n+'.png'});
 }
 ff.stdin.end();await new Promise(r=>ff.on('close',r));
 console.log('frames',n,'errors',errs);await b.close();})();

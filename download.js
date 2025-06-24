const {createWriteStream,unlinkSync,existsSync}=require("fs"),{fetch}=require("undici"),
      express=require("express"),cors=require("cors"),{exec}=require("child_process"),
      ffmpegPath=require("ffmpeg-static"),{v4:uuid}=require("uuid"),app=express();

app.use(cors({origin:"https://youtube2-mp3-tool.vercel.app",methods:["POST"],allowedHeaders:["Content-Type"]}));
app.use(express.json());

const AGENTS=[
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
  "Mozilla/5.0 (Linux; Android 10; SM-G973F)..."
],
rndUA=_=>AGENTS[Math.floor(Math.random()*AGENTS.length)],
clean=t=>t.replace(/[\\/:*?"<>|]+/g,"_").slice(0,200),
dl=(u,d)=>new Promise((r,j)=>fetch(u,{timeout:20000})
  .then(rsp=>{if(rsp.status!==200)throw"DL failed";rsp.body.pipe(createWriteStream(d)).on("finish",r).on("error",j)})
  .catch(j)
);

function extractJSON(html){
  const key="ytInitialPlayerResponse",i=html.indexOf(key);
  if(i<0) return null;
  let start=html.indexOf("{",i),depth=0;
  for(let j=start;j<html.length;j++){
    if(html[j]==="{") depth++;
    else if(html[j]==="}"){ depth--; if(depth===0) return html.slice(start,j+1); }
  }
  return null;
}

app.post("/api/download",async(req,res)=>{
  let ta,tm,tt;
  try{
    const{url}=req.body;
    if(!url||!url.includes("youtube.com")) return res.status(400).json({error:"Invalid YouTube URL"});
    const vid=new URL(url).searchParams.get("v");
    if(!vid) return res.status(400).json({error:"Missing video ID"});

    const html=await fetch(url,{headers:{"user-agent":rndUA(),"accept-language":"en-US,en;q=0.9"},timeout:15000})
      .then(r=>r.text());
    const jsStr=extractJSON(html);
    if(!jsStr) throw "Parse error";
    const info=JSON.parse(jsStr),
          aud=info.streamingData?.adaptiveFormats.find(f=>f.mimeType.includes("audio"))?.url;
    if(!aud) throw "No audio found";

    const title=clean(info.videoDetails?.title||vid);
    ta=`${uuid()}.webm`; tm=`${uuid()}.mp3`;

    await dl(aud,ta);

    for(const u of[`https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`,`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`]){
      tt=`${uuid()}.jpg`;
      try{ await dl(u,tt); if(existsSync(tt)) break; } catch{ tt=null; }
    }

    // Build FFmpeg command
    let cmd=`"${ffmpegPath}" -i "${ta}"`;
    if(tt){
      cmd += ` -i "${tt}" -map 0:a -map 1 -c:v mjpeg -metadata:s:v title="Cover" -metadata:s:v comment="Cover (front)" -disposition:v attached_pic`;
    }
    cmd += ` -metadata title="${title}" -b:a 192k "${tm}"`;

    await new Promise((r,j)=>exec(cmd,(e)=>e?j(e):r()));

    res.download(tm,`${title}.mp3`,err=>{
      [ta,tm,tt].forEach(f=>f&&existsSync(f)&&unlinkSync(f));
    });

  }catch(e){
    console.error("ERROR:",e);
    if(!res.headersSent) res.status(500).json({error:e.toString()});
    [ta,tm,tt].forEach(f=>f&&existsSync(f)&&unlinkSync(f));
  }
});

app.listen(process.env.PORT||8080,()=>console.log("✅ Server up"));

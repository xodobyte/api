const express = require("express");
const cors = require("cors");
const { exec } = require("youtube-dl-exec");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();

// CORS configuration
app.use(cors({
  origin: "https://youtube2-mp3-tool.vercel.app", // your frontend origin
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

// Helper to sanitize filenames
const sanitize = title => title.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 200);

app.post("/api/download", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  try {
    // 1. Fetch metadata JSON for title & thumbnail
    const info = await exec(url, {
      dumpSingleJson: true,
      noWarnings: true,
      cookies: "cookies.txt"
    });

    const title = sanitize(info.title || 'audio');
    const thumbnailUrl = info.thumbnail;

    console.log(`▶️ Processing "${title}"`);

    // 2. Set headers to name file after video title
    res.setHeader("Content-Disposition", `attachment; filename="${title}.mp3"`);
    res.setHeader("Content-Type", "audio/mpeg");

    // 3. Spawn yt-dlp to stream best audio
    const ytdlProcess = exec(url, {
      format: "bestaudio",
      output: "-",
      cookies: "cookies.txt"
    });

    // 4. Stream through FFmpeg to embed cover and metadata
    ffmpeg()
      .input(ytdlProcess.stdout)
      .input(thumbnailUrl)
      .audioBitrate(128)
      .format("mp3")
      .outputOptions(
        // map audio and image inputs
        '-map', '0:a',
        '-map', '1',
        // set ID3 metadata
        '-metadata', `title=${title}`,
        // embed cover art
        '-disposition:v:0', 'attached_pic'
      )
      .on("error", err => {
        console.error("❌ FFmpeg error:", err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to convert audio" });
        }
      })
      .pipe(res, { end: true });

  } catch (err) {
    console.error("Download failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process audio" });
    }
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

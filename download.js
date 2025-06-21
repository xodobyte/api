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

app.post("/api/download", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  try {
    console.log("▶️ Downloading from:", url);

    // Spawn yt-dlp process with Netscape-formatted cookies.txt
    const ytdlProcess = exec(url, {
      format: "bestaudio",
      output: "-",
      cookies: "cookies.txt" // must be Netscape format
    });

    // Set headers for MP3 download
    res.setHeader("Content-Disposition", 'attachment; filename="audio.mp3"');
    res.setHeader("Content-Type", "audio/mpeg");

    // Stream yt-dlp output through ffmpeg
    ffmpeg(ytdlProcess.stdout)
      .audioBitrate(128)
      .format("mp3")
      .on("error", (err) => {
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

const express = require("express");
const cors = require("cors");
const { exec } = require("youtube-dl-exec");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { v4: uuidv4 } = require("uuid");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();

app.use(cors({
  origin: "https://youtube2-mp3-tool.vercel.app",
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

const sanitize = title => title.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 200);

// Download image helper
const downloadImage = (url, dest) => new Promise((resolve, reject) => {
  const file = fs.createWriteStream(dest);
  https.get(url, response => {
    response.pipe(file);
    file.on("finish", () => file.close(() => resolve(dest)));
  }).on("error", err => {
    fs.unlink(dest, () => reject(err));
  });
});

app.post("/api/download", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string")
    return res.status(400).json({ error: "Invalid YouTube URL" });

  let tempAudioPath;
  let thumbnailPath;

  try {
    // Fetch metadata
    const info = await exec(url, {
      dumpSingleJson: true,
      noWarnings: true,
      cookies: "cookies.txt"
    });
    const title = sanitize(info.title || "audio");
    const thumbnailUrl = info.thumbnail;

    // Prepare temp files
    const id = uuidv4();
    tempAudioPath = path.join(__dirname, `${id}.mp3`);
    if (thumbnailUrl) {
      thumbnailPath = path.join(__dirname, `${id}.jpg`);
      try {
        await downloadImage(thumbnailUrl, thumbnailPath);
      } catch (err) {
        console.error("Thumbnail download failed:", err.message);
        thumbnailPath = null;
      }
    }

    // Spawn yt-dlp for audio stream
    const ytdlProcess = exec(url, {
      format: "bestaudio",
      output: "-",
      cookies: "cookies.txt"
    });

    // Build ffmpeg command
    let command = ffmpeg()
      .input(ytdlProcess.stdout)
      .audioBitrate(128)
      .toFormat("mp3")
      .outputOptions("-metadata", `title=${title}`, "-id3v2_version", "3");

    if (thumbnailPath) {
      command = command
        .input(thumbnailPath)
        .outputOptions(
          "-map", "0:a",
          "-map", "1:v",
          "-c:v", "mjpeg",
          "-metadata:s:v", "title=Album cover",
          "-metadata:s:v", "comment=Cover (front)",
          "-disposition:v", "attached_pic"
        );
    }

    // Run conversion to temp file
    command.save(tempAudioPath)
      .on("error", err => {
        console.error("FFmpeg error:", err.message);
        res.status(500).json({ error: "Conversion failed" });
      })
      .on("end", () => {
        // Send file with proper filename
        res.download(tempAudioPath, `${title}.mp3`, err => {
          // Cleanup
          fs.unlink(tempAudioPath, () => {});
          if (thumbnailPath) fs.unlink(thumbnailPath, () => {});
          if (err) console.error("Download error:", err.message);
        });
      });

  } catch (err) {
    console.error("Download failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to process audio" });
    // Cleanup on error
    if (tempAudioPath && fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
    if (thumbnailPath && fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

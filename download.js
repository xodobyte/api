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

// Helper to download image to disk
const downloadImage = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on("finish", () => {
        file.close(() => resolve(dest));
      });
    }).on("error", (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
};

app.post("/api/download", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  try {
    const info = await exec(url, {
      dumpSingleJson: true,
      noWarnings: true,
      cookies: "cookies.txt"
    });

    const title = sanitize(info.title || 'audio');
    const thumbnailUrl = info.thumbnail;

    console.log(`▶️ Processing "${title}"`);

    // Set headers before piping
    res.setHeader("Content-Disposition", `attachment; filename="${title}.mp3"`);
    res.setHeader("Content-Type", "audio/mpeg");

    const ytdlProcess = exec(url, {
      format: "bestaudio",
      output: "-",
      cookies: "cookies.txt"
    });

    let thumbnailPath;
    if (thumbnailUrl) {
      const tmpName = uuidv4() + ".jpg";
      thumbnailPath = path.join(__dirname, tmpName);
      await downloadImage(thumbnailUrl, thumbnailPath);
    }

    const ffmpegCommand = ffmpeg()
      .input(ytdlProcess.stdout)
      .audioBitrate(128)
      .format("mp3");

    // Add thumbnail and metadata if available
    if (thumbnailPath) {
      ffmpegCommand
        .input(thumbnailPath)
        .outputOptions(
          "-map", "0:a",
          "-map", "1",
          "-metadata", `title=${title}`,
          "-disposition:v:0", "attached_pic",
          "-id3v2_version", "3"
        );
    } else {
      ffmpegCommand.outputOptions(
        "-metadata", `title=${title}`,
        "-id3v2_version", "3"
      );
    }

    ffmpegCommand
      .on("error", (err) => {
        console.error("❌ FFmpeg error:", err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to convert audio" });
        }
      })
      .on("end", () => {
        if (thumbnailPath && fs.existsSync(thumbnailPath)) {
          fs.unlink(thumbnailPath, () => {});
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

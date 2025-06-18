const express = require("express");
const cors = require("cors");
const { exec } = require("youtube-dl-exec");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { PassThrough } = require("stream");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/download", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  try {
    const passthrough = new PassThrough();

    const ytdlProcess = exec(url, {
      format: "bestaudio",
      stdout: "pipe",
      output: "-",
    });

    res.setHeader("Content-Disposition", 'attachment; filename="audio.mp3"');
    res.setHeader("Content-Type", "audio/mpeg");

    ffmpeg(ytdlProcess.stdout)
      .audioBitrate(128)
      .format("mp3")
      .on("error", (ffmpegErr) => {
        console.error("FFmpeg error:", ffmpegErr);
        if (!res.headersSent)
          res.status(500).json({ error: "Failed to convert audio" });
      })
      .pipe(passthrough);

    passthrough.pipe(res);
  } catch (err) {
    console.error("Download failed:", err);
    if (!res.headersSent)
      res.status(500).json({ error: "Failed to process audio" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

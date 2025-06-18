const express = require("express");
const cors = require("cors");
const { exec } = require("youtube-dl-exec");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { PassThrough } = require("stream");
const fs = require("fs");
const cookies = fs.readFileSync("cookies.txt", "utf-8");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(
  cors({
    origin: "*", // or "*" for all origins
    methods: ["POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

app.post("/api/download", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  try {
    const passthrough = new PassThrough();

    console.log("▶️ Downloading from:", url);

    const ytdlProcess = exec(url, {
      format: "bestaudio",
      output: "-", // output to stdout
      cookies: cookies.txt,
    });

    app.options("*", (req, res) => {
      res.setHeader(
        "Access-Control-Allow-Origin",
        "https://youtube2-mp3-tool.vercel.app"
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.sendStatus(200);
    });

    res.setHeader("Content-Disposition", 'attachment; filename="audio.mp3"');
    res.setHeader("Content-Type", "audio/mpeg");

    ffmpeg(ytdlProcess.stdout)
      .audioBitrate(128)
      .format("mp3")
      .on("error", (err) => {
        console.error("❌ FFmpeg error:", err.message);
        if (!res.headersSent)
          res.status(500).json({ error: "Failed to convert audio" });
      })
      .pipe(res);

    passthrough.pipe(res);
  } catch (err) {
    console.error("Download failed:", err);
    if (!res.headersSent)
      res.status(500).json({ error: "Failed to process audio" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

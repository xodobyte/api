const express = require("express");
const cors = require("cors");
const { fetch } = require("undici");

const app = express();

app.use(cors({
  origin: "https://youtube2-mp3-tool.vercel.app", // Adjust to your actual frontend
  methods: ["POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

// Sanitize for safe filenames
const sanitize = str => str.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim();

app.post("/api/download", async (req, res) => {
  let { url } = req.body;

  if (!url?.trim()) {
    return res.status(400).json({ error: "Missing query or YouTube URL" });
  }

  // Normalize input
  url = url.replace(/\n/g, " ").trim();
  if (/^https?:\/\/(youtu\.be|www\.youtube\.com)\//.test(url)) {
    const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
    if (match) {
      url = `https://www.youtube.com/watch?v=${match[1]}`;
    }
  }

  try {
    const apiUrl = `https://coderx-api.onrender.com/v1/downloaders/coderx/download/ytmp3v2?query=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!data.success || !data.result?.download?.audio) {
      return res.status(500).json({ error: "Failed to fetch audio from external API" });
    }

    const audioUrl = data.result.download.audio;
    const title = sanitize(data.result.title || "audio");

    // Optional metadata return (instead of direct stream)
    // res.json({ title, download: audioUrl, thumbnail: data.result.thumbnail });

    // Direct download stream
    const audioRes = await fetch(audioUrl);
    const contentType = audioRes.headers.get("content-type");

    if (!contentType || !contentType.includes("audio")) {
      return res.status(500).json({ error: "Invalid audio stream format" });
    }

    res.setHeader("Content-Disposition", `attachment; filename="${title}.mp3"`);
    res.setHeader("Content-Type", "audio/mpeg");

    audioRes.body.pipe(res);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: "Server error. Try again later." });
  }
});

app.listen(process.env.PORT || 8080, () => {
  console.log("✅ API server running with query and URL support");
});

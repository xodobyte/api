const express = require("express");
const cors = require("cors");
const { fetch } = require("undici");
const app = express();

app.use(cors({
  origin: "https://youtube2-mp3-tool.vercel.app",
  methods: ["POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

app.post("/api/download", async (req, res) => {
  const { url } = req.body;

  if (!url || !url.includes("youtube.com")) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  try {
    const apiUrl = `https://coderx-api.onrender.com/v1/downloaders/coderx/download/ytmp3v2?query=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!data.success || !data.result?.download?.audio) {
      return res.status(500).json({ error: "Failed to fetch audio from external API" });
    }

    const downloadUrl = data.result.download.audio;
    const title = data.result.title || "audio";

    res.setHeader("Content-Disposition", `attachment; filename="${title}.mp3"`);
    res.setHeader("Content-Type", "audio/mpeg");

    const stream = await fetch(downloadUrl);
    stream.body.pipe(res);
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ error: "Server error. Try again later." });
  }
});

app.listen(process.env.PORT || 8080, () => {
  console.log("✅ Server running using external API");
});

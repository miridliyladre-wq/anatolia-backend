require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const vision = require('@google-cloud/vision');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Google Vision Client - dosya adını kontrol et
const client = new vision.ImageAnnotatorClient({
  keyFilename: './serious-house-493511-v6-8b41013c59a7.json' // 👈 Gerekiyorsa kendi dosya adınla değiştir
});

async function getWikipediaInfo(title, lang = 'tr') {
  try {
    const response = await axios.get(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    return {
      title: response.data.title,
      extract: response.data.extract,
      thumbnail: response.data.thumbnail?.source || null,
      pageUrl: response.data.content_urls?.desktop?.page || null
    };
  } catch (error) {
    if (lang === 'tr') return getWikipediaInfo(title, 'en');
    return null;
  }
}

app.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Görüntü dosyası gerekli' });
    const imageBuffer = req.file.buffer;

    const [result] = await client.annotateImage({
      image: { content: imageBuffer },
      features: [
        { type: 'LABEL_DETECTION', maxResults: 5 },
        { type: 'LANDMARK_DETECTION', maxResults: 3 },
        { type: 'TEXT_DETECTION' }
      ]
    });

    let detectedName = null;
    if (result.landmarkAnnotations?.length) detectedName = result.landmarkAnnotations[0].description;
    else if (result.labelAnnotations?.length) detectedName = result.labelAnnotations[0].description;

    if (!detectedName) return res.status(404).json({ error: 'Tanınabilir nesne bulunamadı' });

    console.log(`🔍 Tanımlanan: ${detectedName}`);
    const wikiData = await getWikipediaInfo(detectedName, 'tr');

    res.json({
      detectedName,
      confidence: result.landmarkAnnotations?.[0]?.score || result.labelAnnotations?.[0]?.score || 0,
      wikipedia: wikiData,
      ocrText: result.textAnnotations?.[0]?.description || null
    });
  } catch (error) {
    console.error('Hata:', error);
    res.status(500).json({ error: 'Sunucu hatası: ' + error.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'OK' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend ${PORT} portunda çalışıyor`));
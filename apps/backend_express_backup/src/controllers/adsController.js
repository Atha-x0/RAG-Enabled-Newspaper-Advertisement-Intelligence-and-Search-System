const { NewspaperPage, Advertisement, VisualUnderstanding, sequelize } = require('../models');
const { uploadFile } = require('../services/minio');
const { publishIngestionJob } = require('../services/rabbitmq');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Helper to forward search/QA requests to the FastAPI Python service
async function forwardToMLService(endpoint, method, payload) {
  return new Promise((resolve, reject) => {
    const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
    const parsedUrl = new URL(endpoint, mlUrl);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          resolve({ error: 'Invalid JSON from ML service', raw: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('Connection to ML service failed:', err.message);
      reject(err);
    });

    if (payload) {
      req.write(JSON.stringify(payload));
    }
    req.end();
  });
}

// 1. Upload Page Ingestion
async function uploadPage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { publication_date, language } = req.body;
    if (!publication_date || !language) {
      return res.status(400).json({ error: 'publication_date and language are required' });
    }

    const filename = `${Date.now()}_${req.file.originalname}`;
    
    // Upload file to MinIO
    const fileUrl = await uploadFile(filename, req.file.path);
    
    // Save to PostgreSQL
    const page = await NewspaperPage.create({
      filename: req.file.originalname,
      file_path: fileUrl,
      publication_date: publication_date,
      language: language,
      total_ads_detected: 0
    });

    // Publish to RabbitMQ Ingestion Queue
    const jobPayload = {
      page_id: page.id,
      file_path: fileUrl,
      language: language,
      publication_date: publication_date
    };
    
    await publishIngestionJob(jobPayload);

    // Remove local multer file copy
    fs.unlinkSync(req.file.path);

    res.status(202).json({
      message: 'Newspaper page uploaded and queued for intelligence analysis',
      page_id: page.id,
      filename: page.filename,
      file_url: fileUrl,
      status: 'QUEUED'
    });
  } catch (error) {
    console.error('Upload page failure:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Internal server error in ingestion pipeline' });
  }
}

// 2. Search Ads (Keyword, Semantic, Hybrid, Category, etc.)
async function searchAds(req, res) {
  try {
    const { q, type = 'hybrid', category, location, limit = 10 } = req.query;

    if (!q && !category && !location) {
      return res.status(400).json({ error: 'Query parameter q, category, or location filter is required' });
    }

    // Direct metadata filtering in PostgreSQL if query is purely structured filters
    if (!q) {
      const whereClause = {};
      if (category) whereClause.category = category;
      if (location) whereClause.location = { [Op.iLike]: `%${location}%` };

      const dbResults = await Advertisement.findAll({
        where: whereClause,
        limit: parseInt(limit),
        include: [{ model: NewspaperPage, as: 'page' }, { model: VisualUnderstanding, as: 'visual' }]
      });

      return res.json({
        type: 'database_filter',
        results: dbResults.map(ad => ({
          ad_id: ad.id,
          score: 1.0,
          title: ad.title || 'Untitled Advertisement',
          category: ad.category,
          location: ad.location,
          raw_text: ad.raw_text,
          image_url: ad.image_path,
          bbox: [ad.bbox_x1, ad.bbox_y1, ad.bbox_x2, ad.bbox_y2],
          publication_date: ad.page ? ad.page.publication_date : null,
          language: ad.page ? ad.page.language : null,
          visual_caption: ad.visual ? ad.visual.caption : ''
        }))
      });
    }

    // Call ML service search endpoint for semantic or hybrid search matching
    const qStr = encodeURIComponent(q);
    const categoryFilter = category ? `&category=${encodeURIComponent(category)}` : '';
    const locationFilter = location ? `&location=${encodeURIComponent(location)}` : '';
    
    const mlResponse = await forwardToMLService(
      `/api/v1/search?q=${qStr}&type=${type}&limit=${limit}${categoryFilter}${locationFilter}`,
      'GET'
    );

    if (mlResponse.error) {
      return res.status(502).json({ error: 'ML Service Integration Failure', details: mlResponse.error });
    }

    // Enrich Qdrant Vector results with full DB records
    const enrichedResults = [];
    for (const match of mlResponse.results || []) {
      const ad = await Advertisement.findByPk(match.ad_id, {
        include: [{ model: NewspaperPage, as: 'page' }, { model: VisualUnderstanding, as: 'visual' }]
      });
      if (ad) {
        enrichedResults.push({
          ad_id: ad.id,
          score: match.score,
          title: ad.title || match.payload?.title || 'Untitled Advertisement',
          category: ad.category,
          location: ad.location,
          raw_text: ad.raw_text,
          image_url: ad.image_path,
          bbox: [ad.bbox_x1, ad.bbox_y1, ad.bbox_x2, ad.bbox_y2],
          publication_date: ad.page ? ad.page.publication_date : null,
          language: ad.page ? ad.page.language : null,
          visual_caption: ad.visual ? ad.visual.caption : '',
          objects: ad.visual ? ad.visual.detected_objects : []
        });
      }
    }

    res.json({
      type: type,
      query: q,
      results: enrichedResults
    });
  } catch (error) {
    console.error('Search ads error:', error.message);
    res.status(500).json({ error: 'Search gateway processing failure' });
  }
}

// 3. Ask RAG Engine QA
async function askRAG(req, res) {
  try {
    const { question, filters } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const mlResponse = await forwardToMLService('/api/v1/rag/ask', 'POST', { question, filters });
    
    if (mlResponse.error) {
      return res.status(502).json({ error: 'ML Service RAG Failure', details: mlResponse.error });
    }

    res.json(mlResponse);
  } catch (error) {
    console.error('RAG QA failure:', error.message);
    res.status(500).json({ error: 'RAG query engine connectivity error' });
  }
}

// 4. Analytics Dashboard Endpoint
async function getAnalytics(req, res) {
  try {
    // A. Categories Distribution
    const categoryCounts = await Advertisement.findAll({
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['category'],
      order: [[sequelize.literal('count'), 'DESC']]
    });

    // B. Ingestion Timeline (Group by Date)
    const pageCounts = await NewspaperPage.findAll({
      attributes: [
        'publication_date',
        [sequelize.fn('COUNT', sequelize.col('id')), 'pages'],
        [sequelize.fn('SUM', sequelize.col('total_ads_detected')), 'ads']
      ],
      group: ['publication_date'],
      order: [['publication_date', 'ASC']],
      limit: 30
    });

    // C. Top Advertised Companies/Brands
    const companyCounts = await Advertisement.findAll({
      where: {
        company: {
          [Op.ne]: null
        }
      },
      attributes: [
        'company',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['company'],
      order: [[sequelize.literal('count'), 'DESC']],
      limit: 10
    });

    // D. Geographical Distribution (Top Locations)
    const locationCounts = await Advertisement.findAll({
      where: {
        location: {
          [Op.ne]: null
        }
      },
      attributes: [
        'location',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['location'],
      order: [[sequelize.literal('count'), 'DESC']],
      limit: 10
    });

    res.json({
      categories: categoryCounts,
      timeline: pageCounts,
      top_companies: companyCounts,
      locations: locationCounts
    });
  } catch (error) {
    console.error('Analytics load failure:', error);
    res.status(500).json({ error: 'Database aggregation error' });
  }
}

// 5. Get Ad Details
async function getAdDetails(req, res) {
  try {
    const { id } = req.params;
    const ad = await Advertisement.findByPk(id, {
      include: [{ model: NewspaperPage, as: 'page' }, { model: VisualUnderstanding, as: 'visual' }]
    });

    if (!ad) {
      return res.status(404).json({ error: 'Advertisement not found' });
    }

    res.json(ad);
  } catch (error) {
    console.error('Get ad details failure:', error);
    res.status(500).json({ error: 'Failed to fetch ad' });
  }
}

// 6. List Newspaper Pages
async function listPages(req, res) {
  try {
    const pages = await NewspaperPage.findAll({
      order: [['created_at', 'DESC']],
      include: [{ model: Advertisement, as: 'advertisements', attributes: ['id', 'category'] }]
    });
    res.json(pages);
  } catch (error) {
    console.error('List pages error:', error);
    res.status(500).json({ error: 'Failed to list newspaper pages' });
  }
}

// 7. Get Similar Advertisements (Semantic Vector Similarity Recommender)
async function getSimilarAds(req, res) {
  try {
    const { id } = req.params;
    const ad = await Advertisement.findByPk(id);

    if (!ad) {
      return res.status(404).json({ error: 'Advertisement not found' });
    }

    // Use the advertisement's raw text to query the vector search engine
    const textQuery = ad.raw_text.substring(0, 1000); // Truncate if extremely long
    const qStr = encodeURIComponent(textQuery);

    const mlResponse = await forwardToMLService(
      `/api/v1/search?q=${qStr}&type=semantic&limit=4`,
      'GET'
    );

    if (mlResponse.error) {
      return res.status(502).json({ error: 'ML Service Integration Failure', details: mlResponse.error });
    }

    const similarResults = [];
    for (const match of mlResponse.results || []) {
      // Skip the source advertisement itself
      if (String(match.ad_id) === String(id)) {
        continue;
      }

      const matchedAd = await Advertisement.findByPk(match.ad_id, {
        include: [{ model: NewspaperPage, as: 'page' }]
      });

      if (matchedAd) {
        similarResults.push({
          ad_id: matchedAd.id,
          score: match.score,
          title: matchedAd.title || 'Untitled Advertisement',
          category: matchedAd.category,
          location: matchedAd.location,
          raw_text: matchedAd.raw_text,
          image_url: matchedAd.image_path,
          publication_date: matchedAd.page ? matchedAd.page.publication_date : null
        });
      }
    }

    res.json({
      results: similarResults.slice(0, 3) // Return top 3 similar ads
    });
  } catch (error) {
    console.error('Similar ads lookup failure:', error.message);
    res.status(500).json({ error: 'Failed to retrieve similar advertisements' });
  }
}

module.exports = {
  uploadPage,
  searchAds,
  askRAG,
  getAnalytics,
  getAdDetails,
  listPages,
  getSimilarAds
};


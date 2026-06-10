import unittest
from unittest.mock import patch, MagicMock
import os
import sys

# Setup imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from models import ScrapeSource
from crawlers import get_crawler, EPaperPDFCrawler
from pipeline import ScraperPipeline

class TestScraperSubsystem(unittest.TestCase):
    def setUp(self):
        self.mock_source = ScrapeSource(
            id=99,
            name="Test Crawler Source",
            crawling_url="http://mock-newspaper-portal.org/test",
            source_type="epaper_pdf",
            cron_schedule="0 12 * * *",
            language="en",
            is_active=True
        )
        self.pipeline = ScraperPipeline()

    def test_crawler_factory(self):
        crawler = get_crawler(self.mock_source)
        self.assertIsInstance(crawler, EPaperPDFCrawler)
        self.assertEqual(crawler.source_id, 99)
        self.assertEqual(crawler.crawling_url, "http://mock-newspaper-portal.org/test")

    def test_crawler_mock_index(self):
        crawler = get_crawler(self.mock_source)
        editions = crawler.fetch_index()
        self.assertTrue(len(editions) > 0)
        for edition in editions:
            self.assertIn("url", edition)
            self.assertIn("publication_date", edition)
            self.assertIn("title", edition)

    @patch('requests.post')
    def test_pipeline_processing(self, mock_post):
        # Configure requests mock
        mock_response = MagicMock()
        mock_response.status_code = 202
        mock_post.return_value = mock_response

        # Generate fake PDF bytes
        fake_pdf = b"%PDF-1.4 mock pdf contents"
        
        # We process this mock download in the pipeline
        result = self.pipeline.process_download(
            source_id=self.mock_source.id,
            url="http://mock-newspaper-portal.org/test/epaper_2026-06-09.pdf",
            publication_date="2026-06-09",
            language="en",
            file_bytes=fake_pdf
        )
        
        self.assertEqual(result, "SUCCESS")
        # Ensure requests.post was called to forward the extracted page to backend gateway
        self.assertTrue(mock_post.called)

if __name__ == '__main__':
    unittest.main()

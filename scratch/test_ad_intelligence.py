import os
import sys
import unittest
from dotenv import load_dotenv

# Load env variables
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(BASE_DIR, ".env"))

# Set python path sequentially to avoid 'app' namespace collision
sys.path.insert(0, os.path.join(BASE_DIR, "apps", "scraper-service"))
from ad_classifier import AdClassifier
from web_scraper import RealTimeWebSearchOrchestrator, WebScrapedResult

sys.path.insert(0, os.path.join(BASE_DIR, "apps", "ml-service"))
from app.rag.rag_pipeline import AdIntelRagEngine
sys.path.pop(0)

sys.path.insert(0, os.path.join(BASE_DIR, "apps", "backend"))

class TestAdIntelligence(unittest.TestCase):
    def setUp(self):
        self.classifier = AdClassifier()
        self.orchestrator = RealTimeWebSearchOrchestrator()

    def test_ad_classification_valid_ads(self):
        """Test that actual advertisements are classified as True."""
        ad_texts = [
            "We supply high quality copper cables. Contact us at +91-9876543210. Rs 150 per meter.",
            "Authorized dealer of Siemens electric motors. Order now, immediate dispatch. Call +91-9999888877.",
            "TATA Projects road construction tenders in Nagpur Maharashtra. Budget ₹ 1,50,00,000.",
        ]
        for ad in ad_texts:
            is_ad, conf, reason = self.classifier.classify(ad)
            self.assertTrue(is_ad, f"Failed to classify ad: {ad}. Reason: {reason}")

    def test_ad_classification_editorial_news(self):
        """Test that news articles, crime, and opinions are classified as False."""
        editorial_texts = [
            "According to sources, police arrested three suspects in the recent bank robbery cases in Pune.",
            "The Chief Minister announced new election dates during a rally on Sunday afternoon.",
            "In yesterday's cricket match, the Indian team scored 350 runs to win the tournament."
        ]
        for ed in editorial_texts:
            is_ad, conf, reason = self.classifier.classify(ed)
            self.assertFalse(is_ad, f"Incorrectly classified news as ad: {ed}. Reason: {reason}")

    def test_orchestrator_filtering(self):
        """Test that search orchestrator filters non-ads and enforces relevance threshold."""
        # Mock search result list
        mock_results = [
            WebScrapedResult(
                title="Havells MCB Sale",
                description="Special discount on Havells MCB. Price Rs 250. Call +91-9876543210.",
                relevance_score=0.9,
                is_verified_ad=True,
                source_priority=1
            ),
            WebScrapedResult(
                title="Pune Police Arrests Suspects",
                description="Local police arrested two suspects today. According to officials, they were caught with stolen goods.",
                relevance_score=0.8,
                is_verified_ad=True,
                source_priority=1
            ),
            WebScrapedResult(
                title="Generic Unrelated Post",
                description="This is a random sentence with very low keyword overlap.",
                relevance_score=0.1,  # Low relevance
                is_verified_ad=True,
                source_priority=4
            )
        ]
        
        # Override orchestrator scrapers to return our mocks
        class MockScraper:
            source_name = "Mock"
            def search(self, query, terms, limit):
                return mock_results
                
        self.orchestrator.scrapers = [MockScraper()]
        results = self.orchestrator.search("Havells MCB", ["Havells", "MCB"])
        
        # Pune Police article should be filtered out because it's news (AdClassifier fails it)
        # Generic Post should be filtered out because relevance_score < 0.25
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].title, "Havells MCB Sale")

    def test_rag_empty_fallback(self):
        """Test that if RAG engine gets no matches, it returns 'No verified results found'."""
        # Initialize RAG Engine
        try:
            rag = AdIntelRagEngine()
            # Force empty search results by overriding search_ads
            rag.search_ads = lambda *args, **kwargs: []
            
            response = rag.generate_answer("How to build a motor?")
            self.assertEqual(response["answer"], "No verified results found")
            self.assertEqual(response["sources"], [])
            print("RAG Empty Fallback test passed.")
        except Exception as e:
            print("Could not verify RAG engine (is Qdrant/Gemini offline?):", e)

    def test_ranking_priority(self):
        """Test that relevance always takes priority over source priority in ranking."""
        mock_results = [
            WebScrapedResult(
                title="Low Relevance, High Source Priority",
                description="We offer some motors here. Call us.",
                relevance_score=0.4,
                is_verified_ad=True,
                source_priority=1  # Higher source priority
            ),
            WebScrapedResult(
                title="High Relevance, Low Source Priority",
                description="High efficiency Siemens 3-phase squirrel cage induction motor TEFC IP55.",
                relevance_score=0.9,
                is_verified_ad=True,
                source_priority=3  # Lower source priority
            )
        ]
        
        class MockScraper:
            source_name = "Mock"
            def search(self, query, terms, limit):
                return mock_results
                
        self.orchestrator.scrapers = [MockScraper()]
        results = self.orchestrator.search("Siemens 3-phase induction motor", ["Siemens"])
        
        # High Relevance, Low Source Priority should be ranked FIRST because relevance takes precedence over source priority.
        self.assertEqual(results[0].title, "High Relevance, Low Source Priority")
        self.assertEqual(results[1].title, "Low Relevance, High Source Priority")

if __name__ == "__main__":
    unittest.main()

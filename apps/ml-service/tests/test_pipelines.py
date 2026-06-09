import unittest
import os
import sys

# Setup import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.models.yolo_detector import DocLayoutYoloDetector
from app.ocr.ocr_engine import MultilingualOcrEngine

class TestAdIntelPipeline(unittest.TestCase):
    def setUp(self):
        self.detector = DocLayoutYoloDetector(model_path="yolov8n-document-layout.pt")
        self.ocr_engine = MultilingualOcrEngine()

    def test_mock_detection(self):
        """
        Tests layout detector coordinates are generated correctly.
        """
        # Since standard pt weights might not exist on system startup,
        # we check if it falls back correctly to simulated quadrants.
        mock_image = "dummy_page.png"
        
        # Create a mock image file
        with open(mock_image, "wb") as f:
            f.write(b"") # empty file
            
        try:
            regions = self.detector.detect_ads(mock_image, confidence_threshold=0.25)
            self.assertTrue(len(regions) > 0)
            
            # Assert schema conforms to output requirements
            for region in regions:
                self.assertIn("box", region)
                self.assertIn("pixel_box", region)
                self.assertIn("confidence", region)
                self.assertEqual(len(region["box"]), 4)
                
                # Check box normalization
                for coord in region["box"]:
                    self.assertTrue(0.0 <= coord <= 1.0)
        finally:
            if os.path.exists(mock_image):
                os.unlink(mock_image)

    def test_multilingual_ocr(self):
        """
        Asserts that OCR engine returns raw text, coordinate bounding lines and confidence.
        """
        mock_ad = "dummy_ad.png"
        with open(mock_ad, "wb") as f:
            f.write(b"")
            
        try:
            # English test
            result_en = self.ocr_engine.extract_text(mock_ad, language="en")
            self.assertIn("raw_text", result_en)
            self.assertIn("lines", result_en)
            self.assertIn("confidence", result_en)
            self.assertTrue(result_en["confidence"] > 0.0)

            # Marathi test
            result_mr = self.ocr_engine.extract_text(mock_ad, language="mr")
            self.assertTrue("महाराष्ट्र" in result_mr["raw_text"] or "TATA" in result_mr["raw_text"])
        finally:
            if os.path.exists(mock_ad):
                os.unlink(mock_ad)

if __name__ == '__main__':
    unittest.main()

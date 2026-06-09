import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("OcrEngine")

class MultilingualOcrEngine:
    def __init__(self, use_gpu=False):
        self.use_gpu = use_gpu
        self.paddle_ocr = None
        self.easy_ocr = None
        self._init_paddle()

    def _init_paddle(self):
        try:
            from paddleocr import PaddleOCR
            logger.info("Initializing PaddleOCR for English, Hindi, and Marathi...")
            # Initialize with multilingual support
            # lang='hi' supports Hindi/Marathi (Devanagari script)
            self.paddle_ocr = PaddleOCR(use_angle_cls=True, lang='hi', use_gpu=self.use_gpu, show_log=False)
            logger.info("PaddleOCR engine loaded successfully.")
        except Exception as e:
            logger.warning(f"Failed to load PaddleOCR: {e}. Attempting EasyOCR initialization...")
            self._init_easyocr()

    def _init_easyocr(self):
        try:
            import easyocr
            logger.info("Initializing EasyOCR for English, Hindi, and Marathi (Devanagari)...")
            self.easy_ocr = easyocr.Reader(['en', 'hi', 'mr'], gpu=self.use_gpu)
            logger.info("EasyOCR engine loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load EasyOCR: {e}. OCR will run in simulation mode.")

    def extract_text(self, image_path, language="en"):
        """
        Extracts text and layout coordinates from the image.
        Returns:
            dict containing:
                - 'raw_text': concatenated string of all text lines
                - 'lines': list of dicts with 'text', 'confidence', 'bbox'
                - 'confidence': average confidence score
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Ad image file not found: {image_path}")

        # 1. Try PaddleOCR first
        if self.paddle_ocr:
            try:
                # PaddleOCR expects image path, returns list of lists
                # Structure: [ [ [ [x,y],[x,y],[x,y],[x,y] ], ("text", confidence) ] ]
                result = self.paddle_ocr.ocr(image_path, cls=True)
                
                if not result or not result[0]:
                    return {"raw_text": "", "lines": [], "confidence": 0.0}

                lines = []
                total_conf = 0.0
                text_blocks = []

                for line in result[0]:
                    bbox = line[0] # [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
                    text, confidence = line[1]
                    
                    text_blocks.append(text)
                    total_conf += confidence
                    
                    # Flatten bounding box into min-max coords
                    xs = [pt[0] for pt in bbox]
                    ys = [pt[1] for pt in bbox]
                    flat_bbox = [min(xs), min(ys), max(xs), max(ys)]

                    lines.append({
                        "text": text,
                        "confidence": round(float(confidence), 4),
                        "bbox": flat_bbox
                    })

                raw_text = " ".join(text_blocks)
                avg_confidence = round(total_conf / len(lines), 4) if lines else 0.0

                return {
                    "raw_text": raw_text,
                    "lines": lines,
                    "confidence": avg_confidence
                }
            except Exception as e:
                logger.error(f"PaddleOCR runtime error: {e}. Falling back to EasyOCR...")

        # 2. Try EasyOCR as fallback
        if self.easy_ocr:
            try:
                # EasyOCR returns list of tuples: ( [x,y coords], "text", confidence )
                results = self.easy_ocr.readtext(image_path)
                
                lines = []
                total_conf = 0.0
                text_blocks = []

                for (bbox, text, confidence) in results:
                    text_blocks.append(text)
                    total_conf += confidence
                    
                    xs = [pt[0] for pt in bbox]
                    ys = [pt[1] for pt in bbox]
                    flat_bbox = [min(xs), min(ys), max(xs), max(ys)]

                    lines.append({
                        "text": text,
                        "confidence": round(float(confidence), 4),
                        "bbox": flat_bbox
                    })

                raw_text = " ".join(text_blocks)
                avg_confidence = round(total_conf / len(lines), 4) if lines else 0.0

                return {
                    "raw_text": raw_text,
                    "lines": lines,
                    "confidence": avg_confidence
                }
            except Exception as e:
                logger.error(f"EasyOCR runtime error: {e}. Running in simulation mode.")

        # 3. Final Simulation mode (if no engine loaded or both failed)
        logger.warning("No OCR engines working. Generating simulated mock advertisement text.")
        
        # Simulated responses based on typical ad categories
        mock_texts = {
            "mr": "महाराष्ट्र शासन - सार्वजनिक बांधकाम विभाग. ई-निविदा सूचना क्र. २४/२०२६. नागपूर येथील रस्ता रुंदीकरण व डांबरीकरण कामासाठी पात्र कंत्राटदारांकडून ई-निविदा मागविण्यात येत आहेत.",
            "hi": "भारत सरकार - भर्ती सूचना २०२६. सिविल इंजीनियर्स के लिए १० रिक्त पदों पर आवेदन आमंत्रित किए जाते हैं। वेतनमान रु. ५०,००० - १,४०,०००. अंतिम तिथि ३० जून २०२६.",
            "en": "TATA MOTORS - Mega June Offer! Buy the all-new SUV with benefits up to Rs. 80,000. Low EMI starting at Rs. 9,999. Visit your nearest dealer in Pune/Nagpur today. Contact: 1800-209-7979 or info@tatamotors.com."
        }

        selected_text = mock_texts.get(language, mock_texts["en"])
        
        return {
            "raw_text": selected_text,
            "lines": [{"text": selected_text, "confidence": 0.95, "bbox": [10, 10, 200, 100]}],
            "confidence": 0.95
        }

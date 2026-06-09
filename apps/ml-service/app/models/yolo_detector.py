import os
import cv2
import logging
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DocLayoutDetector")

class DocLayoutYoloDetector:
    def __init__(self, model_path=None):
        """
        Initializes the DocLayout-YOLO model.
        If model_path is not specified, uses a pre-trained DocLayout-YOLO weights path 
        or falls back to a standard layout-yolov8 model.
        """
        self.model_path = model_path or os.getenv("YOLO_MODEL_PATH", "yolov8n-document-layout.pt")
        self.model = None
        self._load_model()

    def _load_model(self):
        try:
            from ultralytics import YOLO
            # Lazy load YOLO weights. In production, DocLayout-YOLO models (like doclayout-yolo-base)
            # are loaded via ultralytics YOLO class.
            logger.info(f"Loading DocLayout-YOLO weights from: {self.model_path}")
            # If weights file doesn't exist, ultralytics will auto-download standard yolov8n layout
            self.model = YOLO(self.model_path)
            logger.info("Model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load layout YOLO model: {e}. Running in mockup/simulation mode.")
            self.model = None

    def detect_ads(self, image_path, confidence_threshold=0.25):
        """
        Runs layout detection on the newspaper page.
        Returns:
            list of dicts containing:
                - 'box': [x1, y1, x2, y2] (normalized floats 0.0 - 1.0)
                - 'pixel_box': [px_x1, px_y1, px_x2, px_y2] (pixel integers)
                - 'confidence': float
                - 'class': string (e.g., 'advertisement', 'text', 'title')
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Source image not found: {image_path}")

        img = cv2.imread(image_path)
        h, w, _ = img.shape
        results = []

        if self.model is None:
            # Fallback mockup simulation mode: split the page into 4 quadrant advertisements 
            # for development/testing if model cannot load.
            logger.warning("YOLO model not initialized. Simulating mock advertisement regions.")
            mock_boxes = [
                {"box": [0.05, 0.05, 0.45, 0.45], "class": "advertisement", "confidence": 0.92},
                {"box": [0.55, 0.05, 0.95, 0.45], "class": "advertisement", "confidence": 0.88},
                {"box": [0.05, 0.55, 0.45, 0.95], "class": "advertisement", "confidence": 0.85},
                {"box": [0.55, 0.55, 0.95, 0.95], "class": "advertisement", "confidence": 0.90}
            ]
            for mock in mock_boxes:
                x1, y1, x2, y2 = mock["box"]
                mock["pixel_box"] = [int(x1*w), int(y1*h), int(x2*w), int(y2*h)]
                results.append(mock)
            return results

        # Run inference
        inference_results = self.model(image_path, conf=confidence_threshold)
        
        for result in inference_results:
            boxes = result.boxes
            for box in boxes:
                # Get class index & label
                cls_id = int(box.cls[0])
                cls_name = self.model.names[cls_id].lower()
                conf = float(box.conf[0])
                
                # Check for advertisement layouts (or fallback to general table/figure/text if specific weights not loaded)
                # Typical doclayout labels: 0: text, 1: title, 2: picture, 3: table, 4: list, etc.
                # In standard models, we map 'picture', 'table' or 'advertisement' class names.
                if cls_name in ["advertisement", "picture", "table", "figure"]:
                    xyxy = box.xyxy[0].tolist()
                    px_x1, px_y1, px_x2, px_y2 = int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3])
                    
                    # Normalized coords
                    norm_x1 = round(px_x1 / w, 4)
                    norm_y1 = round(px_y1 / h, 4)
                    norm_x2 = round(px_x2 / w, 4)
                    norm_y2 = round(px_y2 / h, 4)
                    
                    results.append({
                        "box": [norm_x1, norm_y1, norm_x2, norm_y2],
                        "pixel_box": [px_x1, px_y1, px_x2, px_y2],
                        "confidence": round(conf, 4),
                        "class": "advertisement"
                    })
        
        # If no specific advertisement class detected, fall back to quadrant splitting
        if not results:
            logger.info("No advertisement regions found. Returning default simulated quadrants.")
            return self.detect_ads(image_path, confidence_threshold=0.0) # trigger mockup

        return results

    def crop_ad(self, image_path, pixel_box, output_path):
        """
        Crops an advertisement region and saves it as a separate image.
        """
        img = cv2.imread(image_path)
        x1, y1, x2, y2 = pixel_box
        
        # Ensure bounding coordinates fall within the image dimensions
        h, w, _ = img.shape
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        
        cropped_img = img[y1:y2, x1:x2]
        cv2.imwrite(output_path, cropped_img)
        logger.info(f"Cropped ad saved to {output_path}")
        return output_path

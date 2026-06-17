"""
ad_classifier.py
----------------
Classifies scraped web content blocks as ADVERTISEMENT or EDITORIAL.

Only advertisement and commercial listing content passes through.
Editorial news, sports, politics, crime, opinion pieces are rejected.

This is the gatekeeper — nothing enters the index unless it passes
the ad classification check.
"""

import os
import re
import logging
from typing import Tuple
from dotenv import load_dotenv
from google import genai

logger = logging.getLogger("AdClassifier")

# Load environment variables
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
root_env = os.path.join(BASE_DIR, ".env")
if os.path.exists(root_env):
    load_dotenv(root_env)
else:
    load_dotenv()

# Local Dictionary Fallback for Hindi and Marathi translations
LOCAL_TRANSLATION_MAP = {
    # Hindi/Marathi words to English
    "तांब्याची": "copper",
    "तांबे": "copper",
    "तांबा": "copper",
    "तार": "wire",
    "वायर": "wire",
    "केबल": "cable",
    "मोटर": "motor",
    "मोटार": "motor",
    "पंप": "pump",
    "व्हाल्व्ह": "valve",
    "वाल्व": "valve",
    "नळ": "tap",
    "नल": "tap",
    "पाईप": "pipe",
    "पाइप": "pipe",
    "सिमेंट": "cement",
    "सीमेंट": "cement",
    "स्टील": "steel",
    "लोखंड": "iron",
    "लोहा": "iron",
    "बटण": "button",
    "बटन": "button",
    "स्विच": "switch",
    "सॉकेट": "socket",
    "पंखा": "fan",
    "कूलर": "cooler",
    "एसी": "ac",
    "निविदा": "tender",
    "भर्ती": "recruitment",
    "नौकरी": "job",
    "नोकरी": "job",
    "रिक्त": "vacancy",
    "पदे": "posts",
    "अर्ज": "application",
    "सादर": "submit",
    "पात्र": "eligible",
    "कंत्राटदार": "contractor",
    "ठेकेदार": "contractor",
    "जाहिरात": "advertisement",
    "विज्ञापन": "advertisement",
    "विक्री": "sale",
    "खरेदी": "purchase",
    "किंमत": "price",
    "दर": "rate",
    "सवलत": "discount",
    "सूट": "discount",
    "ऑफर": "offer",
    "पत्ता": "address",
    "फोन": "phone",
    "मोबाईल": "mobile",
    "संपर्क": "contact",
    "वेबसाईट": "website",
    "ईमेल": "email",
    "कार्यालय": "office",
    "विभाग": "department",
    "शासनाचे": "government",
    "शासन": "government",
    "महाराष्ट्र": "maharashtra",
    "नागपूर": "nagpur",
    "पुणे": "pune",
    "मुंबई": "mumbai",
    "दिल्ली": "delhi",
}

# ── Signals that definitively indicate EDITORIAL / non-ad content ─────────────

EDITORIAL_SIGNALS = [
    # News verbs and framing
    r"\b(reported|according to|sources said|officials said|police said|court said)\b",
    r"\b(arrested|detained|accused|convicted|sentenced|acquitted|bail|fir|chargesheet)\b",
    r"\b(killed|died|dead|injured|accident|blast|explosion|fire broke out)\b",
    r"\b(election|vote|ballot|candidate|mla|mp|minister|chief minister|government announced)\b",
    r"\b(breaking news|latest news|top stories|headlines|editorial|opinion|column)\b",
    r"\b(match|tournament|cricket|ipl|football|tennis|player|scored|wicket|goal)\b",
    r"\b(weather|forecast|monsoon|rainfall|temperature|cyclone|flood)\b",
    r"\b(stock market|sensex|nifty|shares fell|shares rose|trading session)\b",
    r"\b(protest|rally|strike|demonstration|mob|violence|riot)\b",
    r"\b(hospital|patient|surgery|diagnosis|treatment|vaccine|covid|pandemic)\b",
    # Very strong editorial patterns
    r"\b(the (police|court|government|minister|cm|pm|official))\b",
    r"\bpti\b|\bani\b|\bians\b|\bafp\b|\breuters\b|\bap report\b",
]

EDITORIAL_SIGNAL_PATTERNS = [re.compile(p, re.IGNORECASE) for p in EDITORIAL_SIGNALS]

# ── Signals that indicate ADVERTISEMENT / commercial content ──────────────────

AD_SIGNALS = [
    # Price indicators
    r"(?:₹|rs\.?|inr)\s*[\d,]+",
    r"\bprice[:\s]",
    r"\brate[:\s]",
    r"\bcost[:\s]",
    r"\bquote\b",
    r"\boffer\b",
    r"\bdiscount\b",
    r"\bsale\b",
    r"\bavailable\b",
    # Contact signals
    r"\bcontact\s*(us|:)",
    r"\bcall\s*(us|now|:)",
    r"\bwhatsapp\b",
    r"\bmobile\s*[:\-]?\s*\+?91",
    r"\bphone\s*[:\-]",
    r"\bemail\s*[:\-]",
    r"\bwebsite\s*[:\-]",
    # Supply signals
    r"\b(dealer|supplier|distributor|stockist|trader|wholesaler|retailer)\b",
    r"\b(manufacturer|exporter|importer|fabricator|installer)\b",
    r"\b(buy|purchase|order|enquire|enquiry|inquiry)\b",
    r"\b(supply|supplies|supplied|supplying)\b",
    r"\b(brand new|genuine|original|certified|authorized)\b",
    r"\b(in stock|ready stock|ex\-?stock|immediate dispatch)\b",
    # Product descriptor signals
    r"\b(specifications|dimensions|model|make|grade|type)\b",
    r"\bISI\b|\bBIS\b|\bISO\b|\bBEE\b|\bstar rating\b",
    r"\b(watt|amp|volt|hp|kw|sq\s*mm|phase|rpm)\b",
    r"\b(kg|ton|meter|mtr|feet|ft|inch|mm|cm)\b",
    # Tender and notice signals
    r"\b(tender|tenders|bid|bidding|auction|classified|classifieds|procurement|notice inviting tender|nit)\b",
]

AD_SIGNAL_PATTERNS = [re.compile(p, re.IGNORECASE) for p in AD_SIGNALS]

# ── Product / commercial keyword categories ───────────────────────────────────

PRODUCT_KEYWORDS = {
    "electrical": [
        "wire", "cable", "conductor", "flex", "switchgear", "mcb", "rccb", "mccb",
        "elcb", "switch", "socket", "plug", "fan", "motor", "pump", "inverter",
        "transformer", "capacitor", "meter", "panel", "db", "busbar", "conduit",
        "fitting", "light", "lamp", "led", "cfl", "bulb", "tube", "fixture",
        "relay", "contactor", "starter", "vfd", "drive", "ups", "battery",
        "solar", "earthing", "cable tray", "trunking", "gland", "lugs",
        "terminal", "connector", "fuse", "isolator", "distribution board",
        "modular switch", "switchboard", "wiring", "copper", "aluminium",
        "polycab", "havells", "anchor", "legrand", "schneider", "l&t", "siemens",
        "abb", "crompton", "finolex", "rr kabel",
    ],
    "hardware_plumbing": [
        "pipe", "fitting", "valve", "tap", "sanitary", "pvc", "cpvc", "upvc",
        "gi pipe", "ms pipe", "flange", "coupling", "reducer", "tee", "elbow",
        "plumbing", "water supply", "drainage",
    ],
    "building_materials": [
        "cement", "steel", "tmt bar", "rod", "brick", "tile", "paint",
        "adhesive", "sealant", "waterproofing",
    ],
}

ALL_PRODUCT_KEYWORDS = set()
for kws in PRODUCT_KEYWORDS.values():
    ALL_PRODUCT_KEYWORDS.update(kws)


class AdClassifier:
    """
    Determines whether a piece of scraped text represents a commercial
    advertisement or a product listing, versus editorial news content.

    Returns (is_ad: bool, confidence: float, reason: str)
    """

    # Minimum ad signals required to accept as advertisement
    MIN_AD_SIGNALS = 1
    # Maximum editorial signals allowed before rejection
    MAX_EDITORIAL_SIGNALS = 1
    # Minimum word overlap with known product keywords
    MIN_PRODUCT_KEYWORD_OVERLAP = 1

    def __init__(self):
        # Configure Gemini client
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        if gemini_key:
            try:
                self.genai_client = genai.Client(api_key=gemini_key)
                self.has_gemini = True
                logger.info("AdClassifier: Gemini client initialized successfully.")
            except Exception as e:
                self.genai_client = None
                self.has_gemini = False
                logger.error(f"AdClassifier: Failed to initialize Gemini: {e}")
        else:
            self.genai_client = None
            self.has_gemini = False

    def translate_to_english(self, text: str) -> str:
        if not text or not text.strip():
            return text

        # Check if text contains Devanagari characters (Hindi/Marathi range: \u0900-\u097F)
        has_devanagari = bool(re.search(r"[\u0900-\u097F]", text))
        if not has_devanagari:
            return text

        # Try using Gemini Client
        if self.has_gemini and self.genai_client:
            try:
                model_name = "gemini-2.0-flash"
                try:
                    available_models = [m.name for m in self.genai_client.models.list()]
                    for m in ['models/gemini-3.5-flash', 'models/gemini-2.0-flash', 'models/gemini-2.5-pro', 'models/gemini-2.5-flash']:
                        if m in available_models:
                            model_name = m.replace('models/', '')
                            break
                except Exception:
                    pass

                prompt = (
                    "Translate the following text into English. If it is already in English, return it as is. "
                    "Do not explain, add comments, or wrap in markdown. Just return the translation.\n\n"
                    f"=== TEXT ===\n{text}"
                )
                response = self.genai_client.models.generate_content(
                    model=model_name,
                    contents=prompt
                )
                translated = response.text.strip()
                if translated:
                    logger.info("Successfully translated regional text to English using Gemini.")
                    return translated
            except Exception as e:
                logger.warning(f"Gemini translation failed: {e}. Falling back to local dictionary.")
                pass

        # Fallback to local dictionary translation
        text_lower = text.lower()
        
        # Phase 1: Substring replacements for common phrases
        phrases = {
            "तांब्याची वायर": "copper wire",
            "तांब्याची केबल": "copper cable",
            "कॉपर वायर": "copper wire",
            "कॉपर केबल": "copper cable",
            "निविदा सूचना": "tender notice",
            "निविदा पत्र": "tender document",
            "भर्ती सूचना": "recruitment notice",
            "रिक्त पदे": "vacant posts",
            "पदासाठी": "for post",
        }
        for phrase, eng in phrases.items():
            text_lower = text_lower.replace(phrase, eng)

        # Phase 2: Word-by-word replacement
        words = text_lower.split()
        translated_words = []
        for word in words:
            # Strip punctuation but keep Devanagari/English characters
            clean_word = re.sub(r"[^\w\u0900-\u097F]", "", word)
            if clean_word in LOCAL_TRANSLATION_MAP:
                translated_words.append(LOCAL_TRANSLATION_MAP[clean_word])
            else:
                translated_words.append(word)
        
        return " ".join(translated_words)

    def classify(self, text: str, title: str = "", source_type: str = "") -> Tuple[bool, float, str]:
        """
        Returns (is_advertisement, confidence_score, reason).
        confidence_score: 0.0 – 1.0 where 1.0 = definitely an ad.
        """
        # Translate input texts to English first if they contain regional characters
        translated_title = self.translate_to_english(title)
        translated_text = self.translate_to_english(text)

        combined = f"{translated_title} {translated_text}".lower()

        # ── Hard pass: dealer/manufacturer sources are always commercial ─────
        if source_type in ("dealer_website", "manufacturer", "directory"):
            return True, 0.95, "source_type_commercial"

        # ── Count editorial signals ──────────────────────────────────────────
        editorial_hits = sum(
            1 for p in EDITORIAL_SIGNAL_PATTERNS if p.search(combined)
        )

        # ── Count ad signals ─────────────────────────────────────────────────
        ad_hits = sum(
            1 for p in AD_SIGNAL_PATTERNS if p.search(combined)
        )

        # ── Count product keyword matches ─────────────────────────────────────
        words = set(re.findall(r"\b\w+\b", combined))
        product_overlap = len(words & ALL_PRODUCT_KEYWORDS)

        # ── Decision logic ────────────────────────────────────────────────────
        if editorial_hits > self.MAX_EDITORIAL_SIGNALS and ad_hits < 2:
            confidence = max(0.0, 0.3 - (editorial_hits * 0.1))
            return False, confidence, f"editorial_signals={editorial_hits}"

        if ad_hits >= self.MIN_AD_SIGNALS or product_overlap >= self.MIN_PRODUCT_KEYWORD_OVERLAP:
            # Even if some editorial signals present, ad signals dominate
            if ad_hits >= 3 or product_overlap >= 3:
                confidence = min(1.0, 0.6 + (ad_hits * 0.05) + (product_overlap * 0.03))
                return True, round(confidence, 3), f"ad_signals={ad_hits} product_kw={product_overlap}"
            # Borderline: product keywords present but weak ad signals
            if product_overlap >= 1 and editorial_hits <= 1:
                confidence = min(1.0, 0.5 + (product_overlap * 0.05))
                return True, round(confidence, 3), f"product_kw={product_overlap}"
            # Has ad signals and no editorial signals
            if ad_hits >= 1 and editorial_hits == 0:
                confidence = min(1.0, 0.5 + (ad_hits * 0.1))
                return True, round(confidence, 3), f"ad_signals={ad_hits} no_editorial"

        # ── Reject if no commercial signals detected ──────────────────────────
        return False, 0.1, f"no_ad_signals ad={ad_hits} product={product_overlap} editorial={editorial_hits}"

    def is_advertisement(self, text: str, title: str = "", source_type: str = "") -> bool:
        is_ad, _, _ = self.classify(text, title, source_type)
        return is_ad

    def filter_results(self, results: list) -> list:
        """Filter a list of WebScrapedResult objects, keeping only advertisements."""
        kept = []
        for r in results:
            title_text = r.title or ""
            desc_text = r.description or ""
            
            # Translate regional text to English in result properties
            has_dev = bool(re.search(r"[\u0900-\u097F]", title_text + " " + desc_text))
            if has_dev:
                try:
                    r.title = self.translate_to_english(title_text)
                    r.description = self.translate_to_english(desc_text)
                except Exception:
                    pass

            is_ad, confidence, reason = self.classify(
                text=r.description or "",
                title=r.title or "",
                source_type=r.source_type or "",
            )
            if is_ad:
                r.relevance_score = round(r.relevance_score * confidence, 4)
                kept.append(r)
            else:
                logger.debug(
                    f"AdClassifier REJECTED '{r.title[:60]}' from {r.source_name}: {reason}"
                )
        return kept

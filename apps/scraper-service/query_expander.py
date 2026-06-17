"""
query_expander.py
-----------------
Handles intelligent query normalization and expansion for Indian electrical/industrial
product searches. Handles abbreviations, typos, spelling variations, unit formats,
and conversational/natural-language queries.
"""

import os
import re
import logging
from typing import List, Dict, Optional
from dotenv import load_dotenv
from google import genai

# Load environment variables
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
root_env = os.path.join(BASE_DIR, ".env")
if os.path.exists(root_env):
    load_dotenv(root_env)
else:
    load_dotenv()

logger = logging.getLogger("QueryExpander")

# ─── Abbreviation & Synonym Dictionaries ──────────────────────────────────────

UNIT_NORMALIZATIONS = {
    r"\bsq\.?\s*mm\b": "sq mm",
    r"\bsqmm\b": "sq mm",
    r"\bmm2\b": "sq mm",
    r"\bsq\s+millimeter\b": "sq mm",
    r"\bsqure\s*mm\b": "sq mm",        # typo
    r"\bhp\b": "HP",
    r"\bh\.p\b": "HP",
    r"\bhorsepower\b": "HP",
    r"\bkw\b": "kW",
    r"\bkilowatt\b": "kW",
    r"\bamp\b": "A",
    r"\bamps\b": "A",
    r"\bampere\b": "A",
    r"\bamperes\b": "A",
    r"\bwatt\b": "W",
    r"\bwatts\b": "W",
    r"\bvolt\b": "V",
    r"\bvolts\b": "V",
    r"\bv\b": "V",
    r"\binch\b": "inch",
    r"\binches\b": "inch",
    r"\"\b": "inch",
    r"\bmm\b": "mm",
    r"\bmillimeter\b": "mm",
    r"\bmillimetre\b": "mm",
    r"\bft\b": "ft",
    r"\bfeet\b": "ft",
    r"\bmeter\b": "m",
    r"\bmetre\b": "m",
    r"\bkg\b": "kg",
    r"\bkilogram\b": "kg",
}

ABBREVIATION_MAP = {
    "mcb": ["MCB", "miniature circuit breaker", "circuit breaker"],
    "rccb": ["RCCB", "residual current circuit breaker"],
    "elcb": ["ELCB", "earth leakage circuit breaker"],
    "mccb": ["MCCB", "moulded case circuit breaker"],
    "db": ["DB", "distribution board"],
    "dp": ["DP", "double pole"],
    "sp": ["SP", "single pole"],
    "tp": ["TP", "triple pole", "three pole"],
    "fp": ["FP", "four pole"],
    "pvc": ["PVC", "polyvinyl chloride"],
    "xlpe": ["XLPE", "cross linked polyethylene"],
    "frls": ["FRLS", "flame retardant low smoke"],
    "led": ["LED", "light emitting diode"],
    "cfl": ["CFL", "compact fluorescent lamp"],
    "hid": ["HID", "high intensity discharge"],
    "hps": ["HPS", "high pressure sodium"],
    "mh": ["MH", "metal halide"],
    "usp": ["USP", "uninterruptible power supply"],
    "ups": ["UPS", "uninterruptible power supply"],
    "smps": ["SMPS", "switched mode power supply"],
    "vfd": ["VFD", "variable frequency drive", "variable speed drive"],
    "vsd": ["VSD", "variable speed drive"],
    "dol": ["DOL", "direct on line starter"],
    "sts": ["STS", "static transfer switch"],
    "ats": ["ATS", "automatic transfer switch"],
    "apfc": ["APFC", "automatic power factor correction"],
    "capacitor": ["capacitor", "power capacitor", "capacitor bank"],
    "transformer": ["transformer", "distribution transformer", "isolation transformer"],
    "busbar": ["busbar", "bus bar", "bus duct"],
    "ct": ["CT", "current transformer"],
    "pt": ["PT", "potential transformer", "voltage transformer"],
    "energy meter": ["energy meter", "kwh meter", "electricity meter"],
    "kwh": ["kWh", "kilowatt hour", "energy meter"],
    "armored": ["armoured", "armored"],
    "armoured": ["armoured", "armored"],
    "unsheathed": ["unsheathed", "bare", "single core"],
    "sheathed": ["sheathed", "insulated"],
}

PRODUCT_SYNONYMS = {
    # Wire / Cable
    "wire": ["wire", "cable", "conductor", "flex", "electric wire", "wiring"],
    "cable": ["cable", "wire", "conductor", "electric cable"],
    "flex": ["flex", "flexible wire", "flexible cable"],
    "copper wire": ["copper wire", "copper cable", "copper conductor"],
    "aluminium wire": ["aluminium wire", "aluminum wire", "al wire"],
    "control cable": ["control cable", "multicore cable", "instrumentation cable"],
    # Wiring accessories
    "switch": ["switch", "electrical switch", "light switch", "toggle switch", "rocker switch"],
    "switchboard": ["switchboard", "switch board", "modular switch", "electrical switch plate"],
    "socket": ["socket", "socket outlet", "power socket", "plug point"],
    "plug": ["plug", "power plug", "electrical plug"],
    "fan": ["fan", "ceiling fan", "exhaust fan", "pedestal fan", "table fan", "wall fan"],
    "ceiling fan": ["ceiling fan", "room fan", "electric fan"],
    # Circuit protection
    "mcb": ["MCB", "miniature circuit breaker", "circuit breaker", "breaker"],
    "fuse": ["fuse", "fuse switch", "fuse unit", "fuse box"],
    # Lighting
    "led": ["LED light", "LED lamp", "LED bulb", "LED panel", "LED tube"],
    "panel light": ["panel light", "LED panel", "flat panel light", "recessed light"],
    "tube light": ["tube light", "fluorescent tube", "LED tube"],
    "bulb": ["bulb", "lamp", "light bulb", "LED bulb", "CFL"],
    "street light": ["street light", "street lamp", "road light", "outdoor light"],
    "batten": ["batten", "LED batten", "tube batten", "surface batten"],
    # Conduit / piping
    "conduit": ["conduit", "conduit pipe", "PVC conduit", "electrical conduit"],
    "pvc pipe": ["PVC pipe", "PVC conduit", "conduit pipe"],
    # Motors
    "motor": ["motor", "electric motor", "induction motor", "AC motor"],
    "pump": ["pump", "water pump", "submersible pump", "centrifugal pump", "monoblock pump"],
    # Power equipment
    "inverter": ["inverter", "power inverter", "solar inverter", "UPS inverter"],
    "solar": ["solar", "solar panel", "solar inverter", "solar system"],
    # Contractors
    "contractor": ["contractor", "dealer", "supplier", "vendor", "distributor"],
    "electrician": ["electrician", "electrical contractor", "wiring contractor"],
}

BRAND_ALIASES = {
    "havells": ["Havells", "Havells India", "havells"],
    "polycab": ["Polycab", "Polycab India", "polycab wires"],
    "anchor": ["Anchor", "Anchor Electricals", "Anchor by Panasonic"],
    "legrand": ["Legrand", "legrand"],
    "schneider": ["Schneider", "Schneider Electric", "schneider electric"],
    "siemens": ["Siemens", "siemens"],
    "l&t": ["L&T", "Larsen & Toubro", "L and T"],
    "crompton": ["Crompton", "Crompton Greaves"],
    "bajaj": ["Bajaj", "Bajaj Electricals"],
    "finolex": ["Finolex", "Finolex Cables"],
    "abb": ["ABB", "abb"],
    "philips": ["Philips", "philips"],
    "syska": ["Syska", "syska"],
    "wipro": ["Wipro", "wipro lighting"],
    "surya": ["Surya", "surya roshni"],
    "orient": ["Orient", "orient electric", "orient fan"],
    "usha": ["Usha", "usha fan"],
    "kirloskar": ["Kirloskar", "kirloskar electric"],
    "texmo": ["Texmo", "texmo"],
    "v-guard": ["V-Guard", "vguard", "v guard"],
    "rr kabel": ["RR Kabel", "rr cable", "rr kabel"],
    "sterlite": ["Sterlite", "sterlite cable"],
    "ceat": ["CEAT", "ceat"],
    "hager": ["Hager", "hager"],
    "eaton": ["Eaton", "eaton"],
    "honeywell": ["Honeywell", "honeywell"],
    "ge": ["GE", "general electric"],
}

# Conversational/natural-language patterns → structured intent
CONVERSATIONAL_PATTERNS = [
    (r"need\s+(?:a\s+)?(.+?)\s+for\s+(.+)", "product_for_use"),
    (r"want\s+(?:a\s+)?(.+?)\s+for\s+(.+)", "product_for_use"),
    (r"looking\s+for\s+(.+)", "search"),
    (r"where\s+(?:can\s+i\s+)?buy\s+(.+)", "search"),
    (r"where\s+to\s+buy\s+(.+)", "search"),
    (r"best\s+(.+?)\s+(?:under|below|less\s+than)\s+(.+)", "price_filter"),
    (r"cheap(?:est)?\s+(.+)", "low_price_search"),
    (r"(.+?)\s+price(?:\s+in\s+(.+))?", "price_lookup"),
    (r"(.+?)\s+(?:in|at|near)\s+(.+)", "location_search"),
    (r"(.+?)\s+dealer(?:s)?\s+in\s+(.+)", "dealer_location"),
    (r"(.+?)\s+supplier(?:s)?\s+in\s+(.+)", "dealer_location"),
    (r"(.+?)\s+contractor(?:s)?\s+in\s+(.+)", "contractor_location"),
    (r"around\s+(.+)", "approx_search"),
    (r"(.+?)\s+used\s+in\s+(.+)", "application_search"),
    (r"(.+?)\s+for\s+(.+)\s+use", "application_search"),
]

TYPO_CORRECTIONS = {
    "havels": "havells",
    "havells": "havells",
    "poycab": "polycab",
    "polycap": "polycab",
    "anchore": "anchor",
    "anker": "anchor",
    "legarnd": "legrand",
    "scnieder": "schneider",
    "simens": "siemens",
    "sieemens": "siemens",
    "cromton": "crompton",
    "cromptan": "crompton",
    "wier": "wire",
    "wyre": "wire",
    "wiyre": "wire",
    "cabl": "cable",
    "cabble": "cable",
    "kabel": "cable",
    "leght": "light",
    "ligh": "light",
    "ledlamp": "led lamp",
    "mcbs": "mcb",
    "m.c.b": "mcb",
    "switchbord": "switchboard",
    "switchbroad": "switchboard",
    "conduyt": "conduit",
    "condute": "conduit",
    "mottor": "motor",
    "pumpp": "pump",
    "inverttor": "inverter",
}


class QueryExpander:
    """
    Normalizes and expands natural language search queries into structured
    search terms suitable for both keyword and semantic search.
    """

    def __init__(self):
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        if gemini_key:
            try:
                self.genai_client = genai.Client(api_key=gemini_key)
                self.has_gemini = True
            except Exception:
                self.genai_client = None
                self.has_gemini = False
        else:
            self.genai_client = None
            self.has_gemini = False

    def _translate_to_english(self, text: str) -> str:
        if not text or not text.strip():
            return text

        has_devanagari = bool(re.search(r"[\u0900-\u097F]", text))
        if not has_devanagari:
            return text

        if self.has_gemini and self.genai_client:
            try:
                model_name = "gemini-2.0-flash"
                try:
                    available_models = [m.name for m in self.genai_client.models.list()]
                    for m in ['models/gemini-3.5-flash', 'models/gemini-2.0-flash', 'models/gemini-2.5-pro']:
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
                    logger.info("QueryExpander: Successfully translated regional query to English using Gemini.")
                    return translated
            except Exception as e:
                logger.warning(f"QueryExpander: Gemini translation failed: {e}. Falling back to local dictionary.")
                pass

        from ad_classifier import LOCAL_TRANSLATION_MAP
        text_lower = text.lower()
        
        phrases = {
            "तांब्याची वायर": "copper wire",
            "तांब्याची केबल": "copper cable",
            "कॉपर वायर": "copper wire",
            "कॉपर केबल": "copper cable",
        }
        for phrase, eng in phrases.items():
            text_lower = text_lower.replace(phrase, eng)

        words = text_lower.split()
        translated_words = []
        for word in words:
            clean_word = re.sub(r"[^\w\u0900-\u097F]", "", word)
            if clean_word in LOCAL_TRANSLATION_MAP:
                translated_words.append(LOCAL_TRANSLATION_MAP[clean_word])
            else:
                translated_words.append(word)
        
        return " ".join(translated_words)

    def _generate_regional_variants(self, text: str) -> List[str]:
        if self.has_gemini and self.genai_client:
            try:
                model_name = "gemini-2.0-flash"
                try:
                    available_models = [m.name for m in self.genai_client.models.list()]
                    for m in ['models/gemini-3.5-flash', 'models/gemini-2.0-flash', 'models/gemini-2.5-pro']:
                        if m in available_models:
                            model_name = m.replace('models/', '')
                            break
                except Exception:
                    pass

                prompt = (
                    "Translate the following English query into common Hindi and Marathi translations or transliterations "
                    "used in newspaper advertisements (e.g. 'copper wire' -> 'कॉपर वायर', 'तांब्याची वायर'). "
                    "Return the result ONLY as a raw JSON list of strings (e.g. [\"translation1\", \"translation2\"]). "
                    "Do not include markdown tags. Do not explain.\n\n"
                    f"Query: {text}"
                )
                response = self.genai_client.models.generate_content(
                    model=model_name,
                    contents=prompt
                )
                import json
                cleaned_text = response.text.strip()
                if cleaned_text.startswith("```"):
                    lines = cleaned_text.split("\n")
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines[-1].startswith("```"):
                        lines = lines[:-1]
                    cleaned_text = "\n".join(lines).strip()
                variants = json.loads(cleaned_text)
                if isinstance(variants, list):
                    return [str(v).strip() for v in variants]
            except Exception:
                pass
                
        text_lower = text.lower()
        variants = []
        if "copper wire" in text_lower or "copper cable" in text_lower:
            variants.extend(["कॉपर वायर", "तांब्याची वायर", "कॉपर केबल"])
        elif "wire" in text_lower:
            variants.extend(["वायर", "तार"])
        elif "motor" in text_lower:
            variants.extend(["मोटर", "मोटार"])
        elif "pump" in text_lower:
            variants.extend(["पंप"])
        elif "valve" in text_lower:
            variants.extend(["वाल्व", "व्हाल्व्ह"])
        return variants

    def expand(self, raw_query: str) -> Dict:
        """
        Returns a dict with:
          - normalized: cleaned query string
          - terms: list of expanded search terms
          - brand: detected brand (if any)
          - category: detected category (if any)
          - location: detected location (if any)
          - price_max: detected max price (if any)
          - intent: parsed intent type
        """
        q = raw_query.strip()
        
        has_devanagari = bool(re.search(r"[\u0900-\u097F]", q))
        english_q = q
        regional_variants = [q]

        if has_devanagari:
            english_q = self._translate_to_english(q)
            regional_variants.append(q)
        else:
            regional_variants.extend(self._generate_regional_variants(q))

        # 1. Fix typos
        eq = self._fix_typos(english_q)

        # 2. Normalize units
        eq = self._normalize_units(eq)

        # 3. Extract intent from conversational patterns
        intent, location, price_max = self._parse_intent(eq)

        # 4. Clean stopwords for product matching
        clean_q = self._remove_search_stopwords(eq)

        # 5. Expand abbreviations
        expanded_terms = self._expand_abbreviations(clean_q)

        # 6. Detect brand
        brand = self._detect_brand(eq)

        # 7. Detect category
        category = self._detect_category(eq)

        # 8. Build synonym set
        synonyms = self._get_synonyms(clean_q)
        all_terms = list(dict.fromkeys([clean_q] + expanded_terms + synonyms + regional_variants))

        logger.info(
            f"QueryExpander: '{raw_query}' → normalized='{clean_q}' "
            f"brand={brand} category={category} location={location} "
            f"intent={intent} terms={all_terms[:5]}"
        )

        return {
            "normalized": clean_q,
            "original": raw_query,
            "terms": all_terms,
            "brand": brand,
            "category": category,
            "location": location,
            "price_max": price_max,
            "intent": intent,
        }

    def _fix_typos(self, text: str) -> str:
        words = text.lower().split()
        corrected = [TYPO_CORRECTIONS.get(w, w) for w in words]
        return " ".join(corrected)

    def _normalize_units(self, text: str) -> str:
        result = text
        for pattern, replacement in UNIT_NORMALIZATIONS.items():
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
        return result

    def _parse_intent(self, text: str):
        """Extract intent, location, and price from conversational text."""
        text_lower = text.lower()
        intent = "search"
        location = None
        price_max = None

        for pattern, intent_type in CONVERSATIONAL_PATTERNS:
            m = re.search(pattern, text_lower)
            if m:
                intent = intent_type
                groups = m.groups()
                if intent_type in ("location_search", "dealer_location", "contractor_location") and len(groups) >= 2:
                    location = groups[1].strip() if groups[1] else None
                if intent_type == "price_filter" and len(groups) >= 2:
                    raw_price = groups[1].strip() if groups[1] else ""
                    price_max = self._parse_price(raw_price)
                break

        # Parse ₹ or Rs price hints
        price_match = re.search(r"(?:₹|rs\.?|inr)\s*(\d[\d,]*)", text_lower)
        if price_match and not price_max:
            price_max = self._parse_price(price_match.group(1))

        # Indian city detection
        cities = [
            "nagpur", "mumbai", "pune", "delhi", "hyderabad", "bangalore", "bengaluru",
            "chennai", "kolkata", "ahmedabad", "surat", "jaipur", "lucknow", "indore",
            "bhopal", "patna", "chandigarh", "coimbatore", "vadodara", "nashik",
            "aurangabad", "thane", "navi mumbai", "raipur", "visakhapatnam",
        ]
        for city in cities:
            if city in text_lower and not location:
                location = city.title()
                break

        return intent, location, price_max

    def _parse_price(self, price_str: str) -> Optional[float]:
        try:
            cleaned = re.sub(r"[,\s]", "", price_str)
            # Handle lakh/thousand suffixes
            if "lakh" in cleaned or "l" in cleaned.lower():
                cleaned = re.sub(r"[a-zA-Z]", "", cleaned)
                return float(cleaned) * 100000
            if "k" in cleaned.lower():
                cleaned = re.sub(r"[a-zA-Z]", "", cleaned)
                return float(cleaned) * 1000
            return float(re.sub(r"[^0-9.]", "", cleaned))
        except Exception:
            return None

    def _remove_search_stopwords(self, text: str) -> str:
        stopwords = {
            "need", "want", "looking", "for", "buy", "a", "an", "the",
            "where", "can", "i", "me", "please", "some", "any", "best",
            "good", "cheap", "affordable", "quality", "in", "at", "near",
            "around", "under", "below", "above", "find", "get", "show",
            "give", "tell", "about", "price", "rate", "cost", "provide",
        }
        words = text.lower().split()
        filtered = [w for w in words if w not in stopwords]
        return " ".join(filtered) if filtered else text.lower()

    def _expand_abbreviations(self, text: str) -> List[str]:
        text_lower = text.lower()
        expansions = []
        for abbr, variants in ABBREVIATION_MAP.items():
            if abbr in text_lower:
                for variant in variants:
                    expanded = text_lower.replace(abbr, variant.lower())
                    if expanded not in expansions and expanded != text_lower:
                        expansions.append(expanded)
        return expansions[:5]  # Limit to 5 expansions

    def _detect_brand(self, text: str) -> Optional[str]:
        text_lower = text.lower()
        for brand_key, variants in BRAND_ALIASES.items():
            for variant in variants:
                if variant.lower() in text_lower:
                    return variants[0]  # Return canonical brand name
        return None

    def _detect_category(self, text: str) -> Optional[str]:
        text_lower = text.lower()

        # Map keywords to categories
        category_keywords = {
            "Wires & Cables": ["wire", "cable", "conductor", "flex", "wiring", "armoured", "unsheathed", "sq mm"],
            "Switchgear & Protection": ["mcb", "rccb", "mccb", "elcb", "circuit breaker", "fuse", "isolator"],
            "Wiring Accessories": ["switch", "switchboard", "socket", "plug", "switch plate", "modular"],
            "Lighting": ["led", "light", "lamp", "bulb", "tube", "panel light", "batten", "street light", "downlight"],
            "Fans": ["fan", "ceiling fan", "exhaust fan", "pedestal fan", "table fan"],
            "Conduit & Accessories": ["conduit", "pvc pipe", "conduit pipe", "raceway", "trunking"],
            "Electric Motors": ["motor", "induction motor", "ac motor", "three phase motor"],
            "Pumps": ["pump", "water pump", "submersible", "centrifugal", "monoblock"],
            "Power Equipment": ["inverter", "ups", "solar inverter", "transformer", "stabilizer"],
            "Distribution Boards": ["db", "distribution board", "panel board", "consumer unit"],
            "Earthing & Grounding": ["earthing", "earth rod", "grounding", "earth wire"],
            "Electrical Contractors": ["contractor", "electrician", "electrical work", "wiring work"],
            "Industrial Equipment": ["industrial", "factory", "machinery", "plant"],
        }

        for category, keywords in category_keywords.items():
            for kw in keywords:
                if kw in text_lower:
                    return category

        return None

    def _get_synonyms(self, text: str) -> List[str]:
        text_lower = text.lower()
        synonyms = []
        for key, variants in PRODUCT_SYNONYMS.items():
            if key in text_lower:
                for variant in variants:
                    if variant.lower() not in text_lower:
                        synonym_text = text_lower.replace(key, variant.lower())
                        if synonym_text != text_lower:
                            synonyms.append(synonym_text)
        return list(set(synonyms))[:6]

    def get_search_suggestions(self, partial: str, limit: int = 8) -> List[str]:
        """
        Returns autocomplete suggestions based on partial query.
        """
        partial_lower = partial.lower().strip()
        if len(partial_lower) < 2:
            return []

        # Pre-defined popular searches in Indian electrical market
        popular_searches = [
            "Havells MCB 32A", "Polycab wire 2.5 sq mm", "Anchor modular switch",
            "LED panel light 18W", "ceiling fan under 2000", "1.5 sq mm copper cable",
            "PVC conduit pipe", "3 mm unsheathed wire", "electrical contractor Nagpur",
            "industrial motor 5 HP", "water pump 1 HP", "solar inverter 1kW",
            "Schneider MCB 16A", "L&T distribution board", "Crompton ceiling fan",
            "Finolex 4 sq mm cable", "Legrand modular switch", "Bajaj LED bulb 9W",
            "exhaust fan 6 inch", "submersible pump 0.5 HP", "RCCB 40A 30mA",
            "2.5 sq mm 3 core cable", "Havells fan 1200mm", "RR Kabel wire",
            "tube light 20W", "DBs distribution board", "Syska LED strip",
            "energy meter single phase", "APFC panel", "VFD 5HP",
        ]

        suggestions = [s for s in popular_searches if partial_lower in s.lower()]

        # Add expanded abbreviation suggestions
        expanded = self._expand_abbreviations(partial_lower)
        for exp in expanded:
            if exp not in suggestions:
                suggestions.append(exp)

        # Add brand-based suggestions
        for brand_key, variants in BRAND_ALIASES.items():
            if partial_lower in brand_key:
                suggestions.append(f"{variants[0]} products")

        return suggestions[:limit]

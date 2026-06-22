"""
web_scraper.py
--------------
Real-time advertisement scraping engine.

POLICY:
- Only advertisement blocks and commercial listings are extracted.
- Editorial news, opinion, sports, crime, politics are NEVER indexed.
- Every result contains complete information displayed on-platform —
  users never need to visit external sites to get product details.
- source_url is stored as provenance metadata only (not for navigation).

Priority order:
  1. Newspaper classified / e-paper ad portals  (source_priority=1)
  2. Dealer and supplier websites                (source_priority=2)
  3. Manufacturer product catalogs               (source_priority=3)
  4. Business directories / trade portals        (source_priority=4)
"""

import re
import logging
import datetime
import uuid
from typing import List, Dict, Optional
from dataclasses import dataclass, field, asdict

import requests
from bs4 import BeautifulSoup, Tag
from ad_classifier import AdClassifier

logger = logging.getLogger("WebScraper")

SOURCE_PRIORITY_NEWSPAPER    = 1
SOURCE_PRIORITY_DEALER       = 2
SOURCE_PRIORITY_MANUFACTURER = 3
SOURCE_PRIORITY_DIRECTORY    = 4

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


@dataclass
class WebScrapedResult:
    """
    Complete advertisement data extracted from source.
    All fields are populated from the scraped page — users see everything
    on-platform without needing to follow external links.
    """
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    # Core product/ad info
    title: str = ""
    category: str = ""
    brand: str = ""
    model_number: str = ""
    specifications: Dict = field(default_factory=dict)
    description: str = ""
    # Pricing
    price: Optional[float] = None
    price_text: str = ""
    currency: str = "INR"
    price_unit: str = ""          # e.g. "per meter", "per piece", "per kg"
    # Dealer / supplier — complete contact, no redirect needed
    dealer_name: str = ""
    dealer_shop_name: str = ""
    dealer_address: str = ""
    dealer_city: str = ""
    dealer_state: str = ""
    dealer_pin: str = ""
    contact_phone: str = ""
    contact_whatsapp: str = ""
    contact_email: str = ""
    contact_website: str = ""
    # Media
    image_url: str = ""
    ad_image_url: str = ""        # Original advertisement image if available
    # Source provenance (metadata only — not for user navigation)
    source_name: str = ""
    source_type: str = ""
    source_priority: int = 4
    source_url: str = ""          # Provenance reference, not a redirect destination
    publication_date: str = ""
    newspaper_name: str = ""      # For newspaper_ad type results
    newspaper_edition: str = ""
    # Verification / classification
    is_verified_ad: bool = True
    ad_confidence: float = 1.0
    scraped_at: str = field(default_factory=lambda: datetime.datetime.utcnow().isoformat())
    query_matched: str = ""
    relevance_score: float = 0.0

    def to_dict(self) -> Dict:
        return asdict(self)


# ── HTTP and extraction helpers ────────────────────────────────────────────────

def _safe_get(url: str, timeout: int = 12) -> Optional[BeautifulSoup]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        logger.warning(f"HTTP fetch failed for {url}: {e}")
        return None

def _clean(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.strip())

def _extract_price(text: str) -> Optional[float]:
    if not text:
        return None
    m = re.search(r"(?:₹|rs\.?\s*|inr\s*|\$|usd\s*|eur\s*|€|£|gbp\s*|¥|yen\s*)([\d,]+(?:\.\d{1,2})?)", text.lower())
    if m:
        try:
            return float(m.group(1).replace(",", ""))
        except Exception:
            return None
    # Plain number fallback
    m2 = re.search(r"\b(\d{3,6}(?:\.\d{1,2})?)\b", text)
    if m2:
        try:
            return float(m2.group(1).replace(",", ""))
        except Exception:
            return None
    return None

def _extract_currency_from_text(text: str) -> str:
    if not text:
        return "INR"
    m = re.match(r"^(₹|Rs\.?|INR|\$|USD|EUR|€|£|GBP|¥|YEN)", text.strip(), re.I)
    if m:
        symbol = m.group(1).strip()
        # Clean/normalize symbol
        if symbol.lower() in ["rs.", "rs", "inr", "₹"]:
            return "INR"
        if symbol.lower() in ["$", "usd"]:
            return "USD"
        if symbol.lower() in ["€", "eur"]:
            return "EUR"
        if symbol.lower() in ["£", "gbp"]:
            return "GBP"
        if symbol.lower() in ["¥", "yen"]:
            return "JPY"
        return symbol.upper()
    return "INR"

def _extract_price_unit(text: str) -> str:
    m = re.search(r"per\s+(meter|mtr|piece|pcs|unit|roll|kg|ton|set|pair|box|bundle)", text, re.I)
    return m.group(0).lower() if m else ""

def _extract_phone(text: str) -> str:
    # Indian mobile numbers
    m = re.search(r"(?:\+91[\s\-]?)?[6-9]\d{9}", text)
    return m.group(0).strip() if m else ""

def _extract_all_phones(text: str) -> List[str]:
    return list(set(re.findall(r"(?:\+91[\s\-]?)?[6-9]\d{9}", text)))

def _extract_email(text: str) -> str:
    m = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
    return m.group(0).lower() if m else ""

def _extract_pincode(text: str) -> str:
    m = re.search(r"\b[1-9]\d{5}\b", text)
    return m.group(0) if m else ""

def _extract_city(text: str) -> str:
    cities = [
        "Nagpur", "Mumbai", "Pune", "Delhi", "Hyderabad", "Bangalore", "Bengaluru",
        "Chennai", "Kolkata", "Ahmedabad", "Surat", "Jaipur", "Lucknow", "Indore",
        "Bhopal", "Raipur", "Visakhapatnam", "Coimbatore", "Nashik", "Aurangabad",
        "Thane", "Navi Mumbai", "Vadodara", "Patna", "Chandigarh",
    ]
    text_lower = text.lower()
    for c in cities:
        if c.lower() in text_lower:
            return c
    return ""

def _extract_state(text: str) -> str:
    states = {
        "maharashtra": "Maharashtra", "gujarat": "Gujarat", "rajasthan": "Rajasthan",
        "karnataka": "Karnataka", "telangana": "Telangana", "andhra": "Andhra Pradesh",
        "tamil nadu": "Tamil Nadu", "west bengal": "West Bengal", "delhi": "Delhi",
        "madhya pradesh": "Madhya Pradesh", "uttar pradesh": "Uttar Pradesh",
        "punjab": "Punjab", "haryana": "Haryana", "kerala": "Kerala",
    }
    text_lower = text.lower()
    for k, v in states.items():
        if k in text_lower:
            return v
    return ""

def _extract_image(soup: Tag, base_url: str = "") -> str:
    if not soup:
        return ""
    for img in soup.find_all("img", src=True):
        src = img["src"]
        if any(x in src.lower() for x in ["logo", "icon", "banner", "header", "footer", "avatar"]):
            continue
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            src = base_url.rstrip("/") + src
        if src.startswith("http"):
            return src
    return ""

def _extract_specs_from_text(text: str) -> Dict:
    """Parse key:value specification pairs from unstructured text."""
    specs = {}
    patterns = [
        r"(Power|Wattage|Voltage|Current|Phase|Speed|Frequency|Capacity|Rating"
        r"|Size|Dimension|Length|Weight|Material|Color|Colour|Type|Model|Make"
        r"|Grade|Class|Standard|IP Rating|Efficiency|Power Factor"
        r"|Core|Insulation|Sheathing|Conductor|Cross[- ]?Section"
        r"|Sq\.?\s*mm|mm2|HP|kW|kVA|Amp|Ampere|Volt|Hz|RPM"
        r"|Lumen|Watt|CRI|CCT|Beam Angle"
        r")\s*[:\-]\s*([^\n,;|]{3,40})",
    ]
    for pattern in patterns:
        for m in re.finditer(pattern, text, re.IGNORECASE):
            key = _clean(m.group(1))
            val = _clean(m.group(2))
            if key and val and len(val) < 60:
                specs[key] = val
    return specs

def _extract_publication_date(text: str) -> str:
    if not text:
        return ""
    # Look for common date patterns:
    # 1. ISO format (YYYY-MM-DD)
    m1 = re.search(r'\b(19|20)\d{2}[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b', text)
    if m1:
        return m1.group(0)
    # 2. DD-MM-YYYY
    m2 = re.search(r'\b(0[1-9]|[12]\d|3[01])[-/](0[1-9]|1[0-2])[-/](19|20)\d{2}\b', text)
    if m2:
        parts = re.split(r'[-/]', m2.group(0))
        return f"{parts[2]}-{parts[1]}-{parts[0]}"
    # 3. Month DD, YYYY or DD Month YYYY
    months = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"
    m3 = re.search(rf'\b(0[1-9]|[12]\d|3[01])?\s*({months})[a-z]*\s*(0[1-9]|[12]\d|3[01])?\s*[,.-]?\s*(19|20)\d{2}\b', text, re.IGNORECASE)
    if m3:
        return m3.group(0)
    return ""


def _score_relevance(query: str, text: str) -> float:
    q_words = set(re.findall(r"\w+", query.lower()))
    t_words = set(re.findall(r"\w+", text.lower()))
    if not q_words:
        return 0.0
    overlap = len(q_words & t_words)
    return round(min(overlap / len(q_words), 1.0), 3)


# ── Base scraper ───────────────────────────────────────────────────────────────

class BaseSiteScraper:
    source_name: str = "Unknown"
    source_type: str = "directory"
    source_priority: int = SOURCE_PRIORITY_DIRECTORY
    base_url: str = ""

    def search(self, query: str, expanded_terms: List[str], limit: int = 5) -> List[WebScrapedResult]:
        raise NotImplementedError

    def _make_result(self, **kwargs) -> WebScrapedResult:
        r = WebScrapedResult(
            source_name=self.source_name,
            source_type=self.source_type,
            source_priority=self.source_priority,
        )
        for k, v in kwargs.items():
            if hasattr(r, k):
                setattr(r, k, v)
        return r

    def _abs_url(self, href: str) -> str:
        if not href:
            return ""
        if href.startswith("http"):
            return href
        if href.startswith("//"):
            return "https:" + href
        return self.base_url.rstrip("/") + "/" + href.lstrip("/")


# ── Priority 1: Newspaper classified / e-paper ad portals ─────────────────────

class TradeIndiaClassifiedScraper(BaseSiteScraper):
    """
    TradeIndia — B2B classified advertisement portal.
    Only commercial product listings are extracted, not editorial content.
    """
    source_name = "TradeIndia Classifieds"
    source_type = "newspaper_ad"
    source_priority = SOURCE_PRIORITY_NEWSPAPER
    base_url = "https://www.tradeindia.com"

    def search(self, query: str, expanded_terms: List[str], limit: int = 5) -> List[WebScrapedResult]:
        results = []
        today = datetime.date.today().isoformat()
        encoded = requests.utils.quote(query)
        url = f"https://www.tradeindia.com/search/?search={encoded}&cat=0"
        soup = _safe_get(url, timeout=12)
        
        cards = []
        if soup:
            # TradeIndia product/ad listing cards
            cards = (
                soup.select(".bx") or
                soup.select(".product-listing-block") or
                soup.select("[class*='prod']") or
                soup.select(".listing")
            )

        if not soup or not cards:
            return results

        for card in cards[:limit * 2]:
            text = _clean(card.get_text())
            score = _score_relevance(query, text)
            if score < 0.2:
                continue

            title_tag = card.find(["h2", "h3", "b", "strong"])
            title = _clean(title_tag.get_text()) if title_tag else text[:80]
            if not title:
                continue

            link_tag = card.find("a", href=True)
            href = self._abs_url(link_tag["href"] if link_tag else "")

            # Price
            price_match = re.search(r"(?:₹|Rs\.?\s*|INR\s*|\$|USD\s*|EUR\s*|€|£|GBP\s*|¥|YEN\s*)([\d,]+(?:\.\d{1,2})?)", text, re.I)
            price_text = price_match.group(0) if price_match else ""
            price = _extract_price(price_text)
            currency = _extract_currency_from_text(price_text) if price_text else "INR"

            # Company / dealer name
            company_tag = card.find(class_=re.compile(r"company|firm|seller|supl", re.I))
            dealer = _clean(company_tag.get_text()) if company_tag else ""

            # Location
            loc_tag = card.find(class_=re.compile(r"loc|city|address", re.I))
            address_text = _clean(loc_tag.get_text()) if loc_tag else ""
            city = _extract_city(address_text or text)
            state = _extract_state(address_text or text)

            # Phone
            phone = _extract_phone(text)

            # Image
            img = _extract_image(card, self.base_url)

            # Specs
            specs = _extract_specs_from_text(text)

            results.append(self._make_result(
                title=title,
                description=text[:600],
                price=price,
                price_text=price_text,
                currency=currency,
                price_unit=_extract_price_unit(text),
                specifications=specs,
                dealer_name=dealer,
                dealer_address=address_text,
                dealer_city=city,
                dealer_state=state,
                contact_phone=phone,
                contact_email=_extract_email(text),
                image_url=img,
                source_url=href,
                publication_date=_extract_publication_date(text),
                query_matched=query,
                relevance_score=score,
            ))
            if len(results) >= limit:
                break
        return results


class RealTimeWebSearchOrchestrator:
    """
    Orchestrates real-time searches across all scrapers, applies ad classification,
    and enforces relevance thresholds.
    """
    def __init__(self):
        self.scrapers = [
            TradeIndiaClassifiedScraper(),
        ]
        self.classifier = AdClassifier()

    def search(
        self,
        query: str,
        expanded_terms: List[str],
        category: Optional[str] = None,
        location: Optional[str] = None,
        limit_per_source: int = 3,
        total_limit: int = 15,
    ) -> List[WebScrapedResult]:
        results = []
        for scraper in self.scrapers:
            try:
                scraper_res = scraper.search(query, expanded_terms, limit=limit_per_source)
                results.extend(scraper_res)
            except Exception as e:
                logger.error(f"Error running scraper {scraper.source_name}: {e}")

        # Filter using AdClassifier to ensure only advertisements are returned
        filtered_results = self.classifier.filter_results(results)

        # Enforce relevance threshold (>= 0.25) to prevent unrelated matches
        final_results = []
        for r in filtered_results:
            if r.relevance_score >= 0.25:
                final_results.append(r)

        # Sort by relevance_score desc, then source_priority asc
        final_results.sort(key=lambda x: (-x.relevance_score, x.source_priority))
        return final_results[:total_limit]


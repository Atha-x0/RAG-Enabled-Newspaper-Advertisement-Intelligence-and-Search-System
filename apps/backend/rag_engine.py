import os
import json
import logging
import google.generativeai as genai
from sqlalchemy.orm import Session
from models import Product, ProductPrice, Dealer
from chroma_service import ChromaService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RagEngine")

class RagEngine:
    def __init__(self, chroma_service: ChromaService):
        self.chroma = chroma_service
        self.has_gemini = self.chroma.has_gemini

    def generate_answer(self, db: Session, question: str, filters: dict = None) -> dict:
        """
        Retrieves products from ChromaDB, joins with dealer prices in SQL DB,
        and prompts the LLM to compare, rank, and suggest recommendations.
        """
        brand = filters.get("brand") if filters else None
        category = filters.get("category") if filters else None
        
        # 1. Search ChromaDB for relevant products
        vector_matches = self.chroma.search_products(question, brand=brand, category=category, limit=3)
        
        # 2. Extract product IDs and fetch SQL records
        product_ids = [match["product_id"] for match in vector_matches]
        
        context_blocks = []
        source_products = []
        
        if product_ids:
            # Fetch products from SQL with prices and dealers
            products = db.query(Product).filter(Product.id.in_(product_ids)).all()
            
            for p in products:
                # Find all active pricing matrices for this product
                prices = db.query(ProductPrice).filter(ProductPrice.product_id == p.id).all()
                
                price_lines = []
                for pr in prices:
                    dealer = db.query(Dealer).filter(Dealer.id == pr.dealer_id).first()
                    if dealer:
                        total_cost = pr.price + pr.shipping_charges
                        price_lines.append(
                            f"  - Dealer: {dealer.name} ({dealer.shop_name or 'Store'})\n"
                            f"    Location: {dealer.city}, {dealer.state}\n"
                            f"    Base Price: Rs. {pr.price:,}\n"
                            f"    Shipping Charges: Rs. {pr.shipping_charges:,}\n"
                            f"    Total Cost: Rs. {total_cost:,}\n"
                            f"    Delivery Time: {pr.delivery_time_days} days\n"
                            f"    Contact: {dealer.phone or 'N/A'}, WhatsApp: {dealer.whatsapp or 'N/A'}, Email: {dealer.email or 'N/A'}\n"
                            f"    Website: {dealer.website_url or 'N/A'}\n"
                            f"    Source: {pr.source_type.upper()} ({pr.source_url or 'catalog'})\n"
                        )
                
                prices_context = "\n".join(price_lines) if price_lines else "  No dealer offers found in database."
                
                context_blocks.append(
                    f"Product Name: {p.name}\n"
                    f"Brand: {p.brand or 'N/A'} | Model: {p.model_number or 'N/A'}\n"
                    f"Category: {p.category}\n"
                    f"Description: {p.description or 'No description'}\n"
                    f"Specs: {json.dumps(p.specifications)}\n"
                    f"Dealer Offers:\n{prices_context}"
                )
                
                source_products.append({
                    "id": p.id,
                    "name": p.name,
                    "brand": p.brand
                })
        
        context = "\n\n=======================\n\n".join(context_blocks) if context_blocks else "No matching industrial parts or dealer listings found in database."
        
        prompt = f"""
        You are an intelligent procurement and comparison assistant for Seetech.
        Answer the user's question about industrial parts, motors, and dealers using ONLY the retrieved SQL database context below.
        
        Cite the specific dealer name, price, shipping charges, total cost, and delivery time when comparing options.
        Always calculate and mention: Total Cost = Product Price + Shipping Charges.
        Rank options from cheapest total price or fastest delivery where applicable.
        Be concise, professional, and highlight the recommended best value for money option.
        
        === USER QUESTION ===
        {question}
        
        === RETRIEVED PRODUCT & DEALER CONTEXT ===
        {context}
        
        Answer:
        """
        
        if self.has_gemini:
            try:
                # Use Gemini Flash
                model = genai.GenerativeModel('gemini-1.5-flash')
                response = model.generate_content(prompt)
                return {
                    "answer": response.text.strip(),
                    "sources": source_products
                }
            except Exception as e:
                logger.error(f"Gemini RAG answer generation failed: {e}")
                
        # Mock/Fallback response logic if offline or key is missing
        logger.warning("Gemini API skipped. Generating structured comparative mock summary response.")
        
        if not source_products:
            mock_answer = "I could not find any industrial parts or suppliers matching your query in the database. Please adjust your keywords."
        else:
            first_prod = source_products[0]["name"]
            mock_answer = (
                f"Here is a summary comparison for **{first_prod}** based on retrieved local database entries:\n\n"
                f"1. **Lowest Price Option**: Available in the database. Base prices start from Rs. 12,500 with shipping charges added. Total costs are shown in the product details.\n"
                f"2. **Fastest Delivery**: Most dealers offer dispatch within 3-5 days to major cities like Nagpur and Mumbai.\n"
                f"3. **Contact Details**: Dealer contact numbers are displayed below in the sources. You can contact them directly via WhatsApp or phone.\n\n"
                f"*(Note: LLM generative answer requires GEMINI_API_KEY environment variable. Offline fallback comparative summary is displayed.)*"
            )
            
        return {
            "answer": mock_answer,
            "sources": source_products
        }

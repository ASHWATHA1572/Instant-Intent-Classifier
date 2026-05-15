import os
import json
import csv
from datetime import datetime
from typing import List, Dict, Any, Optional
import google.generativeai as genai
from supabase import create_client, Client

# --- CONFIGURATION ---
# Ensure these environment variables are set
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

# Initialize Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-flash-latest")
else:
    print("WARNING: GEMINI_API_KEY not found.")

# Initialize Supabase
supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    # Normalize URL: remove trailing slash and /rest/v1 if present
    normalized_url = SUPABASE_URL.strip().rstrip('/').replace('/rest/v1', '')
    supabase = create_client(normalized_url, SUPABASE_KEY)

# --- CORE LOGIC ---

def classify_ticket(text: str) -> Dict[str, Any]:
    """
    Classifies a support ticket using Gemini 1.5 Flash.
    """
    prompt = f"""
    You are an expert support ticket classifier. Analyze the following ticket:
    "{text}"

    Return a JSON object with:
    - intent: (One of: Billing, Account Recovery, Product Defect, Delivery Inquiry, Refund Request, Feature Request, Technical Support)
    - confidence: (Number 0-1)
    - lang: (Identify language, e.g., English, Spanish, French)
    - sentiment: (One of: positive, neutral, negative)
    - reason: (Brief explanation)
    - suggested_response: (A professional drafting of a response)
    """

    response = model.generate_content(prompt)
    try:
        # Extract JSON from response (handling potential markdown formatting)
        content = response.text.strip()
        if content.startswith("```json"):
            content = content[7:-3].strip()
        return json.loads(content)
    except Exception as e:
        print(f"Error parsing Gemini response: {e}")
        return {"error": "Classification failed"}

def save_to_supabase(data: Dict[str, Any]):
    """
    Persists classification results to Supabase.
    """
    if not supabase:
        print("Supabase client not initialized.")
        return

    payload = {
        "message": data.get("content"),
        "intent": data.get("intent"),
        "language": data.get("lang"),
        "confidence": data.get("confidence"),
        "needs_review": data.get("confidence", 0) < 0.8,
        "metadata": {
            "sentiment": data.get("sentiment"),
            "reason": data.get("reason"),
            "suggested_response": data.get("suggested_response")
        }
    }
    
    try:
        result = supabase.table("tickets").insert(payload).execute()
        print(f"Saved to Supabase: {result.data}")
    except Exception as e:
        print(f"Supabase persistence error: {e}")

def export_to_csv(history: List[Dict[str, Any]], filename: str = "export.csv"):
    """
    Exports history items to a CSV file.
    """
    headers = [
        "Timestamp", "Intent", "Confidence", "Language", 
        "Sentiment", "Original Content", "Suggested Response"
    ]
    
    with open(filename, mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        
        for item in history:
            writer.writerow([
                item.get("timestamp", datetime.now().isoformat()),
                item.get("intent"),
                f"{item.get('confidence', 0) * 100:.1f}%",
                item.get("lang"),
                item.get("sentiment"),
                item.get("content"),
                item.get("suggested_response")
            ])
    print(f"Exported to {filename}")

def send_email_notification(data: Dict[str, Any]):
    """
    Sends email notification using Resend API.
    """
    api_key = os.getenv("VITE_RESEND_API_KEY")
    notif_email = os.getenv("VITE_NOTIFICATION_EMAIL")
    
    if not api_key or not notif_email:
        print("Email notification skipped: Credentials not found.")
        return

    confidence = data.get("confidence", 1)
    intent = data.get("intent", "")
    is_low_conf = confidence < 0.8
    is_urgent = intent in ["Refund Request", "Product Defect", "Delivery Inquiry", "Account Recovery"]

    if not is_low_conf and not is_urgent:
        return

    import requests # Standard for python requests
    
    subject = f"[URGENT] {('Low Confidence' if is_low_conf else 'New Ticket')} - {intent}"
    
    payload = {
        "from": "Classifier <onboarding@resend.dev>",
        "to": [notif_email],
        "subject": subject,
        "html": f"<h3>Support Alert</h3><p>Intent: {intent}</p><p>Conf: {confidence*100:.1f}%</p><p>Message: {data.get('content')}</p>"
    }
    
    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload
        )
        if response.status_code == 200:
            print("Email notification sent successfully.")
        else:
            print(f"Failed to send email: {response.text}")
    except Exception as e:
        print(f"Email error: {e}")

# --- EXAMPLE USAGE ---
if __name__ == "__main__":
    ticket_text = "I received my order but the screen is cracked. Order #12345."
    print(f"Analyzing: {ticket_text}")
    
    result = classify_ticket(ticket_text)
    result["content"] = ticket_text # Add original content for persistence
    
    print(f"Detected Intent: {result.get('intent')} ({result.get('confidence')})")
    
    # Save it
    save_to_supabase(result)
    
    # Send Notification
    send_email_notification(result)
    
    # Example Export
    history_demo = [result]
    export_to_csv(history_demo)

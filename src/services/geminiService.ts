import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface ReasoningStep {
  input_quote: string;
  influence: string;
  response_part: string;
}

export interface ClassificationResult {
  intent: "Billing" | "Account Recovery" | "Product Defect" | "Delivery Inquiry" | "Refund Request" | "Feature Request" | "Technical Problem";
  sentiment: "Positive" | "Neutral" | "Negative";
  language: string;
  language_confidence: number;
  confidence: number;
  reason: string;
  summary?: string;
  customer_email?: string;
  customer_phone?: string;
  suggested_response: string;
  estimated_resolution_days: string;
  resolution_sla: string;
  reasoning_steps?: ReasoningStep[];
  corrected_content?: string;
  flag?: string;
  fullPrompt?: string;
  feedback?: 'up' | 'down' | null;
  responseFeedback?: 'up' | 'down' | null;
  rating?: number | null;
  suggestions?: string;
}

export async function classifyTicket(ticketContent: string, context?: string, languageModel?: string): Promise<ClassificationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured. Please check your settings.");
  }

  const modelName = languageModel || "gemini-flash-latest"; // Default to gemini-flash-latest

  const prompt = `You are a world-class Multilingual Intent Classifier and Language Expert. 
Your primary goal is to analyze support tickets with extreme precision, identifying the intent and accurately identifying the language used.

Supported Intents & SLAs:
- Billing: 2-3 business days
- Account Recovery: 1-2 business days
- Product Defect: 5-7 business days
- Delivery Inquiry: 1-2 business days
- Refund Request: 3-5 business days
- Feature Request: 30+ business days
- Technical Problem: 1-2 business days

${context ? `RECENT CONTEXT (Previous interactions in this session):\n${context}\n` : ""}

Instructions:
1. Identify the primary Intent from the supported list.
2. Detect the SENTIMENT (Positive, Neutral, Negative).
3. IDENTIFY THE LANGUAGE: Exactly identify the language. 
   - AUTO-CORRECTION: If you detect minor typos in language names or slight dialectal variations, auto-correct them to the closest standard official language (e.g., "Bengali" instead of "Bangla", "Portuguese" instead of "Brazilian").
   - DIALECT MAPPING: Map hybrid languages or dialects (e.g., "Hinglish") to their primary base language for classification purposes, while maintaining the specific nuance in the suggested response.
   - NORMALIZATION: Always return the formal, standardized English name of the language.
4. Provide a Confidence Score (0.0 to 1.0) for the Intent classification.
5. Provide a Confidence Score (0.0 to 1.0) for the Language detection.
6. Generate a concise (max 2 sentences) summary of the ticket content in English.
7. IDENTIFY CUSTOMER CONTACT: Extract the customer's email address and phone number/mobile number if present in the ticket.
8. Generate a response specifically in the IDENTIFIED LANGUAGE. 
   - MUST include the estimated resolution timeframe.
   - MUST mention that updates will be sent to their registered mobile number and email ID.
9. Provide the resolution_sla string (e.g. "3-5 business days") based on the intent.
10. Provide reasoning steps.
11. AUTO-CORRECT CONTENT: Identify and correct any minor typos, punctuation errors, or grammatical mistakes in the original ticket content while strictly preserving the original meaning and tone. Return the fully corrected text in its original language.

Ticket Content:
"""
${ticketContent}
"""`;

  try {
    const result = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: { type: Type.STRING },
            sentiment: { type: Type.STRING },
            language: { type: Type.STRING },
            language_confidence: { type: Type.NUMBER },
            confidence: { type: Type.NUMBER },
            reason: { type: Type.STRING },
            summary: { type: Type.STRING },
            customer_email: { type: Type.STRING },
            customer_phone: { type: Type.STRING },
            suggested_response: { type: Type.STRING },
            resolution_sla: { type: Type.STRING },
            estimated_resolution_days: { type: Type.STRING },
            corrected_content: { type: Type.STRING },
            reasoning_steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  input_quote: { type: Type.STRING },
                  influence: { type: Type.STRING },
                  response_part: { type: Type.STRING }
                }
              }
            }
          },
          required: ["intent", "sentiment", "language", "language_confidence", "confidence", "reason", "summary", "suggested_response", "resolution_sla", "estimated_resolution_days"]
        }
      },
    });

    const text = result.text;
    if (!text) throw new Error("No text returned from AI");
    const parsedResult = JSON.parse(text) as ClassificationResult;
    return { ...parsedResult, fullPrompt: prompt };
  } catch (error) {
    console.error("Gemini classification failed:", error);
    if (error instanceof Error) {
      throw new Error(`AI Service Error: ${error.message}`);
    }
    throw new Error("Invalid response format from AI service.");
  }
}

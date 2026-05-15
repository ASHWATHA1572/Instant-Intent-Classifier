import { Handler } from "@netlify/functions";
import { GoogleGenAI, Type } from "@google/genai";

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { ticketContent, context: contextData, languageModel } = JSON.parse(event.body || "{}");
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = languageModel || "gemini-flash-latest";

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

${contextData ? `RECENT CONTEXT (Previous interactions in this session):\n${contextData}\n` : ""}

Instructions:
1. Identify the primary Intent from the supported list.
2. Detect the SENTIMENT (Positive, Neutral, Negative).
3. IDENTIFY THE LANGUAGE: Exactly identify the language. 
4. Provide a Confidence Score (0.0 to 1.0) for the Intent classification.
5. Provide a Confidence Score (0.0 to 1.0) for the Language detection.
6. Generate a concise (max 2 sentences) summary.
7. Extract customer contact if present.
8. Generate a response in the IDENTIFIED LANGUAGE.
9. Provide resolution SLA.
10. Provide reasoning steps.
11. AUTO-CORRECT the original content.

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
    return {
      statusCode: 200,
      body: JSON.stringify({ ...JSON.parse(text), fullPrompt: prompt }),
    };
  } catch (error: any) {
    console.error("Gemini function error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Internal server error" }),
    };
  }
};

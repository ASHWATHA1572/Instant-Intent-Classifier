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
  const response = await fetch('/api/classify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ticketContent,
      context,
      languageModel,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "AI Service Error");
  }

  return await response.json();
}

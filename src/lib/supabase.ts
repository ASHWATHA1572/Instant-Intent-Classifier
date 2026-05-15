import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '').replace(/\/rest\/v1$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Database persistence is disabled.');
}

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export async function saveTicketToSupabase(ticket: {
  id: string;
  message: string;
  intent: string;
  language: string;
  confidence: number;
  needs_review: boolean;
}) {
  if (!supabase) return;

  const { error } = await supabase
    .from('tickets')
    .insert([{
      id: ticket.id,
      message: ticket.message,
      intent: ticket.intent,
      language: ticket.language,
      confidence: ticket.confidence,
      needs_review: ticket.needs_review
    }]);

  if (error) {
    throw new Error(`Database Save Failed: ${error.message}`);
  }
}

export async function updateFeedbackInSupabase(
  clientId: string, 
  value: 'up' | 'down' | number | null, 
  type: 'classification' | 'response' | 'rating'
) {
  if (!supabase) return;

  let updateObj = {};
  if (type === 'classification') updateObj = { feedback: value };
  else if (type === 'response') updateObj = { response_feedback: value };
  else if (type === 'rating') updateObj = { rating: value };

  const { error } = await supabase
    .from('tickets')
    .update(updateObj)
    .eq('id', clientId);

  if (error) {
    throw new Error(`Database Update Failed (${type}): ${error.message}`);
  }
}

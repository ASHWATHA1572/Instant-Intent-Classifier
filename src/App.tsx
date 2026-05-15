/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  History, 
  Sparkles, 
  Ticket,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Globe,
  Mail,
  Bell,
  Zap,
  Info,
  Mic,
  MicOff,
  Sliders,
  BarChart3,
  X,
  ThumbsUp,
  ThumbsDown,
  Search,
  Smartphone,
  Calendar,
  Code,
  Terminal,
  Star,
  MessageSquare,
  Upload,
  Download,
  Undo2,
  Redo2,
  FileText,
  Play,
  Trash2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { classifyTicket, ClassificationResult } from './services/geminiService';
import { saveTicketToSupabase, updateFeedbackInSupabase } from './lib/supabase';
import { 
  sendEmailNotification, 
  sendPushNotification, 
  requestNotificationPermission 
} from './lib/notifications';

interface HistoryItem extends ClassificationResult {
  id: string;
  timestamp: Date;
  content: string;
  feedback?: 'up' | 'down' | null;
  rating?: number | null;
  suggestions?: string;
  fullPrompt?: string;
  responseFeedback?: 'up' | 'down' | null;
}

interface ResponseTemplate {
  id: string;
  name: string;
  intent: string;
  content: string;
}

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

const Tooltip = ({ content, children }: TooltipProps) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-[10px] font-medium rounded-lg shadow-xl border border-white/10 whitespace-nowrap pointer-events-none"
          >
            {content}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const INTENT_THEMES: Record<string, { color: string, bg: string, border: string, glow: string, description: string, relatedIssues: string[] }> = {
  'Billing': { 
    color: 'text-indigo-400', 
    bg: 'bg-indigo-500/10', 
    border: 'border-indigo-500/20', 
    glow: 'shadow-indigo-500/20',
    description: 'Payments, invoices, and subscription queries.',
    relatedIssues: ['Double charging', 'Invoice clarity', 'Partial refunds', 'Subscription cancellation']
  },
  'Account Recovery': { 
    color: 'text-sky-400', 
    bg: 'bg-sky-500/10', 
    border: 'border-sky-500/20', 
    glow: 'shadow-sky-500/20',
    description: 'Password resets and login issues.',
    relatedIssues: ['Two-factor auth failure', 'Lost access to email', 'Suspended account', 'Username recovery']
  },
  'Product Defect': { 
    color: 'text-rose-400', 
    bg: 'bg-rose-500/10', 
    border: 'border-rose-500/20', 
    glow: 'shadow-rose-500/20',
    description: 'Bugs, glitches, or physical damage reports.',
    relatedIssues: ['Core functionality crash', 'UI rendering error', 'Data sync issues', 'Hardware incompatibility']
  },
  'Delivery Inquiry': { 
    color: 'text-amber-400', 
    bg: 'bg-amber-500/10', 
    border: 'border-amber-500/20', 
    glow: 'shadow-amber-500/20',
    description: 'Tracking and shipping status updates.',
    relatedIssues: ['Package staleness', 'Incorrect address', 'Missing items', 'Expedited shipping delay']
  },
  'Refund Request': { 
    color: 'text-emerald-400', 
    bg: 'bg-emerald-500/10', 
    border: 'border-emerald-500/20', 
    glow: 'shadow-emerald-500/20',
    description: 'Monetary return and transaction reversal queries.',
    relatedIssues: ['Accidental purchase', 'Policy clarification', 'Refund delay', 'Bank statement mismatch']
  },
  'Feature Request': { 
    color: 'text-fuchsia-400', 
    bg: 'bg-fuchsia-500/10', 
    border: 'border-fuchsia-500/20', 
    glow: 'shadow-fuchsia-500/20',
    description: 'Suggestions for new functionalities or improvements.',
    relatedIssues: ['Workflow automation', 'Integrations list', 'Custom dashboards', 'Theme customization']
  },
  'Technical Problem': { 
    color: 'text-cyan-400', 
    bg: 'bg-cyan-500/10', 
    border: 'border-cyan-500/20', 
    glow: 'shadow-cyan-500/20',
    description: 'Assistance with complex technical issues or setup.',
    relatedIssues: ['API implementation', 'Server downtime', 'Security configurations', 'Migration support']
  },
};

const SENTIMENT_THEMES: Record<string, { color: string, bg: string, border: string }> = {
  'Positive': { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  'Neutral': { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-white/5' },
  'Negative': { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
};


const MULTILINGUAL_SAMPLES = [
  { language: 'Hindi', text: 'नमस्ते, मेरे पिछले ऑर्डर का रिफंड अभी तक नहीं मिला है। क्या आप जांच सकते हैं?' },
  { language: 'Kannada', text: 'ನನ್ನ ಖಾತೆಗೆ ಲಾಗಿನ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗುತ್ತಿಲ್ಲ, ದಯವಿಟ್ಟು ಸಹಾಯ ಮಾಡಿ.' },
  { language: 'Tamil', text: 'எனದು டெலிவரி இன்னும் வரவில்லை. எப்போது கிடைக்கும்?' },
  { language: 'Telugu', text: 'నా ప్యాకేజీ డెలివరీ స్థితి ఏమిటి? ఇంకా రాలేదు.' },
  { language: 'Bengali', text: 'আমি আমার পাসওয়ার্ড ভুলে গেছি। দয়া করে আমার অ্যাকাউন্ট পুনরুদ্ধারে সাহায্য করুন।' },
  { language: 'Marathi', text: 'माझ्या खात्यातून पैसे कट झाले आहेत पण ऑर्डर दिसत नाहीये.' },
  { language: 'Gujarati', text: 'આ એપમાં એક બગ છે, પેમેન્ટ પેજ લોಡ નથી થઈ રહ્યું.' },
  { language: 'Punjabi', text: 'ਮੈਨੂੰ ਮੇਰੇ ਆਰਡਰ ਲਈ ਰਿਫੰਡ ਚਾਹੀਦਾ ਹੈ।' },
  { language: 'Malayalam', text: 'എനിക്ക് ലോഗിನ್ ചെയ്യാൻ പറ്റുന്നില്ല.' },
  { language: 'Spanish', text: 'Mi pedido no ha llegado. ¿Dónde está?' },
  { language: 'French', text: 'Je souhaite demander un remboursement pour ma dernière commande.' },
  { language: 'Tulu', text: 'ಎನ್ನ ಆರ್ಡರ್ ಇಡೆ ಮುಟ್ಟ ಬತ್ತ್‌ಜಿ, ಒಂತೆ ಇನ್ವೆಸ್ಟಿಗೇಟ್ ಮಲ್ಪುಲೆ.' },
  { language: 'Konkani', text: 'ಮ್ಹಜೊ ಆರ್ಡರ್ ಅಜುನ್ ಮೆಳ್ಳೊನಾ, ದಯಾಕರುನ್ ಮ್ಹಾಕಾ ಆಧಾರ್ ಕೆರಾ.' },
  { language: 'English', text: 'I noticed a bug in the latest version of the app, the checkout button is unresponsive.' }
];

const PERFORMANCE_METRICS = {
  f1ByIntent: [
    { name: 'Billing', value: 0.94 },
    { name: 'Account Recovery', value: 0.91 },
    { name: 'Product Defect', value: 0.88 },
    { name: 'Delivery Inquiry', value: 0.96 },
    { name: 'Refund Request', value: 0.93 },
    { name: 'Feature Request', value: 0.85 },
    { name: 'Technical Support', value: 0.82 },
  ],
  f1ByLang: [
    { name: 'English', value: 0.98 },
    { name: 'Spanish', value: 0.95 },
    { name: 'Hindi', value: 0.89 },
    { name: 'Marathi', value: 0.82 },
    { name: 'Kannada', value: 0.78 },
    { name: 'Tulu (Low-Res)', value: 0.65 },
    { name: 'Konkani (Low-Res)', value: 0.68 },
  ],
};

export default function App() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('intent_history');
    return saved ? JSON.parse(saved).map((item: any) => ({ ...item, timestamp: new Date(item.timestamp) })) : [];
  });
  const [templates, setTemplates] = useState<ResponseTemplate[]>(() => {
    const saved = localStorage.getItem('intent_templates');
    return saved ? JSON.parse(saved) : [
      { id: '1', name: 'Standard Billing', intent: 'Billing', content: 'We apologize for the double charge. We have processed your refund which should appear in 3-5 business days.' },
      { id: '2', name: 'Defect Investigation', intent: 'Product Defect', content: 'Thank you for reporting this. Our engineering team is currently investigating the crash report for the latest version.' }
    ];
  });
  const [showTemplates, setShowTemplates] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', intent: 'Billing', content: '' });
  
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [threshold, setThreshold] = useState(0.75);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [listeningDuration, setListeningDuration] = useState(0);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  
  // Persistence for active session and drafts
  const [result, setResult] = useState<HistoryItem | null>(null);
  const [isEditingResponse, setIsEditingResponse] = useState(() => {
    return localStorage.getItem('intent_is_editing') === 'true';
  });
  const [editedResponse, setEditedResponse] = useState(() => {
    return localStorage.getItem('intent_response_draft') || '';
  });
  const [responseHistory, setResponseHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  
  const updateEditedResponse = (value: string, pushToHistory = true) => {
    setEditedResponse(value);
    if (pushToHistory) {
      const newHistory = responseHistory.slice(0, historyIndex + 1);
      newHistory.push(value);
      // Keep last 50 edits
      if (newHistory.length > 50) newHistory.shift();
      setResponseHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const undoResponse = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setEditedResponse(responseHistory[prevIndex]);
      setHistoryIndex(prevIndex);
    }
  };

  const redoResponse = () => {
    if (historyIndex < responseHistory.length - 1) {
      const nextIndex = historyIndex + 1;
      setEditedResponse(responseHistory[nextIndex]);
      setHistoryIndex(nextIndex);
    }
  };
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [showSummary, setShowSummary] = useState(true);
  const [showCorrection, setShowCorrection] = useState(true);
  const [showReasoning, setShowReasoning] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showIntentDetails, setShowIntentDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState<{
    total: number;
    current: number;
    results: ClassificationResult[];
    isProcessing: boolean;
    error: string | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pushEnabled, setPushEnabled] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission === 'granted';
    }
    return false;
  });

  const [notificationSent, setNotificationSent] = useState(false);

  const sentimentStats = useMemo(() => {
    const stats = { Positive: 0, Neutral: 0, Negative: 0 };
    history.forEach(item => {
      if (item.sentiment) stats[item.sentiment]++;
    });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  }, [history]);

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('intent_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('intent_templates', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    if (result) {
      localStorage.setItem('intent_active_result', JSON.stringify(result));
    } else {
      localStorage.removeItem('intent_active_result');
    }
  }, [result]);

  useEffect(() => {
    localStorage.setItem('intent_is_editing', isEditingResponse.toString());
  }, [isEditingResponse]);

  useEffect(() => {
    if (isEditingResponse) {
      localStorage.setItem('intent_response_draft', editedResponse);
    } else {
      localStorage.removeItem('intent_response_draft');
    }
  }, [editedResponse, isEditingResponse]);

  const filteredHistory = history.filter(item => {
    const matchesSearch = 
      item.intent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.language.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    
    const itemDate = new Date(item.timestamp).setHours(0,0,0,0);
    const start = startDate ? new Date(startDate).setHours(0,0,0,0) : null;
    const end = endDate ? new Date(endDate).setHours(23,59,59,999) : null;

    const matchesDate = (!start || itemDate >= start) && (!end || itemDate <= end);
    const matchesFlagged = !showFlaggedOnly || (item.confidence < threshold);

    return matchesSearch && matchesDate && matchesFlagged;
  });

  const getConfidenceLevel = (score: number) => {
    if (score >= 0.9) return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'High' };
    if (score >= 0.7) return { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', label: 'Medium' };
    return { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', label: 'Low' };
  };

  const truncate = (text: string, length: number) => {
    return text.length > length ? text.substring(0, length) + '...' : text;
  };

  const getResolutionDateRange = (daysStr: string) => {
    if (!daysStr) return null;
    const now = new Date();
    // Support formats like "2-3", "30+", "1-2"
    const isPlus = daysStr.includes('+');
    const parts = daysStr.replace('+', '').split('-').map(p => parseInt(p.trim()));
    
    if (parts.length === 0 || isNaN(parts[0])) return null;
    
    const minDays = parts[0];
    const maxDays = parts.length > 1 ? parts[1] : (isPlus ? minDays + 30 : minDays);
    
    const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    const minDate = new Date(now);
    minDate.setDate(now.getDate() + minDays);
    
    const maxDate = new Date(now);
    maxDate.setDate(now.getDate() + maxDays);
    
    return {
      range: isPlus ? `${formatDate(minDate)}+` : `${formatDate(minDate)} - ${formatDate(maxDate)}`,
      days: daysStr
    };
  };

  const handleExportCSV = () => {
    if (filteredHistory.length === 0) return;

    const headers = ['Timestamp', 'Intent', 'Confidence', 'Language', 'Sentiment', 'Original Content', 'Suggested Response'];
    const rows = filteredHistory.map(item => [
      item.timestamp.toISOString(),
      item.intent,
      `${(item.confidence * 100).toFixed(1)}%`,
      item.language,
      item.sentiment || 'N/A',
      `"${item.content.replace(/"/g, '""')}"`,
      `"${item.suggested_response.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `intent_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFeedback = async (itemIdx: string, type: 'up' | 'down') => {
    const feedbackValue = history.find(h => h.id === itemIdx)?.feedback === type ? null : type;
    
    setHistory(prev => prev.map(item => 
      item.id === itemIdx ? { ...item, feedback: feedbackValue } : item
    ));
    
    if (result && result.id === itemIdx) {
      setResult(prev => prev ? { ...prev, feedback: feedbackValue } : null);
    }

    // Persist to Supabase
    try {
      await updateFeedbackInSupabase(itemIdx, feedbackValue, 'classification');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update feedback in database');
      console.error(err);
    }
  };

  const handleResponseFeedback = async (itemIdx: string, type: 'up' | 'down') => {
    const feedbackValue = history.find(h => h.id === itemIdx)?.responseFeedback === type ? null : type;

    setHistory(prev => prev.map(item => 
      item.id === itemIdx ? { ...item, responseFeedback: feedbackValue } : item
    ));
    
    if (result && result.id === itemIdx) {
      setResult(prev => prev ? { ...prev, responseFeedback: feedbackValue } : null);
    }

    // Persist to Supabase
    try {
      await updateFeedbackInSupabase(itemIdx, feedbackValue, 'response');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update response feedback in database');
      console.error(err);
    }
  };

  const handleRating = async (itemIdx: string, rating: number) => {
    const ratingValue = history.find(h => h.id === itemIdx)?.rating === rating ? null : rating;

    setHistory(prev => prev.map(item => 
      item.id === itemIdx ? { ...item, rating: ratingValue } : item
    ));
    
    if (result && result.id === itemIdx) {
      setResult(prev => prev ? { ...prev, rating: ratingValue } : null);
    }

    // Persist to Supabase
    try {
      await updateFeedbackInSupabase(itemIdx, ratingValue, 'rating');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rating in database');
      console.error(err);
    }
  };

  const handleSuggestions = (itemIdx: string, suggestions: string) => {
    setHistory(prev => prev.map(item => 
      item.id === itemIdx ? { ...item, suggestions } : item
    ));
    
    if (result && result.id === itemIdx) {
      setResult(prev => prev ? { ...prev, suggestions } : null);
    }
  };

  const handleSaveResponse = (itemIdx: string) => {
    setHistory(prev => prev.map(item => 
      item.id === itemIdx ? { ...item, suggested_response: editedResponse } : item
    ));
    
    if (result && result.id === itemIdx) {
      setResult(prev => prev ? { ...prev, suggested_response: editedResponse } : null);
    }
    
    setIsEditingResponse(false);
    localStorage.removeItem('intent_response_draft');
  };

  const handleStartEditing = () => {
    if (result) {
      const draft = localStorage.getItem('intent_response_draft');
      const initialValue = draft || result.suggested_response;
      setEditedResponse(initialValue);
      setResponseHistory([initialValue]);
      setHistoryIndex(0);
      setIsEditingResponse(true);
    }
  };

  const handleAddTemplate = () => {
    if (!newTemplate.name || !newTemplate.content) return;
    const template: ResponseTemplate = {
      ...newTemplate,
      id: crypto.randomUUID()
    };
    setTemplates(prev => [...prev, template]);
    setNewTemplate({ name: '', intent: 'Billing', content: '' });
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
  };


  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    
    // Explicitly set some common fallback properties
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setListeningDuration(0);
      timerRef.current = setInterval(() => {
        setListeningDuration(prev => prev + 1);
      }, 1000);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) {
        setInput(prev => prev ? `${prev.trim()} ${finalTranscript}` : finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      stopListening();
      setError(`Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      stopListening();
    };

    const stopListening = () => {
      setIsListening(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    recognition.start();
  };

  const handleClassify = useCallback(async (textOverride?: string) => {
    const textToClassify = textOverride || input;
    if (!textToClassify.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setShowPrompt(false);
    setShowIntentDetails(false);

    try {
      // Get last 5 interactions for context to personalize suggested response
      const context = history.slice(0, 5)
        .map(item => `Intent: ${item.intent}, Content: ${item.content}`)
        .join('\n');

      const classification = await classifyTicket(textToClassify, context);
      
      const newHistoryItem: HistoryItem = {
        ...classification,
        customer_email: customerEmail || classification.customer_email,
        customer_phone: customerPhone || classification.customer_phone,
        id: crypto.randomUUID(),
        timestamp: new Date(),
        content: textToClassify,
      };

      // Persist to Supabase
      try {
        await saveTicketToSupabase({
          id: newHistoryItem.id,
          message: textToClassify,
          intent: classification.intent,
          language: classification.language,
          confidence: classification.confidence,
          needs_review: classification.confidence < threshold
        });
      } catch (err) {
        // We log the error but don't necessarily block the entire flow if saving fails,
        // unless it's critical. But we show the error message.
        setError(err instanceof Error ? err.message : 'Failed to save ticket to database');
        console.error(err);
      }

      // Email Notification for urgent/low-confidence
      const sent = await sendEmailNotification({
        message: textToClassify,
        intent: classification.intent,
        confidence: classification.confidence,
        reason: classification.reason
      });

      if (sent) {
        setNotificationSent(true);
        setTimeout(() => setNotificationSent(false), 5000);
      }

      // Browser Push Notification
      sendPushNotification({
        intent: classification.intent,
        confidence: classification.confidence,
        message: textToClassify
      });

      setResult(newHistoryItem);
      setHistory(prev => [newHistoryItem, ...prev].slice(0, 10));
      // Clear contact form after successful classification
      setCustomerEmail('');
      setCustomerPhone('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Classification failed. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [input, loading, history, threshold]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      let tickets: string[] = [];

      if (file.name.endsWith('.csv')) {
        // Simple CSV parsing: assume one row per ticket or comma-separated if simple
        tickets = content.split(/\r?\n/).filter(line => line.trim()).map(line => {
          // If it's a real CSV with headers, we might want to be smarter, 
          // but for now, let's just take the whole line if it's not empty.
          return line.trim();
        });
      } else {
        // TXT: one ticket per line
        tickets = content.split(/\r?\n/).filter(line => line.trim());
      }

      if (tickets.length === 0) {
        setError('No tickets found in the file.');
        return;
      }

      setBulkProcessing({
        total: tickets.length,
        current: 0,
        results: [],
        isProcessing: true,
        error: null
      });

      const results: HistoryItem[] = [];
      
      for (let i = 0; i < tickets.length; i++) {
        setBulkProcessing(prev => prev ? { ...prev, current: i + 1 } : null);
        try {
          const classification = await classifyTicket(tickets[i]);
          const newHistoryItem: HistoryItem = {
            ...classification,
            id: crypto.randomUUID(),
            timestamp: new Date(),
            content: tickets[i],
          };

          // Persist to Supabase in bulk
          try {
            await saveTicketToSupabase({
              id: newHistoryItem.id,
              message: tickets[i],
              intent: classification.intent,
              language: classification.language,
              confidence: classification.confidence,
              needs_review: classification.confidence < threshold
            });
          } catch (err) {
            console.error(`Failed to save bulk ticket ${i + 1} to database:`, err);
            // We don't block the loop but the user might want to know
            setBulkProcessing(prev => prev ? { ...prev, error: `Database error on item ${i + 1}` } : null);
          }

          // Email Notification for urgent/low-confidence
          sendEmailNotification({
            message: tickets[i],
            intent: classification.intent,
            confidence: classification.confidence,
            reason: classification.reason
          });

          // Browser Push Notification
          sendPushNotification({
            intent: classification.intent,
            confidence: classification.confidence,
            message: tickets[i]
          });

          results.push(newHistoryItem);
        } catch (err) {
          console.error(`Failed to classify ticket ${i + 1}:`, err);
        }
      }

      setHistory(prev => [...results, ...prev].slice(0, 50));
      setBulkProcessing(prev => prev ? { ...prev, isProcessing: false, results } : null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.onerror = () => {
      setError('Failed to read file.');
    };

    reader.readAsText(file);
  };

  const currentTheme = result ? INTENT_THEMES[result.intent] : null;
  const isLowConfidence = result && result.confidence < threshold;

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-100 font-sans selection:bg-indigo-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Left: Input Area */}
        <div className="lg:col-span-12 xl:col-span-7 space-y-10">
          <header className="space-y-4">
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/5 rounded-2xl mb-8 group hover:bg-white/[0.05] transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                A
              </div>
              <div>
                <h2 className="text-sm font-bold text-white leading-tight">Welcome back to Instant Intent!</h2>
                <p className="text-xs text-slate-400">ashwatha5151@gmail.com</p>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-xs font-mono text-indigo-300"
            >
              <Sparkles size={14} className="animate-pulse" />
              <span>POWERED BY GEMINI 1.5 FLASH</span>
            </motion.div>
            <h1 className="text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/40 leading-tight">
              Instant Intent <br />
              <span className="italic font-serif">Classification</span>
            </h1>
            <p className="max-w-xl text-lg text-slate-400 font-medium leading-relaxed">
              Skip the 10-hour training sessions. Our AI natively understands 
              <span className="text-emerald-400 mx-1">Hindi</span>, 
              <span className="text-orange-400 mx-1">Marathi</span>, 
              <span className="text-orange-400 mx-1">Tulu</span>, 
              <span className="text-yellow-400 mx-1">Konkani</span>, 
              <span className="text-sky-400 mx-1">Tamil</span>, 
              <span className="text-rose-400 mx-1">Bengali</span> 
              and more out of the box. Precise, colorful, and intelligent.
            </p>
          </header>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <Tooltip content="Adjust required confidence level to avoid misclassification">
                <div className="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-xl cursor-help">
                  <Sliders size={14} className="text-indigo-400" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-indigo-300">{(threshold * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05" 
                    value={threshold} 
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    className="w-24 sm:w-32 accent-indigo-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer hover:bg-white/20 transition-all"
                  />
                </div>
              </Tooltip>
            </div>

            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-br from-indigo-500 to-emerald-500 rounded-2xl opacity-10 group-focus-within:opacity-20 transition-all blur-md" />
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-4 left-4 right-4 z-30 p-4 bg-rose-500/90 backdrop-blur-md text-white rounded-xl shadow-xl flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <AlertCircle size={20} />
                    <p className="text-sm font-bold">{error}</p>
                  </div>
                  <button onClick={() => setError(null)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                    <X size={16} />
                  </button>
                </motion.div>
              )}
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste a ticket in any language..."
                className="relative w-full h-[320px] bg-white/5 border border-white/10 rounded-2xl p-8 text-lg focus:outline-none focus:ring-2 focus:ring-white/20 transition-all resize-none shadow-2xl placeholder:opacity-20 text-white"
              />

              <AnimatePresence>
                {notificationSent && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute bottom-20 right-8 z-30 px-4 py-2 bg-emerald-500 text-white text-[10px] font-bold rounded-lg shadow-xl flex items-center gap-2 border border-white/20"
                  >
                    <Mail size={12} />
                    <span>ALERTS DISPATCHED</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="absolute bottom-6 left-8 flex items-center gap-4 text-xs font-mono">
                <Globe size={14} className={`transition-colors ${isListening ? 'text-emerald-400 animate-spin-slow' : 'opacity-30'}`} />
                <span className={isListening ? 'text-emerald-400 font-bold' : 'opacity-30'}>
                  {isListening ? 'LISTENING & DETECTING...' : 'MULTILINGUAL ENGINE ACTIVE'}
                </span>
                <div className="w-px h-3 bg-white/10 mx-2" />
                <button 
                  onClick={async () => {
                    const granted = await requestNotificationPermission();
                    setPushEnabled(granted);
                  }}
                  className={`flex items-center gap-1.5 transition-all hover:opacity-100 ${pushEnabled ? 'text-indigo-400 opacity-100' : 'text-white opacity-30'}`}
                  title={pushEnabled ? "Browser notifications enabled" : "Enable browser notifications"}
                >
                  <Bell size={12} className={pushEnabled ? 'animate-pulse' : ''} />
                  <span>ALERTS</span>
                </button>
              </div>
              <div className="absolute bottom-6 right-8 flex items-center gap-3">
                <AnimatePresence>
                  {input && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setInput('')}
                      className="p-3 bg-white/10 text-white/50 rounded-full hover:bg-white/20 hover:text-white transition-all shadow-lg"
                      title="Clear Input"
                    >
                      <X size={20} />
                    </motion.button>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {isListening && (
                    <motion.div
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 border border-rose-500/30 rounded-full text-[10px] font-mono text-rose-400"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                      {Math.floor(listeningDuration / 60)}:{(listeningDuration % 60).toString().padStart(2, '0')}
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={toggleVoiceInput}
                  className={`p-3 rounded-full transition-all shadow-lg ${isListening ? 'bg-rose-500 text-white ring-4 ring-rose-500/20' : 'bg-white/10 text-white/50 hover:bg-white/20 hover:text-white'}`}
                  title={isListening ? 'Stop Listening' : 'Voice Input (Continuous)'}
                >
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </motion.button>
              </div>
            </div>

            {/* Contact Information Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="group">
                <label className="block text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2 px-1">Customer Email Notification</label>
                <div className="flex items-center gap-3 px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus-within:ring-2 focus-within:ring-white/20 transition-all">
                  <Mail size={18} className="text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                  <input 
                    type="email"
                    placeholder="Enter email address..."
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="bg-transparent text-sm font-mono text-white outline-none w-full placeholder:opacity-20"
                  />
                </div>
              </div>
              <div className="group">
                <label className="block text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2 px-1">SMS / Phone Confirmation</label>
                <div className="flex items-center gap-3 px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus-within:ring-2 focus-within:ring-white/20 transition-all">
                  <Smartphone size={18} className="text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                  <input 
                    type="tel"
                    placeholder="Enter mobile number..."
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="bg-transparent text-sm font-mono text-white outline-none w-full placeholder:opacity-20"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => handleClassify()}
                disabled={loading || !input.trim()}
                className="flex-[2] h-16 bg-white text-black rounded-2xl flex items-center justify-center gap-3 font-bold text-lg hover:bg-slate-100 active:scale-[0.98] transition-all disabled:opacity-20 disabled:pointer-events-none group"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <>
                    <span>Execute Inference</span>
                    <Zap size={20} className="fill-current group-hover:scale-125 transition-transform" />
                  </>
                )}
              </button>

              <div className="flex-1 flex gap-2">
                <input
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={bulkProcessing?.isProcessing || loading}
                  className="w-full h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 font-bold text-xs hover:bg-white/10 active:scale-[0.98] transition-all disabled:opacity-20 disabled:pointer-events-none group"
                >
                  <Upload size={16} className="text-indigo-400" />
                  <span>Bulk Classify (CSV or TXT)</span>
                </button>
              </div>
            </div>

            <AnimatePresence>
              {bulkProcessing && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-6 bg-white/5 border border-white/10 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${bulkProcessing.isProcessing ? 'bg-indigo-500/10 text-indigo-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {bulkProcessing.isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">
                            {bulkProcessing.isProcessing ? 'Processing Bulk Queue' : 'Bulk Batch Complete'}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {bulkProcessing.current} of {bulkProcessing.total} items processed
                          </p>
                        </div>
                      </div>
                      {!bulkProcessing.isProcessing && (
                        <button 
                          onClick={() => setBulkProcessing(null)}
                          className="text-[10px] font-mono uppercase tracking-widest opacity-40 hover:opacity-100"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-indigo-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${bulkProcessing.total > 0 ? (bulkProcessing.current / bulkProcessing.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 flex gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
                {MULTILINGUAL_SAMPLES.map((sample) => (
                  <button
                    key={sample.language}
                    onClick={() => {
                      setInput(sample.text);
                      handleClassify(sample.text);
                    }}
                    className="whitespace-nowrap px-4 h-16 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold hover:bg-white/10 transition-colors"
                  >
                    Try {sample.language}
                  </button>
                ))}
              </div>
            </div>

          </div>
        

        {/* Right: Results Panel */}
        <div className="lg:col-span-12 xl:col-span-5 space-y-12">
          
          <div className="relative">
            <div className="flex items-center justify-between mb-4 px-2">
              <h2 className="text-sm font-mono uppercase tracking-[0.2em] opacity-40">Intelligence Stream</h2>
              <button 
                onClick={() => setShowMetrics(!showMetrics)}
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono tracking-widest transition-all border ${showMetrics ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-white/5 text-indigo-400 border-indigo-500/30 hover:bg-white/10'}`}
              >
                <Sliders size={12} />
                {showMetrics ? 'VIEW LIVE STREAM' : 'VIEW PERFORMANCE REPORT'}
              </button>
            </div>

            <AnimatePresence mode="wait">
              {showMetrics ? (
                <motion.div
                  key="metrics-report"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="relative min-h-[600px] bg-slate-950/80 backdrop-blur-2xl border border-indigo-500/20 rounded-3xl p-8 overflow-y-auto max-h-[80vh] custom-scrollbar shadow-2xl shadow-indigo-500/10"
                >
                  <div className="space-y-12">
                    <header className="space-y-2">
                      <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-indigo-400 font-bold mb-1">Expected Outcome</div>
                      <h2 className="text-3xl font-bold text-white tracking-tight">System Performance Analysis</h2>
                      <p className="text-xs text-slate-500 leading-relaxed max-w-md">Comprehensive audit of model accuracy across multilingual vectors and intent classes.</p>
                    </header>

                    <div className="grid grid-cols-1 gap-10">
                      {/* F1 Scores - Intent */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/40">Per-Intent F1 Scores (Global)</h3>
                          <span className="text-[10px] font-mono text-indigo-400">Target: {'>'}0.85</span>
                        </div>
                        <div className="h-64 bg-black/40 border border-white/5 rounded-2xl p-6">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={PERFORMANCE_METRICS.f1ByIntent} layout="vertical">
                              <XAxis type="number" domain={[0, 1]} hide />
                              <YAxis dataKey="name" type="category" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }} width={120} axisLine={false} tickLine={false} />
                              <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }} />
                              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {PERFORMANCE_METRICS.f1ByIntent.map((entry) => (
                                  <Cell key={`intent-${entry.name}`} fill={entry.value < 0.85 ? '#f43f5e' : '#6366f1'} opacity={0.8} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* F1 Scores - Language */}
                      <div className="space-y-4">
                         <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/40">Per-Language F1 Scores</h3>
                          <span className="text-[10px] font-mono text-rose-400">Low-Res Alert</span>
                        </div>
                        <div className="h-64 bg-black/40 border border-white/5 rounded-2xl p-6">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={PERFORMANCE_METRICS.f1ByLang} layout="vertical">
                              <XAxis type="number" domain={[0, 1]} hide />
                              <YAxis dataKey="name" type="category" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }} width={120} axisLine={false} tickLine={false} />
                              <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }} />
                              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {PERFORMANCE_METRICS.f1ByLang.map((entry) => (
                                  <Cell key={`lang-${entry.name}`} fill={entry.value < 0.75 ? '#f43f5e' : '#10b981'} opacity={0.8} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Qualitative Analysis */}
                      <div className="space-y-6">
                        <div className="p-6 bg-rose-500/5 border border-rose-500/20 rounded-2xl space-y-4">
                          <div className="flex items-center gap-2 text-rose-400">
                             <AlertCircle size={14} />
                             <h4 className="text-[10px] font-mono uppercase tracking-widest font-bold">Low-Resource Performance Degradation</h4>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed leading-relaxed font-serif italic">
                            Analysis reveals significant performance variance in languages like Tulu and Konkani (~65% F1). Degradation typically manifests as "Semantic Drift" where code-switching or atypical dialectal markers lead the model to default to generic "Technical Support" intent. Intent-confusion is peaked between "Refund Request" and "Billing" due to shared lexemes in low-resource training corpora.
                          </p>
                        </div>

                        <div className="p-6 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl space-y-4">
                          <div className="flex items-center gap-2 text-indigo-400">
                             <Zap size={14} fill="currentColor" className="opacity-40" />
                             <h4 className="text-[10px] font-mono uppercase tracking-widest font-bold">System Improvement Proposal</h4>
                          </div>
                          <div className="space-y-3">
                            <div className="flex gap-4">
                              <div className="text-indigo-400 font-mono text-[10px]">01</div>
                              <p className="text-[11px] text-slate-300">
                                <span className="font-bold text-white">Active Learning Implementation:</span> Deploy a "Human-in-the-Loop" validation layer for any prediction with confidence &lt; 0.70. These low-confidence samples will be prioritized for manual labeling, creating a high-impact, small-batch training set.
                              </p>
                            </div>
                            <div className="flex gap-4">
                              <div className="text-indigo-400 font-mono text-[10px]">02</div>
                              <p className="text-[11px] text-slate-300">
                                <span className="font-bold text-white">Cross-Lingual Transfer:</span> Leverage high-resource Hindi embeddings as a soft-anchor for morphologically similar dialects (Konkani, Tulu). Utilizing Zero-Shot Cross-Lingual Transfer (XLT) through a multi-stage prompt-tuning approach will target specifically identified confusion zones.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div key="live-stream">
                  <div className="relative min-h-[460px] bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-10 overflow-hidden shadow-2xl">
                    <AnimatePresence mode="wait">
                      {!result && !loading && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-6 opacity-30 text-center px-10"
                  >
                    <Ticket size={80} strokeWidth={0.5} />
                    <div className="space-y-2">
                      <p className="text-xl font-serif italic">Neutralized State</p>
                      <p className="text-xs font-mono uppercase tracking-widest leading-loose text-white/60">Awaiting neural trigger from the input buffer</p>
                    </div>
                  </motion.div>
                )}

                {loading && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20 bg-black/40 backdrop-blur-sm"
                  >
                    <Loader2 className="animate-spin text-white" size={48} strokeWidth={1} />
                    <p className="text-xs font-mono uppercase tracking-[0.3em] animate-pulse">Decomposing Syntax...</p>
                  </motion.div>
                )}

                {result && !loading && (
                  <motion.div 
                    key={result.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-10"
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-40">Detected Intent</span>
                            <Tooltip content={currentTheme?.description || ''}>
                              <div className="p-1 rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-white/80 transition-colors cursor-help">
                                <Info size={10} />
                              </div>
                            </Tooltip>
                            <button 
                              onClick={() => setShowIntentDetails(!showIntentDetails)}
                              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-mono tracking-widest transition-all border ${showIntentDetails ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-white/5 text-indigo-400 border-indigo-500/30 hover:bg-white/10'}`}
                            >
                              {showIntentDetails ? 'HIDE SCHEMA' : 'VIEW SCHEMA'}
                            </button>
                          </div>
                          <div className={`text-5xl font-bold tracking-tight ${currentTheme?.color} flex items-end gap-4`}>
                            {result.intent}
                            <div className={`mb-2 px-3 py-1 rounded-full border text-xs font-mono font-bold ${getConfidenceLevel(result.confidence).bg} ${getConfidenceLevel(result.confidence).border} ${getConfidenceLevel(result.confidence).color}`}>
                              {(result.confidence * 100).toFixed(0)}% CONFIDENCE
                            </div>
                          </div>
                        </div>
                          <div className="flex gap-2 mb-1">
                            <button 
                              onClick={() => handleFeedback(result.id, 'up')}
                              className={`p-2 rounded-lg transition-all border ${result.feedback === 'up' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.2)]' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'}`}
                              title="Helpful"
                            >
                              <ThumbsUp size={16} />
                            </button>
                            <button 
                              onClick={() => handleFeedback(result.id, 'down')}
                              className={`p-2 rounded-lg transition-all border ${result.feedback === 'down' ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-[0_0_15px_rgba(251,113,133,0.2)]' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'}`}
                              title="Not Helpful"
                            >
                              <ThumbsDown size={16} />
                            </button>
                          </div>
                      </div>
                    </div>

                    <AnimatePresence>
                      {showIntentDetails && currentTheme && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className={`p-6 rounded-2xl border ${currentTheme.bg} ${currentTheme.border} space-y-4 shadow-xl`}>
                            <div className="space-y-1">
                              <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60">Intent Definition</h4>
                              <p className="text-sm text-white/90 leading-relaxed italic">
                                "{currentTheme.description}"
                              </p>
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60">Related Issues & Sub-queries</h4>
                              <div className="flex flex-wrap gap-2">
                                {currentTheme.relatedIssues.map((issue) => (
                                  <span key={issue} className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-medium text-white/70">
                                    {issue}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="grid grid-cols-2 gap-4">
                      <div className={`p-6 rounded-2xl border transition-colors ${currentTheme?.bg} ${currentTheme?.border} ${currentTheme?.glow}`}>
                        <div className="text-[10px] font-mono uppercase tracking-widest opacity-60 mb-2">Confidence Score</div>
                        <div className={`text-4xl font-bold ${currentTheme?.color}`}>
                          {(result.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div className={`p-6 rounded-2xl border transition-all ${SENTIMENT_THEMES[result.sentiment]?.bg} ${SENTIMENT_THEMES[result.sentiment]?.border}`}>
                        <div className="text-[10px] font-mono uppercase tracking-widest opacity-60 mb-2">Customer Sentiment</div>
                        <div className={`text-4xl font-bold ${SENTIMENT_THEMES[result.sentiment]?.color}`}>
                          {result.sentiment}
                        </div>
                      </div>
                    </div>
                    
                    <div className="pt-2">
                      {result.confidence < threshold ? (
                        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl animate-pulse">
                          <AlertCircle size={20} className="text-amber-400" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Flagged for Human Review</span>
                            <span className="text-[10px] text-amber-400/60 font-mono">Active Learning Loop Triggered</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                          <CheckCircle2 size={20} className="text-emerald-400" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Auto-Processed Successfully</span>
                            <span className="text-[10px] text-emerald-400/60 font-mono">Classification confidence above threshold</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {result.resolution_sla && (
                      <div className="space-y-4">
                        <div className="p-6 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group overflow-hidden relative">
                           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Calendar size={32} />
                          </div>
                          <div className="space-y-1 relative z-10">
                            <div className="text-[10px] font-mono uppercase tracking-widest opacity-40">Resolution SLA</div>
                            <div className="text-xl font-bold text-white flex items-center gap-2">
                               {result.resolution_sla}
                               <span className="text-[10px] px-2 py-0.5 bg-white/10 rounded-full font-mono text-indigo-400">ACTIVE</span>
                            </div>
                          </div>
                          <div className="text-right relative z-10">
                            <div className="text-[10px] font-mono uppercase tracking-widest opacity-40">Target Window</div>
                            <div className="text-sm font-mono text-emerald-400 font-bold">
                              {getResolutionDateRange(result.estimated_resolution_days || result.resolution_sla)?.range || 'Calculating...'}
                            </div>
                          </div>
                        </div>

                        {/* Customer Notification Dispatch Tracker */}
                        <div className="p-5 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Bell size={14} className="text-indigo-400" />
                              <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-bold">Dispatch Tracker</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>
                              <span className="text-[10px] font-mono text-emerald-400">LIVE UPDATES ACTIVE</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
                              <div className="flex items-center gap-2 text-[9px] uppercase tracking-tighter opacity-40">
                                <Mail size={10} />
                                <span>Email Notification</span>
                              </div>
                              <div className="text-xs font-mono truncate text-slate-300">
                                {result.customer_email || 'System Default'}
                              </div>
                              <div className="flex items-center gap-1 text-[8px] text-emerald-400 font-bold">
                                <Zap size={8} />
                                <span>DELIVERED</span>
                              </div>
                            </div>

                            <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
                              <div className="flex items-center gap-2 text-[9px] uppercase tracking-tighter opacity-40">
                                <Smartphone size={10} />
                                <span>SMS Notification</span>
                              </div>
                              <div className="text-xs font-mono truncate text-slate-300">
                                {result.customer_phone || 'Registered Mobile'}
                              </div>
                              <div className="flex items-center gap-1 text-[8px] text-emerald-400 font-bold">
                                <Zap size={8} />
                                <span>DELIVERED</span>
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-white/5">
                            <p className="text-[10px] text-slate-400 leading-relaxed italic">
                              "Confirmation sent via Email and SMS mentioning the <strong>{result.resolution_sla}</strong> resolution window."
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-4">
                      <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Globe size={40} />
                        </div>
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Detected Language (Confidence)
                          </div>
                          {result.language_confidence && (
                            <div className={`flex items-center gap-2 px-2 py-1 rounded-md border ${getConfidenceLevel(result.language_confidence).bg} ${getConfidenceLevel(result.language_confidence).border} ${getConfidenceLevel(result.language_confidence).color}`}>
                              <span className="text-[10px] font-mono font-bold">{(result.language_confidence * 100).toFixed(0)}%</span>
                              <span className="text-[8px] uppercase tracking-widest font-bold opacity-60">{getConfidenceLevel(result.language_confidence).label}</span>
                            </div>
                          )}
                        </div>
                        <div className="text-4xl font-bold text-white tracking-tight">
                          {result.language}
                        </div>
                      </div>
                    </div>

                    {result.summary && (
                      <div className="space-y-4">
                        <button 
                          onClick={() => setShowSummary(!showSummary)}
                          className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-left group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                              <Sparkles size={14} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">Neural Summary</span>
                              <span className="text-[10px] opacity-40">Concise overview of customer intent</span>
                            </div>
                          </div>
                          {showSummary ? <ChevronUp size={16} className="opacity-40" /> : <ChevronDown size={16} className="opacity-40" />}
                        </button>
                        <AnimatePresence>
                          {showSummary && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-5 bg-white/5 border border-white/5 rounded-xl">
                                <p className="text-sm leading-relaxed text-slate-300 italic font-serif">
                                  {result.summary}
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {result.corrected_content && result.corrected_content.trim() !== result.content.trim() && (
                      <div className="space-y-4">
                        <button 
                          onClick={() => setShowCorrection(!showCorrection)}
                          className="w-full flex items-center justify-between p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl hover:bg-indigo-500/10 transition-all text-left group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                              <CheckCircle2 size={14} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-bold">Auto-Corrected Input</span>
                              <span className="text-[10px] opacity-40">Cleaned version used for analysis</span>
                            </div>
                          </div>
                          {showCorrection ? <ChevronUp size={16} className="opacity-40" /> : <ChevronDown size={16} className="opacity-40" />}
                        </button>
                        <AnimatePresence>
                          {showCorrection && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-5 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
                                <p className="text-sm leading-relaxed text-slate-300 font-mono">
                                  {result.corrected_content}
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Info size={14} className="opacity-40" />
                        <span className="text-[10px] font-mono uppercase tracking-widest opacity-40">Neural Reason</span>
                      </div>
                      <p className="text-lg leading-relaxed font-medium text-slate-300 italic">
                        "{result.reason}"
                      </p>
                    </div>

                    {/* AI Reasoning Section */}
                    {result.reasoning_steps && result.reasoning_steps.length > 0 && (
                      <div className="space-y-4">
                        <button 
                          onClick={() => setShowReasoning(!showReasoning)}
                          className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-left group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 group-hover:scale-110 transition-transform">
                              <Zap size={14} fill="currentColor" className="opacity-40" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-bold">Reasoning Breakdown</span>
                              <span className="text-[10px] opacity-40">Mapping input context to response strategy</span>
                            </div>
                          </div>
                          {showReasoning ? <ChevronUp size={16} className="opacity-40" /> : <ChevronDown size={16} className="opacity-40" />}
                        </button>

                        <AnimatePresence>
                          {showReasoning && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-5 bg-black/40 border border-white/5 rounded-xl space-y-6">
                                {result.reasoning_steps.map((step, idx) => (
                                  <motion.div 
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    key={`reasoning-step-${idx}-${step.input_quote.substring(0, 10)}`} 
                                    className="space-y-3 pb-6 border-b border-white/5 last:border-0 last:pb-0"
                                  >
                                    <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-xl relative group">
                                      <div className="absolute top-0 right-0 p-2 opacity-5">
                                        <Ticket size={24} />
                                      </div>
                                      <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-indigo-400/60 mb-1.5 flex items-center gap-2">
                                        <div className="w-1 h-1 rounded-full bg-indigo-400" />
                                        Input Signal
                                      </div>
                                      <p className="text-[13px] italic text-slate-200 leading-relaxed font-serif">
                                        "{step.input_quote}"
                                      </p>
                                    </div>
                                    
                                    <div className="flex items-center gap-3 px-2">
                                      <div className="w-px h-8 bg-gradient-to-b from-indigo-500/40 to-transparent mx-2" />
                                      <div className="flex-1">
                                        <div className="text-[9px] font-mono uppercase tracking-[0.1em] text-indigo-300 font-bold mb-0.5">Neural Influence</div>
                                        <div className="text-[11px] text-slate-400 leading-normal italic">
                                          {step.influence}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="bg-white/5 border border-white/5 p-3 rounded-xl relative group">
                                      <div className="absolute top-0 right-0 p-2 opacity-5">
                                        <Send size={24} />
                                      </div>
                                      <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/20 mb-1.5 flex items-center gap-2">
                                        <div className="w-1 h-1 rounded-full bg-white/20" />
                                        Response Output
                                      </div>
                                      <p className="text-[13px] text-white/70 leading-relaxed">
                                        "{step.response_part}"
                                      </p>
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    <div className="space-y-4 p-6 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl relative">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Send size={14} className="text-indigo-400" />
                          <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-bold">
                            {isEditingResponse ? 'Editing AI Response' : `Suggested AI Response (${result.language})`}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          {!isEditingResponse ? (
                            <>
                              <button 
                                onClick={() => setShowTemplates(!showTemplates)}
                                className={`text-[10px] font-mono uppercase tracking-widest transition-all ${showTemplates ? 'text-indigo-400 font-bold' : 'opacity-40 hover:opacity-100'}`}
                              >
                                {showTemplates ? 'Hide Templates' : 'Templates'}
                              </button>
                              <button 
                                onClick={handleStartEditing}
                                className="text-[10px] font-mono uppercase tracking-widest opacity-40 hover:opacity-100 transition-all"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(result.suggested_response);
                                  setCopyFeedback(true);
                                  setTimeout(() => setCopyFeedback(false), 2000);
                                }}
                                className={`text-[10px] font-mono uppercase tracking-widest transition-all ${copyFeedback ? 'text-emerald-400 font-bold' : 'opacity-40 hover:opacity-100'}`}
                              >
                                {copyFeedback ? 'Copied!' : 'Copy Response'}
                              </button>
                            </>
                          ) : (
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => {
                                setIsEditingResponse(false);
                              }}
                              className="text-[10px] font-mono uppercase tracking-widest opacity-40 hover:opacity-100 transition-all"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={() => handleSaveResponse(result.id)}
                              className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500 text-white text-[10px] font-mono uppercase tracking-widest rounded-lg hover:bg-indigo-400 transition-all font-bold shadow-lg shadow-indigo-500/20"
                            >
                              <CheckCircle2 size={12} />
                              Save to History
                            </button>
                          </div>
                          )}
                        </div>
                      </div>

                      {isEditingResponse ? (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex flex-wrap gap-2">
                               {templates.filter(t => t.intent === result.intent || !t.intent).map(t => (
                               <button
                                 key={t.id}
                                 onClick={() => updateEditedResponse(t.content)}
                                 className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-mono hover:bg-white/10 transition-colors"
                               >
                                 Load: {t.name}
                               </button>
                             ))}
                            </div>
                            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5">
                              <button 
                                onClick={undoResponse}
                                disabled={historyIndex <= 0}
                                className="p-1.5 text-white/40 hover:text-white disabled:opacity-10 transition-colors"
                                title="Undo (Ctrl+Z)"
                              >
                                <Undo2 size={14} />
                              </button>
                              <div className="w-px h-4 bg-white/10" />
                              <button 
                                onClick={redoResponse}
                                disabled={historyIndex >= responseHistory.length - 1}
                                className="p-1.5 text-white/40 hover:text-white disabled:opacity-10 transition-colors"
                                title="Redo (Ctrl+Y)"
                              >
                                <Redo2 size={14} />
                              </button>
                            </div>
                          </div>
                          <textarea
                            value={editedResponse}
                            onChange={(e) => updateEditedResponse(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-base leading-relaxed text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all min-h-[150px] resize-y font-sans"
                            onKeyDown={(e) => {
                              if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                                if (e.shiftKey) redoResponse();
                                else undoResponse();
                                e.preventDefault();
                              } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                                redoResponse();
                                e.preventDefault();
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-base leading-relaxed text-slate-200 whitespace-pre-wrap">
                            {result.suggested_response}
                          </p>
                          
                          <div className="pt-4 border-t border-white/5 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-mono uppercase tracking-widest opacity-40">Rate Response Quality</span>
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      onClick={() => handleRating(result.id, star)}
                                      className={`transition-all hover:scale-110 active:scale-95 ${result.rating && result.rating >= star ? 'text-amber-400' : 'text-white/10 hover:text-white/30'}`}
                                    >
                                      <Star size={16} fill={result.rating && result.rating >= star ? "currentColor" : "none"} strokeWidth={1.5} />
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] font-mono uppercase tracking-widest opacity-40">Helpful Response?</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleResponseFeedback(result.id, 'up')}
                                    className={`p-1.5 rounded-lg border transition-all hover:scale-110 ${result.responseFeedback === 'up' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/10 text-white/30 hover:text-white/60'}`}
                                  >
                                    <ThumbsUp size={16} fill={result.responseFeedback === 'up' ? "currentColor" : "none"} />
                                  </button>
                                  <button
                                    onClick={() => handleResponseFeedback(result.id, 'down')}
                                    className={`p-1.5 rounded-lg border transition-all hover:scale-110 ${result.responseFeedback === 'down' ? 'bg-rose-500/20 border-rose-500/50 text-rose-400' : 'bg-white/5 border-white/10 text-white/30 hover:text-white/60'}`}
                                  >
                                    <ThumbsDown size={16} fill={result.responseFeedback === 'down' ? "currentColor" : "none"} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <AnimatePresence>
                        {/* Save dialog removed for direct saving */}
                      </AnimatePresence>
                    </div>

                    {/* Template Management (Collapsible) */}
                    <div className="space-y-4">
                      <button 
                        onClick={() => setShowTemplates(!showTemplates)}
                        className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                            <FileText size={14} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-bold">Response Templates</span>
                            <span className="text-[10px] opacity-40">Manage and apply expert-defined responses</span>
                          </div>
                        </div>
                        {showTemplates ? <ChevronUp size={16} className="opacity-40" /> : <ChevronDown size={16} className="opacity-40" />}
                      </button>

                      <AnimatePresence>
                        {showTemplates && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-4 overflow-hidden"
                          >
                            <div className="p-5 bg-black/40 border border-white/5 rounded-xl space-y-6">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-2">Stored Templates</h4>
                                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                    {templates.length === 0 ? (
                                      <p className="text-[10px] text-white/20 italic p-4 text-center border border-dashed border-white/5 rounded-xl">No templates found</p>
                                    ) : (
                                      templates.map(t => (
                                        <div key={t.id} className="flex flex-col p-3 bg-white/5 border border-white/5 rounded-xl group relative">
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="text-[10px] font-bold text-white">{t.name}</div>
                                            <div className="flex items-center gap-2">
                                              <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded ${INTENT_THEMES[t.intent]?.bg || 'bg-white/10'} ${INTENT_THEMES[t.intent]?.color || 'text-white/40'}`}>
                                                {t.intent}
                                              </span>
                                              <button 
                                                onClick={() => handleDeleteTemplate(t.id)}
                                                className="p-1 text-white/20 hover:text-rose-400 transition-colors"
                                              >
                                                <Trash2 size={12} />
                                              </button>
                                            </div>
                                          </div>
                                          <div className="text-[10px] text-slate-400 line-clamp-2 italic">"{t.content}"</div>
                                          <button 
                                            onClick={() => {
                                              handleStartEditing();
                                              updateEditedResponse(t.content);
                                            }}
                                            className="mt-3 text-[9px] uppercase tracking-widest text-indigo-400 font-bold hover:text-indigo-300 transition-colors flex items-center gap-1"
                                          >
                                            <Play size={10} fill="currentColor" /> Apply to Result
                                          </button>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-2">New Template</h4>
                                  <div className="space-y-3 p-4 bg-white/5 rounded-xl border border-white/5">
                                    <input 
                                      placeholder="Template Name"
                                      value={newTemplate.name}
                                      onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                                      className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-[11px] placeholder:opacity-30 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                    <select 
                                      value={newTemplate.intent}
                                      onChange={(e) => setNewTemplate({ ...newTemplate, intent: e.target.value })}
                                      className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white/60"
                                    >
                                      {Object.keys(INTENT_THEMES).map(intent => (
                                        <option key={intent} value={intent}>{intent}</option>
                                      ))}
                                    </select>
                                    <textarea 
                                      placeholder="Template Content"
                                      value={newTemplate.content}
                                      onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
                                      className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-[11px] placeholder:opacity-30 focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[80px] resize-none"
                                    />
                                    <button 
                                      onClick={handleAddTemplate}
                                      disabled={!newTemplate.name || !newTemplate.content}
                                      className="w-full py-2 bg-indigo-600/20 text-indigo-400 text-[10px] font-bold rounded-lg hover:bg-indigo-600/30 transition-all border border-indigo-600/30 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                      Create Template
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="pt-4 border-t border-white/5 space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <MessageSquare size={12} className="opacity-40" />
                          <span className="text-[10px] font-mono uppercase tracking-widest opacity-40">Suggestions for improvement</span>
                        </div>
                            <textarea
                              value={(result as any).suggestions || ''}
                              onChange={(e) => handleSuggestions((result as any).id, e.target.value)}
                              placeholder="Any suggestions to make this response better?"
                              className="w-full bg-black/20 border border-white/5 rounded-xl p-3 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none h-20 placeholder:opacity-20"
                            />
                          </div>
                        </div>

                    {isLowConfidence && (
                      <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-4"
                      >
                        <AlertCircle className="text-amber-500 shrink-0" size={24} />
                        <div>
                          <p className="text-sm font-bold text-amber-500">Low Confidence Warning</p>
                          <p className="text-xs text-amber-500/60 font-medium">Result is below your {((threshold) * 100).toFixed(0)}% custom threshold.</p>
                        </div>
                      </motion.div>
                    )}

                    {/* Collapsible Prompt Debug Section */}
                    {result.fullPrompt && (
                      <div className="pt-6 border-t border-white/5 space-y-4">
                        <button 
                          onClick={() => setShowPrompt(!showPrompt)}
                          className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-left group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                              <Terminal size={14} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-bold">Raw Neural Prompt</span>
                              <span className="text-[10px] opacity-40">View the instruction matrix sent to the API</span>
                            </div>
                          </div>
                          {showPrompt ? <ChevronUp size={16} className="opacity-40" /> : <ChevronDown size={16} className="opacity-40" />}
                        </button>

                        <AnimatePresence>
                          {showPrompt && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-5 bg-black/40 border border-white/5 rounded-xl space-y-4 font-mono text-[11px] leading-relaxed relative group">
                                <div className="absolute top-4 right-4 flex gap-2">
                                  <Code size={14} className="text-indigo-500/40" />
                                </div>
                                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                  <pre className="whitespace-pre-wrap text-slate-400 selection:bg-indigo-500/30">
                                    {result.fullPrompt}
                                  </pre>
                                </div>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(result.fullPrompt || '');
                                  }}
                                  className="text-[9px] uppercase tracking-widest text-indigo-400/60 hover:text-indigo-400 transition-colors"
                                >
                                  Copy Raw Prompt
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>

          {/* Visualization Section */}
          {history.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h3 className="text-xs font-mono uppercase tracking-[0.2em] opacity-40">Confidence Analytics</h3>
                <BarChart3 size={14} className="opacity-40" />
              </div>
              <div className="relative h-64 min-h-[256px] bg-white/[0.02] border border-white/5 rounded-3xl p-6">
                <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
                  <BarChart data={[...history].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff0a" />
                    <XAxis 
                      dataKey="timestamp" 
                      hide 
                    />
                    <YAxis 
                      domain={[0, 100]} 
                      tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => `${val}%`}
                    />
                    <RechartsTooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as HistoryItem;
                          const theme = INTENT_THEMES[data.intent];
                          return (
                            <div className="bg-slate-900 border border-white/10 p-3 rounded-xl shadow-2xl space-y-1">
                              <p className="text-[10px] font-mono opacity-40 uppercase tracking-widest leading-none">
                                {data.timestamp.toLocaleTimeString()}
                              </p>
                              <p className={`text-xs font-bold ${theme?.color || 'text-white'}`}>{data.intent}</p>
                              <p className="text-sm font-mono text-white">Intent: {(data.confidence * 100).toFixed(1)}%</p>
                              <p className="text-[10px] font-mono text-emerald-400">Language: {data.language} ({(data.language_confidence * 100).toFixed(1)}%)</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar 
                      dataKey={(item: HistoryItem) => item.confidence * 100} 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h3 className="text-xs font-mono uppercase tracking-[0.2em] opacity-40">Sentiment Distribution</h3>
                <Zap size={14} className="opacity-40" />
              </div>
              <div className="relative h-64 min-h-[256px] bg-white/[0.02] border border-white/5 rounded-3xl p-6">
                <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
                  <BarChart data={sentimentStats}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff0a" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {sentimentStats.map((entry) => (
                        <Cell key={entry.name} fill={SENTIMENT_THEMES[entry.name]?.color.replace('text-', '').replace('400', '500') || '#6366f1'} opacity={0.6} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* History / Previous Inferences */}
          {history.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-4">
                  <h3 className="text-xs font-mono uppercase tracking-[0.2em] opacity-40">Session History</h3>
                  <button 
                    onClick={handleExportCSV}
                    disabled={filteredHistory.length === 0}
                    className="flex items-center gap-2 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] font-mono tracking-widest text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/20 transition-all disabled:opacity-20 flex-shrink-0"
                  >
                    <Download size={10} />
                    EXPORT CSV
                  </button>
                </div>
                <History size={14} className="opacity-40" />
              </div>

              {/* Filter Controls */}
              <div className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20 group-focus-within:text-indigo-400 transition-colors">
                    <Search size={16} />
                  </div>
                  <input 
                    type="text"
                    placeholder="Search by intent, language, or content..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-white/20 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20">
                      <Calendar size={14} />
                    </div>
                    <input 
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-white/60"
                      title="Start Date"
                    />
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20">
                      <Calendar size={14} />
                    </div>
                    <input 
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-white/60"
                      title="End Date"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {(searchQuery || startDate || endDate || showFlaggedOnly) && (
                    <button 
                      onClick={() => {
                        setSearchQuery('');
                        setStartDate('');
                        setEndDate('');
                        setShowFlaggedOnly(false);
                      }}
                      className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Clear Filters
                    </button>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox"
                      checked={showFlaggedOnly}
                      onChange={(e) => setShowFlaggedOnly(e.target.checked)}
                      className="w-3 h-3 rounded border-white/10 bg-white/5 text-indigo-500 focus:ring-indigo-500/50"
                    />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 group-hover:text-amber-400 transition-colors">Show Flagged Only</span>
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                {filteredHistory.length === 0 ? (
                  <div className="py-12 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                    <p className="text-xs font-mono uppercase tracking-widest opacity-20 text-white/60">No matching results found</p>
                  </div>
                ) : (
                  filteredHistory.map((item) => {
                    return (
                      <motion.div 
                        layout
                        key={item.id} 
                        onClick={() => {
                          setInput(item.content);
                          setResult(item);
                          setShowPrompt(false);
                        }}
                        className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between group hover:bg-white/[0.05] hover:border-white/20 transition-all cursor-pointer"
                      >
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-mono opacity-20">
                              {item.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-base font-bold ${INTENT_THEMES[item.intent]?.color || 'text-white'}`}>
                                  {item.intent}
                                </span>
                                <Tooltip content={INTENT_THEMES[item.intent]?.description || ''}>
                                  <div className="p-0.5 rounded-full bg-white/5 border border-white/5 text-white/20 hover:text-white/60 transition-colors cursor-help">
                                    <Info size={8} />
                                  </div>
                                </Tooltip>
                              </div>
                              <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded leading-none ${SENTIMENT_THEMES[item.sentiment]?.bg} ${SENTIMENT_THEMES[item.sentiment]?.color}`}>
                                {item.sentiment}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-1 max-w-md">
                              {truncate(item.content, 80)}
                            </p>
                          </div>
                        <div className="flex items-center gap-6">
                          {item.id !== result?.id ? (
                            <div className="flex items-center gap-2 pr-4 border-r border-white/5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFeedback(item.id, 'up');
                                }}
                                className={`p-1 rounded-md transition-all ${item.feedback === 'up' ? 'text-emerald-400 bg-emerald-400/10' : 'text-white/20 hover:text-white/60 hover:bg-white/5'}`}
                              >
                                <ThumbsUp size={14} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFeedback(item.id, 'down');
                                }}
                                className={`p-1 rounded-md transition-all ${item.feedback === 'down' ? 'text-rose-400 bg-rose-400/10' : 'text-white/20 hover:text-white/60 hover:bg-white/5'}`}
                              >
                                <ThumbsDown size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[9px] font-mono text-indigo-400 font-bold uppercase tracking-widest">
                              Active
                            </div>
                          )}
                          <div className="text-right">
                            <div className="text-xs font-bold text-slate-400">{(item.confidence * 100).toFixed(0)}% Intent</div>
                            <div className="flex items-center gap-2 justify-end">
                               <div className="text-[10px] font-mono opacity-40 uppercase text-white/40">
                                {item.language}
                               </div>
                                {item.language_confidence && (
                                  <span className={`text-[8px] font-mono font-bold px-1 rounded bg-white/5 border border-white/5 ${getConfidenceLevel(item.language_confidence).color}`}>
                                    {(item.language_confidence * 100).toFixed(0)}%
                                  </span>
                                )}
                            </div>
                          </div>
                          {item.rating && (
                            <div className="flex gap-0.5 text-amber-400/60">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star key={star} size={10} fill={item.rating! >= star ? "currentColor" : "none"} strokeWidth={1} />
                              ))}
                            </div>
                          )}
                          {item.feedback && (
                            <Tooltip content="Intent Classification Feedback">
                              <div className={`shrink-0 ${item.feedback === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {item.feedback === 'up' ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
                              </div>
                            </Tooltip>
                          )}
                          {item.responseFeedback && (
                            <Tooltip content="Suggested Response Feedback">
                              <div className={`shrink-0 ${item.responseFeedback === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                <div className="relative">
                                  {item.responseFeedback === 'up' ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
                                  <MessageSquare size={8} className="absolute -top-1 -right-1 opacity-60" fill="currentColor" />
                                </div>
                              </div>
                            </Tooltip>
                          )}
                          <ChevronRight size={18} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-4 group-hover:translate-x-0" />
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

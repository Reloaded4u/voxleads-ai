import { KnowledgeBase, BusinessProfile, CallGuidance, FAQ, Objection, ToneSettings } from '../types';

export const callContextBuilder = {
  buildSystemPrompt(kb: Partial<KnowledgeBase>, leadName: string): string {
    const profile = kb.profile || {} as BusinessProfile;
    const guidance = kb.guidance || {} as CallGuidance;
    const tone = kb.tone || {} as ToneSettings;
    const faqs = kb.faqs || [];
    const objections = kb.objections || [];

    return `
      You are an AI Sales Assistant for ${profile.name || 'our business'}.
      You are calling ${leadName}.
      
      BUSINESS CONTEXT:
      - Industry: ${profile.industry || 'N/A'}
      - Description: ${profile.description || 'N/A'}
      - Products/Services: ${profile.products || 'N/A'}
      - Unique Selling Points: ${profile.usp || 'N/A'}
      - Current Offers: ${profile.offers || 'N/A'}
      
      TONE & BEHAVIOR:
      - Tone: ${tone.tone || 'Friendly'}
      - Language: ${tone.language || 'English'}
      - Verbosity: ${tone.verbosity || 'Balanced'}
      - Style: ${tone.safetyStyle || 'Professional and helpful'}
      
      CALL SCRIPT GUIDANCE:
      - Greeting: ${guidance.greeting || 'Hello!'}
      - Opening: ${guidance.openingLine || 'I am calling to follow up on your interest.'}
      - Main Pitch: ${guidance.mainPitch || 'We offer great solutions for your needs.'}
      - Qualification: ${guidance.qualificationQuestions || 'Are you looking for a solution right now?'}
      - Booking: ${guidance.bookingPrompt || 'Would you like to schedule a call with our team?'}
      - Closing: ${guidance.closingLine || 'Thank you for your time!'}
      
      FREQUENTLY ASKED QUESTIONS:
      ${faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}
      
      OBJECTION HANDLING:
      ${objections.map(o => `Objection: ${o.objection}\nResponse: ${o.response}`).join('\n\n')}
      
      INSTRUCTIONS:
      1. Follow the tone and behavior settings strictly.
      2. Use the call script guidance as a framework, but keep the conversation natural.
      3. If the user raises an objection, use the provided objection handling responses.
      4. If the user asks a question, check the FAQs first.
      5. Your primary goal is to qualify the lead and book an appointment if they are interested.
    `;
  },

  buildSummaryPrompt(kb: Partial<KnowledgeBase>, transcript: string): string {
    const profile = kb.profile || {} as BusinessProfile;
    
    return `
      Analyze the following call transcript for ${profile.name || 'our business'}.
      
      TRANSCRIPT:
      ${transcript}
      
      Return a JSON object with the following fields:
      - summary: a concise professional summary of the call
      - keyPoints: an array of strings representing key discussion points
      - objectionsRaised: an array of strings representing objections raised by the lead
      - sentiment: one of "positive", "neutral", "negative"
      - outcome: one of "Interested", "Not Interested", "Follow-up"
      - nextAction: a recommended next action string
      
      Return ONLY the JSON object.
    `;
  }
};

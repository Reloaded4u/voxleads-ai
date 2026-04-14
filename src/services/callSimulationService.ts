import { geminiService } from './geminiService';
import { callContextBuilder } from './callContextBuilder';
import { KnowledgeBase, Lead, BusinessProfile } from '../types';

export const callSimulationService = {
  async generateAIReponse(
    history: { role: 'ai' | 'lead', text: string }[], 
    kb: Partial<KnowledgeBase>, 
    lead: Lead
  ) {
    const systemPrompt = callContextBuilder.buildSystemPrompt(kb, lead.name);
    const geminiHistory = history.map(h => ({
      role: h.role === 'ai' ? 'model' : 'user',
      content: h.text
    }));

    return await geminiService.getNextResponse(geminiHistory, lead, systemPrompt);
  },

  async generateLeadResponse(
    history: { role: 'ai' | 'lead', text: string }[], 
    kb: Partial<KnowledgeBase>, 
    lead: Lead
  ) {
    const profile = (kb.profile || {}) as BusinessProfile;
    const prompt = `
      You are simulating a lead named ${lead.name} who is being called by an AI sales agent from ${profile.name || 'a business'}.
      
      BUSINESS CONTEXT:
      ${profile.description || 'A business offering products/services.'}
      
      YOUR PROFILE:
      - Name: ${lead.name}
      - Notes: ${lead.notes || 'Interested in learning more.'}
      
      CONVERSATION HISTORY:
      ${history.map(h => `${h.role === 'ai' ? 'Agent' : 'You'}: ${h.text}`).join('\n')}
      
      INSTRUCTIONS:
      1. Respond naturally as a human lead.
      2. You can be interested, skeptical, or busy depending on the flow.
      3. Occasionally raise an objection (e.g., price, timing) to test the agent.
      4. If the agent is convincing and follows their script well, you can agree to a meeting.
      5. Keep your response short and conversational.
    `;

    return await geminiService.generateCallSummary('', prompt); // Reusing summary method for general generation
  }
};

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const geminiService = {
  async generateCallSummary(transcript: string, customPrompt?: string) {
    try {
      const defaultPrompt = `Summarize the following sales call transcript. Extract key points, lead sentiment, and any action items. 
        
        Transcript:
        ${transcript}`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: customPrompt || defaultPrompt }] }],
        config: {
          systemInstruction: "You are an expert sales assistant. Be concise and professional. If JSON is requested, return ONLY valid JSON.",
          responseMimeType: customPrompt?.includes('JSON') ? "application/json" : undefined
        }
      });

      if (customPrompt?.includes('JSON')) {
        try {
          return JSON.parse(response.text);
        } catch (e) {
          console.error("Failed to parse AI JSON response:", e);
          return null;
        }
      }

      return response.text;
    } catch (error) {
      console.error("Error generating summary:", error);
      return customPrompt?.includes('JSON') ? null : "Summary unavailable.";
    }
  },

  async getNextResponse(history: { role: string, content: string }[], leadInfo: any, systemPrompt?: string) {
    try {
      const defaultSystemInstruction = `You are an AI sales agent calling a lead. 
          Lead Name: ${leadInfo.name}
          Context: ${leadInfo.notes}
          Goal: Schedule a site visit or meeting.
          Be natural, human-like, and handle objections gracefully. 
          If the lead is interested, ask for a preferred date and time for a meeting.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
        config: {
          systemInstruction: systemPrompt || defaultSystemInstruction,
        }
      });
      return response.text;
    } catch (error) {
      console.error("Error getting next response:", error);
      return "I'm sorry, I'm having a bit of trouble connecting. Could you repeat that?";
    }
  }
};

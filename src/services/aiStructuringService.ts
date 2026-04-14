import { GoogleGenAI, Type } from "@google/genai";
import { KnowledgeBase } from "../types";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export const aiStructuringService = {
  async structureWebsiteContent(rawContent: string): Promise<Partial<KnowledgeBase>> {
    const prompt = `
      You are an expert AI Sales Assistant builder. 
      I will provide you with raw text extracted from a business website.
      Your task is to transform this raw text into a structured Knowledge Base for an AI Voice Sales Agent.
      
      RAW CONTENT:
      ${rawContent}
      
      Please extract and suggest the following:
      1. Business Profile (Name, Industry, Description, Locations, Products, USP, Offers, Contact Info)
      2. Call Guidance (Greeting, Opening Line, Main Pitch, Qualification Questions, Booking Prompt, Closing Line, Follow-up)
      3. FAQs (Top 5 common questions and answers)
      4. Objection Handling (Top 3 common objections and how to handle them)
      5. Tone & Behavior (Recommended tone, language, and verbosity)
      
      Return the data in a clean JSON format matching the KnowledgeBase interface.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            profile: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                industry: { type: Type.STRING },
                description: { type: Type.STRING },
                locations: { type: Type.STRING },
                products: { type: Type.STRING },
                usp: { type: Type.STRING },
                offers: { type: Type.STRING },
                contactInfo: { type: Type.STRING },
              }
            },
            guidance: {
              type: Type.OBJECT,
              properties: {
                greeting: { type: Type.STRING },
                openingLine: { type: Type.STRING },
                mainPitch: { type: Type.STRING },
                qualificationQuestions: { type: Type.STRING },
                bookingPrompt: { type: Type.STRING },
                closingLine: { type: Type.STRING },
                followUpInstructions: { type: Type.STRING },
              }
            },
            faqs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING },
                }
              }
            },
            objections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  objection: { type: Type.STRING },
                  response: { type: Type.STRING },
                }
              }
            },
            tone: {
              type: Type.OBJECT,
              properties: {
                tone: { type: Type.STRING, enum: ['Formal', 'Friendly', 'Consultative', 'Sales-focused'] },
                language: { type: Type.STRING },
                verbosity: { type: Type.STRING, enum: ['Concise', 'Detailed', 'Balanced'] },
                safetyStyle: { type: Type.STRING },
                escalationRules: { type: Type.STRING },
              }
            }
          }
        }
      }
    });

    try {
      return JSON.parse(response.text);
    } catch (error) {
      console.error("Failed to parse AI response:", error);
      throw new Error("AI failed to structure the content correctly.");
    }
  }
};

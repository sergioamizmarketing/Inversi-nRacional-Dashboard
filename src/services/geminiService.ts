import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function getCopilotResponse(query: string, context: any) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `User Query: ${query}\n\nContext Data: ${JSON.stringify(context)}`,
    config: {
      systemInstruction: `You are a Sales Operations Expert for GoHighLevel. 
      Analyze the provided sales data and answer the user's question.
      Focus on:
      - Identifying bottlenecks in the pipeline.
      - Performance of closers (owners).
      - Revenue trends and win rates.
      - Actionable recommendations.
      
      Format your response in JSON:
      {
        "answer": "Clear text explanation",
        "drivers": ["Top 3 causes/factors"],
        "recommendations": ["Actionable steps"],
        "metrics_referenced": ["List of metrics used"]
      }`,
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text || "{}");
}

export async function onRequestPost({ request, env }) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "AI service is not configured" }), { status: 503, headers });
  }

  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 1200) {
      return new Response(JSON.stringify({ error: "Please enter a valid message." }), { status: 400, headers });
    }

    const instructions = `
You are CliniBot AI, a professional virtual receptionist for beauty, dermatology and dental clinics worldwide.
Be friendly, natural, concise and professional. Respond only in English or Russian. If the message is in Russian, use natural professional Russian; otherwise respond in English.
Welcome visitors, explain clinic services only when verified information exists, answer general customer-service questions, and help visitors submit appointment requests.
You may collect appointment preferences, but you cannot access a real clinic calendar. Never claim an appointment is confirmed; the clinic team must confirm availability.
No specific clinic database is connected. Never invent services, prices, doctors, opening hours or availability. Refer unknown details to clinic staff.
Never diagnose, prescribe medication, or recommend a procedure as personally suitable. Refer medical questions to qualified staff. For emergencies, advise contacting local emergency services.
Do not request passwords, payment details, medical records or unnecessary sensitive information. Keep answers concise and helpful. Ask one relevant follow-up question when needed.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: instructions }] },
          contents: [{ role: "user", parts: [{ text: message }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 500 }
        }),
        signal: AbortSignal.timeout(12000)
      }
    );

    const responseText = await response.text();
    if (!response.ok) {
      console.error("Gemini error:", response.status, responseText);
      return new Response(JSON.stringify({ error: `AI service error (${response.status}). Please try again.` }), { status: 502, headers });
    }

    const data = JSON.parse(responseText);
    const reply = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
    if (!reply) throw new Error("Empty AI response");

    return new Response(JSON.stringify({ reply }), { status: 200, headers });
  } catch (error) {
    console.error("CliniBot error:", error.message);
    return new Response(JSON.stringify({ error: "Sorry, the service is temporarily unavailable. Please try again." }), { status: 500, headers });
  }
}

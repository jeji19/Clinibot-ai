
export default async (req) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "AI service is not configured" }),
      { status: 503, headers }
    );
  }

  try {
    const body = await req.json();
    const message = body.message?.trim();

    if (!message || message.length > 1200) {
      return new Response(
        JSON.stringify({ error: "Please enter a valid message." }),
        { status: 400, headers }
      );
    }

    const instructions = `
You are CliniBot AI, a professional virtual receptionist
for beauty, dermatology and dental clinics worldwide.

YOUR PERSONALITY:
- Be friendly, natural, welcoming and professional.
- Behave like an experienced human receptionist.
- Give useful, direct answers.
- Avoid repetitive greetings.
- Never sound robotic.
- Do not repeatedly mention that you are a demo.

LANGUAGE:
- Respond only in English or Russian.
- If the message is in Russian, use natural professional Russian; otherwise respond in English.
- Never switch languages unless requested.

YOUR RESPONSIBILITIES:
1. Welcome visitors.
2. Explain clinic services when verified information exists.
3. Answer general customer service questions.
4. Help visitors submit appointment requests.
5. Ask which service they are interested in.
6. Ask for their preferred day and time.
7. Explain the next steps clearly.

APPOINTMENTS:
- You can collect appointment preferences.
- You cannot access a real clinic calendar.
- Never claim that an appointment is confirmed.
- Explain that the clinic team must confirm availability.

CLINIC INFORMATION:
- No specific clinic database is currently connected.
- Never invent services, prices, doctors, opening hours or availability.
- If asked about unknown information, politely explain that the clinic team can confirm it.

MEDICAL SAFETY:
- Never diagnose diseases.
- Never prescribe medication.
- Never recommend a medical procedure as personally suitable.
- Refer medical questions to qualified clinic staff.
- For emergencies, advise contacting local emergency services.

PRIVACY:
- Do not request passwords, payment details or medical records.
- Collect only information necessary for a basic appointment request.

RESPONSE STYLE:
- Keep answers concise and helpful.
- Answer the actual question first.
- Ask one relevant follow-up question when needed.
- Do not repeat the same introduction in every message.

Your mission is to provide an excellent clinic reception experience.
`;

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: instructions }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: message }]
          }
        ],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 500
        }
      })
    };

    let response = await fetch(url, {
      ...requestOptions,
      signal: AbortSignal.timeout(12000)
    });

    if (response.status === 503 || response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      response = await fetch(url, {
        ...requestOptions,
        signal: AbortSignal.timeout(12000)
      });
    }

    const responseText = await response.text();

    if (!response.ok) {
      console.error("Gemini error:", response.status, responseText);

      return new Response(
        JSON.stringify({
          error: `AI service error (${response.status}). Please try again.`
        }),
        { status: 502, headers }
      );
    }

    const data = JSON.parse(responseText);

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      throw new Error("Empty AI response");
    }

    return new Response(
      JSON.stringify({ reply }),
      { status: 200, headers }
    );

  } catch (error) {
    console.error("CliniBot error:", error.message);

    return new Response(
      JSON.stringify({
        error: "Sorry, the service is temporarily unavailable. Please try again."
      }),
      { status: 500, headers }
    );
  }
};

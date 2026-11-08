
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
    console.error("GEMINI_API_KEY is missing");

    return new Response(
      JSON.stringify({ error: "API key is missing" }),
      { status: 503, headers }
    );
  }

  try {
    const body = await req.json();
    const message = body.message?.trim();

    if (!message || message.length > 1200) {
      return new Response(
        JSON.stringify({ error: "Invalid message" }),
        { status: 400, headers }
      );
    }

    const instructions = `
You are CliniBot AI, a multilingual clinic receptionist demo.
Reply in the same language as the visitor.
Be friendly, professional and concise.
Never invent clinic prices, services, opening hours or appointments.
Never diagnose, prescribe medication or recommend treatment.
Refer medical questions to qualified clinic staff.
For emergencies, advise contacting local emergency services.
Do not ask for patient names, phone numbers or medical records.
This is a demo, not a real clinic. No appointments are actually booked.
`;

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";

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
        contents: [{
          role: "user",
          parts: [{ text: message }]
        }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 450
        }
      })
    };

    // First attempt
    let response = await fetch(url, {
      ...requestOptions,
      signal: AbortSignal.timeout(10000)
    });

    // Retry once if Google is overloaded
    if (response.status === 503 || response.status === 429) {
      console.log("Gemini busy. Retrying once...");

      await new Promise(resolve =>
        setTimeout(resolve, 1000)
      );

      response = await fetch(url, {
        ...requestOptions,
        signal: AbortSignal.timeout(10000)
      });
    }

    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        "Gemini error:",
        response.status,
        responseText
      );

      return new Response(
        JSON.stringify({
          error: `Gemini HTTP ${response.status}: ${responseText.slice(0, 700)}`
        }),
        { status: 502, headers }
      );
    }

    const data = JSON.parse(responseText);

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(p => p.text || "")
      .join("");

    if (!reply) {
      console.error("Empty AI response:", responseText);
      throw new Error("Empty AI response");
    }

    return new Response(
      JSON.stringify({ reply }),
      { status: 200, headers }
    );

  } catch (error) {
    console.error("Chat function error:", error.message);

    return new Response(
      JSON.stringify({
        error: "Something went wrong: " + error.message
      }),
      { status: 500, headers }
    );
  }
};
;

// src/aiApi.js
const AI_URL = import.meta.env.VITE_AI_URL;
const AI_KEY = import.meta.env.VITE_AI_KEY;

/**
 * Gửi kết quả 1 poll (câu hỏi + số lượt chọn mỗi option) cho AI,
 * nhận về 1-2 câu tóm tắt xu hướng trả lời của khán giả.
 */
export async function summarizePollResults(question, counts, total) {
  const optionsText = Object.entries(counts)
    .map(([option, count]) => `${option}: ${count} votes`)
    .join(", ");

  const response = await fetch(`${AI_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You summarise audience poll results in 1-2 short, friendly sentences for a presenter to read aloud.",
        },
        {
          role: "user",
          content: `Question: "${question}"\nTotal responses: ${total}\nResults: ${optionsText}`,
        },
      ],
      max_tokens: 100,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      errorData?.error?.message || `AI request failed (${response.status})`,
    );
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

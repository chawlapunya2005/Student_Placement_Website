import OpenAI from "openai";

function getNvidiaClient() {
  if (!process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY.startsWith("your-")) {
    throw new Error("NVIDIA_API_KEY is not configured");
  }

  return new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1",
    timeout: Number(process.env.NVIDIA_TIMEOUT_MS || 30000),
    maxRetries: 0,
  });
}

export async function askNvidia(prompt, image) {
  const content = [{ type: "text", text: prompt }];
  if (image) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${image.mimetype};base64,${image.buffer.toString("base64")}`,
      },
    });
  }

  const response = await getNvidiaClient().chat.completions.create({
    model: process.env.NVIDIA_MODEL || "moonshotai/kimi-k3",
    messages: [{ role: "user", content }],
    temperature: Number(process.env.NVIDIA_TEMPERATURE || 1),
    max_tokens: Number(process.env.NVIDIA_MAX_TOKENS || 16384),
  });

  const message = response.choices[0]?.message || {};
  const responseText = message.content
    || message.reasoning_content
    || message.additional_kwargs?.reasoning_content
    || "";

  if (!responseText.trim()) {
    throw new Error("NVIDIA returned an empty response. Check NVIDIA_MODEL and try again.");
  }

  return responseText.trim();
}

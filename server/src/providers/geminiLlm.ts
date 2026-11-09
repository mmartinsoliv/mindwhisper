import { buildCleanupPrompt } from './cleanupPrompt';
import { generateText, type GeminiOpts } from './geminiClient';
import { ProviderError, type CleanupRequest, type LlmProvider } from './types';

// Cleanup output is about as long as its input; allow generous headroom (pt-BR tokenises worse than English, and
// thinking models spend part of the budget on reasoning) up to a hard cap.
const maxTokensFor = (textLength: number) => Math.min(Math.ceil(textLength / 2) + 2048, 32000);

export class GeminiLlmProvider implements LlmProvider {
  readonly name = 'gemini';
  constructor(private readonly o: GeminiOpts) {}

  async cleanup(req: CleanupRequest): Promise<string> {
    const { system, user } = buildCleanupPrompt(req);
    const text = await generateText(this.o, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0, maxOutputTokens: maxTokensFor(req.text.length) },
    }, req.signal, 'cleanup');
    // Guard against invented content: cleanup must not balloon the text.
    if (text === '' || text.length > req.text.length * 2 + 50) throw new ProviderError('cleanup output rejected', 'provider_error');
    return text;
  }
}
